import React, { useState, useMemo, useCallback, useRef, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDemoPath } from '../lib/useDemoPath'
import { useAppStore } from '../store/appStore'
// callAI removed — analysis is now computed locally
import { DEPTS } from '../lib/deptPaths'
import { SFSelect } from '../components/ui/SFSelect'

function norm(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}
const DEPT_MAP: Record<string, string> = {}
Object.keys(DEPTS).forEach(k => { DEPT_MAP[norm(k)] = k })
function matchDept(raw: string): string | null {
  const n = norm(raw)
  if (DEPT_MAP[n]) return DEPT_MAP[n]
  for (const [key, val] of Object.entries(DEPT_MAP)) {
    if (key.includes(n) || n.includes(key)) return val
  }
  return null
}

// ─── Tipos ────────────────────────────────────────────────────────────────────
type DeptStatus = 'arriba' | 'abajo' | 'sin_base' | 'sin_datos'
interface DeptData {
  ytdActual: number
  ytdAnterior: number
  ytdActualNeto: number
  ytdAnteriorNeto: number
  variacion_pct: number | null
  status: DeptStatus
}

// ─── Colores escala de calor ──────────────────────────────────────────────────
function heatColor(d: DeptData | undefined, hovered: boolean): string {
  if (!d || d.ytdActual === 0) return hovered ? 'rgba(113,113,122,0.4)' : 'rgba(63,63,70,0.3)'
  if (d.status === 'sin_base') return hovered ? 'rgba(139,92,246,0.6)' : 'rgba(139,92,246,0.4)'
  const pct = Math.abs(d.variacion_pct ?? 0)
  const intensity = Math.min(pct / 80, 1)
  if (d.status === 'arriba') return `rgba(16,185,129,${0.3 + intensity * 0.6})`
  return `rgba(239,68,68,${0.3 + intensity * 0.6})`
}
function strokeColor(d: DeptData | undefined, hovered: boolean): string {
  if (hovered) return d?.status === 'arriba' ? '#10b981' : d?.status === 'abajo' ? '#ef4444' : 'rgba(255,255,255,0.6)'
  return 'rgba(255,255,255,0.15)'
}

