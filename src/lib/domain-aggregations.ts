/**
 * domain-aggregations.ts — v2.0.1 (Fase Z.1.b)
 * R102: Fuente única de cálculos derivados de ventas.
 * Páginas y motores importan desde aquí — nunca replican lógica de agregación.
 * R103: insightStandard.ts se importa directamente solo para constantes.
 * R104: si dos páginas necesitan la misma agregación, vive una sola vez aquí.
 */

import type { SaleRecord, MetaRecord, VendorAnalysis, ClienteDormido } from '../types'
import type { ClienteSummary } from './analysis'
import {
  getRangoMTD,
  getRangoMTDComparableYoY,
  getRangoYTD,
  getRangoYTDComparableYoY,
  filtrarPorRango,
  calcularPareto,
  esEntidadPareto as _esEntidadPareto,
} from './insightStandard'
import type { TopProductoEntry, TopProductoClientEntry } from './diagnostic-actions'
import { salesInPeriod } from './analysis'

// ─── Re-exports: rangos temporales canónicos ───────────────────────────────────
// Usar estas importaciones desde páginas en lugar de insightStandard directamente.
export { getRangoMTD, getRangoMTDComparableYoY, getRangoYTD, getRangoYTDComparableYoY }
export { filtrarPorRango as filtrarVentasPorRango }

// ─── Tipos canónicos ───────────────────────────────────────────────────────────

/** Delta por producto — igual en estructura a TopProductoEntry (diagnostic-actions).
 *  Structurally compatible: TypeScript acepta asignación directa. */
export interface ProductoDelta {
  nombre: string
  delta: number
  signo: 'positivo' | 'negativo' | 'neutro'
}

// ─── Rangos adicionales ────────────────────────────────────────────────────────

/** Últimos 3 meses CERRADOS antes de fechaRef.
 *  @example fechaRef=2026-04-17 → [2026-01-01, 2026-03-31] */
export function getRangoUltimos3Meses(fechaRef: Date | string): { desde: Date; hasta: Date } {
  const hoy = fechaRef instanceof Date ? fechaRef : new Date(fechaRef)
  const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 3, 1)
  const hasta = new Date(hoy.getFullYear(), hoy.getMonth(), 0, 23, 59, 59)
  return { desde, hasta }
}

/** Mismo rango de 3 meses cerrados del año anterior (comparable YoY). */
export function getRangoUltimos3MesesComparableYoY(fechaRef: Date | string): { desde: Date; hasta: Date } {
  const hoy = fechaRef instanceof Date ? fechaRef : new Date(fechaRef)
  const yearAnt = hoy.getFullYear() - 1
  const desde = new Date(yearAnt, hoy.getMonth() - 3, 1)
  const hasta = new Date(yearAnt, hoy.getMonth(), 0, 23, 59, 59)
  return { desde, hasta }
}

// ─── Helper interno: listas de períodos para los dos rangos ───────────────────

function getLast3ClosedMonths(year: number, month: number): Array<{ year: number; month: number }> {
  const result: Array<{ year: number; month: number }> = []
  for (let i = 1; i <= 3; i++) {
    const m = month - i
    result.push(m >= 0 ? { year, month: m } : { year: year - 1, month: m + 12 })
  }
  return result
}

// ─── Deltas YoY por entidad ────────────────────────────────────────────────────

function sumVentas(arr: SaleRecord[], filterFn: (s: SaleRecord) => boolean): number {
  return arr.reduce((acc, s) => filterFn(s) ? acc + (s.venta_neta ?? s.unidades) : acc, 0)
}

function buildDeltaYoY(
  ventas: SaleRecord[],
  rango: 'mesActual' | 'ultimos3Meses',
  now: Date,
  filterFn: (s: SaleRecord) => boolean,
): number {
  const year  = now.getFullYear()
  const month = now.getMonth()
  const diasTx = now.getDate()

  let curr: SaleRecord[]
  let prev: SaleRecord[]

  if (rango === 'mesActual') {
    curr = salesInPeriod(ventas, year,     month).filter(s => s.fecha.getDate() <= diasTx)
    prev = salesInPeriod(ventas, year - 1, month).filter(s => s.fecha.getDate() <= diasTx)
  } else {
    const last3 = getLast3ClosedMonths(year, month)
    curr = last3.flatMap(({ year: y, month: m }) => salesInPeriod(ventas, y,     m))
    prev = last3.flatMap(({ year: y, month: m }) => salesInPeriod(ventas, y - 1, m))
  }

  return sumVentas(curr, filterFn) - sumVentas(prev, filterFn)
}

