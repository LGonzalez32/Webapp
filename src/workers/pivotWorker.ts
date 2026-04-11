import { buildPivotTree } from '../utils/pivotUtils'
import type { DimKey, PivotNode } from '../utils/pivotUtils'
import type { SaleRecord, MetaRecord } from '../types'

interface PivotWorkerInput {
  filteredSales: SaleRecord[]
  metas: MetaRecord[]
  pivotDims: DimKey[]
  selectedYear: number
}

self.onmessage = (e: MessageEvent<PivotWorkerInput>) => {
  const { filteredSales, metas, pivotDims, selectedYear } = e.data
  const chartPrev = selectedYear - 1
  const currSales = filteredSales.filter((s) => new Date(s.fecha).getFullYear() === selectedYear)
  const prevSales = filteredSales.filter((s) => new Date(s.fecha).getFullYear() === chartPrev)

  // Restrict prev-year to the same months present in curr-year (YTD comparison)
  // Same-day-range: en el último mes con datos, limitar al mismo día
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

  const result: PivotNode[] = buildPivotTree(currSales, ytdPrevSales, metas, pivotDims, selectedYear, 'root', 0, null, null)
  self.postMessage(result)
}
