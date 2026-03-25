import type { SaleRecord, MetaRecord } from '../types'

export type DimKey = 'mes' | 'vendedor' | 'canal' | 'cliente' | 'producto'

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
    case 'mes':      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    case 'vendedor': return s.vendedor
    case 'canal':    return s.canal ?? 'Sin canal'
    case 'cliente':  return s.cliente ?? '(sin cliente)'
    case 'producto': return s.producto ?? '(sin producto)'
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

export function flattenPivot(
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
