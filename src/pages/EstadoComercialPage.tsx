import { useEffect, useState, useMemo, type FC } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { useAnalysis } from '../lib/useAnalysis'
import { cn } from '../lib/utils'
import type { Insight, InsightTipo, InsightPrioridad, VendorAnalysis, ClienteDormido } from '../types'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { salesInPeriod, prevPeriod } from '../lib/analysis'
import VendedorPanel from '../components/vendedor/VendedorPanel'

const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

type Dimension = 'vendedor' | 'cliente' | 'canal' | 'producto'
type ActiveChip = 'dormidos' | 'sinMovimiento' | 'concentracion' | null

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

const InsightCard: FC<{ insight: Insight; hasVentaNeta: boolean; moneda: string; onVerDetalle: (i: Insight) => void }> = ({ insight, hasVentaNeta, moneda, onVerDetalle }) => {
  const colors = PRIORITY_COLORS[insight.prioridad]
  const ie = insight.impacto_economico
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
            {hasVentaNeta && ie && (
              <span className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border mt-1.5',
                ie.tipo === 'perdida'     ? 'bg-red-500/15 text-red-400 border-red-500/30' :
                ie.tipo === 'riesgo'      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' :
                                            'bg-[#00B894]/15 text-[#00B894] border-[#00B894]/30'
              )}>
                {ie.tipo === 'perdida' ? '↓' : ie.tipo === 'riesgo' ? '⚠' : '↑'}
                {' '}{moneda} {ie.valor.toLocaleString(undefined, { maximumFractionDigits: 0 })} — {ie.descripcion}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => onVerDetalle(insight)}
          className="shrink-0 px-3 py-1.5 text-[11px] font-bold text-[#00B894] hover:text-[#00a884] bg-[#00B894]/10 hover:bg-[#00B894]/20 rounded-lg transition-colors whitespace-nowrap"
        >Ver detalle →</button>
      </div>
    </div>
  )
}

// ─── Grupo de alertas contraíble ─────────────────────────────────────────────

