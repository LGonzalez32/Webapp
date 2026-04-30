import { useMemo, useState, useEffect, useRef, useCallback, type CSSProperties, type Key } from 'react'
import { buildPivotTree, flattenPivot } from '../utils/pivotUtils'
import type { DimKey, PivotNode } from '../utils/pivotUtils'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, horizontalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { restrictToHorizontalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import { useNavigate } from 'react-router-dom'
import { useDemoPath } from '../lib/useDemoPath'
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { useAppStore } from '../store/appStore'
import { useAnalysis } from '../lib/useAnalysis'
import { salesInPeriod } from '../lib/analysis'
import { syncSalesData, getAnnualPerformance } from '../lib/forecastApi'
import { TrendingUp, TrendingDown, Minus, Calendar, Loader2, Settings, ChevronRight, ChevronsDown, ChevronsUp } from 'lucide-react'
import { cn } from '../lib/utils'
import { callAI } from '../lib/chatService'
import AnalysisDrawer from '../components/ui/AnalysisDrawer'
import type { SaleRecord, MetaRecord, ForecastData, DataAvailability } from '../types'
import { DIM_META } from '../config/metaConfig'
import { SFSelect } from '../components/ui/SFSelect'

// schema-cleanup: TODAS las dimensiones disponibles. La gating por availability
// se hace abajo en el render con un check explícito por dim.
const DIM_TOGGLES: { key: DimKey; label: string; icon: string; requiresDim?: keyof DataAvailability }[] = [
  { key: 'mes',          label: 'Mes',          icon: '📅' },
  { key: 'vendedor',     label: 'Vendedor',     icon: '👤' },
  { key: 'canal',        label: 'Canal',        icon: '🏪', requiresDim: 'has_canal' },
  { key: 'cliente',      label: 'Cliente',      icon: '🧾', requiresDim: 'has_cliente' },
  { key: 'producto',     label: 'Producto',     icon: '📦', requiresDim: 'has_producto' },
  { key: 'categoria',    label: 'Categoría',    icon: '🏷️', requiresDim: 'has_categoria' },
  { key: 'subcategoria', label: 'Subcategoría', icon: '🔖', requiresDim: 'has_subcategoria' },
  { key: 'departamento', label: 'Departamento', icon: '🌎', requiresDim: 'has_departamento' },
  { key: 'supervisor',   label: 'Supervisor',   icon: '🧑‍💼', requiresDim: 'has_supervisor' },
  { key: 'proveedor',    label: 'Proveedor',    icon: '🏭', requiresDim: 'has_proveedor' },
]

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// Defined outside component to avoid infinite re-renders (React sees new component type each render)
function RendimientoTooltip({ active, payload, label, useVentaNeta, moneda }: {
  active?: boolean; payload?: any[]; label?: string; useVentaNeta: boolean; moneda: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: 'var(--sf-t1)', minWidth: '160px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
      <p style={{ fontWeight: 600, marginBottom: '8px', color: 'var(--sf-t1)' }}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 500, color: 'var(--sf-t1)' }}>{useVentaNeta ? formatCurrency(p.value, moneda) : p.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

function formatUnits(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toLocaleString()
}
function formatCurrency(n: number, moneda: string): string {
  if (n >= 1_000_000) return `${moneda}${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${moneda}${(n / 1_000).toFixed(1)}k`
  return `${moneda}${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

// ─── PIVOT TABLE HELPERS ──────────────────────────────────────────────────────

interface PivotCols {
  unidades: boolean
  venta_neta: boolean
  meta: boolean
  variacion: boolean
  pct_total: boolean
}


const FORECAST_BACKEND_ENABLED = false // TODO: reactivar cuando el backend esté desplegado en producción

// ─── SORTABLE PILL ────────────────────────────────────────────────────────────

function SortablePill({
  dim, index,
}: { dim: DimKey; index: number; key?: Key }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useSortable({ id: dim, transition: null })

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    zIndex: isDragging ? 20 : undefined,
    opacity: isDragging ? 0.95 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
    background: 'var(--sf-card)',
    border: '1px solid var(--sf-border)',
    borderLeft: '3px solid var(--sf-green)',
    borderRadius: '6px',
    padding: '6px 12px',
    touchAction: 'none',
    transition: 'box-shadow 150ms',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-1.5 text-xs font-bold select-none hover:shadow-md"
      {...attributes}
      {...listeners}
    >
      <span style={{ color: 'var(--sf-t5)', lineHeight: 1 }}>⋮⋮</span>
      <span style={{ color: 'var(--sf-t3)' }}>{DIM_META[dim]?.label ?? dim}</span>
      <span style={{ fontSize: '10px', opacity: 0.4, fontFamily: "'DM Mono', monospace" }}>{index + 1}</span>
    </div>
  )
}

// ─── PÁGINA ───────────────────────────────────────────────────────────────────

export default function RendimientoPage() {
  useAnalysis()
  const navigate = useNavigate()
  const dp = useDemoPath()
  const { sales, metas, dataAvailability, selectedPeriod, configuracion, forecastData, forecastChartLoading, setForecastData, setForecastChartLoading, dataSource, vendorAnalysis } = useAppStore()
  const metric: 'unidades' | 'venta_neta' = (configuracion.metricaGlobal ?? 'usd') === 'usd' ? 'venta_neta' : 'unidades'
  const [showBudget, setShowBudget] = useState(true)
  const [selectedVendor, setSelectedVendor] = useState<string>('todos')
  const [selectedYear, setSelectedYear] = useState<number>(selectedPeriod.year)
  // [Ticket 2.3.3] Sincronizar selectedYear local con el store cuando éste
  // materializa selectedPeriod.year desde 0 (initial state neutro post-2.3.2)
  // al año real vía setFechaRefISO al cargar datos. Sin este efecto, el
  // SFSelect del año queda en 0 hasta interacción del usuario.
  useEffect(() => {
    setSelectedYear(selectedPeriod.year)
  }, [selectedPeriod.year])
  const [selectedCliente, setSelectedCliente] = useState<string>('all')
  const [selectedCanal, setSelectedCanal] = useState<string>('all')
  const [selectedProducto, setSelectedProducto] = useState<string>('all')
  const [showExtraFilters, setShowExtraFilters] = useState(false)
  const [rendAnalysisMap, setRendAnalysisMap] = useState<Record<string, { loading: boolean; text: string | null }>>({})
  const [expandedRendVendedor, setExpandedRendVendedor] = useState<string | null>(null)

  const handleAnalyzeRendVendedor = useCallback(async (label: string, actual: number, prev: number, varPct: number | null, pctTotal: number) => {
    setExpandedRendVendedor(label)
    setRendAnalysisMap(p => ({ ...p, [label]: { loading: true, text: null } }))

    const va = vendorAnalysis.find(v => v.vendedor === label)
    const systemPrompt = `Eres un analista comercial de ${configuracion.empresa}.
Responde en formato exacto:

📊 RESUMEN: [Hallazgo principal — máximo 15 palabras]

📈 RENDIMIENTO:
- [Dato clave actual vs anterior — máximo 2 bullets]

⚠️ RIESGO:
- [Factor de riesgo o caída — máximo 2 bullets]

💡 HALLAZGO: [Un dato no obvio con números]

Reglas: máximo 100 palabras, cada bullet con número, sin instrucciones operativas, moneda: ${configuracion.moneda}, español.`

    const userPrompt = [
      `Vendedor: ${label}`,
      `YTD actual: ${actual.toLocaleString()}`,
      `YTD anterior: ${prev.toLocaleString()}`,
      varPct != null ? `Variación: ${varPct.toFixed(1)}%` : '',
      `Peso equipo: ${pctTotal.toFixed(1)}%`,
      va ? `Estado: ${va.riesgo.toUpperCase()}` : '',
    ].filter(Boolean).join('\n')

    try {
      const json = await callAI(
        [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        { model: 'deepseek-chat', max_tokens: 250, temperature: 0.3 },
      )
      setRendAnalysisMap(p => ({ ...p, [label]: { loading: false, text: json.choices?.[0]?.message?.content ?? 'Sin respuesta' } }))
    } catch {
      setRendAnalysisMap(p => ({ ...p, [label]: { loading: false, text: 'No se pudo conectar con el asistente IA.' } }))
    }
  }, [configuracion, vendorAnalysis])

  const currentYear  = selectedPeriod.year
  const currentMonth = selectedPeriod.month
  const isCurrentYear = currentYear === selectedYear
  const showForecast = FORECAST_BACKEND_ENABLED && forecastData != null && isCurrentYear

  // ── Sync sales data to backend and fetch forecast ───────────────────────────
  useEffect(() => {
    if (!FORECAST_BACKEND_ENABLED) return
    const loadForecast = async () => {
      if (sales.length === 0) return

      setForecastChartLoading(true)

      try {
        const syncResult = await syncSalesData(sales)
        if (!syncResult.success) {
          return
        }
        const metricType = metric === 'venta_neta' ? 'revenue' : 'units'
        const dimValue = selectedVendor === 'todos' ? 'all' : selectedVendor

        const result = await getAnnualPerformance(currentYear, 'all', metricType, 'vendedor', dimValue)

        if (result.success && result.kpis && result.series) {
          const forecastPayload: ForecastData = {
            year: result.year,
            metric: result.metric as 'units' | 'revenue',
            seller: result.seller,
            model_used: result.model_used,
            kpis: {
              ytd: result.kpis.ytd,
              ytd_prior_year: result.kpis.ytd_prior_year,
              vs_prior_year_pct: result.kpis.vs_prior_year_pct,
              best_month: result.kpis.best_month,
              projected_year_total: result.kpis.projected_year_total,
            },
            series: result.series,
          }
          setForecastData(forecastPayload)
        }
      } catch (err) {
      } finally {
        setForecastChartLoading(false)
      }
    }

    loadForecast()
  }, [sales, currentYear, selectedVendor, metric])

  // ── Pivot state ──────────────────────────────────────────────────────────
  const [pivotDims, setPivotDims] = useState<DimKey[]>(() => {
    try {
      const stored = localStorage.getItem('sf_pivot_dims')
      if (stored) {
        const parsed = JSON.parse(stored) as DimKey[]
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch { /* ignore */ }
    return ['canal', 'vendedor']
  })
  const [pivotCols, setPivotCols] = useState<PivotCols>({
    unidades: true, venta_neta: true, meta: true, variacion: true, pct_total: false,
  })
  const [showSubtotals, setShowSubtotals] = useState(true)
  const [pivotConfigOpen, setPivotConfigOpen] = useState(false)
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  const userToggledKeys = useRef<Map<string, boolean>>(new Map()) // tracks explicit user expand/collapse choices
  const [sortCol, setSortCol] = useState<'unidades' | 'venta_neta' | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showMicrocopy, setShowMicrocopy] = useState(() => {
    try { return !localStorage.getItem('sf_pivot_advanced_seen') } catch { return false }
  })
  const microcopyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // [Ticket 3.E.1] Toggle "Venta YTD" (default) / "Venta mensual histórica".
  // Estado local, no persiste en store.
  const [tableView, setTableView] = useState<'ytd' | 'monthly'>('ytd')

  const dismissMicrocopy = () => {
    setShowMicrocopy(false)
    try { localStorage.setItem('sf_pivot_advanced_seen', 'true') } catch { /* */ }
    if (microcopyTimer.current) { clearTimeout(microcopyTimer.current); microcopyTimer.current = null }
  }

  // Auto-dismiss microcopy after 10s
  useEffect(() => {
    if (showAdvanced && showMicrocopy) {
      microcopyTimer.current = setTimeout(dismissMicrocopy, 10000)
      return () => { if (microcopyTimer.current) clearTimeout(microcopyTimer.current) }
    }
  }, [showAdvanced, showMicrocopy]) // eslint-disable-line
  const [pivotData, setPivotData] = useState<PivotNode[]>([])
  const [pivotLoading, setPivotLoading] = useState(false)
  const workerRef = useRef<Worker | null>(null)
  const dimsChangedRef = useRef(true)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Persist dims to localStorage
  useEffect(() => {
    localStorage.setItem('sf_pivot_dims', JSON.stringify(pivotDims))
  }, [pivotDims])

  useEffect(() => {
    if (sales.length === 0 && dataSource === 'none') navigate(dp('/cargar'), { replace: true })
  }, [sales.length, navigate, dataSource])

  const useVentaNeta = metric === 'venta_neta' && dataAvailability.has_venta_neta

  const vendors = useMemo(() => {
    const s = new Set(sales.map((s) => s.vendedor))
    return ['todos', ...Array.from(s).sort()]
  }, [sales])

  const años = useMemo(() =>
    [...new Set(sales.map(s => new Date(s.fecha).getFullYear()))].sort((a, b) => b - a),
  [sales])

  const clientes = useMemo(() =>
    dataAvailability.has_cliente
      ? ([...new Set(sales.map(s => s.cliente).filter(Boolean))] as string[]).sort()
      : [],
  [sales, dataAvailability.has_cliente])

  const canales = useMemo(() =>
    dataAvailability.has_canal
      ? ([...new Set(sales.map(s => s.canal).filter(Boolean))] as string[]).sort()
      : [],
  [sales, dataAvailability.has_canal])

  const productos = useMemo(() =>
    dataAvailability.has_producto
      ? ([...new Set(sales.map(s => s.producto).filter(Boolean))] as string[]).sort()
      : [],
  [sales, dataAvailability.has_producto])

  // Filtered sales — applies all active filters
  const filteredSales = useMemo(() => {
    const prevYr = selectedYear - 1
    return sales.filter(s => {
      const yr = new Date(s.fecha).getFullYear()
      if (yr !== selectedYear && yr !== prevYr) return false
      if (selectedVendor !== 'todos' && s.vendedor !== selectedVendor) return false
      if (selectedCliente !== 'all' && s.cliente !== selectedCliente) return false
      if (selectedCanal !== 'all' && s.canal !== selectedCanal) return false
      if (selectedProducto !== 'all' && s.producto !== selectedProducto) return false
      return true
    })
  }, [sales, selectedYear, selectedVendor, selectedCliente, selectedCanal, selectedProducto])

  // [Ticket 3.E.1] Sales filtradas por dim filters PERO sin filtro de año.
  // Alimenta la tabla "Venta mensual histórica" que muestra todos los años del dataset.
  const filteredSalesAllYears = useMemo(() => {
    return sales.filter(s => {
      if (selectedVendor !== 'todos' && s.vendedor !== selectedVendor) return false
      if (selectedCliente !== 'all' && s.cliente !== selectedCliente) return false
      if (selectedCanal !== 'all' && s.canal !== selectedCanal) return false
      if (selectedProducto !== 'all' && s.producto !== selectedProducto) return false
      return true
    })
  }, [sales, selectedVendor, selectedCliente, selectedCanal, selectedProducto])

  const [chartFilter, setChartFilter] = useState<{ dim: DimKey; value: string } | null>(null)

  const filteredForChart = useMemo(() => {
    if (!chartFilter) return filteredSales
    const { dim, value } = chartFilter
    if (dim === 'mes') {
      const month = parseInt(value.split('-')[1] ?? '0')
      return filteredSales.filter(s => new Date(s.fecha).getMonth() + 1 === month)
    }
    return filteredSales.filter(s => (s as Record<string, unknown>)[dim] === value)
  }, [filteredSales, chartFilter])

  // ── Chart data (Ene-Dic only) ───────────────────────────────────────────
  const chartData = useMemo(() => {
    const chartPrev = selectedYear - 1

    return MESES.map((label, monthIdx) => {
      const currSales = salesInPeriod(filteredForChart, selectedYear, monthIdx)
      const currVal = useVentaNeta ? currSales.reduce((a, s) => a + (s.venta_neta ?? 0), 0) : currSales.reduce((a, s) => a + s.unidades, 0)

      const prevSales = salesInPeriod(filteredForChart, chartPrev, monthIdx)
      const prevVal = useVentaNeta ? prevSales.reduce((a, s) => a + (s.venta_neta ?? 0), 0) : prevSales.reduce((a, s) => a + s.unidades, 0)

      let budget: number | null = null
      if (dataAvailability.has_metas && showBudget) {
        const vm = selectedVendor === 'todos'
          ? metas.filter((m) => m.anio === selectedYear && m.mes === monthIdx + 1)
          : metas.filter((m) => m.anio === selectedYear && m.mes === monthIdx + 1 && m.vendedor === selectedVendor)
        budget = vm.reduce((a, m) => a + m.meta, 0) || null
      }

      // Forecast from backend — only for future months
      let forecast: number | null = null
      let forecastUpper: number | null = null
      if (forecastData?.series?.forecast && isCurrentYear && monthIdx > currentMonth) {
        const fp = forecastData.series.forecast.find(p => p.month === monthIdx + 1)
        if (fp?.value != null) forecast = fp.value
      }
      // Connect forecast to last actual month
      if (forecastData?.series?.forecast && isCurrentYear && monthIdx === currentMonth) {
        forecast = currVal > 0 ? currVal : null
      }

      return { mes: label, actual: currVal > 0 || monthIdx <= currentMonth ? currVal : null, anterior: prevVal > 0 ? prevVal : null, forecast, forecastUpper, budget, isCurrent: monthIdx === currentMonth && isCurrentYear, isFuture: isCurrentYear && monthIdx > currentMonth }
    })
  }, [filteredForChart, metas, selectedYear, currentMonth, useVentaNeta, showBudget, isCurrentYear, dataAvailability.has_metas, selectedVendor, forecastData])

  const hasPrevYearData = chartData.some((d) => d.anterior !== null && d.anterior > 0)

  // ── YTD stats ─────────────────────────────────────────────────────────────
  const ytdStats = useMemo(() => {
    // Use backend forecast data if available
    if (forecastData && forecastData.kpis) {
      const kpis = forecastData.kpis
      return {
        ytdCurr: kpis.ytd,
        ytdPrev: kpis.ytd_prior_year ?? 0,
        variacion: kpis.vs_prior_year_pct,
        bestMonth: kpis.best_month?.month ?? -1,
        bestVal: kpis.best_month?.value ?? 0,
        projected: kpis.projected_year_total
      }
    }
    
    // Fallback to local calculation (same-day-range para mes parcial)
    const chartPrev = selectedYear - 1
    const maxSaleDate = filteredForChart.reduce((max, s) => { const d = new Date(s.fecha); return d > max ? d : max }, new Date(0))
    const isPartialMonth = isCurrentYear && currentMonth === maxSaleDate.getMonth() && selectedYear === maxSaleDate.getFullYear()
    const maxDay = maxSaleDate.getDate()
    let ytdCurr = 0, ytdPrev = 0
    for (let m = 0; m <= currentMonth; m++) {
      const cs = salesInPeriod(filteredForChart, selectedYear, m)
      let ps = salesInPeriod(filteredForChart, chartPrev, m)
      // Para el mes parcial, limitar año anterior al mismo día
      if (isPartialMonth && m === currentMonth) {
        ps = ps.filter(s => new Date(s.fecha).getDate() <= maxDay)
      }
      ytdCurr += useVentaNeta ? cs.reduce((a, s) => a + (s.venta_neta ?? 0), 0) : cs.reduce((a, s) => a + s.unidades, 0)
      ytdPrev += useVentaNeta ? ps.reduce((a, s) => a + (s.venta_neta ?? 0), 0) : ps.reduce((a, s) => a + s.unidades, 0)
    }
    const variacion = ytdPrev > 0 ? ((ytdCurr - ytdPrev) / ytdPrev) * 100 : null
    let bestMonth = -1, bestVal = -1
    for (let m = 0; m <= currentMonth; m++) {
      const cs = salesInPeriod(filteredForChart, selectedYear, m)
      const val = useVentaNeta ? cs.reduce((a, s) => a + (s.venta_neta ?? 0), 0) : cs.reduce((a, s) => a + s.unidades, 0)
      if (val > bestVal) { bestVal = val; bestMonth = m }
    }
    let projected = ytdCurr
    if (isCurrentYear) {
      // ytdPrevSum con same-day-range para consistencia
      const ytdPrevSum = ytdPrev
      const gf = ytdPrevSum > 0 ? ytdCurr / ytdPrevSum : 1
      for (let m = currentMonth + 1; m < 12; m++) {
        const ps = salesInPeriod(filteredForChart, chartPrev, m)
        const pv = useVentaNeta ? ps.reduce((a, s) => a + (s.venta_neta ?? 0), 0) : ps.reduce((a, s) => a + s.unidades, 0)
        projected += Math.round(pv * gf)
      }
    }
    return { ytdCurr, ytdPrev, variacion, bestMonth, bestVal, projected }
  }, [filteredForChart, selectedYear, currentMonth, useVentaNeta, isCurrentYear, forecastData])

  // ── Pivot computation via Web Worker ──────────────────────────────────────
  // Mark dims as changed so the worker's onmessage auto-expands on structural change
  useEffect(() => { dimsChangedRef.current = true }, [pivotDims])

  useEffect(() => {
    workerRef.current?.terminate()
    workerRef.current = new Worker(
      new URL('../workers/pivotWorker.ts', import.meta.url),
      { type: 'module' }
    )
    setPivotLoading(true)
    workerRef.current.onmessage = (e: MessageEvent<PivotNode[]>) => {
      const data = e.data
      setPivotData(data)
      // When dims change, merge: respect user's explicit expand/collapse choices, default for the rest
      if (dimsChangedRef.current) {
        dimsChangedRef.current = false
        const toggled = userToggledKeys.current
        const merged = new Set<string>()
        const collectAndMerge = (nodes: PivotNode[]) => {
          for (const n of nodes) {
            if (n.children.length > 0) {
              if (toggled.has(n.id)) {
                // User explicitly set this key — respect their choice
                if (toggled.get(n.id)) merged.add(n.id)
              } else {
                // No user choice — apply default (expand depth 0 and 1)
                if (n.depth <= 1) merged.add(n.id)
              }
              collectAndMerge(n.children)
            }
          }
        }
        collectAndMerge(data)
        setExpandedKeys(merged)
      }
      setPivotLoading(false)
    }
    workerRef.current.postMessage({ filteredSales, metas, pivotDims, selectedYear })
    return () => workerRef.current?.terminate()
  }, [filteredSales, metas, pivotDims, selectedYear])

  const grandTotal = useMemo(() =>
    pivotData.reduce((a, n) => ({ u: a.u + n.unidades, v: a.v + n.ventaNeta, pu: a.pu + n.prevUnidades, pv: a.pv + n.prevVentaNeta }), { u: 0, v: 0, pu: 0, pv: 0 }),
  [pivotData])

  const sortedPivotTree = useMemo(() => {
    if (!sortCol) return pivotData
    return [...pivotData].sort((a, b) => {
      const av = sortCol === 'venta_neta' ? a.ventaNeta : a.unidades
      const bv = sortCol === 'venta_neta' ? b.ventaNeta : b.unidades
      return sortDir === 'desc' ? bv - av : av - bv
    })
  }, [pivotData, sortCol, sortDir])

  // [Ticket 3.E.1] Datos para tabla "Venta mensual histórica".
  // Filas: combinación de pivotDims presentes en filteredSalesAllYears.
  // Columnas: (año, mes) calendar — todos los años del dataset, 12 meses cada uno.
  // Celdas: suma calendar-month sin truncamiento same-day, sin TopBar range.
  const monthlyHistoricalData = useMemo(() => {
    const MESES_LARGO_LOC = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
    if (filteredSalesAllYears.length === 0 || pivotDims.length === 0) {
      return { columns: [] as { year: number; month: number; label: string }[], rows: [] as { label: string; values: number[]; total: number }[], colTotals: [] as number[], grandTotal: 0 }
    }
    const yearsSet = new Set<number>()
    for (const s of filteredSalesAllYears) yearsSet.add(new Date(s.fecha).getFullYear())
    const years = Array.from(yearsSet).sort((a, b) => a - b)
    const columns = years.flatMap(y => MESES_LARGO_LOC.map((m, i) => ({ year: y, month: i, label: `${m} ${y}` })))
    const colCount = columns.length
    const colIndexFor = (year: number, month: number) => {
      const yIdx = years.indexOf(year)
      return yIdx < 0 ? -1 : yIdx * 12 + month
    }
    const rowMap = new Map<string, number[]>()
    for (const s of filteredSalesAllYears) {
      const key = pivotDims
        .map(dim => (s as Record<string, unknown>)[dim] as string | undefined ?? '—')
        .join(' / ')
      const d = new Date(s.fecha)
      const ci = colIndexFor(d.getFullYear(), d.getMonth())
      if (ci < 0) continue
      let arr = rowMap.get(key)
      if (!arr) { arr = new Array(colCount).fill(0); rowMap.set(key, arr) }
      arr[ci] += useVentaNeta ? (s.venta_neta ?? 0) : s.unidades
    }
    const rows = Array.from(rowMap.entries())
      .map(([label, values]) => ({ label, values, total: values.reduce((a, v) => a + v, 0) }))
      .sort((a, b) => b.total - a.total)
    const colTotals = new Array(colCount).fill(0)
    let grandTotal = 0
    for (const row of rows) {
      for (let i = 0; i < colCount; i++) { colTotals[i] += row.values[i]; grandTotal += row.values[i] }
    }
    return { columns, rows, colTotals, grandTotal }
  }, [filteredSalesAllYears, pivotDims, useVentaNeta])

  const flatRows = useMemo(() => {
    const out: (PivotNode & { hasChildren: boolean })[] = []
    flattenPivot(sortedPivotTree, expandedKeys, out)
    return out
  }, [sortedPivotTree, expandedKeys])

  const toggleExpand = (id: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      const willExpand = !next.has(id)
      if (willExpand) next.add(id); else next.delete(id)
      userToggledKeys.current.set(id, willExpand)
      return next
    })
  }

  const expandAll = () => {
    const allParentKeys = new Set<string>()
    const collect = (nodes: PivotNode[]) => {
      for (const n of nodes) {
        if (n.children.length > 0) {
          allParentKeys.add(n.id)
          collect(n.children)
        }
      }
    }
    collect(pivotData)
    userToggledKeys.current.clear()
    for (const k of allParentKeys) userToggledKeys.current.set(k, true)
    setExpandedKeys(allParentKeys)
  }

  const collapseAll = () => {
    // Mark all current parent keys as explicitly collapsed
    const collect = (nodes: PivotNode[]) => {
      for (const n of nodes) {
        if (n.children.length > 0) {
          userToggledKeys.current.set(n.id, false)
          collect(n.children)
        }
      }
    }
    collect(pivotData)
    setExpandedKeys(new Set())
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = pivotDims.indexOf(active.id as DimKey)
      const newIndex = pivotDims.indexOf(over.id as DimKey)
      setPivotDims(arrayMove(pivotDims, oldIndex, newIndex))
    }
  }

  const handleSortCol = (col: 'unidades' | 'venta_neta') => {
    if (sortCol === col) setSortDir((d) => d === 'desc' ? 'asc' : 'desc')
    else { setSortCol(col); setSortDir('desc') }
  }

  // Column header count
  const colCount = [
    pivotCols.unidades,
    pivotCols.venta_neta && dataAvailability.has_venta_neta,
    pivotCols.meta && dataAvailability.has_metas,
    pivotCols.meta && dataAvailability.has_metas, // cumplimiento
    pivotCols.variacion,
    pivotCols.pct_total,
  ].filter(Boolean).length

  // Guard after all hooks — never move this above any hook call
  if (sales.length === 0) return null

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20 animate-in fade-in duration-700" style={{ color: 'var(--sf-t1)' }}>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--sf-t1)' }}>Rendimiento Anual</h1>
          <p className="mt-1" style={{ color: 'var(--sf-t5)' }}>
            {[
              selectedVendor !== 'todos' ? selectedVendor : 'Todos los vendedores',
              selectedCliente !== 'all' ? selectedCliente : null,
              selectedCanal !== 'all' ? selectedCanal : null,
              selectedProducto !== 'all' ? selectedProducto : null,
            ].filter(Boolean).join(' · ')} — {selectedYear} vs {selectedYear - 1}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4" style={{ color: 'var(--sf-t5)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--sf-t5)' }}>{selectedYear} vs {selectedYear - 1}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-wrap gap-2">
            {/* Año */}
            <SFSelect value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}>
              {años.map((a) => <option key={a} value={a}>{a}</option>)}
            </SFSelect>
            {/* Vendedor */}
            <SFSelect value={selectedVendor} onChange={(e) => setSelectedVendor(e.target.value)}>
              {vendors.map((v) => <option key={v} value={v}>{v === 'todos' ? 'Todos los vendedores' : v}</option>)}
            </SFSelect>
          </div>
          <div className="flex items-center gap-2">
            {dataAvailability.has_metas && (
              <button onClick={() => setShowBudget(!showBudget)} className="px-3 py-2 rounded-lg text-xs font-bold transition-all" style={showBudget ? { background: '#FFB80018', border: '1px solid #FFB80040', color: 'var(--sf-amber)' } : { background: 'var(--sf-inset)', border: '1px solid var(--sf-border)', color: 'var(--sf-t5)' }}>Meta</button>
            )}
          </div>
        </div>

        {/* Secondary filters — collapsible */}
        {(dataAvailability.has_cliente || dataAvailability.has_canal || dataAvailability.has_producto) && (() => {
          const activeCount = [
            selectedCliente !== 'all' ? 1 : 0,
            selectedCanal !== 'all' ? 1 : 0,
            selectedProducto !== 'all' ? 1 : 0,
          ].reduce((a, b) => a + b, 0)
          return (
            <div>
              <button
                onClick={() => setShowExtraFilters(p => !p)}
                className="text-xs font-medium transition-colors cursor-pointer flex items-center gap-1"
                style={{ color: 'var(--sf-t4)', background: 'none', border: 'none', padding: 0 }}
              >
                <span>{showExtraFilters ? '\u25BE' : '\u25B8'}</span>
                {showExtraFilters ? 'Menos filtros' : 'Más filtros'}
                {!showExtraFilters && activeCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'var(--sf-green-bg)', color: 'var(--sf-green)', border: '1px solid var(--sf-green-border)' }}>
                    {activeCount} {activeCount === 1 ? 'activo' : 'activos'}
                  </span>
                )}
              </button>
              {showExtraFilters && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {dataAvailability.has_cliente && (
                    <SFSelect value={selectedCliente} onChange={(e) => setSelectedCliente(e.target.value)}>
                      <option value="all">Todos los clientes</option>
                      {clientes.map((c) => <option key={c} value={c}>{c}</option>)}
                    </SFSelect>
                  )}
                  {dataAvailability.has_canal && (
                    <SFSelect value={selectedCanal} onChange={(e) => setSelectedCanal(e.target.value)}>
                      <option value="all">Todos los canales</option>
                      {canales.map((c) => <option key={c} value={c}>{c}</option>)}
                    </SFSelect>
                  )}
                  {dataAvailability.has_producto && (
                    <SFSelect value={selectedProducto} onChange={(e) => setSelectedProducto(e.target.value)}>
                      <option value="all">Todos los productos</option>
                      {productos.map((p) => <option key={p} value={p}>{p}</option>)}
                    </SFSelect>
                  )}
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {/* YTD Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {forecastChartLoading ? (
          <div className="col-span-4 flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--sf-green)' }} />
            <span className="ml-2 text-sm" style={{ color: 'var(--sf-t5)' }}>Cargando proyección...</span>
          </div>
        ) : (
          <>
            <div style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)', borderTop: '3px solid var(--sf-border)', borderRadius: '12px', padding: '20px' }}>
              <p style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sf-t5)', marginBottom: '4px' }}>YTD {selectedYear}</p>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '28px', fontWeight: 500, color: 'var(--sf-t1)' }}>{useVentaNeta ? formatCurrency(ytdStats.ytdCurr, configuracion.moneda) : formatUnits(ytdStats.ytdCurr)}</p>
              <p style={{ fontSize: '12px', color: 'var(--sf-t5)', marginTop: '4px' }}>Acumulado {MESES[0]}–{MESES[currentMonth]}</p>
            </div>
            <div style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)', borderTop: `3px solid ${ytdStats.variacion == null ? 'var(--sf-border)' : ytdStats.variacion >= 0 ? 'var(--sf-green)' : 'var(--sf-red)'}`, borderRadius: '12px', padding: '20px' }}>
              <p style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sf-t5)', marginBottom: '4px' }}>vs {selectedYear - 1}</p>
              {ytdStats.variacion !== null ? (
                <div className="flex items-center gap-2">
                  {ytdStats.variacion >= 0 ? <TrendingUp className="w-5 h-5" style={{ color: 'var(--sf-green)' }} /> : <TrendingDown className="w-5 h-5" style={{ color: 'var(--sf-red)' }} />}
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '28px', fontWeight: 500, color: ytdStats.variacion >= 0 ? 'var(--sf-green)' : 'var(--sf-red)' }}>{ytdStats.variacion >= 0 ? '+' : ''}{ytdStats.variacion.toFixed(1)}%</p>
                </div>
              ) : (
                <div className="flex items-center gap-2"><Minus className="w-5 h-5" style={{ color: 'var(--sf-t5)' }} /><p style={{ fontFamily: "'DM Mono', monospace", fontSize: '28px', fontWeight: 500, color: 'var(--sf-t5)' }}>—</p></div>
              )}
              <p style={{ fontSize: '12px', color: 'var(--sf-t5)', marginTop: '4px' }}>{useVentaNeta ? formatCurrency(ytdStats.ytdPrev, configuracion.moneda) : formatUnits(ytdStats.ytdPrev)} mismo período {selectedYear - 1}</p>
            </div>
            <div style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)', borderTop: '3px solid var(--sf-border)', borderRadius: '12px', padding: '20px' }}>
              <p style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sf-t5)', marginBottom: '4px' }}>Mejor Mes</p>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '28px', fontWeight: 500, color: 'var(--sf-t1)' }}>{ytdStats.bestMonth >= 0 ? MESES[ytdStats.bestMonth] : '—'}</p>
              <p style={{ fontSize: '12px', color: 'var(--sf-t5)', marginTop: '4px' }}>{ytdStats.bestVal > 0 ? (useVentaNeta ? formatCurrency(ytdStats.bestVal, configuracion.moneda) : formatUnits(ytdStats.bestVal)) : '—'}</p>
            </div>
            {isCurrentYear && (
              <div style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)', borderTop: '3px solid #00D68F', borderRadius: '12px', padding: '20px' }}>
                <p style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sf-t5)', marginBottom: '4px' }}>Proyección Año</p>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '28px', fontWeight: 500, color: 'var(--sf-green)' }}>{useVentaNeta ? formatCurrency(ytdStats.projected, configuracion.moneda) : formatUnits(ytdStats.projected)}</p>
                <p style={{ fontSize: '12px', color: 'var(--sf-t5)', marginTop: '4px' }}>Cierre estimado {selectedYear}</p>
                {forecastData?.model_used ? (
                  <span className="mt-1 inline-block text-[10px] font-mono px-2 py-0.5 rounded" style={{ color: 'var(--sf-green)', background: 'rgba(0,214,143,0.08)' }}>
                    {forecastData.model_used}
                  </span>
                ) : isCurrentYear && sales.length >= 90 ? null : (
                  <span className="mt-1 inline-block text-[10px] italic" style={{ color: 'var(--sf-t5)' }} title="Sube más historial para activar modelo ML">
                    Extrapolación lineal
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Contextual summary */}
      {ytdStats.variacion !== null && (
        <p style={{ fontSize: '13px', color: 'var(--sf-t4)', padding: '0 2px' }}>
          {ytdStats.variacion >= 0 ? '📈' : '📉'} Vas <strong style={{ color: ytdStats.variacion >= 0 ? 'var(--sf-green)' : 'var(--sf-red)' }}>{ytdStats.variacion >= 0 ? '+' : ''}{ytdStats.variacion.toFixed(1)}%</strong> {ytdStats.variacion >= 0 ? 'arriba' : 'abajo'} del año pasado.
          {ytdStats.bestMonth >= 0 && <> Tu mejor mes fue <strong style={{ color: 'var(--sf-t1)' }}>{MESES[ytdStats.bestMonth]}</strong> con {useVentaNeta ? formatCurrency(ytdStats.bestVal, configuracion.moneda) : formatUnits(ytdStats.bestVal)}.</>}
        </p>
      )}

      {/* Analyze with AI */}
      <button
        onClick={() => navigate(dp('/chat'), {
          state: {
            prefill: `Analiza el rendimiento anual. YTD ${useVentaNeta ? formatCurrency(ytdStats.ytdCurr, configuracion.moneda) : formatUnits(ytdStats.ytdCurr)} vs ${useVentaNeta ? formatCurrency(ytdStats.ytdPrev, configuracion.moneda) : formatUnits(ytdStats.ytdPrev)} del año pasado (${ytdStats.variacion !== null ? (ytdStats.variacion >= 0 ? '+' : '') + ytdStats.variacion.toFixed(1) + '%' : 'sin comparación'}). Mejor mes: ${ytdStats.bestMonth >= 0 ? MESES[ytdStats.bestMonth] : '—'}. Proyección cierre: ${useVentaNeta ? formatCurrency(ytdStats.projected, configuracion.moneda) : formatUnits(ytdStats.projected)}. ¿Cuáles son las tendencias y qué recomiendas?`,
            displayPrefill: '✦ Analizar rendimiento con IA',
            source: 'Rendimiento',
          },
        })}
        style={{
          width: '100%',
          padding: '10px 20px',
          border: '1px solid #10B981',
          borderRadius: '10px',
          background: 'transparent',
          color: '#10B981',
          fontSize: '14px',
          fontWeight: 500,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.05)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        ✦ Analizar rendimiento con IA →
      </button>

      {/* Main chart */}
      <div className="relative" style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)', borderRadius: '12px', padding: '20px' }}>
        <p style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sf-t5)', marginBottom: chartFilter ? '12px' : '24px' }}>Evolución mensual — {useVentaNeta ? 'Facturación' : 'Unidades vendidas'}</p>
        {chartFilter && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', fontSize: '12px', color: '#1D9E75' }}>
            <span>Filtrando por: <strong>{chartFilter.value}</strong></span>
            <button onClick={() => setChartFilter(null)} style={{ opacity: 0.5, fontSize: '11px', background: 'none', border: 'none', cursor: 'pointer', color: '#1D9E75' }}>✕ Limpiar</button>
          </div>
        )}
        <ResponsiveContainer width="100%" height={360}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--sf-border)" vertical={false} />
            <XAxis dataKey="mes" tick={{ fill: 'var(--sf-t5)', fontSize: 11, fontFamily: 'inherit' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'var(--sf-t5)', fontSize: 11, fontFamily: "'DM Mono', monospace" }} axisLine={false} tickLine={false} width={60} tickFormatter={(v) => useVentaNeta ? formatCurrency(v, '') : formatUnits(v)} />
            <Tooltip content={(props) => <RendimientoTooltip {...props} useVentaNeta={useVentaNeta} moneda={configuracion.moneda} />} />
            {isCurrentYear && <ReferenceLine x={MESES[currentMonth]} stroke="var(--sf-border)" strokeDasharray="4 4" label={{ value: 'Hoy', fill: 'var(--sf-t5)', fontSize: 10, position: 'top' }} />}
            {showForecast && <Area type="monotone" dataKey="forecast" stroke="none" fill="#00D68F" fillOpacity={0.06} connectNulls={false} legendType="none" />}
            <Line type="monotone" dataKey="anterior" name={hasPrevYearData ? String(selectedYear - 1) : `${selectedYear - 1} — sin datos`} stroke={hasPrevYearData ? 'var(--sf-t5)' : 'var(--sf-border)'} strokeWidth={hasPrevYearData ? 1.5 : 1} strokeDasharray="4 4" opacity={hasPrevYearData ? 1 : 0.3} dot={false} connectNulls />
            <Line type="monotone" dataKey="actual" name={String(selectedYear)} stroke="#00D68F" strokeWidth={2} dot={(props: any) => { const { cx, cy, payload } = props; if (!payload.isCurrent) return <g key={`dot-${cx}`} />; return <circle key={`dot-${cx}`} cx={cx} cy={cy} r={5} fill="#00D68F" stroke="var(--sf-page)" strokeWidth={2} /> }} connectNulls />
            {showForecast && <Line type="monotone" dataKey="forecast" name="Proyección" stroke="#00D68F" strokeWidth={2} strokeDasharray="8 6" strokeOpacity={0.6} dot={{ r: 3, fill: '#00D68F', fillOpacity: 0.4, stroke: 'none' }} connectNulls={false} />}
            {showBudget && dataAvailability.has_metas && <Line type="monotone" dataKey="budget" name="Meta" stroke="#FFB800" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls />}
          </ComposedChart>
        </ResponsiveContainer>

        {/* Custom legend */}
        <div className="flex items-center justify-center gap-6 mt-4 text-xs" style={{ color: 'var(--sf-t5)' }}>
          <span className="flex items-center gap-2">
            <span className="w-5" style={{ borderTop: '2px dashed var(--sf-t5)' }} />
            {selectedYear - 1}
          </span>
          <span className="flex items-center gap-2">
            <span className="w-5 h-0.5 rounded" style={{ background: '#00D68F' }} />
            {selectedYear}
          </span>
          {showForecast && (
            <span className="flex items-center gap-2">
              <span className="w-5 h-0.5 rounded opacity-50" style={{ borderTop: '2px dashed #00D68F' }} />
              Proyección
            </span>
          )}
          {showBudget && dataAvailability.has_metas && (
            <span className="flex items-center gap-2">
              <span className="w-5" style={{ borderTop: '2px dashed #FFB800' }} />
              Meta
            </span>
          )}
        </div>

        {/* Model badge */}
        {forecastData?.model_used && showForecast && (
          <div className="flex items-center gap-2 mt-3">
            <span className="px-2.5 py-1 rounded-md text-[10px] font-mono font-medium uppercase tracking-wider" style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)', color: 'var(--sf-t3)' }}>
              {forecastData.model_used}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--sf-t4)' }}>
              {forecastData.model_used === 'ENSEMBLE' && 'Blend adaptativo ETS + SARIMA'}
              {forecastData.model_used === 'SARIMA' && 'Modelo estacional auto-optimizado'}
              {forecastData.model_used === 'ETS' && 'Suavizamiento exponencial'}
              {forecastData.model_used === 'NAIVE' && 'Promedio móvil (historial insuficiente)'}
              {forecastData.model_used === 'SIMPLE' && 'Media móvil simple'}
            </span>
          </div>
        )}

        {/* Loading overlay */}
        {forecastChartLoading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl z-10" style={{ background: 'color-mix(in srgb, var(--sf-card) 80%, transparent)' }}>
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--sf-t3)' }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              Calculando proyección...
            </div>
          </div>
        )}
      </div>

      {/* ── PIVOT TABLE ─────────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)', borderRadius: '12px', overflow: 'hidden' }}>

        {/* Pivot header bar */}
        <div className="px-6 py-4 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--sf-border)' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--sf-t2)' }}>Analiza tus ventas</p>
          {/* [Ticket 3.E.1] Toggle Venta YTD / Venta mensual histórica */}
          <div className="flex items-center" style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)', borderRadius: 8, padding: 2, gap: 2 }}>
            {([
              ['ytd', 'Venta YTD'],
              ['monthly', 'Venta mensual histórica'],
            ] as const).map(([key, label]) => {
              const active = tableView === key
              return (
                <button
                  key={key}
                  onClick={() => setTableView(key)}
                  className="px-3 py-1 rounded text-xs font-medium transition-colors cursor-pointer"
                  style={{
                    background: active ? 'var(--sf-card)' : 'transparent',
                    color: active ? 'var(--sf-t1)' : 'var(--sf-t5)',
                    border: active ? '1px solid var(--sf-border)' : '1px solid transparent',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <button
            onClick={() => setShowAdvanced(v => !v)}
            className="flex items-center gap-1.5 text-xs transition-colors rounded-lg px-2.5 py-1.5"
            style={{
              color: showAdvanced ? 'var(--sf-green)' : 'var(--sf-t5)',
              background: showAdvanced ? 'rgba(0,214,143,0.08)' : 'transparent',
            }}
            title="Personalizar dimensiones"
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Personalizar</span>
          </button>
        </div>

        {/* Dimension toggles — always visible */}
        <div className="px-6 py-3 flex items-center flex-wrap gap-2" style={{ borderBottom: '1px solid var(--sf-border)' }}>
          {DIM_TOGGLES
            .filter(t => !t.requiresDim || dataAvailability[t.requiresDim] === true)
            .map(toggle => {
              const isActive = pivotDims.includes(toggle.key)
              return (
                <button
                  key={toggle.key}
                  onClick={() => {
                    if (isActive) {
                      if (pivotDims.length > 1) setPivotDims(prev => prev.filter(d => d !== toggle.key))
                    } else {
                      setPivotDims(prev => [...prev, toggle.key])
                    }
                  }}
                  className="flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 transition-all"
                  style={{
                    border: `1px solid ${isActive ? 'var(--sf-green)' : 'var(--sf-border)'}`,
                    background: isActive ? 'rgba(0,214,143,0.08)' : 'transparent',
                    color: isActive ? 'var(--sf-green)' : 'var(--sf-t4)',
                    fontWeight: isActive ? 500 : 400,
                    cursor: 'pointer',
                  }}
                >
                  <span>{toggle.icon}</span>
                  <span>{toggle.label}</span>
                </button>
              )
            })
          }
        </div>

        {/* Advanced reorder panel — toggled by ⚙, smooth transition */}
        <div
          style={{
            display: 'grid',
            gridTemplateRows: showAdvanced ? '1fr' : '0fr',
            transition: 'grid-template-rows 300ms ease-in-out, opacity 200ms ease-in-out',
            opacity: showAdvanced ? 1 : 0,
            borderBottom: showAdvanced ? '1px solid var(--sf-border)' : 'none',
          }}
        >
          <div style={{ overflow: 'hidden' }}>
            <div className="px-6 py-4 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--sf-t5)' }}>Orden de agrupación</p>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => { handleDragEnd(e); dismissMicrocopy() }} modifiers={[restrictToHorizontalAxis, restrictToParentElement]}>
                <SortableContext items={pivotDims} strategy={horizontalListSortingStrategy}>
                  <div className="flex items-center flex-wrap" style={{ gap: '8px' }}>
                    {pivotDims.map((dim, idx) => (
                      <SortablePill key={dim} dim={dim} index={idx} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              {showMicrocopy && showAdvanced && (
                <p className="text-xs italic ml-1" style={{ color: 'var(--sf-t5)' }}>
                  Arrastra las etiquetas para cambiar el orden de agrupación
                </p>
              )}
            </div>
          </div>
        </div>


        {/* Table */}
        {tableView === 'ytd' && (() => {
          const pivotGrid = 'minmax(180px, 1fr) 100px 100px 90px 100px 70px'
          const mono = { fontFamily: "'DM Mono', monospace" } as const
          const hdrStyle: CSSProperties = { fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--sf-t2)', padding: '12px 16px' }
          const gtActual  = useVentaNeta ? grandTotal.v  : grandTotal.u
          const gtPrev    = useVentaNeta ? grandTotal.pv : grandTotal.pu
          const gtVar     = gtActual - gtPrev
          const gtVarPct  = gtPrev > 0 ? ((gtActual - gtPrev) / gtPrev) * 100 : null
          const fmtVal    = (n: number) => useVentaNeta ? formatCurrency(n, configuracion.moneda) : formatUnits(n)

          return (
            <div className="overflow-x-auto">
              {/* Header */}
              <div
                className="sticky top-0 z-10"
                style={{ display: 'grid', gridTemplateColumns: pivotGrid, background: 'var(--sf-elevated)', borderBottom: '2px solid var(--sf-border)' }}
              >
                <div style={{ ...hdrStyle, borderLeft: '3px solid #1D9E75', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Dimensión
                  <span className="flex items-center gap-0.5 ml-auto">
                    <button
                      onClick={expandAll}
                      className="p-1 rounded transition-colors cursor-pointer"
                      style={{ color: 'var(--sf-t5)' }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--sf-green)'; e.currentTarget.style.background = 'var(--sf-hover)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--sf-t5)'; e.currentTarget.style.background = 'transparent' }}
                      title="Expandir todo"
                    >
                      <ChevronsDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={collapseAll}
                      className="p-1 rounded transition-colors cursor-pointer"
                      style={{ color: 'var(--sf-t5)' }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--sf-green)'; e.currentTarget.style.background = 'var(--sf-hover)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--sf-t5)'; e.currentTarget.style.background = 'transparent' }}
                      title="Colapsar todo"
                    >
                      <ChevronsUp className="w-3.5 h-3.5" />
                    </button>
                  </span>
                </div>
                <div style={{ ...hdrStyle, textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSortCol('unidades')}>
                  {selectedYear}{' '}<span style={{ opacity: sortCol === 'unidades' ? 1 : 0.4, color: sortCol === 'unidades' ? 'var(--sf-green)' : undefined }}>{sortCol === 'unidades' ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}</span>
                </div>
                <div style={{ ...hdrStyle, textAlign: 'right' }}>{selectedYear - 1} YTD</div>
                <div style={{ ...hdrStyle, textAlign: 'right' }}>Var</div>
                <div style={{ ...hdrStyle, textAlign: 'right' }}>Var %</div>
                <div style={{ ...hdrStyle, textAlign: 'right' }}>Peso</div>
              </div>

              {/* Totals row */}
              <div style={{ display: 'grid', gridTemplateColumns: pivotGrid, background: 'var(--sf-inset)', borderBottom: '2px solid var(--sf-border)', alignItems: 'center' }}>
                <div style={{ padding: '14px 16px', fontSize: '15px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.04em', color: 'var(--sf-t1)' }}>TOTAL</div>
                <div style={{ ...mono, textAlign: 'right', padding: '14px 16px', fontSize: '15px', fontWeight: 700, color: 'var(--sf-t1)' }}>{fmtVal(gtActual)}</div>
                <div style={{ ...mono, textAlign: 'right', padding: '14px 16px', fontSize: '13px', fontWeight: 500, color: 'var(--sf-t3)' }}>{fmtVal(gtPrev)}</div>
                <div style={{ ...mono, textAlign: 'right', padding: '14px 16px', fontSize: '13px', fontWeight: 700, color: gtVar >= 0 ? 'var(--sf-green)' : 'var(--sf-red)' }}>
                  {gtVar >= 0 ? '+' : ''}{fmtVal(gtVar)}
                </div>
                <div style={{ ...mono, textAlign: 'right', padding: '14px 16px', fontSize: '13px', fontWeight: 700, color: gtVarPct == null ? 'var(--sf-t5)' : gtVarPct >= 0 ? 'var(--sf-green)' : 'var(--sf-red)' }}>
                  {gtVarPct != null ? `${gtVarPct >= 0 ? '+' : ''}${gtVarPct.toFixed(1)}%` : '—'}
                </div>
                <div style={{ ...mono, textAlign: 'right', padding: '14px 16px', fontSize: '12px', color: 'var(--sf-t3)' }}>100%</div>
              </div>

              {/* Data rows */}
              {pivotLoading ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--sf-t5)', fontSize: '12px' }}>
                  Calculando...
                </div>
              ) : flatRows.length === 0 ? (
                <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: '12px', color: 'var(--sf-t5)' }}>Sin datos para los filtros seleccionados.</div>
              ) : flatRows.map((row) => {
                const actual     = useVentaNeta ? row.ventaNeta   : row.unidades
                const prev       = useVentaNeta ? row.prevVentaNeta : row.prevUnidades
                const varAbs     = actual - prev
                const varPct     = prev > 0 ? ((actual - prev) / prev) * 100 : null
                const totalVal   = useVentaNeta ? grandTotal.v : grandTotal.u
                const pctTotal   = totalVal > 0 ? (actual / totalVal) * 100 : 0
                const isExpanded = expandedKeys.has(row.id)
                const isRoot     = row.depth === 0
                const isSelected = isRoot && chartFilter?.value === row.dimVal
                const canExpand  = row.hasChildren
                const isClickable = canExpand || isRoot

                // Per-level styling
                const levelStyle = row.depth === 0
                  ? { fontSize: '13px', fontWeight: 600 as const, color: 'var(--sf-t1)', py: '12px' }
                  : row.depth === 1
                  ? { fontSize: '13px', fontWeight: 500 as const, color: 'var(--sf-t1)', py: '10px' }
                  : { fontSize: '12px', fontWeight: 400 as const, color: 'var(--sf-t2)', py: '8px' }

                // Indentation: 16px base + 28px per depth for vertical line alignment
                const indent = 16 + row.depth * 28

                const rowBg = isSelected
                  ? 'rgba(29,158,117,0.08)'
                  : 'var(--sf-card)'

                return (
                  <div
                    key={row.id}
                    style={{
                      display: 'grid', gridTemplateColumns: pivotGrid, alignItems: 'center',
                      borderBottom: '1px solid var(--sf-border)',
                      background: rowBg, transition: 'background 150ms',
                      cursor: isClickable ? 'pointer' : 'default',
                    }}
                    onClick={isRoot
                      ? () => { if (canExpand) toggleExpand(row.id); setChartFilter(prev => prev?.value === row.dimVal ? null : { dim: pivotDims[0], value: row.dimVal }) }
                      : canExpand ? () => toggleExpand(row.id) : undefined}
                    onMouseEnter={(e) => { if (isClickable) e.currentTarget.style.background = isSelected ? 'rgba(29,158,117,0.12)' : 'var(--sf-hover)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = rowBg }}
                  >
                    {/* Label cell */}
                    <div className="flex items-center overflow-hidden" style={{
                      padding: `${levelStyle.py} 16px ${levelStyle.py} ${indent}px`,
                    }}>
                      {/* Chevron for expandable rows */}
                      {canExpand ? (
                        <span
                          style={{
                            width: isRoot ? '20px' : '18px',
                            height: isRoot ? '20px' : '18px',
                            borderRadius: '4px',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0, marginRight: '8px', cursor: 'pointer',
                            transition: 'background 150ms',
                          }}
                          className="hover:bg-[var(--sf-inset)]"
                          onClick={(e) => { e.stopPropagation(); toggleExpand(row.id) }}
                        >
                          <ChevronRight
                            style={{
                              width: isRoot ? '14px' : '12px',
                              height: isRoot ? '14px' : '12px',
                              color: isRoot ? 'var(--sf-t2)' : 'var(--sf-t3)',
                              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                              transition: 'transform 200ms ease',
                            }}
                          />
                        </span>
                      ) : (
                        <span style={{ display: 'inline-block', width: isRoot ? '20px' : '18px', marginRight: '8px', flexShrink: 0 }} />
                      )}
                      <span className="truncate" style={{ fontSize: levelStyle.fontSize, fontWeight: levelStyle.fontWeight, color: levelStyle.color, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        {row.label}
                        {row.depth > 0 && (() => { const d = DIM_META[row.dim]; return d ? <span className={cn('shrink-0 px-1 py-0.5 rounded text-[9px] font-bold border leading-none', d.color)}>{d.badge}</span> : null })()}
                        {row.dim === 'vendedor' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleAnalyzeRendVendedor(row.label, actual, prev, varPct, pctTotal) }}
                            disabled={rendAnalysisMap[row.label]?.loading}
                            className="shrink-0 cursor-pointer transition-all"
                            style={{
                              fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
                              border: '1px solid rgba(16,185,129,0.2)', background: 'rgba(16,185,129,0.06)',
                              color: '#10b981', opacity: rendAnalysisMap[row.label]?.loading ? 0.5 : 1,
                            }}
                          >
                            {rendAnalysisMap[row.label]?.loading ? '...' : '✦'}
                          </button>
                        )}
                      </span>
                    </div>
                    {/* Actual (current year — primary emphasis) */}
                    <div style={{ ...mono, textAlign: 'right', paddingRight: 16, fontSize: '13px', fontWeight: isRoot ? 600 : 500, color: 'var(--sf-t1)' }}>{fmtVal(actual)}</div>
                    {/* Prev YTD (reference — less emphasis) */}
                    <div style={{ ...mono, textAlign: 'right', paddingRight: 16, fontSize: '13px', color: 'var(--sf-t3)' }}>{prev > 0 ? fmtVal(prev) : '—'}</div>
                    {/* Var abs */}
                    <div style={{ ...mono, textAlign: 'right', paddingRight: 16, fontSize: '13px', fontWeight: 500, color: varAbs >= 0 ? 'var(--sf-green)' : 'var(--sf-red)' }}>
                      {prev > 0 ? `${varAbs >= 0 ? '+' : ''}${fmtVal(varAbs)}` : '—'}
                    </div>
                    {/* Var % */}
                    <div style={{ ...mono, textAlign: 'right', paddingRight: 16, fontSize: '13px', fontWeight: 600, color: varPct == null ? 'var(--sf-t5)' : varPct > 0 ? 'var(--sf-green)' : varPct >= -10 ? 'var(--sf-amber)' : 'var(--sf-red)' }}>
                      {varPct != null ? `${varPct >= 0 ? '+' : ''}${varPct.toFixed(1)}%` : '—'}
                    </div>
                    {/* Peso % */}
                    <div style={{ ...mono, textAlign: 'right', paddingRight: 16, fontSize: '12px', color: 'var(--sf-t3)' }}>{pctTotal.toFixed(1)}%</div>
                  </div>
                )
              })}
            </div>
          )
        })()}

        {/* [Ticket 3.E.1] Tabla "Venta mensual histórica" — alternativa al modo YTD */}
        {tableView === 'monthly' && (() => {
          const { columns, rows, colTotals, grandTotal: gtMonthly } = monthlyHistoricalData
          const fmtCell = (n: number) => n === 0 ? '—' : (useVentaNeta ? formatCurrency(n, configuracion.moneda) : formatUnits(n))
          const cellStyle: CSSProperties = { padding: '8px 12px', fontSize: 12, fontFamily: "'DM Mono', monospace", textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid var(--sf-border)' }
          const dimColWidth = 200
          const cellColWidth = 110
          const totalColWidth = 120
          if (rows.length === 0) {
            return (
              <div className="px-6 py-12 text-center text-sm" style={{ color: 'var(--sf-t5)' }}>
                Sin datos para los filtros activos.
              </div>
            )
          }
          return (
            <div className="overflow-x-auto" style={{ maxHeight: '70vh' }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: 'max-content', minWidth: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ position: 'sticky', top: 0, left: 0, zIndex: 3, background: 'var(--sf-elevated)', borderBottom: '2px solid var(--sf-border)', borderRight: '1px solid var(--sf-border)', padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sf-t2)', minWidth: dimColWidth }}>
                      Dimensión
                    </th>
                    {columns.map(col => (
                      <th key={`${col.year}-${col.month}`} style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--sf-elevated)', borderBottom: '2px solid var(--sf-border)', padding: '12px 12px', textAlign: 'right', fontSize: 11, fontWeight: 600, textTransform: 'none', color: 'var(--sf-t2)', whiteSpace: 'nowrap', minWidth: cellColWidth }}>
                        {col.label}
                      </th>
                    ))}
                    <th style={{ position: 'sticky', top: 0, right: 0, zIndex: 3, background: 'var(--sf-elevated)', borderBottom: '2px solid var(--sf-border)', borderLeft: '1px solid var(--sf-border)', padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sf-t1)', minWidth: totalColWidth }}>
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.label}>
                      <td style={{ position: 'sticky', left: 0, zIndex: 1, background: 'var(--sf-card)', borderRight: '1px solid var(--sf-border)', borderBottom: '1px solid var(--sf-border)', padding: '8px 16px', fontSize: 12, color: 'var(--sf-t1)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {row.label}
                      </td>
                      {row.values.map((v, i) => (
                        <td key={i} style={{ ...cellStyle, color: v === 0 ? 'var(--sf-t5)' : 'var(--sf-t2)' }}>
                          {fmtCell(v)}
                        </td>
                      ))}
                      <td style={{ position: 'sticky', right: 0, zIndex: 1, background: 'var(--sf-card)', borderLeft: '1px solid var(--sf-border)', borderBottom: '1px solid var(--sf-border)', padding: '8px 16px', fontSize: 12, fontFamily: "'DM Mono', monospace", textAlign: 'right', color: 'var(--sf-t1)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {fmtCell(row.total)}
                      </td>
                    </tr>
                  ))}
                  {/* Totals row */}
                  <tr>
                    <td style={{ position: 'sticky', left: 0, zIndex: 2, background: 'var(--sf-elevated)', borderRight: '1px solid var(--sf-border)', borderTop: '2px solid var(--sf-border)', padding: '10px 16px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sf-t1)' }}>
                      Total
                    </td>
                    {colTotals.map((t, i) => (
                      <td key={i} style={{ ...cellStyle, background: 'var(--sf-elevated)', borderTop: '2px solid var(--sf-border)', color: t === 0 ? 'var(--sf-t5)' : 'var(--sf-t1)', fontWeight: 600 }}>
                        {fmtCell(t)}
                      </td>
                    ))}
                    <td style={{ position: 'sticky', right: 0, zIndex: 2, background: 'var(--sf-elevated)', borderLeft: '1px solid var(--sf-border)', borderTop: '2px solid var(--sf-border)', padding: '10px 16px', fontSize: 12, fontFamily: "'DM Mono', monospace", textAlign: 'right', color: 'var(--sf-green)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {fmtCell(gtMonthly)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )
        })()}
      </div>

      {/* Drawer for rendimiento analysis */}
      {(() => {
        const va = expandedRendVendedor ? vendorAnalysis.find(v => v.vendedor === expandedRendVendedor) : null
        const analysis = expandedRendVendedor ? rendAnalysisMap[expandedRendVendedor] : null
        const isOpen = !!expandedRendVendedor && !!analysis?.text && !analysis?.loading

        return (
          <AnalysisDrawer
            isOpen={isOpen}
            onClose={() => setExpandedRendVendedor(null)}
            title={expandedRendVendedor ?? ''}
            subtitle={(() => {
              const p = va ? (va.variacion_ytd_usd_pct ?? va.variacion_ytd_uds_pct ?? null) : null
              return p != null ? `${p >= 0 ? '+' : ''}${p.toFixed(1)}% YTD` : undefined
            })()}
            badges={va ? (() => {
              const p = va.variacion_ytd_usd_pct ?? va.variacion_ytd_uds_pct ?? null
              return [{
                label: p != null && p > 5 ? 'CRECIMIENTO' : p != null && p < -10 ? 'RIESGO' : 'ESTABLE',
                color: p != null && p > 5 ? '#22c55e' : p != null && p < -10 ? '#ef4444' : '#eab308',
                bg: p != null && p > 5 ? 'rgba(34,197,94,0.12)' : p != null && p < -10 ? 'rgba(239,68,68,0.12)' : 'rgba(234,179,8,0.12)',
              }]
            })() : []}
            analysisText={analysis?.text ?? null}
            onDeepen={expandedRendVendedor && analysis?.text ? () => {
              navigate(dp('/chat'), { state: {
                prefill: `Profundizar sobre rendimiento de ${expandedRendVendedor}. ${analysis.text}`,
                displayPrefill: `Profundizar: rendimiento de ${expandedRendVendedor}`,
                source: 'Rendimiento',
              }})
            } : undefined}
          />
        )
      })()}
    </div>
  )
}