/** Delta YoY de venta_neta (o unidades si no hay neta) para un cliente específico.
 *  @example getDeltaYoYPorCliente(ventas, 'Farmacia San Juan', 'mesActual', now) → -1250.5 */
export function getDeltaYoYPorCliente(
  ventas: SaleRecord[],
  cliente: string,
  rango: 'mesActual' | 'ultimos3Meses',
  now: Date,
): number {
  return buildDeltaYoY(ventas, rango, now, s => s.cliente === cliente)
}

/** Delta YoY para un producto específico. */
export function getDeltaYoYPorProducto(
  ventas: SaleRecord[],
  producto: string,
  rango: 'mesActual' | 'ultimos3Meses',
  now: Date,
): number {
  return buildDeltaYoY(ventas, rango, now, s => s.producto === producto)
}

/** Delta YoY para un vendedor específico. */
export function getDeltaYoYPorVendedor(
  ventas: SaleRecord[],
  vendedor: string,
  rango: 'mesActual' | 'ultimos3Meses',
  now: Date,
): number {
  return buildDeltaYoY(ventas, rango, now, s => s.vendedor === vendedor)
}

/** Delta YoY para una categoría específica. */
export function getDeltaYoYPorCategoria(
  ventas: SaleRecord[],
  categoria: string,
  rango: 'mesActual' | 'ultimos3Meses',
  now: Date,
): number {
  return buildDeltaYoY(ventas, rango, now, s => s.categoria === categoria)
}

/** Delta YoY para una zona (departamento) específica. */
export function getDeltaYoYPorZona(
  ventas: SaleRecord[],
  zona: string,
  rango: 'mesActual' | 'ultimos3Meses',
  now: Date,
): number {
  return buildDeltaYoY(ventas, rango, now, s => s.departamento === zona)
}

// ─── Top productos por cliente (R95/R96/R97) ──────────────────────────────────
// Lógica extraída de EstadoComercialPage.tsx — fuente única canónica.

function buildClientProdMap(salesArr: SaleRecord[]): Map<string, Map<string, number>> {
  const m = new Map<string, Map<string, number>>()
  for (const s of salesArr) {
    if (!s.cliente || !s.producto || s.venta_neta == null) continue
    let pm = m.get(s.cliente)
    if (!pm) { pm = new Map(); m.set(s.cliente, pm) }
    pm.set(s.producto, (pm.get(s.producto) ?? 0) + s.venta_neta)
  }
  return m
}

function buildTopProductsFromMaps(
  curr: Map<string, Map<string, number>>,
  prev: Map<string, Map<string, number>>,
): Record<string, TopProductoClientEntry> {
  const result: Record<string, TopProductoClientEntry> = {}
  for (const [cliente, prodMap] of curr) {
    const prevProdMap = prev.get(cliente) ?? new Map<string, number>()
    const deltas: TopProductoEntry[] = [...prodMap.entries()].map(([prod, val]) => {
      const prevVal = prevProdMap.get(prod) ?? 0
      const delta   = val - prevVal
      return {
        nombre: prod,
        delta,
        signo: (delta > 0 ? 'positivo' : delta < 0 ? 'negativo' : 'neutro') as 'positivo' | 'negativo' | 'neutro',
      }
    })
    result[cliente] = {
      topAlzas:  deltas.filter(d => d.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3),
      topCaidas: deltas.filter(d => d.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 3),
    }
  }
  return result
}

/** Top productos por cliente para un rango específico (R95/R96/R97 — same-day-range YoY).
 *  Usa venta_neta exclusivamente.
 *  @example getTopProductosPorCliente(ventas, 'mesActual', now) →
 *    { 'Cliente A': { topAlzas: [...], topCaidas: [...] }, ... }  */
