import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { useAnalysis } from '../lib/useAnalysis'
import { sendChatMessage, sendDeepAnalysis, parseFollowUps, parseChartBlock } from '../lib/chatService'
import type { ChartData } from '../lib/chatService'
import type { ChatMessage as BaseChatMessage, ChatMessage } from '../types'
import type { ChatContext } from '../lib/chatService'
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Send, Loader2, Zap, ArrowRight, ExternalLink, BrainCircuit } from 'lucide-react'
import { cn } from '../lib/utils'
import { format } from 'date-fns'

const ERROR_MESSAGES: Record<string, string> = {
  CONFIG_MISSING: 'El asistente IA no está configurado en el servidor.',
  INVALID_KEY: 'Error de configuración del servidor. Contacta al administrador.',
  RATE_LIMIT: 'Límite de requests alcanzado. Espera unos segundos.',
  API_ERROR: 'Error al conectar con el asistente. Intenta de nuevo.',
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

  // Escapar HTML básico primero
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Bloques de código (``` ... ```)
  html = html.replace(
    /```(\w*)\n?([\s\S]*?)```/g,
    (_match, _lang, code: string) =>
      `<pre style="background:var(--sf-inset);border:1px solid var(--sf-border);border-radius:6px;padding:0.75rem;overflow-x:auto;font-family:ui-monospace,monospace;font-size:0.8125rem;margin:0.5rem 0;color:var(--sf-t2)"><code>${code.trim()}</code></pre>`
  )

  // Código inline (`code`)
  html = html.replace(
    /`([^`]+)`/g,
    '<code style="background:var(--sf-inset);border:1px solid var(--sf-border);border-radius:3px;padding:0.125rem 0.375rem;font-family:ui-monospace,monospace;font-size:0.85em;color:var(--sf-t2)">$1</code>'
  )

  // Tablas markdown
  html = html.replace(
    /(\|.+\|\n)+/g,
    (table) => {
      const rows = table.trim().split('\n')
      let tableHtml = '<div style="overflow-x:auto;margin:0.625rem 0"><table style="width:100%;border-collapse:collapse;font-size:0.8125rem">'
      let inHeader = true
      let rowIndex = 0
      for (const row of rows) {
        if (row.match(/^[\|\s\-:]+$/)) { inHeader = false; continue }
        const cells = row.split('|').filter(c => c.trim())
        if (inHeader) {
          const thStyle = 'padding:0.375rem 0.75rem;text-align:left;border-bottom:2px solid var(--sf-border);font-weight:600;white-space:nowrap;color:#00B894;background:var(--sf-inset)'
          tableHtml += '<tr>' + cells.map(c => `<th style="${thStyle}">${c.trim()}</th>`).join('') + '</tr>'
        } else {
          const bg = rowIndex % 2 === 1 ? 'background:var(--sf-inset);' : ''
          const tdStyle = `padding:0.375rem 0.75rem;border-bottom:1px solid var(--sf-border);color:var(--sf-t2);${bg}`
          tableHtml += '<tr>' + cells.map(c => `<td style="${tdStyle}">${c.trim()}</td>`).join('') + '</tr>'
          rowIndex++
        }
      }
      return tableHtml + '</table></div>'
    }
  )

  // Headers ### ## #
  html = html.replace(/^### (.+)$/gm, '<p style="font-size:0.875rem;font-weight:600;color:var(--sf-t1);border-left:3px solid #00B894;padding-left:0.5rem;margin:1rem 0 0.375rem">$1</p>')
  html = html.replace(/^## (.+)$/gm,  '<p style="font-size:0.9375rem;font-weight:600;color:var(--sf-t1);border-left:3px solid #00B894;padding-left:0.5rem;margin:1rem 0 0.375rem">$1</p>')
  html = html.replace(/^# (.+)$/gm,   '<p style="font-size:1rem;font-weight:700;color:var(--sf-t1);border-left:3px solid #00B894;padding-left:0.5rem;margin:1rem 0 0.5rem">$1</p>')

  // Bold **text** y __text__
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong style="font-weight:600;color:var(--sf-t1)">$1</strong>')
  html = html.replace(/__([^_\n]+)__/g,     '<strong style="font-weight:600;color:var(--sf-t1)">$1</strong>')

  // Italic *text* y _text_
  html = html.replace(/\*([^*\n]+)\*/g, '<em style="font-style:italic;color:var(--sf-t2)">$1</em>')
  html = html.replace(/_([^_\n]+)_/g,   '<em style="font-style:italic;color:var(--sf-t2)">$1</em>')

  // Listas ordenadas → tarjetas visuales con número en círculo
  html = html.replace(
    /((?:^\d+\. [\s\S]*?(?=\n\d+\.|\n\n|$))\n?)+/gm,
    (block) => {
      const rawItems = block.trim().split(/(?=^\d+\. )/m).filter(Boolean)
      const cards = rawItems.map((item, i) => {
        const lines = item.trim().split('\n').filter(Boolean)
        const titleLine = lines[0].replace(/^\d+\. /, '').trim()
        const restLines = lines.slice(1).map(l => l.trim()).filter(Boolean)
        const hasRest = restLines.length > 0
        return (
          `<div style="display:flex;gap:0.625rem;padding:0.625rem 0.75rem;` +
          `border-radius:8px;border:1px solid var(--sf-border);background:var(--sf-inset);` +
          `margin-bottom:0.375rem">` +
          `<span style="min-width:1.375rem;height:1.375rem;border-radius:50%;` +
          `background:var(--sf-hover);display:inline-flex;align-items:center;` +
          `justify-content:center;font-size:0.6875rem;font-weight:700;` +
          `color:var(--sf-t4);flex-shrink:0;margin-top:0.125rem">${i + 1}</span>` +
          `<div style="flex:1;min-width:0">` +
          `<p style="font-size:0.875rem;font-weight:500;color:var(--sf-t1);` +
          `margin:0${hasRest ? ' 0 0.25rem 0' : ''};line-height:1.4">${titleLine}</p>` +
          restLines.map(l =>
            `<p style="font-size:0.8125rem;color:var(--sf-t3);margin:0;line-height:1.5">${l}</p>`
          ).join('') +
          `</div></div>`
        )
      }).join('')
      return `<div style="margin:0.5rem 0">${cards}</div>`
    }
  )

  // Listas no ordenadas (- * •)
  html = html.replace(
    /((?:^[-*•] .+\n?)+)/gm,
    (block) => {
      const items = block.trim().split('\n').map(l => l.replace(/^[-*•] /, '').trim()).filter(Boolean)
      return '<ul style="margin:0.5rem 0;padding-left:0;list-style:none;display:flex;flex-direction:column;gap:0.5rem">' +
        items.map(i =>
          `<li style="display:flex;align-items:flex-start;gap:0.5rem;font-size:0.8125rem;color:var(--sf-t2);line-height:1.7">` +
          `<span style="margin-top:0.5rem;width:0.375rem;height:0.375rem;border-radius:50%;flex-shrink:0;background:#00B894;display:inline-block"></span>${i}</li>`
        ).join('') +
        '</ul>'
    }
  )

  // Líneas horizontales ---
  html = html.replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid var(--sf-border);margin:0.75rem 0">')

  // Doble salto de línea → separación de párrafo
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