// ─── Renderizador de análisis IA estructurado ───────────────────────────────
function AiStructuredText({ text }: { text: string }) {
  if (!text) return null

  const sections = text.split('\n\n').filter(Boolean)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {sections.map((section, i) => {
        const lines = section.split('\n').filter(Boolean)
        const header = lines[0]
        const bullets = lines.slice(1)

        // Línea de RESUMEN (📊)
        if (header.includes('RESUMEN')) {
          return (
            <p key={i} style={{ fontSize: '13px', fontWeight: 600, color: 'var(--sf-t1)', margin: 0, lineHeight: 1.5 }}>
              {header}
            </p>
          )
        }

        // Línea de HALLAZGO (💡) o ACCIÓN (⚡) legacy
        if (header.includes('HALLAZGO') || header.includes('ACCIÓN') || header.includes('ACCION')) {
          return (
            <p key={i} style={{ fontSize: '12px', fontWeight: 600, color: '#fbbf24', margin: 0, lineHeight: 1.5 }}>
              {header}
            </p>
          )
        }

        // Sección con bullets (🔺 CRECIMIENTO / 🔻 CAÍDA)
        if (bullets.length > 0) {
          const isGrowth = header.includes('CRECIMIENTO') || header.includes('🔺')
          const isFall = header.includes('CAÍDA') || header.includes('CAIDA') || header.includes('🔻')
          const accentColor = isGrowth ? '#34d399' : isFall ? '#f87171' : '#94a3b8'
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: accentColor, margin: 0 }}>
                {header}
              </p>
              {bullets.map((b, j) => (
                <p key={j} style={{ fontSize: '12px', color: 'var(--sf-t2)', margin: 0, paddingLeft: '14px', lineHeight: 1.6 }}>
                  {b}
                </p>
              ))}
            </div>
          )
        }

        // Fallback — línea simple
        return (
          <p key={i} style={{ fontSize: '12px', color: 'var(--sf-t4)', margin: 0, lineHeight: 1.6 }}>
            {header}
          </p>
        )
      })}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function DepartamentosPage() {
  const sales = useAppStore(s => s.sales)
  const { year, month } = useAppStore(s => s.selectedPeriod)
  const configuracion = useAppStore(s => s.configuracion)
  const dataAvailability = useAppStore(s => s.dataAvailability)
  const clientesDormidos = useAppStore(s => s.clientesDormidos)
  const vendorAnalysis = useAppStore(s => s.vendorAnalysis)
  const categoriaAnalysis = useAppStore(s => s.categoriaAnalysis)
  const departamentoSummaries = useAppStore(s => s.departamentoSummaries)
  const mesesDisponibles = useAppStore(s => s.mesesDisponibles)
  const canalesDisponibles = useAppStore(s => s.canalesDisponibles)

  const [hovered, setHovered] = useState<string | null>(null)
  const [filterMes, setFilterMes] = useState<number | null>(null)
  const [filterCanal, setFilterCanal] = useState<string | null>(null)
  const metricaDept: 'uds' | 'usd' = (dataAvailability.has_venta_neta ? (configuracion.metricaGlobal ?? 'usd') : 'uds') as 'uds' | 'usd'
  const navigate = useNavigate()
  const dp = useDemoPath()
  const [insightDept, setInsightDept] = useState<string | null>(null)
  const [insightText, setInsightText] = useState('')
  const [insightLoading, setInsightLoading] = useState(false)
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
  const [aiExplanation, setAiExplanation] = useState<{
    depto: string
    varPct: number
    loading: boolean
    text: string | null
    content?: React.ReactNode
  } | null>(null)
  const aiPanelRef = useRef<HTMLDivElement>(null)

  // ── YTD acumulado desde enero hasta mes seleccionado ─────────────────────────
  // Cuando no hay filtros activos, derivamos del summary pre-computado off-thread.
  // Cuando se aplica filterMes o filterCanal, hacemos un single pass sobre sales
  // (acción explícita del usuario) — el caso por defecto es instantáneo.
  const deptData = useMemo((): Record<string, DeptData> => {
    const noFilters = filterMes === null && !filterCanal

    // ── Caso default: derivar de departamentoSummaries pre-computado ──
    if (noFilters) {
      if (!departamentoSummaries.length) return {}
      const res: Record<string, DeptData> = {}
      const useUSDmetric = metricaDept === 'usd'
      for (const s of departamentoSummaries) {
        const dept = matchDept(s.nombre)
        if (!dept) continue
        // R56: ytdActual/ytdAnterior representan la métrica activa (USD o UDS)
        const a = useUSDmetric ? s.ventaCur : s.udsCur
        const b = useUSDmetric ? s.ventaPrev : s.udsPrev
        const v = b > 0 ? Math.round(((a - b) / b) * 100) : null
        // Si dept ya existe (varios nombres mapean al mismo), agregar
        if (res[dept]) {
          res[dept].ytdActual += a
          res[dept].ytdAnterior += b
          res[dept].ytdActualNeto += s.ventaCur
          res[dept].ytdAnteriorNeto += s.ventaPrev
          const va = res[dept].ytdActual, vb = res[dept].ytdAnterior
          const newV = vb > 0 ? Math.round(((va - vb) / vb) * 100) : null
          res[dept].variacion_pct = newV
          res[dept].status = va === 0 ? 'sin_datos' : newV === null ? 'sin_base' : newV >= 0 ? 'arriba' : 'abajo'
        } else {
          res[dept] = {
            ytdActual: a,
            ytdAnterior: b,
            ytdActualNeto: s.ventaCur,
            ytdAnteriorNeto: s.ventaPrev,
            variacion_pct: v,
            status: a === 0 ? 'sin_datos' : v === null ? 'sin_base' : v >= 0 ? 'arriba' : 'abajo',
          }
        }
      }
      return res
    }

    // ── Caso filtrado: single pass sobre sales (acción explícita del usuario) ──
    if (!sales.length) return {}
    const ytdActual: Record<string, number> = {}
    const ytdAnterior: Record<string, number> = {}
    const ytdActualNeto: Record<string, number> = {}
    const ytdAnteriorNeto: Record<string, number> = {}

    let maxSaleDate = new Date(0)
    for (const s of sales) {
      const d = s.fecha instanceof Date ? s.fecha : new Date(s.fecha)
      if (d > maxSaleDate) maxSaleDate = d
    }
    const isCurrentMonth = year === maxSaleDate.getFullYear() && month === maxSaleDate.getMonth()
    const maxDay = maxSaleDate.getDate()
    const isFilterMesCurrent = filterMes !== null && year === maxSaleDate.getFullYear() && filterMes === maxSaleDate.getMonth()
    const ytdTopMonth = month
    const isYtdTopPartial = isCurrentMonth

    for (const s of sales) {
      if (!s.departamento) continue
      const dept = matchDept(s.departamento)
      if (!dept) continue
      const d = s.fecha instanceof Date ? s.fecha : new Date(s.fecha)
      const y = d.getFullYear(), m = d.getMonth(), day = d.getDate()
      if (filterCanal && s.canal !== filterCanal) continue
      if (filterMes !== null) {
        if (y === year && m === filterMes) {
          ytdActual[dept] = (ytdActual[dept] ?? 0) + s.unidades
          ytdActualNeto[dept] = (ytdActualNeto[dept] ?? 0) + (s.venta_neta ?? 0)
        }
        if (y === year - 1 && m === filterMes && (!isFilterMesCurrent || day <= maxDay)) {
          ytdAnterior[dept] = (ytdAnterior[dept] ?? 0) + s.unidades
          ytdAnteriorNeto[dept] = (ytdAnteriorNeto[dept] ?? 0) + (s.venta_neta ?? 0)
        }
      } else {
        if (y === year && m <= ytdTopMonth) {
          ytdActual[dept] = (ytdActual[dept] ?? 0) + s.unidades
          ytdActualNeto[dept] = (ytdActualNeto[dept] ?? 0) + (s.venta_neta ?? 0)
        }
        if (y === year - 1 && m <= ytdTopMonth && (!isYtdTopPartial || m < ytdTopMonth || day <= maxDay)) {
          ytdAnterior[dept] = (ytdAnterior[dept] ?? 0) + s.unidades
          ytdAnteriorNeto[dept] = (ytdAnteriorNeto[dept] ?? 0) + (s.venta_neta ?? 0)
        }
      }
    }

    const res: Record<string, DeptData> = {}
    const all = new Set([...Object.keys(ytdActual), ...Object.keys(ytdAnterior)])
    const useUSDmetric = metricaDept === 'usd'
    all.forEach(dept => {
      const a_uds = ytdActual[dept] ?? 0, b_uds = ytdAnterior[dept] ?? 0
      const a_usd = ytdActualNeto[dept] ?? 0, b_usd = ytdAnteriorNeto[dept] ?? 0
      // R56: seleccionar métrica activa para variacion y orden
      const a = useUSDmetric ? a_usd : a_uds
      const b = useUSDmetric ? b_usd : b_uds
      const v = b > 0 ? Math.round(((a - b) / b) * 100) : null
      res[dept] = {
        ytdActual: a, ytdAnterior: b,
        ytdActualNeto: a_usd, ytdAnteriorNeto: b_usd,
        variacion_pct: v,
        status: a === 0 ? 'sin_datos' : v === null ? 'sin_base' : v >= 0 ? 'arriba' : 'abajo',
      }
    })
    return res
  }, [departamentoSummaries, sales, year, month, filterMes, filterCanal])

  const sorted = useMemo(() =>
    (Object.entries(deptData) as [string, DeptData][])
      .filter(([, d]) => d.ytdActual > 0)
      .sort(([, a], [, b]) => b.ytdActual - a.ytdActual),
  [deptData])

  const total = sorted.reduce((s, [, d]) => s + d.ytdActual, 0)
  const totalAnterior = sorted.reduce((s, [, d]) => s + d.ytdAnterior, 0)
  const totalVar = totalAnterior > 0 ? Math.round(((total - totalAnterior) / totalAnterior) * 100) : null
  const totalNeto = sorted.reduce((s, [, d]) => s + d.ytdActualNeto, 0)
  const totalAnteriorNeto = sorted.reduce((s, [, d]) => s + d.ytdAnteriorNeto, 0)

  const useUSD = metricaDept === 'usd' && dataAvailability.has_venta_neta
  const fmtVal = (uds: number, neto: number) => useUSD ? `${configuracion.moneda}${Math.round(neto).toLocaleString()}` : uds.toLocaleString()

  const sobreAnterior = sorted.filter(([, d]) => d.status === 'arriba').length
  const bajoAnterior = sorted.filter(([, d]) => d.status === 'abajo').length
  const maxV = sorted.length > 0 ? sorted[0].ytdActual : 1

  const hasDeptData = departamentoSummaries.length > 0 || dataAvailability.has_departamento
  const hovData = hovered ? deptData[hovered] : null

  const onEnter = useCallback((k: string) => setHovered(k), [])
  const onLeave = useCallback(() => setHovered(null), [])

  const mesLabel = new Date(year, month).toLocaleDateString('es', { month: 'long' })

  // ── Insight local — instantáneo ──────────────────────────────────────────────
  const generateInsight = useCallback((dept: string) => {
    const data = deptData[dept]
    if (!data) return
    setInsightDept(dept)
    setInsightLoading(false)

    const variacionStr = data.variacion_pct !== null ? `${data.variacion_pct > 0 ? '+' : ''}${data.variacion_pct.toFixed(1)}%` : 'sin referencia'
    const lines: string[] = [`📊 RESUMEN: ${dept} ${data.variacion_pct != null && data.variacion_pct >= 0 ? 'creció' : 'cayó'} ${variacionStr} YoY (${fmtVal(data.ytdActual, data.ytdActualNeto)} vs ${fmtVal(data.ytdAnterior, data.ytdAnteriorNeto)})`]

    // Top vendor insight (same-day-range para comparación justa)
    const maxSD = sales.reduce((max, s) => { const dd = new Date(s.fecha); return dd > max ? dd : max }, new Date(0))
    const isCurrMo = year === maxSD.getFullYear() && month === maxSD.getMonth()
    const mxDay = maxSD.getDate()
    const vendorMap: Record<string, { curr: number; prev: number }> = {}
    sales.filter(s => s.departamento && matchDept(s.departamento) === dept).forEach(s => {
      const sd = new Date(s.fecha)
      const vy = sd.getFullYear(), vm = sd.getMonth(), vday = sd.getDate()
      if (vm > month) return
      const isCurr = vy === year, isPrev = vy === year - 1
      if (!isCurr && !isPrev) return
      // Para año anterior en el mes tope parcial, limitar al mismo día
      if (isPrev && isCurrMo && vm === month && vday > mxDay) return
      if (!vendorMap[s.vendedor]) vendorMap[s.vendedor] = { curr: 0, prev: 0 }
      if (isCurr) vendorMap[s.vendedor].curr += s.unidades
      if (isPrev) vendorMap[s.vendedor].prev += s.unidades
    })
    const vendSorted = Object.entries(vendorMap).sort((a, b) => b[1].curr - a[1].curr)
    const topV = vendSorted[0]
    if (topV) {
      const vp = topV[1].prev > 0 ? Math.round(((topV[1].curr - topV[1].prev) / topV[1].prev) * 100) : 0
      lines.push(`🔺 CRECIMIENTO:\n- Top vendedor: ${topV[0]} con ${topV[1].curr.toLocaleString()} uds (${vp >= 0 ? '+' : ''}${vp}%)`)
    }
    const worstV = vendSorted.filter(([, v]) => v.prev > 0).sort((a, b) => ((a[1].curr - a[1].prev) / a[1].prev) - ((b[1].curr - b[1].prev) / b[1].prev))[0]
    if (worstV && worstV[1].prev > 0) {
      const wp = Math.round(((worstV[1].curr - worstV[1].prev) / worstV[1].prev) * 100)
      if (wp < 0) lines.push(`🔻 CAÍDA:\n- ${worstV[0]} cayó ${Math.abs(wp)}% (${worstV[1].prev.toLocaleString()} → ${worstV[1].curr.toLocaleString()} uds)`)
    }
    const dormidosEnDepto = clientesDormidos.filter(d => sales.some(s => s.cliente === d.cliente && s.departamento && matchDept(s.departamento) === dept))
    if (dormidosEnDepto.length > 0) lines.push(`💡 HALLAZGO: ${dormidosEnDepto.length} cliente${dormidosEnDepto.length > 1 ? 's' : ''} dormido${dormidosEnDepto.length > 1 ? 's' : ''} operaban en ${dept}: ${dormidosEnDepto.slice(0, 2).map(d => d.cliente).join(', ')}`)
    setInsightText(lines.join('\n\n'))
  }, [deptData, sales, year, month, clientesDormidos, useUSD, configuracion])

  // ── Click en mapa — solo selecciona departamento (sin IA) ────────────────
  const handleDeptoClick = useCallback((deptKey: string, data: DeptData) => {
    if (!data) return
    setTimeout(() => aiPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
  }, [])

  // ── Analizar con IA — llamado explícitamente desde botón ─────────────────
  const handleDeptoAnalyze = useCallback((deptKey: string, data: DeptData) => {
    if (!data || data.variacion_pct === null) { setAiExplanation(null); return }
    setTimeout(() => aiPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)

    const ventasDepto = sales.filter(v => v.departamento && matchDept(v.departamento) === deptKey)

    // Same-day-range cap (R56): mismo criterio que la tabla principal
    const maxSD = sales.reduce((max, s) => { const dd = new Date(s.fecha); return dd > max ? dd : max }, new Date(0))
    const isCurrMo = year === maxSD.getFullYear() && month === maxSD.getMonth()
    const mxDay = maxSD.getDate()

    // R61: acumular USD y UDS por separado para cada vendedor/canal
    type VMap = { curr_uds: number; curr_usd: number; prev_uds: number; prev_usd: number }
    const vendorMap: Record<string, VMap> = {}
    const canalMap: Record<string, VMap> = {}
    ventasDepto.forEach(v => {
      const vd = new Date(v.fecha)
      const vy = vd.getFullYear(), vm = vd.getMonth(), vday = vd.getDate()
      if (vm > month) return
      const isCurr = vy === year, isPrev = vy === year - 1
      if (!isCurr && !isPrev) return
      // Cap mismo día para prev en mes parcial (R56)
      if (isPrev && isCurrMo && vm === month && vday > mxDay) return
      const uds = v.unidades || 0
      const usd = v.venta_neta || 0
      if (v.vendedor) {
        if (!vendorMap[v.vendedor]) vendorMap[v.vendedor] = { curr_uds: 0, curr_usd: 0, prev_uds: 0, prev_usd: 0 }
        if (isCurr) { vendorMap[v.vendedor].curr_uds += uds; vendorMap[v.vendedor].curr_usd += usd }
        if (isPrev) { vendorMap[v.vendedor].prev_uds += uds; vendorMap[v.vendedor].prev_usd += usd }
      }
      if (v.canal) {
        if (!canalMap[v.canal]) canalMap[v.canal] = { curr_uds: 0, curr_usd: 0, prev_uds: 0, prev_usd: 0 }
        if (isCurr) { canalMap[v.canal].curr_uds += uds; canalMap[v.canal].curr_usd += usd }
        if (isPrev) { canalMap[v.canal].prev_uds += uds; canalMap[v.canal].prev_usd += usd }
      }
    })

    // Selectors: R61 — subtabla lee la métrica activa de la vista padre
    const getCurr = (m: VMap) => useUSD ? m.curr_usd : m.curr_uds
    const getPrev = (m: VMap) => useUSD ? m.prev_usd : m.prev_uds
    const getVar  = (m: VMap) => { const c = getCurr(m), p = getPrev(m); return p > 0 ? Math.round(((c - p) / p) * 100) : null }
    const fmtM    = (val: number) => useUSD ? `${configuracion.moneda}${Math.round(val).toLocaleString()}` : val.toLocaleString()

    const topVend = Object.entries(vendorMap)
      .sort((a, b) => getCurr(b[1]) - getCurr(a[1])).slice(0, 5)
      .map(([n, v]) => ({ nombre: n, curr: getCurr(v), varPct: getVar(v), riesgo: vendorAnalysis.find(va => va.vendedor === n)?.riesgo ?? 'ok' }))
    const canales = Object.entries(canalMap)
      .map(([c, v]) => ({ canal: c, curr: getCurr(v), varPct: getVar(v) }))
      .sort((a, b) => b.curr - a.curr)

    // Dormant clients in this dept
    const clientesDepto = [...new Set(ventasDepto.map(s => s.cliente).filter(Boolean))]
    const dormidosEnDepto = clientesDormidos.filter(d => clientesDepto.includes(d.cliente)).slice(0, 3)

    const señales: string[] = []
    const vendCriticos = topVend.filter(v => v.riesgo === 'critico' || v.riesgo === 'riesgo')
    if (vendCriticos.length > 0) señales.push(`${vendCriticos.map(v => v.nombre).join(', ')} en estado ${vendCriticos[0].riesgo}`)
    if (dormidosEnDepto.length > 0) señales.push(`${dormidosEnDepto.length} cliente${dormidosEnDepto.length > 1 ? 's' : ''} dormido${dormidosEnDepto.length > 1 ? 's' : ''} en este depto: ${dormidosEnDepto.map(d => d.cliente).join(', ')}`)

    // Top client concentration — R61: respeta métrica activa
    const cliDepto: Record<string, { uds: number; usd: number }> = {}
    ventasDepto.filter(s => new Date(s.fecha).getFullYear() === year && s.cliente).forEach(s => {
      if (!cliDepto[s.cliente!]) cliDepto[s.cliente!] = { uds: 0, usd: 0 }
      cliDepto[s.cliente!].uds += s.unidades || 0
      cliDepto[s.cliente!].usd += s.venta_neta || 0
    })
    const getCliM = (m: { uds: number; usd: number }) => useUSD ? m.usd : m.uds
    const totalDepto = Object.values(cliDepto).reduce((a, b) => a + getCliM(b), 0)
    const topCli = Object.entries(cliDepto).sort((a, b) => getCliM(b[1]) - getCliM(a[1]))[0]
    if (topCli && totalDepto > 0 && (getCliM(topCli[1]) / totalDepto) > 0.25) {
      señales.push(`${topCli[0]} concentra ${Math.round((getCliM(topCli[1]) / totalDepto) * 100)}% de las ventas del depto`)
    }

    const borderColor = data.variacion_pct >= 0 ? 'var(--sf-green)' : 'var(--sf-red)'
    const content = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ padding: '10px 14px', borderLeft: `3px solid ${borderColor}`, background: data.variacion_pct >= 0 ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)', borderRadius: '0 8px 8px 0', fontSize: 13, lineHeight: 1.6, color: 'var(--sf-t2)' }}>
          <strong>{deptKey}</strong> {data.variacion_pct >= 0 ? 'creció' : 'cayó'} {Math.abs(data.variacion_pct).toFixed(1)}% YoY ({fmtVal(data.ytdActual, data.ytdActualNeto)} vs {fmtVal(data.ytdAnterior, data.ytdAnteriorNeto)}).
        </div>
        {topVend.length > 0 && (
          <div style={{ borderRadius: 8, border: '1px solid var(--sf-border)', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px', padding: '6px 12px', background: 'var(--sf-inset)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--sf-t5)' }}>
              <span>Vendedor</span><span style={{ textAlign: 'right' }}>YTD</span><span style={{ textAlign: 'right' }}>Var%</span>
            </div>
            {topVend.map((v, i) => (
              <div key={v.nombre} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px', padding: '6px 12px', fontSize: 12, borderTop: i ? '1px solid var(--sf-border)' : undefined }}>
                <span style={{ color: 'var(--sf-t1)' }}>{v.nombre}</span>
                <span style={{ textAlign: 'right', color: 'var(--sf-t3)', fontFamily: "'DM Mono', monospace" }}>{fmtM(v.curr)}</span>
                <span style={{ textAlign: 'right', fontWeight: 500, color: v.varPct != null ? (v.varPct >= 0 ? 'var(--sf-green)' : 'var(--sf-red)') : 'var(--sf-t4)', fontFamily: "'DM Mono', monospace" }}>{v.varPct != null ? `${v.varPct > 0 ? '+' : ''}${v.varPct}%` : '—'}</span>
              </div>
            ))}
          </div>
        )}
        {canales.length > 0 && (
          <div style={{ borderRadius: 8, border: '1px solid var(--sf-border)', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px', padding: '6px 12px', background: 'var(--sf-inset)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--sf-t5)' }}>
              <span>Canal</span><span style={{ textAlign: 'right' }}>YTD</span><span style={{ textAlign: 'right' }}>Var%</span>
            </div>
            {canales.map((c, i) => (
              <div key={c.canal} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px', padding: '6px 12px', fontSize: 12, borderTop: i ? '1px solid var(--sf-border)' : undefined }}>
                <span style={{ color: 'var(--sf-t1)' }}>{c.canal}</span>
                <span style={{ textAlign: 'right', color: 'var(--sf-t3)', fontFamily: "'DM Mono', monospace" }}>{fmtM(c.curr)}</span>
                <span style={{ textAlign: 'right', fontWeight: 500, color: c.varPct != null ? (c.varPct >= 0 ? 'var(--sf-green)' : 'var(--sf-red)') : 'var(--sf-t4)', fontFamily: "'DM Mono', monospace" }}>{c.varPct != null ? `${c.varPct > 0 ? '+' : ''}${c.varPct}%` : '—'}</span>
              </div>
            ))}
          </div>
        )}
        {señales.length > 0 && señales.map((s, i) => (
          <div key={i} style={{ padding: '8px 12px', background: 'var(--sf-inset)', border: '1px solid var(--sf-border)', borderRadius: 6, fontSize: 12, color: 'var(--sf-t2)' }}>{s}</div>
        ))}
      </div>
    )
    setAiExplanation({ depto: deptKey, varPct: data.variacion_pct, loading: false, text: 'computed', content })
  }, [sales, year, month, vendorAnalysis, clientesDormidos, useUSD, configuracion])

  return (
    <div className="p-6 max-w-[1400px] mx-auto">

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--sf-t1)]">Ventas por Departamento</h1>
          <p style={{ fontSize: '12px', opacity: 0.5, margin: '3px 0 0' }}>
            {filterMes !== null ? `${['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][filterMes]} ${year} · vs ${year - 1}` : `YTD ${year} · vs ${year - 1}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filtro por mes */}
          <SFSelect
            value={filterMes ?? ''}
            onChange={e => setFilterMes(e.target.value === '' ? null : Number(e.target.value))}
          >
            <option value="">YTD (acumulado)</option>
            {mesesDisponibles.map(m => (
              <option key={m} value={m}>{['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][m]}</option>
            ))}
          </SFSelect>
          {/* Filtro por canal */}
          {canalesDisponibles.length > 0 && (
            <SFSelect
              value={filterCanal ?? ''}
              onChange={e => setFilterCanal(e.target.value === '' ? null : e.target.value)}
            >
              <option value="">Todos los canales</option>
              {canalesDisponibles.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </SFSelect>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '8px', fontSize: '12px', border: '1px solid rgba(16,185,129,0.2)' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '2px', background: '#34d399', flexShrink: 0 }} />
            <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: '#34d399' }}>{sobreAnterior}</span>
            <span style={{ color: '#94a3b8' }}>sobre año anterior</span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '8px', fontSize: '12px', border: '1px solid rgba(239,68,68,0.2)' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '2px', background: '#f87171', flexShrink: 0 }} />
            <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: '#f87171' }}>{bajoAnterior}</span>
            <span style={{ color: '#94a3b8' }}>bajo año anterior</span>
          </span>
        </div>
      </div>

      {!hasDeptData ? (
        /* ── Estado vacío ── */
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-[var(--sf-border)] bg-[var(--sf-card)] text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-[var(--sf-inset)] flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8 text-[var(--sf-t5)]">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
            </svg>
          </div>
          <div>
            <p className="text-base font-semibold text-[var(--sf-t1)]">Sin datos de departamento</p>
            <p className="text-sm text-[var(--sf-t5)] mt-1 max-w-sm">
              Agrega una columna <span className="font-mono bg-[var(--sf-inset)] px-1.5 py-0.5 rounded text-xs text-[var(--sf-t2)]">departamento</span> en tu archivo de ventas para ver el mapa de calor.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* ── Panel IA — departamento seleccionado ── */}
          {aiExplanation && (
            <div ref={aiPanelRef} style={{
              background: 'var(--sf-card)',
              border: '1px solid var(--sf-border)',
              borderLeft: `3px solid ${aiExplanation.varPct < 0 ? '#E24B4A' : '#1D9E75'}`,
              borderRadius: '12px',
              padding: '14px 20px',
              marginBottom: '12px',
              display: 'flex',
              gap: '16px',
              alignItems: 'flex-start',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.4, marginBottom: '6px' }}>
                  Análisis IA — {aiExplanation.depto}
                </div>
                {aiExplanation.loading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', opacity: 0.5 }}>
                    <span style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>✦</span>
                    Analizando datos del departamento...
                  </div>
                ) : (
                  aiExplanation.content ? <div>{aiExplanation.content}</div> : <AiStructuredText text={aiExplanation.text ?? ''} />
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button
                  onClick={() => {
                    const displayMessage = `Profundizar: departamento ${aiExplanation.depto}`
                    const fullContext = [
                      `Profundizar sobre departamento: ${aiExplanation.depto}`,
                      aiExplanation.text ? `\nAnálisis previo:\n${aiExplanation.text}` : '',
                      ``,
                      `Con base en este análisis, profundiza: ¿qué vendedores explican el resultado, hay migración de canal, qué productos están cayendo en este departamento?`
                    ].filter(Boolean).join('\n')
                    navigate(dp('/chat'), { state: { prefill: fullContext, displayPrefill: displayMessage, source: 'Departamentos' } })
                  }}
                  style={{
                    background: 'rgba(29,158,117,0.12)', border: '1px solid rgba(29,158,117,0.35)',
                    borderRadius: '8px', padding: '5px 12px', cursor: 'pointer',
                    fontSize: '11px', fontWeight: 500, color: '#1D9E75',
                  }}
                >
                  ✦ Profundizar
                </button>
                <button
                  onClick={() => setAiExplanation(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.3, fontSize: '16px', color: 'inherit' }}
                >
                  ×
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-3 items-start">

            {/* ── Panel del mapa ── */}
            <div style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--sf-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.35 }}>
                  Mapa de calor · El Salvador
                </span>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {[
                    { color: '#1D9E75',               label: 'Sobre anterior' },
                    { color: '#E24B4A',               label: 'Bajo anterior' },
                    { color: 'rgba(255,255,255,0.2)', label: 'Sin datos' },
                  ].map(({ color, label }) => (
                    <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', opacity: 0.6 }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: color, flexShrink: 0 }} />
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ padding: '12px' }}>
                <svg viewBox="0 0 1000 547" className="w-full h-auto" style={{ maxHeight: 480 }}>
                  <defs>
                    <filter id="dept-glow" x="-10%" y="-10%" width="120%" height="120%">
                      <feDropShadow dx="0" dy="0" stdDeviation="4" floodOpacity="0.5" />
                    </filter>
                  </defs>
                  {Object.entries(DEPTS).map(([key, dept]) => {
                    const data = deptData[key]
                    const isHov = hovered === key
                    return (
                      <g
                        key={key}
                        style={{ filter: isHov ? 'url(#dept-glow)' : 'none', cursor: 'pointer' }}
                        onMouseEnter={() => onEnter(key)}
                        onMouseLeave={onLeave}
                        onClick={() => data && handleDeptoClick(key, data)}
                      >
                        <path
                          d={dept.path}
                          fill={heatColor(data, isHov)}
                          stroke={strokeColor(data, isHov)}
                          strokeWidth={isHov ? 1.5 : 0.75}
                          style={{ transition: 'fill 0.18s ease, stroke 0.12s ease' }}
                        />
                        <text
                          x={dept.lx} y={dept.ly - (data?.variacion_pct != null ? 6 : 0)}
                          textAnchor="middle"
                          style={{
                            fontSize: dept.area === 'lg' ? '8.5px' : '7.5px',
                            fontFamily: 'system-ui, sans-serif',
                            fill: isHov ? '#ffffff' : 'rgba(228,228,231,0.9)',
                            fontWeight: isHov ? 700 : 500,
                            pointerEvents: 'none',
                            userSelect: 'none',
                            transition: 'fill 0.15s',
                            paintOrder: 'stroke',
                            stroke: 'rgba(0,0,0,0.5)',
                            strokeWidth: '2px',
                          } as CSSProperties}
                        >
                          {key.split(' ').length > 1
                            ? key.split(' ').map((w, i) => (
                                <tspan key={i} x={dept.lx} dy={i === 0 ? 0 : '1.15em'}>{w}</tspan>
                              ))
                            : key}
                        </text>
                        {data?.variacion_pct != null && (
                          <text
                            x={dept.lx}
                            y={dept.ly + (key.split(' ').length > 1 ? 12 : 7)}
                            textAnchor="middle"
                            style={{
                              fontSize: '7px',
                              fontFamily: 'system-ui, sans-serif',
                              fill: data.status === 'arriba' ? '#34d399' : '#f87171',
                              fontWeight: 700,
                              pointerEvents: 'none',
                              userSelect: 'none',
                              paintOrder: 'stroke',
                              stroke: 'rgba(0,0,0,0.6)',
                              strokeWidth: '2px',
                            } as CSSProperties}
                          >
                            {data.variacion_pct > 0 ? '+' : ''}{data.variacion_pct}%
                          </text>
                        )}
                      </g>
                    )
                  })}
                </svg>
              </div>

              {/* Info panel en hover */}
              <div style={{ borderTop: '1px solid var(--sf-border)', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '42px' }}>
                {hovered && hovData ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, minWidth: '120px' }}>{hovered}</span>
                      <span style={{ fontSize: '12px', opacity: 0.7 }}>{fmtVal(hovData.ytdActual, hovData.ytdActualNeto)}</span>
                      {hovData.ytdAnterior > 0 && (
                        <span style={{ fontSize: '12px', opacity: 0.4 }}>{fmtVal(hovData.ytdAnterior, hovData.ytdAnteriorNeto)}</span>
                      )}
                      {hovData.variacion_pct != null && (
                        <span style={{ fontSize: '13px', fontWeight: 700, color: hovData.status === 'arriba' ? '#1D9E75' : '#E24B4A' }}>
                          {hovData.variacion_pct > 0 ? '+' : ''}{hovData.variacion_pct}%
                        </span>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeptoAnalyze(hovered, hovData) }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        color: '#1D9E75', background: 'rgba(29,158,117,0.06)',
                        border: '1px solid rgba(29,158,117,0.15)', cursor: 'pointer',
                        transition: 'all 0.15s', whiteSpace: 'nowrap',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(29,158,117,0.14)'; e.currentTarget.style.borderColor = 'rgba(29,158,117,0.35)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(29,158,117,0.06)'; e.currentTarget.style.borderColor = 'rgba(29,158,117,0.15)' }}
                    >
                      ✦ IA
                    </button>
                  </>
                ) : (
                  <span style={{ fontSize: '12px', opacity: 0.35, fontStyle: 'italic' }}>Selecciona un departamento en el mapa</span>
                )}
              </div>
            </div>

            {/* ── Ranking lateral ── */}
            <div style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)', borderRadius: '12px', overflow: 'visible' }}>
              {sorted.length === 0 ? (
                <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                  <p style={{ fontSize: '12px', opacity: 0.4 }}>Sin datos para este período</p>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col />
                    <col style={{ width: '90px' }} />
                    <col style={{ width: '80px' }} />
                    <col style={{ width: '72px' }} />
                    <col style={{ width: '100px' }} />
                  </colgroup>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
                    <tr style={{ borderBottom: '1px solid var(--sf-border)', background: 'var(--sf-inset)' }}>
                      <th style={{ padding: '10px 16px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.35, fontWeight: 400, textAlign: 'left', borderLeft: '2px solid #1D9E75' }}>Departamento</th>
                      <th style={{ padding: '10px 12px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.35, fontWeight: 400, textAlign: 'right' }}>{year}</th>
                      <th style={{ padding: '10px 12px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.35, fontWeight: 400, textAlign: 'right' }}>{year - 1}</th>
                      <th style={{ padding: '10px 12px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.35, fontWeight: 400, textAlign: 'right' }}>Var.</th>
                      <th style={{ padding: '10px 8px' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(([dept, data], i) => {
                      const relativeWidth = (data.ytdActual / maxV) * 100
                      const varPct = data.variacion_pct
                      return (
                        <tr
                          key={dept}
                          style={{
                            borderBottom: '1px solid var(--sf-border)',
                            cursor: 'pointer',
                            transition: 'all 150ms',
                            ...(hovered === dept
                              ? { background: 'rgba(56,189,248,0.04)', boxShadow: 'inset 3px 0 0 #38bdf8' }
                              : {}),
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = hovered === dept ? 'rgba(56,189,248,0.04)' : 'var(--sf-hover)'; onEnter(dept); setHoveredRow(dept) }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.boxShadow = 'none'; onLeave(); setHoveredRow(null) }}
                        >
                          <td style={{ padding: '9px 16px', borderLeft: '2px solid rgba(29,158,117,0.15)' }}>
                            <span style={{
                              width: '24px', height: '24px', borderRadius: '6px',
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '11px', fontFamily: 'ui-monospace, monospace', fontWeight: i < 3 ? 700 : 500,
                              marginBottom: '2px',
                              ...(i === 0
                                ? { background: 'linear-gradient(135deg, #fbbf24, #d97706)', color: '#451a03' }
                                : i === 1
                                ? { background: 'linear-gradient(135deg, #cbd5e1, #64748b)', color: '#0f172a' }
                                : i === 2
                                ? { background: 'linear-gradient(135deg, #f97316, #c2410c)', color: '#431407' }
                                : { background: 'var(--sf-inset)', color: 'var(--sf-t5)' }),
                            }}>
                              {i + 1}
                            </span>
                            <div style={{ fontSize: '13px', fontWeight: 500 }}>{dept}</div>
                            <div style={{ width: '85%', height: '4px', background: 'var(--sf-inset)', borderRadius: '9999px', marginTop: '6px' }}>
                              <div style={{
                                width: `${relativeWidth}%`,
                                height: '100%',
                                borderRadius: '9999px',
                                transition: 'all 500ms',
                                background: varPct != null && varPct >= 0
                                  ? 'linear-gradient(90deg, rgba(52,211,153,0.3), rgba(52,211,153,0.55))'
                                  : 'linear-gradient(90deg, rgba(248,113,113,0.3), rgba(248,113,113,0.55))',
                              }} />
                            </div>
                          </td>
                          <td style={{ padding: '9px 12px', fontSize: '13px', fontWeight: 500, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtVal(data.ytdActual, data.ytdActualNeto)}</td>
                          <td style={{ padding: '9px 12px', fontSize: '12px', opacity: 0.4, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {data.ytdAnterior > 0 ? fmtVal(data.ytdAnterior, data.ytdAnteriorNeto) : '—'}
                          </td>
                          <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                            {varPct != null ? (
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontFamily: 'ui-monospace, monospace',
                                fontWeight: 600,
                                fontVariantNumeric: 'tabular-nums',
                                background: varPct >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                                color: varPct >= 0 ? '#34d399' : '#f87171',
                              }}>
                                {varPct > 0 ? '+' : ''}{varPct}%
                              </span>
                            ) : (
                              <span style={{ fontSize: '12px', opacity: 0.3 }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                            {varPct != null && (
                              aiExplanation?.depto === dept && aiExplanation.loading ? (
                                <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--sf-t4)] whitespace-nowrap" style={{ padding: '5px 12px' }}>
                                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                  </svg>
                                  Analizando…
                                </span>
                              ) : (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeptoAnalyze(dept, data) }}
                                  title="Analizar con IA"
                                  style={{
                                    background: 'rgba(29,158,117,0.08)',
                                    border: '1px solid rgba(29,158,117,0.25)',
                                    borderRadius: '8px',
                                    padding: '5px 12px',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    color: '#1D9E75',
                                    transition: 'all 150ms',
                                    lineHeight: 1,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    whiteSpace: 'nowrap',
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(29,158,117,0.18)'; e.currentTarget.style.borderColor = 'rgba(29,158,117,0.45)' }}
                                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(29,158,117,0.08)'; e.currentTarget.style.borderColor = 'rgba(29,158,117,0.25)' }}
                                >
                                  <span style={{ fontSize: '13px' }}>✦</span>
                                  Analizar
                                </button>
                              )
                            )}
                          </td>
                        </tr>
                      )
                    })}
                    <tr style={{ borderTop: '1px solid var(--sf-border)', background: 'rgba(29,158,117,0.06)' }}>
                      <td style={{ padding: '11px 16px', fontSize: '12px', fontWeight: 600, letterSpacing: '0.05em', color: '#1D9E75', borderLeft: '2px solid #1D9E75' }}>TOTAL</td>
                      <td style={{ padding: '11px 12px', fontSize: '13px', fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtVal(total, totalNeto)}</td>
                      <td style={{ padding: '11px 12px', fontSize: '12px', opacity: 0.4, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {totalAnterior > 0 ? fmtVal(totalAnterior, totalAnteriorNeto) : '—'}
                      </td>
                      <td style={{ padding: '11px 12px', fontSize: '12px', fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: totalVar != null ? (totalVar >= 0 ? '#1D9E75' : '#E24B4A') : 'rgba(255,255,255,0.3)' }}>
                        {totalVar != null ? `${totalVar >= 0 ? '+' : ''}${totalVar}%` : '—'}
                      </td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </div>


          {/* ── Caja Insight IA ── */}
          {insightDept && (
            <div style={{ marginTop: '12px', background: 'var(--sf-card)', border: '1px solid var(--sf-border)', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--sf-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="flex items-center gap-2">
                  <span className="text-[#00D68F] text-sm">✦</span>
                  <p className="text-[13px] font-semibold text-[var(--sf-t1)]">
                    Insight IA — {insightDept}
                  </p>
                </div>
                <button
                  onClick={() => { setInsightDept(null); setInsightText('') }}
                  className="text-[var(--sf-t5)] hover:text-[var(--sf-t4)] transition-colors text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="px-5 py-4">
                {insightLoading ? (
                  <p className="text-[13px] text-[var(--sf-t5)] italic">Analizando {insightDept}...</p>
                ) : (
                  <>
                    <AiStructuredText text={insightText} />
                    <div className="mt-4 pt-3.5 border-t border-[var(--sf-border)] flex justify-end">
                      <button
                        onClick={() => {
                          const displayMessage = `Profundizar: departamento ${insightDept}`
                          const fullContext = [
                            `Profundizar sobre departamento: ${insightDept}`,
                            `Ventas YTD ${year}: ${deptData[insightDept]?.ytdActual ?? 0} uds`,
                            insightText ? `\nAnálisis previo:\n${insightText}` : '',
                            ``,
                            `Con base en este análisis, profundiza: ¿qué vendedores explican el resultado, hay migración de canal, qué productos están cayendo en este departamento?`
                          ].filter(Boolean).join('\n')
                          navigate(dp('/chat'), { state: { prefill: fullContext, displayPrefill: displayMessage, source: 'Departamentos' } })
                        }}
                        className="text-[12px] text-[var(--sf-t5)] hover:text-[var(--sf-t2)] transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        Profundizar en Chat IA →
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