export function getTopProductosPorCliente(
  ventas: SaleRecord[],
  rango: 'mesActual' | 'ultimos3Meses',
  now: Date,
): Record<string, TopProductoClientEntry> {
  const year   = now.getFullYear()
  const month  = now.getMonth()
  const diasTx = now.getDate()

  if (rango === 'mesActual') {
    const currMes = salesInPeriod(ventas, year,     month).filter(s => s.fecha.getDate() <= diasTx)
    const prevMes = salesInPeriod(ventas, year - 1, month).filter(s => s.fecha.getDate() <= diasTx)
    return buildTopProductsFromMaps(buildClientProdMap(currMes), buildClientProdMap(prevMes))
  }

  const last3 = getLast3ClosedMonths(year, month)
  const curr3 = buildClientProdMap(last3.flatMap(({ year: y, month: m }) => salesInPeriod(ventas, y,     m)))
  const prev3 = buildClientProdMap(last3.flatMap(({ year: y, month: m }) => salesInPeriod(ventas, y - 1, m)))
  return buildTopProductsFromMaps(curr3, prev3)
}

/** Versión bulk que computa ambos rangos en una sola llamada (eficiente para EstadoComercialPage).
 *  Retorna { mesActual, ultimos3Meses } compatible con StoreSnapshot.topProductosPorCliente. */
export function getTopProductosPorClienteAmbosRangos(
  ventas: SaleRecord[],
  now: Date,
  diasTranscurridos?: number,
): { mesActual: Record<string, TopProductoClientEntry>; ultimos3Meses: Record<string, TopProductoClientEntry> } {
  const year   = now.getFullYear()
  const month  = now.getMonth()
  const diasTx = diasTranscurridos ?? now.getDate()

  const currMes = salesInPeriod(ventas, year,     month).filter(s => s.fecha.getDate() <= diasTx)
  const prevMes = salesInPeriod(ventas, year - 1, month).filter(s => s.fecha.getDate() <= diasTx)
  const mesActual = buildTopProductsFromMaps(buildClientProdMap(currMes), buildClientProdMap(prevMes))

  const last3 = getLast3ClosedMonths(year, month)
  const curr3 = buildClientProdMap(last3.flatMap(({ year: y, month: m }) => salesInPeriod(ventas, y,     m)))
  const prev3 = buildClientProdMap(last3.flatMap(({ year: y, month: m }) => salesInPeriod(ventas, y - 1, m)))
  const ultimos3Meses = buildTopProductsFromMaps(curr3, prev3)

  return { mesActual, ultimos3Meses }
}

// ─── Top productos por vendedor / categoría / zona ────────────────────────────

function buildDimProdMap(
  salesArr: SaleRecord[],
  dimFn: (s: SaleRecord) => string | undefined,
): Map<string, Map<string, number>> {
  const m = new Map<string, Map<string, number>>()
  for (const s of salesArr) {
    const dim = dimFn(s)
    if (!dim || !s.producto || s.venta_neta == null) continue
    let pm = m.get(dim)
    if (!pm) { pm = new Map(); m.set(dim, pm) }
    pm.set(s.producto, (pm.get(s.producto) ?? 0) + s.venta_neta)
  }
  return m
}

function buildTopProductosPorDim(
  ventas: SaleRecord[],
  rango: 'mesActual' | 'ultimos3Meses',
  now: Date,
  dimFn: (s: SaleRecord) => string | undefined,
): Record<string, TopProductoClientEntry> {
  const year   = now.getFullYear()
  const month  = now.getMonth()
  const diasTx = now.getDate()

  let curr: SaleRecord[]
  let prev: SaleRecord[]

  if (rango === 'mesActual') {
    curr = salesInPeriod(ventas, year,     month).filter(s => s.fecha.getDate() <= diasTx)
    prev = salesInPeriod(ventas, year - 1, month).filter(s => s.fecha.getDate() <= diasTx)
  } else {
    const last3 = getLast3ClosedMonths(year, month)
    curr = last3.flatMap(({ year: y, month: m }) => salesInPeriod(ventas, y,     m))
    prev = last3.flatMap(({ year: y, month: m }) => salesInPeriod(ventas, y - 1, m))
  }

  return buildTopProductsFromMaps(buildDimProdMap(curr, dimFn), buildDimProdMap(prev, dimFn))
}

