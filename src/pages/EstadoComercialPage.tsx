import { useEffect, useState, useMemo, useCallback, useDeferredValue, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, LabelList } from 'recharts'
import { useAppStore } from '../store/appStore'
import { useAnalysis } from '../lib/useAnalysis'
import type { Insight, InsightTipo, InsightPrioridad, VendorAnalysis } from '../types'
import { salesInPeriod } from '../lib/analysis'
import { callAI } from '../lib/chatService'
import VendedorPanel from '../components/vendedor/VendedorPanel'
import { computePulsoCards, type PulsoCard, type PulsoPanelData } from '../lib/pulso-engine'
import { useDemoPath } from '../lib/useDemoPath'
import PulsoPanel from '../components/pulso/PulsoPanel'
import { Calendar, CheckCircle, RotateCcw, ChevronDown, Users, Building2, Star, TrendingUp, TrendingDown, Bell } from 'lucide-react'
import { toast } from 'sonner'
import { useAlertStatusStore } from '../store/alertStatusStore'
import type { AlertStatus } from '../store/alertStatusStore'
import { getAlertKey } from '../lib/alertKey'
import FirstTimeTooltip from '../components/ui/FirstTimeTooltip'

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

type FeedFilterKey = 'all' | 'urgentes' | 'vendedores' | 'productos' | 'clientes' | 'hallazgo'
type StatusFilterKey = 'notResolved' | 'following' | 'resolved'