// ─── InlineChart ──────────────────────────────────────────────────────────────

const CHART_COLORS = {
  green: '#22c55e',
  red: '#ef4444',
  blue: '#3b82f6',
} as const

function InlineChart({ chart }: { chart: ChartData }) {
  const getFill = (entry: { value: number }) =>
    chart.color === 'mixed'
      ? entry.value >= 0 ? CHART_COLORS.green : CHART_COLORS.red
      : CHART_COLORS[chart.color] || CHART_COLORS.blue

  const tickStyle = { fontSize: 11, fill: 'var(--sf-t4)' }

  if (chart.type === 'bar' || chart.type === 'horizontal_bar') {
    const isHorizontal = chart.type === 'horizontal_bar'
    return (
      <div className="mt-3 p-3 rounded-xl" style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)' }}>
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--sf-t4)' }}>{chart.title}</p>
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
            <Tooltip
              contentStyle={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: 'var(--sf-t2)' }}
            />
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
    const color = chart.color === 'mixed' ? CHART_COLORS.blue : (CHART_COLORS[chart.color] || CHART_COLORS.blue)
    return (
      <div className="mt-3 p-3 rounded-xl" style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)' }}>
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--sf-t4)' }}>{chart.title}</p>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chart.data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <XAxis dataKey="label" tick={tickStyle} axisLine={false} tickLine={false} />
            <YAxis tick={tickStyle} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: 'var(--sf-t2)' }}
            />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 3, fill: color }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    )
  }

  if (chart.type === 'pie') {
    const PIE_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#6366f1']
    return (
      <div className="mt-3 p-3 rounded-xl" style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)' }}>
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--sf-t4)' }}>{chart.title}</p>
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
            <Tooltip
              contentStyle={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)', borderRadius: 8, fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    )
  }

  return null
}