export function getTopProductosPorVendedor(
  ventas: SaleRecord[],
  rango: 'mesActual' | 'ultimos3Meses',
  now: Date,
): Record<string, TopProductoClientEntry> {
  return buildTopProductosPorDim(ventas, rango, now, s => s.vendedor)
}

export function getTopProductosPorCategoria(
  ventas: SaleRecord[],
  rango: 'mesActual' | 'ultimos3Meses',
  now: Date,
): Record<string, TopProductoClientEntry> {
  return buildTopProductosPorDim(ventas, rango, now, s => s.categoria)
}

export function getTopProductosPorZona(
  ventas: SaleRecord[],
  rango: 'mesActual' | 'ultimos3Meses',
  now: Date,
): Record<string, TopProductoClientEntry> {
  return buildTopProductosPorDim(ventas, rango, now, s => s.departamento)
}

// ─── Cumplimiento de meta ──────────────────────────────────────────────────────

export interface CumplimientoMeta {
  metaUDS: number
  metaUSD: number
  vendidoUDS: number
  vendidoUSD: number
  cumplimientoPctUDS: number | null
  cumplimientoPctUSD: number | null
  ritmoDiarioUDS: number
  ritmoNecesarioUDS: number
  faltanteUDS: number
  diasRestantes: number
  proyeccionCierrePctUDS: number | null
}

/** Cumplimiento de meta mensual para un vendedor en el mes activo.
 *  @example getCumplimientoMeta('Juan', metas, ventas, now) */
export function getCumplimientoMeta(
  vendedor: string,
  metas: MetaRecord[],
  ventas: SaleRecord[],
  now: Date,
): CumplimientoMeta {
  const year  = now.getFullYear()
  const month = now.getMonth()
  // MetaRecord.mes es 1-based
  const meta = metas.find(m => m.vendedor === vendedor && m.anio === year && m.mes === month + 1)

  const metaUDS = meta?.meta_uds ?? meta?.meta ?? 0
  const metaUSD = meta?.meta_usd ?? 0

  const periodSales = salesInPeriod(ventas, year, month).filter(s => s.vendedor === vendedor)
  const vendidoUDS  = periodSales.reduce((acc, s) => acc + s.unidades, 0)
  const vendidoUSD  = periodSales.reduce((acc, s) => acc + (s.venta_neta ?? 0), 0)

  const diasTranscurridos = now.getDate()
  const diasTotales       = new Date(year, month + 1, 0).getDate()
  const diasRestantes     = diasTotales - diasTranscurridos

  const ritmoDiarioUDS  = diasTranscurridos > 0 ? vendidoUDS / diasTranscurridos : 0
  const ritmoNecesarioUDS = diasRestantes > 0 && metaUDS > 0
    ? Math.max(0, (metaUDS - vendidoUDS) / diasRestantes)
    : 0
  const faltanteUDS = Math.max(0, metaUDS - vendidoUDS)
  const proyeccionCierreUDS = ritmoDiarioUDS * diasTotales

  return {
    metaUDS,
    metaUSD,
    vendidoUDS,
    vendidoUSD,
    cumplimientoPctUDS:       metaUDS > 0 ? (vendidoUDS / metaUDS) * 100 : null,
    cumplimientoPctUSD:       metaUSD > 0 ? (vendidoUSD / metaUSD) * 100 : null,
    ritmoDiarioUDS,
    ritmoNecesarioUDS,
    faltanteUDS,
    diasRestantes,
    proyeccionCierrePctUDS:   metaUDS > 0 ? (proyeccionCierreUDS / metaUDS) * 100 : null,
  }
}

// ─── Compradores únicos por producto ──────────────────────────────────────────

export interface CompradorDelta {
  producto: string
  compradoresActuales: number
  compradoresPrev: number
  delta: number
}

/** Clientes únicos que compraron cada producto del vendedor en el rango — comparado YoY.
 *  Útil para narrativa "perdió compradores". */