const FEED_FILTERS: { key: FeedFilterKey; label: string; match: (i: Insight) => boolean }[] = [
  { key: 'all',        label: 'Todas',         match: () => true },
  { key: 'urgentes',   label: 'Urgentes',      match: i => i.prioridad === 'CRITICA' || i.prioridad === 'ALTA' },
  { key: 'vendedores', label: 'Equipo',        match: i => i.tipo === 'riesgo_vendedor' || i.tipo === 'riesgo_equipo' },
  { key: 'hallazgo',   label: 'Oportunidades', match: i => i.tipo === 'hallazgo' },
  // kept for count logic but not shown as tabs:
  { key: 'productos',  label: 'Productos',     match: i => i.tipo === 'riesgo_producto' },
  { key: 'clientes',   label: 'Clientes',      match: i => i.tipo === 'riesgo_cliente' },
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

// ─── Conversational alert titles ────────────────────────────────────────────
function getAlertaTitle(insight: Insight): string {
  const { titulo, tipo } = insight
  const parts = titulo.split(' — ')
  const base   = parts[0].trim()
  const entity = parts[1]?.trim() ?? insight.vendedor ?? insight.cliente ?? insight.producto ?? ''

  if (/doble riesgo/i.test(base))                return `🔴 ${entity || 'Vendedor'} necesita apoyo urgente`
  if (/equipo no cerrará/i.test(base))           return '⚠️ La meta del mes está en riesgo'
  if (/caída explicada/i.test(base))             return `📉 ${entity || 'Vendedor'} muestra una caída importante`
  if (/cliente inactivo/i.test(base))            return `💤 ${entity || 'Cliente'} lleva tiempo sin comprar`
  if (/oportunidad de reactivación/i.test(base)) return `✨ Hay una oportunidad con ${entity || 'un cliente'}`
  if (/vendedor en riesgo/i.test(base))          return `⚡ ${entity || 'Vendedor'} está por debajo del ritmo`
  if (/producto sin movimiento/i.test(base))     return '📦 Hay productos que no se están moviendo'
  if (/meta en peligro/i.test(base))             return `⚠️ ${entity || 'Vendedor'} está lejos de su meta`
  if (/concentración sistémica/i.test(base))     return '⚠️ Tu negocio depende demasiado de un cliente'
  if (/racha positiva/i.test(base))              return `✨ ${entity || 'Vendedor'} está en su mejor racha`
  if (/no renovó/i.test(base))                   return `💤 ${entity || 'Cliente'} no ha vuelto a comprar`
  if (/sin ventas/i.test(base))                  return `📉 ${entity || 'Vendedor'} no ha registrado ventas`
  if (/inventario/i.test(base))                  return `📦 Hay un alerta de inventario`
  // Generic: if has " — Nombre" extract name, else return cleaned base
  if (entity) return `${entity}: ${base.charAt(0).toLowerCase() + base.slice(1)}`
  return base
}

// Extracts a short (≤20 word) summary + key numeric datum + label from an insight
function formatAlertaContent(
  insight: Insight,
  showUSD: boolean,
  moneda: string,
): { summary: string; keyData: string; keyLabel: string } {
  const { descripcion, impacto_economico, valor_numerico, tipo } = insight

  // Summary: first full sentence, truncated to ≤120 chars
  const rawSentence = descripcion.split(/(?<=[.!?])\s/)[0].trim()
  const summary = rawSentence.length > 120 ? rawSentence.slice(0, 117) + '…' : rawSentence

  // Key datum: prefer economic impact → valor_numerico → first bold number in text
  let keyData = ''
  let keyLabel = ''
  if (impacto_economico?.valor) {
    if (showUSD) {
      const fmt = impacto_economico.valor >= 1_000_000
        ? `${(impacto_economico.valor / 1_000_000).toFixed(1)}M`
        : impacto_economico.valor >= 1000
        ? `${(impacto_economico.valor / 1000).toFixed(1)}k`
        : Math.round(impacto_economico.valor).toLocaleString('es-SV')
      keyData = `${moneda} ${fmt}`
    } else {
      keyData = impacto_economico.descripcion || `${Math.round(impacto_economico.valor).toLocaleString('es-SV')}`
    }
    keyLabel = impacto_economico.tipo === 'perdida' ? 'pérdida estimada'
      : impacto_economico.tipo === 'oportunidad' ? 'oportunidad recuperable'
      : 'valor en riesgo'
  } else if (valor_numerico != null) {
    keyData = valor_numerico.toLocaleString('es-SV')
    // Derive label from insight type
    keyLabel = tipo === 'riesgo_vendedor' ? 'caída % vs promedio'
      : tipo === 'riesgo_cliente' ? 'días sin actividad'
      : tipo === 'riesgo_producto' ? 'uds sin movimiento'
      : tipo === 'riesgo_meta' ? '% cumplimiento'
      : tipo === 'riesgo_equipo' ? '% brecha vs meta'
      : tipo === 'cruzado' ? 'factores combinados'
      : ''
  } else {
    // Pull out first "N uds" or "N%" or plain number from description
    const match = descripcion.match(/(\d[\d,\.]*\s*(?:%|uds?|días?|meses?)?)/i)
    if (match) keyData = match[1].trim()
  }

  return { summary, keyData, keyLabel }
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
  const dp = useDemoPath()
  useAnalysis()
  const {
    insights, vendorAnalysis, teamStats, dataAvailability,
    configuracion, selectedPeriod, setSelectedPeriod, sales, loadingMessage,
    clientesDormidos, concentracionRiesgo, categoriasInventario, supervisorAnalysis,
    canalAnalysis, categoriaAnalysis, dataSource,
  } = useAppStore()

  const [vendedorPanel, setVendedorPanel] = useState<VendorAnalysis | null>(null)
  const [pulsoPanel, setPulsoPanel] = useState<PulsoPanelData | null>(null)
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
  const dashMetrica = configuracion.metricaGlobal ?? 'usd'
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [monthDropOpen, setMonthDropOpen] = useState(false)
  const monthDropRef = useRef<HTMLDivElement>(null)
  const monthBtnRef = useRef<HTMLButtonElement>(null)
  const [monthDropRect, setMonthDropRect] = useState<{ top: number; left: number; width: number } | null>(null)

  useEffect(() => {
    if (sales.length === 0 && dataSource === 'none') navigate(dp('/cargar'), { replace: true })
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

  // Cerrar month dropdown al clic fuera (portal-safe: verifica btn + portal)
  useEffect(() => {
    if (!monthDropOpen) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      // Clic dentro del botón trigger → lo maneja el onClick del botón
      if (monthDropRef.current?.contains(target)) return
      // Clic dentro del portal (dropdown renderizado en body) → no cerrar
      // Los nodos del portal son hijos directos de body pero no del ref
      // Usamos el data-attr para identificar el portal
      const portalEl = document.getElementById('sf-month-portal')
      if (portalEl?.contains(target)) return
      setMonthDropOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [monthDropOpen])



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
    const all = [...months]
      .map(k => { const [y, m] = k.split('-').map(Number); return { year: y, month: m } })
      .sort((a, b) => b.year - a.year || b.month - a.month)
    // Solo mostrar meses del año del dato más reciente
    const latestYear = all[0]?.year ?? new Date().getFullYear()
    return all.filter(am => am.year === latestYear)
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

    // Helper para calcular venta_neta en un mes/año
    const totalMesNeto = (y: number, m: number) => sales
      .filter(s => { const d = new Date(s.fecha); return d.getFullYear() === y && d.getMonth() === m })
      .reduce((sum, s) => sum + (s.venta_neta ?? 0), 0)

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
    const mesPrevTotal   = totalMes(mesPrevYear, mesPrevIdx)
    const mesActualNeto  = totalMesNeto(year, month)
    const mesPrevNeto    = totalMesNeto(mesPrevYear, mesPrevIdx)

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
    const tm1Neto  = totalMesNeto(tm1Year, tm1Idx)
    const tm2Neto  = totalMesNeto(tm2Year, tm2Idx)
    const tm3Neto  = totalMesNeto(tm3Year, tm3Idx)

    const variacionNeto = mesPrevNeto > 0 ? ((mesActualNeto - mesPrevNeto) / mesPrevNeto) * 100 : 0

    const tendencia = tm1Total > 0 && tm2Total > 0 ? (() => {
      const tipo = tm3Total > tm2Total && tm2Total > tm1Total ? 'creciente' as const
        : tm3Total < tm2Total && tm2Total < tm1Total ? 'decreciente' as const
        : 'mixta' as const
      return {
        m1: { nombre: MESES_CORTO[tm1Idx], total: tm1Total, neto: tm1Neto },
        m2: { nombre: MESES_CORTO[tm2Idx], total: tm2Total, neto: tm2Neto },
        m3: { nombre: MESES_CORTO[tm3Idx], total: tm3Total, neto: tm3Neto },
        tipo,
      }
    })() : null

    return {
      mesActualNombre, mesPrevNombre,
      mesActualTotal, mesPrevTotal,
      mesActualNeto, mesPrevNeto,
      variacion, variacionNeto,
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
            `${dormidoTop.recovery_label === 'alta' ? 'Alta probabilidad' : dormidoTop.recovery_label === 'recuperable' ? 'Recuperable' : dormidoTop.recovery_label === 'dificil' ? 'Difícil' : 'Perdido'}${canalV ? ' · Canal: ' + canalV : ''}`,
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
          ? [`Alta probabilidad de recuperación`, `${stockMatch.producto}: ${stockMatch.unidades_actuales.toLocaleString()} uds`, `Vendedor: ${top.vendedor}`]
          : [`${top.recovery_label === 'alta' ? 'Alta probabilidad de recuperación' : top.recovery_label === 'recuperable' ? 'Recuperable — contactar esta semana' : top.recovery_label === 'dificil' ? 'Difícil — intentar con oferta concreta' : 'Perdido — evaluar si vale el esfuerzo'}`, `Vendedor: ${top.vendedor}`, top.recovery_explicacion].filter(Boolean),
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
    const byType = feedInsights.filter(i => filterDef.match(i))

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
    const counts: Record<FeedFilterKey, number> = { all: feedInsights.length, urgentes: 0, vendedores: 0, productos: 0, clientes: 0, hallazgo: 0 }
    feedInsights.forEach(i => {
      if (i.prioridad === 'CRITICA' || i.prioridad === 'ALTA') counts.urgentes++
      if (i.tipo === 'riesgo_vendedor' || i.tipo === 'riesgo_equipo') counts.vendedores++
      else if (i.tipo === 'riesgo_producto') counts.productos++
      else if (i.tipo === 'riesgo_cliente') counts.clientes++
      else if (i.tipo === 'hallazgo' || i.tipo === 'cruzado' || i.tipo === 'riesgo_meta') counts.hallazgo++
    })
    return counts
  }, [feedInsights])

  const statusCounts = useMemo(() => {
    const counts = { notResolved: 0, following: 0, resolved: 0 }
    feedInsights.forEach(i => {
      const filterDef = FEED_FILTERS.find(f => f.key === feedFilter) ?? FEED_FILTERS[0]
      if (!filterDef.match(i)) return
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
    const selectedMonth = selectedPeriod.month // 0-based
    // El mes "en curso" real es el mes del dato más reciente (puede diferir del seleccionado)
    const latestMonth = maxDate.getFullYear() === currentYear ? maxDate.getMonth() : selectedMonth
    const maxDay = maxDate.getDate() // día hasta el que hay datos en el mes en curso

    const data: { month: string; actual: number; anterior: number; isPartial: boolean; daysElapsed: number; daysTotal: number }[] = []
    let totalActual = 0
    let totalAnterior = 0

    for (let m = 0; m <= selectedMonth; m++) {
      // Mes realmente parcial = el mes donde están los últimos datos (mes en curso)
      const isPartialMonth = m === latestMonth
      const daysInMonth = new Date(currentYear, m + 1, 0).getDate()

      const ventasActual = sales
        .filter(s => { const d = new Date(s.fecha); return d.getFullYear() === currentYear && d.getMonth() === m })
        .reduce((sum, s) => sum + s.unidades, 0)

      // Filtro de día solo para el mes en curso (parcial); meses cerrados se comparan completos
      const ventasAnterior = sales
        .filter(s => {
          const d = new Date(s.fecha)
          if (d.getFullYear() !== previousYear || d.getMonth() !== m) return false
          if (isPartialMonth && d.getDate() > maxDay) return false
          return true
        })
        .reduce((sum, s) => sum + s.unidades, 0)

      totalActual += ventasActual
      totalAnterior += ventasAnterior

      data.push({
        month: MESES_CORTO[m],
        actual: ventasActual,
        anterior: ventasAnterior,
        isPartial: isPartialMonth,
        daysElapsed: isPartialMonth ? maxDay : daysInMonth,
        daysTotal: daysInMonth,
      })
    }
    return { data, totalActual, totalAnterior, maxDay }
  }, [sales, selectedPeriod.year, selectedPeriod.month, maxDate])

  // ── YTD chart en dólares (solo si has_venta_neta) ──
  const ytdChartUSD = useMemo(() => {
    if (!dataAvailability.has_venta_neta) return null
    const currentYear = selectedPeriod.year
    const previousYear = currentYear - 1
    const selectedMonth = selectedPeriod.month
    const latestMonth = maxDate.getFullYear() === currentYear ? maxDate.getMonth() : selectedMonth
    const maxDay = maxDate.getDate()
    const data: { month: string; actual: number; anterior: number; isPartial: boolean; daysElapsed: number; daysTotal: number }[] = []
    let totalActual = 0
    let totalAnterior = 0
    for (let m = 0; m <= selectedMonth; m++) {
      const isPartialMonth = m === latestMonth
      const daysInMonth = new Date(currentYear, m + 1, 0).getDate()
      const ventasActual = sales
        .filter(s => { const d = new Date(s.fecha); return d.getFullYear() === currentYear && d.getMonth() === m })
        .reduce((sum, s) => sum + (s.venta_neta ?? 0), 0)
      const ventasAnterior = sales
        .filter(s => {
          const d = new Date(s.fecha)
          if (d.getFullYear() !== previousYear || d.getMonth() !== m) return false
          if (isPartialMonth && d.getDate() > maxDay) return false
          return true
        })
        .reduce((sum, s) => sum + (s.venta_neta ?? 0), 0)
      totalActual += ventasActual
      totalAnterior += ventasAnterior
      data.push({ month: MESES_CORTO[m], actual: ventasActual, anterior: ventasAnterior, isPartial: isPartialMonth, daysElapsed: isPartialMonth ? maxDay : daysInMonth, daysTotal: daysInMonth })
    }
    return { data, totalActual, totalAnterior, maxDay }
  }, [sales, selectedPeriod.year, selectedPeriod.month, maxDate, dataAvailability.has_venta_neta])

  // ── PULSO cards — must be before early return to respect Rules of Hooks ──
  const pulsoResult = useMemo(() => {
    if (!teamStats) return { visible: [] as PulsoCard[], total: 0 }
    const cumpl = teamStats.meta_equipo
      ? ((teamStats.proyeccion_equipo ?? vendorAnalysis.reduce((s, v) => s + (v.proyeccion_cierre ?? 0), 0)) / teamStats.meta_equipo) * 100
      : (teamStats.cumplimiento_equipo ?? 0)
    const em = {
      estado: 'sin_base' as string,
      proyeccion_cierre: 0, actual: 0, historico_mes: 0,
      diasTranscurridos: teamStats.dias_transcurridos, diasTotales: teamStats.dias_totales,
      gap_pct: null as number | null, ingreso_actual: 0,
    }
    const sliceActual = salesInPeriod(sales, selectedPeriod.year, selectedPeriod.month)
    const slicePrev = salesInPeriod(sales, selectedPeriod.year - 1, selectedPeriod.month)
    em.actual = sliceActual.reduce((a, s) => a + s.unidades, 0)
    em.ingreso_actual = sliceActual.reduce((a, s) => a + (s.venta_neta ?? 0), 0)
    em.historico_mes = slicePrev.reduce((a, s) => a + s.unidades, 0)
    const ritmo = teamStats.dias_transcurridos > 0 ? em.actual / teamStats.dias_transcurridos : 0
    em.proyeccion_cierre = Math.round(ritmo * teamStats.dias_totales)
    const esperado = teamStats.dias_totales > 0 && em.historico_mes > 0
      ? Math.round(em.historico_mes * (teamStats.dias_transcurridos / teamStats.dias_totales)) : 0
    em.gap_pct = esperado > 0 ? Math.round(((em.actual - esperado) / esperado) * 100) : null
    const ratio = esperado > 0 ? em.actual / esperado : null
    em.estado = ratio === null ? 'sin_base' : ratio >= 1.05 ? 'adelantado' : ratio >= 0.85 ? 'en_linea' : 'atrasado'
    const sUSD = configuracion.metricaGlobal === 'usd' && dataAvailability.has_venta_neta && !!ytdChartUSD
    return computePulsoCards({
      vendorAnalysis, teamStats, clientesDormidos, concentracionRiesgo,
      categoriasInventario, canalAnalysis, supervisorAnalysis, insights, dataAvailability,
      moneda: configuracion.moneda, showUSD: sUSD, estadoMes: em, cumplimientoFinal: cumpl,
      sales, selectedPeriod,
    })
  }, [teamStats, vendorAnalysis, clientesDormidos, concentracionRiesgo,
    categoriasInventario, canalAnalysis, supervisorAnalysis, insights, dataAvailability,
    configuracion.moneda, configuracion.metricaGlobal, ytdChartUSD,
    sales, selectedPeriod])

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
  const valorRiesgoClien = clientesDormidos.reduce((s, c) => s + c.valor_historico, 0)
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

  const showUSD = dashMetrica === 'usd' && dataAvailability.has_venta_neta && !!ytdChartUSD
  const activeYtdChart = showUSD ? ytdChartUSD! : ytdChart
  const activeYtdDiff = activeYtdChart.totalActual - activeYtdChart.totalAnterior
  const activeYtdUp = activeYtdDiff >= 0
  const activeYtdPct = activeYtdChart.totalAnterior > 0 ? ((activeYtdDiff / activeYtdChart.totalAnterior) * 100) : null

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


  const fmtBig = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000    ? `${(n / 1000).toFixed(1)}k`
    : Math.round(n).toLocaleString('es-SV')

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

      {/* PulsoPanel — categorías / inventario */}
      {pulsoPanel && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setPulsoPanel(null)} />
          <PulsoPanel
            data={pulsoPanel}
            moneda={configuracion.moneda}
            onClose={() => setPulsoPanel(null)}
            onChat={(q) => {
              setPulsoPanel(null)
              const isDemo = location.pathname.startsWith('/demo')
              navigate(`${isDemo ? '/demo' : ''}/chat`, { state: { prefill: q, source: 'Pulso' } })
            }}
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
        {/* Month selector */}
        <div className="sf-no-print" ref={monthDropRef}>
          <button
            ref={monthBtnRef}
            onClick={() => {
              if (!monthDropOpen && monthBtnRef.current) {
                const r = monthBtnRef.current.getBoundingClientRect()
                setMonthDropRect({ top: r.bottom + 6, left: r.left, width: r.width })
              }
              setMonthDropOpen(v => !v)
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors"
            style={{ background: 'var(--sf-inset)', color: 'var(--sf-t2)', border: '1px solid var(--sf-border)' }}
          >
            <Calendar className="w-3.5 h-3.5" style={{ color: 'var(--sf-t4)' }} />
            {MESES_LARGO[selectedPeriod.month].charAt(0).toUpperCase() + MESES_LARGO[selectedPeriod.month].slice(1)} {selectedPeriod.year}
            <ChevronDown className="w-3 h-3" style={{ color: 'var(--sf-t4)', transform: monthDropOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
          {monthDropOpen && monthDropRect && createPortal(
            <div
              id="sf-month-portal"
              style={{
                position: 'fixed',
                top: monthDropRect.top,
                left: monthDropRect.left,
                minWidth: Math.max(monthDropRect.width, 160),
                maxHeight: 300,
                overflowY: 'auto',
                zIndex: 9999,
                background: 'var(--sf-card)',
                border: '1px solid var(--sf-border)',
                borderRadius: 12,
                boxShadow: '0 20px 40px rgba(0,0,0,0.35)',
              }}
            >
              <div className="p-1.5 flex flex-col gap-0.5">
                {availableMonths.map(({ year, month }) => {
                  const isSelected = year === selectedPeriod.year && month === selectedPeriod.month
                  const label = MESES_LARGO[month].charAt(0).toUpperCase() + MESES_LARGO[month].slice(1)
                  return (
                    <button
                      key={`${year}-${month}`}
                      onClick={() => {
                        setSelectedPeriod({ year, month })
                        setMonthDropOpen(false)
                      }}
                      className="w-full px-3 py-1.5 rounded-lg text-[12px] font-medium text-left flex items-center justify-between transition-colors cursor-pointer"
                      style={{
                        background: isSelected ? 'var(--sf-green-bg)' : 'transparent',
                        color: isSelected ? 'var(--sf-green)' : 'var(--sf-t3)',
                      }}
                    >
                      {label}
                      {isSelected && <span style={{ color: 'var(--sf-green)', fontSize: 10 }}>✓</span>}
                    </button>
                  )
                })}
              </div>
            </div>,
            document.body
          )}
        </div>
        <span
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px]"
          style={{ background: 'var(--sf-inset)', color: 'var(--sf-t4)' }}
        >
          <Calendar className="w-3 h-3" />
          Día {teamStats.dias_transcurridos} de {teamStats.dias_totales}
        </span>
      </div>

      {/* ── KPI CARDS ──────────────────────────────────────────────────────── */}
      <div className="intel-fade grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6" style={{ animationDelay: '30ms' }}>
        {/* Card 1 — VENTAS YTD + variación vs año anterior */}
        {(() => {
          const mainUds  = ytdChart.totalActual
          const mainNeto = ytd_neto
          // Usar siempre activeYtdPct para que KPI y gráfica muestren el mismo porcentaje
          const varPct   = activeYtdPct
          const label = `YTD — vs mismo periodo ${selectedPeriod.year - 1}`
          return (
            <div className="rounded-xl p-4" style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--sf-t5)' }}>
                Ventas YTD
              </p>
              {showUSD && mainNeto > 0 ? (
                <p className="text-2xl font-bold" style={{ fontFamily: "'DM Mono', monospace", color: 'var(--sf-t1)' }}>
                  {configuracion.moneda} {fmtBig(mainNeto)}
                </p>
              ) : (
                <p className="text-2xl font-bold" style={{ fontFamily: "'DM Mono', monospace", color: 'var(--sf-t1)' }}>
                  {fmtBig(mainUds)}<span className="text-sm font-normal ml-1" style={{ color: 'var(--sf-t5)' }}>uds</span>
                </p>
              )}
              {varPct != null && (
                <p className="text-xs font-semibold mt-1.5" style={{ color: varPct >= 0 ? 'var(--sf-green)' : 'var(--sf-red)' }}>
                  {varPct >= 0 ? '+' : ''}{varPct.toFixed(1)}% <span style={{ color: 'var(--sf-t5)', fontWeight: 400 }}>{label}</span>
                </p>
              )}
              {comparacionMes && comparacionMes.mesPrevTotal > 0 && (
                <p className="text-[10px] mt-1" style={{ color: comparacionMes.variacion >= 0 ? 'var(--sf-green)' : 'var(--sf-red)' }}>
                  vs {comparacionMes.mesPrevNombre}: {comparacionMes.variacion >= 0 ? '+' : ''}{comparacionMes.variacion.toFixed(1)}%
                </p>
              )}
            </div>
          )
        })()}

        {/* Card 3 — PROYECCIÓN CIERRE */}
        {(() => {
          const hasNeta = dataAvailability.has_venta_neta
          const proyVal = hasNeta ? proyeccion_neta : estadoMes.proyeccion_cierre
          const hasMeta = !!teamStats?.meta_equipo && teamStats.meta_equipo > 0
          const metaVal = hasMeta ? teamStats!.meta_equipo! : 0
          const proyVsMetaPct = hasMeta ? Math.round((proyFinal / metaVal) * 100) : null
          const metaColor = proyVsMetaPct !== null ? (proyVsMetaPct >= 100 ? 'var(--sf-green)' : 'var(--sf-red)') : 'var(--sf-t1)'
          const belowMeta = proyVsMetaPct !== null && proyVsMetaPct < 100
          // Brecha en USD (estimada con ratio promedio ytd)
          const avgRevPerUnit = ytd_neto > 0 && ytdChart.totalActual > 0 ? ytd_neto / ytdChart.totalActual : 0
          const metaNeta = avgRevPerUnit > 0 ? Math.round(metaVal * avgRevPerUnit) : 0
          const brechaNeta = hasNeta && metaNeta > 0 ? proyeccion_neta - metaNeta : null
          const brechaUnits = proyFinal - metaVal
          return (
            <div className="rounded-xl p-4" style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--sf-t5)' }}>Proyección cierre</p>
              <p className="text-2xl font-bold" style={{ fontFamily: "'DM Mono', monospace", color: metaColor }}>
                {showUSD && hasNeta
                  ? `${configuracion.moneda} ${Math.round(proyeccion_neta).toLocaleString('es-SV')}`
                  : <>{Math.round(estadoMes.proyeccion_cierre).toLocaleString('es-SV')}<span className="text-sm font-normal ml-1" style={{ color: 'var(--sf-t5)' }}>uds</span></>
                }
              </p>
              {proyVsMetaPct !== null ? (
                belowMeta ? (
                  <p className="text-xs font-semibold mt-1" style={{ color: 'var(--sf-red)' }}>
                    {showUSD && brechaNeta !== null
                      ? `${configuracion.moneda} ${Math.abs(Math.round(brechaNeta)).toLocaleString('es-SV')} vs meta`
                      : `${Math.abs(brechaUnits).toLocaleString('es-SV')} uds vs meta`
                    }
                  </p>
                ) : (
                  <p className="text-xs font-semibold mt-1" style={{ color: 'var(--sf-green)' }}>
                    vs meta: {proyVsMetaPct}%
                  </p>
                )
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
                {showUSD && estadoMes.ingreso_actual > 0
                  ? `${configuracion.moneda} ${fmtBig(estadoMes.ingreso_actual)} / ${configuracion.moneda} ${fmtBig(teamStats.meta_equipo)}`
                  : `${estadoMes.actual.toLocaleString()} / ${teamStats.meta_equipo.toLocaleString()} uds`
                }
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
            <p className="text-[11px] font-bold uppercase tracking-[0.15em]" style={{ color: 'var(--sf-t5)' }}>Ventas mes a mes</p>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5">
                <span style={{ color: '#10B981', fontSize: 10, lineHeight: 1 }}>▲</span>
                <span style={{ color: 'var(--sf-t4)' }}>{selectedPeriod.year} creció vs {selectedPeriod.year - 1}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span style={{ color: '#ef4444', fontSize: 10, lineHeight: 1 }}>▼</span>
                <span style={{ color: 'var(--sf-t4)' }}>{selectedPeriod.year} cayó vs {selectedPeriod.year - 1}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: '#6B7280' }} />
                <span style={{ color: 'var(--sf-t4)' }}>{selectedPeriod.year - 1}</span>
              </span>
            </div>
          </div>

          {activeYtdChart.data.length > 0 ? (() => {
            const yMax = Math.max(...activeYtdChart.data.flatMap(d => [d.actual, d.anterior]), 1)
            const yDomain: [number, number] = [0, Math.ceil(yMax * 1.15)]
            return (
            <div className="flex-1" style={{ minHeight: 200 }}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={activeYtdChart.data} margin={{ top: 30, right: 10, left: 0, bottom: 16 }} barGap={2} barCategoryGap="20%" style={{ cursor: 'default' }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--sf-border, rgba(255,255,255,0.06))" vertical={false} />
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={(props: { x: number; y: number; payload: { value: string; index: number } }) => {
                      const entry = activeYtdChart.data[props.payload.index]
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
                  <YAxis type="number" tick={{ fontSize: 10, fill: 'var(--sf-t2, #C8DDEF)' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} width={40} domain={yDomain} allowDataOverflow={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.04)', stroke: 'none' }}
                    content={({ active, payload, label }: any) => {
                      if (!active || !payload?.length) return null
                      const anteriorEntry = payload.find((e: any) => e.dataKey === 'anterior')
                      const actualEntry = payload.find((e: any) => e.dataKey === 'actual')
                      const valAnterior = Number(anteriorEntry?.value ?? 0)
                      const valActual = Number(actualEntry?.value ?? 0)
                      const pct = valAnterior > 0 ? ((valActual - valAnterior) / valAnterior) * 100 : null
                      const fmtVal = (v: number) => showUSD
                        ? `${configuracion.moneda} ${v.toLocaleString('es-SV')}`
                        : `${v.toLocaleString('es-SV')} uds`
                      return (
                        <div style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)', borderRadius: 10, padding: '12px 16px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', minWidth: 160 }}>
                          <p style={{ color: 'var(--sf-t2)', fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{label}</p>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, color: 'var(--sf-t1)', fontWeight: 600, fontSize: 12 }}>
                            <span>{selectedPeriod.year}</span>
                            <span>{fmtVal(valActual)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, color: 'var(--sf-t4)', fontWeight: 400, fontSize: 12, marginTop: 2 }}>
                            <span>{selectedPeriod.year - 1}</span>
                            <span>{fmtVal(valAnterior)}</span>
                          </div>
                          {pct !== null && (
                            <p style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--sf-border)', fontSize: 12, fontWeight: 600, color: pct >= 0 ? '#10B981' : '#ef4444' }}>
                              {pct >= 0 ? '▲' : '▼'} {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                            </p>
                          )}
                        </div>
                      )
                    }}
                  />
                  <Bar dataKey="anterior" name={String(selectedPeriod.year - 1)} radius={[4, 4, 0, 0]}>
                    {activeYtdChart.data.map((entry, index) => (
                      <Cell key={index} fill="#6B7280" fillOpacity={entry.isPartial ? 0.2 : 0.5} strokeDasharray={entry.isPartial ? '3 2' : undefined} stroke={entry.isPartial ? '#6B7280' : 'none'} />
                    ))}
                  </Bar>
                  <Bar dataKey="actual" name={String(selectedPeriod.year)} radius={[4, 4, 0, 0]}>
                    {activeYtdChart.data.map((entry, index) => {
                      const isUp = entry.actual >= entry.anterior
                      const barColor = isUp ? '#10B981' : '#ef4444'
                      return <Cell key={index} fill={barColor} fillOpacity={entry.isPartial ? 0.5 : 1} strokeDasharray={entry.isPartial ? '3 2' : undefined} stroke={entry.isPartial ? barColor : 'none'} />
                    })}
                    <LabelList
                      dataKey="actual"
                      position="top"
                      content={(props: any) => {
                        const entry = activeYtdChart.data[props.index]
                        if (!entry || entry.anterior === 0) return null
                        const pct = ((entry.actual - entry.anterior) / entry.anterior) * 100
                        const color = pct >= 0 ? '#10B981' : '#ef4444'
                        return (
                          <text
                            x={Number(props.x) + Number(props.width) / 2}
                            y={Number(props.y) - 4}
                            textAnchor="middle"
                            fontSize={13}
                            fontWeight={700}
                            fill={color}
                          >
                            {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                          </text>
                        )
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            )
          })() : (
            <p className="text-[12px] italic flex-1 flex items-center" style={{ color: 'var(--sf-t5)' }}>Primer período analizado — sin historial comparable</p>
          )}

          {activeYtdChart.totalActual > 0 && (
            <div className="flex items-center justify-between mt-2 text-xs">
              <span style={{ color: 'var(--sf-t3)' }}>
                {showUSD
                  ? `${configuracion.moneda} ${activeYtdChart.totalActual.toLocaleString('es-SV')} acumulados`
                  : `${activeYtdChart.totalActual.toLocaleString('es-SV')} uds acumuladas`
                }
              </span>
              {activeYtdPct !== null && (
                <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, color: activeYtdUp ? '#10B981' : '#ef4444' }}>
                  {activeYtdUp ? '+' : ''}{activeYtdPct.toFixed(1)}% vs misma fecha {selectedPeriod.year - 1}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── PULSO ─────────────────────────────────────────────────────────── */}
      {pulsoResult.visible.length > 0 && (
        <div className="intel-fade" style={{ animationDelay: '100ms' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="pulse-danger" style={{ fontSize: 14, color: pulsoResult.visible.filter(c => c.severity === 'critical').length >= 3 ? 'var(--sf-red)' : pulsoResult.visible.some(c => c.severity === 'critical') ? 'var(--sf-amber)' : 'var(--sf-green)' }}>◉</span>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--sf-t5)' }}>Pulso</p>
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded" style={{ background: 'var(--sf-overlay-light)', color: 'var(--sf-t4)' }}>{pulsoResult.total} señales</span>
            {estadoMes.estado !== 'sin_base' && (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{
                color: estadoMes.estado === 'atrasado' ? 'var(--sf-red)' : estadoMes.estado === 'adelantado' ? 'var(--sf-green)' : 'var(--sf-t4)',
                background: estadoMes.estado === 'atrasado' ? 'var(--sf-red-bg)' : estadoMes.estado === 'adelantado' ? 'var(--sf-green-bg)' : 'var(--sf-overlay-light)',
              }}>
                {estadoMes.estado === 'atrasado' ? '↓ Atraso' : estadoMes.estado === 'adelantado' ? '↑ Adelanto' : '→ En línea'}
              </span>
            )}
          </div>
          {/* ── Pulso Cards Grid ──────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-1">
            {pulsoResult.visible.map((card) => {
              const sevColors: Record<string, { border: string; accent: string; bg: string }> = {
                critical: { border: 'var(--sf-red-border)', accent: 'var(--sf-red)', bg: 'var(--sf-red-bg)' },
                warning:  { border: 'var(--sf-amber-border)', accent: 'var(--sf-amber)', bg: 'var(--sf-amber-bg)' },
                positive: { border: 'var(--sf-green-border)', accent: 'var(--sf-green)', bg: 'var(--sf-green-bg)' },
                info:     { border: 'var(--sf-border)', accent: 'var(--sf-t4)', bg: 'var(--sf-overlay-light)' },
              }
              const sc = sevColors[card.severity]
              const isDemo = location.pathname.startsWith('/demo')
              const prefix = isDemo ? '/demo' : ''
              return (
                <div
                  key={card.type}
                  className="rounded-xl p-4 cursor-pointer transition-all duration-200 group"
                  style={{
                    background: 'var(--sf-card)',
                    borderTop: '1px solid var(--sf-border)',
                    borderRight: '1px solid var(--sf-border)',
                    borderBottom: '1px solid var(--sf-border)',
                    borderLeft: `3px solid ${sc.accent}`,
                  }}
                  onClick={() => {
                    if (card.action.type === 'panel') {
                      if (card.entityType === 'vendedor' && card.entityId) {
                        const va = vendorAnalysis.find(v => v.vendedor === card.entityId)
                        if (va) setVendedorPanel(va)
                      }
                    } else if (card.action.type === 'pulso_panel' && card.action.panelData) {
                      setPulsoPanel(card.action.panelData)
                    } else if (card.action.type === 'chat') {
                      navigate(`${prefix}/chat`, { state: { prefill: card.action.target, source: 'Pulso' } })
                    }
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '' }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-[12px] font-semibold leading-snug" style={{ color: 'var(--sf-t1)' }}>{card.title}</p>
                    {card.tag && (
                      <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ml-2" style={{ background: sc.bg, color: sc.accent }}>
                        {card.tag}
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <span className="text-xl font-bold" style={{ fontFamily: "'DM Mono', monospace", color: sc.accent }}>
                      {card.metric}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--sf-t5)' }}>{card.metricLabel}</span>
                  </div>
                  <p className="text-[11px] leading-relaxed" style={{ color: 'var(--sf-t4)' }}>{card.detail}</p>
                  <p className="text-[10px] font-medium mt-2 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--sf-green)' }}>
                    {card.action.label} →
                  </p>
                </div>
              )
            })}
          </div>
          {/* +N señales más */}
          {pulsoResult.total > pulsoResult.visible.length && (
            <button
              onClick={() => {
                const el = document.getElementById('sf-alertas')
                if (el) el.scrollIntoView({ behavior: 'smooth' })
              }}
              className="w-full text-center py-3 mt-2 text-xs font-medium cursor-pointer transition-colors hover:underline"
              style={{ color: 'var(--sf-t5)' }}
            >
              +{pulsoResult.total - pulsoResult.visible.length} señales más →
            </button>
          )}
        </div>
      )}



      {/* ── ALERTAS Y OPORTUNIDADES ──────────────────────────────────── */}
      <div id="sf-alertas" style={{ borderTop: '1px solid var(--sf-border)' }} />

      <div className="intel-fade space-y-3" style={{ animationDelay: '160ms' }}>
        {/* Header */}
        <div className="flex items-center gap-2">
          <Bell className="w-3.5 h-3.5" style={{ color: 'var(--sf-t5)' }} />
          <p className="text-[11px] font-bold uppercase tracking-[0.15em]" style={{ color: 'var(--sf-t5)' }}>
            Alertas y Oportunidades
          </p>
          <FirstTimeTooltip
            storageKey="sf_tip_inteligencia"
            text="Estas son alertas sobre riesgos y oportunidades que detectamos. Marcalas como atendidas cuando tomes accion"
          />
        </div>

        {/* Text-underline tabs */}
        <div className="flex gap-0 border-b" style={{ borderColor: 'var(--sf-border)' }}>
          {([
            { key: 'all'        as FeedFilterKey, label: 'Todas',         count: feedFilterCounts.all },
            { key: 'urgentes'   as FeedFilterKey, label: 'Urgentes',      count: feedFilterCounts.urgentes },
            { key: 'vendedores' as FeedFilterKey, label: 'Equipo',        count: feedFilterCounts.vendedores },
            { key: 'hallazgo'   as FeedFilterKey, label: 'Oportunidades', count: feedFilterCounts.hallazgo },
          ]).filter(t => t.key === 'all' || t.count > 0).map(tab => {
            const isActive = feedFilter === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => { setFeedFilter(tab.key); setFeedExpanded(false) }}
                className="px-3 py-2 text-xs font-medium cursor-pointer transition-colors duration-150 relative"
                style={{ color: isActive ? 'var(--sf-t1)' : 'var(--sf-t5)', background: 'transparent', border: 'none' }}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className="ml-1.5 text-[10px]" style={{ color: isActive ? 'var(--sf-t3)' : 'var(--sf-t6)', fontFamily: "'DM Mono', monospace" }}>
                    {tab.count}
                  </span>
                )}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t" style={{ background: 'var(--sf-green)' }} />
                )}
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
                          {/* Title + status badges */}
                          <div className="flex items-start gap-2 mb-1.5 flex-wrap">
                            <span className={`${titleSize} leading-snug flex-1`} style={{ color: 'var(--sf-t1)' }}>
                              {getAlertaTitle(insight)}
                            </span>
                            {isFollowing && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                                style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.12)' }}>
                                🔧 En trabajo
                              </span>
                            )}
                            {isResolved && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                                style={{ color: '#22c55e', background: 'rgba(34,197,94,0.12)' }}>
                                ✅ Resuelta
                              </span>
                            )}
                            {insightReopened && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                                style={{ color: '#f97316', background: 'rgba(249,115,22,0.12)' }}>
                                <RotateCcw className="w-2.5 h-2.5" /> Reabierta
                              </span>
                            )}
                            {idx < 3 && !isResolved && (() => {
                              // Urgency badge for top 3 alerts
                              const isCriticoVendedor = insight.tipo === 'riesgo_vendedor' && insight.prioridad === 'CRITICA'
                              const isCruzadoCritico = insight.tipo === 'cruzado' && insight.prioridad === 'CRITICA'
                              const isMetaBaja = insight.tipo === 'riesgo_equipo' || insight.tipo === 'riesgo_meta'
                              const isProductoColapso = insight.tipo === 'riesgo_producto' && insight.prioridad === 'CRITICA'
                              if (isCriticoVendedor || isCruzadoCritico) {
                                return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ color: '#ef4444', background: 'rgba(239,68,68,0.12)' }}>Actuar hoy</span>
                              }
                              if (isMetaBaja || isProductoColapso) {
                                return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.12)' }}>Esta semana</span>
                              }
                              return null
                            })()}
                          </div>

                          {/* Summary + key datum */}
                          {(() => {
                            const { summary, keyData, keyLabel } = formatAlertaContent(insight, showUSD, configuracion.moneda)
                            return (
                              <>
                                <p className="text-[12px] leading-relaxed mb-1.5" style={{ color: 'var(--sf-t4)' }}>
                                  {summary}
                                </p>
                                {keyData && (
                                  <div className="flex items-baseline gap-2">
                                    <p className="text-base font-semibold leading-tight" style={{ color: 'var(--sf-t1)', fontFamily: "'DM Mono', monospace" }}>
                                      {keyData}
                                    </p>
                                    {keyLabel && (
                                      <span className="text-[10px]" style={{ color: 'var(--sf-t5)' }}>{keyLabel}</span>
                                    )}
                                  </div>
                                )}
                              </>
                            )
                          })()}

                          {/* Action row: nav link + explain with AI */}
                          <div className="flex items-center mt-2 gap-3">
                            {(() => {
                              const entityName = insight.titulo.includes(' — ') ? insight.titulo.split(' — ').pop()!.trim() : null
                              const navLink = insight.tipo === 'riesgo_vendedor'
                                ? { label: entityName ? `${entityName} →` : 'Ver vendedores →', path: `/vendedores${entityName ? `?vendedor=${encodeURIComponent(entityName)}` : ''}` }
                                : insight.tipo === 'riesgo_equipo'
                                ? { label: 'Ver equipo →', path: '/vendedores' }
                                : insight.tipo === 'riesgo_producto'
                                ? { label: entityName ? `${entityName} →` : 'Ver rotación →', path: `/rotacion${entityName ? `?categoria=${encodeURIComponent(entityName)}` : ''}` }
                                : insight.tipo === 'riesgo_cliente'
                                ? { label: entityName ? `${entityName} →` : 'Ver clientes →', path: '/clientes', openCliente: entityName }
                                : insight.tipo === 'cruzado'
                                ? { label: entityName ? `${entityName} →` : 'Ver vendedores →', path: `/vendedores${entityName ? `?vendedor=${encodeURIComponent(entityName)}` : ''}` }
                                : insight.tipo === 'riesgo_meta'
                                ? { label: entityName ? `${entityName} →` : 'Ver metas →', path: '/metas' }
                                : insight.tipo === 'hallazgo'
                                ? (insight.vendedor
                                  ? { label: `${insight.vendedor} →`, path: `/vendedores?vendedor=${encodeURIComponent(insight.vendedor)}` }
                                  : insight.producto
                                  ? { label: `${insight.producto} →`, path: `/rotacion?categoria=${encodeURIComponent(insight.producto)}` }
                                  : null)
                                : null
                              return navLink ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); navigate(dp(navLink.path), { state: 'openCliente' in navLink && navLink.openCliente ? { openCliente: navLink.openCliente, source: 'alert' } : undefined }) }}
                                  className="text-[11px] font-medium cursor-pointer hover:underline transition-colors"
                                  style={{ color: 'var(--sf-green)' }}
                                >
                                  {navLink.label}
                                </button>
                              ) : null
                            })()}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                const { summary } = formatAlertaContent(insight, showUSD, configuracion.moneda)
                                navigate(dp('/chat'), { state: { prefill: `Explica la alerta: ${insight.titulo}. ${summary}`, displayPrefill: `Explicar: ${insight.titulo}`, source: 'Alertas' } })
                              }}
                              className="text-[11px] font-medium cursor-pointer hover:underline transition-colors"
                              style={{ color: 'var(--sf-t3)' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--sf-t1)' }}
                              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--sf-t3)' }}
                            >
                              ✦ Explicar con IA
                            </button>
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
                                  navigate(dp('/chat'), { state: { prefill: fullContext, displayPrefill: displayMessage, source: 'Estado Comercial' } })
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

                {/* Show more / collapse — subtle text link */}
                {!feedExpanded && remainingCount > 0 && (
                  <button
                    onClick={() => setFeedExpanded(true)}
                    className="w-full py-2 text-[12px] font-medium transition-colors duration-150 cursor-pointer"
                    style={{ color: 'var(--sf-t5)', background: 'transparent', border: 'none' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--sf-green)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--sf-t5)' }}
                  >
                    Ver {remainingCount} alertas más →
                  </button>
                )}
                {feedExpanded && feedFiltered.length > TOP_COUNT && (
                  <button
                    onClick={() => setFeedExpanded(false)}
                    className="w-full py-2 text-[12px] font-medium transition-colors duration-150 cursor-pointer"
                    style={{ color: 'var(--sf-t5)', background: 'transparent', border: 'none' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--sf-t3)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--sf-t5)' }}
                  >
                    ↑ Mostrar menos
                  </button>
                )}
              </>
            )
          })()}
        </div>
      </div>

      {/* Explorar Dimensiones removed — replaced by Pulso above */}
      {false && <div className="intel-fade" style={{ animationDelay: '400ms' }}>
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
                <div className="text-xs mt-1" style={{ color: 'var(--sf-t3)' }}>inactivos</div>
                <div className="text-xs mt-2" style={{ color: 'var(--sf-t3)' }}>
                  {showUSD && valorRiesgoClien > 0
                    ? <><span style={{ color: 'var(--sf-amber)' }}>{configuracion.moneda} {Math.round(valorRiesgoClien).toLocaleString('es-SV')} en riesgo</span> · {activosMes} activos</>
                    : <>{activosMes} activos este mes</>
                  }
                </div>
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
      </div>}
      </div>{/* end space-y-8 */}
      </div>{/* end Inter wrapper */}
    </>
  )
}
