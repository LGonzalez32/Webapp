import { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { useAnalysis } from '../lib/useAnalysis'
import { sendChatMessage, sendChatMessageStream, sendDeepAnalysis, parseFollowUps, parseChartBlocks } from '../lib/chatService'
import type { ChartData } from '../lib/chatService'
import type { ChatMessage as BaseChatMessage, ChatMessage } from '../types'
import type { ChatContext } from '../lib/chatService'
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { Send, Loader2, Zap, ArrowRight, ExternalLink, BrainCircuit, RotateCcw, TrendingDown, Target, Users, BarChart3, AlertCircle } from 'lucide-react'
import { cn } from '../lib/utils'
import { format } from 'date-fns'
import { toast } from 'sonner'

const ERROR_MESSAGES: Record<string, { text: string; canRetry: boolean }> = {
  CONFIG_MISSING: { text: 'API key no configurada. Ve a Configuración → Asistente IA.', canRetry: false },
  INVALID_KEY: { text: 'API key no configurada o inválida. Ve a Configuración → Asistente IA.', canRetry: false },
  RATE_LIMIT: { text: 'Demasiadas consultas seguidas. Espera unos segundos e intenta de nuevo.', canRetry: true },
  API_ERROR: { text: 'No pude conectar con el asistente. Verifica tu conexión e intenta de nuevo.', canRetry: true },
  NETWORK: { text: 'Sin conexión a internet. Verifica tu red e intenta de nuevo.', canRetry: true },
}

// ─── Helpers de parseado ───────────────────────────────────────────────────────

type Segment =
  | { type: 'text'; content: string }
  | { type: 'numbered'; index: number; content: string }

function parseContent(content: string): Segment[] {
  const segments: Segment[] = []
  const lines = content.split('\n')
  let currentLines: string[] = []
  let currentIsNumbered = false
  let currentIndex = 0

  const flush = () => {
    if (currentLines.length === 0) return
    const text = currentLines.join('\n')
    if (currentIsNumbered) {
      segments.push({ type: 'numbered', index: currentIndex, content: text })
    } else if (text.trim()) {
      segments.push({ type: 'text', content: text })
    }
    currentLines = []
    currentIsNumbered = false
    currentIndex = 0
  }

  for (const line of lines) {
    const match = line.match(/^(\d+)\.\s+/)
    if (match) {
      flush()
      currentIsNumbered = true
      currentIndex = parseInt(match[1])
      currentLines.push(line)
    } else {
      currentLines.push(line)
    }
  }
  flush()
  return segments
}

function renderMarkdown(text: string): string {
  let html = text

  // 1. HTML escape
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // 2. Proteger bloques de código con placeholders para que los pasos siguientes no los toquen
  const codeBlocks: string[] = []
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, _lang, code: string) => {
    const ph = `\x00CODE${codeBlocks.length}\x00`
    codeBlocks.push(
      `<pre style="background:var(--sf-inset);border:1px solid var(--sf-border);border-radius:6px;` +
      `padding:0.75rem;overflow-x:auto;font-family:ui-monospace,monospace;font-size:0.8125rem;` +
      `margin:0.5rem 0;color:var(--sf-t2)"><code>${code.trim()}</code></pre>`
    )
    return ph
  })

  // 3. Proteger código inline
  const inlineCodes: string[] = []
  html = html.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    const ph = `\x00INLINE${inlineCodes.length}\x00`
    inlineCodes.push(
      `<code style="background:var(--sf-inset);border:1px solid var(--sf-border);border-radius:3px;` +
      `padding:0.125rem 0.375rem;font-family:ui-monospace,monospace;font-size:0.85em;color:var(--sf-t2)">${code}</code>`
    )
    return ph
  })

  // Helper: aplica bold + italic a un fragmento de texto (para usar dentro de lists y headers)
  const applyInline = (t: string): string => t
    .replace(/\*\*([^*\n]+?)\*\*/g, '<strong style="font-weight:600;color:var(--sf-t1)">$1</strong>')
    .replace(/__([^_\n]+?)__/g,     '<strong style="font-weight:600;color:var(--sf-t1)">$1</strong>')
    .replace(/\*([^*\n]+?)\*/g,     '<em style="font-style:italic;color:var(--sf-t2)">$1</em>')
    .replace(/_([^_\n]+?)_/g,       '<em style="font-style:italic;color:var(--sf-t2)">$1</em>')

  // 4. Tablas markdown (antes de headers/listas para proteger el `|`)
  html = html.replace(
    /(\|.+\|\n)+/g,
    (table) => {
      const rows = table.trim().split('\n')
      let tableHtml = '<div class="sf-table-wrap" style="overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0.5rem 0;border-radius:8px;border:1px solid var(--sf-border-subtle)">' +
        '<table style="width:100%;border-collapse:collapse;font-size:0.75rem">'
      let inHeader = true
      let rowIndex = 0
      for (const row of rows) {
        if (row.match(/^[\|\s\-:]+$/)) { inHeader = false; continue }
        const cells = row.split('|').filter(c => c.trim())
        if (inHeader) {
          const thStyle = 'padding:6px 10px;text-align:left;border-bottom:2px solid var(--sf-border);font-weight:600;white-space:nowrap;color:var(--sf-t3);font-size:10px;text-transform:uppercase;letter-spacing:0.05em;background:var(--sf-inset)'
          tableHtml += '<tr>' + cells.map(c => `<th style="${thStyle}">${applyInline(c.trim())}</th>`).join('') + '</tr>'
        } else {
          const bg = rowIndex % 2 === 1 ? 'background:var(--sf-inset);' : ''
          const tdStyle = `padding:5px 10px;border-bottom:1px solid var(--sf-border-subtle);color:var(--sf-t2);white-space:nowrap;${bg}`
          tableHtml += `<tr class="sf-table-row">` + cells.map(c => `<td style="${tdStyle}">${applyInline(c.trim())}</td>`).join('') + '</tr>'
          rowIndex++
        }
      }
      return tableHtml + '</table></div>'
    }
  )

  // 5. Headers — del más específico al más general (#### antes que ###)
  html = html.replace(/^#### (.+)$/gm, (_m, t) =>
    `<p style="font-size:0.8125rem;font-weight:700;color:var(--sf-t2);text-transform:uppercase;` +
    `letter-spacing:0.06em;margin:0.875rem 0 0.25rem">${applyInline(t)}</p>`)
  html = html.replace(/^### (.+)$/gm, (_m, t) =>
    `<p style="font-size:0.875rem;font-weight:600;color:var(--sf-t1);border-left:3px solid #00B894;` +
    `padding-left:0.5rem;margin:1rem 0 0.375rem">${applyInline(t)}</p>`)
  html = html.replace(/^## (.+)$/gm, (_m, t) =>
    `<p style="font-size:0.9375rem;font-weight:600;color:var(--sf-t1);border-left:3px solid #00B894;` +
    `padding-left:0.5rem;margin:1rem 0 0.375rem">${applyInline(t)}</p>`)
  html = html.replace(/^# (.+)$/gm, (_m, t) =>
    `<p style="font-size:1rem;font-weight:700;color:var(--sf-t1);border-left:3px solid #00B894;` +
    `padding-left:0.5rem;margin:1rem 0 0.5rem">${applyInline(t)}</p>`)

  // 6. Líneas horizontales ---
  html = html.replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid var(--sf-border);margin:0.75rem 0">')

  // 7. Listas ordenadas → tarjetas con número en círculo
  html = html.replace(
    /((?:^\d+\. [\s\S]*?(?=\n\d+\.|\n\n|$))\n?)+/gm,
    (block) => {
      const rawItems = block.trim().split(/(?=^\d+\. )/m).filter(Boolean)
      const cards = rawItems.map((item) => {
        const lines = item.trim().split('\n').filter(Boolean)
        const numMatch = lines[0].match(/^(\d+)\. /)
        const num = numMatch ? numMatch[1] : '1'
        const titleLine = applyInline(lines[0].replace(/^\d+\. /, '').trim())
        const restLines = lines.slice(1)
          .map(l => `<p style="font-size:0.8125rem;color:var(--sf-t3);margin:0;line-height:1.5">${applyInline(l.trim())}</p>`)
          .filter(Boolean)
        return (
          `<div style="display:flex;gap:0.625rem;padding:0.625rem 0.75rem;border-radius:8px;` +
          `border:1px solid var(--sf-border);background:var(--sf-inset);margin-bottom:0.375rem">` +
          `<span style="min-width:1.375rem;height:1.375rem;border-radius:50%;background:var(--sf-hover);` +
          `display:inline-flex;align-items:center;justify-content:center;font-size:0.6875rem;font-weight:700;` +
          `color:var(--sf-t4);flex-shrink:0;margin-top:0.125rem">${num}</span>` +
          `<div style="flex:1;min-width:0"><p style="font-size:0.875rem;font-weight:500;color:var(--sf-t1);` +
          `margin:0${restLines.length ? ' 0 0.25rem 0' : ''};line-height:1.4">${titleLine}</p>` +
          `${restLines.join('')}</div></div>`
        )
      }).join('')
      return `<div style="margin:0.5rem 0">${cards}</div>`
    }
  )

  // 8. Listas no ordenadas (- y * al inicio de línea, con indentación opcional) — ANTES de italic global
  html = html.replace(
    /((?:^\s*[-*•]\s+.+\n?)+)/gm,
    (block) => {
      const items = block.trim().split('\n')
        .map(l => l.replace(/^\s*[-*•]\s+/, '').trim())
        .filter(Boolean)
      return (
        '<ul style="margin:0.5rem 0;padding-left:0;list-style:none;display:flex;flex-direction:column;gap:0.375rem">' +
        items.map(item =>
          `<li style="position:relative;padding-left:1rem;font-size:0.8125rem;color:var(--sf-t2);line-height:1.7">` +
          `<span style="position:absolute;left:0;top:0;color:#00B894;font-size:0.75rem">•</span>${applyInline(item)}</li>`
        ).join('') +
        '</ul>'
      )
    }
  )

  // 9. Bold e italic globales (sobre texto no consumido por listas/headers)
  html = html.replace(/\*\*([^*\n]+?)\*\*/g, '<strong style="font-weight:600;color:var(--sf-t1)">$1</strong>')
  html = html.replace(/__([^_\n]+?)__/g,     '<strong style="font-weight:600;color:var(--sf-t1)">$1</strong>')
  html = html.replace(/\*([^*\n]+?)\*/g,     '<em style="font-style:italic;color:var(--sf-t2)">$1</em>')
  html = html.replace(/_([^_\n]+?)_/g,       '<em style="font-style:italic;color:var(--sf-t2)">$1</em>')

  // 10. Restaurar placeholders de código
  codeBlocks.forEach((block, i)  => { html = html.replace(`\x00CODE${i}\x00`,   block) })
  inlineCodes.forEach((code, i)  => { html = html.replace(`\x00INLINE${i}\x00`, code) })

  // 11. Saltos de párrafo y línea
  html = html.replace(/\n\n+/g, '</p><p style="margin:0.625rem 0">')
  html = html.replace(/\n/g, '<br>')

  if (!html.startsWith('<')) {
    html = `<p style="margin:0">${html}</p>`
  }

  return html
}

