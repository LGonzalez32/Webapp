import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'
import { useAppStore } from '../store/appStore'
import { useAnalysis } from '../lib/useAnalysis'
import { salesInPeriod } from '../lib/analysis'
import { syncSalesData, getAnnualPerformance } from '../lib/forecastApi'
import { TrendingUp, TrendingDown, Minus, Calendar, ChevronRight, ChevronDown, ArrowUp, ArrowDown, Settings2, Loader2 } from 'lucide-react'
import { cn } from '../lib/utils'
import type { SaleRecord, MetaRecord, ForecastData } from '../types'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function formatUnits(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toLocaleString()
}
function formatCurrency(n: number, moneda: string): string {
  if (n >= 1_000_000) return `${moneda} ${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${moneda} ${(n / 1_000).toFixed(1)}k`
  return `${moneda} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

// ─── PIVOT TABLE HELPERS ──────────────────────────────────────────────────────

type DimKey = 'mes' | 'vendedor' | 'canal' | 'cliente' | 'producto'

interface PivotCols {
  unidades: boolean
  venta_neta: boolean
  meta: boolean
  variacion: boolean
  pct_total: boolean
}

interface PivotNode {
  id: string
  label: string
  depth: number
  dim: DimKey
  dimVal: string
  mesCtx: string | null
  vendedorCtx: string | null
  unidades: number
  ventaNeta: number
  prevUnidades: number
  prevVentaNeta: number
  meta: number | null
  children: PivotNode[]
}

function getSalesVal(s: SaleRecord, dim: DimKey): string {
  const d = new Date(s.fecha)
  switch (dim) {
    case 'mes':      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    case 'vendedor': return s.vendedor
    case 'canal':    return s.canal ?? 'Sin canal'
    case 'cliente':  return s.cliente ?? '(sin cliente)'
    case 'producto': return s.producto ?? '(sin producto)'
  }
}

function getPrevVal(s: SaleRecord, dim: DimKey, targetYear: number): string {
  if (dim !== 'mes') return getSalesVal(s, dim)
  const d = new Date(s.fecha)
  return `${targetYear}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function dimDisplayLabel(val: string, dim: DimKey): string {
  if (dim !== 'mes') return val
  const [y, m] = val.split('-')
  return `${MESES[parseInt(m, 10) - 1]} ${y}`
}

function getMeta(metas: MetaRecord[], mesCtx: string | null, vendedorCtx: string | null): number | null {
  if (!mesCtx) return null
  const filtered = metas.filter((m) => m.mes_periodo === mesCtx)
  if (vendedorCtx) {
    const found = filtered.find((m) => m.vendedor.toLowerCase().trim() === vendedorCtx.toLowerCase().trim())
    return found?.meta ?? null
  }
  const total = filtered.reduce((a, m) => a + m.meta, 0)
  return total || null
}

function buildPivotTree(
  currSales: SaleRecord[],
  prevSales: SaleRecord[],
  metas: MetaRecord[],
  dims: DimKey[],
  currentYear: number,
  parentId: string,
  depth: number,
  mesCtx: string | null,
  vendedorCtx: string | null,
): PivotNode[] {
  if (dims.length === 0 || currSales.length === 0) return []
  const [dim, ...restDims] = dims

  const currMap = new Map<string, SaleRecord[]>()
  const prevMap = new Map<string, SaleRecord[]>()

  currSales.forEach((s) => {
    const v = getSalesVal(s, dim)
    if (!currMap.has(v)) currMap.set(v, [])
    currMap.get(v)!.push(s)
  })
  prevSales.forEach((s) => {
    const v = getPrevVal(s, dim, currentYear)
    if (!prevMap.has(v)) prevMap.set(v, [])
    prevMap.get(v)!.push(s)
  })

  const allVals = new Set([...currMap.keys()])

  const sorted = [...allVals].sort(dim === 'mes'
    ? (a, b) => a.localeCompare(b)
    : (a, b) => {
        const ua = (currMap.get(a) ?? []).reduce((t, s) => t + s.unidades, 0)
        const ub = (currMap.get(b) ?? []).reduce((t, s) => t + s.unidades, 0)
        return ub - ua
      })

  return sorted.map((val) => {
    const cs = currMap.get(val) ?? []
    const ps = prevMap.get(val) ?? []
    const newMes    = dim === 'mes'      ? val : mesCtx
    const newVendor = dim === 'vendedor' ? val : vendedorCtx

    const unidades    = cs.reduce((a, s) => a + s.unidades, 0)
    const ventaNeta   = cs.reduce((a, s) => a + (s.venta_neta ?? 0), 0)
    const prevUnidades  = ps.reduce((a, s) => a + s.unidades, 0)
    const prevVentaNeta = ps.reduce((a, s) => a + (s.venta_neta ?? 0), 0)
    const meta = getMeta(metas, newMes, newVendor)
    const id = `${parentId}::${val}`

    const children = restDims.length > 0
      ? buildPivotTree(cs, ps, metas, restDims, currentYear, id, depth + 1, newMes, newVendor)
      : []

    return { id, label: dimDisplayLabel(val, dim), depth, dim, dimVal: val, mesCtx: newMes, vendedorCtx: newVendor, unidades, ventaNeta, prevUnidades, prevVentaNeta, meta, children }
  })
}

function flattenPivot(
  nodes: PivotNode[],
  expanded: Set<string>,
  out: (PivotNode & { hasChildren: boolean })[],
) {
  for (const n of nodes) {
    const hasChildren = n.children.length > 0
    out.push({ ...n, hasChildren })
    if (hasChildren && expanded.has(n.id)) {
      flattenPivot(n.children, expanded, out)
    }
  }
}

const FORECAST_BACKEND_ENABLED = false  // TODO: optimizar y reactivar

// ─── PÁGINA ───────────────────────────────────────────────────────────────────

export default function RendimientoPage() {
  useAnalysis()
  const navigate = useNavigate()
  const { sales, metas, dataAvailability, selectedPeriod, configuracion, forecastData, forecastChartLoading, setForecastData, setForecastChartLoading } = useAppStore()
  const [metric, setMetric] = useState<'unidades' | 'venta_neta'>('unidades')
  const [showForecast] = useState(false) // TODO: reactivar cuando el forecast esté optimizado
  const [showBudget, setShowBudget] = useState(true)
  const [selectedVendor, setSelectedVendor] = useState<string>('todos')
  const [selectedYear, setSelectedYear] = useState<number>(selectedPeriod.year)
  const [selectedCliente, setSelectedCliente] = useState<string>('all')
  const [selectedCanal, setSelectedCanal] = useState<string>('all')
  const [selectedProducto, setSelectedProducto] = useState<string>('all')

  const currentYear  = selectedPeriod.year  // usado en bloque forecast (deshabilitado)
  const currentMonth = selectedPeriod.month
  const today        = new Date()
  const isCurrentYear = today.getFullYear() === selectedYear

  // ── Sync sales data to backend and fetch forecast ───────────────────────────
  useEffect(() => {
    if (!FORECAST_BACKEND_ENABLED) return
    const loadForecast = async () => {
      if (sales.length === 0) return

      setForecastChartLoading(true)
      syncSalesData(sales).catch(() => {})

      try {
        const metricType = metric === 'venta_neta' ? 'revenue' : 'units'
        const dimValue = selectedVendor === 'todos' ? 'all' : selectedVendor

        const result = await getAnnualPerformance(currentYear, 'all', metricType, 'vendedor', dimValue)

        if (result.success && result.kpis && result.series) {
          const forecastPayload: ForecastData = {
            year: result.year,
            metric: result.metric as 'units' | 'revenue',
            seller: result.seller,
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
        console.error('Error loading forecast:', err)
      } finally {
        setForecastChartLoading(false)
      }
    }

    loadForecast()
  }, [sales, currentYear, selectedVendor, metric])

  // ── Pivot state ──────────────────────────────────────────────────────────
  const [pivotDims, setPivotDims] = useState<DimKey[]>(['mes'])
  const [pivotCols, setPivotCols] = useState<PivotCols>({
    unidades: true, venta_neta: true, meta: true, variacion: true, pct_total: false,
  })
  const [showSubtotals, setShowSubtotals] = useState(true)
  const [pivotConfigOpen, setPivotConfigOpen] = useState(false)
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (sales.length === 0) navigate('/cargar', { replace: true })
  }, [sales.length, navigate])

  if (sales.length === 0) return null

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

  // ── Chart data ────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const chartPrev = selectedYear - 1
    return MESES.map((label, monthIdx) => {
      const currSales = salesInPeriod(filteredSales, selectedYear, monthIdx)
      const currVal = useVentaNeta ? currSales.reduce((a, s) => a + (s.venta_neta ?? 0), 0) : currSales.reduce((a, s) => a + s.unidades, 0)

      const prevSales = salesInPeriod(filteredSales, chartPrev, monthIdx)
      const prevVal = useVentaNeta ? prevSales.reduce((a, s) => a + (s.venta_neta ?? 0), 0) : prevSales.reduce((a, s) => a + s.unidades, 0)

      let budget: number | null = null
      if (dataAvailability.has_metas && showBudget) {
        const key = `${selectedYear}-${String(monthIdx + 1).padStart(2, '0')}`
        const vm = selectedVendor === 'todos' ? metas.filter((m) => m.mes_periodo === key) : metas.filter((m) => m.mes_periodo === key && m.vendedor === selectedVendor)
        budget = vm.reduce((a, m) => a + m.meta, 0) || null
      }

      // Forecast line deshabilitado — showForecast siempre false
      const forecast: number | null = null

      return { mes: label, actual: currVal > 0 || monthIdx <= currentMonth ? currVal : null, anterior: prevVal > 0 ? prevVal : null, forecast, budget, isCurrent: monthIdx === currentMonth && isCurrentYear, isFuture: isCurrentYear && monthIdx > currentMonth }
    })
  }, [filteredSales, metas, selectedYear, currentMonth, useVentaNeta, showBudget, isCurrentYear, dataAvailability.has_metas, selectedVendor])

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
    
    // Fallback to local calculation
    const chartPrev = selectedYear - 1
    let ytdCurr = 0, ytdPrev = 0
    for (let m = 0; m <= currentMonth; m++) {
      const cs = salesInPeriod(filteredSales, selectedYear, m)
      const ps = salesInPeriod(filteredSales, chartPrev, m)
      ytdCurr += useVentaNeta ? cs.reduce((a, s) => a + (s.venta_neta ?? 0), 0) : cs.reduce((a, s) => a + s.unidades, 0)
      ytdPrev += useVentaNeta ? ps.reduce((a, s) => a + (s.venta_neta ?? 0), 0) : ps.reduce((a, s) => a + s.unidades, 0)
    }
    const variacion = ytdPrev > 0 ? ((ytdCurr - ytdPrev) / ytdPrev) * 100 : null
    let bestMonth = -1, bestVal = -1
    for (let m = 0; m <= currentMonth; m++) {
      const cs = salesInPeriod(filteredSales, selectedYear, m)
      const val = useVentaNeta ? cs.reduce((a, s) => a + (s.venta_neta ?? 0), 0) : cs.reduce((a, s) => a + s.unidades, 0)
      if (val > bestVal) { bestVal = val; bestMonth = m }
    }
    let projected = ytdCurr
    if (isCurrentYear) {
      const ytdPrevSum = Array.from({ length: currentMonth + 1 }, (_, i) => {
        const s = salesInPeriod(filteredSales, chartPrev, i)
        return useVentaNeta ? s.reduce((a, v) => a + (v.venta_neta ?? 0), 0) : s.reduce((a, v) => a + v.unidades, 0)
      }).reduce((a, b) => a + b, 0)
      const gf = ytdPrevSum > 0 ? ytdCurr / ytdPrevSum : 1
      for (let m = currentMonth + 1; m < 12; m++) {
        const ps = salesInPeriod(filteredSales, chartPrev, m)
        const pv = useVentaNeta ? ps.reduce((a, s) => a + (s.venta_neta ?? 0), 0) : ps.reduce((a, s) => a + s.unidades, 0)
        projected += Math.round(pv * gf)
      }
    }
    return { ytdCurr, ytdPrev, variacion, bestMonth, bestVal, projected }
  }, [filteredSales, selectedYear, currentMonth, useVentaNeta, isCurrentYear, forecastData])

  // ── Pivot computation ─────────────────────────────────────────────────────
  const pivotTree = useMemo(() => {
    const chartPrev = selectedYear - 1
    const currSales = filteredSales.filter((s) => new Date(s.fecha).getFullYear() === selectedYear)
    const prevSales = filteredSales.filter((s) => new Date(s.fecha).getFullYear() === chartPrev)
    return buildPivotTree(currSales, prevSales, metas, pivotDims, selectedYear, 'root', 0, null, null)
  }, [filteredSales, metas, pivotDims, selectedYear])

  const grandTotal = useMemo(() =>
    pivotTree.reduce((a, n) => ({ u: a.u + n.unidades, v: a.v + n.ventaNeta }), { u: 0, v: 0 }),
  [pivotTree])

  const flatRows = useMemo(() => {
    const out: (PivotNode & { hasChildren: boolean })[] = []
    flattenPivot(pivotTree, expandedKeys, out)
    return out
  }, [pivotTree, expandedKeys])

  const toggleExpand = (id: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // Available dimensions (based on data)
  const availableDims: { key: DimKey; label: string }[] = [
    { key: 'mes', label: 'Mes' },
    { key: 'vendedor', label: 'Vendedor' },
    ...(dataAvailability.has_canal    ? [{ key: 'canal'    as DimKey, label: 'Canal'    }] : []),
    ...(dataAvailability.has_cliente  ? [{ key: 'cliente'  as DimKey, label: 'Cliente'  }] : []),
    ...(dataAvailability.has_producto ? [{ key: 'producto' as DimKey, label: 'Producto' }] : []),
  ]

  const moveDim = (idx: number, dir: -1 | 1) => {
    const next = [...pivotDims]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setPivotDims(next)
  }

  const toggleDim = (key: DimKey) => {
    setPivotDims((prev) =>
      prev.includes(key) ? (prev.length > 1 ? prev.filter((d) => d !== key) : prev) : [...prev, key]
    )
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

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-3 shadow-2xl text-xs space-y-1.5 min-w-[160px]">
        <p className="font-bold text-zinc-200 mb-2">{label}</p>
        {payload.map((p: any) => (
          <div key={p.name} className="flex justify-between gap-4">
            <span style={{ color: p.color }}>{p.name}</span>
            <span className="font-bold text-zinc-200">{useVentaNeta ? formatCurrency(p.value, configuracion.moneda) : p.value?.toLocaleString()}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20 animate-in fade-in duration-700">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-zinc-50 tracking-tight">Rendimiento Anual</h1>
          <p className="text-zinc-500 mt-1">
            {[
              selectedVendor !== 'todos' ? selectedVendor : 'Todos los vendedores',
              selectedCliente !== 'all' ? selectedCliente : null,
              selectedCanal !== 'all' ? selectedCanal : null,
              selectedProducto !== 'all' ? selectedProducto : null,
            ].filter(Boolean).join(' · ')} — {selectedYear} vs {selectedYear - 1}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-zinc-600" />
          <span className="text-sm font-medium text-zinc-400">{selectedYear} vs {selectedYear - 1}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {/* Año */}
          <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-[#00B894]/50">
            {años.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          {/* Vendedor */}
          <select value={selectedVendor} onChange={(e) => setSelectedVendor(e.target.value)} className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-[#00B894]/50">
            {vendors.map((v) => <option key={v} value={v}>{v === 'todos' ? 'Todos los vendedores' : v}</option>)}
          </select>
          {/* Cliente */}
          {dataAvailability.has_cliente && (
            <select value={selectedCliente} onChange={(e) => setSelectedCliente(e.target.value)} className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-[#00B894]/50">
              <option value="all">Todos los clientes</option>
              {clientes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {/* Canal */}
          {dataAvailability.has_canal && (
            <select value={selectedCanal} onChange={(e) => setSelectedCanal(e.target.value)} className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-[#00B894]/50">
              <option value="all">Todos los canales</option>
              {canales.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {/* Producto */}
          {dataAvailability.has_producto && (
            <select value={selectedProducto} onChange={(e) => setSelectedProducto(e.target.value)} className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-[#00B894]/50">
              <option value="all">Todos los productos</option>
              {productos.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-zinc-900 border border-zinc-800 rounded-lg p-1">
            <button onClick={() => setMetric('unidades')} className={cn('px-3 py-1.5 rounded text-xs font-bold transition-all', metric === 'unidades' ? 'bg-[#00B894] text-black' : 'text-zinc-500 hover:text-zinc-300')}>Unidades</button>
            {dataAvailability.has_venta_neta && (
              <button onClick={() => setMetric('venta_neta')} className={cn('px-3 py-1.5 rounded text-xs font-bold transition-all', metric === 'venta_neta' ? 'bg-[#00B894] text-black' : 'text-zinc-500 hover:text-zinc-300')}>Facturación</button>
            )}
          </div>
          {/* Proyección oculta — TODO: reactivar cuando el forecast esté optimizado */}
          {dataAvailability.has_metas && (
            <button onClick={() => setShowBudget(!showBudget)} className={cn('px-3 py-2 rounded-lg text-xs font-bold border transition-all', showBudget ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-zinc-900 border-zinc-800 text-zinc-500')}>Meta</button>
          )}
        </div>
      </div>

      {/* YTD Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {forecastChartLoading ? (
          <div className="col-span-4 flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-[#00B894]" />
            <span className="ml-2 text-zinc-500 text-sm">Cargando proyección...</span>
          </div>
        ) : (
          <>
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1">YTD {selectedYear}</p>
              <p className="text-2xl font-black text-zinc-50">{useVentaNeta ? formatCurrency(ytdStats.ytdCurr, configuracion.moneda) : formatUnits(ytdStats.ytdCurr)}</p>
              <p className="text-[10px] text-zinc-600 mt-1">Acumulado {MESES[0]}–{MESES[currentMonth]}</p>
            </div>
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1">vs {selectedYear - 1}</p>
              {ytdStats.variacion !== null ? (
                <div className="flex items-center gap-2">
                  {ytdStats.variacion >= 0 ? <TrendingUp className="w-5 h-5 text-[#00B894]" /> : <TrendingDown className="w-5 h-5 text-red-400" />}
                  <p className={cn('text-2xl font-black', ytdStats.variacion >= 0 ? 'text-[#00B894]' : 'text-red-400')}>{ytdStats.variacion >= 0 ? '+' : ''}{ytdStats.variacion.toFixed(1)}%</p>
                </div>
              ) : (
                <div className="flex items-center gap-2"><Minus className="w-5 h-5 text-zinc-600" /><p className="text-2xl font-black text-zinc-600">—</p></div>
              )}
              <p className="text-[10px] text-zinc-600 mt-1">{useVentaNeta ? formatCurrency(ytdStats.ytdPrev, configuracion.moneda) : formatUnits(ytdStats.ytdPrev)} año ant.</p>
            </div>
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Mejor Mes</p>
              <p className="text-2xl font-black text-zinc-50">{ytdStats.bestMonth >= 0 ? MESES[ytdStats.bestMonth] : '—'}</p>
              <p className="text-[10px] text-zinc-600 mt-1">{ytdStats.bestVal > 0 ? (useVentaNeta ? formatCurrency(ytdStats.bestVal, configuracion.moneda) : formatUnits(ytdStats.bestVal)) : '—'}</p>
            </div>
            {isCurrentYear && (
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Proyección Año</p>
                <p className="text-2xl font-black text-[#00B894]">{useVentaNeta ? formatCurrency(ytdStats.projected, configuracion.moneda) : formatUnits(ytdStats.projected)}</p>
                <p className="text-[10px] text-zinc-600 mt-1">Cierre estimado {selectedYear}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Main chart */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-600 mb-6">Evolución mensual — {useVentaNeta ? 'Facturación' : 'Unidades vendidas'}</p>
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis dataKey="mes" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} width={60} tickFormatter={(v) => useVentaNeta ? formatCurrency(v, '') : formatUnits(v)} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '11px', color: '#71717a' }} />
            {isCurrentYear && <ReferenceLine x={MESES[currentMonth]} stroke="#3f3f46" strokeDasharray="4 4" label={{ value: 'Hoy', fill: '#52525b', fontSize: 10, position: 'top' }} />}
            <Line type="monotone" dataKey="anterior" name={hasPrevYearData ? String(selectedYear - 1) : `${selectedYear - 1} — sin datos`} stroke={hasPrevYearData ? '#52525b' : '#27272a'} strokeWidth={hasPrevYearData ? 2 : 1} strokeDasharray={hasPrevYearData ? undefined : '3 3'} opacity={hasPrevYearData ? 1 : 0.3} dot={false} connectNulls />
            <Line type="monotone" dataKey="actual" name={String(selectedYear)} stroke="#00B894" strokeWidth={3} dot={(props: any) => { const { cx, cy, payload } = props; if (!payload.isCurrent) return <g key={`dot-${cx}`} />; return <circle key={`dot-${cx}`} cx={cx} cy={cy} r={5} fill="#00B894" stroke="#000" strokeWidth={2} /> }} connectNulls />
            {showForecast && isCurrentYear && <Line type="monotone" dataKey="forecast" name="Proyección" stroke="#00B894" strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls />}
            {showBudget && dataAvailability.has_metas && <Line type="monotone" dataKey="budget" name="Meta" stroke="#3B82F6" strokeWidth={2} strokeDasharray="4 4" dot={false} connectNulls />}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── PIVOT TABLE ─────────────────────────────────────────────────────── */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden">

        {/* Pivot header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-600">Tabla Pivot</p>
          <button
            onClick={() => setPivotConfigOpen(!pivotConfigOpen)}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all', pivotConfigOpen ? 'bg-[#00B894]/10 border-[#00B894]/30 text-[#00B894]' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200')}
          >
            <Settings2 className="w-3.5 h-3.5" />
            Configurar
          </button>
        </div>

        {/* Config panel */}
        {pivotConfigOpen && (
          <div className="px-6 py-5 border-b border-zinc-800 space-y-5 bg-zinc-900/30">
            {/* Dims */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Agrupar por (orden)</p>
              <div className="flex flex-wrap gap-2">
                {availableDims.map(({ key, label }) => (
                  <div key={key} className={cn('flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer', pivotDims.includes(key) ? 'bg-[#00B894]/10 border-[#00B894]/30 text-[#00B894]' : 'bg-zinc-800 border-zinc-700 text-zinc-500')} onClick={() => toggleDim(key)}>
                    {label}
                    {pivotDims.includes(key) && (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); moveDim(pivotDims.indexOf(key), -1) }} className="hover:text-white ml-1"><ArrowUp className="w-3 h-3" /></button>
                        <button onClick={(e) => { e.stopPropagation(); moveDim(pivotDims.indexOf(key), 1) }} className="hover:text-white"><ArrowDown className="w-3 h-3" /></button>
                        <span className="ml-1 text-[10px] opacity-60">{pivotDims.indexOf(key) + 1}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-zinc-600">Orden actual: {pivotDims.join(' → ')}</p>
            </div>

            {/* Cols + subtotals */}
            <div className="flex flex-wrap gap-4 items-start">
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-2">Columnas de valor</p>
                {[
                  { key: 'unidades', label: 'Unidades', always: true },
                  { key: 'venta_neta', label: 'Venta Neta', show: dataAvailability.has_venta_neta },
                  { key: 'meta', label: 'Meta + Cum%', show: dataAvailability.has_metas },
                  { key: 'variacion', label: 'Variación %', always: true },
                  { key: 'pct_total', label: '% del total', always: true },
                ].filter((c) => c.always || c.show).map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                    <input type="checkbox" checked={pivotCols[key as keyof PivotCols]} onChange={(e) => setPivotCols({ ...pivotCols, [key]: e.target.checked })} className="accent-[#00B894]" />
                    {label}
                  </label>
                ))}
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-2">Opciones</p>
                <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                  <input type="checkbox" checked={showSubtotals} onChange={(e) => setShowSubtotals(e.target.checked)} className="accent-[#00B894]" />
                  Mostrar subtotales
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50">
                <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-600">Dimensión</th>
                {pivotCols.unidades && <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-600">Unidades</th>}
                {pivotCols.venta_neta && dataAvailability.has_venta_neta && <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-600">Venta Neta</th>}
                {pivotCols.meta && dataAvailability.has_metas && <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-600">Meta</th>}
                {pivotCols.meta && dataAvailability.has_metas && <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-600">Cum%</th>}
                {pivotCols.variacion && <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-600">Var% YoY</th>}
                {pivotCols.pct_total && <th className="text-right px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-600">% Total</th>}
              </tr>
            </thead>
            <tbody>
              {flatRows.map((row, idx) => {
                const varPct = row.prevUnidades > 0 ? ((row.unidades - row.prevUnidades) / row.prevUnidades) * 100 : null
                const cumPct = row.meta && row.meta > 0 ? (row.unidades / row.meta) * 100 : null
                const pctTotal = grandTotal.u > 0 ? (row.unidades / grandTotal.u) * 100 : 0
                const isExpanded = expandedKeys.has(row.id)
                const indent = row.depth * 20

                return (
                  <tr key={row.id} className={cn('border-b border-zinc-800/50 transition-colors', idx % 2 === 0 ? 'hover:bg-zinc-900/50' : 'bg-zinc-900/20 hover:bg-zinc-900/50')}>
                    <td className="px-4 py-2.5" style={{ paddingLeft: `${16 + indent}px` }}>
                      <div className="flex items-center gap-1.5">
                        {row.hasChildren ? (
                          <button onClick={() => toggleExpand(row.id)} className="w-4 h-4 flex items-center justify-center text-zinc-500 hover:text-zinc-200 shrink-0">
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          </button>
                        ) : (
                          <span className="w-4 shrink-0" />
                        )}
                        <span className={cn('truncate max-w-[200px]', row.depth === 0 ? 'font-bold text-zinc-100' : row.depth === 1 ? 'font-semibold text-zinc-200' : 'text-zinc-400')}>
                          {row.label}
                        </span>
                      </div>
                    </td>
                    {pivotCols.unidades && (
                      <td className="px-4 py-2.5 text-right font-mono text-zinc-300">{formatUnits(row.unidades)}</td>
                    )}
                    {pivotCols.venta_neta && dataAvailability.has_venta_neta && (
                      <td className="px-4 py-2.5 text-right font-mono text-zinc-400">{row.ventaNeta > 0 ? formatCurrency(row.ventaNeta, configuracion.moneda) : '—'}</td>
                    )}
                    {pivotCols.meta && dataAvailability.has_metas && (
                      <td className="px-4 py-2.5 text-right text-zinc-500">{row.meta ? formatUnits(row.meta) : '—'}</td>
                    )}
                    {pivotCols.meta && dataAvailability.has_metas && (
                      <td className={cn('px-4 py-2.5 text-right font-bold', cumPct == null ? 'text-zinc-600' : cumPct >= 100 ? 'text-[#00B894]' : cumPct >= 80 ? 'text-yellow-400' : 'text-red-400')}>
                        {cumPct != null ? `${cumPct.toFixed(0)}%` : '—'}
                      </td>
                    )}
                    {pivotCols.variacion && (
                      <td className={cn('px-4 py-2.5 text-right font-bold', varPct == null ? 'text-zinc-600' : varPct >= 0 ? 'text-[#00B894]' : 'text-red-400')}>
                        {varPct != null ? `${varPct >= 0 ? '+' : ''}${varPct.toFixed(1)}%` : '—'}
                      </td>
                    )}
                    {pivotCols.pct_total && (
                      <td className="px-5 py-2.5 text-right text-zinc-500">{pctTotal.toFixed(1)}%</td>
                    )}
                  </tr>
                )
              })}

              {/* Subtotals per top-level group when showSubtotals */}
              {/* Total General */}
              {flatRows.length > 0 && (
                <tr className="border-t-2 border-zinc-700 bg-zinc-900/60">
                  <td className="px-5 py-3 font-black text-zinc-100 text-xs uppercase tracking-wider">Total General</td>
                  {pivotCols.unidades && <td className="px-4 py-3 text-right font-black text-zinc-100 font-mono">{formatUnits(grandTotal.u)}</td>}
                  {pivotCols.venta_neta && dataAvailability.has_venta_neta && <td className="px-4 py-3 text-right font-black text-zinc-100 font-mono">{grandTotal.v > 0 ? formatCurrency(grandTotal.v, configuracion.moneda) : '—'}</td>}
                  {pivotCols.meta && dataAvailability.has_metas && <td className="px-4 py-3 text-right text-zinc-500">—</td>}
                  {pivotCols.meta && dataAvailability.has_metas && <td className="px-4 py-3 text-right text-zinc-500">—</td>}
                  {pivotCols.variacion && <td className="px-4 py-3 text-right text-zinc-500">—</td>}
                  {pivotCols.pct_total && <td className="px-5 py-3 text-right font-bold text-zinc-300">100%</td>}
                </tr>
              )}
              {flatRows.length === 0 && (
                <tr><td colSpan={1 + colCount} className="px-5 py-8 text-center text-zinc-600 text-xs">Sin datos para los filtros seleccionados.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {showSubtotals && pivotTree.length > 0 && (
          <p className="px-5 py-2 text-[10px] text-zinc-700 border-t border-zinc-800">
            Los totales de cada grupo visible actúan como subtotales. Expande los grupos para ver el detalle.
          </p>
        )}
      </div>
    </div>
  )
}
