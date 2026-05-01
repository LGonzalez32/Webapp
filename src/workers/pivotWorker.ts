import { buildPivotTree, buildMonthlyPivotTree } from '../utils/pivotUtils'
import type { DimKey, PivotNode, MonthlyPivotNode } from '../utils/pivotUtils'
import type { SaleRecord, MetaRecord } from '../types'

interface PivotWorkerInput {
  filteredSales: SaleRecord[]
  metas: MetaRecord[]
  pivotDims: DimKey[]
  selectedYear: number
  // [Ticket 3.E.2] Modo del worker. Default 'ytd' por backward-compat.
  mode?: 'ytd' | 'monthly'
  monthColumns?: string[]
  metric?: 'unidades' | 'venta_neta'
  dimsForRows?: DimKey[]
}

type PivotWorkerOutput =
  | { mode: 'ytd'; tree: PivotNode[] }
  | { mode: 'monthly'; tree: MonthlyPivotNode[] }

self.onmessage = (e: MessageEvent<PivotWorkerInput>) => {
  const { filteredSales, metas, pivotDims, selectedYear, mode = 'ytd' } = e.data

  if (mode === 'monthly') {
    const dimsForRows = e.data.dimsForRows ?? pivotDims.filter(d => d !== 'mes')
    const monthColumns = e.data.monthColumns ?? []
    const metric = e.data.metric ?? 'unidades'
    const tree = buildMonthlyPivotTree(filteredSales, dimsForRows, monthColumns, metric, 'root', 0)
    const out: PivotWorkerOutput = { mode: 'monthly', tree }
    self.postMessage(out)
    return
  }

  // mode === 'ytd' (legacy path, behaviour idéntico al pre-3.E.2)
  const chartPrev = selectedYear - 1
  const currSales = filteredSales.filter((s) => new Date(s.fecha).getFullYear() === selectedYear)
  const prevSales = filteredSales.filter((s) => new Date(s.fecha).getFullYear() === chartPrev)
  const currDates = currSales.map(s => new Date(s.fecha))
  const lastMonth = currDates.length > 0 ? Math.max(...currDates.map(d => d.getMonth())) : 11
  const maxDay = currDates.length > 0 ? Math.max(...currDates.filter(d => d.getMonth() === lastMonth).map(d => d.getDate())) : 31
  const lastDayOfMonth = new Date(selectedYear, lastMonth + 1, 0).getDate()
  const isPartialMonth = maxDay < lastDayOfMonth
  const ytdPrevSales = prevSales.filter(s => {
    const d = new Date(s.fecha)
    const m = d.getMonth()
    if (m < lastMonth) return true
    if (m === lastMonth) return !isPartialMonth || d.getDate() <= maxDay
    return false
  })
  const tree: PivotNode[] = buildPivotTree(currSales, ytdPrevSales, metas, pivotDims, selectedYear, 'root', 0, null, null)
  const out: PivotWorkerOutput = { mode: 'ytd', tree }
  self.postMessage(out)
}