function getRouteFromText(
  itemText: string,
  vendorNames: string[]
): { ruta: string; label: string } | null {
  const lower = itemText.toLowerCase()
  const hasVendor = vendorNames.some((v) => lower.includes(v.toLowerCase())) || lower.includes('vendedor')
  if (hasVendor) return { ruta: '/vendedores', label: 'Ver vendedores' }
  if (lower.includes('cliente') || lower.includes('cartera') || lower.includes('dormido'))
    return { ruta: '/clientes', label: 'Ver clientes' }
  if (lower.includes('producto') || lower.includes('inventario') || lower.includes('rotaci'))
    return { ruta: '/rotacion', label: 'Ver rotación' }
  if (lower.includes('meta') || lower.includes('objetivo') || lower.includes('cierre'))
    return { ruta: '/rendimiento', label: 'Ver rendimiento' }
  return null
}

// ─── UserBubbleContent ────────────────────────────────────────────────────────

function UserBubbleContent({ msg }: { msg: ChatMessage }) {
  // Extract source: from msg.source field, or parse legacy "[Desde X]" from displayContent
  let source = msg.source
  let text = msg.displayContent || msg.content

  if (!source && text) {
    const legacyMatch = text.match(/^\[Desde\s+(.+?)\]\s*/)
    if (legacyMatch) {
      source = legacyMatch[1]
      text = text.replace(legacyMatch[0], '')
    }
  }

  return (
    <div className="whitespace-pre-wrap">
      {source && (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '10px',
          fontWeight: 600,
          color: 'rgba(255,255,255,0.7)',
          background: 'rgba(255,255,255,0.15)',
          borderRadius: '4px',
          padding: '1px 6px',
          marginRight: '6px',
          verticalAlign: 'middle',
          letterSpacing: '0.02em',
        }}>
          ↗ {source}
        </span>
      )}
      {text}
    </div>
  )
}

// ─── InlineChart ──────────────────────────────────────────────────────────────

const CHART_COLORS: Record<string, string> = {
  green: '#22c55e',
  red: '#ef4444',
  blue: '#3b82f6',
  neutral: '#6b7280',
}

const chartContainerStyle = {
  background: 'var(--sf-bg)',
  border: '1px solid var(--sf-border)',
  borderRadius: '12px',
  padding: '16px',
  overflow: 'hidden' as const,
  maxWidth: '100%',
}

const chartTitleStyle = {
  fontSize: '14px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--sf-t1)',
  marginBottom: '12px',
}

const tooltipStyle = {
  background: 'var(--sf-s1)',
  border: '1px solid var(--sf-border)',
  borderRadius: 8,
  fontSize: 12,
}