export function getCompradoresUnicosPorProducto(
  ventas: SaleRecord[],
  vendedor: string,
  rango: 'mesActual' | 'ultimos3Meses',
  now: Date,
): CompradorDelta[] {
  const year   = now.getFullYear()
  const month  = now.getMonth()
  const diasTx = now.getDate()

  let curr: SaleRecord[]
  let prev: SaleRecord[]

  if (rango === 'mesActual') {
    curr = salesInPeriod(ventas, year,     month).filter(s => s.vendedor === vendedor && s.fecha.getDate() <= diasTx)
    prev = salesInPeriod(ventas, year - 1, month).filter(s => s.vendedor === vendedor && s.fecha.getDate() <= diasTx)
  } else {
    const last3 = getLast3ClosedMonths(year, month)
    curr = last3.flatMap(({ year: y, month: m }) => salesInPeriod(ventas, y,     m)).filter(s => s.vendedor === vendedor)
    prev = last3.flatMap(({ year: y, month: m }) => salesInPeriod(ventas, y - 1, m)).filter(s => s.vendedor === vendedor)
  }

  const buildProdClientMap = (arr: SaleRecord[]): Map<string, Set<string>> => {
    const m = new Map<string, Set<string>>()
    for (const s of arr) {
      if (!s.producto || !s.cliente) continue
      let cs = m.get(s.producto)
      if (!cs) { cs = new Set(); m.set(s.producto, cs) }
      cs.add(s.cliente)
    }
    return m
  }

  const currMap = buildProdClientMap(curr)
  const prevMap = buildProdClientMap(prev)
  const allProducts = new Set([...currMap.keys(), ...prevMap.keys()])

  return [...allProducts].map(producto => {
    const compradoresActuales = currMap.get(producto)?.size ?? 0
    const compradoresPrev     = prevMap.get(producto)?.size ?? 0
    return { producto, compradoresActuales, compradoresPrev, delta: compradoresActuales - compradoresPrev }
  })
}

// ─── Pareto ────────────────────────────────────────────────────────────────────

/** ¿Pertenece esta entidad al 80% (pareto) del total de ventas?
 *  @example esEntidadPareto('Cliente A', 'cliente', ventas) */
export function esEntidadPareto(
  miembro: string,
  dim: 'cliente' | 'vendedor' | 'producto' | 'categoria',
  ventas: SaleRecord[],
): boolean {
  const dimFn: (s: SaleRecord) => string | undefined = {
    cliente:   s => s.cliente,
    vendedor:  s => s.vendedor,
    producto:  s => s.producto,
    categoria: s => s.categoria,
  }[dim]

  const totals = new Map<string, number>()
  for (const s of ventas) {
    const key = dimFn(s)
    if (!key) continue
    totals.set(key, (totals.get(key) ?? 0) + (s.venta_neta ?? s.unidades))
  }

  const entidades = [...totals.entries()].map(([nombre, valor]) => ({ nombre, valor }))
  const paretoList = calcularPareto(entidades)
  return _esEntidadPareto(miembro, paretoList)
}

// ─── Helpers de presentación ──────────────────────────────────────────────────

