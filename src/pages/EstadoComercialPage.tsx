import { useEffect, useState, useMemo, type FC } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { useAnalysis } from '../lib/useAnalysis'
import { cn } from '../lib/utils'
import type { Insight, InsightTipo, InsightPrioridad, VendorAnalysis } from '../types'
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react'
import { salesInPeriod, prevPeriod } from '../lib/analysis'
import VendedorPanel from '../components/vendedor/VendedorPanel'

const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

type Dimension = 'vendedor' | 'cliente' | 'canal'

// ─── Colores de prioridad ─────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<InsightPrioridad, { badge: string; border: string; dot: string; header: string }> = {
  CRITICA: { badge: 'bg-red-500/15 text-red-400 border-red-500/30',    border: 'border-red-500/20',    dot: 'bg-red-500',    header: 'text-red-400'    },
  ALTA:    { badge: 'bg-orange-500/15 text-orange-400 border-orange-500/30', border: 'border-orange-500/20', dot: 'bg-orange-500', header: 'text-orange-400' },
  MEDIA:   { badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30',  border: 'border-blue-500/20',   dot: 'bg-blue-400',   header: 'text-blue-400'   },
  BAJA:    { badge: 'bg-zinc-700/50 text-zinc-400 border-zinc-600/30',  border: 'border-zinc-700/30',   dot: 'bg-zinc-500',   header: 'text-zinc-500'   },
}

const TIPO_LABELS: Record<InsightTipo, string> = {
  riesgo_vendedor: 'Vendedor', riesgo_cliente: 'Cliente',
  riesgo_producto: 'Producto', riesgo_meta: 'Meta', cruzado: 'Cruzado',
}
const TIPO_ROUTES: Record<InsightTipo, string> = {
  riesgo_vendedor: '/vendedores', riesgo_cliente: '/clientes',
  riesgo_producto: '/rendimiento', riesgo_meta: '/metas', cruzado: '/vendedores',
}

// ─── InsightCard ──────────────────────────────────────────────────────────────

