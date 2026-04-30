import type {
  SaleRecord,
  MetaRecord,
  InventoryItem,
  VendorAnalysis,
  TeamStats,
  ClienteDormido,
  ConcentracionRiesgo,
  Configuracion,
  RiesgoVendedor,
  CategoriaInventario,
  ClasificacionInventario,
  InventarioPorCategoria,
  SupervisorAnalysis,
  CategoriaAnalysis,
  CanalAnalysis,
} from '../types'
import {
  getFechaReferencia,
  buildDefaultYtdRange,
  buildMonthlyRange,
  buildComparisonRangeYoY,
} from './periods'

// ─── HELPERS DE FECHA ─────────────────────────────────────────────────────────

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function startOfPeriod(year: number, month: number): Date {
  return new Date(year, month, 1)
}

function endOfPeriod(year: number, month: number): Date {
  return new Date(year, month + 1, 0, 23, 59, 59, 999)
}

export function prevPeriod(year: number, month: number): { year: number; month: number } {
  if (month === 0) return { year: year - 1, month: 11 }
  return { year, month: month - 1 }
}

export function periodKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

function weekKey(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}-W${Math.ceil(d.getDate() / 7)}`
}

// ─── ÍNDICE DE VENTAS ─────────────────────────────────────────────────────────

export interface SaleIndex {
  byPeriod: Map<string, SaleRecord[]>
  byVendor: Map<string, SaleRecord[]>
  byProduct: Map<string, SaleRecord[]>
  byClient: Map<string, SaleRecord[]>
  fechaReferencia: Date
  // Detección de columnas (calculada en el mismo pass)
  has_producto: boolean
  has_cliente: boolean
  has_venta_neta: boolean
  has_categoria: boolean
  has_canal: boolean
  has_supervisor: boolean
  has_departamento: boolean
  // [PR-M1] Flags para ingesta dual (unidades obligatoria, venta_neta opcional)
  has_unidades: boolean
  has_precio_unitario: boolean
  // [schema-cleanup] flags de columnas opcionales agregadas: subcategoria/proveedor (dims),
  // costo_unitario (habilita métricas margen_bruto / margen_pct).
  has_subcategoria: boolean
  has_proveedor: boolean
  has_costo_unitario: boolean
}

function appendToMap<K>(map: Map<K, SaleRecord[]>, key: K, s: SaleRecord): void {
  let arr = map.get(key)
  if (!arr) { arr = []; map.set(key, arr) }
  arr.push(s)
}

export function buildSaleIndex(sales: SaleRecord[]): SaleIndex {
  const byPeriod = new Map<string, SaleRecord[]>()
  const byVendor = new Map<string, SaleRecord[]>()
  const byProduct = new Map<string, SaleRecord[]>()
  const byClient = new Map<string, SaleRecord[]>()
  // Ticket 2.2-C: max(sales.fecha) centralizado en lib/periods.ts.
  // Conservamos sentinel epoch 0 cuando sales es vacío — computeCommercialAnalysis
  // detecta el sentinel y retorna shape vacío (Ticket 2.2-A).
  const fechaReferencia = getFechaReferencia(sales) ?? new Date(0)
  let has_producto = false, has_cliente = false, has_venta_neta = false
  let has_categoria = false, has_canal = false, has_supervisor = false, has_departamento = false
  let has_subcategoria = false, has_proveedor = false, has_costo_unitario = false
  // [PR-M1] has_unidades usa umbral ≥80% (métrica obligatoria); contamos aparte
  let _filasConUnidades = 0

  for (const s of sales) {
    appendToMap(byPeriod, periodKey(s.fecha.getFullYear(), s.fecha.getMonth()), s)
    if (s.vendedor) appendToMap(byVendor, s.vendedor, s)
    if (s.producto) { appendToMap(byProduct, s.producto, s); has_producto = true }
    if (s.cliente)  { appendToMap(byClient, s.cliente, s); has_cliente = true }
    if (!has_venta_neta && s.venta_neta != null && s.venta_neta > 0) has_venta_neta = true
    if (!has_categoria && s.categoria != null && s.categoria !== '') has_categoria = true
    if (!has_subcategoria && s.subcategoria != null && s.subcategoria !== '') has_subcategoria = true
    if (!has_canal && s.canal != null && s.canal !== '') has_canal = true
    if (!has_supervisor && s.supervisor != null && s.supervisor !== '') has_supervisor = true
    if (!has_departamento && s.departamento != null && s.departamento !== '') has_departamento = true
    if (!has_proveedor && s.proveedor != null && s.proveedor !== '') has_proveedor = true
    if (!has_costo_unitario && s.costo_unitario != null && s.costo_unitario > 0) has_costo_unitario = true
    if (s.unidades > 0) _filasConUnidades++
  }

  const has_unidades        = sales.length > 0 && (_filasConUnidades / sales.length) >= 0.8
  const has_precio_unitario = has_unidades && has_venta_neta

  return {
    byPeriod, byVendor, byProduct, byClient, fechaReferencia,
    has_producto, has_cliente, has_venta_neta, has_categoria, has_canal, has_supervisor, has_departamento,
    has_unidades, has_precio_unitario,
    has_subcategoria, has_proveedor, has_costo_unitario,
  }
}

function getSalesByPeriod(index: SaleIndex, year: number, month: number): SaleRecord[] {
  return index.byPeriod.get(periodKey(year, month)) ?? []
}

// ─── FILTROS DE PERÍODO ───────────────────────────────────────────────────────

export function salesInRange(
  sales: SaleRecord[],
  year: number,
  monthStart: number,
  monthEnd: number,
): SaleRecord[] {
  // Invariante: monthEnd >= monthStart. Mirror del patrón de lib/periods.ts
  // (buildMonthlyRange throws). NaN/fuera-de-rango propagan a Invalid Date
  // como en salesInPeriod legacy → filter retorna [].
  if (monthEnd < monthStart) {
    throw new Error(`monthEnd (${monthEnd}) < monthStart (${monthStart})`)
  }
  const start = startOfPeriod(year, monthStart)
  const end = endOfPeriod(year, monthEnd)
  return sales.filter((s) => s.fecha >= start && s.fecha <= end)
}

export function salesInPeriod(sales: SaleRecord[], year: number, month: number): SaleRecord[] {
  return salesInRange(sales, year, month, month)
}

/**
 * Devuelve las ventas YoY del rango [monthStart..monthEnd] del año anterior,
 * truncando al maxDay SOLO en el último mes del rango (regla CONTEXT.md
 * "MTD vs MTD same-day, YTD vs YTD same-day"). Meses intermedios completos.
 *
 * @param year año DEL RANGO ACTUAL (la función calcula year-1 internamente).
 * @param maxDay día del mes de cutoff [1-31]. Si <= 0, retorna [].
 * @throws si monthStart > monthEnd.
 */
export function salesInRangeYoYSameDay(
  sales: SaleRecord[],
  year: number,
  monthStart: number,
  monthEnd: number,
  maxDay: number,
): SaleRecord[] {
  if (monthStart > monthEnd) {
    throw new Error(`monthEnd (${monthEnd}) < monthStart (${monthStart})`)
  }
  if (maxDay <= 0) return []

  const result: SaleRecord[] = []
  for (let m = monthStart; m <= monthEnd; m++) {
    const monthSales = salesInPeriod(sales, year - 1, m)
    if (m === monthEnd) {
      const cutoff = new Date(year - 1, m, maxDay, 23, 59, 59, 999)
      for (const s of monthSales) {
        if (s.fecha <= cutoff) result.push(s)
      }
    } else {
      result.push(...monthSales)
    }
  }
  return result
}

/** Filter sales to only include days <= maxDay within the month */
export function filterSalesByDayRange(sales: SaleRecord[], maxDay: number): SaleRecord[] {
  return sales.filter(s => s.fecha.getDate() <= maxDay)
}

/**
 * Promedio de ventas de los últimos N períodos anteriores al dado.
 * Excluye el período actual. Solo cuenta períodos con datos reales.
 */
export function promedioUltimosN(
  sales: SaleRecord[],
  year: number,
  month: number,
  n: number = 3,
  metric: 'unidades' | 'venta_neta' = 'unidades'
): { promedio: number; periodos_con_datos: number; valores: number[] } {
  const valores: number[] = []

  for (let i = 1; i <= n; i++) {
    let y = year
    let m = month - i
    while (m < 0) { m += 12; y-- }
    const records = salesInPeriod(sales, y, m)
    if (records.length > 0) {
      const total = records.reduce((a, s) =>
        a + (metric === 'venta_neta' ? (s.venta_neta ?? s.unidades) : s.unidades)
      , 0)
      valores.push(total)
    }
  }

  const promedio = valores.length > 0
    ? Math.round(valores.reduce((a, b) => a + b, 0) / valores.length)
    : 0

  return { promedio, periodos_con_datos: valores.length, valores }
}

// ─── SEMANAS EN RACHA NEGATIVA ────────────────────────────────────────────────

// Accepts pre-filtered vendor sales (all sales for one vendor)
function calcSemanasRachaFast(
  vendorSales: SaleRecord[],
  year: number,
  month: number
): { semanas: number; promedioSemanal: number } {
  const periodStart = startOfPeriod(year, month)
  const periodEnd = endOfPeriod(year, month)

  const hist = vendorSales.filter((s) => s.fecha < periodStart)
  if (hist.length === 0) return { semanas: 0, promedioSemanal: 0 }

  const byWeekHist: Record<string, number> = {}
  hist.forEach((s) => {
    const k = weekKey(s.fecha)
    byWeekHist[k] = (byWeekHist[k] ?? 0) + s.unidades
  })
  const weekValues = Object.values(byWeekHist)
  const promedioSemanal =
    weekValues.length > 0
      ? weekValues.reduce((a, b) => a + b, 0) / weekValues.length
      : 0

  const current = vendorSales.filter((s) => s.fecha >= periodStart && s.fecha <= periodEnd)
  const currentByWeek: Record<string, number> = {}
  current.forEach((s) => {
    const k = weekKey(s.fecha)
    currentByWeek[k] = (currentByWeek[k] ?? 0) + s.unidades
  })

  const sortedWeeks = Object.entries(currentByWeek).sort(([a], [b]) =>
    a.localeCompare(b)
  )
  let racha = 0
  for (let i = sortedWeeks.length - 1; i >= 0; i--) {
    if (sortedWeeks[i][1] < promedioSemanal) racha++
    else break
  }

  return { semanas: racha, promedioSemanal }
}

// ─── HELPERS DE NORMALIZACIÓN ─────────────────────────────────────────────────

function normalizeStr(s: string): string {
  return s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// ─── METAS MULTI-DIMENSIONAL ──────────────────────────────────────────────────

const META_DIMS = ['vendedor', 'cliente', 'producto', 'categoria', 'departamento', 'supervisor', 'canal'] as const
type MetaDim = typeof META_DIMS[number]

export function getMetaMultiDim(
  metas: MetaRecord[],
  filtros: { mes: number; anio: number } & Partial<Record<MetaDim, string>>,
  tipoMetaActivo?: 'uds' | 'usd',
): number | null {
  const resolved = getMetaRecordMultiDim(metas, filtros)
  if (!resolved) return null
  if (tipoMetaActivo === 'usd') return resolved.meta_usd ?? resolved.meta ?? null
  return resolved.meta_uds ?? resolved.meta ?? null
}

/** Returns the best-matching MetaRecord (most specific) */
export function getMetaRecordMultiDim(
  metas: MetaRecord[],
  filtros: { mes: number; anio: number } & Partial<Record<MetaDim, string>>,
): MetaRecord | null {
  const periodMetas = metas.filter((m) => m.mes === filtros.mes && m.anio === filtros.anio)
  if (periodMetas.length === 0) return null

  const matches = periodMetas
    .filter((m) => {
      for (const dim of META_DIMS) {
        const mVal = m[dim]
        if (mVal !== undefined && mVal !== null) {
          const fVal = filtros[dim]
          if (!fVal || normalizeStr(String(mVal)) !== normalizeStr(String(fVal))) return false
        }
      }
      return true
    })
    .map((m) => ({
      meta: m,
      specificity: META_DIMS.filter((d) => m[d] !== undefined).length,
    }))
    .sort((a, b) => b.specificity - a.specificity)

  return matches.length > 0 ? matches[0].meta : null
}

// ─── UTILIDAD: VARIACIÓN SEGURA ───────────────────────────────────────────────

const safePct = (num: number, den: number): number => {
  if (!den || den === 0) return 0
  const raw = ((num - den) / Math.abs(den)) * 100
  return Math.max(-999, Math.min(999, raw))
}

// ─── ANÁLISIS POR VENDEDOR ────────────────────────────────────────────────────

// ─── YTD HELPER ───────────────────────────────────────────────────────────────

/**
 * Calcula totales (uds + USD) del rango actual y del mismo rango YoY (año - 1),
 * más variación porcentual.
 *
 * El "rango YoY" se construye con `buildComparisonRangeYoY` aplicado al rango
 * actual, lo que produce el mismo rango del año anterior con clamp same-day
 * en monthEnd cuando corresponde (regla CONTEXT.md "MTD vs MTD same-day,
 * YTD vs YTD same-day").
 *
 * Nota: los nombres de los campos retornados preservan el prefijo `ytd_` por
 * compat histórica con consumers downstream. Cuando el rango es
 * (0, fechaRef.getMonth()) el campo es YTD literal; en otros rangos el "YTD"
 * del nombre es legacy y el valor representa "totales del rango". Renaming
 * queda para un ticket futuro de cleanup (ver BACKLOG).
 *
 * @param sales ventas a agregar.
 * @param fechaReferencia "hoy" del negocio (max sales date).
 * @param monthStart mes inicial del rango actual [0-11].
 * @param monthEnd mes final del rango actual [0-11], debe ser >= monthStart.
 * @throws si monthStart > monthEnd.
 */
export function computeRangeYoY(
  sales: SaleRecord[],
  fechaReferencia: Date,
  monthStart: number,
  monthEnd: number,
): {
  ytd_actual_uds: number
  ytd_anterior_uds: number
  variacion_ytd_uds_pct: number | null
  ytd_actual_usd?: number
  ytd_anterior_usd?: number
  variacion_ytd_usd_pct?: number | null
} {
  if (monthStart > monthEnd) {
    throw new Error(`monthEnd (${monthEnd}) < monthStart (${monthStart})`)
  }

  const year = fechaReferencia.getFullYear()
  const rangeActual = buildMonthlyRange({ year, monthStart, monthEnd }, fechaReferencia)
  const rangeAnterior = buildComparisonRangeYoY(rangeActual)

  const salesActual   = sales.filter((s) => s.fecha >= rangeActual.start && s.fecha <= rangeActual.end)
  const salesAnterior = sales.filter((s) => s.fecha >= rangeAnterior.start && s.fecha <= rangeAnterior.end)

  const ytd_actual_uds   = salesActual.reduce((a, s) => a + s.unidades, 0)
  const ytd_anterior_uds = salesAnterior.reduce((a, s) => a + s.unidades, 0)

  const variacion_ytd_uds_pct = ytd_anterior_uds > 0 ? safePct(ytd_actual_uds, ytd_anterior_uds) : null

  const hasNetoActual   = salesActual.some((s) => s.venta_neta != null && s.venta_neta > 0)
  const hasNetoAnterior = salesAnterior.some((s) => s.venta_neta != null && s.venta_neta > 0)
  const ytd_actual_usd   = hasNetoActual   ? salesActual.reduce((a, s) => a + (s.venta_neta ?? 0), 0)   : undefined
  const ytd_anterior_usd = hasNetoAnterior ? salesAnterior.reduce((a, s) => a + (s.venta_neta ?? 0), 0) : undefined
  const variacion_ytd_usd_pct =
    ytd_actual_usd != null && ytd_anterior_usd != null && ytd_anterior_usd > 0
      ? safePct(ytd_actual_usd, ytd_anterior_usd)
      : null

  return {
    ytd_actual_uds,
    ytd_anterior_uds,
    variacion_ytd_uds_pct,
    ytd_actual_usd,
    ytd_anterior_usd,
    variacion_ytd_usd_pct,
  }
}

/**
 * [Ticket 3.A] Wrapper legacy: rango YTD = (0, mes de fechaRef).
 * Preservado para compat de los 2 call sites internos (analyzeVendor, analyze
 * team). Migrar a computeRangeYoY con rango del store en Ticket 3.B.
 *
 * Bit-exact equivalente a la implementación pre-3.A:
 * buildMonthlyRange({year, 0, fechaRef.getMonth()}, fechaRef) cuando fechaRef
 * cae dentro del rango calendario produce el mismo {start: 1-ene, end: endOfDay(fechaRef)}
 * que buildDefaultYtdRange(fechaRef) — verificado analíticamente.
 */
function computeYTD(sales: SaleRecord[], fechaReferencia: Date) {
  return computeRangeYoY(sales, fechaReferencia, 0, fechaReferencia.getMonth())
}

// Accepts pre-grouped vendor sales (only this vendor's records)
function analyzeVendor(
  vendedor: string,
  vendorSales: SaleRecord[],
  metas: MetaRecord[],
  selectedPeriod: { year: number; month: number },
  diasTranscurridos: number,
  diasTotales: number,
  diasRestantes: number,
  fechaReferencia: Date,
  periodStart: Date,
  periodEnd: Date,
  prevStart: Date,
  prevEnd: Date,
  has_cliente: boolean,
  has_producto: boolean,
  has_canal: boolean,
  tipoMetaActivo?: 'uds' | 'usd',
): VendorAnalysis {
  const { year, month } = selectedPeriod

  const periodSalesAll = vendorSales.filter((s) => s.fecha >= periodStart && s.fecha <= periodEnd)
  const prevSales = vendorSales.filter((s) => s.fecha >= prevStart && s.fecha <= prevEnd)

  // Meta del período (multi-dimensional) — get both values + dimension filters
  const metaRecord = getMetaRecordMultiDim(metas, { mes: month + 1, anio: year, vendedor })
  const meta_uds_val = metaRecord?.meta_uds ?? metaRecord?.meta ?? null
  const meta_usd_val = metaRecord?.meta_usd ?? null

  // Dimension filter: if meta specifies canal/departamento/producto, only count matching sales
  const hasDimFilter = !!(metaRecord?.canal || metaRecord?.departamento || metaRecord?.producto)
  const dimFilter = (s: SaleRecord) => {
    if (metaRecord?.canal && s.canal !== metaRecord.canal) return false
    if (metaRecord?.departamento && s.departamento !== metaRecord.departamento) return false
    if (metaRecord?.producto && s.producto !== metaRecord.producto) return false
    return true
  }
  const periodSales = hasDimFilter ? periodSalesAll.filter(dimFilter) : periodSalesAll

  // Always compute both metrics (filtered by meta dimensions)
  const unidades_periodo = periodSales.reduce((a, s) => a + s.unidades, 0)
  const ventas_neta_periodo = periodSales.reduce((a, s) => a + (s.venta_neta ?? 0), 0)
  // ventas_mes_anterior uses ALL vendor sales (no dimension filter)
  const ventas_mes_anterior = prevSales.reduce((a, s) => a + s.unidades, 0)

  // ventas_periodo = the "active" metric based on tipoMetaActivo
  const ventas_periodo = tipoMetaActivo === 'usd' ? ventas_neta_periodo : unidades_periodo
  // variacion_pct uses unfiltered period sales for fair comparison
  const unidades_periodo_all = hasDimFilter ? periodSalesAll.reduce((a, s) => a + s.unidades, 0) : unidades_periodo
  const variacion_pct = ventas_mes_anterior > 0 ? safePct(unidades_periodo_all, ventas_mes_anterior) : null

  const promedioN = promedioUltimosN(vendorSales, year, month, 3)
  // Adjust pm3 to same day-range when comparing against partial month
  const pm3Adjusted = diasTranscurridos < diasTotales && promedioN.promedio > 0
    ? promedioN.promedio * diasTranscurridos / diasTotales
    : promedioN.promedio
  const variacion_vs_promedio_pct = pm3Adjusted > 0
    ? Math.round(safePct(unidades_periodo_all, pm3Adjusted))
    : null

  // Projection uses the active metric (filtered)
  const ritmo_diario = ventas_periodo / Math.max(1, diasTranscurridos)
  const proyeccion_cierre = Math.round(ritmo_diario * diasTotales)
  // Active meta based on tipoMetaActivo
  const metaVal = tipoMetaActivo === 'usd' ? meta_usd_val : meta_uds_val
  const meta = metaVal ?? undefined
  const cumplimiento_pct = meta ? (ventas_periodo / meta) * 100 : undefined
  const ritmo_necesario =
    meta && diasRestantes > 0
      ? Math.max(0, (meta - ventas_periodo) / diasRestantes)
      : undefined

  // Ticket promedio (solo si hay venta_neta) — uses ALL sales, not filtered
  const hasVentaNeta = periodSalesAll.some((s) => s.venta_neta != null)
  const ventaNeta = periodSalesAll.reduce((a, s) => a + (s.venta_neta ?? 0), 0)
  const ticket_promedio =
    hasVentaNeta && periodSalesAll.length > 0
      ? ventaNeta / periodSalesAll.length
      : undefined

  // Clientes activos (solo si hay cliente) — uses ALL sales
  const hasCliente = periodSalesAll.some((s) => s.cliente != null)
  const clientes_activos = hasCliente
    ? new Set(periodSalesAll.map((s) => s.cliente).filter(Boolean)).size
    : undefined

  // Semanas en racha negativa (works on vendor's own sales subset)
  const { semanas: semanas_bajo_promedio, promedioSemanal } = calcSemanasRachaFast(
    vendorSales,
    year,
    month
  )

  // YTD (necesario para clasificación de riesgo sin meta)
  const ytd = computeYTD(vendorSales, fechaReferencia)

  // Clasificación de riesgo
  let riesgo: RiesgoVendedor = 'ok'
  if (meta) {
    if (proyeccion_cierre < meta * 0.7) riesgo = 'critico'
    else if (proyeccion_cierre < meta * 0.9) riesgo = 'riesgo'
    else if (proyeccion_cierre > meta * 1.05) riesgo = 'superando'
  } else {
    const variacion_vs_anio = ytd.ytd_anterior_uds > 0
      ? ((ytd.ytd_actual_uds - ytd.ytd_anterior_uds) / ytd.ytd_anterior_uds) * 100
      : null
    if (variacion_vs_anio !== null) {
      if (variacion_vs_anio < -20) riesgo = 'critico'
      else if (variacion_vs_anio < -10) riesgo = 'riesgo'
      else if (variacion_vs_anio > 10) riesgo = 'superando'
    }
  }

  // ── Top clientes del período ──
  let top_clientes_periodo: VendorAnalysis['top_clientes_periodo'] = null
  if (has_cliente) {
    const clienteMap = new Map<string, { unidades: number; venta_neta: number }>()
    for (const s of periodSalesAll) {
      if (!s.cliente) continue
      const acc = clienteMap.get(s.cliente) ?? { unidades: 0, venta_neta: 0 }
      acc.unidades += s.unidades
      acc.venta_neta += s.venta_neta ?? 0
      clienteMap.set(s.cliente, acc)
    }
    top_clientes_periodo = [...clienteMap.entries()]
      .map(([cliente, { unidades, venta_neta }]) => ({
        cliente,
        unidades,
        venta_neta: venta_neta > 0 ? venta_neta : null,
      }))
      .sort((a, b) => b.unidades - a.unidades)
      .slice(0, 3)
  }

  // ── Productos ausentes (vendidos en PM3 pero no en período actual) ──
  let productos_ausentes: VendorAnalysis['productos_ausentes'] = null
  if (has_producto) {
    const productosActuales = new Set<string>()
    for (const s of periodSalesAll) {
      if (s.producto) productosActuales.add(s.producto)
    }
    let pm3Y = year, pm3M = month - 3
    while (pm3M < 0) { pm3Y--; pm3M += 12 }
    const pm3Start = new Date(pm3Y, pm3M, 1)
    const lastSaleByProduct = new Map<string, Date>()
    for (const s of vendorSales) {
      if (!s.producto || productosActuales.has(s.producto)) continue
      if (s.fecha < pm3Start || s.fecha >= periodStart) continue
      const prev = lastSaleByProduct.get(s.producto)
      if (!prev || s.fecha > prev) lastSaleByProduct.set(s.producto, s.fecha)
    }
    productos_ausentes = [...lastSaleByProduct.entries()]
      .map(([producto, fecha]) => ({
        producto,
        dias_sin_venta: Math.floor((fechaReferencia.getTime() - fecha.getTime()) / 86_400_000),
        ultimo_periodo: periodKey(fecha.getFullYear(), fecha.getMonth()),
      }))
      .sort((a, b) => b.dias_sin_venta - a.dias_sin_venta)
  }

  // ── Canal principal (historial completo) ──
  let canal_principal: string | null = null
  if (has_canal) {
    const canalCount = new Map<string, number>()
    for (const s of vendorSales) {
      if (s.canal) canalCount.set(s.canal, (canalCount.get(s.canal) ?? 0) + 1)
    }
    if (canalCount.size > 0) {
      canal_principal = [...canalCount.entries()].sort((a, b) => b[1] - a[1])[0][0]
    }
  }

  return {
    vendedor,
    ventas_periodo: ventas_neta_periodo,   // always USD
    unidades_periodo,                       // always units
    meta_uds: meta_uds_val,
    meta_usd: meta_usd_val,
    ventas_mes_anterior,
    variacion_pct,
    meta,
    cumplimiento_pct,
    proyeccion_cierre,
    ritmo_diario,
    ritmo_necesario,
    ticket_promedio,
    clientes_activos,
    semanas_bajo_promedio,
    promedio_semanal_historico: promedioSemanal > 0 ? promedioSemanal : undefined,
    promedio_3m: promedioN.promedio,
    variacion_vs_promedio_pct,
    periodos_base_promedio: promedioN.periodos_con_datos,
    riesgo,
    ...ytd,
    top_clientes_periodo,
    productos_ausentes,
    canal_principal,
    filtro_meta: metaRecord && hasDimFilter ? {
      canal: metaRecord.canal ?? null,
      departamento: metaRecord.departamento ?? null,
      producto: metaRecord.producto ?? null,
    } : null,
    productos_lentos_con_historial: null, // enriched in computeCommercialAnalysis
  }
}

// ─── FRECUENCIA ESPERADA DE COMPRA ────────────────────────────────────────────

function calcFrecuenciaEsperada(sortedAsc: SaleRecord[]): number | null {
  if (sortedAsc.length < 3) return null

  // Detect predominant canal
  const canalCount: Record<string, number> = {}
  for (const r of sortedAsc) {
    if (r.canal) canalCount[r.canal] = (canalCount[r.canal] ?? 0) + 1
  }

  if (Object.keys(canalCount).length > 0) {
    const predominant = Object.entries(canalCount).sort(([, a], [, b]) => b - a)[0][0]
    const canalRecs = sortedAsc.filter((r) => r.canal === predominant)
    if (canalRecs.length >= 3) {
      const diffs: number[] = []
      for (let i = 1; i < canalRecs.length; i++) {
        const diff = (canalRecs[i].fecha.getTime() - canalRecs[i - 1].fecha.getTime()) / 86400000
        if (diff > 0) diffs.push(diff)
      }
      if (diffs.length > 0) return diffs.reduce((a, b) => a + b, 0) / diffs.length
    }
  }

  // Fallback: all history (>= 3 already checked)
  const diffs: number[] = []
  for (let i = 1; i < sortedAsc.length; i++) {
    const diff = (sortedAsc[i].fecha.getTime() - sortedAsc[i - 1].fecha.getTime()) / 86400000
    if (diff > 0) diffs.push(diff)
  }
  return diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : null
}

// ─── CLIENTES DORMIDOS ────────────────────────────────────────────────────────

function computeClientesDormidos(
  sales: SaleRecord[],
  threshold: number,
  selectedPeriod: { year: number; month: number },
  byClient?: Map<string, SaleRecord[]>,
): ClienteDormido[] {
  // BUG-FIX (Ticket 2.2-A): si no hay sales, retornar lista vacía en vez de
  // inventar "hoy" desde el browser. La función no tiene base para calcular
  // "días sin comprar" sin datos.
  if (sales.length === 0) return []
  // safe: sales.length > 0 (early return arriba) garantiza que getFechaReferencia
  // no retorna null. Ticket 2.2-C: cálculo centralizado en lib/periods.ts.
  const today = getFechaReferencia(sales)!

  const clientMap = byClient ?? (() => {
    const m = new Map<string, SaleRecord[]>()
    for (const s of sales) {
      if (!s.cliente) continue
      appendToMap(m, s.cliente, s)
    }
    return m
  })()

  // YoY reference window: same month of previous year (R53/R58)
  const yoyYear = selectedPeriod.year - 1
  const yoyMonth = selectedPeriod.month

  type DormidoRaw = {
    cliente: string; vendedor: string; ultima_compra: Date; dias_sin_actividad: number
    valor_yoy_usd: number; transacciones_yoy: number; _compras_total: number
    frecuencia_promedio: number; frecuencia_esperada: number | null; threshold_efectivo: number
    meses_distintos: number; meses_historial: number
  }
  const candidates: DormidoRaw[] = []

  for (const [cliente, records] of clientMap.entries()) {
    // Sort ONCE ascending — ultima_compra = last element
    const sortedAsc = [...records].sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
    const ultima_compra = sortedAsc[sortedAsc.length - 1].fecha
    const dias_sin_actividad = Math.floor((today.getTime() - ultima_compra.getTime()) / 86400000)
    if (dias_sin_actividad <= 0) continue

    // Dynamic threshold per client
    const frecuencia_esperada = calcFrecuenciaEsperada(sortedAsc)
    const threshold_efectivo = frecuencia_esperada !== null
      ? Math.round(frecuencia_esperada * 1.5)
      : threshold

    if (dias_sin_actividad <= threshold_efectivo) continue

    const vendedorCount: Record<string, number> = {}
    for (const r of records) {
      vendedorCount[r.vendedor] = (vendedorCount[r.vendedor] ?? 0) + 1
    }
    const vendedor = Object.entries(vendedorCount).sort(([, a], [, b]) => b - a)[0][0]

    // valor_yoy_usd: what the client bought in the same month of previous year (R58)
    const yoyRecords = records.filter(r => r.fecha.getFullYear() === yoyYear && r.fecha.getMonth() === yoyMonth)
    const valor_yoy_usd = yoyRecords.reduce((a, s) => a + (s.venta_neta ?? s.unidades), 0)
    const transacciones_yoy = yoyRecords.length

    let frecuencia_promedio = 0
    if (sortedAsc.length >= 2) {
      const diffs: number[] = []
      for (let i = 1; i < sortedAsc.length; i++) {
        const diff = (sortedAsc[i].fecha.getTime() - sortedAsc[i - 1].fecha.getTime()) / 86400000
        if (diff > 0) diffs.push(diff)
      }
      frecuencia_promedio = diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0
    }

    const meses_distintos = new Set(
      records.map(r => `${r.fecha.getFullYear()}-${r.fecha.getMonth()}`)
    ).size
    const meses_historial = Math.max(1, Math.round(
      (today.getTime() - sortedAsc[0].fecha.getTime()) / (30.5 * 86400000)
    ))

    candidates.push({
      cliente, vendedor, ultima_compra, dias_sin_actividad,
      valor_yoy_usd, transacciones_yoy, _compras_total: records.length,
      frecuencia_promedio, frecuencia_esperada, threshold_efectivo,
      meses_distintos, meses_historial,
    })
  }

  if (candidates.length === 0) return []

  const maxValor = Math.max(...candidates.map(c => c.valor_yoy_usd), 1)

  const dormidos: ClienteDormido[] = candidates.map(c => {
    const frecuencia_score = c.frecuencia_promedio === 0 || c._compras_total < 2
      ? 0.3
      : Math.max(0, 1 - (c.dias_sin_actividad / (c.frecuencia_promedio * 3)))
    const valor_score = maxValor > 0 ? c.valor_yoy_usd / maxValor : 0
    // recencia_score uses dynamic threshold instead of fixed 180
    const recencia_score = Math.max(0, 1 - (c.dias_sin_actividad / (c.threshold_efectivo * 2)))
    const estabilidad_score = Math.min(1, c.meses_distintos / c.meses_historial)

    const raw = (frecuencia_score * 35) + (valor_score * 25) + (recencia_score * 20) + (estabilidad_score * 20)
    const recovery_score = Math.min(100, Math.max(0, Math.round(raw)))

    const recovery_label: ClienteDormido['recovery_label'] =
      recovery_score >= 80 ? 'alta'
      : recovery_score >= 60 ? 'recuperable'
      : recovery_score >= 40 ? 'dificil'
      : 'perdido'

    let recovery_explicacion: string
    if (c.frecuencia_promedio >= 2 && c._compras_total >= 2) {
      recovery_explicacion = `Compraba cada ${Math.round(c.frecuencia_promedio)} días, lleva ${c.dias_sin_actividad} sin comprar`
    } else if (c.meses_distintos >= 3) {
      recovery_explicacion = `Activo ${c.meses_distintos} de ${c.meses_historial} meses, ${c.dias_sin_actividad} días inactivo`
    } else {
      recovery_explicacion = `Historial limitado, ${c.dias_sin_actividad} días sin actividad`
    }
    if (recovery_explicacion.length > 60) recovery_explicacion = recovery_explicacion.slice(0, 57) + '...'

    return {
      cliente: c.cliente, vendedor: c.vendedor, ultima_compra: c.ultima_compra,
      dias_sin_actividad: c.dias_sin_actividad, valor_yoy_usd: c.valor_yoy_usd,
      transacciones_yoy: c.transacciones_yoy, recovery_score, recovery_label, recovery_explicacion,
      frecuencia_esperada_dias: c.frecuencia_esperada !== null ? Math.round(c.frecuencia_esperada) : null,
      threshold_usado: c.threshold_efectivo,
    }
  })

  const maxValorD = Math.max(...dormidos.map(c => c.valor_yoy_usd), 1)

  const scored = dormidos.map(c => ({
    ...c,
    _priority_score:
      (c.valor_yoy_usd / maxValorD) * 0.6 +
      (c.recovery_score / 100) * 0.4
  }))

  scored.sort((a, b) => b._priority_score - a._priority_score)

  return scored.map(({ _priority_score, ...rest }) => rest)
}

// ─── CONCENTRACIÓN DE RIESGO ──────────────────────────────────────────────────

function computeConcentracion(
  sales: SaleRecord[],
  year: number,
  month: number,
  index?: SaleIndex,
): ConcentracionRiesgo[] {
  const periodSales = index ? getSalesByPeriod(index, year, month) : salesInPeriod(sales, year, month)
  const totalVentas = periodSales.reduce((a, s) => a + s.unidades, 0)
  if (totalVentas === 0) return []

  const byCliente: Record<string, { ventas: number; vendedores: Set<string> }> = {}
  periodSales.forEach((s) => {
    if (!s.cliente) return
    if (!byCliente[s.cliente]) byCliente[s.cliente] = { ventas: 0, vendedores: new Set() }
    byCliente[s.cliente].ventas += s.unidades
    byCliente[s.cliente].vendedores.add(s.vendedor)
  })

  return Object.entries(byCliente)
    .map(([cliente, { ventas, vendedores }]) => ({
      cliente,
      pct_del_total: (ventas / totalVentas) * 100,
      vendedores_involucrados: Array.from(vendedores),
      ventas_absolutas: ventas,
    }))
    .sort((a, b) => b.pct_del_total - a.pct_del_total)
    .slice(0, 10)
}

// ─── FUNCIÓN PRINCIPAL ────────────────────────────────────────────────────────

export interface CommercialAnalysisResult {
  vendorAnalysis: VendorAnalysis[]
  teamStats: TeamStats
  clientesDormidos: ClienteDormido[]
  concentracionRiesgo: ConcentracionRiesgo[]
}

export function computeCommercialAnalysis(
  sales: SaleRecord[],
  metas: MetaRecord[],
  inventory: InventoryItem[],
  selectedPeriod: { year: number; month: number },
  config: Configuracion,
  index?: SaleIndex,
  tipoMetaActivo?: 'uds' | 'usd',
): CommercialAnalysisResult {
  const { year, month } = selectedPeriod

  const idx = index ?? buildSaleIndex(sales)

  // BUG-FIX (Ticket 2.2-A): si idx.fechaReferencia es epoch sentinel (sales vacío),
  // retornar resultado vacío en vez de calcular contra "hoy" del browser.
  if (idx.fechaReferencia.getTime() === 0) {
    return {
      vendorAnalysis: [],
      teamStats: {
        total_ventas: 0,
        total_unidades: 0,
        variacion_pct: null,
        mejor_vendedor: '',
        clientes_dormidos_count: 0,
        productos_sin_movimiento_count: 0,
        riesgos_concentracion_count: 0,
        dias_transcurridos: 0,
        dias_totales: 0,
        dias_restantes: 0,
      },
      clientesDormidos: [],
      concentracionRiesgo: [],
    }
  }
  const fechaReferencia = idx.fechaReferencia

  // Determinar si el período seleccionado es el mes con la última fecha de datos
  const isCurrentMonth =
    fechaReferencia.getFullYear() === year && fechaReferencia.getMonth() === month

  const diasTotales = getDaysInMonth(year, month)
  const diasTranscurridos = isCurrentMonth ? fechaReferencia.getDate() : diasTotales
  const diasRestantes = Math.max(0, diasTotales - diasTranscurridos)

  // MTD YoY: compare same month previous year, same day range
  // Ticket 2.2-C: rangos centralizados en lib/periods.ts. buildMonthlyRange con
  // monthStart === monthEnd === month devuelve [1-mes, endOfDay(fechaRef)] si el
  // mes contiene fechaRef, o mes calendario completo si no.
  const prevYoY = { year: year - 1, month }
  const periodRange = buildMonthlyRange(
    { year, monthStart: month, monthEnd: month },
    fechaReferencia,
  )
  const prevRange = buildComparisonRangeYoY(periodRange)
  const periodStart = periodRange.start
  const periodEnd = periodRange.end
  const prevStart = prevRange.start
  const prevEnd = prevRange.end

  const vendedores = Array.from(idx.byVendor.keys())
  const vendorAnalysis = vendedores.map((v) =>
    analyzeVendor(
      v, idx.byVendor.get(v)!, metas, selectedPeriod,
      diasTranscurridos, diasTotales, diasRestantes, fechaReferencia,
      periodStart, periodEnd, prevStart, prevEnd,
      idx.has_cliente, idx.has_producto, idx.has_canal,
      tipoMetaActivo,
    )
  )

  // ── Enriquecer productos_lentos_con_historial ──
  if (inventory.length > 0 && idx.has_producto) {
    const pm3Inv: Record<string, number> = {}
    for (let i = 1; i <= 3; i++) {
      let y = year, m = month - i
      while (m < 0) { y--; m += 12 }
      getSalesByPeriod(idx, y, m).forEach((s) => {
        if (s.producto) pm3Inv[s.producto] = (pm3Inv[s.producto] ?? 0) + s.unidades
      })
    }
    Object.keys(pm3Inv).forEach((p) => { pm3Inv[p] = pm3Inv[p] / 3 })

    const lentos = inventory.filter((item) => {
      const pm3 = pm3Inv[item.producto] ?? 0
      if (pm3 === 0) return true
      return Math.round((item.unidades / pm3) * 30) > config.umbral_normal
    })

    if (lentos.length > 0) {
      for (const va of vendorAnalysis) {
        const vSales = idx.byVendor.get(va.vendedor) ?? []
        const lastSale = new Map<string, Date>()
        for (const s of vSales) {
          if (!s.producto) continue
          const prev = lastSale.get(s.producto)
          if (!prev || s.fecha > prev) lastSale.set(s.producto, s.fecha)
        }
        const enriched = lentos
          .filter((item) => lastSale.has(item.producto))
          .map((item) => {
            const lastDate = lastSale.get(item.producto)!
            const pm3 = pm3Inv[item.producto] ?? 0
            return {
              producto: item.producto,
              clasificacion_inventario: pm3 === 0 ? 'sin_movimiento' : 'lento_movimiento',
              vendedor_vendio_antes: true,
              dias_sin_vender: Math.floor((fechaReferencia.getTime() - lastDate.getTime()) / 86_400_000),
            }
          })
          .sort((a, b) => b.dias_sin_vender - a.dias_sin_vender)
          .slice(0, 3)
        if (enriched.length > 0) va.productos_lentos_con_historial = enriched
      }
    }
  }

  const periodSales = getSalesByPeriod(idx, year, month)
  const prevSalesAll = getSalesByPeriod(idx, prevYoY.year, prevYoY.month)
  const prevSales = isCurrentMonth ? filterSalesByDayRange(prevSalesAll, diasTranscurridos) : prevSalesAll
  const total_unidades = periodSales.reduce((a, s) => a + s.unidades, 0)
  const total_ventas = periodSales.reduce((a, s) => a + (s.venta_neta ?? 0), 0)
  const prevTotal = prevSales.reduce((a, s) => a + s.unidades, 0)
  const variacion_pct = prevTotal > 0 ? safePct(total_unidades, prevTotal) : null

  const metasDelPeriodo = metas.filter((m) => m.mes === month + 1 && m.anio === year)
  const getMetaVal = (m: MetaRecord) => tipoMetaActivo === 'usd' ? (m.meta_usd ?? 0) : (m.meta_uds ?? m.meta ?? 0)
  // Only sum vendedor-level metas (exclude supervisor/categoria metas)
  const vendedorMetas = metasDelPeriodo.filter((m) => m.vendedor && !m.supervisor && !m.categoria)
  const meta_equipo =
    vendedorMetas.length > 0
      ? vendedorMetas.reduce((a, m) => a + getMetaVal(m), 0)
      : undefined
  const meta_equipo_total: number | null =
    vendedorMetas.length > 0 ? vendedorMetas.reduce((a, m) => a + getMetaVal(m), 0) : null

  const proyeccion_equipo = vendorAnalysis.reduce(
    (a, v) => a + (v.proyeccion_cierre ?? 0),
    0
  )
  const cumplimiento_equipo = meta_equipo
    ? (proyeccion_equipo / meta_equipo) * 100
    : undefined

  const sorted = [...vendorAnalysis].sort((a, b) => b.ventas_periodo - a.ventas_periodo)
  const mejor_vendedor = sorted[0]?.vendedor ?? ''

  const vendedor_critico = vendorAnalysis
    .filter((v) => v.riesgo === 'critico')
    .sort((a, b) => {
      const bA = a.meta ? a.meta - (a.proyeccion_cierre ?? 0) : -(a.variacion_pct ?? 0)
      const bB = b.meta ? b.meta - (b.proyeccion_cierre ?? 0) : -(b.variacion_pct ?? 0)
      return bB - bA
    })[0]?.vendedor

  const hasCliente = idx.byClient.size > 0
  const clientesDormidos = hasCliente
    ? computeClientesDormidos(sales, config.dias_dormido_threshold, selectedPeriod, idx.byClient)
    : []

  const concentracionRiesgo = hasCliente
    ? computeConcentracion(sales, year, month, idx)
    : []

  let acum = 0
  let riesgos_concentracion_count = 0
  for (const c of concentracionRiesgo) {
    acum += c.pct_del_total
    riesgos_concentracion_count++
    if (acum >= config.pct_concentracion_threshold) break
  }
  if (concentracionRiesgo.length === 0) riesgos_concentracion_count = 0

  const hasProducto = idx.byProduct.size > 0
  let productos_sin_movimiento_count = 0
  if (hasProducto && inventory.length > 0) {
    const last15 = new Date(fechaReferencia.getTime() - 15 * 86400000)
    const recentProducts = new Set(
      periodSales.filter(s => s.producto).map(s => s.producto)
    )
    // also include last 15 days across all periods
    for (const [prod, recs] of idx.byProduct.entries()) {
      if (recs.some(s => s.fecha >= last15)) recentProducts.add(prod)
    }
    productos_sin_movimiento_count = inventory.filter(
      (i) => !recentProducts.has(i.producto)
    ).length
  }

  // --- Metas de meses cerrados (enero hasta mes anterior al actual) ---
  const getMetaVal2 = (m: MetaRecord) => tipoMetaActivo === 'usd' ? (m.meta_usd ?? 0) : (m.meta_uds ?? m.meta ?? 0)
  let metaCerradaTotal = 0
  let ventaCerradaTotal = 0
  const mesesCerradosArr: number[] = []

  for (let mesIdx = 0; mesIdx < month; mesIdx++) {
    const metasMes = metas.filter((m) => m.mes === mesIdx + 1 && m.anio === year && m.vendedor && !m.supervisor && !m.categoria)
    const metaMes = metasMes.reduce((a, m) => a + getMetaVal2(m), 0)
    if (metaMes === 0) continue

    let ventaMesUds = 0
    let ventaMesNeta = 0
    for (const s of sales) {
      if (s.fecha.getFullYear() === year && s.fecha.getMonth() === mesIdx) {
        ventaMesUds += s.unidades
        ventaMesNeta += s.venta_neta ?? 0
      }
    }

    metaCerradaTotal += metaMes
    ventaCerradaTotal += tipoMetaActivo === 'usd' ? ventaMesNeta : ventaMesUds
    mesesCerradosArr.push(mesIdx + 1)
  }

  const cumplimientoCerrado = metaCerradaTotal > 0 ? (ventaCerradaTotal / metaCerradaTotal) * 100 : 0

  const teamStats: TeamStats = {
    total_ventas,
    total_unidades,
    variacion_pct,
    meta_equipo,
    meta_equipo_total,
    cumplimiento_equipo,
    proyeccion_equipo,
    mejor_vendedor,
    vendedor_critico,
    clientes_dormidos_count: clientesDormidos.length,
    productos_sin_movimiento_count,
    riesgos_concentracion_count,
    dias_transcurridos: diasTranscurridos,
    dias_totales: diasTotales,
    dias_restantes: diasRestantes,
    ...(() => {
      const { ytd_actual_uds, ytd_anterior_uds, variacion_ytd_uds_pct } = computeYTD(sales, fechaReferencia)
      return {
        ytd_actual_equipo_uds: ytd_actual_uds,
        ytd_anterior_equipo_uds: ytd_anterior_uds,
        variacion_ytd_equipo_uds_pct: variacion_ytd_uds_pct,
      }
    })(),
    ...(metaCerradaTotal > 0 ? {
      meta_cerrada_total: metaCerradaTotal,
      venta_cerrada_total: ventaCerradaTotal,
      cumplimiento_cerrado: cumplimientoCerrado,
      meses_cerrados: mesesCerradosArr,
    } : {}),
  }

  return { vendorAnalysis, teamStats, clientesDormidos, concentracionRiesgo }
}

// ─── HELPERS PARA INSIGHTS ────────────────────────────────────────────────────

export function getVentasPorClienteEnPeriodo(
  sales: SaleRecord[],
  year: number,
  month: number,
  index?: SaleIndex,
): Record<string, number> {
  const result: Record<string, number> = {}
  const periodSales = index ? getSalesByPeriod(index, year, month) : salesInPeriod(sales, year, month)
  periodSales.forEach((s) => {
    if (!s.cliente) return
    result[s.cliente] = (result[s.cliente] ?? 0) + s.unidades
  })
  return result
}

export function getVentasPorProductoEnPeriodo(
  sales: SaleRecord[],
  year: number,
  month: number,
  index?: SaleIndex,
): Record<string, number> {
  const result: Record<string, number> = {}
  const periodSales = index ? getSalesByPeriod(index, year, month) : salesInPeriod(sales, year, month)
  periodSales.forEach((s) => {
    if (!s.producto) return
    result[s.producto] = (result[s.producto] ?? 0) + s.unidades
  })
  return result
}

export function getVentasVendedorPorCliente(
  sales: SaleRecord[],
  vendedor: string,
  year: number,
  month: number,
  index?: SaleIndex,
): Record<string, number> {
  const result: Record<string, number> = {}
  const periodSales = index ? getSalesByPeriod(index, year, month) : salesInPeriod(sales, year, month)
  periodSales
    .filter((s) => s.vendedor === vendedor)
    .forEach((s) => {
      if (!s.cliente) return
      result[s.cliente] = (result[s.cliente] ?? 0) + s.unidades
    })
  return result
}

export function getMejoresPeriodosVendedor(
  sales: SaleRecord[],
  vendedor: string,
  year: number,
  month: number,
  n = 6,
  index?: SaleIndex,
): number[] {
  const idx = index ?? buildSaleIndex(sales)
  const results: number[] = []
  for (let i = 1; i <= n; i++) {
    let y = year
    let m = month - i
    while (m < 0) { y--; m += 12 }
    const total = getSalesByPeriod(idx, y, m)
      .filter((s) => s.vendedor === vendedor)
      .reduce((a, s) => a + s.unidades, 0)
    results.push(total)
  }
  return results
}

export function getVentasClientePorPeriodo(
  sales: SaleRecord[],
  cliente: string,
  index?: SaleIndex,
): Record<string, number> {
  const result: Record<string, number> = {}
  const records = index ? (index.byClient.get(cliente) ?? []) : sales.filter((s) => s.cliente === cliente)
  records.forEach((s) => {
    const k = periodKey(s.fecha.getFullYear(), s.fecha.getMonth())
    result[k] = (result[k] ?? 0) + s.unidades
  })
  return result
}

// ─── CATEGORÍAS DE INVENTARIO ─────────────────────────────────────────────────

export function computeCategoriasInventario(
  sales: SaleRecord[],
  inventory: InventoryItem[],
  selectedPeriod: { year: number; month: number },
  config: Configuracion,
  index?: SaleIndex,
): CategoriaInventario[] {
  const { year, month } = selectedPeriod
  const idx = index ?? buildSaleIndex(sales)

  // PM3: 3 meses cerrados usando índice
  const pm3Map: Record<string, number> = {}
  for (let i = 1; i <= 3; i++) {
    let y = year
    let m = month - i
    while (m < 0) { y--; m += 12 }
    getSalesByPeriod(idx, y, m).forEach((s) => {
      if (!s.producto) return
      pm3Map[s.producto] = (pm3Map[s.producto] ?? 0) + s.unidades
    })
  }
  Object.keys(pm3Map).forEach((p) => { pm3Map[p] = pm3Map[p] / 3 })

  // Último movimiento usando índice byProduct
  const ultimoMovMap: Record<string, Date> = {}
  for (const [prod, recs] of idx.byProduct.entries()) {
    for (const s of recs) {
      if (!ultimoMovMap[prod] || s.fecha > ultimoMovMap[prod]) {
        ultimoMovMap[prod] = s.fecha
      }
    }
  }

  return inventory.map((item) => {
    const pm3 = pm3Map[item.producto] ?? 0
    const dias_inventario = pm3 > 0 ? Math.round((item.unidades / pm3) * 30) : Infinity

    let clasificacion: ClasificacionInventario
    if (pm3 === 0) {
      if (!ultimoMovMap[item.producto]) {
        clasificacion = 'sin_movimiento'
      } else {
        const daysSinceLastSale = Math.floor(
          (idx.fechaReferencia.getTime() - ultimoMovMap[item.producto].getTime()) / (1000 * 60 * 60 * 24)
        )
        clasificacion = daysSinceLastSale > 120 ? 'sin_movimiento' : 'lento_movimiento'
      }
    } else if (dias_inventario <= config.umbral_riesgo_quiebre) {
      clasificacion = 'riesgo_quiebre'
    } else if (dias_inventario <= config.umbral_baja_cobertura) {
      clasificacion = 'baja_cobertura'
    } else if (dias_inventario <= config.umbral_normal) {
      clasificacion = 'normal'
    } else {
      clasificacion = 'lento_movimiento'
    }

    return {
      producto: item.producto,
      categoria: item.categoria ?? 'Sin categoría',
      unidades_actuales: item.unidades,
      pm3,
      dias_inventario: isFinite(dias_inventario) ? dias_inventario : 9999,
      clasificacion,
      ultimo_movimiento: ultimoMovMap[item.producto],
    }
  })
}

// ─── MÓDULO SUPERVISOR ────────────────────────────────────────────────────────

export function analyzeSupervisor(
  vendorAnalysis: VendorAnalysis[],
  metas: MetaRecord[],
  selectedPeriod: { year: number; month: number },
  index: SaleIndex,
): SupervisorAnalysis[] {
  const { year, month } = selectedPeriod
  const fr = index.fechaReferencia

  // Ticket 2.2-C: rangos centralizados en lib/periods.ts.
  // YTD: año en curso vs año anterior (truncado al día por buildDefaultYtdRange).
  const ytdActualRange = buildDefaultYtdRange(fr)
  const ytdAnteriorRange = buildComparisonRangeYoY(ytdActualRange)
  // MTD: mes seleccionado vs mismo mes año anterior. buildMonthlyRange trunca
  // si el mes contiene fr; buildComparisonRangeYoY clampea 29-feb cross-year.
  // El Math.min defensivo del Commit 2.2-B queda implícito en la primitiva.
  const periodRange = buildMonthlyRange(
    { year, monthStart: month, monthEnd: month },
    fr,
  )
  const prevYearRange = buildComparisonRangeYoY(periodRange)

  const startYTDActual = ytdActualRange.start
  const startYTDAnterior = ytdAnteriorRange.start
  const endYTDAnterior = ytdAnteriorRange.end
  const prevYearStart = prevYearRange.start
  const prevYearEnd = prevYearRange.end

  // Predominant supervisor per vendor
  const supervisorByVendor: Record<string, string> = {}
  for (const [vendedor, records] of index.byVendor.entries()) {
    const count: Record<string, number> = {}
    for (const r of records) {
      if (r.supervisor) count[r.supervisor] = (count[r.supervisor] ?? 0) + 1
    }
    const top = Object.entries(count).sort(([, a], [, b]) => b - a)[0]
    if (top) supervisorByVendor[vendedor] = top[0]
  }

  // Group vendors by supervisor
  const vendoresBySupervisor: Record<string, string[]> = {}
  for (const [vendedor, supervisor] of Object.entries(supervisorByVendor)) {
    if (!vendoresBySupervisor[supervisor]) vendoresBySupervisor[supervisor] = []
    vendoresBySupervisor[supervisor].push(vendedor)
  }

  const result: SupervisorAnalysis[] = []

  for (const [supervisor, vendores] of Object.entries(vendoresBySupervisor)) {
    const vas = vendorAnalysis.filter((v) => vendores.includes(v.vendedor))
    if (vas.length === 0) continue

    const ventas_periodo    = vas.reduce((a, v) => a + v.ventas_periodo, 0)
    const proyeccion_cierre = vas.reduce((a, v) => a + (v.proyeccion_cierre ?? 0), 0)

    const supervisorSales = vendores.flatMap((v) => index.byVendor.get(v) ?? [])

    const ytd_actual_uds  = supervisorSales.filter((s) => s.fecha >= startYTDActual && s.fecha <= fr).reduce((a, s) => a + s.unidades, 0)
    const ytd_anterior_uds = supervisorSales.filter((s) => s.fecha >= startYTDAnterior && s.fecha <= endYTDAnterior).reduce((a, s) => a + s.unidades, 0)

    const ventas_prev = supervisorSales.filter((s) => s.fecha >= prevYearStart && s.fecha <= prevYearEnd).reduce((a, s) => a + s.unidades, 0)
    const variacion_pct = safePct(ventas_periodo, ventas_prev)

    const meta_zona = getMetaMultiDim(metas, { mes: month + 1, anio: year, supervisor })
    const cumplimiento_pct = meta_zona ? (proyeccion_cierre / meta_zona) * 100 : null

    const vendedores_criticos  = vas.filter((v) => v.riesgo === 'critico').length
    const vendedores_riesgo    = vas.filter((v) => v.riesgo === 'riesgo').length
    const vendedores_ok        = vas.filter((v) => v.riesgo === 'ok').length
    const vendedores_superando = vas.filter((v) => v.riesgo === 'superando').length

    let riesgo_zona: SupervisorAnalysis['riesgo_zona'] = 'ok'
    if (meta_zona) {
      const ratio = proyeccion_cierre / meta_zona
      if (ratio < 0.7)       riesgo_zona = 'critico'
      else if (ratio < 0.9)  riesgo_zona = 'riesgo'
      else if (ratio > 1.05) riesgo_zona = 'superando'
    } else {
      const total = vas.length
      if (total > 0) {
        const pctCritico       = vendedores_criticos / total
        const pctCriticoRiesgo = (vendedores_criticos + vendedores_riesgo) / total
        const pctSuperando     = vendedores_superando / total
        if (pctCritico > 0.5)       riesgo_zona = 'critico'
        else if (pctCriticoRiesgo > 0.5) riesgo_zona = 'riesgo'
        else if (pctSuperando > 0.5)     riesgo_zona = 'superando'
      }
    }

    result.push({
      supervisor, vendedores: vendores, ventas_periodo, meta_zona, cumplimiento_pct,
      proyeccion_cierre, variacion_pct,
      vendedores_criticos, vendedores_riesgo, vendedores_ok, vendedores_superando,
      riesgo_zona, ytd_actual_uds, ytd_anterior_uds,
    })
  }

  return result.sort((a, b) => b.ventas_periodo - a.ventas_periodo)
}

// ─── MÓDULO CATEGORÍA ─────────────────────────────────────────────────────────

export function analyzeCategoria(
  metas: MetaRecord[],
  selectedPeriod: { year: number; month: number },
  index: SaleIndex,
  diasTranscurridos?: number,
  diasTotales?: number,
): CategoriaAnalysis[] {
  const { year, month } = selectedPeriod
  const periodSales  = getSalesByPeriod(index, year, month)
  const total_periodo = periodSales.reduce((a, s) => a + s.unidades, 0)
  if (total_periodo === 0) return []

  const cats = new Set<string>()
  periodSales.forEach((s) => { if (s.categoria) cats.add(s.categoria) })
  if (cats.size === 0) return []

  const isPartial = diasTranscurridos != null && diasTotales != null && diasTranscurridos < diasTotales
  const prevYearSalesAll = getSalesByPeriod(index, year - 1, month)
  const prevYearSales = isPartial ? filterSalesByDayRange(prevYearSalesAll, diasTranscurridos) : prevYearSalesAll

  // Collect PM3 months
  const pm3Months: SaleRecord[][] = []
  for (let i = 1; i <= 3; i++) {
    let y = year, m = month - i
    while (m < 0) { y--; m += 12 }
    pm3Months.push(getSalesByPeriod(index, y, m))
  }

  const result: CategoriaAnalysis[] = []

  for (const categoria of cats) {
    const catSales = periodSales.filter((s) => s.categoria === categoria)
    const ventas_periodo = catSales.reduce((a, s) => a + s.unidades, 0)

    const ventas_anterior = prevYearSales
      .filter((s) => s.categoria === categoria)
      .reduce((a, s) => a + s.unidades, 0)
    const variacion_pct = safePct(ventas_periodo, ventas_anterior)

    const pm3Vals = pm3Months
      .map((ms) => ms.filter((s) => s.categoria === categoria).reduce((a, s) => a + s.unidades, 0))
      .filter((v) => v > 0)
    const pm3Raw = pm3Vals.length > 0 ? pm3Vals.reduce((a, b) => a + b, 0) / pm3Vals.length : 0
    const pm3 = isPartial && pm3Raw > 0 ? pm3Raw * diasTranscurridos! / diasTotales! : pm3Raw

    // Calcular variación vs PM3 (adjusted for partial month)
    let variacion_vs_pm3 = 0
    let tendencia: CategoriaAnalysis['tendencia'] = 'estable'
    if (pm3 === 0) {
      variacion_vs_pm3 = 0
      tendencia = 'estable'
    } else {
      variacion_vs_pm3 = safePct(ventas_periodo, pm3)
      if (ventas_periodo === 0) {
        tendencia = 'sin_datos'
      } else if (variacion_vs_pm3 <= -40) {
        tendencia = 'colapso'
      } else if (variacion_vs_pm3 <= -10) {
        tendencia = 'caida'
      } else if (variacion_vs_pm3 > 15) {
        tendencia = 'crecimiento'
      } else {
        tendencia = 'estable'
      }
    }

    const participacion_pct = total_periodo > 0 ? (ventas_periodo / total_periodo) * 100 : 0

    const meta_categoria = getMetaMultiDim(metas, { mes: month + 1, anio: year, categoria })
    const cumplimiento_pct = meta_categoria ? (ventas_periodo / meta_categoria) * 100 : null

    // Top vendedores
    const vendedorVol: Record<string, number> = {}
    catSales.forEach((s) => { if (s.vendedor) vendedorVol[s.vendedor] = (vendedorVol[s.vendedor] ?? 0) + s.unidades })
    const top_vendedores = Object.entries(vendedorVol).sort(([, a], [, b]) => b - a).slice(0, 3).map(([v]) => v)

    // Top clientes
    const clienteVol: Record<string, number> = {}
    catSales.forEach((s) => {
      const c = s.cliente
      if (c) clienteVol[c] = (clienteVol[c] ?? 0) + s.unidades
    })
    const top_clientes = Object.entries(clienteVol).sort(([, a], [, b]) => b - a).slice(0, 3).map(([c]) => c)

    result.push({
      categoria, ventas_periodo, ventas_anterior, variacion_pct,
      pm3, variacion_vs_pm3, meta_categoria, cumplimiento_pct,
      top_vendedores, top_clientes, tendencia, participacion_pct,
    })
  }

  return result.sort((a, b) => b.ventas_periodo - a.ventas_periodo)
}

// ─── MÓDULO CANAL ─────────────────────────────────────────────────────────────

export function analyzeCanal(
  selectedPeriod: { year: number; month: number },
  index: SaleIndex,
  diasTranscurridos?: number,
  diasTotales?: number,
): CanalAnalysis[] {
  const { year, month } = selectedPeriod
  const periodSales  = getSalesByPeriod(index, year, month)
  const total_periodo = periodSales.reduce((a, s) => a + s.unidades, 0)

  // Canales activos en período actual
  const activePeriod = new Set<string>()
  periodSales.forEach((s) => { if (s.canal) activePeriod.add(s.canal) })

  // Canales activos en los 3 meses anteriores
  const pm3Months: SaleRecord[][] = []
  for (let i = 1; i <= 3; i++) {
    let y = year, m = month - i
    while (m < 0) { y--; m += 12 }
    pm3Months.push(getSalesByPeriod(index, y, m))
  }
  const activeAnterior = new Set<string>()
  pm3Months.forEach((ms) => ms.forEach((s) => { if (s.canal) activeAnterior.add(s.canal) }))

  const allCanales = new Set([...activePeriod, ...activeAnterior])
  if (allCanales.size === 0) return []

  const isPartial = diasTranscurridos != null && diasTotales != null && diasTranscurridos < diasTotales
  const prevYearSalesAll = getSalesByPeriod(index, year - 1, month)
  const prevYearSales = isPartial ? filterSalesByDayRange(prevYearSalesAll, diasTranscurridos) : prevYearSalesAll

  const result: CanalAnalysis[] = []

  for (const canal of allCanales) {
    const canalSales = periodSales.filter((s) => s.canal === canal)
    const ventas_periodo = canalSales.reduce((a, s) => a + s.unidades, 0)

    const ventas_anterior = prevYearSales
      .filter((s) => s.canal === canal)
      .reduce((a, s) => a + s.unidades, 0)
    const variacion_pct = safePct(ventas_periodo, ventas_anterior)

    const pm3Vals = pm3Months
      .map((ms) => ms.filter((s) => s.canal === canal).reduce((a, s) => a + s.unidades, 0))
      .filter((v) => v > 0)
    const pm3Raw = pm3Vals.length > 0 ? pm3Vals.reduce((a, b) => a + b, 0) / pm3Vals.length : 0
    const pm3 = isPartial && pm3Raw > 0 ? pm3Raw * diasTranscurridos! / diasTotales! : pm3Raw

    const participacion_pct = total_periodo > 0 ? (ventas_periodo / total_periodo) * 100 : 0

    const vendedorVol: Record<string, number> = {}
    canalSales.forEach((s) => { if (s.vendedor) vendedorVol[s.vendedor] = (vendedorVol[s.vendedor] ?? 0) + s.unidades })
    const top_vendedor = Object.entries(vendedorVol).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null

    const clienteVol: Record<string, number> = {}
    canalSales.forEach((s) => {
      const c = s.cliente
      if (c) clienteVol[c] = (clienteVol[c] ?? 0) + s.unidades
    })
    const top_cliente = Object.entries(clienteVol).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null

    const activo_periodo  = activePeriod.has(canal)
    const activo_anterior = activeAnterior.has(canal)

    const tendencia: CanalAnalysis['tendencia'] =
      activo_anterior && !activo_periodo ? 'desaparecido'
      : variacion_pct > 15               ? 'crecimiento'
      : variacion_pct > -10              ? 'estable'
      : 'caida'

    result.push({
      canal, ventas_periodo, ventas_anterior, variacion_pct, pm3,
      participacion_pct, top_vendedor, top_cliente,
      activo_periodo, activo_anterior, tendencia,
    })
  }

  return result.sort((a, b) => b.ventas_periodo - a.ventas_periodo)
}

// ─── INVENTARIO AGRUPADO POR CATEGORÍA ───────────────────────────────────────

export function computeCategoriasInventarioPorCategoria(
  categoriasInventario: CategoriaInventario[],
  config: Configuracion,
): InventarioPorCategoria[] {
  if (categoriasInventario.length === 0) return []

  const unidadesTotalesEmpresa = categoriasInventario.reduce((a, c) => a + c.unidades_actuales, 0)

  const catMap = new Map<string, CategoriaInventario[]>()
  for (const item of categoriasInventario) {
    const cat = item.categoria ?? 'Sin categoría'
    const arr = catMap.get(cat) ?? []
    arr.push(item)
    catMap.set(cat, arr)
  }

  const result: InventarioPorCategoria[] = []
  for (const [categoria, items] of catMap.entries()) {
    const productos_total = items.length
    const unidades_totales = items.reduce((a, c) => a + c.unidades_actuales, 0)
    const pm3_total = items.reduce((a, c) => a + c.pm3, 0)

    // Weighted average of dias_inventario (by pm3 — higher rotation = more weight)
    const pm3Sum = items.reduce((a, c) => a + c.pm3, 0)
    const dias_real = items.map((c) => (c.dias_inventario === 9999 ? 0 : c.dias_inventario))
    const dias_inventario_promedio = pm3Sum > 0
      ? Math.round(items.reduce((a, c, i) => a + dias_real[i] * c.pm3, 0) / pm3Sum)
      : Math.round(dias_real.reduce((a, d) => a + d, 0) / items.length)

    const capital_inmovilizado_pct = unidadesTotalesEmpresa > 0
      ? (unidades_totales / unidadesTotalesEmpresa) * 100
      : 0

    const productos_quiebre = items.filter((c) => c.clasificacion === 'riesgo_quiebre').length
    const productos_baja_cobertura = items.filter((c) => c.clasificacion === 'baja_cobertura').length
    const productos_lento = items.filter((c) => c.clasificacion === 'lento_movimiento').length
    const productos_sin_movimiento = items.filter((c) => c.clasificacion === 'sin_movimiento').length

    let clasificacion_categoria: InventarioPorCategoria['clasificacion_categoria']
    if (productos_quiebre > 0 && productos_quiebre / productos_total > 0.3) {
      clasificacion_categoria = 'critica'
    } else if (dias_inventario_promedio < config.umbral_baja_cobertura) {
      clasificacion_categoria = 'riesgo'
    } else if (dias_inventario_promedio > config.umbral_normal * 2) {
      clasificacion_categoria = 'sobrestock'
    } else {
      clasificacion_categoria = 'normal'
    }

    result.push({
      categoria,
      productos_total,
      unidades_totales,
      pm3_total,
      dias_inventario_promedio,
      capital_inmovilizado_pct,
      productos_quiebre,
      productos_baja_cobertura,
      productos_lento,
      productos_sin_movimiento,
      clasificacion_categoria,
    })
  }

  return result.sort((a, b) => b.unidades_totales - a.unidades_totales)
}

// ─── AGGREGATED SUMMARIES (off-thread, page-ready) ────────────────────────────
// Pre-computa resúmenes por cliente, producto y departamento para que las
// páginas no necesiten tocar sales[] al renderizar. Single pass over sales.

export interface ClienteSummary {
  nombre: string
  vendedor: string
  canal: string
  departamento: string
  ventaCur: number
  udsCur: number
  ventaPrev: number
  udsPrev: number
  varPct: number | null
  peso: number
  paretoCum: number
  mesesActivo: number
  productosUnicos: number
  categorias: string[]
  transacciones: number
  lastDate: string
  isDormido: boolean
  dormidoInfo: any
  // riesgo temprano (computed in same pass)
  riesgoSignal: 'en riesgo' | 'desacelerando' | null
  riesgoAvgDays: number
  riesgoDaysSince: number
  riesgoAtraso: number
  riesgoValorHistorico: number
}

export interface ProductoSummary {
  nombre: string
  categoria: string
  ventaCur: number
  udsCur: number
  ventaPrev: number
  udsPrev: number
  varPct: number | null
  clientesActivos: number
  vendedores: number
}

export interface DepartamentoSummary {
  nombre: string
  ventaCur: number
  udsCur: number
  ventaPrev: number
  udsPrev: number
  varPct: number | null     // active metric (hasVenta → usd, else uds)
  varPct_usd: number | null // R55: always USD-based
  varPct_uds: number | null // R55: always UDS-based
  clientesActivos: number
  vendedores: number
  productos: number
}

export function buildAggregatedSummaries(
  sales: SaleRecord[],
  selectedPeriod: { year: number; month: number },
  clientesDormidos: ClienteDormido[],
  _concentracionRiesgo: ConcentracionRiesgo[],
  _categoriasInventario: CategoriaInventario[],
  dataAvailability: { has_venta_neta: boolean }
): {
  clienteSummaries: ClienteSummary[]
  productoSummaries: ProductoSummary[]
  departamentoSummaries: DepartamentoSummary[]
  mesesDisponibles: number[]
  canalesDisponibles: string[]
  monthlyTotals: Record<string, { uds: number; neta: number }>
  monthlyTotalsSameDay: Record<string, { uds: number; neta: number }>
  fechaRefISO: string
} {
  const { year, month } = selectedPeriod
  const hasVenta = dataAvailability.has_venta_neta

  // NOTA (Ticket 2.2-A/C): fallback intencional al browser cuando no hay datos.
  // Las funciones internas ya retornan empty; este orquestador externo
  // requiere SIEMPRE un fechaRef para pantallas que dependen de él.
  const fechaRef = getFechaReferencia(sales) ?? new Date()
  const refMonth = fechaRef.getMonth()
  const refDay = fechaRef.getDate()

  // YTD range: from Jan 1 to fechaRef of current year (and same range previous year)
  // For comparison fairness: cap day at refDay when comparing the "current" partial month.
  const inYTDRange = (fm: number, fd: number): boolean => {
    if (fm > refMonth) return false
    if (fm < refMonth) return true
    // fm === refMonth — cap at refDay symmetrically for both years
    return fd <= refDay
  }

  type ClienteAgg = {
    vendedor: string
    canal: string
    departamento: string
    totalCur: number
    udsCur: number
    totalPrev: number
    udsPrev: number
    lastDate: Date
    meses: Set<string>
    productos: Set<string>
    categorias: Set<string>
    transacciones: number
    valorHistorico: number
    sixMoDates: Date[]
  }
  type ProductoAgg = {
    categoria: string
    totalCur: number
    udsCur: number
    totalPrev: number
    udsPrev: number
    clientes: Set<string>
    vendedores: Set<string>
  }
  type DeptAgg = {
    totalCur: number
    udsCur: number
    totalPrev: number
    udsPrev: number
    clientes: Set<string>
    vendedores: Set<string>
    productos: Set<string>
  }

  const clienteMap = new Map<string, ClienteAgg>()
  const productoMap = new Map<string, ProductoAgg>()
  const departamentoMap = new Map<string, DeptAgg>()
  const mesesDisponiblesSet = new Set<number>()
  const canalesDisponiblesSet = new Set<string>()
  // Totales mensuales (full-month) y same-day-range (capped at refDay) por (y,m)
  // Key: `${year}-${month}`
  const monthlyFull = new Map<string, { uds: number; neta: number }>()
  const monthlySameDay = new Map<string, { uds: number; neta: number }>()

  // 6mo cutoff for riesgo temprano
  const sixMonthsAgo = new Date(fechaRef)
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  // SINGLE PASS over all sales
  for (const r of sales) {
    const d = r.fecha
    const fy = d.getFullYear()
    const fm = d.getMonth()
    const fd = d.getDate()
    const cliente = r.cliente
    const producto = r.producto
    const dept = r.departamento
    const isCurYear = fy === year
    const isPrevYear = fy === year - 1
    const inRange = (isCurYear || isPrevYear) && inYTDRange(fm, fd)

    const uds = r.unidades || 0
    const venta = r.venta_neta || 0

    // Filter dropdown options
    if (fy === year) mesesDisponiblesSet.add(fm)
    if (r.canal) canalesDisponiblesSet.add(r.canal)

    // Monthly totals (full month + same-day-range capped at refDay)
    const mk = `${fy}-${fm}`
    let mFull = monthlyFull.get(mk)
    if (!mFull) { mFull = { uds: 0, neta: 0 }; monthlyFull.set(mk, mFull) }
    mFull.uds += uds
    mFull.neta += venta
    if (fd <= refDay) {
      let mSame = monthlySameDay.get(mk)
      if (!mSame) { mSame = { uds: 0, neta: 0 }; monthlySameDay.set(mk, mSame) }
      mSame.uds += uds
      mSame.neta += venta
    }

    // --- Cliente aggregation ---
    if (cliente) {
      let c = clienteMap.get(cliente)
      if (!c) {
        c = {
          vendedor: r.vendedor || '', canal: r.canal || '', departamento: r.departamento || '',
          totalCur: 0, udsCur: 0, totalPrev: 0, udsPrev: 0, lastDate: d,
          meses: new Set(), productos: new Set(), categorias: new Set(),
          transacciones: 0, valorHistorico: 0, sixMoDates: [],
        }
        clienteMap.set(cliente, c)
      }
      if (isCurYear && inRange) { c.totalCur += venta; c.udsCur += uds }
      if (isPrevYear && inRange) { c.totalPrev += venta; c.udsPrev += uds }
      if (d > c.lastDate) {
        c.lastDate = d
        if (r.vendedor) c.vendedor = r.vendedor
        if (r.canal) c.canal = r.canal
      }
      c.meses.add(`${fy}-${fm}`)
      if (producto) c.productos.add(producto)
      if (r.categoria) c.categorias.add(r.categoria)
      c.transacciones++
      c.valorHistorico += hasVenta ? venta : uds
      if (d >= sixMonthsAgo) c.sixMoDates.push(d)
    }

    // --- Producto aggregation ---
    if (producto) {
      let p = productoMap.get(producto)
      if (!p) {
        p = {
          categoria: r.categoria || '',
          totalCur: 0, udsCur: 0, totalPrev: 0, udsPrev: 0,
          clientes: new Set(), vendedores: new Set(),
        }
        productoMap.set(producto, p)
      }
      if (isCurYear && inRange) { p.totalCur += venta; p.udsCur += uds }
      if (isPrevYear && inRange) { p.totalPrev += venta; p.udsPrev += uds }
      if (cliente) p.clientes.add(cliente)
      if (r.vendedor) p.vendedores.add(r.vendedor)
    }

    // --- Departamento aggregation ---
    if (dept) {
      let dp = departamentoMap.get(dept)
      if (!dp) {
        dp = {
          totalCur: 0, udsCur: 0, totalPrev: 0, udsPrev: 0,
          clientes: new Set(), vendedores: new Set(), productos: new Set(),
        }
        departamentoMap.set(dept, dp)
      }
      if (isCurYear && inRange) { dp.totalCur += venta; dp.udsCur += uds }
      if (isPrevYear && inRange) { dp.totalPrev += venta; dp.udsPrev += uds }
      if (cliente) dp.clientes.add(cliente)
      if (r.vendedor) dp.vendedores.add(r.vendedor)
      if (producto) dp.productos.add(producto)
    }
  }

  // --- Build dormidos lookup ---
  const dormidosSet = new Set(clientesDormidos.map(c => c.cliente))
  const dormidosMap = new Map(clientesDormidos.map(c => [c.cliente, c]))

  // --- Build cliente summaries ---
  const clienteSummariesUnsorted: ClienteSummary[] = []
  let grandTotalCur = 0
  for (const c of clienteMap.values()) {
    grandTotalCur += hasVenta ? c.totalCur : c.udsCur
  }

  for (const [nombre, c] of clienteMap) {
    const metricCur = hasVenta ? c.totalCur : c.udsCur
    const metricPrev = hasVenta ? c.totalPrev : c.udsPrev
    const varPct = metricPrev > 0 ? ((metricCur - metricPrev) / metricPrev) * 100 : null
    const peso = grandTotalCur > 0 ? (metricCur / grandTotalCur) * 100 : 0

    // --- Riesgo temprano (only for non-dormidos with >=2 transactions in 6mo window) ---
    let riesgoSignal: 'en riesgo' | 'desacelerando' | null = null
    let riesgoAvgDays = 0
    let riesgoDaysSince = 0
    let riesgoAtraso = 0
    if (!dormidosSet.has(nombre) && c.sixMoDates.length >= 2) {
      const sortedDates = [...c.sixMoDates].sort((a, b) => a.getTime() - b.getTime())
      let totalGap = 0
      for (let i = 1; i < sortedDates.length; i++) {
        totalGap += (sortedDates[i].getTime() - sortedDates[i - 1].getTime()) / 86400000
      }
      const avgDays = totalGap / (sortedDates.length - 1)
      if (avgDays >= 1) {
        const lastPurchase = sortedDates[sortedDates.length - 1]
        const daysSince = (fechaRef.getTime() - lastPurchase.getTime()) / 86400000
        if (daysSince > avgDays * 2) riesgoSignal = 'en riesgo'
        else if (daysSince > avgDays * 1.5) riesgoSignal = 'desacelerando'
        if (riesgoSignal) {
          riesgoAvgDays = avgDays
          riesgoDaysSince = Math.round(daysSince)
          riesgoAtraso = Math.round(daysSince - avgDays)
        }
      }
    }

    clienteSummariesUnsorted.push({
      nombre,
      vendedor: c.vendedor,
      canal: c.canal,
      departamento: c.departamento,
      ventaCur: c.totalCur,
      udsCur: c.udsCur,
      ventaPrev: c.totalPrev,
      udsPrev: c.udsPrev,
      varPct,
      peso,
      paretoCum: 0,
      mesesActivo: c.meses.size,
      productosUnicos: c.productos.size,
      categorias: [...c.categorias],
      transacciones: c.transacciones,
      lastDate: c.lastDate.toISOString(),
      isDormido: dormidosSet.has(nombre),
      dormidoInfo: dormidosMap.get(nombre) || null,
      riesgoSignal,
      riesgoAvgDays,
      riesgoDaysSince,
      riesgoAtraso,
      riesgoValorHistorico: c.valorHistorico,
    })
    void year; void month
  }

  // Sort by metric descending
  clienteSummariesUnsorted.sort((a, b) =>
    hasVenta ? b.ventaCur - a.ventaCur : b.udsCur - a.udsCur
  )

  // Add pareto cumulative %
  let cumSum = 0
  for (const c of clienteSummariesUnsorted) {
    cumSum += c.peso
    c.paretoCum = cumSum
  }

  // --- Build producto summaries ---
  const productoSummaries: ProductoSummary[] = []
  for (const [nombre, p] of productoMap) {
    const metricCur = hasVenta ? p.totalCur : p.udsCur
    const metricPrev = hasVenta ? p.totalPrev : p.udsPrev
    const varPct = metricPrev > 0 ? ((metricCur - metricPrev) / metricPrev) * 100 : null
    productoSummaries.push({
      nombre,
      categoria: p.categoria,
      ventaCur: p.totalCur,
      udsCur: p.udsCur,
      ventaPrev: p.totalPrev,
      udsPrev: p.udsPrev,
      varPct,
      clientesActivos: p.clientes.size,
      vendedores: p.vendedores.size,
    })
  }
  productoSummaries.sort((a, b) =>
    hasVenta ? b.ventaCur - a.ventaCur : b.udsCur - a.udsCur
  )

  // --- Build departamento summaries ---
  const departamentoSummaries: DepartamentoSummary[] = []
  for (const [nombre, dp] of departamentoMap) {
    const varPct_usd = dp.totalPrev > 0 ? ((dp.totalCur - dp.totalPrev) / dp.totalPrev) * 100 : null
    const varPct_uds = dp.udsPrev > 0 ? ((dp.udsCur - dp.udsPrev) / dp.udsPrev) * 100 : null
    const varPct = hasVenta ? varPct_usd : varPct_uds
    departamentoSummaries.push({
      nombre,
      ventaCur: dp.totalCur,
      udsCur: dp.udsCur,
      ventaPrev: dp.totalPrev,
      udsPrev: dp.udsPrev,
      varPct,
      varPct_usd,
      varPct_uds,
      clientesActivos: dp.clientes.size,
      vendedores: dp.vendedores.size,
      productos: dp.productos.size,
    })
  }
  departamentoSummaries.sort((a, b) =>
    hasVenta ? b.ventaCur - a.ventaCur : b.udsCur - a.udsCur
  )

  const monthlyTotals: Record<string, { uds: number; neta: number }> = {}
  for (const [k, v] of monthlyFull) monthlyTotals[k] = v
  const monthlyTotalsSameDay: Record<string, { uds: number; neta: number }> = {}
  for (const [k, v] of monthlySameDay) monthlyTotalsSameDay[k] = v

  return {
    clienteSummaries: clienteSummariesUnsorted,
    productoSummaries,
    departamentoSummaries,
    mesesDisponibles: [...mesesDisponiblesSet].sort((a, b) => a - b),
    canalesDisponibles: [...canalesDisponiblesSet].sort(),
    monthlyTotals,
    monthlyTotalsSameDay,
    fechaRefISO: fechaRef.toISOString(),
  }
}