const InlineChart = memo(function InlineChart({ chart }: { chart: ChartData }) {
  const getFill = (entry: { value: number }) =>
    chart.color === 'mixed'
      ? entry.value >= 0 ? CHART_COLORS.green : CHART_COLORS.red
      : CHART_COLORS[chart.color ?? 'blue'] || CHART_COLORS.blue

  const tickStyle = { fontSize: 11, fill: 'var(--sf-t4)' }

  if (chart.type === 'bar' || chart.type === 'horizontal_bar') {
    const isHorizontal = chart.type === 'horizontal_bar'
    return (
      <div style={chartContainerStyle}>
        <p style={chartTitleStyle}>{chart.title}</p>
        <ResponsiveContainer width="100%" height={isHorizontal ? Math.max(180, chart.data.length * 32) : 200}>
          <BarChart data={chart.data} layout={isHorizontal ? 'vertical' : 'horizontal'} margin={{ top: 4, right: 8, bottom: 4, left: isHorizontal ? 4 : 0 }}>
            {isHorizontal ? (
              <>
                <YAxis dataKey="label" type="category" width={100} tick={tickStyle} axisLine={false} tickLine={false} />
                <XAxis type="number" tick={tickStyle} axisLine={false} tickLine={false} />
              </>
            ) : (
              <>
                <XAxis dataKey="label" tick={tickStyle} axisLine={false} tickLine={false} />
                <YAxis tick={tickStyle} axisLine={false} tickLine={false} />
              </>
            )}
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'var(--sf-t2)' }} />
            <Bar dataKey="value" radius={isHorizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}>
              {chart.data.map((entry, i) => (
                <Cell key={i} fill={getFill(entry)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }

  if (chart.type === 'line') {
    const color = chart.color === 'mixed' ? CHART_COLORS.blue : (CHART_COLORS[chart.color ?? 'blue'] || CHART_COLORS.blue)
    return (
      <div style={chartContainerStyle}>
        <p style={chartTitleStyle}>{chart.title}</p>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chart.data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <XAxis dataKey="label" tick={tickStyle} axisLine={false} tickLine={false} />
            <YAxis tick={tickStyle} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'var(--sf-t2)' }} />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 3, fill: color }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    )
  }

  if (chart.type === 'pie') {
    const PIE_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#6366f1']
    return (
      <div style={chartContainerStyle}>
        <p style={chartTitleStyle}>{chart.title}</p>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={chart.data}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              outerRadius={80}
              label={({ label, percent }: { label: string; percent: number }) => `${label} ${(percent * 100).toFixed(0)}%`}
              labelLine={false}
              fontSize={11}
            >
              {chart.data.map((_entry, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    )
  }

  if (chart.type === 'progress') {
    return (
      <div style={chartContainerStyle}>
        <p style={chartTitleStyle}>{chart.title}</p>
        <div className="flex flex-col gap-3">
          {chart.data.map((item, i) => {
            const target = item.target || 100
            const pct = Math.min((item.value / target) * 100, 100)
            const barColor = pct >= 90 ? '#10B981' : pct >= 70 ? '#F59E0B' : '#EF4444'
            const expectedVal = (item as any).expected as number | undefined
            const expectedPct = expectedVal ? Math.min((expectedVal / target) * 100, 100) : null
            return (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <span style={{ fontSize: '13px', color: 'var(--sf-t2)' }}>{item.label}</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--sf-t2)' }}>
                    {item.value.toLocaleString()} / {target.toLocaleString()} ({pct.toFixed(0)}%)
                  </span>
                </div>
                <div className="h-6 rounded-full overflow-hidden" style={{ background: 'var(--sf-inset)', position: 'relative' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, background: barColor }}
                  />
                  {expectedPct !== null && (
                    <div
                      style={{
                        position: 'absolute',
                        left: `${expectedPct}%`,
                        top: 0,
                        height: '100%',
                        borderLeft: '2px dashed var(--sf-t4)',
                        opacity: 0.7,
                      }}
                      title={`Esperado: ${expectedVal!.toLocaleString()}`}
                    />
                  )}
                </div>
                {expectedVal != null && (
                  <p style={{ fontSize: '10px', color: 'var(--sf-t4)', marginTop: '2px' }}>
                    Esperado proporcional: {expectedVal.toLocaleString()} uds
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (chart.type === 'semaforo') {
    const STATUS_COLORS: Record<string, string> = { green: '#10B981', yellow: '#F59E0B', red: '#EF4444' }
    return (
      <div style={chartContainerStyle}>
        <p style={chartTitleStyle}>{chart.title}</p>
        <div className="flex flex-col gap-2">
          {chart.data.map((item, i) => (
            <div key={i} className="flex items-center gap-3">
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ background: STATUS_COLORS[item.status ?? 'green'] || STATUS_COLORS.green }}
              />
              <span className="flex-1 truncate" style={{ fontSize: '13px', color: 'var(--sf-t1)' }}>{item.label}</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--sf-t2)', textAlign: 'right' }}>
                {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (chart.type === 'waterfall') {
    let runningTotal = 0
    const transformed = chart.data.map(item => {
      if (item.isTotal) {
        const row = { label: item.label, invisible: 0, visible: runningTotal, original: runningTotal, isTotal: true, isNeg: runningTotal < 0 }
        return row
      }
      const isNeg = item.value < 0
      const invisible = isNeg ? runningTotal + item.value : runningTotal
      const visible = Math.abs(item.value)
      runningTotal += item.value
      return { label: item.label, invisible, visible, original: item.value, isTotal: false, isNeg }
    })
    const chartHeight = Math.max(200, transformed.length * 40 + 60)
    return (
      <div style={chartContainerStyle}>
        <p style={chartTitleStyle}>{chart.title}</p>
        <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: 'var(--sf-t3)', marginBottom: '8px', paddingLeft: '4px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: '#10B981', display: 'inline-block' }} /> Ganancia
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: '#EF4444', display: 'inline-block' }} /> Pérdida
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: '#3B82F6', display: 'inline-block' }} /> Total
          </span>
        </div>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={transformed} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
            <YAxis dataKey="label" type="category" width={110} tick={{ fontSize: 11, fill: 'var(--sf-t4)' }} axisLine={false} tickLine={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--sf-t4)' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(_v: any, name: any, props: any) => {
                if (name === 'invisible') return [null, null]
                const val = props?.payload?.original ?? 0
                return [val >= 0 ? `+${val.toLocaleString()}` : val.toLocaleString(), 'Valor']
              }}
              labelStyle={{ color: 'var(--sf-t2)' }}
            />
            <ReferenceLine x={0} stroke="var(--sf-border)" />
            <Bar dataKey="invisible" stackId="stack" fill="transparent" radius={0} />
            <Bar dataKey="visible" stackId="stack" radius={[0, 4, 4, 0]}>
              {transformed.map((entry, i) => (
                <Cell key={i} fill={entry.isTotal ? '#3B82F6' : entry.isNeg ? '#EF4444' : '#10B981'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }

  if (chart.type === 'grouped_bar') {
    return (
      <div style={chartContainerStyle}>
        <p style={chartTitleStyle}>{chart.title}</p>
        <div className="flex items-center gap-4 mb-3" style={{ fontSize: '11px', color: 'var(--sf-t3)' }}>
          <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: '#3B82F6' }} />Actual</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: '#9CA3AF' }} />Anterior</span>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chart.data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }} barGap={2}>
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--sf-t4)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--sf-t4)' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'var(--sf-t2)' }} />
            <Bar dataKey="previous" fill="#9CA3AF" radius={[4, 4, 0, 0]} barSize={20} name="Anterior" />
            <Bar dataKey="value" fill="#3B82F6" radius={[4, 4, 0, 0]} barSize={20} name="Actual" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }

  if (chart.type === 'donut') {
    const DONUT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']
    const centerText = (chart as ChartData & { center?: string }).center
    const total = chart.data.reduce((s, d) => s + d.value, 0)
    return (
      <div style={chartContainerStyle}>
        <p style={chartTitleStyle}>{chart.title}</p>
        <div style={{ position: 'relative' }}>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={chart.data}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={85}
                paddingAngle={2}
              >
                {chart.data.map((_e, i) => (
                  <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number, name: string) => [`${value.toLocaleString()} (${total > 0 ? ((value / total) * 100).toFixed(0) : 0}%)`, name]}
              />
            </PieChart>
          </ResponsiveContainer>
          {centerText && (
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: centerText.length > 6 ? '18px' : '24px',
              fontWeight: 700, color: 'var(--sf-t1)',
              pointerEvents: 'none',
            }}>
              {centerText}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 justify-center">
          {chart.data.map((item, i) => (
            <span key={i} className="flex items-center gap-1.5" style={{ fontSize: '12px', color: 'var(--sf-t2)' }}>
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
              {item.label} <span style={{ fontWeight: 500 }}>{item.value.toLocaleString()}</span>
            </span>
          ))}
        </div>
      </div>
    )
  }

  if (chart.type === 'tabla') {
    const columns = chart.data[0]?.columns ?? []
    const STATUS_BG: Record<string, { color: string; bg: string }> = {
      green: { color: '#10B981', bg: 'rgba(16,185,129,0.08)' },
      yellow: { color: '#F59E0B', bg: 'rgba(245,158,11,0.08)' },
      red: { color: '#EF4444', bg: 'rgba(239,68,68,0.08)' },
    }
    return (
      <div style={chartContainerStyle}>
        <p style={chartTitleStyle}>{chart.title}</p>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', maxWidth: '100%' }}>
          <table style={{ minWidth: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--sf-t3)', fontWeight: 500, padding: '4px 10px', borderBottom: '1px solid var(--sf-border)', textAlign: 'left' }} />
                {columns.map((col, ci) => (
                  <th key={ci} style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--sf-t3)', fontWeight: 500, padding: '4px 10px', borderBottom: '1px solid var(--sf-border)', textAlign: 'right' }}>
                    {col.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chart.data.map((row, ri) => (
                <tr key={ri} style={{ background: ri % 2 === 1 ? 'var(--sf-inset)' : 'transparent' }}>
                  <td style={{ fontSize: '13px', fontWeight: 500, color: 'var(--sf-t1)', padding: '6px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>
                    {row.label}
                  </td>
                  {(row.columns ?? []).map((col, ci) => {
                    const st = col.status ? STATUS_BG[col.status] : null
                    return (
                      <td key={ci} style={{ padding: '6px 10px', textAlign: 'right' }}>
                        <span style={{
                          fontSize: '13px',
                          fontWeight: st ? 600 : 400,
                          color: st ? st.color : 'var(--sf-t2)',
                          background: st ? st.bg : 'transparent',
                          borderRadius: '4px',
                          padding: st ? '2px 6px' : undefined,
                        }}>
                          {typeof col.value === 'number' ? col.value.toLocaleString() : col.value}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return null
})

// ─── Componente de renderizado de contenido parseado ──────────────────────────

const ParsedContent = memo(function ParsedContent({ content }: { content: string }) {
  const segments = useMemo(() => parseContent(content), [content])

  return (
    <div>
      {segments.map((seg, i) => (
        <div key={i} dangerouslySetInnerHTML={{ __html: renderMarkdown(seg.content) }} className="text-sm" style={{ lineHeight: '1.7' }} />
      ))}
    </div>
  )
})

function getDynamicSuggestions(vendorAnalysis: any[], clientesDormidos: any[], teamStats: any, categoriasInventario: any[]): string[] {
  const suggestions: string[] = []

  suggestions.push('¿Cuál es la acción más importante que debo tomar hoy?')

  const vendedoresRiesgo = vendorAnalysis.filter((v: any) => v.riesgo === 'riesgo' || v.riesgo === 'critico')
  if (vendedoresRiesgo.length > 0) {
    suggestions.push(`¿Por qué ${vendedoresRiesgo[0].vendedor} está en riesgo y qué puedo hacer?`)
  } else {
    suggestions.push('¿Qué vendedor merece reconocimiento este mes?')
  }

  if (clientesDormidos.length > 0) {
    const topDormido = [...clientesDormidos].sort((a: any, b: any) => (b.valor_historico || 0) - (a.valor_historico || 0))[0]
    suggestions.push(`¿Cómo recupero a ${topDormido.cliente}?`)
  } else {
    suggestions.push('¿Qué clientes específicos puedo recuperar esta semana?')
  }

  if (teamStats && teamStats.variacion_pct !== null && teamStats.variacion_pct < 0) {
    suggestions.push('¿Qué está causando el atraso del mes?')
  } else {
    suggestions.push('¿Cómo cerraría el mes si seguimos al ritmo actual?')
  }

  const sinMovimiento = categoriasInventario?.filter((c: any) => c.clasificacion === 'Sin movimiento' || c.clasificacion === 'sin_movimiento') || []
  if (sinMovimiento.length > 0) {
    suggestions.push('¿Qué productos debería dejar de pedir este mes?')
  } else {
    suggestions.push('¿Qué canal está fallando y cuánto impacta?')
  }

  return suggestions.slice(0, 5)
}

// ─── Welcome cards ───────────────────────────────────────────────────────────

const WELCOME_CARDS: { icon: typeof BarChart3; title: string; desc: string; prompt: string }[] = [
  {
    icon: BarChart3,
    title: '¿Cómo va mi mes?',
    desc: 'Resumen ejecutivo de ventas, metas y tendencias',
    prompt: 'Dame un resumen ejecutivo del mes: ventas, cumplimiento de meta, tendencias y los 3 puntos más importantes que debo saber hoy',
  },
  {
    icon: Users,
    title: '¿Quién necesita atención?',
    desc: 'Vendedores en riesgo y clientes dormidos',
    prompt: '¿Quién necesita atención urgente? Muéstrame vendedores en riesgo, clientes dormidos críticos y qué debería hacer primero',
  },
  {
    icon: TrendingDown,
    title: '¿Dónde estoy perdiendo?',
    desc: 'Productos, canales y categorías en caída',
    prompt: '¿Dónde estoy perdiendo ventas? Analiza categorías, productos y canales en caída con impacto económico',
  },
  {
    icon: Target,
    title: '¿Cómo cierro la brecha?',
    desc: 'Plan para alcanzar la meta del mes',
    prompt: '¿Cómo puedo cerrar la brecha para alcanzar la meta del mes? Dame un plan concreto con acciones por vendedor',
  },
]

function deriveLoadingText(text: string): string {
  const lower = text.toLowerCase()
  if (lower.includes('meta') || lower.includes('cumplimiento')) return 'Analizando cumplimiento de metas...'
  if (lower.includes('vendedor') || lower.includes('equipo') || lower.includes('riesgo')) return 'Evaluando rendimiento del equipo...'
  if (lower.includes('cliente') || lower.includes('dormido')) return 'Analizando cartera de clientes...'
  if (lower.includes('producto') || lower.includes('categoría') || lower.includes('inventario')) return 'Revisando productos y categorías...'
  if (lower.includes('canal')) return 'Analizando canales de venta...'
  if (lower.includes('tendencia') || lower.includes('proyección') || lower.includes('rendimiento')) return 'Calculando tendencias...'
  if (lower.includes('acción') || lower.includes('qué hacer') || lower.includes('plan')) return 'Preparando plan de acción...'
  return 'Analizando tus datos...'
}

const CHAT_STORAGE_KEY = 'sf_chat_messages'
const MAX_STORED_MESSAGES = 50

function loadStoredMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as any[]
    return parsed.map(m => ({ ...m, timestamp: new Date(m.timestamp) }))
  } catch { return [] }
}

function saveMessages(msgs: ChatMessage[]) {
  try {
    const toStore = msgs.slice(-MAX_STORED_MESSAGES)
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(toStore))
  } catch { /* localStorage full — silently fail */ }
}

// ─── ChatPage ─────────────────────────────────────────────────────────────────

export default function ChatPage() {
  useAnalysis()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const {
    isProcessed, vendorAnalysis, teamStats, insights, clientesDormidos,
    concentracionRiesgo, categoriasInventario, dataAvailability,
    configuracion, selectedPeriod, sales,
    chatMessages: messages, setChatMessages: setMessages, addChatMessage, clearChatMessages,
  } = useAppStore()
  const [input, setInput] = useState('')
  const [chatSourceBadge, setChatSourceBadge] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [loadingText, setLoadingText] = useState('Analizando tus datos...')
  const [isDeepLoading, setIsDeepLoading] = useState(false)
  const [showNewConvModal, setShowNewConvModal] = useState(false)
  const [profundizandoIndex, setProfundizandoIndex] = useState<number | null>(null)
  const [activeEntity, setActiveEntity] = useState<{
    type: 'vendedor' | 'cliente' | 'canal' | 'producto'
    name: string
  } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastFailedRef = useRef('')
  const streamingContentRef = useRef('')
  const renderTickRef = useRef<number | null>(null)
  const isNearBottomRef = useRef(true)

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100
  }, [])

  const chatContext: ChatContext = useMemo(() => ({
    configuracion,
    selectedPeriod,
    vendorAnalysis,
    teamStats,
    insights,
    clientesDormidos,
    concentracionRiesgo,
    categoriasInventario,
    dataAvailability,
    sales,
  }), [configuracion, selectedPeriod, vendorAnalysis, teamStats, insights,
    clientesDormidos, concentracionRiesgo, categoriasInventario, dataAvailability, sales])

  // Índice del último mensaje asistente
  const lastAssistantMessageIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return i
    }
    return -1
  }, [messages])

  // Detectar entidad (vendedor / cliente) en el texto del mensaje
  const detectEntity = (text: string): typeof activeEntity => {
    const lower = text.toLowerCase()
    const vendedor = vendorAnalysis.find(v => lower.includes(v.vendedor.toLowerCase()))
    if (vendedor) return { type: 'vendedor', name: vendedor.vendedor }
    const cliente = clientesDormidos.find(c => lower.includes(c.cliente.toLowerCase()))
    if (cliente) return { type: 'cliente', name: cliente.cliente }
    return null
  }

  // Construir contexto con hint de entidad activa
  const buildCtxWithEntity = (entity: typeof activeEntity): ChatContext => {
    if (!entity) return chatContext
    return {
      ...chatContext,
      activeEntityHint: `CONTEXTO ACTIVO: El usuario está preguntando sobre ${entity.type} "${entity.name}". Prioriza datos específicos de este actor en tu respuesta.`,
    }
  }

  // Convertir mensajes locales al tipo base para la API (elimina navegacion)
  const toApi = (msgs: ChatMessage[]): BaseChatMessage[] =>
    msgs.map(({ role, content, timestamp }) => ({
      role: role as BaseChatMessage['role'],
      content,
      timestamp,
    }))


  const dynamicQuestions = useMemo(
    () => getDynamicSuggestions(vendorAnalysis, clientesDormidos, teamStats, categoriasInventario),
    [vendorAnalysis, clientesDormidos, teamStats, categoriasInventario]
  )

  // Sidebar: contextual follow-ups or generic fallback
  const sidebarSuggestions = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role === 'assistant' && msg.followUps && msg.followUps.length > 0) {
        return { type: 'contextual' as const, questions: msg.followUps }
      }
    }
    return { type: 'generic' as const, questions: dynamicQuestions }
  }, [messages, dynamicQuestions])

  // Restaurar mensajes de localStorage al montar
  useEffect(() => {
    if (messages.length > 0) return // ya hay mensajes en el store
    const stored = loadStoredMessages()
    if (stored.length > 0) setMessages(stored)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Persistir mensajes en localStorage — skip during streaming (save on complete)
  useEffect(() => {
    if (messages.length > 0 && !isStreaming) saveMessages(messages)
  }, [messages, isStreaming])

  // Scroll to bottom on new messages (non-streaming) or loading state change
  useEffect(() => {
    if (!isStreaming && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length, isLoading])

  // Enviar pregunta desde ?q= al montar (puente desde otras páginas)
  useEffect(() => {
    const stateData = location.state as { prefill?: string; displayPrefill?: string; source?: string; systemOverride?: string } | null
    const pregunta = searchParams.get('q') || stateData?.prefill
    if (!pregunta) return
    const display = stateData?.displayPrefill as string | undefined
    const source = stateData?.source as string | undefined
    const sysOverride = stateData?.systemOverride as string | undefined
    // Set context badge from source
    if (source) setChatSourceBadge(`↗ ${source}`)
    const timer = setTimeout(() => handleSend(pregunta, display, source, sysOverride), 800)
    window.history.replaceState({}, '', location.pathname)
    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Escuchar evento del header "¿Qué hago hoy?" cuando ya estamos en /chat
  useEffect(() => {
    const handler = (e: Event) => {
      const { prefill, systemOverride } = (e as CustomEvent).detail
      if (prefill) handleSend(prefill, undefined, undefined, systemOverride)
    }
    window.addEventListener('sf-header-action', handler)
    return () => window.removeEventListener('sf-header-action', handler)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = async (text: string, displayContent?: string, source?: string, systemOverride?: string) => {
    if (!text.trim() || isLoading || isStreaming || profundizandoIndex !== null) return

    const entity = detectEntity(text)
    if (entity) setActiveEntity(entity)
    // buildCtxWithEntity uses chatContext from useMemo, which can be stale during a render cycle
    let ctx = buildCtxWithEntity(entity ?? activeEntity)

    // Guard: if vendorAnalysis is empty but data is processed, read directly from store
    if ((!ctx.vendorAnalysis || ctx.vendorAnalysis.length === 0) && useAppStore.getState().isProcessed) {
      const store = useAppStore.getState()
      ctx = {
        configuracion: store.configuracion,
        selectedPeriod: store.selectedPeriod,
        vendorAnalysis: store.vendorAnalysis,
        teamStats: store.teamStats,
        insights: store.insights,
        clientesDormidos: store.clientesDormidos,
        concentracionRiesgo: store.concentracionRiesgo,
        categoriasInventario: store.categoriasInventario,
        dataAvailability: store.dataAvailability,
        sales: store.sales,
      }
      if (entity ?? activeEntity) {
        const e = entity ?? activeEntity
        ctx.activeEntityHint = `CONTEXTO ACTIVO: El usuario está preguntando sobre ${e!.type} "${e!.name}". Prioriza datos específicos de este actor en tu respuesta.`
      }
    }

    const userMsg: ChatMessage = { role: 'user', content: text, displayContent, source, timestamp: new Date() }
    addChatMessage(userMsg)
    setInput('')
    lastFailedRef.current = text
    setLoadingText(deriveLoadingText(text))
    setIsLoading(true)

    // Add placeholder assistant message for streaming
    const placeholderMsg: ChatMessage = { role: 'assistant', content: '', timestamp: new Date() }
    addChatMessage(placeholderMsg)
    streamingContentRef.current = ''

    try {
      const allMessages = [...messages, userMsg]
      setIsLoading(false)
      setIsStreaming(true)

      const getMessages = () => useAppStore.getState().chatMessages

      await sendChatMessageStream(toApi(allMessages), ctx, {
        onToken: (token) => {
          streamingContentRef.current += token
          if (!renderTickRef.current) {
            renderTickRef.current = requestAnimationFrame(() => {
              renderTickRef.current = null
              const cur = getMessages()
              const updated = [...cur]
              const lastIdx = updated.length - 1
              updated[lastIdx] = { ...updated[lastIdx], content: streamingContentRef.current }
              setMessages(updated)
              if (isNearBottomRef.current && scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight
              }
            })
          }
        },
        onDone: (fullText) => {
          if (renderTickRef.current) {
            cancelAnimationFrame(renderTickRef.current)
            renderTickRef.current = null
          }
          const { cleanContent: c1, charts } = parseChartBlocks(fullText)
          const { cleanContent, followUps } = parseFollowUps(c1)
          const cur = getMessages()
          const updated = [...cur]
          const lastIdx = updated.length - 1
          updated[lastIdx] = {
            ...updated[lastIdx],
            content: cleanContent,
            followUps,
            charts,
            chart: charts[0] || null,
          }
          setMessages(updated)
          lastFailedRef.current = ''
          setIsStreaming(false)
        },
        onError: (errorKey) => {
          const errInfo = ERROR_MESSAGES[errorKey] ?? ERROR_MESSAGES['API_ERROR']
          const cur = getMessages()
          const updated = [...cur]
          const lastIdx = updated.length - 1
          updated[lastIdx] = {
            ...updated[lastIdx],
            content: errInfo.text,
            isError: true,
            errorKey,
          }
          setMessages(updated)
          setIsStreaming(false)
        },
      }, systemOverride)
    } catch (error: any) {
      const ek = error?.message?.includes('fetch') || error?.message?.includes('network') ? 'NETWORK' : error?.message
      const errInfo = ERROR_MESSAGES[ek] ?? ERROR_MESSAGES['API_ERROR']
      const cur = useAppStore.getState().chatMessages
      const updated = [...cur]
      const lastIdx = updated.length - 1
      if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
        updated[lastIdx] = { ...updated[lastIdx], content: errInfo.text, isError: true, errorKey: ek }
      }
      setMessages(updated)
      setIsStreaming(false)
      setIsLoading(false)
    }
  }

  const handleProfundizar = async (index: number, itemText: string) => {
    if (isLoading || isStreaming || profundizandoIndex !== null) return

    const title = itemText.replace(/^\d+\.\s*/, '').slice(0, 60)
    const prompt = `Acción #${index}: '${title}'.\nResponde SOLO con esto, sin introducción ni cierre:\n\nQUIÉN: [nombre real, cargo si aplica]\nQUÉ DECIR: [una frase concreta, máx 20 palabras]\nPASOS: [3 pasos, máx 8 palabras cada uno]\nRESULTADO EN 24H: [una línea]\n\nSin texto adicional. Sin explicaciones.`
    const nav = getRouteFromText(itemText, vendorAnalysis.map((v) => v.vendedor))

    setProfundizandoIndex(index)
    const userMsg: ChatMessage = { role: 'user', content: prompt, timestamp: new Date() }
    addChatMessage(userMsg)
    setLoadingText('Profundizando en el tema...')
    setIsLoading(true)

    // Placeholder for streaming
    const placeholderMsg: ChatMessage = { role: 'assistant', content: '', timestamp: new Date() }
    addChatMessage(placeholderMsg)
    streamingContentRef.current = ''

    try {
      const allMessages = [...messages, userMsg]
      setIsLoading(false)
      setIsStreaming(true)

      const getMessages = () => useAppStore.getState().chatMessages

      await sendChatMessageStream(toApi(allMessages), buildCtxWithEntity(activeEntity), {
        onToken: (token) => {
          streamingContentRef.current += token
          if (!renderTickRef.current) {
            renderTickRef.current = requestAnimationFrame(() => {
              renderTickRef.current = null
              const cur = getMessages()
              const updated = [...cur]
              const lastIdx = updated.length - 1
              updated[lastIdx] = { ...updated[lastIdx], content: streamingContentRef.current }
              setMessages(updated)
              if (isNearBottomRef.current && scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight
              }
            })
          }
        },
        onDone: (fullText) => {
          if (renderTickRef.current) {
            cancelAnimationFrame(renderTickRef.current)
            renderTickRef.current = null
          }
          const { cleanContent: c1, charts } = parseChartBlocks(fullText)
          const { cleanContent, followUps } = parseFollowUps(c1)
          const cur = getMessages()
          const updated = [...cur]
          const lastIdx = updated.length - 1
          updated[lastIdx] = {
            ...updated[lastIdx],
            content: cleanContent,
            followUps,
            charts,
            chart: charts[0] || null,
            ...(nav ? { navegacion: nav } : {}),
          }
          setMessages(updated)
          setIsStreaming(false)
          setProfundizandoIndex(null)
        },
        onError: (errorKey) => {
          const errInfo = ERROR_MESSAGES[errorKey] ?? ERROR_MESSAGES['API_ERROR']
          const cur = getMessages()
          const updated = [...cur]
          const lastIdx = updated.length - 1
          updated[lastIdx] = { ...updated[lastIdx], content: errInfo.text, isError: true, errorKey }
          setMessages(updated)
          setIsStreaming(false)
          setProfundizandoIndex(null)
        },
      })
    } catch (error: any) {
      const ek = error?.message?.includes('fetch') || error?.message?.includes('network') ? 'NETWORK' : error?.message
      const errInfo = ERROR_MESSAGES[ek] ?? ERROR_MESSAGES['API_ERROR']
      const cur = useAppStore.getState().chatMessages
      const updated = [...cur]
      const lastIdx = updated.length - 1
      if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
        updated[lastIdx] = { ...updated[lastIdx], content: errInfo.text, isError: true, errorKey: ek }
      }
      setMessages(updated)
      setIsStreaming(false)
      setIsLoading(false)
      setProfundizandoIndex(null)
    }
  }

  const handleDeepAnalysis = async () => {
    if (isLoading || isStreaming || isDeepLoading || profundizandoIndex !== null) return

    const userMsg: ChatMessage = {
      role: 'user',
      content: 'Dame un análisis profundo del negocio',
      timestamp: new Date(),
    }
    addChatMessage(userMsg)
    setIsDeepLoading(true)

    try {
      const response = await sendDeepAnalysis(chatContext)
      const { cleanContent: c1, charts } = parseChartBlocks(response)
      const { cleanContent, followUps } = parseFollowUps(c1)
      addChatMessage({
        role: 'assistant',
        content: cleanContent,
        timestamp: new Date(),
        isDeepAnalysis: true,
        followUps,
        charts,
        chart: charts[0] || null,
      })
    } catch (error: any) {
      const ek = error?.message?.includes('fetch') || error?.message?.includes('network') ? 'NETWORK' : error?.message
      const errInfo = ERROR_MESSAGES[ek] ?? ERROR_MESSAGES['API_ERROR']
      addChatMessage({ role: 'assistant', content: errInfo.text, timestamp: new Date(), isError: true, errorKey: ek })
    } finally {
      setIsDeepLoading(false)
    }
  }

  const handleNewConversation = () => {
    if (messages.length > 2) { setShowNewConvModal(true); return }
    clearChatMessages()
    localStorage.removeItem(CHAT_STORAGE_KEY)
  }
  const confirmNewConversation = () => {
    setShowNewConvModal(false)
    clearChatMessages()
    localStorage.removeItem(CHAT_STORAGE_KEY)
  }

  const showEmptyState = messages.length === 0 && !isLoading && !isStreaming
  const showTodayButton = isProcessed

  return (
    <div className="flex flex-col md:flex-row gap-4 h-[calc(100dvh-80px)] animate-in fade-in duration-500">
        {/* Chat area */}
        <div style={{
          background: 'var(--sf-card)',
          border: '1px solid var(--sf-border)',
          borderRadius: '12px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
        }}>
          {/* Header compacto */}
          <div className="flex items-center gap-2 px-4 py-1.5 border-b border-[var(--sf-border)] shrink-0">
            <span className="text-sm font-semibold" style={{ color: 'var(--sf-t1)' }}>Asistente Virtual</span>
            {chatSourceBadge && (
              <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--sf-green-bg)', color: 'var(--sf-green)', border: '1px solid var(--sf-green-border)' }}>
                {chatSourceBadge}
                <button onClick={() => setChatSourceBadge(null)} className="ml-0.5 hover:opacity-60" style={{ lineHeight: 1 }}>×</button>
              </span>
            )}
            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--sf-t4)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              conectado
            </span>
            {messages.length > 0 && (
              <div className="ml-auto">
                <button
                  onClick={handleNewConversation}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] transition-all"
                  style={{
                    color: 'var(--sf-t4)',
                    background: 'transparent',
                    border: '1px solid transparent',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'var(--sf-inset)'
                    e.currentTarget.style.borderColor = 'var(--sf-border)'
                    e.currentTarget.style.color = 'var(--sf-t2)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.borderColor = 'transparent'
                    e.currentTarget.style.color = 'var(--sf-t4)'
                  }}
                >
                  <RotateCcw className="w-3 h-3" />
                  Nueva conversación
                </button>
              </div>
            )}
          </div>

          {/* Messages */}
          <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-5 space-y-5 min-h-0" style={{ background: 'transparent' }}>
            {/* Pantalla de bienvenida */}
            {showEmptyState && (
              <div className="flex flex-col items-center justify-center h-full px-6 select-none">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'rgba(29,158,117,0.08)', border: '1px solid rgba(29,158,117,0.15)' }}>
                  <span style={{ fontSize: '24px', color: '#1D9E75' }}>✦</span>
                </div>
                <p className="text-2xl font-semibold mb-1" style={{ color: 'var(--sf-t1)' }}>¿Qué quieres saber hoy?</p>
                <p className="text-sm mb-8" style={{ color: 'var(--sf-t3)' }}>Pregúntame sobre tu negocio en lenguaje natural</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl w-full">
                  {WELCOME_CARDS.map((card, idx) => {
                    const Icon = card.icon
                    return (
                      <button
                        key={idx}
                        onClick={() => handleSend(card.prompt, card.title)}
                        className="flex items-start gap-3 p-4 rounded-xl text-left transition-all cursor-pointer"
                        style={{
                          border: '1px solid var(--sf-border)',
                          background: 'transparent',
                          minHeight: '120px',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = 'rgba(29,158,117,0.3)'
                          e.currentTarget.style.background = 'var(--sf-inset)'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = 'var(--sf-border)'
                          e.currentTarget.style.background = 'transparent'
                        }}
                      >
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'rgba(29,158,117,0.1)' }}>
                          <Icon className="w-4.5 h-4.5" style={{ color: '#1D9E75' }} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold mb-1" style={{ color: 'var(--sf-t1)' }}>{card.title}</div>
                          <div className="text-xs leading-relaxed" style={{ color: 'var(--sf-t3)' }}>{card.desc}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            {messages.map((msg, idx) => {
              const isLastAsst = idx === lastAssistantMessageIndex
              const hasFollowUps = msg.role === 'assistant' && !!msg.followUps?.length
              const msgCharts: ChartData[] = (msg.charts?.length ? msg.charts : msg.chart ? [msg.chart] : []) as ChartData[]
              const sections = msg.role === 'assistant'
                ? msg.content.split(/^### /m).filter(Boolean)
                    .map(s => s.split('\n')[0].trim())
                    .filter(s => s.length > 0 && s.length < 60)
                : []

              return (
                <div key={idx} className="flex flex-col gap-1.5">
                  {/* Bubble row */}
                  <div className="flex flex-col">
                    <div className="min-w-0" style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                      {msg.isError ? (
                        <div style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                          padding: '12px 14px',
                          borderRadius: '10px',
                          border: '1px solid var(--sf-red, #EF4444)',
                          background: 'color-mix(in srgb, var(--sf-red, #EF4444) 6%, transparent)',
                          maxWidth: '85%',
                          fontSize: '13px',
                        }}>
                          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--sf-red, #EF4444)' }} />
                          <div>
                            <p style={{ color: 'var(--sf-t1)' }}>{msg.content}</p>
                            {(ERROR_MESSAGES[msg.errorKey ?? '']?.canRetry ?? false) && (
                              <button
                                onClick={() => {
                                  const failed = lastFailedRef.current
                                  if (!failed) return
                                  setMessages(messages.filter((_, mi) => mi !== idx))
                                  handleSend(failed)
                                }}
                                style={{
                                  marginTop: '8px',
                                  fontSize: '12px',
                                  fontWeight: 500,
                                  padding: '4px 12px',
                                  borderRadius: '6px',
                                  border: '1px solid var(--sf-red, #EF4444)',
                                  background: 'transparent',
                                  color: 'var(--sf-red, #EF4444)',
                                  cursor: 'pointer',
                                  transition: 'all 150ms',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--sf-red, #EF4444) 10%, transparent)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                              >
                                Reintentar
                              </button>
                            )}
                          </div>
                        </div>
                      ) : msg.isDeepAnalysis && msg.role === 'assistant' ? (
                      <div data-msg-idx={idx} style={{
                        border: '1px solid rgba(167,139,250,0.25)',
                        background: 'color-mix(in srgb, #a78bfa 4%, var(--sf-card))',
                        borderRadius: '12px',
                        maxWidth: '85%',
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 14px',
                          borderBottom: '1px solid rgba(167,139,250,0.15)',
                        }}>
                          <BrainCircuit className="w-4 h-4 text-[#a78bfa] shrink-0" />
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#a78bfa' }}>Diagnóstico completo</span>
                          <span style={{
                            fontSize: '9px',
                            fontWeight: 600,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: 'rgba(167,139,250,0.12)',
                            color: '#a78bfa',
                            letterSpacing: '0.5px',
                          }}>IA PROFUNDA</span>
                        </div>
                        <div style={{ padding: '10px 14px', fontSize: '13px', color: 'var(--sf-t1)', lineHeight: '1.7' }}>
                          {msgCharts.length > 0 && (
                            <div className="flex flex-col gap-3 mb-3">
                              {msgCharts.map((c, ci) => (
                                <div key={ci}><InlineChart chart={c} /></div>
                              ))}
                            </div>
                          )}
                          <ParsedContent content={msg.content} />
                        </div>
                      </div>
                      ) : (
                      <div
                        {...(msg.role === 'assistant' ? { 'data-msg-idx': idx } : {})}
                        style={msg.role === 'user'
                          ? {
                              background: '#1D9E75',
                              border: '1px solid rgba(29,158,117,0.4)',
                              borderRadius: '16px 16px 4px 16px',
                              padding: '10px 14px',
                              fontSize: '13px',
                              color: '#fff',
                              maxWidth: '75%',
                            }
                          : {
                              background: 'var(--sf-inset)',
                              border: '1px solid var(--sf-border)',
                              borderRadius: '2px 12px 12px 12px',
                              padding: '10px 14px',
                              fontSize: '13px',
                              color: 'var(--sf-t1)',
                              maxWidth: '85%',
                              lineHeight: '1.7',
                            }
                        }
                      >
                        {msg.role === 'assistant' ? (
                          <>
                            {/* Charts FIRST — visual priority (only after streaming completes) */}
                            {msgCharts.length > 0 && !(isStreaming && idx === messages.length - 1) && (
                              <div className="flex flex-col gap-3 mb-3">
                                {msgCharts.map((c, ci) => (
                                  <div key={ci}><InlineChart chart={c} /></div>
                                ))}
                              </div>
                            )}
                            {isStreaming && idx === messages.length - 1 ? (() => {
                              const raw = msg.content || ''
                              // Count complete :::chart blocks and detect partial ones
                              const completeCharts = (raw.match(/:::chart\n[\s\S]*?\n:::/g) || []).length
                              const hasPartial = /:::chart\n(?![\s\S]*?\n:::)[\s\S]*$/.test(raw)
                              const totalSkeletons = completeCharts + (hasPartial ? 1 : 0)
                              // Strip chart blocks (complete and partial) from display
                              const cleanStream = raw
                                .replace(/:::chart\n[\s\S]*?\n:::/g, '')
                                .replace(/:::chart\n[\s\S]*$/g, '')
                                .replace(/\[SEGUIMIENTO\][\s\S]*$/g, '')
                                .replace(/\[\/SEGUIMIENTO\]/g, '')
                                .trim()
                              return (
                                <span>
                                  {totalSkeletons > 0 && (
                                    <div className="flex flex-col gap-2 mb-3">
                                      {Array.from({ length: totalSkeletons }).map((_, pi) => (
                                        <div key={pi} style={{
                                          height: '160px',
                                          borderRadius: '12px',
                                          border: '1px solid var(--sf-border)',
                                          background: 'var(--sf-inset)',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                        }} className="animate-pulse">
                                          <span style={{ fontSize: '11px', color: 'var(--sf-t5)' }}>Generando gráfico...</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {cleanStream && <span dangerouslySetInnerHTML={{ __html: renderMarkdown(cleanStream) }} />}
                                  <span className="sf-stream-cursor" />
                                </span>
                              )
                            })() : (
                              <ParsedContent content={msg.content} />
                            )}
                          </>
                        ) : (
                          <UserBubbleContent msg={msg} />
                        )}
                      </div>
                      )}
                      {msg.navegacion && (
                        <div className="flex justify-end mt-1.5">
                          <button
                            onClick={() => navigate(msg.navegacion!.ruta)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[#00B894]/30 bg-[#00B894]/5 hover:bg-[#00B894]/10 text-[var(--sf-t4)] hover:text-[#00B894] rounded-lg text-[12px] transition-all"
                          >
                            <ExternalLink className="w-3 h-3" />
                            {msg.navegacion.label}
                          </button>
                        </div>
                      )}
                      <div className={cn(
                        'flex items-center mt-1',
                        msg.role === 'user' ? 'justify-end' : 'justify-start'
                      )}>
                        <span className="text-[11px]" style={{ color: 'var(--sf-t4)' }}>
                          {format(msg.timestamp, 'HH:mm')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Chips row — full width, alineado con el bubble */}
                  {msg.role === 'assistant' && (sections.length > 0 || hasFollowUps) && (
                    <div className="pl-10 flex flex-col gap-2">
                      {/* Chips de profundización por sección ### — solo si NO hay follow-ups (evita duplicación) */}
                      {sections.length > 0 && !hasFollowUps && (
                        <div className="flex flex-wrap gap-1.5">
                          {sections.map((section, si) => (
                            <button
                              key={si}
                              onClick={() => handleSend(
                                `Profundiza en: ${section}. Dame nombres específicos, números concretos y la acción recomendada.`
                              )}
                              disabled={isLoading || isStreaming || profundizandoIndex !== null}
                              className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-[var(--sf-border)] bg-[var(--sf-card)] text-[var(--sf-t5)] hover:border-[var(--sf-border)] hover:text-[var(--sf-t2)] disabled:opacity-40 transition-all"
                            >
                              <span className="text-[9px]">↓</span>
                              {section}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Chips de seguimiento */}
                      {hasFollowUps && (
                        isLastAsst ? (
                          <div className="flex flex-wrap gap-1.5">
                            {msg.followUps!.map((q, qi) => (
                              <button
                                key={qi}
                                onClick={() => handleSend(q)}
                                disabled={isLoading || isStreaming || profundizandoIndex !== null}
                                className="text-[11px] px-2.5 py-1 rounded-full border border-[var(--sf-border)] bg-[var(--sf-card)] text-[var(--sf-t4)] hover:border-[#00B894]/50 hover:text-[#00B894] hover:bg-[#00B894]/5 disabled:opacity-40 transition-all text-left"
                                style={{ maxHeight: '2.8em', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
                              >
                                {q}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            {msg.followUps!.map((q, qi) => (
                              <p key={qi} className="text-[10px] text-[var(--sf-t5)] pl-1">· {q}</p>
                            ))}
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            {isLoading && (
              <div className="flex" style={{ alignSelf: 'flex-start' }}>
                <div style={{
                  background: 'var(--sf-inset)',
                  border: '1px solid var(--sf-border)',
                  borderRadius: '2px 12px 12px 12px',
                  padding: '10px 14px',
                }} className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-[#1D9E75] rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <div className="w-1.5 h-1.5 bg-[#1D9E75] rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-1.5 h-1.5 bg-[#1D9E75] rounded-full animate-bounce" />
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--sf-t4)' }}>{loadingText}</span>
                </div>
              </div>
            )}
          </div>


          {/* Input zone */}
          <div className="shrink-0 border-t border-[var(--sf-border)]" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            {showTodayButton && (
              <div className="flex items-center gap-2 px-4 pt-2 pb-1">
                <button
                  onClick={() => { if (!isLoading && !isStreaming && !isDeepLoading && profundizandoIndex === null) handleDeepAnalysis() }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer"
                  style={{
                    border: '1px solid var(--sf-border)',
                    color: 'var(--sf-t2)',
                    background: 'transparent',
                    opacity: (isLoading || isStreaming || isDeepLoading || profundizandoIndex !== null) ? 0.4 : 1,
                    cursor: (isLoading || isStreaming || isDeepLoading || profundizandoIndex !== null) ? 'not-allowed' : 'pointer',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--sf-inset)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  {isDeepLoading
                    ? <Loader2 className="w-3.5 h-3.5 text-[#a78bfa] animate-spin" />
                    : <BrainCircuit className="w-3.5 h-3.5 text-[#a78bfa]" />}
                  <span>{isDeepLoading ? 'Analizando...' : 'Diagnóstico completo'}</span>
                </button>
                <button
                  onClick={() => {
                    if (!isLoading && !isStreaming && !isDeepLoading && profundizandoIndex === null)
                      handleSend(
                        'Dame un resumen ejecutivo rápido del negocio',
                        undefined,
                        undefined,
                        'El usuario quiere un resumen ejecutivo rápido. Responde con exactamente 5 puntos en formato numerado: 1) Ventas del período actual vs anterior (dato concreto), 2) Top vendedor y peor vendedor con cifras, 3) Alerta más crítica ahora mismo, 4) Clientes en riesgo (número y nombres), 5) Veredicto en 1 línea: el negocio va bien/regular/mal y por qué. Máximo 150 palabras total. Sin introducción.',
                      )
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer"
                  style={{
                    border: '1px solid var(--sf-border)',
                    color: 'var(--sf-t2)',
                    background: 'transparent',
                    opacity: (isLoading || isStreaming || isDeepLoading || profundizandoIndex !== null) ? 0.4 : 1,
                    cursor: (isLoading || isStreaming || isDeepLoading || profundizandoIndex !== null) ? 'not-allowed' : 'pointer',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--sf-inset)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <BarChart3 className="w-3.5 h-3.5 text-[#1D9E75]" />
                  <span>Resumen rápido</span>
                </button>
              </div>
            )}
            <div className="px-4 py-3">
              <div style={{
                background: 'var(--sf-elevated)',
                border: '1px solid var(--sf-border)',
                borderRadius: '10px',
                padding: '8px 12px',
                display: 'flex',
                gap: '8px',
                alignItems: 'center',
              }}>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(input) }
                  }}
                  placeholder="Pregunta sobre tus ventas..."
                  rows={1}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    fontSize: '13px',
                    color: 'var(--sf-t1)',
                    flex: 1,
                    resize: 'none',
                    minHeight: '44px',
                  }}
                  disabled={isLoading || isStreaming || profundizandoIndex !== null}
                />
                <button
                  onClick={() => handleSend(input)}
                  disabled={!input.trim() || isLoading || isStreaming || profundizandoIndex !== null}
                  className="transition-opacity duration-200"
                  style={{
                    background: 'rgba(29,158,117,0.15)',
                    border: '1px solid rgba(29,158,117,0.3)',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    color: '#1D9E75',
                    opacity: (!input.trim() || isLoading || isStreaming || profundizandoIndex !== null) ? 0.4 : 1,
                    cursor: (!input.trim() || isLoading || isStreaming || profundizandoIndex !== null) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {(isLoading || isStreaming) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>

      {/* Modal: Nueva conversación */}
      {showNewConvModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowNewConvModal(false)}
          onKeyDown={e => { if (e.key === 'Escape') setShowNewConvModal(false) }}
        >
          <div
            className="rounded-xl p-6 shadow-2xl"
            style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)', maxWidth: 384, width: '90%' }}
            onClick={e => e.stopPropagation()}
          >
            <p className="text-lg font-semibold" style={{ color: 'var(--sf-t1)' }}>Nueva conversación</p>
            <p className="text-sm mt-2" style={{ color: 'var(--sf-t3)' }}>La conversación actual se perderá. ¿Continuar?</p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowNewConvModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                style={{ background: 'transparent', border: '1px solid var(--sf-border)', color: 'var(--sf-t3)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--sf-t1)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--sf-t3)' }}
              >Cancelar</button>
              <button
                onClick={confirmNewConversation}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                style={{ background: '#10b981', color: '#fff', border: 'none' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#059669' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#10b981' }}
              >Sí, nueva conversación</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