/** 1500 → "1.5k" | 2300000 → "2.3M" | 500 → "500" */
export function fmtMonedaCompacta(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (abs >= 1_000)     return `${sign}${(abs / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return `${sign}${Math.round(abs).toLocaleString()}`
}

/** Mismo formato pero para unidades (sin decimales por defecto). */
export function fmtUnidadesCompacta(n: number): string {
  return fmtMonedaCompacta(Math.round(n))
}

// ─── Pareto Clientes — Z.1.b (R102/R104) ─────────────────────────────────────

export interface ParetoClienteEntry {
  nombre: string
  totalUnidades: number
  totalVenta: number
  vendedor: string
  varPct: number | null
  cumulativePct: number
  peso: number
}

/** Top-20 clientes por peso de venta — para tab Pareto en ClientesPage.
 *  Usa clienteSummaries pre-computados off-thread (no itera ventas crudas).
 *  R59: peso calculado sobre el universo total, no solo el top-20. */
export function getParetoClientes(
  clienteSummaries: ClienteSummary[],
  has_venta_neta: boolean,
): ParetoClienteEntry[] {
  if (!clienteSummaries.length) return []
  const top = clienteSummaries.slice(0, 20)
  const totalAll = clienteSummaries.reduce(
    (s, c) => s + (has_venta_neta ? c.ventaCur : c.udsCur), 0,
  )
  let cum = 0
  return top.map((c) => {
    const cur = has_venta_neta ? c.ventaCur : c.udsCur
    cum += cur
    return {
      nombre: c.nombre,
      totalUnidades: c.udsCur,
      totalVenta: c.ventaCur,
      vendedor: c.vendedor,
      varPct: c.varPct,
      cumulativePct: totalAll > 0 ? (cum / totalAll) * 100 : 0,
      peso: totalAll > 0 ? (cur / totalAll) * 100 : 0,
    }
  })
}

// ─── Riesgo Temprano — Z.1.b (R102/R104) ─────────────────────────────────────

export interface RiesgoTempranoEntry {
  nombre: string
  vendedor: string
  lastPurchase: Date
  avgDays: number
  daysSince: number
  atraso: number
  signal: 'en riesgo' | 'desacelerando'
  valorHistorico: number
}

/** Clientes con señal de riesgo temprano, ordenados por prioridad.
 *  Usa clienteSummaries pre-computados off-thread. */
export function getClientesEnRiesgoTemprano(
  clienteSummaries: ClienteSummary[],
): RiesgoTempranoEntry[] {
  const items = clienteSummaries
    .filter((c) => c.riesgoSignal !== null)
    .map((c) => ({
      nombre: c.nombre,
      vendedor: c.vendedor,
      lastPurchase: new Date(c.lastDate),
      avgDays: c.riesgoAvgDays,
      daysSince: c.riesgoDaysSince,
      atraso: c.riesgoAtraso,
      signal: c.riesgoSignal as 'en riesgo' | 'desacelerando',
      valorHistorico: c.riesgoValorHistorico,
    }))
  items.sort((a, b) => {
    if (a.signal !== b.signal) return a.signal === 'en riesgo' ? -1 : 1
    return b.valorHistorico - a.valorHistorico
  })
  return items
}

/** Suma del valor YoY en riesgo de todos los clientes dormidos. */
export function getValorEnRiesgoTotal(clientesDormidos: ClienteDormido[]): number {
  return clientesDormidos.reduce((a, c) => a + c.valor_yoy_usd, 0)
}

// ─── Agregaciones de VendorAnalysis — Z.1.b (R102/R104) ──────────────────────

/** Conteos por estado de riesgo de una lista de vendedores (puede ser filtrada en UI). */
export function getConteosPorEstado(vendorAnalysis: VendorAnalysis[]): {
  critico: number; riesgo: number; ok: number; superando: number
} {
  return {
    critico:   vendorAnalysis.filter(v => v.riesgo === 'critico').length,
    riesgo:    vendorAnalysis.filter(v => v.riesgo === 'riesgo').length,
    ok:        vendorAnalysis.filter(v => v.riesgo === 'ok').length,
    superando: vendorAnalysis.filter(v => v.riesgo === 'superando').length,
  }
}

/** Total YTD del equipo (o del subconjunto filtrado) en USD o UDS.
 *  R104: usado por VendedoresPage (teamTotal) y como denominador de peso %. */
export function getVentasTotalEquipoYTD(
  vendorAnalysis: VendorAnalysis[],
  usaDolares: boolean,
): number {
  return vendorAnalysis.reduce(
    (sum, v) => sum + (usaDolares ? (v.ytd_actual_usd ?? 0) : (v.ytd_actual_uds ?? 0)),
    0,
  )
}

/** Totales comparativos YTD actual vs anterior para un conjunto de vendedores.
 *  R104: usado por VendedoresPage filteredTotals. */
export function getVentasPorVendedorAgrupado(
  vendorAnalysis: VendorAnalysis[],
  usaDolares: boolean,
): { total2026: number; total2025: number; varAbs: number; varPct: number | null } {
  const total2026 = vendorAnalysis.reduce(
    (sum, v) => sum + (usaDolares ? (v.ytd_actual_usd ?? 0) : (v.ytd_actual_uds ?? 0)), 0,
  )
  const total2025 = vendorAnalysis.reduce(
    (sum, v) => sum + (usaDolares ? (v.ytd_anterior_usd ?? 0) : (v.ytd_anterior_uds ?? 0)), 0,
  )
  const varAbs = total2026 - total2025
  const varPct = total2025 > 0 ? ((total2026 - total2025) / total2025) * 100 : null
  return { total2026, total2025, varAbs, varPct }
}

// ─── Aggregaciones de ventas crudas — Z.1.b (R102) ────────────────────────────

/** Ventas netas totales de un período (año+mes 0-based).
 *  R104: usado por MetasPage teamRealNeto. */
export function getVentasNetaPeriodo(
  ventas: SaleRecord[],
  year: number,
  month: number,
): number {
  return salesInPeriod(ventas, year, month).reduce((a, s) => a + (s.venta_neta ?? 0), 0)
}

// ─── Matriz Histórica Vendedor × Mes — Z.1.b (R102) ──────────────────────────

export interface MatrizVendedorMesEntry {
  vendor: string
  va: VendorAnalysis | undefined
  monthData: {
    key: string
    metaVal: number | null
    realVal: number
    realValNeto: number
    pct: number | null
    isCurrent: boolean
  }[]
}

/** Construye la matriz histórica vendedor × mes usada por MetasPage.
 *  Filtra filas sin meta ni ventas en ningún período visible. */
export function getMatrizHistoricaVendedorMes(
  ventas: SaleRecord[],
  metas: MetaRecord[],
  vendors: string[],
  histMonths: { year: number; month: number; label: string }[],
  vendorAnalysis: VendorAnalysis[],
  currentYear: number,
  currentMonth: number,
  tipoMetaActivo: 'uds' | 'usd',
): MatrizVendedorMesEntry[] {
  return vendors.map((vendor) => {
    const va = vendorAnalysis.find((v) => v.vendedor === vendor)
    const monthData = histMonths.map(({ year, month }) => {
      const key = `${year}-${month}`
      const metaRow = metas.find((m) => m.vendedor === vendor && m.anio === year && m.mes === month + 1)
      const metaVal = tipoMetaActivo === 'usd' ? (metaRow?.meta_usd ?? null) : (metaRow?.meta_uds ?? metaRow?.meta ?? null)
      const ventasSales = salesInPeriod(ventas, year, month).filter((s) => s.vendedor === vendor)
      const realVal = ventasSales.reduce((a, s) => a + s.unidades, 0)
      const realValNeto = ventasSales.reduce((a, s) => a + (s.venta_neta ?? 0), 0)
      const activeVal = tipoMetaActivo === 'usd' ? realValNeto : realVal
      const pct = metaVal && metaVal > 0 ? (activeVal / metaVal) * 100 : null
      const isCurrent = year === currentYear && month === currentMonth
      return { key, metaVal, realVal, realValNeto, pct, isCurrent }
    })
    return { vendor, va, monthData }
  }).filter(row => row.monthData.some(d => (d.metaVal ?? 0) > 0 || d.realVal > 0))
}

// ─── Supervisor Map — Z.1.b (R102/R104) ──────────────────────────────────────

/** Mapa vendedor → supervisor extraído de las ventas crudas.
 *  R104: reutilizado por MetasPage y VendedoresPage (si migra a Z.2). */
export function getSupervisorMap(ventas: SaleRecord[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const row of ventas) {
    if (row.vendedor && row.supervisor) map[row.vendedor] = row.supervisor
  }
  return map
}

/** Lista de supervisores únicos ordenada alfabéticamente. */
export function getListaSupervisores(supervisorMap: Record<string, string>): string[] {
  return [...new Set(Object.values(supervisorMap))].filter(Boolean).sort()
}

// ─── Agregados para filtrarConEstandar (Cuello 2, Z.4) ───────────────────────

/** Objeto que precomputa los mapas que filtrarConEstandar construía en 3+ pasadas
 *  separadas. Una sola iteración sobre sales produce todo lo necesario.
 *  R102: lógica de agregación vive aquí. */
export interface AgregadosFiltro {
  /** mes-clave → set de clientes activos ese mes (toda la historia). Para churnBaseline. */
  byMonth: Map<string, Set<string>>
  /** cliente → set de productos comprados alguna vez (toda la historia). Para coMatrix. */
  clientProductMap: Map<string, Set<string>>
  /** miembro → # transacciones en el período seleccionado. */
  memberTxCounts: Map<string, number>
  /** miembro → suma venta-equivalente en el período seleccionado. */
  memberValues: Map<string, number>
  /** suma venta_neta del período seleccionado (= ventaTotalNegocio). */
  ventaTotalNegocio: number
}

const DIMS_FILTRO = ['vendedor', 'cliente', 'producto', 'categoria', 'canal'] as const

/** Una sola pasada sobre `sales` que produce los mapas que filtrarConEstandar necesita.
 *  Llamar desde un useMemo con deps [sales, selectedPeriod]. R102. */
export function getAgregadosParaFiltro( // [Z.4 — perf: cuello-2]
  sales: SaleRecord[],
  selectedPeriod: { year: number; month: number },
): AgregadosFiltro {
  const { year, month } = selectedPeriod
  const byMonth = new Map<string, Set<string>>()
  const clientProductMap = new Map<string, Set<string>>()
  const memberTxCounts = new Map<string, number>()
  const memberValues = new Map<string, number>()
  let ventaTotalNegocio = 0

  for (const s of sales) {
    const sr = s as unknown as Record<string, unknown>
    const rawFecha = s.fecha
    const fecha = rawFecha instanceof Date ? rawFecha : new Date(rawFecha as unknown as string)
    if (isNaN(fecha.getTime())) continue
    const fy = fecha.getFullYear()
    const fm = fecha.getMonth()

    // All-history: byMonth (para calcularChurnBaseline)
    const cli = sr.cliente as string | undefined
    if (cli) {
      const key = `${fy}-${String(fm + 1).padStart(2, '0')}`
      let set = byMonth.get(key)
      if (!set) { set = new Set(); byMonth.set(key, set) }
      set.add(cli)
    }

    // All-history: clientProductMap (para calcularCoOcurrencia)
    const prod = sr.producto as string | undefined
    if (cli && prod) {
      let set = clientProductMap.get(cli)
      if (!set) { set = new Set(); clientProductMap.set(cli, set) }
      set.add(prod)
    }

    // Selected-period only: memberTxCounts, memberValues, ventaTotalNegocio
    if (fy === year && fm === month) {
      const venta_neta = (sr.venta_neta as number) ?? 0
      ventaTotalNegocio += venta_neta
      const venta = venta_neta !== 0 ? venta_neta : ((sr.unidades as number) ?? 0)
      for (const dim of DIMS_FILTRO) {
        const key = sr[dim] as string | undefined
        if (!key) continue
        memberTxCounts.set(key, (memberTxCounts.get(key) ?? 0) + 1)
        memberValues.set(key, (memberValues.get(key) ?? 0) + venta)
      }
    }
  }

  return { byMonth, clientProductMap, memberTxCounts, memberValues, ventaTotalNegocio }
}

// ─── Meta del mes: filtro canónico ────────────────────────────────────────────

/**
 * Suma la meta del mes para el equipo usando SOLO metas single-dim por vendedor.
 * Excluye metas con canal, categoría o cliente para evitar doble conteo con metas
 * multi-dim (vendedor+canal, vendedor+cliente+canal, etc.).
 *
 * Fuente canónica — consumir desde dashboard, MetasPage y cualquier otra vista
 * que necesite "meta del mes del equipo". No replicar este filtro inline.
 */
export function getMetaMes(
  metas: MetaRecord[],
  year: number,
  month: number,
  tipoMeta: 'uds' | 'usd',
): number {
  const getVal = (m: MetaRecord) =>
    tipoMeta === 'usd' ? (m.meta_usd ?? 0) : (m.meta_uds ?? m.meta ?? 0)

  return metas
    .filter(
      (m) =>
        m.anio === year &&
        m.mes === month + 1 &&
        m.vendedor &&
        !m.canal &&
        !m.categoria &&
        !m.cliente,
    )
    .reduce((acc, m) => acc + getVal(m), 0)
}
