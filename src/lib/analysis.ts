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
} from '../types'

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
  return `${d.getFullYear()}-${d.getMonth()}-W${Math.ceil(d.getDate() / 7)}`
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
  let fechaReferencia = new Date(0)
  let has_producto = false, has_cliente = false, has_venta_neta = false
  let has_categoria = false, has_canal = false

  for (const s of sales) {
    if (s.fecha > fechaReferencia) fechaReferencia = s.fecha
    appendToMap(byPeriod, periodKey(s.fecha.getFullYear(), s.fecha.getMonth()), s)
    if (s.vendedor) appendToMap(byVendor, s.vendedor, s)
    if (s.producto) { appendToMap(byProduct, s.producto, s); has_producto = true }
    if (s.cliente) { appendToMap(byClient, s.cliente, s); has_cliente = true }
    if (!has_venta_neta && s.venta_neta != null && s.venta_neta > 0) has_venta_neta = true
    if (!has_categoria && s.categoria != null && s.categoria !== '') has_categoria = true
    if (!has_canal && s.canal != null && s.canal !== '') has_canal = true
  }

  return {
    byPeriod, byVendor, byProduct, byClient, fechaReferencia,
    has_producto, has_cliente, has_venta_neta, has_categoria, has_canal,
  }
}

function getSalesByPeriod(index: SaleIndex, year: number, month: number): SaleRecord[] {
  return index.byPeriod.get(periodKey(year, month)) ?? []
}

// ─── FILTROS DE PERÍODO ───────────────────────────────────────────────────────

