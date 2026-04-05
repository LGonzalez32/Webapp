import { useEffect, useState, useMemo, useCallback, useDeferredValue, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { useAppStore } from '../store/appStore'
import { useAnalysis } from '../lib/useAnalysis'
import type { Insight, InsightTipo, InsightPrioridad, VendorAnalysis } from '../types'
import { salesInPeriod } from '../lib/analysis'
import { callAI } from '../lib/chatService'
import VendedorPanel from '../components/vendedor/VendedorPanel'
import { Database, Calendar, CheckCircle, RotateCcw, ChevronDown, Printer, GitCompare } from 'lucide-react'
import { toast } from 'sonner'
import { useAlertStatusStore } from '../store/alertStatusStore'
import type { AlertStatus } from '../store/alertStatusStore'
import { getAlertKey } from '../lib/alertKey'
import FirstTimeTooltip from '../components/ui/FirstTimeTooltip'
import ComparisonSummary from '../components/ui/ComparisonSummary'
import { useSubscription } from '../lib/useSubscription'
import UpgradePrompt from '../components/ui/UpgradePrompt'

const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const MESES_LARGO = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']


// â"€â"€â"€ Colores de prioridad â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

const PRIORIDAD_ORDER: Record<InsightPrioridad, number> = { CRITICA: 4, ALTA: 3, MEDIA: 2, BAJA: 1 }

type ImpactLevel = 'alto' | 'medio' | 'bajo'

function getImpactLevel(insight: Insight): ImpactLevel {
  // ALTO: CRITICA priority, or ALTA cruzado/equipo types
  if (insight.prioridad === 'CRITICA') return 'alto'
  if (insight.prioridad === 'ALTA' && (insight.tipo === 'cruzado' || insight.tipo === 'riesgo_equipo')) return 'alto'
  // BAJO: hallazgos (oportunidades) and BAJA priority
  if (insight.tipo === 'hallazgo') return 'bajo'
  if (insight.prioridad === 'BAJA') return 'bajo'
  // MEDIO: everything else (ALTA vendedor/cliente/producto/meta, MEDIA anything)
  return 'medio'
}

const IMPACT_ORDER: Record<ImpactLevel, number> = { alto: 3, medio: 2, bajo: 1 }

function getAccentColor(tipo: InsightTipo): string {
  if (tipo === 'hallazgo') return '#22d3ee'
  if (tipo === 'cruzado') return '#a78bfa'
  if (tipo === 'riesgo_meta') return '#22c55e'
  if (tipo.startsWith('riesgo_')) return '#ef4444'
  return '#64748b'
}

function getFeedLabel(tipo: InsightTipo): string {
  switch (tipo) {
    case 'hallazgo': return 'OPORTUNIDAD'
    case 'cruzado': return 'COMBINADO'
    case 'riesgo_meta': return 'META'
    case 'riesgo_equipo': return 'EQUIPO'
    case 'riesgo_vendedor': return 'VENDEDOR'
    case 'riesgo_cliente': return 'CLIENTE'
    case 'riesgo_producto': return 'PRODUCTO'
  }
}

type FeedFilterKey = 'all' | 'riesgos' | 'hallazgo' | 'cruzado'
type StatusFilterKey = 'notResolved' | 'following' | 'resolved'

const FEED_FILTERS: { key: FeedFilterKey; label: string; color?: string; match: (t: InsightTipo) => boolean }[] = [
  { key: 'all', label: 'Todos', match: () => true },
  { key: 'riesgos', label: 'Riesgos', color: '#ef4444', match: t => t.startsWith('riesgo_') },
  { key: 'hallazgo', label: 'Oportunidades', color: '#22d3ee', match: t => t === 'hallazgo' },
  { key: 'cruzado', label: 'Combinados', color: '#a78bfa', match: t => t === 'cruzado' },
]

// â"€â"€â"€ InsightCard â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€


// â"€â"€â"€ Página principal â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

/** Resalta en negrita números con unidades o porcentajes dentro del texto de alertas */
function boldifyDescription(text: string) {
  const parts = text.split(/(\b\d[\d,\.]*(?:\s*%|\s*\buds?\b|\s*\bdías?\b|\s*\bmeses?\b|\s*\bsemanas?\b)?)/g)
  return (
    <>
      {parts.map((part, i) =>
        /^\d[\d,\.]*/.test(part)
          ? <strong key={i} style={{ color: 'var(--sf-t1)', fontWeight: 600 }}>{part}</strong>
          : <span key={i}>{part}</span>
      )}
    </>
  )
}

// ─── Trend computation ──────────────────────────────────────────────────────
type Trend = 'improving' | 'worsening' | 'stable'

function computeInsightTrend(
  insight: Insight,
  vendorAnalysis: VendorAnalysis[],
  clientesDormidos: { cliente: string; dias_sin_actividad: number; frecuencia_esperada_dias: number | null }[],
): Trend {
  // Vendedor: compare cumplimiento vs pm3 trend
  if (insight.tipo === 'riesgo_vendedor' && insight.vendedor) {
    const v = vendorAnalysis.find(va => va.vendedor === insight.vendedor)
    if (v?.variacion_vs_promedio_pct != null) {
      if (v.variacion_vs_promedio_pct > 5) return 'improving'
      if (v.variacion_vs_promedio_pct < -5) return 'worsening'
    }
    return 'stable'
  }
  // Cliente dormido: more days = worsening
  if (insight.tipo === 'riesgo_cliente' && insight.cliente) {
    const d = clientesDormidos.find(c => c.cliente === insight.cliente)
    if (d) {
      const freq = d.frecuencia_esperada_dias ?? 30
      if (d.dias_sin_actividad > freq * 3) return 'worsening'
      if (d.dias_sin_actividad < freq * 2) return 'improving'
    }
    return 'stable'
  }
  // Meta/equipo: compare current period vs projection
  if (insight.tipo === 'riesgo_meta' || insight.tipo === 'riesgo_equipo') {
    if (insight.vendedor) {
      const v = vendorAnalysis.find(va => va.vendedor === insight.vendedor)
      if (v?.cumplimiento_pct != null) {
        if (v.cumplimiento_pct > 85) return 'improving'
        if (v.cumplimiento_pct < 50) return 'worsening'
      }
    }
    return 'stable'
  }
  // Hallazgo / oportunidad: always stable (structural)
  if (insight.tipo === 'hallazgo') return 'stable'
  // Cruzado: worsening by default (these are compound risks)
  if (insight.tipo === 'cruzado') return 'worsening'
  // Product: stable
  return 'stable'
}

const TREND_CONFIG: Record<Trend, { symbol: string; color: string; label: string }> = {
  improving: { symbol: '\u2197', color: '#22c55e', label: 'Mejorando vs promedio' },
  worsening: { symbol: '\u2198', color: '#ef4444', label: 'Empeorando vs promedio' },
  stable:    { symbol: '\u2192', color: '#a1a1aa', label: 'Estable vs promedio' },
}

const STATUS_OPTIONS: { value: AlertStatus; label: string; emoji: string; color: string; bg: string; border: string }[] = [
  { value: 'pending',   label: 'Pendiente',    emoji: '📋', color: 'var(--sf-t4)', bg: 'transparent', border: 'var(--sf-border-subtle)' },
  { value: 'following', label: 'En trabajo',    emoji: '🔧', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)' },
  { value: 'resolved',  label: 'Resuelta',      emoji: '✅', color: '#22c55e', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.25)' },
]

function relativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days}d`
  const weeks = Math.floor(days / 7)
  return `hace ${weeks}sem`
}

export default function EstadoComercialPage() {
  const navigate = useNavigate()
  useAnalysis()
  const {
    insights, vendorAnalysis, teamStats, dataAvailability,
    configuracion, selectedPeriod, setSelectedPeriod, sales, loadingMessage,
    clientesDormidos, concentracionRiesgo, categoriasInventario, supervisorAnalysis,
    canalAnalysis, categoriaAnalysis, dataSource,
    comparisonEnabled, comparisonPeriod, toggleComparison, setComparisonPeriod,
  } = useAppStore()

  const { canAccess } = useSubscription()
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)

  const [vendedorPanel, setVendedorPanel] = useState<VendorAnalysis | null>(null)
  const [feedFilter, setFeedFilter] = useState<FeedFilterKey>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('notResolved')
  const [feedExpanded, setFeedExpanded] = useState(false)
  const [expandedInsightId, setExpandedInsightId] = useState<string | null>(null)
  const [analysisMap, setAnalysisMap] = useState<Record<string, { loading: boolean; text: string | null }>>({})
  const [mounted, setMounted] = useState(false)
  const [analysisStep, setAnalysisStep] = useState(0)

  const { alertStatuses, setAlertStatus, checkReopened } = useAlertStatusStore()
  const [openDropdownKey, setOpenDropdownKey] = useState<string | null>(null)
  const [editingNoteKey, setEditingNoteKey] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (sales.length === 0 && dataSource === 'none') navigate('/cargar', { replace: true })
  }, [sales, navigate, dataSource])

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

  useEffect(() => {
    if (!teamStats) return
    const t = setTimeout(() => setMounted(true), 60)
    return () => clearTimeout(t)
  }, [teamStats])

  // Reabrir automáticamente alertas resueltas hace >7 días que siguen activas
  useEffect(() => {
    if (insights.length === 0) return
    const activeKeys = insights.map(getAlertKey)
    const reopened = checkReopened(activeKeys)
    if (reopened.length > 0) {
      toast(`↻ ${reopened.length} alerta${reopened.length > 1 ? 's reabierta(s)' : ' reabierta'} — el riesgo continúa`, {
        duration: 5000,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insights])

  // Cerrar dropdown al clic fuera
  useEffect(() => {
    if (!openDropdownKey) return
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdownKey(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [openDropdownKey])


  // â"€â"€ Chips de mes â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const maxDate = useMemo(() =>
    sales.reduce((max, s) => { const d = new Date(s.fecha); return d > max ? d : max }, new Date(0)),
  [sales])
  const maxChipMonth = maxDate.getFullYear() === selectedPeriod.year ? maxDate.getMonth() : selectedPeriod.month

  // ── Meses disponibles para el filtro de periodo ──────────────────────────
  const availableMonths = useMemo(() => {
    const months = new Set<string>()
    for (const s of sales) {
      const y = s.fecha.getFullYear()
      const m = s.fecha.getMonth()
      months.add(`${y}-${m}`)
    }
    return [...months]
      .map(k => { const [y, m] = k.split('-').map(Number); return { year: y, month: m } })
      .sort((a, b) => b.year - a.year || b.month - a.month)
      .slice(0, 18) // últimos 18 meses como máximo
  }, [sales])

  // â"€â"€ Slices de ventas cacheados (evitar llamadas repetidas a salesInPeriod) â"€
  const salesActual = useMemo(() =>
    salesInPeriod(sales, selectedPeriod.year, selectedPeriod.month),
  [sales, selectedPeriod.year, selectedPeriod.month])

  const salesAnterior = useMemo(() =>
    salesInPeriod(sales, selectedPeriod.year - 1, selectedPeriod.month),
  [sales, selectedPeriod.year, selectedPeriod.month])

  // â"€â"€ Datos diferidos para secciones secundarias (evita freeze UI) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const deferredSales            = useDeferredValue(sales)
  const deferredVendorAnalysis   = useDeferredValue(vendorAnalysis)
  const deferredClientesDormidos = useDeferredValue(clientesDormidos)

  // â"€â"€ Datos cliente â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  // â"€â"€ Datos canal â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  // â"€â"€ Datos producto â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  // â"€â"€ Estado del mes (vs histórico mismo mes años anteriores) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const estadoMes = useMemo(() => {
    const diasTranscurridos = teamStats?.dias_transcurridos ?? 1
    const diasTotales       = teamStats?.dias_totales ?? 30

    // Usar slices cacheados — evita 3 pasadas completas sobre sales[]
    const actual         = salesActual.reduce((a, s) => a + s.unidades, 0)
    const ingreso_actual = salesActual.reduce((a, s) => a + (s.venta_neta ?? 0), 0)
    const historico_mes  = salesAnterior.length > 0
      ? salesAnterior.reduce((a, s) => a + s.unidades, 0)
      : 0
    const historico_neto = salesAnterior.length > 0
      ? salesAnterior.reduce((a, s) => a + (s.venta_neta ?? 0), 0)
      : 0
    const anos_base = salesAnterior.length > 0 ? 1 : 0

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
      actual, ingreso_actual, esperado_a_fecha, historico_mes, historico_neto,
      gap, gap_pct, proyeccion_cierre, estado,
      frase, frase_proyeccion,
      anos_base,
      diasTranscurridos, diasTotales,
    }
  }, [salesActual, salesAnterior, teamStats])

  // â"€â"€ Causas del atraso â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const causasAtraso = useMemo(() => {
    if (estadoMes.estado !== 'atrasado' || estadoMes.anos_base === 0) return []
    const { year, month } = selectedPeriod

    const causas: Array<{ dimension: 'canal' | 'vendedor'; label: string; caida_pct: number; impacto_uds: number }> = []

    if (dataAvailability.has_canal) {
      // Una sola pasada sobre deferredSales — antes eran 4 pasadas (1 forEach + 3 filter)
      const canalActual  = new Map<string, number>()
      const canalSuma    = new Map<string, number>()
      const canalConteo  = new Map<string, Set<number>>()

      for (const s of deferredSales) {
        if (!s.canal) continue
        const d = new Date(s.fecha)
        const y = d.getFullYear()
        const m = d.getMonth()
        if (y === year && m === month) {
          canalActual.set(s.canal, (canalActual.get(s.canal) ?? 0) + s.unidades)
        } else if (m === month && y >= year - 3 && y < year) {
          canalSuma.set(s.canal, (canalSuma.get(s.canal) ?? 0) + s.unidades)
          if (!canalConteo.has(s.canal)) canalConteo.set(s.canal, new Set())
          canalConteo.get(s.canal)!.add(y)
        }
      }

      canalActual.forEach((actual, canal) => {
        const suma   = canalSuma.get(canal) ?? 0
        const conteo = canalConteo.get(canal)?.size ?? 0
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

    deferredVendorAnalysis
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
  }, [estadoMes, deferredSales, selectedPeriod, deferredVendorAnalysis, dataAvailability])

  // â"€â"€ Focos de riesgo críticos â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  // ── Comparación mes vs mes anterior ───────────────────────────────────────
  const comparacionMes = useMemo(() => {
    const fmtK = (n: number) => n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : n.toLocaleString()
    const { year, month } = selectedPeriod // month 0-based

    // Helper para calcular total de unidades en un mes/año
    const totalMes = (y: number, m: number) => sales
      .filter(s => { const d = new Date(s.fecha); return d.getFullYear() === y && d.getMonth() === m })
      .reduce((sum, s) => sum + s.unidades, 0)

    // Helper para calcular total de unidades en un mes/año hasta un día máximo
    const totalMesHastaDia = (y: number, m: number, maxDia: number) => sales
      .filter(s => { const d = new Date(s.fecha); return d.getFullYear() === y && d.getMonth() === m && d.getDate() <= maxDia })
      .reduce((sum, s) => sum + s.unidades, 0)

    // Determinar si el mes seleccionado está incompleto (es el mes "en curso" de los datos)
    const maxSaleDate = sales.reduce((max, s) => { const d = new Date(s.fecha); return d > max ? d : max }, new Date(0))
    const isCurrentMonth = year === maxSaleDate.getFullYear() && month === maxSaleDate.getMonth()
    const maxDay = maxSaleDate.getDate()

    // Mes anterior
    const mesPrevIdx = month === 0 ? 11 : month - 1
    const mesPrevYear = month === 0 ? year - 1 : year

    const mesActualTotal = totalMes(year, month)
    const mesPrevTotal = totalMes(mesPrevYear, mesPrevIdx)

    // Mismo mes del año anterior (hasta el mismo día para comparación justa)
    const mesAnioAnteriorTotal = isCurrentMonth ? totalMesHastaDia(year - 1, month, maxDay) : totalMes(year - 1, month)
    const mesAnioAnteriorCompleto = totalMes(year - 1, month)
    const varVsAnioAnterior = mesAnioAnteriorTotal > 0 ? ((mesActualTotal - mesAnioAnteriorTotal) / mesAnioAnteriorTotal) * 100 : null

    if (mesPrevTotal === 0 && mesAnioAnteriorTotal === 0) return null

    const variacion = mesPrevTotal > 0 ? ((mesActualTotal - mesPrevTotal) / mesPrevTotal) * 100 : 0
    const mesActualNombre = MESES_CORTO[month]
    const mesPrevNombre = MESES_CORTO[mesPrevIdx]

    // Tendencia trimestral: 3 meses completos más recientes
    // Helper: retroceder N meses desde un punto (month 0-based, year)
    const goBack = (m0: number, y0: number, n: number): [number, number] => {
      let mm = m0 - n, yy = y0
      while (mm < 0) { mm += 12; yy-- }
      return [mm, yy]
    }
    // Último mes completo: si el mes seleccionado es parcial, es el anterior; si no, es el seleccionado
    const [lcm, lcy] = isCurrentMonth ? goBack(month, year, 1) : [month, year]
    const [tm1Idx, tm1Year] = goBack(lcm, lcy, 2)
    const [tm2Idx, tm2Year] = goBack(lcm, lcy, 1)
    const tm3Idx = lcm, tm3Year = lcy

    const tm1Total = totalMes(tm1Year, tm1Idx)
    const tm2Total = totalMes(tm2Year, tm2Idx)
    const tm3Total = totalMes(tm3Year, tm3Idx)

    const tendencia = tm1Total > 0 && tm2Total > 0 ? (() => {
      const tipo = tm3Total > tm2Total && tm2Total > tm1Total ? 'creciente' as const
        : tm3Total < tm2Total && tm2Total < tm1Total ? 'decreciente' as const
        : 'mixta' as const
      return {
        m1: { nombre: MESES_CORTO[tm1Idx], total: tm1Total },
        m2: { nombre: MESES_CORTO[tm2Idx], total: tm2Total },
        m3: { nombre: MESES_CORTO[tm3Idx], total: tm3Total },
        tipo,
      }
    })() : null

    return {
      mesActualNombre, mesPrevNombre,
      mesActualTotal, mesPrevTotal,
      variacion,
      isCurrentMonth,
      diaActual: isCurrentMonth ? maxDay : null,
      tendencia,
      fmtK,
      mesAnioAnteriorTotal,
      mesAnioAnteriorCompleto,
      varVsAnioAnterior,
      year,
    }
  }, [sales, selectedPeriod])

  const focosRiesgo = useMemo(() =>
    insights.filter(i => i.prioridad === 'CRITICA' && i.impacto_economico).slice(0, 3),
  [insights])

  // â"€â"€ Recomendación prioritaria â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const recomendacionPrincipal = useMemo(() => {
    const primerFoco = focosRiesgo[0]?.id
    return insights
      .filter(i => i.accion_sugerida && i.impacto_economico?.valor && i.id !== primerFoco)
      .sort((a, b) => (b.impacto_economico?.valor ?? 0) - (a.impacto_economico?.valor ?? 0))[0] ?? null
  }, [insights, focosRiesgo])

  // â"€â"€ Resumen ejecutivo automático â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const resumenEjecutivo = useMemo(() => {
    const bullets: Array<{ texto: string; tipo: 'alerta' | 'neutro' | 'positivo'; sub?: string; subColor?: string }> = []

    // Bullet 1 — estado del mes con cuantificación
    if (estadoMes.estado !== 'sin_base' && estadoMes.gap_pct !== null) {
      const signo = estadoMes.gap_pct >= 0 ? '+' : ''
      const ref = estadoMes.historico_mes > 0
        ? ` (esperado: ${estadoMes.esperado_a_fecha.toLocaleString()} uds al día ${estadoMes.diasTranscurridos})`
        : ''
      bullets.push({
        texto: estadoMes.estado === 'atrasado'
          ? `El mes acumula ${estadoMes.actual.toLocaleString()} uds — ${Math.abs(estadoMes.gap_pct)}% por debajo del ritmo histórico${ref}.`
          : estadoMes.estado === 'adelantado'
          ? `El mes acumula ${estadoMes.actual.toLocaleString()} uds — ${signo}${estadoMes.gap_pct}% sobre el ritmo histórico${ref}.`
          : `El mes avanza en línea con el ritmo histórico (${estadoMes.actual.toLocaleString()} uds al día ${estadoMes.diasTranscurridos}).`,
        tipo: estadoMes.estado === 'atrasado' ? 'alerta' : estadoMes.estado === 'adelantado' ? 'positivo' : 'neutro',
      })
    }

    // Bullet 2 — comparación mes vs mes anterior
    if (comparacionMes) {
      const { mesActualNombre, mesPrevNombre, mesActualTotal, mesPrevTotal, variacion, isCurrentMonth, diaActual, fmtK, tendencia, varVsAnioAnterior, mesAnioAnteriorTotal, year } = comparacionMes
      const varAbs = Math.abs(variacion).toFixed(1)
      const signoVar = variacion >= 0 ? '+' : '-'
      // Tendencia trimestral sub-text
      const subTendencia = tendencia
        ? `Tendencia trimestral: ${tendencia.m1.nombre} ${fmtK(tendencia.m1.total)} → ${tendencia.m2.nombre} ${fmtK(tendencia.m2.total)} → ${tendencia.m3.nombre} ${fmtK(tendencia.m3.total)}`
        : undefined
      const subArrow = (() => {
        if (!tendencia) return ''
        if (tendencia.tipo === 'creciente') return ' (📈 en alza)'
        if (tendencia.tipo === 'decreciente') return ' (📉 en caída)'
        // mixta — analyze pattern for more descriptive text
        const { m1, m2, m3 } = tendencia
        if (m1.total > m2.total && m2.total < m3.total && m3.total > m1.total) return ' (📈 recuperándose)'
        if (m1.total > m2.total && m2.total < m3.total && m3.total <= m1.total) return ' (↕ irregular)'
        if (m1.total < m2.total && m2.total > m3.total && m3.total < m1.total) return ' (📉 desacelerándose)'
        if (m1.total < m2.total && m2.total > m3.total && m3.total >= m1.total) return ' (↕ irregular)'
        return ' (↕ estable)'
      })()
      const subColor = tendencia?.tipo === 'creciente' ? 'var(--sf-green)'
        : tendencia?.tipo === 'decreciente' ? 'var(--sf-red)'
        : subArrow.includes('📈') ? 'var(--sf-green)'
        : subArrow.includes('📉') ? 'var(--sf-red)'
        : 'var(--sf-t5)'
      if (isCurrentMonth && diaActual) {
        const bulletTexto = varVsAnioAnterior !== null
          ? `📊 ${mesActualNombre} lleva ${fmtK(mesActualTotal)} uds al día ${diaActual} — ${varVsAnioAnterior >= 0 ? '+' : ''}${varVsAnioAnterior.toFixed(1)}% vs misma fecha ${year - 1} (${fmtK(mesAnioAnteriorTotal)} uds). ${mesPrevNombre} ${year} cerró en ${fmtK(mesPrevTotal)}.`
          : `📊 ${mesActualNombre} lleva ${fmtK(mesActualTotal)} uds al día ${diaActual}. ${mesPrevNombre} cerró en ${fmtK(mesPrevTotal)}.`
        bullets.push({
          texto: bulletTexto,
          tipo: varVsAnioAnterior !== null ? (varVsAnioAnterior >= 0 ? 'positivo' : 'alerta') : 'neutro',
          sub: subTendencia ? subTendencia + subArrow : undefined,
          subColor,
        })
      } else {
        const emoji = variacion >= 0 ? '📈' : '📉'
        bullets.push({
          texto: `${emoji} ${mesActualNombre} cerró con ${fmtK(mesActualTotal)} uds — ${signoVar}${varAbs}% vs ${mesPrevNombre} (${fmtK(mesPrevTotal)}).`,
          tipo: variacion >= 0 ? 'positivo' : 'alerta',
          sub: subTendencia ? subTendencia + subArrow : undefined,
          subColor,
        })
      }
    }

    // Bullet 3 — causa principal con impacto o vendedores superando
    if (estadoMes.estado === 'atrasado' && causasAtraso.length > 0) {
      const principal = causasAtraso[0]
      const dim = principal.dimension === 'canal' ? 'canal' : 'vendedor'
      const resto = causasAtraso.length > 1
        ? `, junto con ${causasAtraso.slice(1).map(c => c.label).join(' y ')}`
        : ''
      bullets.push({
        texto: `El atraso se concentra en ${dim} ${principal.label} (${Math.abs(principal.caida_pct)}% de caída, −${principal.impacto_uds.toLocaleString()} uds estimadas)${resto}.`,
        tipo: 'alerta',
      })
    } else if (estadoMes.estado === 'adelantado') {
      const superando = deferredVendorAnalysis.filter(v => v.riesgo === 'superando')
      if (superando.length > 0) {
        const nombres = superando.slice(0, 3).map(v => v.vendedor.split(' ')[0])
        const extra = superando.length > 3 ? ` y ${superando.length - 3} más` : ''
        bullets.push({
          texto: `${superando.length} vendedor${superando.length > 1 ? 'es superando' : ' superando'} su ritmo: ${nombres.join(', ')}${extra} — impulsando el avance del mes.`,
          tipo: 'positivo',
        })
      }
    }

    // Bullet — vendedores rezagados (por debajo del ritmo)
    const rezagados = deferredVendorAnalysis.filter(v => v.riesgo === 'critico' || v.riesgo === 'riesgo')
    if (rezagados.length > 0 && rezagados.length < deferredVendorAnalysis.length) {
      const nombresRez = rezagados.slice(0, 3).map(v => v.vendedor)
      const extraRez = rezagados.length > 3 ? ` y ${rezagados.length - 3} más` : ''
      bullets.push({
        texto: `⚠ ${nombresRez.join(', ')}${extraRez} por debajo del ritmo esperado — necesitan atención.`,
        tipo: 'alerta',
      })
    }

    // Bullet 3 — vendedores críticos con porcentaje
    const criticos = deferredVendorAnalysis.filter(v => v.riesgo === 'critico')
    const nCriticos = criticos.length
    const nTotal = deferredVendorAnalysis.length
    if (nCriticos > 0) {
      const pctCriticos = Math.round((nCriticos / nTotal) * 100)
      const nombres = criticos.slice(0, 3).map(v => v.vendedor.split(' ')[0])
      const extra = nCriticos > 3 ? ` y ${nCriticos - 3} más` : ''
      bullets.push({
        texto: `${nCriticos} de ${nTotal} vendedores (${pctCriticos}%) en riesgo crítico: ${nombres.join(', ')}${extra}.`,
        tipo: 'alerta',
      })
    }

    // Bullet 4 — clientes dormidos con potencial o concentración
    const nDormidos = deferredClientesDormidos.length
    const recuperables = deferredClientesDormidos.filter(
      c => c.recovery_label === 'alta' || c.recovery_label === 'recuperable'
    ).length
    if (nDormidos > 0) {
      bullets.push({
        texto: recuperables > 0
          ? `${nDormidos.toLocaleString()} clientes sin actividad — ${recuperables} con alta probabilidad de reactivación esta semana.`
          : `${nDormidos.toLocaleString()} clientes sin actividad en el período actual.`,
        tipo: recuperables > 0 ? 'neutro' : 'alerta',
      })
    } else if (concentracionRiesgo.length > 0) {
      const top = concentracionRiesgo[0]
      bullets.push({
        texto: `${top.cliente} concentra el ${top.pct_del_total.toFixed(0)}% de las ventas — riesgo de concentración activo.`,
        tipo: 'alerta',
      })
    }

    return bullets.slice(0, 6)
  }, [estadoMes, causasAtraso, comparacionMes, deferredVendorAnalysis, deferredClientesDormidos, concentracionRiesgo])

  // â"€â"€ Escenario de mejora con clientes recuperables â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const escenarioMejora = useMemo(() => {
    if (estadoMes.proyeccion_cierre <= 0) return null

    const recuperablesAlta  = deferredClientesDormidos.filter(c => c.recovery_label === 'alta')
    const recuperablesMedia = deferredClientesDormidos.filter(c => c.recovery_label === 'recuperable')

    const totalClientesActivos = deferredVendorAnalysis.reduce((a, v) => a + (v.clientes_activos ?? 0), 0)
    const ticketPromedioUds = estadoMes.actual > 0 && totalClientesActivos > 0
      ? Math.round(estadoMes.actual / totalClientesActivos)
      : 0

    const udsAlta   = recuperablesAlta.length  * ticketPromedioUds * 0.30
    const udsMedia  = recuperablesMedia.length * ticketPromedioUds * 0.15
    const mejoraPotencial = Math.round(udsAlta + udsMedia)

    const proyeccionMejorada = estadoMes.proyeccion_cierre + mejoraPotencial
    const gapHistorico = estadoMes.historico_mes > 0
      ? Math.max(0, estadoMes.historico_mes - estadoMes.proyeccion_cierre)
      : 0
    const pctMejora = estadoMes.proyeccion_cierre > 0
      ? Math.round((mejoraPotencial / estadoMes.proyeccion_cierre) * 100)
      : 0

    return {
      recuperablesAlta:  recuperablesAlta.length,
      recuperablesMedia: recuperablesMedia.length,
      mejoraPotencial,
      proyeccionMejorada,
      gapHistorico,
      pctMejora,
    }
  }, [estadoMes, deferredClientesDormidos, deferredVendorAnalysis])

  // â"€â"€ Detalle expandible de cada causa â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const detalleCausas = useMemo(() => {
    const result = new Map<string, {
      vendedores: Array<{ vendedor: string; caida_pct: number | null; clientes_dormidos: number }>
    }>()

    causasAtraso.forEach(causa => {
      if (causa.dimension === 'canal') {
        // Usar vendorAnalysis directamente — evita O(NÃ—V) sales.some() sobre 90k filas
        const vendedoresCanal = deferredVendorAnalysis
          .filter(v =>
            v.variacion_vs_promedio_pct !== null &&
            v.variacion_vs_promedio_pct < -20 &&
            (v.periodos_base_promedio ?? 0) >= 2
          )
          .sort((a, b) => (a.variacion_vs_promedio_pct ?? 0) - (b.variacion_vs_promedio_pct ?? 0))
          .slice(0, 5)
          .map(v => ({
            vendedor: v.vendedor,
            caida_pct: v.variacion_vs_promedio_pct ?? null,
            clientes_dormidos: deferredClientesDormidos.filter(c => c.vendedor === v.vendedor).length,
          }))
        result.set(causa.label, { vendedores: vendedoresCanal })
      } else {
        const dormidosVendedor = deferredClientesDormidos
          .filter(c => c.vendedor === causa.label)
          .slice(0, 3)
          .map(c => ({ vendedor: c.cliente, caida_pct: null, clientes_dormidos: c.dias_sin_actividad }))
        result.set(causa.label, { vendedores: dormidosVendedor })
      }
    })

    return result
  }, [causasAtraso, deferredVendorAnalysis, deferredClientesDormidos])

  // â"€â"€ Frase narrativa compuesta â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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

  // â"€â"€ Preguntas puente a IA â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const preguntasPuente = useMemo(() => {
    const preguntas: Array<{ texto: string; contexto: string }> = []

    preguntas.push({
      texto: '¿Por qué estamos atrasados este mes?',
      contexto: '¿Por qué estamos atrasados este mes? Dame nombres concretos, causas principales y acciones prioritarias basadas en los datos actuales.',
    })

    if (causasAtraso.length > 0) {
      const principal = causasAtraso[0]
      preguntas.push({
        texto: `¿Qué está pasando con ${principal.label}?`,
        contexto: `Explícame en detalle qué está causando la caída en ${principal.label}. ¿Qué vendedores están involucrados, qué clientes dejaron de comprar y qué se puede hacer esta semana?`,
      })
    }

    const recuperables = deferredClientesDormidos.filter(
      c => c.recovery_label === 'alta' || c.recovery_label === 'recuperable'
    ).length
    if (recuperables > 0) {
      preguntas.push({
        texto: `¿Cuáles ${Math.min(recuperables, 5)} clientes puedo recuperar esta semana?`,
        contexto: `Dame los ${Math.min(recuperables, 5)} clientes dormidos con mayor probabilidad de recuperación. Para cada uno: nombre, vendedor asignado, días sin actividad, valor histórico, score de recuperación y qué decirles para reactivarlos esta semana.`,
      })
    }

    const topCritico = deferredVendorAnalysis
      .filter(v => v.riesgo === 'critico')
      .sort((a, b) => (a.variacion_vs_promedio_pct ?? 0) - (b.variacion_vs_promedio_pct ?? 0))[0]
    if (topCritico) {
      preguntas.push({
        texto: `¿Qué le pasa a ${topCritico.vendedor}?`,
        contexto: `Analiza en detalle la situación de ${topCritico.vendedor}. ¿Qué clientes perdió, qué productos dejó de mover, cuánto impacta al equipo y qué hacer hoy?`,
      })
    }

    if (preguntas.length < 4) {
      const sinMovimiento = categoriasInventario
        ?.filter(c => c.clasificacion === 'sin_movimiento' || c.clasificacion === 'lento_movimiento')
        .length ?? 0

      if (sinMovimiento > 0) {
        preguntas.push({
          texto: `¿Qué hago con los ${sinMovimiento} productos sin rotación?`,
          contexto: `Tengo ${sinMovimiento} productos sin movimiento o con rotación lenta. Dame los más críticos por valor de inventario inmovilizado y recomienda qué hacer: ¿promover, descontinuar, reubicar o esperar? Prioriza por impacto económico.`,
        })
      } else if ((teamStats?.clientes_dormidos_count ?? 0) > 100) {
        preguntas.push({
          texto: `¿Cómo priorizo ${teamStats!.clientes_dormidos_count.toLocaleString()} clientes dormidos?`,
          contexto: `Tengo ${teamStats!.clientes_dormidos_count} clientes sin actividad. Explícame cómo segmentarlos por prioridad de recuperación: cuáles contactar primero, cuáles descartar y cuáles programar para seguimiento en 30 días.`,
        })
      }
    }

    return preguntas.slice(0, 4)
  }, [causasAtraso, deferredClientesDormidos, deferredVendorAnalysis, categoriasInventario, teamStats])

  // â"€â"€ Oportunidades activas â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const oportunidades = useMemo(() => {
    const items: Array<{ emoji: string; titulo: string; detalle: string }> = []

    const superando = deferredVendorAnalysis.filter(v => v.riesgo === 'superando')
    if (superando.length > 0) {
      items.push({
        emoji: 'ðŸ‘¤',
        titulo: `${superando.length} vendedor${superando.length > 1 ? 'es' : ''} superando meta`,
        detalle: superando.slice(0, 2).map(v => v.vendedor).join(', '),
      })
    }

    const recuperables = deferredClientesDormidos.filter(c => c.recovery_label === 'alta')
    if (recuperables.length > 0) {
      items.push({
        emoji: 'ðŸ"¦',
        titulo: `${recuperables.length} cliente${recuperables.length > 1 ? 's' : ''} recuperable${recuperables.length > 1 ? 's' : ''} esta semana`,
        detalle: recuperables.slice(0, 2).map(c => c.cliente).join(', '),
      })
    }

    return items.slice(0, 3)
  }, [deferredVendorAnalysis, deferredClientesDormidos])

  const proyFinal =
    (teamStats?.proyeccion_equipo ?? 0) > 0
      ? teamStats!.proyeccion_equipo!
      : vendorAnalysis.reduce((sum, v) => sum + (v.proyeccion_cierre ?? 0), 0)

  // â"€â"€ Acciones hoy (3 cards de acción) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const accionesHoy = useMemo(() => {
    type Accion = { tipo: 'urgente' | 'meta' | 'oportunidad'; titulo: string; detalle: string[]; chatQ: string }
    const tr = (s: string, max: number) => s.length > max ? s.slice(0, max) + '...' : s
    const result: Accion[] = []

    // Acción 1 — URGENTE: insight CRITICA con mayor impacto_economico
    const actoresUsados = new Set<string>()
    const criticaTop = insights
      .filter(i => i.prioridad === 'CRITICA' && i.impacto_economico)
      .sort((a, b) => (b.impacto_economico?.valor ?? 0) - (a.impacto_economico?.valor ?? 0))[0]
    if (criticaTop) {
      let urgDetalle: string[]
      if (criticaTop.tipo === 'cruzado' && criticaTop.vendedor) {
        const dormidoTop = clientesDormidos
          .filter(c => c.vendedor === criticaTop.vendedor)
          .sort((a, b) => b.recovery_score - a.recovery_score)[0]
        if (dormidoTop) {
          const canalV = vendorAnalysis.find(v => v.vendedor === criticaTop.vendedor)?.canal_principal
          urgDetalle = [
            dormidoTop.cliente,
            `${dormidoTop.dias_sin_actividad} días sin comprar`,
            `Recovery: ${dormidoTop.recovery_label}${canalV ? ' · Canal: ' + canalV : ''}`,
          ]
          actoresUsados.add(dormidoTop.cliente)
        } else {
          urgDetalle = [criticaTop.descripcion]
          if (criticaTop.accion_sugerida) urgDetalle.push('→ ' + criticaTop.accion_sugerida)
        }
      } else {
        urgDetalle = [criticaTop.descripcion]
        if (criticaTop.accion_sugerida) urgDetalle.push('→ ' + criticaTop.accion_sugerida)
      }
      result.push({
        tipo: 'urgente',
        titulo: tr(criticaTop.titulo, 60),
        detalle: urgDetalle.slice(0, 3),
        chatQ: `${criticaTop.titulo}. ${criticaTop.descripcion}. ${criticaTop.accion_sugerida ?? ''}. Dame un plan de acción concreto para hoy con nombres específicos.`,
      })
    }

    // Acción 2 — META: basada en teamStats vs meta del equipo
    if (teamStats?.meta_equipo) {
      const proyE = proyFinal
      const faltante = Math.max(0, teamStats.meta_equipo - proyE)
      const diasRestantes = teamStats.dias_restantes
      if (faltante > 0) {
        const masCercano = vendorAnalysis
          .filter(v => v.meta && v.proyeccion_cierre !== undefined)
          .sort((a, b) => (b.proyeccion_cierre ?? 0) / (b.meta ?? 1) - (a.proyeccion_cierre ?? 0) / (a.meta ?? 1))[0]
        result.push({
          tipo: 'meta',
          titulo: tr(`El equipo necesita ${faltante.toLocaleString()} uds en ${diasRestantes} días`, 60),
          detalle: masCercano
            ? [`${masCercano.vendedor} está más cerca`, `Proy: ${proyE.toLocaleString()} · Meta: ${teamStats.meta_equipo.toLocaleString()} uds`]
            : [`Proy: ${proyE.toLocaleString()} uds`, `Meta: ${teamStats.meta_equipo.toLocaleString()} uds`, `${diasRestantes} días para cerrar el mes`],
          chatQ: `El equipo necesita ${faltante.toLocaleString()} unidades más en ${diasRestantes} días. ¿Qué vendedores tienen mayor potencial y qué clientes concretos pueden cerrar esta semana?`,
        })
      } else {
        const lider = vendorAnalysis
          .filter(v => v.meta && v.cumplimiento_pct !== undefined)
          .sort((a, b) => (b.cumplimiento_pct ?? 0) - (a.cumplimiento_pct ?? 0))[0]
        result.push({
          tipo: 'meta',
          titulo: tr(`Meta en camino — ${(teamStats.cumplimiento_equipo ?? 0).toFixed(0)}% cumplido`, 60),
          detalle: lider
            ? [`${lider.vendedor} lidera con ${(lider.cumplimiento_pct ?? 0).toFixed(0)}%`, `Proy: ${proyE.toLocaleString()} uds`]
            : ['El equipo va en ritmo para alcanzar la meta'],
          chatQ: `La meta del equipo está en camino. ¿Cómo aseguramos el cierre y podemos superarla en los ${diasRestantes} días restantes? Dame acciones prioritarias.`,
        })
      }
    }

    // Acción 3 — OPORTUNIDAD: cliente dormido × inventario o mejor oportunidad
    // Excluir actores ya usados en card URGENTE para evitar duplicados
    const dormidosDisponibles = clientesDormidos
      .filter(c => c.recovery_label !== 'perdido' && !actoresUsados.has(c.cliente))
      .sort((a, b) => b.recovery_score - a.recovery_score)
    const estancados = categoriasInventario.filter(c => c.clasificacion === 'sin_movimiento' || c.clasificacion === 'lento_movimiento')

    const clienteOportunidad = dormidosDisponibles[0] ?? null

    if (clienteOportunidad) {
      const top = clienteOportunidad
      const esAlta = top.recovery_label === 'alta'
      const stockMatch = estancados[0]
      result.push({
        tipo: 'oportunidad',
        titulo: tr(`${top.cliente} · ${top.dias_sin_actividad} días sin comprar`, 60),
        detalle: esAlta && stockMatch
          ? [`Score: ${top.recovery_score} · Alta recuperación`, `${stockMatch.producto}: ${stockMatch.unidades_actuales.toLocaleString()} uds`, `Vendedor: ${top.vendedor}`]
          : [`Score: ${top.recovery_score} · ${top.recovery_label === 'alta' ? 'Alta recuperación' : 'Recuperable'}`, `Vendedor: ${top.vendedor}`, top.recovery_explicacion].filter(Boolean),
        chatQ: `${top.cliente} lleva ${top.dias_sin_actividad} días sin comprar. Vendedor: ${top.vendedor}. Dame una estrategia de reactivación con guión de contacto.`,
      })
    } else if (estancados.length > 0) {
      const top = estancados[0]
      result.push({
        tipo: 'oportunidad',
        titulo: tr(`${top.producto} · inventario sin mover`, 60),
        detalle: [`${top.unidades_actuales.toLocaleString()} uds disponibles`, `PM3: ${top.pm3.toFixed(1)}/mes · ${top.dias_inventario} días inv.`, `Categoría: ${top.categoria}`],
        chatQ: `${top.producto} tiene ${top.unidades_actuales} unidades sin mover con PM3 de ${top.pm3.toFixed(1)}. ¿Qué clientes tienen historial con este producto y cómo activamos ventas esta semana?`,
      })
    }

    return result
  }, [insights, teamStats, vendorAnalysis, clientesDormidos, categoriasInventario])

  // Causas narrativas para Momento 2 — 1 causa por dimensión
  type CausaNarrativa = { titulo: string; lineas: string[]; impacto: string; tipo?: string; fuente?: 'supervisor'; dimLabel: string; dimColor: string }
  const causasNarrativas = useMemo<CausaNarrativa[]>(() => {
    const result: CausaNarrativa[] = []
    const sym = configuracion.moneda || ''

    // Posición 1 — CANAL
    if (dataAvailability.has_canal) {
      const causaCanal = causasAtraso
        .filter(c => c.dimension === 'canal')
        .sort((a, b) => b.impacto_uds - a.impacto_uds)[0]
      if (causaCanal) {
        const canalInfo = canalAnalysis.find(c => c.canal === causaCanal.label)
        const lineas: string[] = []

        // Línea 1 — magnitud + participación
        let l1 = `Cayó ${Math.abs(causaCanal.caida_pct)}% vs su promedio histórico.`
        if (canalInfo != null) l1 += ` Representa el ${Math.round(canalInfo.participacion_pct)}% de las ventas totales.`
        lineas.push(l1)

        // Línea 2 — comparación YoY del canal
        {
          const { year, month } = selectedPeriod
          let udsYA = 0, udsHoy = 0
          const diaRef = deferredSales
            .filter(s => s.fecha.getFullYear() === year && s.fecha.getMonth() === month)
            .reduce((max, s) => Math.max(max, s.fecha.getDate()), 1)
          deferredSales.forEach(s => {
            if (s.canal !== causaCanal.label) return
            if (s.fecha.getFullYear() === year - 1 && s.fecha.getMonth() === month && s.fecha.getDate() <= diaRef) udsYA += s.unidades
            if (s.fecha.getFullYear() === year && s.fecha.getMonth() === month) udsHoy += s.unidades
          })
          if (udsYA > 0) {
            lineas.push(`En este mismo período del año pasado este canal generaba ${Math.round(udsYA).toLocaleString('es-SV')} uds. Hoy lleva ${Math.round(udsHoy).toLocaleString('es-SV')} uds.`)
          }
        }

        // Línea 3 — clientes dormidos en este canal
        const vendEnCanal = vendorAnalysis
          .filter(v => v.canal_principal === causaCanal.label && (v.promedio_3m ?? 0) > 0)
        if (dataAvailability.has_cliente && vendEnCanal.length > 0) {
          const nombresVend = new Set(vendEnCanal.map(v => v.vendedor))
          const dormidosCanal = clientesDormidos.filter(c => nombresVend.has(c.vendedor)).length
          if (dormidosCanal > 0) {
            lineas.push(`Clientes dormidos en este canal: ${dormidosCanal}`)
          }
        }

        // Línea 4 — vendedor con mayor caída en este canal
        const vendedorMasCaida = vendEnCanal
          .filter(v => v.variacion_vs_promedio_pct != null)
          .sort((a, b) => (a.variacion_vs_promedio_pct ?? 0) - (b.variacion_vs_promedio_pct ?? 0))[0]
        if (vendedorMasCaida) {
          lineas.push(`Vendedor con mayor caída en este canal: ${vendedorMasCaida.vendedor}`)
        }

        // Línea 5 — categorías con caída
        if (dataAvailability.has_categoria && categoriaAnalysis.length > 0) {
          const catsCaida = categoriaAnalysis
            .filter(c => c.tendencia === 'caida' || c.tendencia === 'colapso')
            .map(c => c.categoria)
            .slice(0, 2)
          if (catsCaida.length > 0) {
            lineas.push(`Categorías más afectadas: ${catsCaida.join(', ')}`)
          }
        }

        const impacto = causaCanal.impacto_uds > 0
          ? `−${causaCanal.impacto_uds.toLocaleString('es-SV')} uds por debajo del ritmo histórico`
          : ''

        result.push({ titulo: `${causaCanal.label} — en caída`, lineas, impacto, tipo: 'riesgo_vendedor', dimLabel: 'CANAL', dimColor: '#60A5FA' })
      }
    }

    // Posición 2 — SUPERVISOR o VENDEDOR
    if (dataAvailability.has_supervisor) {
      const peorZona = [...supervisorAnalysis]
        .filter(s => s.riesgo_zona === 'critico' || s.riesgo_zona === 'riesgo')
        .sort((a, b) => {
          const orden = { critico: 0, riesgo: 1, ok: 2, superando: 3 }
          return orden[a.riesgo_zona] - orden[b.riesgo_zona]
        })[0]
      if (peorZona) {
        const nRiesgo = peorZona.vendedores_criticos + peorZona.vendedores_riesgo
        const lineas: string[] = []

        // Línea 1 — proyección + brecha
        if (peorZona.cumplimiento_pct != null) {
          let l1 = `Proyección de zona: ${peorZona.cumplimiento_pct.toFixed(1)}% de meta.`
          if (peorZona.meta_zona != null) {
            const brecha = Math.round(peorZona.meta_zona - peorZona.proyeccion_cierre)
            if (brecha > 0) l1 += ` Brecha total: ${brecha.toLocaleString('es-SV')} uds.`
          }
          lineas.push(l1)
        }

        // Línea 2 — vendedores críticos con % cumplimiento
        const vendsCriticos = vendorAnalysis
          .filter(v => peorZona.vendedores.includes(v.vendedor) && (v.riesgo === 'critico' || v.riesgo === 'riesgo'))
          .sort((a, b) => (a.cumplimiento_pct ?? 100) - (b.cumplimiento_pct ?? 100))
          .slice(0, 3)
        if (vendsCriticos.length > 0) {
          const textoVends = vendsCriticos.map(v =>
            v.cumplimiento_pct != null ? `${v.vendedor} (${Math.round(v.cumplimiento_pct)}%)` : v.vendedor
          ).join(', ')
          lineas.push(`Vendedores en crítico: ${textoVends}`)
        }

        // Línea 3 — clientes dormidos en la zona
        if (dataAvailability.has_cliente) {
          const nombresZona = new Set(peorZona.vendedores)
          const dormidosZona = clientesDormidos.filter(c => nombresZona.has(c.vendedor))
          if (dormidosZona.length > 0) {
            let l3 = `Clientes dormidos en la zona: ${dormidosZona.length}`
            if (dataAvailability.has_venta_neta) {
              const valorRiesgo = dormidosZona.reduce((s, c) => s + c.valor_historico, 0)
              if (valorRiesgo > 0) l3 += ` — Valor en riesgo: ${sym}${Math.round(valorRiesgo).toLocaleString('es-SV')}`
            }
            lineas.push(l3)
          }
        }

        // Línea 4 — canal principal de la zona
        if (dataAvailability.has_canal) {
          const canalCount = new Map<string, number>()
          vendorAnalysis
            .filter(v => peorZona.vendedores.includes(v.vendedor) && v.canal_principal != null)
            .forEach(v => { const c = v.canal_principal!; canalCount.set(c, (canalCount.get(c) ?? 0) + 1) })
          const canalPrincipalZona = [...canalCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
          if (canalPrincipalZona) {
            const cInfo = canalAnalysis.find(c => c.canal === canalPrincipalZona)
            if (cInfo) {
              const tendText = cInfo.variacion_pct >= 5 ? `subió ${Math.abs(Math.round(cInfo.variacion_pct))}%`
                : cInfo.variacion_pct <= -5 ? `bajó ${Math.abs(Math.round(cInfo.variacion_pct))}%`
                : 'estable'
              lineas.push(`Canal principal de la zona: ${canalPrincipalZona} — Tendencia: ${tendText}`)
            }
          }
        }

        // Línea 5 — categoría más afectada en la zona (si has_categoria)
        if (dataAvailability.has_categoria && categoriaAnalysis.length > 0) {
          const catAfectada = categoriaAnalysis
            .filter(c => c.tendencia === 'colapso' || c.tendencia === 'caida')
            .sort((a, b) => a.variacion_pct - b.variacion_pct)[0]
          if (catAfectada) {
            lineas.push(`Categoría más afectada en la zona: ${catAfectada.categoria} con ${Math.abs(Math.round(catAfectada.variacion_pct))}% de caída`)
          }
        }

        // Línea 6 — ranking vs otras zonas
        if (supervisorAnalysis.length > 1) {
          const zonasSorted = [...supervisorAnalysis]
            .filter(s => s.cumplimiento_pct != null)
            .sort((a, b) => (a.cumplimiento_pct ?? 100) - (b.cumplimiento_pct ?? 100))
          const rank = zonasSorted.findIndex(s => s.supervisor === peorZona.supervisor)
          if (rank === 0) {
            lineas.push('Esta zona tiene el peor desempeño del equipo')
          } else if (rank === 1) {
            lineas.push(`Solo ${zonasSorted[0].supervisor} tiene peor desempeño`)
          }
        }

        const impacto = peorZona.cumplimiento_pct != null ? `Proyección zona: ${peorZona.cumplimiento_pct.toFixed(1)}% de meta` : ''
        result.push({ titulo: `Zona ${peorZona.supervisor} — ${nRiesgo} de ${peorZona.vendedores.length} vendedores en riesgo`, lineas, impacto, fuente: 'supervisor', dimLabel: 'SUPERVISOR', dimColor: '#C4B5FD' })
      }
    } else {
      const byImpacto = (v: typeof vendorAnalysis[0]) => (v.promedio_3m ?? 0) - v.ventas_periodo
      const peorVendedor = (
        [...vendorAnalysis]
          .filter(v => v.riesgo === 'critico' || v.riesgo === 'riesgo')
          .sort((a, b) => byImpacto(b) - byImpacto(a))[0]
        ?? [...vendorAnalysis]
          .sort((a, b) => byImpacto(b) - byImpacto(a))[0]
      )
      if (peorVendedor) {
        const caida = Math.abs(Math.round(peorVendedor.variacion_vs_promedio_pct ?? 0))
        const lineas: string[] = []

        // Línea 1 — proyección vs meta, o YoY si no hay meta
        if (peorVendedor.proyeccion_cierre != null && peorVendedor.meta != null && teamStats != null) {
          const cumpl = Math.round((peorVendedor.proyeccion_cierre / peorVendedor.meta) * 100)
          lineas.push(`Proyecta cerrar ${Math.round(peorVendedor.proyeccion_cierre).toLocaleString('es-SV')} uds de ${Math.round(peorVendedor.meta).toLocaleString('es-SV')} uds (${cumpl}% de cumplimiento). Le quedan ${teamStats.dias_restantes} días.`)
        } else {
          const { year, month } = selectedPeriod
          const diaRef = deferredSales
            .filter(s => s.fecha.getFullYear() === year && s.fecha.getMonth() === month)
            .reduce((max, s) => Math.max(max, s.fecha.getDate()), 1)
          let udsYA = 0, udsHoy = 0
          deferredSales.forEach(s => {
            if (s.vendedor !== peorVendedor.vendedor) return
            if (s.fecha.getFullYear() === year - 1 && s.fecha.getMonth() === month && s.fecha.getDate() <= diaRef) udsYA += s.unidades
            if (s.fecha.getFullYear() === year && s.fecha.getMonth() === month) udsHoy += s.unidades
          })
          if (udsYA > 0) {
            const hoyTexto = udsHoy > 0
              ? `Hoy lleva ${Math.round(udsHoy).toLocaleString('es-SV')} uds.`
              : 'Hoy no registra ventas en el período.'
            lineas.push(`En este mismo período del año pasado llevaba ${Math.round(udsYA).toLocaleString('es-SV')} uds. ${hoyTexto}`)
          }
        }

        // Línea 2 — causa de la caída (clientes)
        if (dataAvailability.has_cliente) {
          const insightCaida = insights.find(i => i.vendedor === peorVendedor.vendedor && i.cliente != null)
          if (insightCaida?.cliente) {
            const diasSin = clientesDormidos.find(c => c.cliente === insightCaida.cliente)?.dias_sin_actividad
            lineas.push(diasSin != null
              ? `${insightCaida.cliente} explica parte de su caída. Lleva ${diasSin} días sin comprar.`
              : `${insightCaida.cliente} explica parte de su caída.`
            )
          } else {
            const dormidosVend = clientesDormidos.filter(c => c.vendedor === peorVendedor.vendedor)
            if (dormidosVend.length > 0) {
              lineas.push(`Sus clientes activos tienen ${dormidosVend.length} dormidos este período.`)
            }
          }
        }

        // Línea 3 — productos ausentes
        if (dataAvailability.has_producto && (peorVendedor.productos_ausentes?.length ?? 0) > 0) {
          const ausentes = peorVendedor.productos_ausentes!.slice(0, 3).map(p => p.producto).join(', ')
          lineas.push(`Productos que dejó de vender este mes: ${ausentes}`)
        }

        // Línea 4 — canal
        if (dataAvailability.has_canal && peorVendedor.canal_principal) {
          const cInfo = canalAnalysis.find(c => c.canal === peorVendedor.canal_principal)
          if (cInfo) {
            const nombreCanal = peorVendedor.canal_principal.trim()
            const canalLabel = nombreCanal.toLowerCase().startsWith('canal')
              ? nombreCanal
              : `canal ${nombreCanal}`
            const absPct = Math.abs(Math.round(cInfo.variacion_pct))
            let canalFrase: string
            if (absPct > 99 && cInfo.variacion_pct < 0) {
              canalFrase = `Opera principalmente en ${canalLabel}. Ese canal no registra actividad este período.`
            } else if (cInfo.variacion_pct <= -5) {
              canalFrase = `Opera principalmente en ${canalLabel}. Ese canal bajó ${absPct}% este período.`
            } else if (cInfo.variacion_pct >= 5) {
              canalFrase = `Opera principalmente en ${canalLabel}. Ese canal subió ${absPct}% este período.`
            } else {
              canalFrase = `Opera principalmente en ${canalLabel}. Ese canal está estable este período.`
            }
            lineas.push(canalFrase)
          }
        }

        // Línea 5 — categorías sin ventas este mes (productos_ausentes → lookup en categoriasInventario)
        if (dataAvailability.has_categoria && (peorVendedor.productos_ausentes?.length ?? 0) > 0) {
          const catsSinVenta = new Set(
            peorVendedor.productos_ausentes!
              .map(p => categoriasInventario.find(ci => ci.producto === p.producto)?.categoria)
              .filter((c): c is string => c != null && c.trim() !== '' && c !== 'Sin categoría')
          )
          if (catsSinVenta.size > 0) {
            lineas.push(`Categorías sin ventas este mes: ${[...catsSinVenta].slice(0, 3).join(', ')}`)
          }
        }

        // Línea 6 — productos lentos que podría mover
        if (dataAvailability.has_inventario && (peorVendedor.productos_lentos_con_historial?.length ?? 0) > 0) {
          const lentos = peorVendedor.productos_lentos_con_historial!.slice(0, 2).map(p => p.producto).join(', ')
          lineas.push(`Productos lentos que podría mover: ${lentos}`)
        }

        // Línea 7 — YTD
        if (peorVendedor.ytd_actual != null && peorVendedor.ytd_anterior != null && peorVendedor.ytd_anterior > 0) {
          const ytdPct = Math.round(((peorVendedor.ytd_actual - peorVendedor.ytd_anterior) / peorVendedor.ytd_anterior) * 100)
          if (ytdPct < 0) {
            lineas.push(`También cae en YTD: ${Math.abs(ytdPct)}% vs año anterior — no es solo este mes`)
          } else if (ytdPct > 0) {
            lineas.push(`YTD positivo (+${ytdPct}%) — el problema es específico de este período`)
          }
        }

        // Impacto
        let impacto = ''
        if (dataAvailability.has_metas && peorVendedor.meta != null && peorVendedor.proyeccion_cierre != null) {
          const faltante = Math.round(peorVendedor.meta - peorVendedor.proyeccion_cierre)
          if (faltante > 0) impacto = `${faltante.toLocaleString('es-SV')} uds para cerrar meta`
        }

        result.push({ titulo: `${peorVendedor.vendedor} cayó ${caida}%`, lineas, impacto, tipo: 'riesgo_vendedor', dimLabel: 'VENDEDOR', dimColor: '#60A5FA' })
      }
    }

    // Posición 3 — CLIENTE
    if (dataAvailability.has_cliente) {
      const topDormido = (
        [...clientesDormidos].filter(c => c.recovery_label !== 'perdido')
          .sort((a, b) => b.recovery_score - a.recovery_score)[0]
        ?? [...clientesDormidos].sort((a, b) => b.recovery_score - a.recovery_score)[0]
      )
      if (topDormido) {
        const lineas: string[] = []

        // Línea 1 — tiempo + frecuencia esperada
        let l1 = `${topDormido.dias_sin_actividad} días sin comprar.`
        if (topDormido.frecuencia_esperada_dias != null) {
          l1 += ` Compraba normalmente cada ${topDormido.frecuencia_esperada_dias} días.`
        }
        lineas.push(l1)

        // Línea 2 — valor histórico
        if (topDormido.valor_historico > 0) {
          lineas.push(`Valor histórico mensual: ${Math.round(topDormido.valor_historico).toLocaleString('es-SV')} uds`)
        }

        // Línea 3 — vendedor responsable
        if (dataAvailability.has_canal) {
          lineas.push(`Vendedor responsable: ${topDormido.vendedor}`)
        }

        // Línea 4 — categoría principal del cliente (desde deferredSales)
        if (dataAvailability.has_categoria) {
          const catCount = new Map<string, number>()
          deferredSales.forEach(s => {
            if (s.cliente === topDormido.cliente && s.categoria) {
              catCount.set(s.categoria, (catCount.get(s.categoria) ?? 0) + s.unidades)
            }
          })
          if (catCount.size > 0) {
            const catPrincipal = [...catCount.entries()].sort((a, b) => b[1] - a[1])[0][0]
            const catInfo = categoriaAnalysis.find(c => c.categoria === catPrincipal)
            let lCat = `Categoría principal: ${catPrincipal}`
            if (catInfo?.tendencia === 'colapso') lCat += ' — categoría en colapso, puede explicar el abandono'
            else if (catInfo?.tendencia === 'caida') lCat += ` — categoría cayó ${Math.abs(Math.round(catInfo.variacion_pct))}%, puede estar relacionado`
            lineas.push(lCat)
          }
        }

        // Línea 6 — stock disponible de sus productos (cruce histórico cliente × inventario por producto)
        if (dataAvailability.has_inventario) {
          const productosCliente = new Set(
            deferredSales
              .filter(s => (s.cliente ?? s.codigo_cliente) === topDormido.cliente)
              .map(s => s.producto ?? s.codigo_producto)
              .filter((p): p is string => p != null && p.trim() !== '')
          )
          const stockCruzado = categoriasInventario
            .filter(inv => productosCliente.has(inv.producto) && inv.unidades_actuales > 0)
            .slice(0, 2)
          if (stockCruzado.length > 0) {
            const textoStock = stockCruzado.map(p => `${Math.round(p.unidades_actuales)} uds de ${p.producto}`).join(', ')
            lineas.push(`Stock disponible de sus productos: ${textoStock}`)
          }
        }

        // Línea 7 — comparación YoY mismo mes
        {
          const { year, month } = selectedPeriod
          let udsYA = 0
          deferredSales.forEach(s => {
            if (s.cliente === topDormido.cliente && s.fecha.getFullYear() === year - 1 && s.fecha.getMonth() === month) {
              udsYA += s.unidades
            }
          })
          if (udsYA > 0) {
            lineas.push(`En ${MESES_LARGO[month]} ${year - 1} compraba ${Math.round(udsYA).toLocaleString('es-SV')} uds — lleva ${topDormido.dias_sin_actividad} días sin actividad en este período`)
          } else {
            const hadSalesLastYear = deferredSales.some(s => s.cliente === topDormido.cliente && s.fecha.getFullYear() === year - 1)
            if (hadSalesLastYear) {
              lineas.push('No compraba en este mes el año pasado — patrón posiblemente estacional')
            }
          }
        }

        const impacto = topDormido.valor_historico > 0
          ? `Valor en riesgo: ${Math.round(topDormido.valor_historico).toLocaleString('es-SV')} uds`
          : ''

        result.push({ titulo: `${topDormido.cliente} — sin actividad`, lineas, impacto, tipo: 'riesgo_cliente', dimLabel: 'CLIENTE', dimColor: '#4ADE80' })
      }
    }

    return result
  }, [causasAtraso, vendorAnalysis, supervisorAnalysis, clientesDormidos, canalAnalysis, categoriaAnalysis, categoriasInventario, insights, teamStats, dataAvailability, configuracion, deferredSales, selectedPeriod])

  // ── Feed unificado ────────────────────────────────────────────────────────
  const feedInsights = useMemo(() =>
    [...insights].sort((a, b) => (PRIORIDAD_ORDER[b.prioridad] || 0) - (PRIORIDAD_ORDER[a.prioridad] || 0)),
    [insights]
  )

  // Helper: obtiene el estado de un insight desde el store
  const getStatus = useCallback((insight: Insight): AlertStatus => {
    return alertStatuses[getAlertKey(insight)]?.status ?? 'pending'
  }, [alertStatuses])

  // Helper: indica si un insight fue reabierto automáticamente
  const isReopened = useCallback((insight: Insight): boolean => {
    const key = getAlertKey(insight)
    return !!alertStatuses[key]?.reopenedAt && alertStatuses[key]?.status === 'pending'
  }, [alertStatuses])

  const feedFiltered = useMemo(() => {
    const filterDef = FEED_FILTERS.find(f => f.key === feedFilter) ?? FEED_FILTERS[0]
    const byType = feedInsights.filter(i => filterDef.match(i.tipo))

    // Filtrar por estado
    const byStatus = byType.filter(i => {
      const s = alertStatuses[getAlertKey(i)]?.status ?? 'pending'
      if (statusFilter === 'notResolved') return s !== 'resolved'
      if (statusFilter === 'following')   return s === 'following'
      if (statusFilter === 'resolved')    return s === 'resolved'
      return true
    })

    // Las resueltas van al final cuando se ven en modo notResolved (no aplica porque las filtramos)
    // Al ver "todas" sin filtro de estado: resueltas al final
    let result: Insight[]
    if (statusFilter === 'notResolved') {
      result = [
        ...byStatus.filter(i => getStatus(i) === 'pending'),
        ...byStatus.filter(i => getStatus(i) === 'following'),
      ]
    } else {
      result = byStatus
    }
    // Sort by impact level within each status group
    result.sort((a, b) => IMPACT_ORDER[getImpactLevel(b)] - IMPACT_ORDER[getImpactLevel(a)])
    return result
  }, [feedInsights, feedFilter, alertStatuses, statusFilter, getStatus])

  const feedFilterCounts = useMemo(() => {
    const counts: Record<FeedFilterKey, number> = { all: feedInsights.length, riesgos: 0, hallazgo: 0, cruzado: 0 }
    feedInsights.forEach(i => {
      if (i.tipo.startsWith('riesgo_')) counts.riesgos++
      else if (i.tipo === 'hallazgo') counts.hallazgo++
      else if (i.tipo === 'cruzado') counts.cruzado++
    })
    return counts
  }, [feedInsights])

  const statusCounts = useMemo(() => {
    const counts = { notResolved: 0, following: 0, resolved: 0 }
    feedInsights.forEach(i => {
      const filterDef = FEED_FILTERS.find(f => f.key === feedFilter) ?? FEED_FILTERS[0]
      if (!filterDef.match(i.tipo)) return
      const s = alertStatuses[getAlertKey(i)]?.status ?? 'pending'
      if (s === 'resolved') counts.resolved++
      else if (s === 'following') { counts.following++; counts.notResolved++ }
      else counts.notResolved++
    })
    return counts
  }, [feedInsights, alertStatuses, feedFilter])

  const pendingCount = useMemo(() =>
    feedInsights.filter(i => {
      const s = alertStatuses[getAlertKey(i)]?.status ?? 'pending'
      return s === 'pending'
    }).length,
  [feedInsights, alertStatuses])

  const urgentPendingCount = useMemo(() =>
    feedInsights.filter(i => {
      const s = alertStatuses[getAlertKey(i)]?.status ?? 'pending'
      return s === 'pending' && (i.prioridad === 'CRITICA' || i.prioridad === 'ALTA')
    }).length,
  [feedInsights, alertStatuses])

  const handleStatusChange = useCallback(async (
    insight: Insight,
    newStatus: AlertStatus,
    note?: string,
  ) => {
    const key = getAlertKey(insight)
    await setAlertStatus(key, newStatus, note)
    const labels: Record<AlertStatus, string> = {
      pending:   '📋 Alerta marcada como pendiente',
      following: '🔧 Alerta en trabajo',
      resolved:  '✅ Alerta resuelta',
    }
    toast(labels[newStatus])
    setOpenDropdownKey(null)
  }, [setAlertStatus])

  const handleAnalyzeInsight = useCallback(async (insight: Insight) => {
    setAnalysisMap(prev => ({ ...prev, [insight.id]: { loading: true, text: null } }))

    const userPrompt =
      `Insight: ${insight.titulo}\n` +
      `Descripción: ${insight.descripcion}\n` +
      `Tipo: ${insight.tipo} · Prioridad: ${insight.prioridad}\n` +
      (insight.vendedor ? `Vendedor: ${insight.vendedor}\n` : '') +
      (insight.cliente ? `Cliente: ${insight.cliente}\n` : '') +
      (insight.producto ? `Producto: ${insight.producto}\n` : '') +
      (insight.impacto_economico ? `Impacto: ${configuracion.moneda} ${insight.impacto_economico.valor.toLocaleString()} — ${insight.impacto_economico.descripcion}\n` : '') +
      (insight.accion_sugerida ? `Acción sugerida: ${insight.accion_sugerida}\n` : '')

    const systemPrompt =
      `Eres un analista comercial.\n` +
      `Responde SIEMPRE en este formato exacto, sin introducción ni cierre:\n\n` +
      `📊 RESUMEN: [Una oración de máximo 15 palabras con el hallazgo principal]\n\n` +
      `🔺 CRECIMIENTO:\n- [Bullet con dato específico si aplica]\n\n` +
      `🔻 CAÍDA:\n- [Bullet con dato específico si aplica]\n\n` +
      `💡 HALLAZGO: [Un dato concreto no obvio — con números específicos]\n\n` +
      `Reglas:\n` +
      `- Máximo 120 palabras en total\n` +
      `- Cada bullet debe tener un número concreto\n` +
      `- Si una sección no aplica, omítela\n` +
      `- NUNCA hagas preguntas al usuario\n` +
      `- NUNCA des instrucciones operativas\n` +
      `- Responde en español`

    try {
      const json = await callAI(
        [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        { model: 'deepseek-chat', max_tokens: 300, temperature: 0.3 },
      )
      setAnalysisMap(prev => ({ ...prev, [insight.id]: { loading: false, text: json.choices?.[0]?.message?.content ?? 'Sin respuesta' } }))
    } catch (err) {
      const code = err instanceof Error ? err.message : ''
      const msg = code === 'INVALID_KEY'
        ? 'API key no configurada. Ve a Configuración → Asistente IA.'
        : code === 'RATE_LIMIT'
          ? 'Límite de requests alcanzado. Intenta en unos segundos.'
          : 'No se pudo conectar con el asistente IA.'
      setAnalysisMap(prev => ({ ...prev, [insight.id]: { loading: false, text: msg } }))
    }
  }, [configuracion])

  // ── YTD chart data (mensual individual: año actual vs anterior) ──
  // Must be before early return to respect Rules of Hooks
  const ytdChart = useMemo(() => {
    const currentYear = selectedPeriod.year
    const previousYear = currentYear - 1
    const currentMonth = selectedPeriod.month // 0-based in store
    const maxDay = maxDate.getDate() // día máximo del mes actual para comparación justa

    const data: { month: string; actual: number; anterior: number; isPartial: boolean; daysElapsed: number; daysTotal: number }[] = []
    let totalActual = 0
    let totalAnterior = 0

    for (let m = 0; m <= currentMonth; m++) {
      const isCurrentMonth = m === currentMonth
      const daysInMonth = new Date(currentYear, m + 1, 0).getDate()

      const ventasActual = sales
        .filter(s => { const d = new Date(s.fecha); return d.getFullYear() === currentYear && d.getMonth() === m })
        .reduce((sum, s) => sum + s.unidades, 0)

      // Para el mes actual: solo contar ventas del año anterior hasta el mismo día
      const ventasAnterior = sales
        .filter(s => {
          const d = new Date(s.fecha)
          if (d.getFullYear() !== previousYear || d.getMonth() !== m) return false
          if (isCurrentMonth && d.getDate() > maxDay) return false
          return true
        })
        .reduce((sum, s) => sum + s.unidades, 0)

      totalActual += ventasActual
      totalAnterior += ventasAnterior

      data.push({
        month: MESES_CORTO[m],
        actual: ventasActual,
        anterior: ventasAnterior,
        isPartial: isCurrentMonth,
        daysElapsed: isCurrentMonth ? maxDay : daysInMonth,
        daysTotal: daysInMonth,
      })
    }
    return { data, totalActual, totalAnterior, maxDay }
  }, [sales, selectedPeriod.year, selectedPeriod.month, maxDate])

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
      <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm" style={{ background: 'color-mix(in srgb, var(--sf-page) 95%, transparent)' }}>
        <div className="rounded-2xl p-10 max-w-sm w-full mx-4 shadow-2xl flex flex-col items-center gap-6" style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border-subtle)' }}>
          <div className="w-14 h-14 rounded-xl bg-[#00D68F]/10 border border-[#00D68F]/20 flex items-center justify-center">
            <svg className="w-7 h-7 text-[#00D68F] animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          </div>
          <div className="text-center space-y-1">
            <h3 className="text-base font-bold text-[var(--sf-t2)]">Analizando ventas...</h3>
            <p className="text-xs text-[var(--sf-t4)] min-h-[1.2rem]">{loadingMessage || current.label}</p>
          </div>
          <div className="w-full space-y-3">
            <div className="w-full rounded-full h-1.5 overflow-hidden" style={{ background: 'var(--sf-inset)' }}>
              <div
                className="h-1.5 bg-[#00D68F] rounded-full transition-all duration-700"
                style={{ width: `${current.pct}%` }}
              />
            </div>
            <div className="space-y-1.5">
              {STEPS.slice(0, -1).map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors duration-300 ${i < analysisStep ? 'bg-[#00D68F]' : i === analysisStep ? 'bg-[#00D68F] animate-pulse' : 'bg-[var(--sf-border-subtle)]'}`} />
                  <span className={i <= analysisStep ? 'text-[var(--sf-t3)]' : 'text-[var(--sf-t7)]'}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-[var(--sf-t7)]">
            {sales.length.toLocaleString()} registros · esto puede tomar unos segundos
          </p>
        </div>
      </div>
    )
  }

  const criticos       = vendorAnalysis.filter((v) => v.riesgo === 'critico').length
  const enRiesgo       = vendorAnalysis.filter((v) => v.riesgo === 'riesgo').length
  const okSolo         = vendorAnalysis.filter((v) => v.riesgo === 'ok').length
  const superandoCount = vendorAnalysis.filter((v) => v.riesgo === 'superando').length
  // Derived card metrics
  const dormidosRec      = clientesDormidos.filter(c => c.recovery_label === 'alta' || c.recovery_label === 'recuperable')
  const activosMes       = new Set(salesActual.filter(s => s.cliente).map(s => s.cliente)).size
  const valorRiesgoClien = dormidosRec.reduce((s, c) => s + c.valor_historico, 0)
  const canalPrincipal   = [...canalAnalysis].sort((a, b) => b.participacion_pct - a.participacion_pct)[0] ?? null
  const canalesActivos   = canalAnalysis.filter(c => c.activo_periodo).length
  const canalesEnCaida   = canalAnalysis.filter(c => c.tendencia === 'caida' || c.tendencia === 'desaparecido').length
  const sinMovimiento    = categoriasInventario.filter(c => c.clasificacion === 'sin_movimiento').length
  const riesgoQuiebre    = categoriasInventario.filter(c => c.clasificacion === 'riesgo_quiebre').length
  const bajaCob          = categoriasInventario.filter(c => c.clasificacion === 'baja_cobertura').length
  const lentoMov         = categoriasInventario.filter(c => c.clasificacion === 'lento_movimiento').length
  const normalInv        = categoriasInventario.filter(c => c.clasificacion === 'normal').length

  const ytdVar  = teamStats.variacion_ytd_equipo
  const ytdAnno = maxDate.getFullYear()

  const ytdDiff = ytdChart.totalActual - ytdChart.totalAnterior
  const ytdChartUp = ytdDiff >= 0
  const ytdChartPct = ytdChart.totalAnterior > 0
    ? ((ytdDiff / ytdChart.totalAnterior) * 100)
    : null

  const rawMesLabel = new Date(selectedPeriod.year, selectedPeriod.month, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
  const mesLabel = rawMesLabel.charAt(0).toUpperCase() + rawMesLabel.slice(1)

  // proyección de ingresos: misma lógica diaria que proyeccion_cierre en unidades
  const proyeccion_neta = dataAvailability.has_venta_neta && estadoMes.diasTranscurridos > 0
    ? Math.round((estadoMes.ingreso_actual / estadoMes.diasTranscurridos) * estadoMes.diasTotales)
    : 0
  // YTD en dólares: usar los campos _neto calculados en el motor (suma directa de venta_neta)
  const ytd_neto = dataAvailability.has_venta_neta
    ? vendorAnalysis.reduce((sum, v) => sum + (v.ytd_actual_neto ?? 0), 0)
    : 0
  const ytd_anterior_neto = dataAvailability.has_venta_neta
    ? vendorAnalysis.reduce((sum, v) => sum + (v.ytd_anterior_neto ?? 0), 0)
    : 0

  // FIX 2: fecha de comparación YTD año anterior
  const fechaComp = new Date(selectedPeriod.year - 1, selectedPeriod.month, maxDate.getDate())
  const fechaCompLabel = `${fechaComp.getDate()} de ${MESES_LARGO[fechaComp.getMonth()]} de ${fechaComp.getFullYear()}`

  const cumplimientoFinal = teamStats?.meta_equipo
    ? (proyFinal / teamStats.meta_equipo) * 100
    : (teamStats?.cumplimiento_equipo ?? 0)

  return (
    <>

      {/* â"€â"€ CSS: Google Fonts + Animaciones â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500&family=Inter:wght@400;500;600;700;800;900&display=swap');
        @keyframes intelFadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulseDanger {
          0%, 100% { transform: scale(1);   opacity: 1;   }
          50%       { transform: scale(1.4); opacity: 0.4; }
        }
        .intel-fade { opacity: 0; animation: intelFadeUp 0.45s ease-out forwards; }
        .pulse-danger { animation: pulseDanger 2s ease-in-out infinite; }
        .action-detail-line { max-width: 100%; }
      `}</style>

      {/* VendedorPanel */}
      {vendedorPanel && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setVendedorPanel(null)} />
          <VendedorPanel
            vendedor={vendedorPanel}
            insights={insights}
            sales={sales}
            selectedPeriod={selectedPeriod}
            allVendorAnalysis={vendorAnalysis}
            clientesDormidos={clientesDormidos}
            dataAvailability={dataAvailability}
            onClose={() => setVendedorPanel(null)}
          />
        </>
      )}

      {/* â"€â"€ CONTENIDO PRINCIPAL â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      <div style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* â"€â"€ CONTEXT HEADER â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      <div
        className="intel-fade border-b border-[var(--sf-border)] pb-3 mb-6 flex items-center gap-3 flex-wrap"
        style={{ animationDelay: '0ms' }}
      >
        <span className="text-[13px] font-semibold" style={{ color: 'var(--sf-t2)' }}>
          {configuracion.empresa}
        </span>
        {urgentPendingCount > 0 ? (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
            ⚠ Atención — {urgentPendingCount} alerta{urgentPendingCount > 1 ? 's' : ''} urgente{urgentPendingCount > 1 ? 's' : ''}
          </span>
        ) : insights.length > 0 ? (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: 'var(--sf-green-bg)', color: 'var(--sf-green)', border: '1px solid var(--sf-green-border)' }}>
            ✓ En orden
          </span>
        ) : null}
        <div className="sf-no-print relative flex items-center">
          <Calendar className="absolute left-2 w-3 h-3 pointer-events-none" style={{ color: 'var(--sf-t5)' }} />
          <select
            value={`${selectedPeriod.year}-${selectedPeriod.month}`}
            onChange={e => {
              const [y, m] = e.target.value.split('-').map(Number)
              setSelectedPeriod({ year: y, month: m })
            }}
            className="appearance-none focus:outline-none cursor-pointer"
            style={{
              background: 'var(--sf-inset)',
              border: '1px solid var(--sf-border)',
              borderRadius: 20,
              color: 'var(--sf-t2)',
              fontSize: 11,
              fontWeight: 500,
              padding: '4px 24px 4px 24px',
              height: 28,
            }}
          >
            {availableMonths.map(({ year, month }) => {
              const label = `${MESES_CORTO[month]} ${year}`
              return <option key={`${year}-${month}`} value={`${year}-${month}`}>{label}</option>
            })}
          </select>
          <ChevronDown className="absolute right-2 w-3 h-3 pointer-events-none" style={{ color: 'var(--sf-t5)' }} />
        </div>
        {/* Comparison toggle */}
        <button
          className="sf-no-print flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium cursor-pointer transition-colors"
          style={{
            background: comparisonEnabled ? 'var(--sf-green-bg)' : 'var(--sf-inset)',
            color: comparisonEnabled ? 'var(--sf-green)' : 'var(--sf-t4)',
            border: comparisonEnabled ? '1px solid var(--sf-green-border)' : '1px solid var(--sf-border)',
          }}
          onClick={() => {
            if (!comparisonEnabled && !canAccess('period_comparison')) {
              setShowUpgradeModal(true)
              return
            }
            toggleComparison()
          }}
          title="Comparar con período anterior"
        >
          <GitCompare className="w-3 h-3" />
          {comparisonEnabled && comparisonPeriod
            ? `vs ${MESES_CORTO[comparisonPeriod.month]} ${comparisonPeriod.year}`
            : 'Comparar'}
        </button>
        {comparisonEnabled && comparisonPeriod && (
          <div className="sf-no-print relative flex items-center">
            <select
              value={`${comparisonPeriod.year}-${comparisonPeriod.month}`}
              onChange={e => {
                const [y, m] = e.target.value.split('-').map(Number)
                setComparisonPeriod({ year: y, month: m })
              }}
              className="appearance-none focus:outline-none cursor-pointer"
              style={{
                background: 'var(--sf-green-bg)',
                border: '1px solid var(--sf-green-border)',
                borderRadius: 20,
                color: 'var(--sf-green)',
                fontSize: 10,
                fontWeight: 500,
                padding: '3px 20px 3px 8px',
                height: 26,
              }}
            >
              {availableMonths
                .filter(({ year, month }) => !(year === selectedPeriod.year && month === selectedPeriod.month))
                .map(({ year, month }) => (
                  <option key={`c-${year}-${month}`} value={`${year}-${month}`}>
                    {MESES_CORTO[month]} {year}
                  </option>
                ))
              }
            </select>
            <ChevronDown className="absolute right-1.5 w-2.5 h-2.5 pointer-events-none" style={{ color: 'var(--sf-green)' }} />
          </div>
        )}
        <span
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px]"
          style={{ background: 'var(--sf-inset)', color: 'var(--sf-t4)' }}
        >
          <Calendar className="w-3 h-3" />
          Día {teamStats.dias_transcurridos} de {teamStats.dias_totales}
        </span>
        <span
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
          style={{ background: 'var(--sf-green-bg)', color: 'var(--sf-green)' }}
          title="Registros procesados del archivo de ventas cargado"
        >
          <Database className="w-3 h-3" />
          {sales.length.toLocaleString()} registros
        </span>
        <button
          className="sf-no-print flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium cursor-pointer transition-colors ml-auto"
          style={{ background: 'var(--sf-inset)', color: 'var(--sf-t4)', border: '1px solid var(--sf-border)' }}
          onClick={() => window.print()}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--sf-green)'; e.currentTarget.style.color = 'var(--sf-green)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--sf-border)'; e.currentTarget.style.color = 'var(--sf-t4)' }}
          title="Exportar como PDF (Ctrl+P)"
        >
          <Printer className="w-3 h-3" />
          Exportar PDF
        </button>
      </div>

      {/* ── COMPARISON SUMMARY ────────────────────────────────────────────── */}
      {comparisonEnabled && comparisonPeriod && (
        <ComparisonSummary sales={sales} insights={insights} compPeriod={comparisonPeriod} />
      )}
      {showUpgradeModal && (
        <UpgradePrompt feature="period_comparison" onClose={() => setShowUpgradeModal(false)} />
      )}

      {/* ── KPI CARDS ──────────────────────────────────────────────────────── */}
      <div className="intel-fade grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6" style={{ animationDelay: '30ms' }}>
        {/* Card 1 — VENTAS YTD */}
        <div className="rounded-xl p-4" style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--sf-t5)' }}>Ventas YTD</p>
          <p className="text-2xl font-bold" style={{ fontFamily: "'DM Mono', monospace", color: 'var(--sf-t1)' }}>
            {ytdChart.totalActual >= 1_000_000 ? `${(ytdChart.totalActual / 1_000_000).toFixed(1)}M` : ytdChart.totalActual >= 1000 ? `${(ytdChart.totalActual / 1000).toFixed(1)}k` : ytdChart.totalActual.toLocaleString()}
            <span className="text-sm font-normal ml-1" style={{ color: 'var(--sf-t5)' }}>uds</span>
          </p>
          {dataAvailability.has_venta_neta && ytd_neto > 0 && (
            <p className="text-xs mt-1" style={{ color: 'var(--sf-t4)' }}>{configuracion.moneda} {Math.round(ytd_neto).toLocaleString('es-SV')}</p>
          )}
        </div>

        {/* Card 2 — VS AÑO ANTERIOR */}
        <div className="rounded-xl p-4" style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--sf-t5)' }}>Vs misma fecha {selectedPeriod.year - 1}</p>
          <p className="text-2xl font-bold" style={{ fontFamily: "'DM Mono', monospace", color: ytdVar == null ? 'var(--sf-t5)' : ytdVar >= 0 ? 'var(--sf-green)' : 'var(--sf-red)' }}>
            {ytdVar == null ? '—' : `${ytdVar >= 0 ? '+' : ''}${ytdVar.toFixed(1)}%`}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--sf-t5)' }}>
            {dataAvailability.has_venta_neta && ytd_anterior_neto > 0
              ? `${configuracion.moneda} ${Math.round(ytd_anterior_neto).toLocaleString('es-SV')} al ${fechaCompLabel}`
              : teamStats.ytd_anterior_equipo
                ? `${Math.round(teamStats.ytd_anterior_equipo).toLocaleString('es-SV')} uds al ${fechaCompLabel}`
                : ''}
          </p>
        </div>

        {/* Card 3 — PROYECCIÓN CIERRE */}
        {(() => {
          const hasNeta = dataAvailability.has_venta_neta
          const proyVal = hasNeta ? proyeccion_neta : estadoMes.proyeccion_cierre
          const hasMeta = !!teamStats?.meta_equipo && teamStats.meta_equipo > 0
          // Compare projection against meta (in units); for neta use proportional scaling
          const metaVal = hasMeta ? teamStats!.meta_equipo! : 0
          const proyVsMeta = hasMeta ? Math.round((proyVal / (hasNeta ? (metaVal * (proyeccion_neta / (estadoMes.proyeccion_cierre || 1))) : metaVal)) * 100) : null
          // Simpler: compare proyFinal (units) vs meta_equipo (units)
          const proyVsMetaPct = hasMeta ? Math.round((proyFinal / metaVal) * 100) : null
          const metaColor = proyVsMetaPct !== null ? (proyVsMetaPct >= 100 ? 'var(--sf-green)' : 'var(--sf-red)') : 'var(--sf-t1)'
          return (
            <div className="rounded-xl p-4" style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--sf-t5)' }}>Proyección cierre</p>
              <p className="text-2xl font-bold" style={{ fontFamily: "'DM Mono', monospace", color: metaColor }}>
                {hasNeta ? `${configuracion.moneda} ${Math.round(proyVal).toLocaleString('es-SV')}` : (
                  <>{Math.round(proyVal).toLocaleString('es-SV')}<span className="text-sm font-normal ml-1" style={{ color: 'var(--sf-t5)' }}>uds</span></>
                )}
              </p>
              {proyVsMetaPct !== null ? (
                <p className="text-xs font-semibold mt-1" style={{ color: metaColor }}>
                  vs meta: {proyVsMetaPct}%
                </p>
              ) : (
                <p className="text-xs mt-1" style={{ color: 'var(--sf-t5)' }}>Sin meta configurada</p>
              )}
            </div>
          )
        })()}

        {/* Card 4 — META DEL MES */}
        <div className="rounded-xl p-4" style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--sf-t5)' }}>Meta del mes</p>
          {teamStats?.meta_equipo ? (
            <>
              <p className="text-2xl font-bold" style={{ fontFamily: "'DM Mono', monospace", color: cumplimientoFinal >= 100 ? 'var(--sf-green)' : cumplimientoFinal >= 70 ? 'var(--sf-t1)' : 'var(--sf-red)' }}>
                {Math.round(cumplimientoFinal)}%
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--sf-t4)' }}>
                {estadoMes.actual.toLocaleString()} / {teamStats.meta_equipo.toLocaleString()} uds
              </p>
              <div className="mt-2 rounded-full overflow-hidden" style={{ height: 4, background: 'var(--sf-inset)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(cumplimientoFinal, 100)}%`, background: cumplimientoFinal >= 100 ? 'var(--sf-green)' : cumplimientoFinal >= 70 ? '#eab308' : 'var(--sf-red)' }} />
              </div>
            </>
          ) : (
            <p className="text-sm mt-1" style={{ color: 'var(--sf-t5)' }}>Sin meta configurada</p>
          )}
        </div>
      </div>

      <div className="space-y-8">

      {/* ── EVOLUCIÓN YTD (ancho completo) ─────────────────────────────────── */}
      <div className="intel-fade" style={{ animationDelay: '60ms' }}>
        <div className="rounded-2xl p-4 flex flex-col" style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.15em]" style={{ color: 'var(--sf-t5)' }}>Evolución YTD</p>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: '#22c55e' }} />
                <span style={{ color: 'var(--sf-t3)' }}>{selectedPeriod.year} sobre anterior</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: '#ef4444' }} />
                <span style={{ color: 'var(--sf-t3)' }}>{selectedPeriod.year} bajo anterior</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--sf-t5, #b5ada4)', opacity: 0.4 }} />
                <span style={{ color: 'var(--sf-t4)' }}>{selectedPeriod.year - 1}</span>
              </span>
            </div>
          </div>

          {ytdChart.data.length > 0 ? (
            <div className="flex-1" style={{ minHeight: 200 }}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={ytdChart.data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barGap={2} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--sf-border, rgba(255,255,255,0.06))" vertical={false} />
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={(props: { x: number; y: number; payload: { value: string; index: number } }) => {
                      const entry = ytdChart.data[props.payload.index]
                      return (
                        <g>
                          <text x={props.x} y={props.y + 12} textAnchor="middle" fontSize={11} fill="var(--sf-t4, #8c857d)">
                            {props.payload.value}
                          </text>
                          {entry?.isPartial && (
                            <text x={props.x} y={props.y + 24} textAnchor="middle" fontSize={9} fill="var(--sf-t5, #b5ada4)">
                              Día {entry.daysElapsed}/{entry.daysTotal}
                            </text>
                          )}
                        </g>
                      )
                    }}
                  />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--sf-t5, #b5ada4)' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} width={40} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      `${Number(value).toLocaleString('es-SV')} uds`,
                      name,
                    ]}
                    contentStyle={{ background: 'var(--sf-card, #1a1a2e)', border: '1px solid var(--sf-border, #e5e1db)', borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="anterior" name={String(selectedPeriod.year - 1)} radius={[4, 4, 0, 0]}>
                    {ytdChart.data.map((entry, index) => (
                      <Cell key={index} fill="var(--sf-t5, #b5ada4)" fillOpacity={entry.isPartial ? 0.2 : 0.4} strokeDasharray={entry.isPartial ? '3 2' : undefined} stroke={entry.isPartial ? 'var(--sf-t5, #b5ada4)' : 'none'} />
                    ))}
                  </Bar>
                  <Bar dataKey="actual" name={String(selectedPeriod.year)} radius={[4, 4, 0, 0]}>
                    {ytdChart.data.map((entry, index) => {
                      const baseColor = entry.actual >= entry.anterior ? '#22c55e' : '#ef4444'
                      return <Cell key={index} fill={baseColor} fillOpacity={entry.isPartial ? 0.4 : 1} strokeDasharray={entry.isPartial ? '3 2' : undefined} stroke={entry.isPartial ? baseColor : 'none'} />
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-[12px] italic flex-1 flex items-center" style={{ color: 'var(--sf-t5)' }}>Primer período analizado — sin historial comparable</p>
          )}

          {ytdChart.totalActual > 0 && (
            <div className="flex items-center justify-between mt-2 text-xs">
              <span style={{ color: 'var(--sf-t3)' }}>
                {ytdChart.totalActual.toLocaleString('es-SV')} uds acumuladas
              </span>
              {ytdChartPct !== null && (
                <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, color: ytdChartUp ? '#22c55e' : '#ef4444' }}>
                  {ytdChartUp ? '+' : ''}{ytdChartPct.toFixed(1)}% vs misma fecha {selectedPeriod.year - 1}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── RESUMEN EJECUTIVO ──────────────────────────────────────────────── */}
      {resumenEjecutivo.length > 0 && (
        <div
          className="intel-fade rounded-xl p-5"
          style={{ animationDelay: '100ms', background: 'var(--sf-card)', border: '1px solid var(--sf-border)' }}
        >
          <div className="relative flex items-center gap-2 mb-3">
            <span style={{ fontSize: 14, color: 'var(--sf-green)' }}>✦</span>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--sf-t5)' }}>Resumen del mes</p>
            {estadoMes.estado !== 'sin_base' && (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{
                color: estadoMes.estado === 'atrasado' ? '#ef4444' : estadoMes.estado === 'adelantado' ? '#22c55e' : 'var(--sf-t4)',
                background: estadoMes.estado === 'atrasado' ? 'rgba(239,68,68,0.1)' : estadoMes.estado === 'adelantado' ? 'rgba(34,197,94,0.1)' : 'var(--sf-overlay-light)',
              }}>
                {estadoMes.estado === 'atrasado' ? '↓ Atraso' : estadoMes.estado === 'adelantado' ? '↑ Adelanto' : '→ En línea'}
              </span>
            )}
            <FirstTimeTooltip
              storageKey="sf_tip_resumen"
              text="Este resumen se actualiza automaticamente cada vez que subes nuevos datos"
            />
          </div>
          <div className="space-y-2">
            {resumenEjecutivo.map((bullet, i) => (
              <div key={i}>
                <div className="flex items-start gap-2">
                  <span
                    className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                    style={{
                      background: bullet.tipo === 'alerta' ? 'var(--sf-red)' : bullet.tipo === 'positivo' ? 'var(--sf-green)' : 'var(--sf-t5)',
                    }}
                  />
                  <p
                    className="text-[13px] leading-relaxed"
                    style={{ color: bullet.tipo === 'alerta' ? 'var(--sf-t2)' : bullet.tipo === 'positivo' ? 'var(--sf-t2)' : 'var(--sf-t3)' }}
                  >
                    {bullet.texto}
                  </p>
                </div>
                {bullet.sub && (
                  <p className="text-[11px] ml-[18px] mt-0.5" style={{ color: bullet.subColor ?? 'var(--sf-t5)' }}>
                    {bullet.sub}
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--sf-border-subtle)' }}>
            <button
              onClick={() => navigate('/chat', { state: { prefill: 'Dame un análisis completo del equipo este mes: estado vs meta, vendedores críticos, clientes dormidos y recomendaciones concretas.', source: 'Estado Comercial' } })}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium cursor-pointer transition-opacity duration-150 hover:opacity-70"
              style={{ color: 'var(--sf-green)', background: 'none', border: 'none', padding: 0 }}
            >
              ✦ Análisis completo con IA →
            </button>
            {(() => {
              const alerts: { icon: string; text: string; prefill: string }[] = []

              const vendedoresRiesgo = vendorAnalysis.filter(v => v.riesgo === 'riesgo' || v.riesgo === 'critico')
              if (vendedoresRiesgo.length > 0) {
                alerts.push({
                  icon: '🔴',
                  text: `${vendedoresRiesgo.length} vendedor${vendedoresRiesgo.length > 1 ? 'es' : ''} en riesgo necesita${vendedoresRiesgo.length > 1 ? 'n' : ''} atención`,
                  prefill: `¿Por qué ${vendedoresRiesgo.map(v => v.vendedor).join(' y ')} están en riesgo? Dame un plan de acción para cada uno.`
                })
              }

              const dormidosAltoValor = clientesDormidos
                .filter(c => (c.valor_historico || 0) > 10000)
                .sort((a, b) => (b.valor_historico || 0) - (a.valor_historico || 0))
                .slice(0, 2)
              if (dormidosAltoValor.length > 0) {
                const nombres = dormidosAltoValor.map(c => c.cliente).join(' y ')
                alerts.push({
                  icon: '⚠️',
                  text: `${nombres} lleva${dormidosAltoValor.length > 1 ? 'n' : ''} ${dormidosAltoValor[0].dias_sin_actividad} días sin comprar`,
                  prefill: `Dame un plan de recuperación para ${nombres}. ¿Cuál es la probabilidad de recuperarlos y qué acción tomar esta semana?`
                })
              }

              if (alerts.length === 0) return null

              return (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {alerts.map((alert, i) => (
                    <button
                      key={i}
                      onClick={() => navigate('/chat', { state: { prefill: alert.prefill, source: 'Estado Comercial' } })}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        fontSize: 12, color: 'var(--sf-t3)',
                        background: 'none', border: 'none', padding: 0,
                        cursor: 'pointer', textAlign: 'left',
                        transition: 'opacity 0.2s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
                      onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                    >
                      <span>{alert.icon}</span>
                      <span style={{ textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: '2px' }}>
                        {alert.text} → Analizar
                      </span>
                    </button>
                  ))}
                </div>
              )
            })()}
          </div>
        </div>
      )}


      {/* ── INTELIGENCIA COMERCIAL ──────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid var(--sf-border)' }} />

      <div className="intel-fade space-y-4" style={{ animationDelay: '160ms' }}>
        {/* Header + count */}
        <div className="relative flex items-center gap-2 flex-wrap">
          <p className="text-[11px] font-bold uppercase tracking-[0.15em]" style={{ color: 'var(--sf-t5)' }}>
            Inteligencia Comercial
          </p>
          <FirstTimeTooltip
            storageKey="sf_tip_inteligencia"
            text="Estas son alertas sobre riesgos y oportunidades que detectamos. Marcalas como atendidas cuando tomes accion"
          />
          <span style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 11,
            color: 'var(--sf-t5)',
            background: 'var(--sf-overlay-medium)',
            padding: '2px 8px',
            borderRadius: 5,
          }}>
            {feedInsights.length}
          </span>
          {pendingCount > 0 && (
            <span style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 10,
              fontWeight: 600,
              color: '#ef4444',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.2)',
              padding: '2px 8px',
              borderRadius: 5,
            }}>
              {pendingCount} pendiente{pendingCount > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Filter chips */}
        <div className="flex gap-1.5 flex-wrap">
          {FEED_FILTERS.map(f => {
            if (f.key !== 'all' && feedFilterCounts[f.key] === 0) return null
            const isActive = feedFilter === f.key
            return (
              <button
                key={f.key}
                onClick={() => { setFeedFilter(f.key); setFeedExpanded(false) }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-150 cursor-pointer inline-flex items-center gap-1.5"
                style={isActive && f.color
                  ? { borderColor: f.color + '40', color: f.color, background: f.color + '10' }
                  : isActive
                  ? { borderColor: 'var(--sf-border-active)', color: 'var(--sf-t1)', background: 'var(--sf-overlay-medium)' }
                  : { borderColor: 'var(--sf-overlay-medium)', color: 'var(--sf-t5)', background: 'transparent' }
                }
              >
                {f.color && (
                  <span style={{ width: 6, height: 6, borderRadius: 2, background: f.color, display: 'inline-block' }} />
                )}
                {f.label}
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, opacity: 0.6 }}>
                  {feedFilterCounts[f.key]}
                </span>
              </button>
            )
          })}
        </div>

        {/* Status filter chips */}
        <div className="flex gap-1.5 flex-wrap">
          {(
            [
              { key: 'notResolved', label: '📋 Pendientes',  count: statusCounts.notResolved },
              { key: 'following',   label: '🔧 En trabajo',  count: statusCounts.following },
              { key: 'resolved',    label: '✅ Resueltas',   count: statusCounts.resolved },
            ] as { key: StatusFilterKey; label: string; count: number }[]
          ).map(({ key, label, count }) => {
            const isActive = statusFilter === key
            const dotColor = key === 'following' ? '#f59e0b' : key === 'resolved' ? '#22c55e' : 'var(--sf-t5)'
            return (
              <button
                key={key}
                onClick={() => { setStatusFilter(key); setFeedExpanded(false) }}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all duration-150 cursor-pointer inline-flex items-center gap-1.5"
                style={isActive
                  ? { borderColor: dotColor + '50', color: dotColor, background: dotColor + '12' }
                  : { borderColor: 'var(--sf-overlay-medium)', color: 'var(--sf-t5)', background: 'transparent' }
                }
              >
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor, display: 'inline-block', flexShrink: 0 }} />
                {label}
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, opacity: 0.6 }}>{count}</span>
              </button>
            )
          })}
        </div>

        {/* Feed rows — tiered by impact */}
        <div className="space-y-2">
          {(() => {
            const TOP_COUNT = 3
            const visibleItems = feedExpanded ? feedFiltered : feedFiltered.slice(0, TOP_COUNT)
            const remainingCount = feedFiltered.length - TOP_COUNT

            return (
              <>
                {visibleItems.map((insight, idx) => {
                  const accent = getAccentColor(insight.tipo)
                  const label = getFeedLabel(insight.tipo)
                  const isExpanded = expandedInsightId === insight.id
                  const analysis = analysisMap[insight.id]
                  const isHallazgo = insight.tipo === 'hallazgo'
                  const insightStatus = getStatus(insight)
                  const insightReopened = isReopened(insight)
                  const isResolved = insightStatus === 'resolved'
                  const isFollowing = insightStatus === 'following'
                  const accentBar = isResolved ? '#22c55e' : isFollowing ? '#f59e0b' : accent
                  const impact = getImpactLevel(insight)

                  // Visual tier styles
                  const barWidth = impact === 'alto' ? 'w-1' : impact === 'medio' ? 'w-[3px]' : 'w-[2px]'
                  const barColor = isResolved ? '#22c55e' : isFollowing ? '#f59e0b'
                    : impact === 'alto' ? '#ef4444' : impact === 'medio' ? '#f59e0b' : 'var(--sf-t6)'
                  const cardPadding = impact === 'alto' ? 'p-5' : impact === 'bajo' ? 'p-3' : 'p-4'
                  const titleSize = impact === 'alto' ? 'text-base font-bold' : impact === 'bajo' ? 'text-[13px] font-medium' : 'text-sm font-semibold'
                  const descSize = impact === 'bajo' ? 'text-xs' : 'text-[13px]'
                  const cardBg = isExpanded ? 'var(--sf-overlay-light)'
                    : impact === 'alto' && !isResolved ? 'rgba(239,68,68,0.04)' : 'var(--sf-overlay-subtle)'
                  const cardBorder = isResolved ? 'rgba(34,197,94,0.2)' : isFollowing ? 'rgba(245,158,11,0.2)'
                    : impact === 'alto' ? 'rgba(239,68,68,0.2)' : 'var(--sf-border-subtle)'
                  const cardShadow = impact === 'alto' && !isResolved ? '0 1px 4px rgba(239,68,68,0.08)' : 'none'

                  // Group separator headers when expanded
                  let groupHeader: string | null = null
                  if (feedExpanded && idx > 0) {
                    const prevImpact = getImpactLevel(visibleItems[idx - 1])
                    if (prevImpact !== impact) {
                      groupHeader = impact === 'medio' ? 'Riesgo medio' : impact === 'bajo' ? 'Informativas' : null
                    }
                  }
                  if (feedExpanded && idx === TOP_COUNT && impact !== 'alto') {
                    // First item after the fold — always show header if not alto
                    if (!groupHeader) {
                      groupHeader = impact === 'medio' ? 'Riesgo medio' : impact === 'bajo' ? 'Informativas' : null
                    }
                  }

                  return (
                    <div key={insight.id}>
                      {groupHeader && (
                        <div className="flex items-center gap-3 pt-3 pb-1">
                          <div className="h-px flex-1" style={{ background: 'var(--sf-border)' }} />
                          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--sf-t6)' }}>
                            {groupHeader}
                          </span>
                          <div className="h-px flex-1" style={{ background: 'var(--sf-border)' }} />
                        </div>
                      )}
                      <div
                        className="intel-fade flex items-stretch rounded-xl cursor-pointer transition-all duration-200 relative"
                        style={{
                          animationDelay: `${idx * 30}ms`,
                          border: `1px solid ${cardBorder}`,
                          background: cardBg,
                          opacity: isResolved ? 0.6 : 1,
                          boxShadow: cardShadow,
                          zIndex: openDropdownKey === getAlertKey(insight) ? 60 : undefined,
                        }}
                        onClick={() => setExpandedInsightId(isExpanded ? null : insight.id)}
                      >
                        {/* Accent bar — width varies by impact */}
                        <div className={`${barWidth} shrink-0 rounded-l-xl`} style={{ background: barColor }} />

                        {/* Content */}
                        <div className={`flex-1 min-w-0 ${cardPadding}`}>
                          {/* Line 1: badge + title + urgency badge + status badge */}
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span
                              className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                              style={{
                                fontFamily: "'DM Mono', monospace",
                                color: accent,
                                background: accent + '15',
                              }}
                            >
                              {label}
                            </span>
                            {impact === 'alto' && !isResolved && (
                              <span
                                className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                                style={{ fontFamily: "'DM Mono', monospace", color: '#ef4444', background: 'rgba(239,68,68,0.12)' }}
                              >
                                URGENTE
                              </span>
                            )}
                            <span className={`${titleSize} leading-tight`} style={{ color: 'var(--sf-t1)' }}>
                              {insight.titulo}
                            </span>
                            {/* Badge de estado */}
                            {isFollowing && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                                style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.12)', fontFamily: "'DM Mono', monospace" }}>
                                🔧 En trabajo
                              </span>
                            )}
                            {isResolved && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                                style={{ color: '#22c55e', background: 'rgba(34,197,94,0.12)', fontFamily: "'DM Mono', monospace" }}>
                                ✅ Resuelta
                              </span>
                            )}
                            {insightReopened && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                                style={{ color: '#f97316', background: 'rgba(249,115,22,0.12)', fontFamily: "'DM Mono', monospace" }}>
                                <RotateCcw className="w-2.5 h-2.5" /> Reabierta
                              </span>
                            )}
                            {/* Trend indicator */}
                            {(() => {
                              const trend = computeInsightTrend(insight, vendorAnalysis, clientesDormidos)
                              const tc = TREND_CONFIG[trend]
                              return (
                                <span
                                  className="shrink-0 ml-auto text-[13px] font-bold leading-none"
                                  style={{ color: tc.color }}
                                  title={tc.label}
                                >
                                  {tc.symbol}
                                </span>
                              )
                            })()}
                          </div>

                          {/* Line 2: description */}
                          <p className={`${descSize} leading-relaxed`} style={{ color: 'var(--sf-t4)' }}>
                            {boldifyDescription(insight.descripcion)}
                          </p>

                          {/* Action row: dropdown de estado + Analizar con IA */}
                          <div className="flex items-center justify-between mt-2 gap-2">
                            {/* Dropdown de estado */}
                            {(() => {
                              const alertKey = getAlertKey(insight)
                              const record = alertStatuses[alertKey]
                              const currentOpt = STATUS_OPTIONS.find(o => o.value === insightStatus) ?? STATUS_OPTIONS[0]
                              const isOpen = openDropdownKey === alertKey
                              const savedNote = record?.note
                              const isEditingNote = editingNoteKey === alertKey

                              return (
                                <div className="relative" ref={isOpen ? dropdownRef : undefined} onClick={e => e.stopPropagation()}>
                                  {/* Trigger button */}
                                  <button
                                    onClick={() => setOpenDropdownKey(isOpen ? null : alertKey)}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium cursor-pointer transition-all duration-150"
                                    style={{
                                      color: currentOpt.color,
                                      background: currentOpt.bg,
                                      border: `1px solid ${currentOpt.border}`,
                                    }}
                                  >
                                    <span>{currentOpt.emoji}</span>
                                    <span>{currentOpt.label}</span>
                                    {savedNote && <span title="Tiene nota">📝</span>}
                                    <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
                                  </button>

                                  {/* Timestamp */}
                                  {record?.updatedAt && (
                                    <span className="block text-[9px] mt-0.5" style={{ color: 'var(--sf-t6)', fontFamily: "'DM Mono', monospace" }}>
                                      {relativeTime(record.updatedAt)}
                                    </span>
                                  )}

                                  {/* Note display */}
                                  {savedNote && !isEditingNote && (
                                    <button
                                      onClick={() => { setEditingNoteKey(alertKey); setNoteDraft(savedNote) }}
                                      className="block text-[11px] mt-1.5 text-left cursor-pointer rounded-lg px-2.5 py-1.5 max-w-[260px] transition-colors"
                                      style={{ color: 'var(--sf-t3)', background: 'var(--sf-inset)', border: '1px solid var(--sf-border-subtle)' }}
                                      title="Click para editar nota"
                                    >
                                      <span className="flex items-start gap-1.5">
                                        <span className="shrink-0">📝</span>
                                        <span className="whitespace-pre-wrap break-words">{savedNote}</span>
                                      </span>
                                      {record?.updatedAt && (
                                        <span className="block text-[9px] mt-1 opacity-60" style={{ fontFamily: "'DM Mono', monospace" }}>
                                          {relativeTime(record.updatedAt)}
                                        </span>
                                      )}
                                    </button>
                                  )}

                                  {/* Note edit — textarea */}
                                  {isEditingNote && (
                                    <div className="mt-1.5 max-w-[280px]">
                                      <textarea
                                        autoFocus
                                        value={noteDraft}
                                        onChange={e => { if (e.target.value.length <= 500) setNoteDraft(e.target.value) }}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault()
                                            handleStatusChange(insight, insightStatus, noteDraft || undefined)
                                            setEditingNoteKey(null)
                                          }
                                          if (e.key === 'Escape') setEditingNoteKey(null)
                                        }}
                                        placeholder="¿Qué acción tomaste? ej: Llamé a Carlos, el problema es falta de stock..."
                                        rows={3}
                                        className="w-full text-[11px] px-2.5 py-2 rounded-lg border bg-transparent outline-none resize-none"
                                        style={{ borderColor: 'var(--sf-border)', color: 'var(--sf-t2)' }}
                                      />
                                      <div className="flex items-center justify-between mt-1">
                                        <span className="text-[9px]" style={{ color: 'var(--sf-t6)' }}>{noteDraft.length}/500</span>
                                        <div className="flex items-center gap-1.5">
                                          <button
                                            onClick={() => setEditingNoteKey(null)}
                                            className="text-[10px] px-2 py-0.5 rounded cursor-pointer"
                                            style={{ color: 'var(--sf-t4)' }}
                                          >Cancelar</button>
                                          <button
                                            onClick={() => {
                                              handleStatusChange(insight, insightStatus, noteDraft || undefined)
                                              setEditingNoteKey(null)
                                            }}
                                            className="text-[10px] px-2.5 py-0.5 rounded-md cursor-pointer font-semibold"
                                            style={{ color: '#fff', background: 'var(--sf-green)' }}
                                          >Guardar</button>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* Dropdown menu */}
                                  {isOpen && (
                                    <div
                                      className="absolute left-0 top-full mt-1 z-50 rounded-lg shadow-lg py-1 min-w-[170px]"
                                      style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)' }}
                                    >
                                      {STATUS_OPTIONS.map(opt => (
                                        <button
                                          key={opt.value}
                                          onClick={() => {
                                            handleStatusChange(insight, opt.value)
                                            if ((opt.value === 'following' || opt.value === 'resolved') && !savedNote) {
                                              setEditingNoteKey(alertKey)
                                              setNoteDraft('')
                                            }
                                          }}
                                          className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors cursor-pointer"
                                          style={{
                                            color: opt.value === insightStatus ? opt.color : 'var(--sf-t3)',
                                            background: opt.value === insightStatus ? opt.bg : 'transparent',
                                            fontWeight: opt.value === insightStatus ? 600 : 400,
                                          }}
                                          onMouseEnter={e => { (e.target as HTMLElement).style.background = 'var(--sf-hover)' }}
                                          onMouseLeave={e => { (e.target as HTMLElement).style.background = opt.value === insightStatus ? opt.bg : 'transparent' }}
                                        >
                                          <span>{opt.emoji}</span>
                                          <span>{opt.label}</span>
                                          {opt.value === insightStatus && <CheckCircle className="w-3 h-3 ml-auto" />}
                                        </button>
                                      ))}
                                      {/* Add note option */}
                                      <div style={{ borderTop: '1px solid var(--sf-border-subtle)', margin: '4px 0' }} />
                                      <button
                                        onClick={() => {
                                          setEditingNoteKey(alertKey)
                                          setNoteDraft(savedNote ?? '')
                                          setOpenDropdownKey(null)
                                        }}
                                        className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors cursor-pointer"
                                        style={{ color: 'var(--sf-t4)' }}
                                        onMouseEnter={e => { (e.target as HTMLElement).style.background = 'var(--sf-hover)' }}
                                        onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent' }}
                                      >
                                        <span>📝</span>
                                        <span>{savedNote ? 'Editar nota' : 'Agregar nota'}</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )
                            })()}

                          {/* Navigation link — contextual based on alert type, with entity name */}
                          {(() => {
                            // Extract entity name from title: "Descripción — NombreEntidad"
                            const entityName = insight.titulo.includes(' — ') ? insight.titulo.split(' — ').pop()!.trim() : null
                            const navLink = insight.tipo === 'riesgo_vendedor'
                              ? { label: entityName ? `${entityName} →` : 'Ver vendedores →', path: '/vendedores', highlight: entityName }
                              : insight.tipo === 'riesgo_equipo'
                              ? { label: 'Ver equipo →', path: '/vendedores', highlight: null }
                              : insight.tipo === 'riesgo_producto'
                              ? { label: entityName ? `${entityName} →` : 'Ver rotación →', path: '/rotacion', highlight: entityName }
                              : insight.tipo === 'riesgo_cliente'
                              ? { label: entityName ? `${entityName} →` : 'Ver clientes →', path: '/clientes', highlight: entityName, openCliente: entityName }
                              : insight.tipo === 'cruzado'
                              ? { label: entityName ? `${entityName} →` : 'Ver vendedores →', path: '/vendedores', highlight: entityName }
                              : insight.tipo === 'riesgo_meta'
                              ? { label: entityName ? `${entityName} →` : 'Ver metas →', path: '/metas', highlight: null }
                              : insight.tipo === 'hallazgo'
                              ? (insight.vendedor
                                ? { label: `${insight.vendedor} →`, path: '/vendedores', highlight: insight.vendedor }
                                : insight.producto
                                ? { label: `${insight.producto} →`, path: '/rotacion', highlight: insight.producto }
                                : null)
                              : null
                            return navLink ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); navigate(navLink.path, { state: navLink.highlight ? { highlight: navLink.highlight, source: 'alert', ...('openCliente' in navLink && navLink.openCliente ? { openCliente: navLink.openCliente } : {}) } : undefined }) }}
                                className="text-[11px] font-medium cursor-pointer hover:underline transition-colors"
                                style={{ color: 'var(--sf-green)' }}
                              >
                                {navLink.label}
                              </button>
                            ) : null
                          })()}

                          {/* Analizar con IA — dentro del action row */}
                          {!analysis && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleAnalyzeInsight(insight) }}
                              className={`inline-flex items-center gap-1.5 rounded-lg font-medium cursor-pointer transition-all duration-150 ml-auto ${impact === 'bajo' ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'}`}
                              style={{
                                color: 'var(--sf-green)',
                                background: 'var(--sf-green-bg)',
                                border: '1px solid var(--sf-green-border)',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.opacity = '0.8' }}
                              onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
                            >
                              ✦ Analizar con IA
                            </button>
                          )}
                          </div>{/* /Action row */}

                          {/* Loading spinner — replaces button while analyzing */}
                          {analysis?.loading && (
                            <div className="flex justify-end mt-2">
                              <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--sf-t4)' }}>
                                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                </svg>
                                Analizando...
                              </span>
                            </div>
                          )}

                          {/* Analysis result — appears once generated */}
                          {analysis?.text && !analysis.loading && (
                            <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--sf-border-subtle)' }}>
                              <div className="text-[13px] leading-relaxed whitespace-pre-line" style={{ color: 'var(--sf-t3)' }}>
                                {analysis.text}
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const analysisText = analysis?.text || ''
                                  const displayMessage = `Profundizar: ${insight.titulo}`
                                  const fullContext = [
                                    `Profundizar sobre: ${insight.titulo}`,
                                    ``,
                                    `Contexto del insight: ${insight.descripcion}`,
                                    insight.impacto_economico ? `Impacto económico: ${insight.impacto_economico.descripcion} (${configuracion.moneda} ${insight.impacto_economico.valor?.toLocaleString()})` : '',
                                    insight.vendedor ? `Vendedor: ${insight.vendedor}` : '',
                                    insight.cliente ? `Cliente: ${insight.cliente}` : '',
                                    insight.producto ? `Producto: ${insight.producto}` : '',
                                    analysisText ? `\nAnálisis previo:\n${analysisText}` : '',
                                    ``,
                                    `Con base en este análisis, profundiza: ¿qué está causando esto específicamente, qué datos adicionales lo confirman, y qué patrón hay detrás?`
                                  ].filter(Boolean).join('\n')
                                  navigate('/chat', { state: { prefill: fullContext, displayPrefill: displayMessage, source: 'Estado Comercial' } })
                                }}
                                className="mt-3 px-4 py-2 rounded-lg text-xs font-medium cursor-pointer"
                                style={{ border: '1px solid var(--sf-green-border)', background: 'var(--sf-green-bg)', color: 'var(--sf-green)' }}
                                onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                              >
                                + Profundizar
                              </button>
                            </div>
                          )}

                          {/* Hallazgo expanded content — only on click */}
                          {isHallazgo && isExpanded && (
                            <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--sf-border-subtle)' }}>
                              {insight.impacto_economico ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs" style={{ color: 'var(--sf-t4)' }}>Impacto estimado: </span>
                                  <span className="text-xs font-semibold" style={{ fontFamily: "'DM Mono', monospace", color: 'var(--sf-t2)' }}>
                                    {configuracion.moneda} {insight.impacto_economico.valor.toLocaleString()}
                                  </span>
                                </div>
                              ) : insight.valor_numerico ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs" style={{ color: 'var(--sf-t4)' }}>Valor: </span>
                                  <span className="text-xs font-semibold" style={{ fontFamily: "'DM Mono', monospace", color: 'var(--sf-t2)' }}>
                                    {insight.valor_numerico.toLocaleString()}
                                  </span>
                                </div>
                              ) : (
                                <p className="text-xs" style={{ color: 'var(--sf-t4)' }}>Sin datos adicionales.</p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Critical dot */}
                        {insight.prioridad === 'CRITICA' && (
                          <span
                            className="w-2 h-2 rounded-full shrink-0 mt-5 mr-4"
                            style={{ background: '#ef4444', boxShadow: '0 0 8px rgba(239,68,68,0.4)' }}
                          />
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Show more / collapse */}
                {!feedExpanded && remainingCount > 0 && (
                  <button
                    onClick={() => setFeedExpanded(true)}
                    className="w-full py-3 rounded-xl text-[13px] font-medium transition-all duration-150 cursor-pointer"
                    style={{
                      border: '1px dashed var(--sf-border-subtle)',
                      background: 'transparent',
                      color: 'var(--sf-t5)',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--sf-border-active)'; e.currentTarget.style.color = 'var(--sf-t3)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--sf-border-subtle)'; e.currentTarget.style.color = 'var(--sf-t5)' }}
                  >
                    Ver las {remainingCount} alertas restantes
                  </button>
                )}
                {feedExpanded && feedFiltered.length > TOP_COUNT && (
                  <button
                    onClick={() => setFeedExpanded(false)}
                    className="w-full py-2 rounded-xl text-[12px] font-medium transition-all duration-150 cursor-pointer"
                    style={{ color: 'var(--sf-t5)' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--sf-t3)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--sf-t5)' }}
                  >
                    Colapsar
                  </button>
                )}
              </>
            )
          })()}
        </div>
      </div>

      {/* ── ACCESO DIRECTO ─────────────────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid var(--sf-border)' }} />

      <div className="intel-fade" style={{ animationDelay: '400ms' }}>
        <div className="relative mb-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.15em]" style={{ color: 'var(--sf-t5)' }}>Explorar dimensiones</p>
          <FirstTimeTooltip
            storageKey="sf_tip_dimensiones"
            text="Haz clic en cualquier tarjeta para ver el detalle de vendedores, clientes, canales o productos"
          />
        </div>
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}
        >
          {/* CARD 1 — VENDEDORES */}
          {(() => {
            const topBorder = criticos > 0 ? 'var(--sf-red)' : enRiesgo > 0 ? 'var(--sf-amber)' : 'var(--sf-green)'
            return (
              <div
                className="group rounded-xl p-5 cursor-pointer transition-all duration-200"
                style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)' }}
                onClick={() => navigate(criticos > 0 ? '/vendedores?filter=critico' : '/vendedores')}
                onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = 'var(--sf-border-active)'; el.style.background = 'var(--sf-hover-card)'; el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)' }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = 'var(--sf-border)'; el.style.background = 'var(--sf-card)'; el.style.boxShadow = '' }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: topBorder }} />
                  <p className="text-[11px] font-bold uppercase tracking-[0.15em]" style={{ color: 'var(--sf-t5)' }}>VENDEDORES</p>
                </div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 28, fontWeight: 400, color: criticos > 0 ? 'var(--sf-red)' : 'var(--sf-green)', lineHeight: 1 }}>
                  {criticos > 0 ? criticos : vendorAnalysis.length}
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--sf-t3)' }}>
                  {criticos > 0 ? 'críticos' : 'vendedores'}
                </div>
                <div className="text-xs mt-2" style={{ color: 'var(--sf-t3)' }}>
                  {enRiesgo} en riesgo · {okSolo} ok · {superandoCount} superando
                </div>
                {dataAvailability.has_metas && teamStats?.cumplimiento_equipo != null && (
                  <div className="text-xs mt-1" style={{ color: cumplimientoFinal < 70 ? 'var(--sf-red)' : cumplimientoFinal < 90 ? 'var(--sf-amber)' : 'var(--sf-green)' }}>
                    Equipo al {cumplimientoFinal.toFixed(0)}% de meta
                  </div>
                )}
                <div className="text-xs mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ color: 'var(--sf-green)' }}>
                  Ver vendedores →
                </div>
              </div>
            )
          })()}

          {/* CARD 2 — CLIENTES (solo si has_cliente) */}
          {dataAvailability.has_cliente && (() => {
            const topBorder = clientesDormidos.length > 0 ? 'var(--sf-red)' : 'var(--sf-green)'
            return (
              <div
                className="group rounded-xl p-5 cursor-pointer transition-all duration-200"
                style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)' }}
                onClick={() => navigate('/clientes')}
                onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = 'var(--sf-border-active)'; el.style.background = 'var(--sf-hover-card)'; el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)' }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = 'var(--sf-border)'; el.style.background = 'var(--sf-card)'; el.style.boxShadow = '' }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: topBorder }} />
                  <p className="text-[11px] font-bold uppercase tracking-[0.15em]" style={{ color: 'var(--sf-t5)' }}>CLIENTES</p>
                </div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 28, fontWeight: 400, color: 'var(--sf-red)', lineHeight: 1 }}>
                  {clientesDormidos.length}
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--sf-t3)' }}>dormidos</div>
                <div className="text-xs mt-2" style={{ color: 'var(--sf-t3)' }}>
                  {dormidosRec.length} recuperables · {activosMes} activos este mes
                </div>
                {valorRiesgoClien > 0 && (
                  <div className="text-xs mt-1" style={{ color: 'var(--sf-amber)' }}>
                    Valor en riesgo: {Math.round(valorRiesgoClien).toLocaleString('es-SV')} uds
                  </div>
                )}
                <div className="text-xs mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ color: 'var(--sf-green)' }}>
                  Ver clientes →
                </div>
              </div>
            )
          })()}

          {/* CARD 3 — CANALES (solo si has_canal) */}
          {dataAvailability.has_canal && canalPrincipal && (() => {
            const topBorder = canalesEnCaida > 0 ? 'var(--sf-amber)' : 'var(--sf-green)'
            const varPct = canalPrincipal.variacion_pct
            const varColor = varPct >= 5 ? 'var(--sf-green)' : varPct <= -5 ? 'var(--sf-red)' : 'var(--sf-t3)'
            const varText = Math.abs(varPct) < 5 ? 'estable' : varPct >= 5 ? `subió ${Math.abs(Math.round(varPct))}%` : `bajó ${Math.abs(Math.round(varPct))}%`
            const chatQ = 'Analiza el estado de los canales este período'
            return (
              <div
                className="group rounded-xl p-5 cursor-pointer transition-all duration-200"
                style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)' }}
                onClick={() => navigate('/chat', { state: { prefill: chatQ, source: 'Estado Comercial' } })}
                onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = 'var(--sf-border-active)'; el.style.background = 'var(--sf-hover-card)'; el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)' }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = 'var(--sf-border)'; el.style.background = 'var(--sf-card)'; el.style.boxShadow = '' }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: topBorder }} />
                  <p className="text-[11px] font-bold uppercase tracking-[0.15em]" style={{ color: 'var(--sf-t5)' }}>CANALES</p>
                </div>
                <div className="text-xl font-medium leading-none" style={{ color: 'var(--sf-t1)' }}>
                  {canalPrincipal.canal}
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--sf-t3)' }}>
                  {Math.round(canalPrincipal.participacion_pct)}% del total
                </div>
                <div className="text-xs mt-2" style={{ color: 'var(--sf-t3)' }}>
                  {canalesActivos} canales activos · {canalesEnCaida} en caída
                </div>
                <div className="text-xs mt-1" style={{ color: varColor }}>
                  Canal principal {varText} vs histórico
                </div>
                <div className="text-xs mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ color: 'var(--sf-green)' }}>
                  Analizar con IA →
                </div>
              </div>
            )
          })()}

          {/* CARD 4 — PRODUCTOS (solo si has_producto o has_inventario) */}
          {(dataAvailability.has_producto || dataAvailability.has_inventario) && (() => {
            const topBorder = sinMovimiento > 0 ? 'var(--sf-red)' : (bajaCob > 0 || riesgoQuiebre > 0) ? 'var(--sf-amber)' : 'var(--sf-green)'
            return (
              <div
                className="group rounded-xl p-5 cursor-pointer transition-all duration-200"
                style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)' }}
                onClick={() => dataAvailability.has_inventario ? navigate('/rotacion') : navigate('/chat', { state: { prefill: 'Analiza los productos con alertas y productos sin ventas recientes', source: 'Estado Comercial' } })}
                onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = 'var(--sf-border-active)'; el.style.background = 'var(--sf-hover-card)'; el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)' }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = 'var(--sf-border)'; el.style.background = 'var(--sf-card)'; el.style.boxShadow = '' }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: topBorder }} />
                  <p className="text-[11px] font-bold uppercase tracking-[0.15em]" style={{ color: 'var(--sf-t5)' }}>PRODUCTOS</p>
                </div>
                {dataAvailability.has_inventario ? (
                  <>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 28, fontWeight: 400, color: sinMovimiento > 0 ? 'var(--sf-red)' : 'var(--sf-green)', lineHeight: 1 }}>
                      {sinMovimiento}
                    </div>
                    <div className="text-xs mt-1" style={{ color: 'var(--sf-t3)' }}>sin movimiento</div>
                    <div className="text-xs mt-2" style={{ color: 'var(--sf-t3)' }}>
                      {riesgoQuiebre > 0 ? <span style={{ color: 'var(--sf-red)' }}>{riesgoQuiebre} riesgo quiebre</span> : <>{riesgoQuiebre} riesgo quiebre</>}
                      {' · '}{bajaCob} baja cobertura
                    </div>
                    {riesgoQuiebre > 0 && (
                      <div className="text-[10px] mt-1" style={{ color: 'var(--sf-red)', opacity: 0.8 }}>
                        ⚠ Productos que pueden agotar stock antes de resurtido
                      </div>
                    )}
                    <div className="text-xs mt-1" style={{ color: 'var(--sf-t3)' }}>
                      {normalInv} normal · {lentoMov} lento movimiento
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 28, fontWeight: 400, color: 'var(--sf-amber)', lineHeight: 1 }}>
                      {insights.filter(i => i.tipo === 'riesgo_producto').length}
                    </div>
                    <div className="text-xs mt-1" style={{ color: 'var(--sf-t3)' }}>alertas de producto</div>
                    <div className="text-xs mt-2" style={{ color: 'var(--sf-t3)' }}>
                      {vendorAnalysis.reduce((s, v) => s + (v.productos_ausentes?.length ?? 0), 0)} productos sin ventas este mes
                    </div>
                  </>
                )}
                <div className="text-xs mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ color: 'var(--sf-green)' }}>
                  {dataAvailability.has_inventario ? 'Ver rotación →' : 'Analizar productos →'}
                </div>
              </div>
            )
          })()}
        </div>
      </div>
      </div>{/* end space-y-8 */}
      </div>{/* end Inter wrapper */}
    </>
  )
}
