import type { SaleRecord, MetaRecord } from '../types'

export type DimKey =
  | 'mes'
  | 'vendedor'
  | 'canal'
  | 'cliente'
  | 'producto'
  | 'categoria'
  | 'subcategoria'
  | 'departamento'
  | 'supervisor'
  | 'proveedor'

export interface PivotNode {
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

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export function getSalesVal(s: SaleRecord, dim: DimKey): string {
  const d = new Date(s.fecha)
  switch (dim) {
    case 'mes':          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    case 'vendedor':     return s.vendedor
    case 'canal':        return s.canal ?? 'Sin canal'
    case 'cliente':      return s.cliente ?? '(sin cliente)'
    case 'producto':     return s.producto ?? '(sin producto)'
    case 'categoria':    return s.categoria ?? 'Sin categoría'
    case 'subcategoria': return s.subcategoria ?? 'Sin subcategoría'
    case 'departamento': return s.departamento ?? 'Sin departamento'
    case 'supervisor':   return s.supervisor ?? 'Sin supervisor'
    case 'proveedor':    return s.proveedor ?? 'Sin proveedor'
  }
}

export function getPrevVal(s: SaleRecord, dim: DimKey, targetYear: number): string {
  if (dim !== 'mes') return getSalesVal(s, dim)
  const d = new Date(s.fecha)
  return `${targetYear}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function dimDisplayLabel(val: string, dim: DimKey): string {
  if (dim !== 'mes') return val
  const [y, m] = val.split('-')
  return `${MESES[parseInt(m, 10) - 1]} ${y}`
}

export function getMeta(metas: MetaRecord[], mesCtx: string | null, vendedorCtx: string | null): number | null {
  if (!mesCtx) return null
  const match = mesCtx.match(/^(\d{4})-(\d{1,2})$/)
  if (!match) return null
  const ctxYear = parseInt(match[1]), ctxMes = parseInt(match[2])
  const filtered = metas.filter((m) => m.anio === ctxYear && m.mes === ctxMes)
  if (vendedorCtx) {
    const found = filtered.find((m) => (m.vendedor ?? '').toLowerCase().trim() === vendedorCtx.toLowerCase().trim())
    return found?.meta ?? null
  }
  const total = filtered.reduce((a, m) => a + m.meta, 0)
  return total || null
}

export function buildPivotTree(
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

    const unidades      = cs.reduce((a, s) => a + s.unidades, 0)
    const ventaNeta     = cs.reduce((a, s) => a + (s.venta_neta ?? 0), 0)
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

// Genérico sobre el shape del nodo. Reusable por buildPivotTree (YTD) y
// buildMonthlyPivotTree (monthly histórica).
export function flattenPivot<T extends { id: string; children: T[] }>(
  nodes: T[],
  expanded: Set<string>,
  out: (T & { hasChildren: boolean })[],
): void {
  for (const n of nodes) {
    const hasChildren = n.children.length > 0
    out.push({ ...n, hasChildren } as T & { hasChildren: boolean })
    if (hasChildren && expanded.has(n.id)) {
      flattenPivot(n.children, expanded, out)
    }
  }
}

// ─── MONTHLY HISTORICAL PIVOT (Ticket 3.E.2) ──────────────────────────────────

export interface MonthlyPivotNode {
  id: string
  label: string
  depth: number
  dim: DimKey | 'total'
  dimVal: string
  valuesByCol: number[]
  total: number
  children: MonthlyPivotNode[]
}

/**
 * Construye tree pivot para vista monthly histórica. Estructura paralela a
 * buildPivotTree pero con cells = matriz por (year, month) en lugar de YTD vs prev.
 *
 * IDs idénticos al patrón de buildPivotTree (`${parentId}::${val}`) para que
 * el Set<string> expandedKeys sea compartible entre ambas vistas cuando los
 * dim chains coinciden.
 */
export function buildMonthlyPivotTree(
  sales: SaleRecord[],
  dims: DimKey[],
  monthColumns: string[],
  metric: 'unidades' | 'venta_neta',
  parentId: string,
  depth: number,
): MonthlyPivotNode[] {
  const colIndex = new Map<string, number>()
  monthColumns.forEach((k, i) => colIndex.set(k, i))
  const colCount = monthColumns.length

  const valueOf = (s: SaleRecord): number =>
    metric === 'venta_neta' ? (s.venta_neta ?? 0) : s.unidades

  // Edge case: dims vacío → fila única "Total" agregando todo
  if (dims.length === 0) {
    if (sales.length === 0) return []
    const valuesByCol = new Array(colCount).fill(0)
    for (const s of sales) {
      const d = new Date(s.fecha)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const ci = colIndex.get(key)
      if (ci !== undefined) valuesByCol[ci] += valueOf(s)
    }
    const total = valuesByCol.reduce((a, v) => a + v, 0)
    return [{
      id: `${parentId}::__total__`,
      label: 'Total',
      depth,
      dim: 'total',
      dimVal: '__total__',
      valuesByCol,
      total,
      children: [],
    }]
  }

  if (sales.length === 0) return []
  const [dim, ...restDims] = dims

  const groupMap = new Map<string, SaleRecord[]>()
  for (const s of sales) {
    const v = getSalesVal(s, dim)
    let arr = groupMap.get(v)
    if (!arr) { arr = []; groupMap.set(v, arr) }
    arr.push(s)
  }

  const sorted = [...groupMap.keys()].sort((a, b) => {
    const ta = (groupMap.get(a) ?? []).reduce((acc, s) => acc + valueOf(s), 0)
    const tb = (groupMap.get(b) ?? []).reduce((acc, s) => acc + valueOf(s), 0)
    return tb - ta
  })

  return sorted.map((val) => {
    const cs = groupMap.get(val) ?? []
    const valuesByCol = new Array(colCount).fill(0)
    for (const s of cs) {
      const d = new Date(s.fecha)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const ci = colIndex.get(key)
      if (ci !== undefined) valuesByCol[ci] += valueOf(s)
    }
    const total = valuesByCol.reduce((a, v) => a + v, 0)
    const id = `${parentId}::${val}`
    const children = restDims.length > 0
      ? buildMonthlyPivotTree(cs, restDims, monthColumns, metric, id, depth + 1)
      : []
    return {
      id,
      label: dimDisplayLabel(val, dim),
      depth,
      dim,
      dimVal: val,
      valuesByCol,
      total,
      children,
    }
  })
}