export function salesInPeriod(sales: SaleRecord[], year: number, month: number): SaleRecord[] {
  const start = startOfPeriod(year, month)
  const end = endOfPeriod(year, month)
  return sales.filter((s) => s.fecha >= start && s.fecha <= end)
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

// ─── ANÁLISIS POR VENDEDOR ────────────────────────────────────────────────────

// ─── YTD HELPER ───────────────────────────────────────────────────────────────

function computeYTD(
  sales: SaleRecord[],
  fechaReferencia: Date
): { ytd_actual: number; ytd_anterior: number; variacion_ytd_pct: number | null } {
  const yearActual = fechaReferencia.getFullYear()
  const startActual = new Date(yearActual, 0, 1)
  const startAnterior = new Date(yearActual - 1, 0, 1)
  // Mismo día/mes del año anterior
  const endAnterior = new Date(yearActual - 1, fechaReferencia.getMonth(), fechaReferencia.getDate(), 23, 59, 59, 999)

  const ytd_actual = sales
    .filter((s) => s.fecha >= startActual && s.fecha <= fechaReferencia)
    .reduce((a, s) => a + s.unidades, 0)

  const ytd_anterior = sales
    .filter((s) => s.fecha >= startAnterior && s.fecha <= endAnterior)
    .reduce((a, s) => a + s.unidades, 0)

  const variacion_ytd_pct = ytd_anterior > 0
    ? ((ytd_actual - ytd_anterior) / ytd_anterior) * 100
    : null

  return { ytd_actual, ytd_anterior, variacion_ytd_pct }
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
): VendorAnalysis {
  const { year, month } = selectedPeriod

  const periodSales = vendorSales.filter((s) => s.fecha >= periodStart && s.fecha <= periodEnd)
  const prevSales = vendorSales.filter((s) => s.fecha >= prevStart && s.fecha <= prevEnd)

  const ventas_periodo = periodSales.reduce((a, s) => a + s.unidades, 0)
  const ventas_mes_anterior = prevSales.reduce((a, s) => a + s.unidades, 0)
  const variacion_pct =
    ventas_mes_anterior > 0
      ? ((ventas_periodo - ventas_mes_anterior) / ventas_mes_anterior) * 100
      : null

  const promedioN = promedioUltimosN(vendorSales, year, month, 3)
  const variacion_vs_promedio_pct = promedioN.promedio > 0
    ? Math.round(((ventas_periodo - promedioN.promedio) / promedioN.promedio) * 100)
    : null

  const ritmo_diario = diasTranscurridos > 0 ? ventas_periodo / diasTranscurridos : 0
  const proyeccion_cierre = Math.round(ritmo_diario * diasTotales)

  // Meta del período
  const pk = periodKey(year, month)
  const metaRecord = metas.find(
    (m) =>
      m.mes_periodo === pk &&
      m.vendedor.toLowerCase().trim() === vendedor.toLowerCase().trim()
  )
  const meta = metaRecord?.meta
  const cumplimiento_pct = meta ? (ventas_periodo / meta) * 100 : undefined
  const ritmo_necesario =
    meta && diasRestantes > 0
      ? Math.max(0, (meta - ventas_periodo) / diasRestantes)
      : undefined

  // Ticket promedio (solo si hay venta_neta)
  const hasVentaNeta = periodSales.some((s) => s.venta_neta != null)
  const ventaNeta = periodSales.reduce((a, s) => a + (s.venta_neta ?? 0), 0)
  const ticket_promedio =
    hasVentaNeta && periodSales.length > 0
      ? ventaNeta / periodSales.length
      : undefined

  // Clientes activos (solo si hay cliente)
  const hasCliente = periodSales.some((s) => s.cliente != null)
  const clientes_activos = hasCliente
    ? new Set(periodSales.map((s) => s.cliente).filter(Boolean)).size
    : undefined

  // Semanas en racha negativa (works on vendor's own sales subset)
  const { semanas: semanas_bajo_promedio, promedioSemanal } = calcSemanasRachaFast(
    vendorSales,
    year,
    month
  )

  // Clasificación de riesgo
  let riesgo: RiesgoVendedor = 'ok'
  if (meta) {
    if (proyeccion_cierre < meta * 0.7) riesgo = 'critico'
    else if (proyeccion_cierre < meta * 0.9) riesgo = 'riesgo'
    else if (proyeccion_cierre > meta * 1.05) riesgo = 'superando'
  } else if (variacion_pct !== null) {
    if (variacion_pct < -20) riesgo = 'critico'
    else if (variacion_pct < -10) riesgo = 'riesgo'
    else if (variacion_pct > 10) riesgo = 'superando'
  }

  return {
    vendedor,
    ventas_periodo,
    unidades_periodo: ventas_periodo,
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
    ...computeYTD(vendorSales, fechaReferencia),
  }
}

// ─── CLIENTES DORMIDOS ────────────────────────────────────────────────────────

function computeClientesDormidos(
  sales: SaleRecord[],
  threshold: number,
  byClient?: Map<string, SaleRecord[]>,
): ClienteDormido[] {
  const today = sales.length > 0
    ? sales.reduce((max, s) => { const d = s.fecha; return d > max ? d : max }, new Date(0))
    : new Date()

  const clientMap = byClient ?? (() => {
    const m = new Map<string, SaleRecord[]>()
    for (const s of sales) {
      if (!s.cliente) continue
      appendToMap(m, s.cliente, s)
    }
    return m
  })()

  type DormidoRaw = {
    cliente: string; vendedor: string; ultima_compra: Date; dias_sin_actividad: number
    valor_historico: number; compras_historicas: number
    frecuencia_promedio: number; meses_distintos: number; meses_historial: number
  }
  const candidates: DormidoRaw[] = []

  for (const [cliente, records] of clientMap.entries()) {
    // Sort ONCE ascending — ultima_compra = last element
    const sortedAsc = [...records].sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
    const ultima_compra = sortedAsc[sortedAsc.length - 1].fecha
    const dias_sin_actividad = Math.floor((today.getTime() - ultima_compra.getTime()) / 86400000)
    if (dias_sin_actividad <= threshold) continue

    const vendedorCount: Record<string, number> = {}
    for (const r of records) {
      vendedorCount[r.vendedor] = (vendedorCount[r.vendedor] ?? 0) + 1
    }
    const vendedor = Object.entries(vendedorCount).sort(([, a], [, b]) => b - a)[0][0]
    const valor_historico = records.reduce((a, s) => a + (s.venta_neta ?? s.unidades), 0)

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
      valor_historico, compras_historicas: records.length,
      frecuencia_promedio, meses_distintos, meses_historial,
    })
  }

  if (candidates.length === 0) return []

  const maxValor = Math.max(...candidates.map(c => c.valor_historico))

  const dormidos: ClienteDormido[] = candidates.map(c => {
    const frecuencia_score = c.frecuencia_promedio === 0 || c.compras_historicas < 2
      ? 0.3
      : Math.max(0, 1 - (c.dias_sin_actividad / (c.frecuencia_promedio * 3)))
    const valor_score = maxValor > 0 ? c.valor_historico / maxValor : 0
    const recencia_score = Math.max(0, 1 - (c.dias_sin_actividad / 180))
    const estabilidad_score = Math.min(1, c.meses_distintos / c.meses_historial)

    const raw = (frecuencia_score * 35) + (valor_score * 25) + (recencia_score * 20) + (estabilidad_score * 20)
    const recovery_score = Math.min(100, Math.max(0, Math.round(raw)))

    const recovery_label: ClienteDormido['recovery_label'] =
      recovery_score >= 80 ? 'alta'
      : recovery_score >= 60 ? 'recuperable'
      : recovery_score >= 40 ? 'dificil'
      : 'perdido'

    let recovery_explicacion: string
    if (c.frecuencia_promedio >= 2 && c.compras_historicas >= 2) {
      recovery_explicacion = `Compraba cada ${Math.round(c.frecuencia_promedio)} días, lleva ${c.dias_sin_actividad} sin comprar`
    } else if (c.meses_distintos >= 3) {
      recovery_explicacion = `Activo ${c.meses_distintos} de ${c.meses_historial} meses, ${c.dias_sin_actividad} días inactivo`
    } else {
      recovery_explicacion = `Historial limitado, ${c.dias_sin_actividad} días sin actividad`
    }
    if (recovery_explicacion.length > 60) recovery_explicacion = recovery_explicacion.slice(0, 57) + '...'

    return {
      cliente: c.cliente, vendedor: c.vendedor, ultima_compra: c.ultima_compra,
      dias_sin_actividad: c.dias_sin_actividad, valor_historico: c.valor_historico,
      compras_historicas: c.compras_historicas, recovery_score, recovery_label, recovery_explicacion,
    }
  })

  const maxValorD = Math.max(...dormidos.map(c => c.valor_historico), 1)

  const scored = dormidos.map(c => ({
    ...c,
    _priority_score:
      (c.valor_historico / maxValorD) * 0.6 +
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
): CommercialAnalysisResult {
  const { year, month } = selectedPeriod
  const today = new Date()
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() === month

  const diasTotales = getDaysInMonth(year, month)
  const diasTranscurridos = isCurrentMonth ? today.getDate() : diasTotales
  const diasRestantes = Math.max(0, diasTotales - diasTranscurridos)

  const idx = index ?? buildSaleIndex(sales)
  const fechaReferencia = idx.fechaReferencia.getTime() > 0 ? idx.fechaReferencia : today

  const prev = prevPeriod(year, month)
  const periodStart = startOfPeriod(year, month)
  const periodEnd = endOfPeriod(year, month)
  const prevStart = startOfPeriod(prev.year, prev.month)
  const prevEnd = endOfPeriod(prev.year, prev.month)

  const vendedores = Array.from(idx.byVendor.keys())
  const vendorAnalysis = vendedores.map((v) =>
    analyzeVendor(
      v, idx.byVendor.get(v)!, metas, selectedPeriod,
      diasTranscurridos, diasTotales, diasRestantes, fechaReferencia,
      periodStart, periodEnd, prevStart, prevEnd,
    )
  )

  const periodSales = getSalesByPeriod(idx, year, month)
  const prevSales = getSalesByPeriod(idx, prev.year, prev.month)
  const total_ventas = periodSales.reduce((a, s) => a + s.unidades, 0)
  const prevTotal = prevSales.reduce((a, s) => a + s.unidades, 0)
  const variacion_pct = prevTotal > 0 ? ((total_ventas - prevTotal) / prevTotal) * 100 : null

  const pk = periodKey(year, month)
  const metasDelPeriodo = metas.filter((m) => m.mes_periodo === pk)
  const meta_equipo =
    metasDelPeriodo.length > 0
      ? metasDelPeriodo.reduce((a, m) => a + m.meta, 0)
      : undefined

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
    ? computeClientesDormidos(sales, config.dias_dormido_threshold, idx.byClient)
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

  const teamStats: TeamStats = {
    total_ventas,
    total_unidades: total_ventas,
    variacion_pct,
    meta_equipo,
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
      const { ytd_actual, ytd_anterior, variacion_ytd_pct } = computeYTD(sales, fechaReferencia)
      return { ytd_actual_equipo: ytd_actual, ytd_anterior_equipo: ytd_anterior, variacion_ytd_equipo: variacion_ytd_pct }
    })(),
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
      clasificacion = ultimoMovMap[item.producto] ? 'lento_movimiento' : 'sin_movimiento'
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