const InsightCard: FC<{ insight: Insight }> = ({ insight }) => {
  const navigate = useNavigate()
  const colors = PRIORITY_COLORS[insight.prioridad]
  return (
    <div className={cn('bg-zinc-900/60 border rounded-xl p-4 space-y-2 hover:bg-zinc-900/80 transition-colors', colors.border)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="text-xl shrink-0 mt-0.5">{insight.emoji}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-zinc-100">{insight.titulo}</span>
              <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border', colors.badge)}>{insight.prioridad}</span>
              <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[9px] font-bold text-zinc-500 uppercase">{TIPO_LABELS[insight.tipo]}</span>
            </div>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{insight.descripcion}</p>
          </div>
        </div>
        <button
          onClick={() => navigate(TIPO_ROUTES[insight.tipo])}
          className="shrink-0 px-3 py-1.5 text-[11px] font-bold text-[#00B894] hover:text-[#00a884] bg-[#00B894]/10 hover:bg-[#00B894]/20 rounded-lg transition-colors whitespace-nowrap"
        >Ver detalle →</button>
      </div>
    </div>
  )
}

// ─── Grupo de alertas contraíble ─────────────────────────────────────────────

const InsightGroup: FC<{ prioridad: InsightPrioridad; items: Insight[] }> = ({ prioridad, items }) => {
  const [expanded, setExpanded] = useState(false)
  if (items.length === 0) return null
  const colors = PRIORITY_COLORS[prioridad]
  const label = prioridad === 'CRITICA' ? 'Críticas' : prioridad === 'ALTA' ? 'Alta prioridad' : prioridad === 'MEDIA' ? 'Media prioridad' : 'Informativas'
  const previewCount = prioridad === 'CRITICA' ? 1 : 0
  const visible = expanded ? items : items.slice(0, previewCount)

  return (
    <div className="space-y-2">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between gap-2 group">
        <div className="flex items-center gap-2">
          <span className={cn('w-2 h-2 rounded-full shrink-0', colors.dot)} />
          <span className={cn('text-xs font-bold uppercase tracking-wider', colors.header)}>{label} ({items.length})</span>
        </div>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400" />}
      </button>
      <div className="space-y-2">{visible.map((i) => <InsightCard key={i.id} insight={i} />)}</div>
      {!expanded && items.length > previewCount && (
        <button onClick={() => setExpanded(true)} className="w-full text-center text-[11px] text-zinc-600 hover:text-zinc-400 py-1 transition-colors">
          Ver {items.length - previewCount} alerta{items.length - previewCount > 1 ? 's' : ''} más ▼
        </button>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function EstadoComercialPage() {
  const navigate = useNavigate()
  useAnalysis()
  const {
    insights, vendorAnalysis, teamStats, dataAvailability,
    configuracion, selectedPeriod, setSelectedPeriod, sales, loadingMessage,
  } = useAppStore()

  const [dimension, setDimension] = useState<Dimension>('vendedor')
  const [vendedorPanel, setVendedorPanel] = useState<VendorAnalysis | null>(null)

  useEffect(() => {
    if (sales.length === 0) navigate('/', { replace: true })
  }, [sales, navigate])

  // ── Chips de mes ───────────────────────────────────────────────────────────
  const maxDate = useMemo(() =>
    sales.reduce((max, s) => { const d = new Date(s.fecha); return d > max ? d : max }, new Date(0)),
  [sales])
  const maxChipMonth = maxDate.getFullYear() === selectedPeriod.year ? maxDate.getMonth() : selectedPeriod.month

  // ── Datos cliente ──────────────────────────────────────────────────────────
  const clienteSummary = useMemo(() => {
    if (!dataAvailability.has_cliente) return []
    const { year, month } = selectedPeriod
    const prev = prevPeriod(year, month)
    const periodS = salesInPeriod(sales, year, month)
    const prevS   = salesInPeriod(sales, prev.year, prev.month)
    const fechaRef = maxDate

    const byCliente: Record<string, { curr: number; prevVal: number; ultima: Date; vendedor: string }> = {}
    periodS.forEach((s) => {
      if (!s.cliente) return
      if (!byCliente[s.cliente]) byCliente[s.cliente] = { curr: 0, prevVal: 0, ultima: new Date(0), vendedor: s.vendedor }
      byCliente[s.cliente].curr += s.unidades
      const d = new Date(s.fecha)
      if (d > byCliente[s.cliente].ultima) { byCliente[s.cliente].ultima = d; byCliente[s.cliente].vendedor = s.vendedor }
    })
    prevS.forEach((s) => {
      if (!s.cliente) return
      if (!byCliente[s.cliente]) byCliente[s.cliente] = { curr: 0, prevVal: 0, ultima: new Date(0), vendedor: s.vendedor }
      byCliente[s.cliente].prevVal += s.unidades
    })

    return Object.entries(byCliente).map(([cliente, d]) => {
      const variacion_pct = d.prevVal > 0 ? ((d.curr - d.prevVal) / d.prevVal) * 100 : null
      const dias = Math.floor((fechaRef.getTime() - d.ultima.getTime()) / 86400000)
      const clasificacion: 'activo' | 'en_riesgo' | 'dormido' =
        dias > configuracion.dias_dormido_threshold ? 'dormido' :
        (variacion_pct !== null && variacion_pct < -20) ? 'en_riesgo' : 'activo'
      return { cliente, curr: d.curr, prevVal: d.prevVal, variacion_pct, dias_sin_actividad: dias, vendedor: d.vendedor, clasificacion }
    }).sort((a, b) => b.curr - a.curr)
  }, [sales, selectedPeriod, dataAvailability.has_cliente, maxDate, configuracion.dias_dormido_threshold])

  // ── Datos canal ────────────────────────────────────────────────────────────
  const canalSummary = useMemo(() => {
    if (!dataAvailability.has_canal) return []
    const { year, month } = selectedPeriod
    const prev = prevPeriod(year, month)
    const periodS = salesInPeriod(sales, year, month)
    const prevS   = salesInPeriod(sales, prev.year, prev.month)
    const total = periodS.reduce((a, s) => a + s.unidades, 0)

    const byCanal: Record<string, { curr: number; prevVal: number; vendedores: Record<string, number>; clientes: Record<string, number> }> = {}
    periodS.forEach((s) => {
      const c = s.canal ?? 'Sin canal'
      if (!byCanal[c]) byCanal[c] = { curr: 0, prevVal: 0, vendedores: {}, clientes: {} }
      byCanal[c].curr += s.unidades
      byCanal[c].vendedores[s.vendedor] = (byCanal[c].vendedores[s.vendedor] ?? 0) + s.unidades
      if (s.cliente) byCanal[c].clientes[s.cliente] = (byCanal[c].clientes[s.cliente] ?? 0) + s.unidades
    })
    prevS.forEach((s) => {
      const c = s.canal ?? 'Sin canal'
      if (!byCanal[c]) byCanal[c] = { curr: 0, prevVal: 0, vendedores: {}, clientes: {} }
      byCanal[c].prevVal += s.unidades
    })

    return Object.entries(byCanal).map(([canal, d]) => {
      const variacion_pct = d.prevVal > 0 ? ((d.curr - d.prevVal) / d.prevVal) * 100 : null
      const topVendedor = Object.entries(d.vendedores).sort(([,a],[,b]) => b-a)[0]?.[0] ?? '—'
      const topCliente  = Object.entries(d.clientes).sort(([,a],[,b]) => b-a)[0]?.[0] ?? '—'
      const pct = total > 0 ? (d.curr / total) * 100 : 0
      return { canal, curr: d.curr, prevVal: d.prevVal, variacion_pct, topVendedor, topCliente, pct }
    }).sort((a, b) => b.curr - a.curr)
  }, [sales, selectedPeriod, dataAvailability.has_canal])

  const [analysisStep, setAnalysisStep] = useState(0)
  useEffect(() => {
    if (teamStats) return
    if (sales.length === 0) return
    const steps = [
      setTimeout(() => setAnalysisStep(1), 200),
      setTimeout(() => setAnalysisStep(2), 800),
      setTimeout(() => setAnalysisStep(3), 1600),
      setTimeout(() => setAnalysisStep(4), 2400),
    ]
    return () => steps.forEach(clearTimeout)
  }, [teamStats, sales.length])

  if (!teamStats) {
    if (sales.length === 0) return null // el useEffect redirige a /cargar

    const STEPS = [
      { label: 'Agrupando vendedores', pct: 20 },
      { label: 'Calculando ventas por período', pct: 40 },
      { label: 'Detectando rachas y riesgos', pct: 65 },
      { label: 'Generando insights', pct: 85 },
      { label: 'Finalizando...', pct: 95 },
    ]
    const current = STEPS[Math.min(analysisStep, STEPS.length - 1)]

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/90 backdrop-blur-sm">
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-10 max-w-sm w-full mx-4 shadow-2xl flex flex-col items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-[#00B894]/10 border border-[#00B894]/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-[#00B894] animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          </div>
          <div className="text-center space-y-1">
            <h3 className="text-lg font-bold text-zinc-50">Analizando ventas...</h3>
            <p className="text-xs text-zinc-400 min-h-[1.2rem]">{loadingMessage || current.label}</p>
          </div>
          <div className="w-full space-y-3">
            <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
              <div
                className="h-2 bg-[#00B894] rounded-full transition-all duration-700"
                style={{ width: `${current.pct}%` }}
              />
            </div>
            <div className="space-y-1.5">
              {STEPS.slice(0, -1).map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors duration-300 ${i < analysisStep ? 'bg-[#00B894]' : i === analysisStep ? 'bg-[#00B894] animate-pulse' : 'bg-zinc-700'}`} />
                  <span className={i <= analysisStep ? 'text-zinc-300' : 'text-zinc-600'}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-zinc-600">
            {sales.length.toLocaleString()} registros · esto puede tomar unos segundos
          </p>
        </div>
      </div>
    )
  }

  const criticos = vendorAnalysis.filter((v) => v.riesgo === 'critico').length
  const enRiesgo = vendorAnalysis.filter((v) => v.riesgo === 'riesgo').length
  const ok       = vendorAnalysis.filter((v) => v.riesgo === 'ok' || v.riesgo === 'superando').length
  const vendedorCriticoObj = vendorAnalysis.find((v) => v.vendedor === teamStats.vendedor_critico)

  const ytdVar  = teamStats.variacion_ytd_equipo
  const ytdAnno = maxDate.getFullYear()

  const mesLabel = new Date(selectedPeriod.year, selectedPeriod.month, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })

  // Insights filtrados por dimensión
  const insightsByDim = dimension === 'vendedor'
    ? insights
    : dimension === 'cliente'
      ? insights.filter((i) => i.tipo === 'riesgo_cliente' || i.tipo === 'cruzado')
      : insights.filter((i) => i.tipo === 'cruzado' || i.tipo === 'riesgo_vendedor')

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">

      {/* VendedorPanel */}
      {vendedorPanel && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setVendedorPanel(null)} />
          <VendedorPanel
            vendedor={vendedorPanel}
            insights={insights}
            sales={sales}
            selectedPeriod={selectedPeriod}
            allVendorAnalysis={vendorAnalysis}
            onClose={() => setVendedorPanel(null)}
          />
        </>
      )}

      {/* Título */}
      <div>
        <h1 className="text-3xl font-bold text-zinc-50 tracking-tight">Estado Comercial</h1>
        <p className="text-zinc-500 mt-1">
          {configuracion.empresa} · {mesLabel} · {teamStats.dias_transcurridos} días de {teamStats.dias_totales}
        </p>
      </div>

      {/* Chips de mes */}
      <div className="flex flex-wrap gap-2">
        {MESES_CORTO.slice(0, maxChipMonth + 1).map((m, idx) => (
          <button
            key={idx}
            onClick={() => setSelectedPeriod({ year: selectedPeriod.year, month: idx })}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-bold border transition-all',
              selectedPeriod.month === idx
                ? 'bg-[#00B894] border-[#00B894] text-black'
                : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
            )}
          >{m}</button>
        ))}
      </div>

      {/* YTD Hero */}
      <section className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-2">YTD {ytdAnno} vs {ytdAnno - 1}</p>
        <div className="flex items-center gap-4">
          {ytdVar == null ? (
            <p className="text-5xl font-black text-zinc-600">—</p>
          ) : (
            <>
              {ytdVar >= 0 ? <TrendingUp className="w-10 h-10 text-[#00B894] shrink-0" /> : <TrendingDown className="w-10 h-10 text-red-400 shrink-0" />}
              <p className={cn('text-5xl font-black leading-none', ytdVar >= 0 ? 'text-[#00B894]' : 'text-red-400')}>
                {ytdVar >= 0 ? '+' : ''}{ytdVar.toFixed(1)}%
              </p>
            </>
          )}
          <div className="ml-2">
            <p className="text-sm text-zinc-400">{(teamStats.ytd_actual_equipo ?? 0).toLocaleString()} uds acumuladas en {ytdAnno}</p>
            <p className="text-xs text-zinc-600">vs {(teamStats.ytd_anterior_equipo ?? 0).toLocaleString()} uds en {ytdAnno - 1}</p>
          </div>
        </div>
      </section>

      {/* Tabs de dimensión */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
        {(['vendedor', 'cliente', 'canal'] as Dimension[])
          .filter((d) => d !== 'canal' || dataAvailability.has_canal)
          .filter((d) => d !== 'cliente' || dataAvailability.has_cliente)
          .map((d) => (
            <button
              key={d}
              onClick={() => setDimension(d)}
              className={cn(
                'px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition-all',
                dimension === d ? 'bg-[#00B894] text-black' : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              {d === 'vendedor' ? 'Vendedor' : d === 'cliente' ? 'Cliente' : 'Canal'}
            </button>
          ))}
      </div>

      {/* ── DIMENSIÓN: VENDEDOR ───────────────────────────────────────────── */}
      {dimension === 'vendedor' && (
        <>
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5 cursor-pointer hover:bg-red-500/10 transition-colors"
              onClick={() => vendedorCriticoObj && setVendedorPanel(vendedorCriticoObj)}
            >
              <div className="flex items-center gap-2 mb-3"><span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" /><span className="text-xs font-bold text-red-400 uppercase tracking-wider">Crítico</span></div>
              <div className="text-4xl font-black text-red-400">{criticos}</div>
              <div className="text-sm text-zinc-500 mt-1">{criticos === 1 ? 'vendedor' : 'vendedores'} en riesgo crítico</div>
              {teamStats.vendedor_critico && <div className="mt-3 text-xs text-red-400/70 font-medium">Más crítico: {teamStats.vendedor_critico} →</div>}
            </div>
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" /><span className="text-xs font-bold text-amber-400 uppercase tracking-wider">En Riesgo</span></div>
              <div className="text-4xl font-black text-amber-400">{enRiesgo}</div>
              <div className="text-sm text-zinc-500 mt-1">{enRiesgo === 1 ? 'vendedor' : 'vendedores'} bajo observación</div>
            </div>
            <div className="bg-[#00B894]/5 border border-[#00B894]/20 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3"><span className="w-2.5 h-2.5 rounded-full bg-[#00B894] shrink-0" /><span className="text-xs font-bold text-[#00B894] uppercase tracking-wider">OK</span></div>
              <div className="text-4xl font-black text-[#00B894]">{ok}</div>
              <div className="text-sm text-zinc-500 mt-1">{ok === 1 ? 'vendedor' : 'vendedores'} en rango normal</div>
              <div className="mt-3 text-xs text-[#00B894]/70 font-medium">Mejor: {teamStats.mejor_vendedor}</div>
            </div>
          </section>

          <section className="flex flex-wrap gap-3">
            {dataAvailability.has_cliente && (
              <button onClick={() => navigate('/clientes')} className={cn('px-4 py-2 rounded-xl text-xs font-bold border transition-all', teamStats.clientes_dormidos_count > 0 ? 'bg-orange-500/10 border-orange-500/30 text-orange-400 hover:bg-orange-500/20' : 'bg-zinc-900 border-zinc-800 text-zinc-500')}>
                😴 {teamStats.clientes_dormidos_count} clientes dormidos
              </button>
            )}
            {dataAvailability.has_producto && (
              <div className={cn('px-4 py-2 rounded-xl text-xs font-bold border', teamStats.productos_sin_movimiento_count > 0 ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-zinc-900 border-zinc-800 text-zinc-500')}>
                📦 {teamStats.productos_sin_movimiento_count} productos sin movimiento
              </div>
            )}
            {dataAvailability.has_cliente && teamStats.riesgos_concentracion_count > 0 && (
              <button onClick={() => navigate('/clientes')} className="px-4 py-2 rounded-xl text-xs font-bold border bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all">
                🎯 {teamStats.riesgos_concentracion_count} clientes = {'>'}50% de ventas
              </button>
            )}
          </section>

          {dataAvailability.has_metas && teamStats.meta_equipo && teamStats.proyeccion_equipo !== undefined && (
            <section className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-zinc-300">Proyección del equipo vs. meta</span>
                <span className={cn('text-sm font-black', (teamStats.cumplimiento_equipo ?? 0) >= 100 ? 'text-[#00B894]' : (teamStats.cumplimiento_equipo ?? 0) >= 90 ? 'text-amber-400' : 'text-red-400')}>
                  {(teamStats.cumplimiento_equipo ?? 0).toFixed(1)}%
                </span>
              </div>
              <div className="h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                <div className={cn('h-full rounded-full transition-all duration-700', (teamStats.cumplimiento_equipo ?? 0) >= 100 ? 'bg-[#00B894]' : (teamStats.cumplimiento_equipo ?? 0) >= 90 ? 'bg-amber-500' : 'bg-red-500')} style={{ width: `${Math.min(teamStats.cumplimiento_equipo ?? 0, 100)}%` }} />
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>Proyección: {teamStats.proyeccion_equipo.toLocaleString()} uds</span>
                <span>Meta: {teamStats.meta_equipo.toLocaleString()} uds</span>
              </div>
            </section>
          )}
        </>
      )}

      {/* ── DIMENSIÓN: CLIENTE ────────────────────────────────────────────── */}
      {dimension === 'cliente' && (
        <>
          {/* Semáforo clientes */}
          <section className="grid grid-cols-3 gap-4">
            {([
              { key: 'activo',   label: 'Activos',    cls: 'bg-[#00B894]/5 border-[#00B894]/20 text-[#00B894]' },
              { key: 'en_riesgo',label: 'En riesgo',  cls: 'bg-amber-500/5 border-amber-500/20 text-amber-400' },
              { key: 'dormido',  label: 'Dormidos',   cls: 'bg-red-500/5 border-red-500/20 text-red-400' },
            ] as const).map(({ key, label, cls }) => {
              const count = clienteSummary.filter((c) => c.clasificacion === key).length
              return (
                <div key={key} className={cn('border rounded-2xl p-5', cls)}>
                  <div className="text-xs font-bold uppercase tracking-wider mb-3">{label}</div>
                  <div className="text-4xl font-black">{count}</div>
                  <div className="text-sm text-zinc-500 mt-1">{count === 1 ? 'cliente' : 'clientes'}</div>
                </div>
              )
            })}
          </section>

          {/* Tabla de clientes */}
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-zinc-900/60 text-zinc-600 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-5 py-3">Cliente</th>
                    <th className="px-4 py-3">Vendedor</th>
                    <th className="px-4 py-3 text-right">Ventas</th>
                    <th className="px-4 py-3 text-right">Var %</th>
                    <th className="px-4 py-3 text-right">Días inactivo</th>
                    <th className="px-4 py-3 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {clienteSummary.slice(0, 50).map((c) => (
                    <tr key={c.cliente} className="hover:bg-zinc-900/40 transition-colors">
                      <td className="px-5 py-3 font-bold text-zinc-200">{c.cliente}</td>
                      <td className="px-4 py-3 text-zinc-400">{c.vendedor}</td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-300">{c.curr.toLocaleString()}</td>
                      <td className={cn('px-4 py-3 text-right font-bold', c.variacion_pct == null ? 'text-zinc-600' : c.variacion_pct >= 0 ? 'text-[#00B894]' : 'text-red-400')}>
                        {c.variacion_pct == null ? '—' : `${c.variacion_pct >= 0 ? '+' : ''}${c.variacion_pct.toFixed(1)}%`}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-400">{c.dias_sin_actividad}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn('px-2 py-0.5 rounded text-[9px] font-bold uppercase',
                          c.clasificacion === 'activo' ? 'bg-[#00B894]/15 text-[#00B894]' :
                          c.clasificacion === 'en_riesgo' ? 'bg-amber-500/15 text-amber-400' :
                          'bg-red-500/15 text-red-400'
                        )}>
                          {c.clasificacion === 'activo' ? 'activo' : c.clasificacion === 'en_riesgo' ? 'en riesgo' : 'dormido'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {clienteSummary.length > 50 && (
                <p className="text-center text-xs text-zinc-600 py-3">Mostrando 50 de {clienteSummary.length} clientes</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── DIMENSIÓN: CANAL ──────────────────────────────────────────────── */}
      {dimension === 'canal' && (
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-zinc-900/60 text-zinc-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-5 py-3">Canal</th>
                  <th className="px-4 py-3 text-right">Ventas</th>
                  <th className="px-4 py-3 text-right">Var %</th>
                  <th className="px-4 py-3 text-right">% del total</th>
                  <th className="px-4 py-3">Top vendedor</th>
                  <th className="px-4 py-3">Top cliente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {canalSummary.map((c) => (
                  <tr key={c.canal} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="px-5 py-3 font-bold text-zinc-200">{c.canal}</td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-300">{c.curr.toLocaleString()}</td>
                    <td className={cn('px-4 py-3 text-right font-bold', c.variacion_pct == null ? 'text-zinc-600' : c.variacion_pct >= 0 ? 'text-[#00B894]' : 'text-red-400')}>
                      {c.variacion_pct == null ? '—' : `${c.variacion_pct >= 0 ? '+' : ''}${c.variacion_pct.toFixed(1)}%`}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-400">{c.pct.toFixed(1)}%</td>
                    <td className="px-4 py-3 text-zinc-400">{c.topVendedor}</td>
                    <td className="px-4 py-3 text-zinc-400">{c.topCliente}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ALERTAS ACTIVAS ───────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-100">Alertas activas</h2>
          <span className="text-xs text-zinc-500 font-medium">{insightsByDim.length} detectadas</span>
        </div>
        {insightsByDim.length === 0 ? (
          <div className="bg-[#00B894]/5 border border-[#00B894]/20 rounded-2xl p-10 text-center">
            <div className="text-4xl mb-3">✅</div>
            <p className="text-zinc-200 font-bold">Sin alertas activas</p>
            <p className="text-zinc-500 text-sm mt-1">El equipo está operando dentro de los rangos normales.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <InsightGroup prioridad="CRITICA" items={insightsByDim.filter((i) => i.prioridad === 'CRITICA')} />
            <InsightGroup prioridad="ALTA"    items={insightsByDim.filter((i) => i.prioridad === 'ALTA')} />
            <InsightGroup prioridad="MEDIA"   items={insightsByDim.filter((i) => i.prioridad === 'MEDIA')} />
            <InsightGroup prioridad="BAJA"    items={insightsByDim.filter((i) => i.prioridad === 'BAJA')} />
          </div>
        )}
      </section>

    </div>
  )
}
