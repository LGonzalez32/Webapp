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
  const currMonths = currSales.map(s => new Date(s.fecha).getMonth())
  const lastMonth = currMonths.length > 0 ? Math.max(...currMonths) : 11
  const ytdPrevSales = prevSales.filter(s => new Date(s.fecha).getMonth() <= lastMonth)

  const result: PivotNode[] = buildPivotTree(currSales, ytdPrevSales, metas, pivotDims, selectedYear, 'root', 0, null, null)
  self.postMessage(result)
}