// ─── Componente de renderizado de contenido parseado ──────────────────────────

function ParsedContent({
  content,
  isInteractive,
  profundizandoIndex,
  onProfundizar,
}: {
  content: string
  isInteractive: boolean
  profundizandoIndex: number | null
  onProfundizar: (index: number, text: string) => void
}) {
  const segments = parseContent(content)

  return (
    <div>
      {segments.map((seg, i) => {
        if (seg.type === 'text') {
          return <div key={i} dangerouslySetInnerHTML={{ __html: renderMarkdown(seg.content) }} className="text-sm" style={{ lineHeight: '1.7' }} />
        }

        const isThisLoading = isInteractive && profundizandoIndex === seg.index
        const canInteract = isInteractive && profundizandoIndex === null
        const showButton = isInteractive && (canInteract || isThisLoading)

        return (
          <div
            key={i}
            className={cn(
              'group relative rounded-lg transition-all duration-150',
              canInteract && 'hover:bg-white/[0.03] px-2 py-1 -mx-2',
              isThisLoading && 'opacity-70 px-2 py-1 -mx-2'
            )}
          >
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(seg.content) }} className="text-sm" style={{ lineHeight: '1.7' }} />
            {showButton && (
              <button
                onClick={() => canInteract && onProfundizar(seg.index, seg.content)}
                disabled={!canInteract}
                className={cn(
                  'absolute bottom-1 right-1 flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium border transition-all duration-150',
                  'border-[#00B894]/50 bg-[#00B894]/5 text-[#00d084]',
                  canInteract
                    ? 'opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0'
                    : 'opacity-100'
                )}
              >
                {isThisLoading
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <><span>Profundizar</span><ArrowRight className="w-3 h-3" /></>
                }
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
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
    chatMessages: messages, setChatMessages: setMessages, addChatMessage,
  } = useAppStore()
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isDeepLoading, setIsDeepLoading] = useState(false)
  const [profundizandoIndex, setProfundizandoIndex] = useState<number | null>(null)
  const [activeEntity, setActiveEntity] = useState<{
    type: 'vendedor' | 'cliente' | 'canal' | 'producto'
    name: string
  } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const welcomeSentRef = useRef(false)

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

  // Sugerencias dinámicas
  const quickSuggestions = useMemo((): string[] => {
    if (!isProcessed || !teamStats) {
      return [
        '¿Cómo interpreto los datos de ventas?',
        '¿Qué columnas necesito para el análisis completo?',
        '¿Cómo funciona el monitor de riesgo?',
        '¿Qué es el recovery score de clientes?',
      ]
    }
    const suggestions: string[] = []
    const primerCritico = vendorAnalysis.find((v) => v.riesgo === 'critico')
    if (primerCritico) suggestions.push(`¿Por qué ${primerCritico.vendedor} está en riesgo?`)
    if (clientesDormidos.length > 0) suggestions.push('¿Cuáles son mis clientes más importantes sin comprar?')
    const ytd = teamStats.variacion_ytd_equipo
    if (ytd != null && ytd < 0) suggestions.push(`¿Qué explica la caída de ${Math.abs(ytd).toFixed(1)}% este año?`)
    suggestions.push('Dame un análisis completo del equipo este mes')
    return suggestions.slice(0, 4)
  }, [isProcessed, vendorAnalysis, teamStats, clientesDormidos])

  // Índice del último mensaje asistente con lista numerada (para interactividad)
  const lastNumberedMessageIndex = useMemo(() => {
    let lastIdx = -1
    messages.forEach((msg, idx) => {
      if (msg.role === 'assistant' && /^\d+\./m.test(msg.content)) lastIdx = idx
    })
    return lastIdx
  }, [messages])

  // Auto-bienvenida al montar (una sola vez, cuando hay datos + key)
  useEffect(() => {
    if (welcomeSentRef.current || !isProcessed || messages.length > 0) return
    welcomeSentRef.current = true
    setIsLoading(true)
    const initMsg: ChatMessage = {
      role: 'user',
      content: '¿Cuáles son los 3 problemas principales de ventas de este período? Responde usando ### para el título de cada problema y bullets (-) para los datos. Máximo 3 bullets por problema. Solo datos reales con nombres y números.',
      timestamp: new Date(),
    }
    sendChatMessage(toApi([initMsg]), chatContext)
      .then((response) => {
        const { cleanContent: c1, chart } = parseChartBlock(response)
        const { cleanContent, followUps } = parseFollowUps(c1)
        setMessages([{ role: 'assistant', content: cleanContent, timestamp: new Date(), followUps, chart }])
      })
      .catch(() => { /* silencioso — el chat queda vacío con sugerencias */ })
      .finally(() => setIsLoading(false))
  }, [isProcessed]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
  }, [messages, isLoading])

  // Enviar pregunta desde ?q= al montar (puente desde EstadoComercialPage)
  useEffect(() => {
    const stateData = location.state as any
    const pregunta = searchParams.get('q') || stateData?.prefill
    if (!pregunta) return
    const display = stateData?.displayPrefill as string | undefined
    const timer = setTimeout(() => handleSend(pregunta, display), 800)
    // Limpiar state de navegación para evitar re-envío en re-render
    window.history.replaceState({}, '', '/chat')
    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = async (text: string, displayContent?: string) => {
    if (!text.trim() || isLoading || profundizandoIndex !== null) return

    const entity = detectEntity(text)
    if (entity) setActiveEntity(entity)
    const ctx = buildCtxWithEntity(entity ?? activeEntity)

    const userMsg: ChatMessage = { role: 'user', content: text, displayContent, timestamp: new Date() }
    addChatMessage(userMsg)
    setInput('')
    setIsLoading(true)

    try {
      const allMessages = [...messages, userMsg]
      const response = await sendChatMessage(toApi(allMessages), ctx)
      const { cleanContent: c1, chart } = parseChartBlock(response)
      const { cleanContent, followUps } = parseFollowUps(c1)
      addChatMessage({ role: 'assistant', content: cleanContent, timestamp: new Date(), followUps, chart })
    } catch (error: any) {
      const msg = ERROR_MESSAGES[error.message] ?? ERROR_MESSAGES['API_ERROR']
      addChatMessage({ role: 'assistant', content: `❌ ${msg}`, timestamp: new Date() })
    } finally {
      setIsLoading(false)
    }
  }

  const handleProfundizar = async (index: number, itemText: string) => {
    if (isLoading || profundizandoIndex !== null) return

    const title = itemText.replace(/^\d+\.\s*/, '').slice(0, 60)
    const prompt = `Acción #${index}: '${title}'.\nResponde SOLO con esto, sin introducción ni cierre:\n\nQUIÉN: [nombre real, cargo si aplica]\nQUÉ DECIR: [una frase concreta, máx 20 palabras]\nPASOS: [3 pasos, máx 8 palabras cada uno]\nRESULTADO EN 24H: [una línea]\n\nSin texto adicional. Sin explicaciones.`
    const nav = getRouteFromText(itemText, vendorAnalysis.map((v) => v.vendedor))

    setProfundizandoIndex(index)
    const userMsg: ChatMessage = { role: 'user', content: prompt, timestamp: new Date() }
    addChatMessage(userMsg)
    setIsLoading(true)

    try {
      const allMessages = [...messages, userMsg]
      const response = await sendChatMessage(toApi(allMessages), buildCtxWithEntity(activeEntity))
      const { cleanContent: c1, chart } = parseChartBlock(response)
      const { cleanContent, followUps } = parseFollowUps(c1)
      addChatMessage({
        role: 'assistant',
        content: cleanContent,
        timestamp: new Date(),
        followUps,
        chart,
        ...(nav ? { navegacion: nav } : {}),
      })
    } catch (error: any) {
      const msg = ERROR_MESSAGES[error.message] ?? ERROR_MESSAGES['API_ERROR']
      addChatMessage({ role: 'assistant', content: `❌ ${msg}`, timestamp: new Date() })
    } finally {
      setIsLoading(false)
      setProfundizandoIndex(null)
    }
  }

  const handleDeepAnalysis = async () => {
    if (isLoading || isDeepLoading || profundizandoIndex !== null) return

    const userMsg: ChatMessage = {
      role: 'user',
      content: 'Dame un análisis profundo del negocio',
      timestamp: new Date(),
    }
    addChatMessage(userMsg)
    setIsDeepLoading(true)

    try {
      const response = await sendDeepAnalysis(chatContext)
      addChatMessage({
        role: 'assistant',
        content: response,
        timestamp: new Date(),
        isDeepAnalysis: true,
      })
    } catch (error: any) {
      const msg = ERROR_MESSAGES[error.message] ?? ERROR_MESSAGES['API_ERROR']
      addChatMessage({ role: 'assistant', content: `❌ ${msg}`, timestamp: new Date() })
    } finally {
      setIsDeepLoading(false)
    }
  }

  const showEmptyState = messages.length === 0 && !isLoading
  const showTodayButton = isProcessed

  return (
    <div className="flex flex-col md:flex-row gap-4 h-[calc(100vh-80px)] animate-in fade-in duration-500">
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
          <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--sf-border)] shrink-0">
            <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'rgba(29,158,117,0.1)' }}>
              <span className="text-xs" style={{ color: '#1D9E75' }}>✦</span>
            </div>
            <span className="text-sm font-medium" style={{ color: 'var(--sf-t1)' }}>Asistente SalesFlow</span>
            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--sf-t4)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              conectado
            </span>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-5 min-h-0" style={{ background: 'transparent' }}>
            {messages.map((msg, idx) => {
              const isLastAsst = idx === lastAssistantMessageIndex
              const hasFollowUps = msg.role === 'assistant' && !!msg.followUps?.length
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
                      {msg.isDeepAnalysis && (
                        <div className="mb-1">
                          <span className="font-mono text-[10px] text-[#a78bfa]">🧠 deepseek-reasoner</span>
                        </div>
                      )}
                      <div
                        style={msg.role === 'user'
                          ? {
                              background: 'rgba(29,158,117,0.12)',
                              border: '1px solid rgba(29,158,117,0.2)',
                              borderRadius: '12px 12px 2px 12px',
                              padding: '10px 14px',
                              fontSize: '13px',
                              color: 'var(--sf-t1)',
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
                            <ParsedContent
                              content={msg.content}
                              isInteractive={idx === lastNumberedMessageIndex}
                              profundizandoIndex={profundizandoIndex}
                              onProfundizar={handleProfundizar}
                            />
                            {msg.chart && <InlineChart chart={msg.chart} />}
                          </>
                        ) : (
                          <div className="whitespace-pre-wrap">{msg.displayContent || msg.content}</div>
                        )}
                      </div>
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
                      <p className={cn(
                        'text-[9px] text-[var(--sf-t5)] mt-1',
                        msg.role === 'user' ? 'text-right' : 'text-left'
                      )}>
                        {format(msg.timestamp, 'HH:mm')}
                      </p>
                    </div>
                  </div>

                  {/* Chips row — full width, alineado con el bubble */}
                  {msg.role === 'assistant' && (sections.length > 0 || hasFollowUps) && (
                    <div className="pl-10 flex flex-col gap-2">
                      {/* Chips de profundización por sección ### */}
                      {sections.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {sections.map((section, si) => (
                            <button
                              key={si}
                              onClick={() => handleSend(
                                `Profundiza en: ${section}. Dame nombres específicos, números concretos y la acción recomendada.`
                              )}
                              disabled={isLoading || profundizandoIndex !== null}
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
                                disabled={isLoading || profundizandoIndex !== null}
                                className="text-[11px] px-2.5 py-1 rounded-full border border-[var(--sf-border)] bg-[var(--sf-card)] text-[var(--sf-t4)] hover:border-[#00B894]/50 hover:text-[#00B894] hover:bg-[#00B894]/5 disabled:opacity-40 transition-all text-left"
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
                }} className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-[#1D9E75] rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-1.5 h-1.5 bg-[#1D9E75] rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-1.5 h-1.5 bg-[#1D9E75] rounded-full animate-bounce" />
                </div>
              </div>
            )}
          </div>

          {/* Sugerencias cuando no hay conversación */}
          {showEmptyState && (
            <div className="px-5 pb-3 shrink-0">
              <div style={{
                fontSize: '10px',
                textTransform: 'uppercase' as const,
                letterSpacing: '0.08em',
                color: 'var(--sf-t4)',
                marginBottom: '10px',
                padding: '0 4px',
              }}>
                Sugerencias
              </div>
              <div className="grid grid-cols-2 gap-2">
                {quickSuggestions.map((q, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleSend(q)}
                    style={{
                      background: 'var(--sf-card)',
                      border: '1px solid var(--sf-border)',
                      borderRadius: '10px',
                      padding: '12px 16px',
                      cursor: 'pointer',
                      transition: 'all 150ms',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--sf-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--sf-card)')}
                  >
                    <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--sf-t1)', marginBottom: '2px' }}>
                      {q}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Input zone */}
          <div className="shrink-0 border-t border-[var(--sf-border)]">
            {showTodayButton && (
              <div className="flex gap-2 px-4 pt-3">
                <div
                  onClick={() => { if (!isLoading && !isDeepLoading && profundizandoIndex === null) handleDeepAnalysis() }}
                  className="flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors"
                  style={{
                    background: 'var(--sf-card)',
                    border: '1px solid var(--sf-border)',
                    opacity: (isLoading || isDeepLoading || profundizandoIndex !== null) ? 0.4 : 1,
                    cursor: (isLoading || isDeepLoading || profundizandoIndex !== null) ? 'not-allowed' : 'pointer',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--sf-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--sf-card)')}
                >
                  {isDeepLoading
                    ? <Loader2 className="w-4 h-4 text-[#a78bfa] shrink-0 animate-spin" />
                    : <BrainCircuit className="w-4 h-4 text-[#a78bfa] shrink-0" />}
                  <div className="min-w-0">
                    <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--sf-t1)' }}>
                      {isDeepLoading ? 'Razonando...' : 'Análisis profundo'}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--sf-t4)' }}>deepseek-reasoner · ~10s</div>
                  </div>
                </div>
                <div
                  onClick={() => {
                    if (!isLoading && !isDeepLoading && profundizandoIndex === null)
                      handleSend('3 acciones para hoy. Formato estricto:\n\n1. [NOMBRE REAL]: [acción en 10 palabras máx]\nPor qué hoy: [una razón, 10 palabras máx]\n\n2. [NOMBRE REAL]: [acción en 10 palabras máx]\nPor qué hoy: [una razón, 10 palabras máx]\n\n3. [NOMBRE REAL]: [acción en 10 palabras máx]\nPor qué hoy: [una razón, 10 palabras máx]\n\nSin introducción. Sin conclusión. Solo los 3 items.')
                  }}
                  className="flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors"
                  style={{
                    background: 'var(--sf-card)',
                    border: '1px solid var(--sf-border)',
                    opacity: (isLoading || isDeepLoading || profundizandoIndex !== null) ? 0.4 : 1,
                    cursor: (isLoading || isDeepLoading || profundizandoIndex !== null) ? 'not-allowed' : 'pointer',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--sf-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--sf-card)')}
                >
                  <Zap className="w-4 h-4 text-[#1D9E75] shrink-0" />
                  <div className="min-w-0">
                    <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--sf-t1)' }}>¿Qué hacer hoy?</div>
                    <div style={{ fontSize: '10px', color: 'var(--sf-t4)' }}>3 acciones concretas</div>
                  </div>
                </div>
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
                  }}
                  disabled={isLoading || profundizandoIndex !== null}
                />
                <button
                  onClick={() => handleSend(input)}
                  disabled={!input.trim() || isLoading || profundizandoIndex !== null}
                  style={{
                    background: 'rgba(29,158,117,0.15)',
                    border: '1px solid rgba(29,158,117,0.3)',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    color: '#1D9E75',
                    cursor: (!input.trim() || isLoading || profundizandoIndex !== null) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar — preguntas frecuentes */}
        <div className="hidden md:flex w-56 flex-col gap-4 shrink-0">
          <div style={{
            background: 'var(--sf-card)',
            border: '1px solid var(--sf-border)',
            borderRadius: '12px',
            padding: '12px',
          }}>
            <div style={{
              fontSize: '10px',
              textTransform: 'uppercase' as const,
              letterSpacing: '0.08em',
              color: 'var(--sf-t4)',
              marginBottom: '8px',
              padding: '0 4px',
            }}>
              Preguntas frecuentes
            </div>
            <div className="space-y-1">
              {[
                '¿Qué está causando el atraso del mes?',
                '¿Quién tiene el mayor riesgo hoy y por qué?',
                '¿Qué clientes específicos puedo recuperar esta semana?',
                '¿Cuáles son los 3 vendedores más críticos y qué los explica?',
                '¿Qué canal está fallando y cuánto impacta?',
                '¿Cuáles son las 5 cuentas dormidas con mayor potencial?',
                '¿Cómo cerraría el mes si seguimos al ritmo actual?',
                '¿Qué productos debería dejar de pedir este mes?',
                '¿Cuál es la acción más importante que debo tomar hoy?',
                '¿Qué vendedor merece reconocimiento este mes?',
              ].map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(q)}
                  style={{
                    width: '100%',
                    textAlign: 'left' as const,
                    background: 'var(--sf-inset)',
                    border: '1px solid var(--sf-border)',
                    borderRadius: '6px',
                    padding: '7px 10px',
                    fontSize: '11px',
                    color: 'var(--sf-t4)',
                    cursor: 'pointer',
                    transition: 'all 150ms',
                    lineHeight: '1.4',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(29,158,117,0.08)'
                    e.currentTarget.style.borderColor = 'rgba(29,158,117,0.2)'
                    e.currentTarget.style.color = 'var(--sf-t1)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'var(--sf-inset)'
                    e.currentTarget.style.borderColor = 'var(--sf-border)'
                    e.currentTarget.style.color = 'var(--sf-t4)'
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
    </div>
  )
}