const InsightGroup: FC<{ prioridad: InsightPrioridad; items: Insight[]; hasVentaNeta: boolean; moneda: string; onVerDetalle: (i: Insight) => void }> = ({ prioridad, items, hasVentaNeta, moneda, onVerDetalle }) => {
  const [expanded, setExpanded] = useState(false)
  if (items.length === 0) return null
  const colors = PRIORITY_COLORS[prioridad]
  const label = prioridad === 'CRITICA' ? 'Críticas' : prioridad === 'ALTA' ? 'Alta prioridad' : prioridad === 'MEDIA' ? 'Media prioridad' : 'Informativas'
  const previewCount = prioridad === 'CRITICA' ? 3 : 0
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
      <div className="space-y-2">{visible.map((i) => <InsightCard key={i.id} insight={i} hasVentaNeta={hasVentaNeta} moneda={moneda} onVerDetalle={onVerDetalle} />)}</div>
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
    clientesDormidos, concentracionRiesgo, categoriasInventario,
  } = useAppStore()

  const [dimension, setDimension] = useState<Dimension>('vendedor')
  const [vendedorPanel, setVendedorPanel] = useState<VendorAnalysis | null>(null)
  const [activeChip, setActiveChip] = useState<ActiveChip>(null)
  const [showAllAlertas, setShowAllAlertas] = useState(false)

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

  // ── Datos producto ─────────────────────────────────────────────────────────
  const productoSummary = useMemo(() => {
    if (!dataAvailability.has_producto) return []
    const { year, month } = selectedPeriod
    const prev = prevPeriod(year, month)
    const map = new Map<string, { producto: string; ventas: number; ventas_prev: number; unidades: number }>()
    sales.forEach(s => {
      if (!s.producto) return
      const anio = s.fecha.getFullYear()
      const mes = s.fecha.getMonth()
      const esPeriodo = anio === year && mes === month
      const esPrev = anio === prev.year && mes === prev.month
      if (!esPeriodo && !esPrev) return
      const cur = map.get(s.producto) ?? { producto: s.producto, ventas: 0, ventas_prev: 0, unidades: 0 }
      if (esPeriodo) { cur.ventas += s.venta_neta ?? 0; cur.unidades += s.unidades }
      if (esPrev) cur.ventas_prev += s.venta_neta ?? s.unidades
      map.set(s.producto, cur)
    })
    return [...map.values()].sort((a, b) => b.unidades - a.unidades)
  }, [sales, selectedPeriod, dataAvailability.has_producto])

  // ── Estado del mes (vs histórico mismo mes años anteriores) ────────────────
  const estadoMes = useMemo(() => {
    const { year, month } = selectedPeriod
    const diasTranscurridos = teamStats?.dias_transcurridos ?? 1
    const diasTotales       = teamStats?.dias_totales ?? 30

    const actual         = salesInPeriod(sales, year, month).reduce((a, s) => a + s.unidades, 0)
    const ingreso_actual = salesInPeriod(sales, year, month).reduce((a, s) => a + (s.venta_neta ?? 0), 0)

    // Promedio del mismo mes en hasta 3 años anteriores
    const referenciasAnuales: number[] = []
    for (let i = 1; i <= 3; i++) {
      const records = salesInPeriod(sales, year - i, month)
      if (records.length > 0)
        referenciasAnuales.push(records.reduce((a, s) => a + s.unidades, 0))
    }

    const historico_mes = referenciasAnuales.length > 0
      ? Math.round(referenciasAnuales.reduce((a, b) => a + b, 0) / referenciasAnuales.length)
      : 0

    const esperado_a_fecha = diasTotales > 0 && historico_mes > 0
      ? Math.round(historico_mes * (diasTranscurridos / diasTotales))
      : 0

    const gap     = esperado_a_fecha > 0 ? actual - esperado_a_fecha : null
    const gap_pct = esperado_a_fecha > 0
      ? Math.round(((actual - esperado_a_fecha) / esperado_a_fecha) * 100)
      : null

    const ritmo_diario      = diasTranscurridos > 0 ? actual / diasTranscurridos : 0
    const proyeccion_cierre = Math.round(ritmo_diario * diasTotales)

    const ratio = esperado_a_fecha > 0 ? actual / esperado_a_fecha : null
    const estado: 'adelantado' | 'en_linea' | 'atrasado' | 'sin_base' =
      ratio === null  ? 'sin_base'
      : ratio >= 1.05 ? 'adelantado'
      : ratio >= 0.85 ? 'en_linea'
      : 'atrasado'

    const pctAbs     = Math.abs(gap_pct ?? 0)
    const fraseValida = esperado_a_fecha > 50 && pctAbs < 500

    const frase = fraseValida ? ({
      adelantado: `El mes va ${pctAbs}% por encima del ritmo histórico.`,
      en_linea:   `El mes avanza en línea con el ritmo histórico.`,
      atrasado:   `El mes va ${pctAbs}% por debajo del ritmo histórico.`,
      sin_base:   '',
    } as Record<string, string>)[estado] ?? '' : ''

    const frase_proyeccion = fraseValida && historico_mes > 0
      ? proyeccion_cierre >= historico_mes
        ? `La proyección al ritmo actual indica un cierre ${Math.round(((proyeccion_cierre - historico_mes) / historico_mes) * 100)}% superior al promedio histórico del mes.`
        : `La proyección al ritmo actual indica un cierre ${Math.round(((historico_mes - proyeccion_cierre) / historico_mes) * 100)}% inferior al promedio histórico del mes.`
      : ''

    return {
      actual, ingreso_actual, esperado_a_fecha, historico_mes,
      gap, gap_pct, proyeccion_cierre, estado,
      frase, frase_proyeccion,
      anos_base: referenciasAnuales.length,
      diasTranscurridos, diasTotales,
    }
  }, [sales, selectedPeriod, teamStats])

  // ── Causas del atraso ────────────────────────────────────────────────────────
  const causasAtraso = useMemo(() => {
    if (estadoMes.estado !== 'atrasado' || estadoMes.anos_base === 0) return []
    const { year, month } = selectedPeriod

    const causas: Array<{ dimension: 'canal' | 'vendedor'; label: string; caida_pct: number; impacto_uds: number }> = []

    if (dataAvailability.has_canal) {
      const canalesActual = new Map<string, number>()
      const canalesSuma   = new Map<string, number>()
      const canalesConteo = new Map<string, number>()

      sales.forEach(s => {
        if (!s.canal) return
        const d = new Date(s.fecha)
        if (d.getFullYear() === year && d.getMonth() === month) {
          canalesActual.set(s.canal, (canalesActual.get(s.canal) ?? 0) + s.unidades)
        }
      })

      for (let i = 1; i <= 3; i++) {
        const recordsAnio = sales.filter(s => {
          if (!s.canal) return false
          const d = new Date(s.fecha)
          return d.getFullYear() === year - i && d.getMonth() === month
        })
        const canalesEnAnio = new Set(recordsAnio.map(s => s.canal as string))
        canalesEnAnio.forEach(canal => {
          canalesConteo.set(canal, (canalesConteo.get(canal) ?? 0) + 1)
        })
        recordsAnio.forEach(s => {
          canalesSuma.set(s.canal!, (canalesSuma.get(s.canal!) ?? 0) + s.unidades)
        })
      }

      canalesActual.forEach((actual, canal) => {
        const suma   = canalesSuma.get(canal) ?? 0
        const conteo = canalesConteo.get(canal) ?? 0
        if (conteo === 0) return
        const hist = suma / conteo
        if (hist > 0 && actual < hist * 0.7) {
          causas.push({
            dimension: 'canal',
            label: canal,
            caida_pct: Math.round(((actual - hist) / hist) * 100),
            impacto_uds: Math.round(hist - actual),
          })
        }
      })
    }

    vendorAnalysis
      .filter(v => v.variacion_vs_promedio_pct != null && v.variacion_vs_promedio_pct < -30 && (v.periodos_base_promedio ?? 0) >= 2)
      .sort((a, b) => (a.variacion_vs_promedio_pct ?? 0) - (b.variacion_vs_promedio_pct ?? 0))
      .slice(0, 3)
      .forEach(v => {
        const impacto = v.promedio_3m
          ? Math.round(v.promedio_3m * Math.abs((v.variacion_vs_promedio_pct ?? 0) / 100))
          : 0
        if (impacto > 0) {
          causas.push({ dimension: 'vendedor', label: v.vendedor, caida_pct: v.variacion_vs_promedio_pct ?? 0, impacto_uds: impacto })
        }
      })

    return causas.sort((a, b) => b.impacto_uds - a.impacto_uds).slice(0, 3)
  }, [estadoMes, sales, selectedPeriod, vendorAnalysis, dataAvailability])

  // ── Focos de riesgo críticos ──────────────────────────────────────────────────
  const focosRiesgo = useMemo(() =>
    insights.filter(i => i.prioridad === 'CRITICA' && i.impacto_economico).slice(0, 3),
  [insights])

  // ── Recomendación prioritaria ─────────────────────────────────────────────────
  const recomendacionPrincipal = useMemo(() => {
    const primerFoco = focosRiesgo[0]?.id
    return insights
      .filter(i => i.accion_sugerida && i.impacto_economico?.valor && i.id !== primerFoco)
      .sort((a, b) => (b.impacto_economico?.valor ?? 0) - (a.impacto_economico?.valor ?? 0))[0] ?? null
  }, [insights, focosRiesgo])

  // ── Resumen ejecutivo automático ─────────────────────────────────────────────
  const resumenEjecutivo = useMemo(() => {
    const bullets: string[] = []

    if (estadoMes.estado !== 'sin_base' && estadoMes.frase)
      bullets.push(estadoMes.frase)

    if (estadoMes.estado === 'atrasado' && causasAtraso.length > 0) {
      const principal = causasAtraso[0]
      const dim = principal.dimension === 'canal' ? 'canal' : 'vendedor'
      bullets.push(`El atraso se explica principalmente por caída en ${dim} ${principal.label} (${Math.abs(principal.caida_pct)}% menos que el histórico).`)
    } else if (estadoMes.estado === 'adelantado' && vendorAnalysis.length > 0) {
      const mejor = vendorAnalysis.filter(v => v.riesgo === 'superando').length
      if (mejor > 0)
        bullets.push(`${mejor} vendedor${mejor > 1 ? 'es están' : ' está'} superando meta este mes.`)
    }

    const nCriticos = vendorAnalysis.filter(v => v.riesgo === 'critico').length
    const nTotal = vendorAnalysis.length
    if (nCriticos > 0)
      bullets.push(`${nCriticos} de ${nTotal} vendedor${nCriticos > 1 ? 'es presentan' : ' presenta'} riesgo crítico.`)

    const nDormidos = clientesDormidos.length
    if (nDormidos > 0) {
      const recuperables = clientesDormidos.filter(c => c.recovery_label === 'alta' || c.recovery_label === 'recuperable').length
      bullets.push(recuperables > 0
        ? `${nDormidos.toLocaleString()} clientes sin actividad — ${recuperables} con alta probabilidad de recuperación.`
        : `${nDormidos.toLocaleString()} clientes sin actividad en el período.`)
    } else if (concentracionRiesgo.length > 0) {
      const top = concentracionRiesgo[0]
      bullets.push(`${top.cliente} concentra el ${top.pct_del_total.toFixed(0)}% de las ventas — riesgo de concentración activo.`)
    }

    return bullets.slice(0, 4)
  }, [estadoMes, causasAtraso, vendorAnalysis, clientesDormidos, concentracionRiesgo])

  // ── Frase narrativa compuesta ─────────────────────────────────────────────────
  const fraseNarrativa = useMemo(() => {
    const partes: string[] = []
    if (estadoMes.frase) partes.push(estadoMes.frase)
    if (estadoMes.frase_proyeccion) partes.push(estadoMes.frase_proyeccion)
    if (estadoMes.estado === 'atrasado' && causasAtraso.length > 0) {
      const nombres = causasAtraso.slice(0, 2).map(c => c.label)
      const listaTexto = nombres.length === 1 ? nombres[0] : `${nombres[0]} y ${nombres[1]}`
      partes.push(`El atraso se explica principalmente por caídas en ${listaTexto}.`)
    }
    return partes.join(' ')
  }, [estadoMes, causasAtraso])

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
      : dimension === 'producto'
        ? insights.filter((i) => i.tipo === 'riesgo_producto')
        : insights.filter((i) => i.tipo === 'cruzado' || i.tipo === 'riesgo_vendedor')

  // Callback: abre VendedorPanel si hay vendedor, navega si no
  const handleVerDetalle = (insight: Insight) => {
    if (insight.vendedor) {
      const v = vendorAnalysis.find(va => va.vendedor === insight.vendedor)
      if (v) { setVendedorPanel(v); return }
    }
    navigate(TIPO_ROUTES[insight.tipo])
  }

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
            clientesDormidos={clientesDormidos}
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

      {/* Resumen ejecutivo */}
      {resumenEjecutivo.length > 0 && (() => {
        const bullet0Color =
          estadoMes.estado === 'adelantado' ? '#00B894'
          : estadoMes.estado === 'en_linea' ? '#F59E0B'
          : estadoMes.estado === 'atrasado' ? '#F87171'
          : '#71717a'
        return (
          <div className="px-4 py-3.5 rounded-xl border border-zinc-800 bg-zinc-900/50">
            <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-600 mb-2">Resumen ejecutivo</p>
            <ul className="space-y-1.5 list-none p-0 m-0">
              {resumenEjecutivo.map((bullet, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-zinc-300 leading-relaxed">
                  <span
                    className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: i === 0 ? bullet0Color : i === 1 ? '#F59E0B' : '#71717a' }}
                  />
                  {bullet}
                </li>
              ))}
            </ul>
          </div>
        )
      })()}

      {/* 4 KPIs ejecutivos — orden: Estado | Proyección | Avance | YTD */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* CARD 1 — Estado del mes */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 flex flex-col items-center justify-center text-center gap-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 self-start">Estado del mes</p>
          {estadoMes.estado === 'adelantado' && (
            <span className="px-6 py-3 rounded-xl bg-[#00B894]/20 text-[#00B894] font-bold text-lg border border-[#00B894]/30">ADELANTADO</span>
          )}
          {estadoMes.estado === 'en_linea' && (
            <span className="px-6 py-3 rounded-xl bg-amber-500/20 text-amber-300 font-bold text-lg border border-amber-500/30">EN LÍNEA</span>
          )}
          {estadoMes.estado === 'atrasado' && (
            <span className="px-6 py-3 rounded-xl bg-red-500/20 text-red-400 font-bold text-lg border border-red-500/30">ATRASADO</span>
          )}
          {estadoMes.estado === 'sin_base' && (
            <span className="px-6 py-3 rounded-xl bg-zinc-800 text-zinc-500 font-bold text-lg border border-zinc-700">SIN HISTORIAL</span>
          )}
          <p className="text-[10px] text-zinc-600">día {estadoMes.diasTranscurridos} de {estadoMes.diasTotales}</p>
          {estadoMes.estado === 'sin_base' && (
            <p className="text-[10px] text-zinc-700 leading-relaxed">No hay suficientes años comparables para evaluar ritmo</p>
          )}
        </div>

        {/* CARD 2 — Proyección de cierre */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Proyección {selectedPeriod.year}</p>
          <p className={cn('text-2xl font-bold',
            estadoMes.anos_base > 0 && estadoMes.historico_mes > 0
              ? estadoMes.proyeccion_cierre >= estadoMes.historico_mes ? 'text-[#00B894]' : 'text-red-400'
              : 'text-zinc-100'
          )}>
            {estadoMes.proyeccion_cierre.toLocaleString()} uds
          </p>
          {estadoMes.anos_base > 0 ? (
            <p className="text-[10px] text-zinc-500">Histórico mes: {estadoMes.historico_mes.toLocaleString()} uds</p>
          ) : (
            <p className="text-[10px] text-zinc-600">Sin histórico comparable</p>
          )}
          <p className="text-[10px] text-zinc-700">Estimación al ritmo actual</p>
        </div>

        {/* CARD 3 — Avance a la fecha */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Avance a la fecha</p>
          <p className="text-2xl font-bold text-zinc-100">{estadoMes.actual.toLocaleString()} uds</p>
          {estadoMes.anos_base > 0 ? (
            <div className="space-y-0.5">
              <p className="text-[10px] text-zinc-500">Esperado: {estadoMes.esperado_a_fecha.toLocaleString()} uds</p>
              {estadoMes.gap !== null && estadoMes.gap_pct !== null && (
                <p className={cn('text-[10px] font-bold', estadoMes.gap >= 0 ? 'text-[#00B894]' : 'text-red-400')}>
                  {estadoMes.gap >= 0 ? '+' : ''}{estadoMes.gap.toLocaleString()} ({estadoMes.gap >= 0 ? '+' : ''}{estadoMes.gap_pct}%)
                </p>
              )}
              <p className="text-[10px] text-zinc-700">ref: prom. mismo mes, {estadoMes.anos_base} año{estadoMes.anos_base > 1 ? 's' : ''} ant.</p>
            </div>
          ) : (
            <p className="text-[10px] text-zinc-600">Sin historial comparativo disponible</p>
          )}
          {dataAvailability.has_venta_neta && estadoMes.ingreso_actual > 0 && (
            <p className="text-[10px] text-zinc-500 pt-1 border-t border-zinc-800/60">
              Ingreso: {configuracion.moneda} {estadoMes.ingreso_actual.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          )}
        </div>

        {/* CARD 4 — YTD vs año pasado */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">YTD {ytdAnno} vs {ytdAnno - 1}</p>
          <p className={cn('text-4xl font-bold leading-none', ytdVar == null ? 'text-zinc-600' : ytdVar >= 0 ? 'text-[#00B894]' : 'text-red-400')}>
            {ytdVar == null ? '—' : `${ytdVar >= 0 ? '+' : ''}${ytdVar.toFixed(1)}%`}
          </p>
          <p className="text-xs text-zinc-400">{(teamStats.ytd_actual_equipo ?? 0).toLocaleString()} uds</p>
          {teamStats.ytd_anterior_equipo ? (
            <p className="text-[10px] text-zinc-600">vs {teamStats.ytd_anterior_equipo.toLocaleString()} en {ytdAnno - 1}</p>
          ) : null}
        </div>
      </div>

      {/* Frase narrativa — debajo del grid */}
      {fraseNarrativa && (
        <p className="text-sm text-zinc-500 italic">{fraseNarrativa}</p>
      )}

      {/* ── Focos de riesgo prioritarios ──────────────────────────────────── */}
      {focosRiesgo.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Riesgos que requieren acción</p>
          <div className="flex flex-wrap gap-3">
            {focosRiesgo.map((insight, i) => (
              <div
                key={insight.id}
                onClick={() => handleVerDetalle(insight)}
                className="flex items-start gap-3 p-3 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900 cursor-pointer transition-colors flex-1 min-w-[280px] max-w-[380px]"
              >
                <span className="text-zinc-600 font-bold text-xs shrink-0 w-4">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-200 truncate">{insight.emoji} {insight.titulo}</p>
                  {insight.impacto_economico && (
                    <p className="text-[10px] text-red-400 mt-0.5">
                      {insight.impacto_economico.tipo === 'perdida' ? '↓ ' : '⚠ '}
                      {insight.impacto_economico.descripcion}
                    </p>
                  )}
                </div>
                <span className="text-zinc-600 text-xs shrink-0">→</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Causas del atraso ────────────────────────────────────────────── */}
      {causasAtraso.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Principales causas del atraso</p>
            <span className="text-xs text-red-400 font-medium">
              −{causasAtraso.reduce((a, c) => a + c.impacto_uds, 0).toLocaleString()} uds estimadas
            </span>
          </div>
          <div className="space-y-2">
            {(() => {
              const impactoTotal = causasAtraso.reduce((a, c) => a + c.impacto_uds, 0)
              return causasAtraso.map((causa, i) => {
                const maxImpacto = causasAtraso[0].impacto_uds
                const barWidth   = maxImpacto > 0 ? Math.round((causa.impacto_uds / maxImpacto) * 100) : 0
                const pctExplica = impactoTotal > 0 ? Math.round((causa.impacto_uds / impactoTotal) * 100) : 0
                return (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
                    <span className={cn(
                      'shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase',
                      causa.dimension === 'canal' ? 'bg-blue-500/15 text-blue-400' : 'bg-amber-500/15 text-amber-400'
                    )}>
                      {causa.dimension === 'canal' ? 'Canal' : 'Vendedor'}
                    </span>
                    <div className="w-12 h-1.5 bg-zinc-800 rounded-full overflow-hidden shrink-0">
                      <div className="h-full bg-red-500 rounded-full" style={{ width: `${barWidth}%` }} />
                    </div>
                    <span className="text-sm text-zinc-200 flex-1 truncate">{causa.label}</span>
                    <span className="text-sm font-semibold text-red-400 shrink-0 tabular-nums">{causa.caida_pct}%</span>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-zinc-600 tabular-nums">−{causa.impacto_uds.toLocaleString()} uds</p>
                      <p className="text-[10px] text-zinc-700">Explica {pctExplica}% del atraso</p>
                    </div>
                  </div>
                )
              })
            })()}
          </div>
          <p className="text-[10px] text-zinc-700">Calculado vs promedio del mismo mes en años anteriores</p>
        </div>
      )}

      {/* ── Recomendación prioritaria ─────────────────────────────────────── */}
      {recomendacionPrincipal && (
        <div className="flex items-start gap-4 p-4 rounded-2xl border border-zinc-800 bg-zinc-900/40">
          <span className="text-2xl shrink-0">{recomendacionPrincipal.emoji}</span>
          <div className="flex-1 min-w-0 space-y-0.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Recomendación prioritaria</p>
            <p className="text-sm font-semibold text-zinc-200">{recomendacionPrincipal.titulo}</p>
            <p className="text-xs text-zinc-500 leading-relaxed">{recomendacionPrincipal.accion_sugerida}</p>
            {recomendacionPrincipal.impacto_economico && (
              <p className="text-[10px] text-[#00B894] mt-1">
                Impacto estimado: {recomendacionPrincipal.impacto_economico.descripcion}
              </p>
            )}
          </div>
          <button
            onClick={() => handleVerDetalle(recomendacionPrincipal)}
            className="shrink-0 text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer whitespace-nowrap"
          >
            Ver detalle →
          </button>
        </div>
      )}

      {/* Tabs de dimensión */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit flex-wrap">
        {(['vendedor', 'cliente', 'canal', 'producto'] as Dimension[])
          .filter((d) => d !== 'canal' || dataAvailability.has_canal)
          .filter((d) => d !== 'cliente' || dataAvailability.has_cliente)
          .filter((d) => d !== 'producto' || dataAvailability.has_producto)
          .map((d) => (
            <button
              key={d}
              onClick={() => setDimension(d)}
              className={cn(
                'px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition-all',
                dimension === d ? 'bg-[#00B894] text-black' : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              {d === 'vendedor' ? 'Vendedor' : d === 'cliente' ? 'Cliente' : d === 'canal' ? 'Canal' : 'Producto'}
            </button>
          ))}
      </div>

      {/* ── DIMENSIÓN: VENDEDOR ───────────────────────────────────────────── */}
      {dimension === 'vendedor' && (
        <>
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          </section>

          <section className="flex flex-wrap gap-3">
            {dataAvailability.has_cliente && (
              <button onClick={() => setActiveChip('dormidos')} className={cn('px-4 py-2 rounded-xl text-xs font-bold border transition-all', teamStats.clientes_dormidos_count > 0 ? 'bg-orange-500/10 border-orange-500/30 text-orange-400 hover:bg-orange-500/20' : 'bg-zinc-900 border-zinc-800 text-zinc-500')}>
                😴 {teamStats.clientes_dormidos_count} clientes dormidos
              </button>
            )}
            {dataAvailability.has_producto && (
              <button onClick={() => setActiveChip('sinMovimiento')} className={cn('px-4 py-2 rounded-xl text-xs font-bold border transition-all', teamStats.productos_sin_movimiento_count > 0 ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20' : 'bg-zinc-900 border-zinc-800 text-zinc-500')}>
                📦 {teamStats.productos_sin_movimiento_count} productos sin movimiento
              </button>
            )}
            {dataAvailability.has_cliente && teamStats.riesgos_concentracion_count > 0 && (
              <button onClick={() => setActiveChip('concentracion')} className="px-4 py-2 rounded-xl text-xs font-bold border bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all">
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

      {/* ── DIMENSIÓN: PRODUCTO ───────────────────────────────────────────── */}
      {dimension === 'producto' && (
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-zinc-900/60 text-zinc-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-5 py-3">Producto</th>
                  <th className="px-4 py-3 text-right">Unidades</th>
                  {dataAvailability.has_venta_neta && <th className="px-4 py-3 text-right">Ventas netas</th>}
                  <th className="px-4 py-3 text-right">Var %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {productoSummary.map((p) => {
                  const varPct = p.ventas_prev > 0
                    ? ((( dataAvailability.has_venta_neta ? p.ventas : p.unidades) - p.ventas_prev) / p.ventas_prev) * 100
                    : null
                  return (
                    <tr key={p.producto} className="hover:bg-zinc-900/40 transition-colors">
                      <td className="px-5 py-3 font-bold text-zinc-200">{p.producto}</td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-300">{p.unidades.toLocaleString()}</td>
                      {dataAvailability.has_venta_neta && (
                        <td className="px-4 py-3 text-right font-mono text-zinc-300">
                          {configuracion.moneda} {p.ventas.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                      )}
                      <td className={cn('px-4 py-3 text-right font-bold', varPct == null ? 'text-zinc-600' : varPct >= 0 ? 'text-[#00B894]' : 'text-red-400')}>
                        {varPct == null ? '—' : `${varPct >= 0 ? '+' : ''}${varPct.toFixed(1)}%`}
                      </td>
                    </tr>
                  )
                })}
                {productoSummary.length === 0 && (
                  <tr><td colSpan={4} className="px-5 py-8 text-center text-zinc-600">Sin datos de producto</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── PANELES DE CHIPS ──────────────────────────────────────────────── */}
      {activeChip && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setActiveChip(null)} />
          {/* Panel: Clientes dormidos */}
          {activeChip === 'dormidos' && (
            <div className="fixed inset-y-0 right-0 w-full max-w-md bg-zinc-950 border-l border-zinc-800 z-50 overflow-y-auto shadow-2xl animate-in slide-in-from-right duration-300">
              <div className="sticky top-0 bg-zinc-950 border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-zinc-100">Clientes sin actividad</h2>
                  <p className="text-xs text-zinc-500 mt-0.5">Ordenados por probabilidad de recuperación × valor</p>
                </div>
                <button onClick={() => setActiveChip(null)} className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors text-xl">×</button>
              </div>
              <div className="p-5 space-y-3">
                {clientesDormidos.slice(0, 20).map((d: ClienteDormido) => {
                  const rcCls: Record<ClienteDormido['recovery_label'], string> = {
                    alta:        'bg-[#00B894]/15 text-[#00B894] border-[#00B894]/30',
                    recuperable: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
                    dificil:     'bg-amber-500/15 text-amber-400 border-amber-500/30',
                    perdido:     'bg-zinc-700/50 text-zinc-400 border-zinc-600/30',
                  }
                  const rcLabel: Record<ClienteDormido['recovery_label'], string> = {
                    alta: 'Alta', recuperable: 'Recuperable', dificil: 'Difícil', perdido: 'Perdido',
                  }
                  return (
                    <div key={d.cliente} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-zinc-200 truncate">{d.cliente}</span>
                        <span className={cn('shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border', rcCls[d.recovery_label])}>
                          {rcLabel[d.recovery_label]} {d.recovery_score}/100
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-500">{d.vendedor} · {d.dias_sin_actividad} días sin actividad</p>
                      <p className="text-[10px] text-zinc-600">Valor histórico: {d.valor_historico.toLocaleString()} · {d.compras_historicas} compras</p>
                    </div>
                  )
                })}
                {clientesDormidos.length === 0 && (
                  <p className="text-center text-zinc-600 text-sm py-8">Sin clientes dormidos detectados</p>
                )}
              </div>
              <div className="sticky bottom-0 bg-zinc-950 border-t border-zinc-800 p-4">
                <button onClick={() => { setActiveChip(null); navigate('/clientes') }} className="w-full py-2.5 rounded-xl bg-[#00B894]/10 text-[#00B894] text-sm font-bold hover:bg-[#00B894]/20 transition-colors">
                  Ver todos en Clientes →
                </button>
              </div>
            </div>
          )}
          {/* Panel: Productos sin movimiento */}
          {activeChip === 'sinMovimiento' && (
            <div className="fixed inset-y-0 right-0 w-full max-w-md bg-zinc-950 border-l border-zinc-800 z-50 overflow-y-auto shadow-2xl animate-in slide-in-from-right duration-300">
              <div className="sticky top-0 bg-zinc-950 border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-zinc-100">Productos sin movimiento</h2>
                  <p className="text-xs text-zinc-500 mt-0.5">Sin ventas en el período actual</p>
                </div>
                <button onClick={() => setActiveChip(null)} className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors text-xl">×</button>
              </div>
              <div className="p-5 space-y-3">
                {categoriasInventario.length === 0 ? (
                  <div className="text-center py-10 space-y-2">
                    <p className="text-zinc-500 text-sm font-medium">Sin inventario cargado</p>
                    <p className="text-zinc-600 text-xs">Carga el archivo de inventario para ver este análisis</p>
                  </div>
                ) : categoriasInventario
                    .filter(c => c.clasificacion === 'sin_movimiento' || c.clasificacion === 'lento_movimiento')
                    .slice(0, 20)
                    .map(c => {
                      const clsCls: Record<string, string> = {
                        sin_movimiento: 'bg-red-500/15 text-red-400 border-red-500/30',
                        lento_movimiento: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
                      }
                      const clsLabel: Record<string, string> = {
                        sin_movimiento: 'Sin movimiento', lento_movimiento: 'Lento movimiento',
                      }
                      return (
                        <div key={c.producto} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-zinc-200 truncate">{c.producto}</span>
                            <span className={cn('shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border', clsCls[c.clasificacion] ?? '')}>
                              {clsLabel[c.clasificacion] ?? c.clasificacion}
                            </span>
                          </div>
                          <p className="text-[10px] text-zinc-500">{c.unidades_actuales.toLocaleString()} uds actuales · PM3: {c.pm3.toFixed(1)}</p>
                          <p className="text-[10px] text-zinc-600">Días inventario: {c.dias_inventario}</p>
                        </div>
                      )
                    })
                }
              </div>
              <div className="sticky bottom-0 bg-zinc-950 border-t border-zinc-800 p-4">
                <button onClick={() => { setActiveChip(null); navigate('/rotacion') }} className="w-full py-2.5 rounded-xl bg-[#00B894]/10 text-[#00B894] text-sm font-bold hover:bg-[#00B894]/20 transition-colors">
                  Ver todos en Rotación →
                </button>
              </div>
            </div>
          )}
          {/* Panel: Concentración */}
          {activeChip === 'concentracion' && (
            <div className="fixed inset-y-0 right-0 w-full max-w-md bg-zinc-950 border-l border-zinc-800 z-50 overflow-y-auto shadow-2xl animate-in slide-in-from-right duration-300">
              <div className="sticky top-0 bg-zinc-950 border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-zinc-100">Concentración de ventas</h2>
                  <p className="text-xs text-zinc-500 mt-0.5">Clientes con mayor peso en el total de ventas</p>
                </div>
                <button onClick={() => setActiveChip(null)} className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors text-xl">×</button>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                  Alta concentración aumenta el riesgo ante pérdida de clientes clave
                </p>
                {concentracionRiesgo.map(c => (
                  <div key={c.cliente} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-zinc-200">{c.cliente}</span>
                      <span className="text-sm font-black text-red-400">{c.pct_del_total.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-red-500/60 rounded-full" style={{ width: `${Math.min(c.pct_del_total, 100)}%` }} />
                    </div>
                    <p className="text-[10px] text-zinc-500">{c.ventas_absolutas.toLocaleString()} uds · Vendedores: {c.vendedores_involucrados.join(', ')}</p>
                  </div>
                ))}
                {concentracionRiesgo.length === 0 && (
                  <p className="text-center text-zinc-600 text-sm py-8">Sin datos de concentración</p>
                )}
              </div>
            </div>
          )}
        </>
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
          <div className="space-y-4">
            <InsightGroup prioridad="CRITICA" items={insightsByDim.filter((i) => i.prioridad === 'CRITICA')} hasVentaNeta={dataAvailability.has_venta_neta} moneda={configuracion.moneda} onVerDetalle={handleVerDetalle} />
            {showAllAlertas && (
              <>
                <InsightGroup prioridad="ALTA"  items={insightsByDim.filter((i) => i.prioridad === 'ALTA')}  hasVentaNeta={dataAvailability.has_venta_neta} moneda={configuracion.moneda} onVerDetalle={handleVerDetalle} />
                <InsightGroup prioridad="MEDIA" items={insightsByDim.filter((i) => i.prioridad === 'MEDIA')} hasVentaNeta={dataAvailability.has_venta_neta} moneda={configuracion.moneda} onVerDetalle={handleVerDetalle} />
                <InsightGroup prioridad="BAJA"  items={insightsByDim.filter((i) => i.prioridad === 'BAJA')}  hasVentaNeta={dataAvailability.has_venta_neta} moneda={configuracion.moneda} onVerDetalle={handleVerDetalle} />
              </>
            )}
            {insightsByDim.length > 0 && (
              <button
                onClick={() => setShowAllAlertas(!showAllAlertas)}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {showAllAlertas
                  ? 'Ocultar alertas adicionales ▲'
                  : `Ver todas las alertas (${insightsByDim.length} detectadas) →`}
              </button>
            )}
          </div>
        )}
      </section>

    </div>
  )
}
