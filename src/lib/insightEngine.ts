import type {
  VendorAnalysis,
  TeamStats,
  SaleRecord,
  MetaRecord,
  ClienteDormido,
  ConcentracionRiesgo,
  DataAvailability,
  Configuracion,
  Insight,
  InsightPrioridad,
} from '../types'
import type { SaleIndex } from './analysis'
import {
  salesInPeriod,
  prevPeriod,
  periodKey,
  getVentasVendedorPorCliente,
  getMejoresPeriodosVendedor,
} from './analysis'

function byPeriod(index: SaleIndex, year: number, month: number): SaleRecord[] {
  return index.byPeriod.get(`${year}-${String(month + 1).padStart(2, '0')}`) ?? []
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

let _idCounter = 0
function uid(prefix: string): string {
  return `${prefix}-${++_idCounter}`
}

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString('es-MX', { maximumFractionDigits: decimals })
}

function pct(n: number): string {
  return `${Math.abs(n).toFixed(1)}%`
}

const PRIORITY_ORDER: Record<InsightPrioridad, number> = {
  CRITICA: 0,
  ALTA: 1,
  MEDIA: 2,
  BAJA: 3,
}

function sortInsights(insights: (Insight | null)[]): Insight[] {
  return (insights.filter(Boolean) as Insight[]).sort((a, b) => {
    const pDiff = PRIORITY_ORDER[a.prioridad] - PRIORITY_ORDER[b.prioridad]
    if (pDiff !== 0) return pDiff
    const aVal = a.impacto_economico?.valor ?? 0
    const bVal = b.impacto_economico?.valor ?? 0
    if (aVal !== bVal) return bVal - aVal
    return 0
  })
}

// ─── INSIGHT 1: META EN PELIGRO ───────────────────────────────────────────────

function insightMetaEnPeligro(
  v: VendorAnalysis, teamStats: TeamStats,
  precioUnitario: number, has_venta_neta: boolean,
): Insight | null {
  if (!v.meta || !v.proyeccion_cierre) return null
  if (teamStats.dias_restantes <= 5) return null
  if (v.proyeccion_cierre >= v.meta * 0.85) return null

  const pctMeta = (v.proyeccion_cierre / v.meta) * 100
  const ritmo = v.ritmo_necesario ?? 0
  const brecha = v.meta - v.proyeccion_cierre

  const insight: Insight = {
    id: uid('meta-peligro'),
    tipo: 'riesgo_vendedor',
    prioridad: 'CRITICA',
    emoji: '🚨',
    titulo: `Meta en peligro — ${v.vendedor}`,
    descripcion: `${v.vendedor} proyecta cerrar en ${pct(pctMeta)} de su meta. Necesita ${fmt(ritmo, 1)} uds/día para los ${teamStats.dias_restantes} días restantes (meta: ${fmt(v.meta)} uds).`,
    vendedor: v.vendedor,
    valor_numerico: pctMeta,
    accion_sugerida: v.ritmo_necesario
      ? `Requiere ${Math.round(v.ritmo_necesario).toLocaleString()} uds/día los ${teamStats.dias_restantes} días restantes — ritmo actual: ${Math.round(v.ritmo_diario ?? 0).toLocaleString()}`
      : `Revisar pipeline y clientes activos con urgencia`,
  }
  if (has_venta_neta && precioUnitario > 0 && brecha > 0) {
    insight.impacto_economico = {
      valor: Math.round(brecha * precioUnitario),
      descripcion: 'en ventas que no se cerrarán si sigue la tendencia',
      tipo: 'riesgo',
    }
  }
  return insight
}

// ─── INSIGHT 2: RACHA NEGATIVA ────────────────────────────────────────────────

function insightRachaNegativa(v: VendorAnalysis, config: Configuracion): Insight | null {
  if (v.semanas_bajo_promedio < config.semanas_racha_threshold) return null

  const promedio = v.promedio_semanal_historico ?? 0

  return {
    id: uid('racha'),
    tipo: 'riesgo_vendedor',
    prioridad: 'ALTA',
    emoji: '📉',
    titulo: `Racha negativa — ${v.vendedor}`,
    descripcion: `${v.vendedor} lleva ${v.semanas_bajo_promedio} semanas consecutivas vendiendo por debajo de su promedio histórico de ${fmt(promedio, 1)} uds/semana.`,
    vendedor: v.vendedor,
    valor_numerico: v.semanas_bajo_promedio,
    accion_sugerida: 'Ver en Vendedores',
  }
}

// ─── INSIGHT 3: DEPENDENCIA DE CLIENTE ───────────────────────────────────────

function insightDependenciaCliente(
  v: VendorAnalysis,
  sales: SaleRecord[],
  selectedPeriod: { year: number; month: number },
  config: Configuracion,
  index?: SaleIndex,
): Insight | null {
  if (v.ventas_periodo === 0) return null

  const byCliente = getVentasVendedorPorCliente(sales, v.vendedor, selectedPeriod.year, selectedPeriod.month, index)
  const entries = Object.entries(byCliente).sort(([, a], [, b]) => b - a)
  if (entries.length === 0) return null

  const [topCliente, topVentas] = entries[0]
  const topPct = (topVentas / v.ventas_periodo) * 100
  if (topPct <= config.pct_concentracion_threshold) return null

  return {
    id: uid('dep-cliente'),
    tipo: 'riesgo_vendedor',
    prioridad: 'ALTA',
    emoji: '⚠️',
    titulo: `Dependencia de cliente — ${v.vendedor}`,
    descripcion: `${v.vendedor} genera el ${pct(topPct)} de sus ventas con un solo cliente (${topCliente}). Si ese cliente reduce su volumen, ${v.vendedor} queda altamente expuesto para cerrar meta.`,
    vendedor: v.vendedor,
    cliente: topCliente,
    valor_numerico: topPct,
    accion_sugerida: 'Ver en Clientes',
  }
}

// ─── INSIGHT 4: CAÍDA ACELERADA ───────────────────────────────────────────────

function insightCaidaAcelerada(v: VendorAnalysis): Insight | null {
  if ((v.periodos_base_promedio ?? 0) < 2) return null
  if (
    v.variacion_vs_promedio_pct === null ||
    v.variacion_vs_promedio_pct === undefined ||
    v.variacion_vs_promedio_pct >= -15
  ) return null

  return {
    id: uid('caida'),
    tipo: 'riesgo_vendedor',
    prioridad: 'ALTA',
    emoji: '⬇️',
    titulo: `Caída acelerada — ${v.vendedor}`,
    descripcion: `${v.vendedor} está ${pct(Math.abs(v.variacion_vs_promedio_pct))} por debajo del promedio de sus últimos ${v.periodos_base_promedio ?? 3} períodos con datos (promedio: ${fmt(v.promedio_3m ?? 0)} uds/mes). Este período: ${fmt(v.ventas_periodo)} uds.`,
    vendedor: v.vendedor,
    valor_numerico: v.variacion_vs_promedio_pct,
    accion_sugerida: `Está ${Math.abs(v.variacion_vs_promedio_pct ?? 0)}% por debajo del promedio de sus últimos ${v.periodos_base_promedio ?? 3} períodos — revisar causas esta semana`,
  }
}

// ─── INSIGHT 5: SUPERANDO META ────────────────────────────────────────────────

function insightSuperandoMeta(v: VendorAnalysis): Insight | null {
  if (!v.meta || !v.proyeccion_cierre) return null
  if (v.proyeccion_cierre <= v.meta * 1.1) return null

  const exceso = ((v.proyeccion_cierre - v.meta) / v.meta) * 100

  return {
    id: uid('superando'),
    tipo: 'riesgo_vendedor',
    prioridad: 'BAJA',
    emoji: '🏆',
    titulo: `Superando meta — ${v.vendedor}`,
    descripcion: `${v.vendedor} va en camino a superar su meta en ${pct(exceso)} (proyección: ${fmt(v.proyeccion_cierre)} uds vs. meta: ${fmt(v.meta)} uds).`,
    vendedor: v.vendedor,
    valor_numerico: exceso,
  }
}

// ─── INSIGHT 6: MEJOR MOMENTO ────────────────────────────────────────────────

function insightMejorMomento(
  v: VendorAnalysis,
  sales: SaleRecord[],
  selectedPeriod: { year: number; month: number },
  index?: SaleIndex,
): Insight | null {
  const historicos = getMejoresPeriodosVendedor(sales, v.vendedor, selectedPeriod.year, selectedPeriod.month, 6, index)
  if (historicos.length === 0) return null
  const maxHistorico = Math.max(...historicos)
  if (v.ventas_periodo <= maxHistorico) return null

  return {
    id: uid('mejor-momento'),
    tipo: 'riesgo_vendedor',
    prioridad: 'BAJA',
    emoji: '⭐',
    titulo: `Mejor momento — ${v.vendedor}`,
    descripcion: `${v.vendedor} está en su mejor período de los últimos 6 meses con ${fmt(v.ventas_periodo)} uds.`,
    vendedor: v.vendedor,
    valor_numerico: v.ventas_periodo,
  }
}

// ─── INSIGHT 7: CLIENTES DORMIDOS ALTO VALOR ─────────────────────────────────

const RECOVERY_LABEL_TEXTO: Record<ClienteDormido['recovery_label'], string> = {
  alta:        'Alta probabilidad de recuperación',
  recuperable: 'Recuperable con gestión activa',
  dificil:     'Recuperación difícil',
  perdido:     'Cliente posiblemente perdido',
}

function insightsClientesDormidos(clientesDormidos: ClienteDormido[]): Insight[] {
  return clientesDormidos.slice(0, 3).map((c, index) => {
    const ticketPromedio = c.compras_historicas > 0
      ? Math.round(c.valor_historico / c.compras_historicas)
      : 0
    const labelStr = RECOVERY_LABEL_TEXTO[c.recovery_label]
    const esPrioritario = index === 0

    const accion = esPrioritario &&
      (c.recovery_label === 'alta' || c.recovery_label === 'recuperable')
      ? `Primer contacto prioritario — mejor combinación valor/probabilidad del período`
      : c.recovery_label === 'alta' || c.recovery_label === 'recuperable'
        ? `Contactar esta semana — buena probabilidad de reactivación`
        : `Evaluar costo-beneficio antes de invertir en recuperación`

    return {
      id: uid('dormido'),
      tipo: 'riesgo_cliente' as const,
      prioridad: 'ALTA' as const,
      emoji: '😴',
      titulo: `Cliente dormido — ${c.cliente}`,
      descripcion: `${labelStr} — sin actividad hace ${c.dias_sin_actividad} días. Realizó ${c.compras_historicas} compras con ticket promedio de ${fmt(ticketPromedio)} uds. Score de recuperación: ${c.recovery_score}/100.`,
      vendedor: c.vendedor,
      cliente: c.cliente,
      valor_numerico: c.dias_sin_actividad,
      accion_sugerida: accion,
    }
  })
}

// ─── INSIGHT 8: CLIENTE EN DECLIVE ───────────────────────────────────────────

function insightsClienteEnDeclive(
  sales: SaleRecord[],
  selectedPeriod: { year: number; month: number },
  index?: SaleIndex,
): Insight[] {
  const { year, month } = selectedPeriod
  const prev = prevPeriod(year, month)

  const actual: Record<string, { ventas: number; vendedor: string }> = {}
  const periodSalesDecl = index ? byPeriod(index, year, month) : salesInPeriod(sales, year, month)
  periodSalesDecl.forEach((s) => {
    if (!s.cliente) return
    if (!actual[s.cliente]) actual[s.cliente] = { ventas: 0, vendedor: s.vendedor }
    actual[s.cliente].ventas += s.unidades
  })

  const anterior: Record<string, number> = {}
  const prevSalesDecl = index ? byPeriod(index, prev.year, prev.month) : salesInPeriod(sales, prev.year, prev.month)
  prevSalesDecl.forEach((s) => {
    if (!s.cliente) return
    anterior[s.cliente] = (anterior[s.cliente] ?? 0) + s.unidades
  })

  const insights: Insight[] = []
  for (const [cliente, { ventas: ventasActual, vendedor }] of Object.entries(actual)) {
    const ventasAnterior = anterior[cliente] ?? 0
    if (ventasAnterior === 0) continue
    const variacion = ((ventasActual - ventasAnterior) / ventasAnterior) * 100
    if (variacion >= -30) continue

    insights.push({
      id: uid('cliente-declive'),
      tipo: 'riesgo_cliente',
      prioridad: 'ALTA',
      emoji: '📉',
      titulo: `Cliente en declive — ${cliente}`,
      descripcion: `${cliente} redujo sus compras ${pct(variacion)} este período (${fmt(ventasAnterior)} → ${fmt(ventasActual)} uds). Asignado a ${vendedor}.`,
      vendedor,
      cliente,
      valor_numerico: variacion,
      accion_sugerida: 'Ver en Clientes',
    })
  }

  return insights.slice(0, 3)
}

// ─── INSIGHT 9: CONCENTRACIÓN SISTÉMICA ── (INSIGHT #1 DEL DEMO) ─────────────

function insightConcentracionSistemica(
  concentracion: ConcentracionRiesgo[],
  teamStats: TeamStats,
  ventasNetaTop3: number,
  has_venta_neta: boolean,
): Insight | null {
  const top3 = concentracion.slice(0, 3)
  if (top3.length < 2) return null

  const pctTop3 = top3.reduce((a, c) => a + c.pct_del_total, 0)
  if (pctTop3 <= 40) return null

  const ESCENARIO_REDUCCION = 0.30
  const clientePrincipal = top3[0] // mayor ventas_absolutas (ya ordenado por analysis.ts)
  const impactoEscenario = Math.round(clientePrincipal.ventas_absolutas * ESCENARIO_REDUCCION)
  const nombres = top3.map((c) => c.cliente).join(', ')

  const insight: Insight = {
    id: uid('concentracion'),
    tipo: 'riesgo_cliente',
    prioridad: 'CRITICA',
    emoji: '🎯',
    titulo: 'Concentración sistémica de clientes',
    descripcion: `${nombres} concentran el ${pct(pctTop3)} de las ventas. Una reducción del 30% en el cliente principal representaría una pérdida estimada de ${fmt(impactoEscenario)} uds.`,
    valor_numerico: pctTop3,
    accion_sugerida: `Iniciar diversificación — reducir dependencia de ${clientePrincipal.cliente} al menos un 10% en los próximos 3 meses`,
  }
  if (has_venta_neta && ventasNetaTop3 > 0) {
    insight.impacto_economico = {
      valor: impactoEscenario,
      descripcion: `pérdida estimada si el cliente principal reduce un 30% su volumen`,
      tipo: 'riesgo',
    }
  }
  return insight
}

// ─── INSIGHT 10: CLIENTE NUEVO ACTIVO ────────────────────────────────────────

function insightsClienteNuevoActivo(
  sales: SaleRecord[],
  selectedPeriod: { year: number; month: number },
  fechaReferencia: Date,
  index?: SaleIndex,
): Insight[] {
  const { year, month } = selectedPeriod
  const periodSales = index ? byPeriod(index, year, month) : salesInPeriod(sales, year, month)
  const hace28 = new Date(fechaReferencia.getTime() - 28 * 86400000)

  const byCliente: Record<string, { fechas: Date[]; vendedor: string }> = {}
  periodSales.forEach((s) => {
    if (!s.cliente) return
    if (!byCliente[s.cliente]) byCliente[s.cliente] = { fechas: [], vendedor: s.vendedor }
    byCliente[s.cliente].fechas.push(s.fecha)
  })

  const insights: Insight[] = []
  for (const [cliente, { fechas, vendedor }] of Object.entries(byCliente)) {
    // Use index.byClient for fast lookup instead of scanning all sales
    const allClientSales = index ? (index.byClient.get(cliente) ?? []) : sales.filter(s => s.cliente === cliente)
    const primeraGlobal = allClientSales.reduce(
      (min, s) => s.fecha < min ? s.fecha : min,
      fechas[0]
    )

    if (primeraGlobal < hace28) continue
    if (fechas.length < 2) continue

    const diasActivo = Math.floor((fechaReferencia.getTime() - primeraGlobal.getTime()) / 86400000)
    insights.push({
      id: uid('cliente-nuevo'),
      tipo: 'riesgo_cliente',
      prioridad: 'BAJA',
      emoji: '🆕',
      titulo: `Nuevo cliente activo — ${cliente}`,
      descripcion: `Nuevo cliente ${cliente} con ${fechas.length} compras en ${diasActivo} días. Asignado a ${vendedor}.`,
      vendedor,
      cliente,
      valor_numerico: fechas.length,
    })
  }

  return insights.slice(0, 2)
}

// ─── INSIGHT 11: PRODUCTO SIN MOVIMIENTO ─────────────────────────────────────

function insightsProductoSinMovimiento(sales: SaleRecord[], fechaReferencia: Date, index?: SaleIndex): Insight[] {
  const hace15 = new Date(fechaReferencia.getTime() - 15 * 86400000)

  const insights: Insight[] = []

  if (index) {
    for (const [producto, ventasProd] of index.byProduct.entries()) {
      if (ventasProd.some((s) => s.fecha >= hace15)) continue

      let ultima = ventasProd[0]
      for (const s of ventasProd) {
        if (s.fecha > ultima.fecha) ultima = s
      }
      const dias = Math.floor((fechaReferencia.getTime() - ultima.fecha.getTime()) / 86400000)

      insights.push({
        id: uid('prod-sin-mov'),
        tipo: 'riesgo_producto',
        prioridad: 'ALTA',
        emoji: '📦',
        titulo: `Producto sin movimiento — ${producto}`,
        descripcion: `${producto} no registra ventas en ${dias} días. Último vendedor que lo movió: ${ultima.vendedor} hace ${dias} días.`,
        producto,
        vendedor: ultima.vendedor,
        valor_numerico: dias,
      })
    }
  } else {
    const productos = new Set(sales.map((s) => s.producto).filter(Boolean)) as Set<string>
    for (const producto of productos) {
      const ventasProd = sales.filter((s) => s.producto === producto)
      if (ventasProd.some((s) => new Date(s.fecha) >= hace15)) continue

      const sorted = [...ventasProd].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      if (sorted.length === 0) continue

      const ultima = sorted[0]
      const dias = Math.floor((fechaReferencia.getTime() - new Date(ultima.fecha).getTime()) / 86400000)

      insights.push({
        id: uid('prod-sin-mov'),
        tipo: 'riesgo_producto',
        prioridad: 'ALTA',
        emoji: '📦',
        titulo: `Producto sin movimiento — ${producto}`,
        descripcion: `${producto} no registra ventas en ${dias} días. Último vendedor que lo movió: ${ultima.vendedor} hace ${dias} días.`,
        producto,
        vendedor: ultima.vendedor,
        valor_numerico: dias,
      })
    }
  }

  return insights.slice(0, 3)
}

// ─── INSIGHT 12: PRODUCTO EN CAÍDA ───────────────────────────────────────────

function insightsProductoEnCaida(
  sales: SaleRecord[],
  selectedPeriod: { year: number; month: number },
  index?: SaleIndex,
): Insight[] {
  const { year, month } = selectedPeriod
  const prev = prevPeriod(year, month)

  const actual: Record<string, number> = {}
  const periodSalesCaida = index ? byPeriod(index, year, month) : salesInPeriod(sales, year, month)
  periodSalesCaida.forEach((s) => {
    if (!s.producto) return
    actual[s.producto] = (actual[s.producto] ?? 0) + s.unidades
  })
  const anterior: Record<string, number> = {}
  const prevSalesCaida = index ? byPeriod(index, prev.year, prev.month) : salesInPeriod(sales, prev.year, prev.month)
  prevSalesCaida.forEach((s) => {
    if (!s.producto) return
    anterior[s.producto] = (anterior[s.producto] ?? 0) + s.unidades
  })

  const insights: Insight[] = []
  for (const [producto, ventasActual] of Object.entries(actual)) {
    const ventasAnterior = anterior[producto] ?? 0
    if (ventasAnterior === 0) continue
    const variacion = ((ventasActual - ventasAnterior) / ventasAnterior) * 100
    if (variacion >= -25) continue

    insights.push({
      id: uid('prod-caida'),
      tipo: 'riesgo_producto',
      prioridad: 'ALTA',
      emoji: '📉',
      titulo: `Producto en caída — ${producto}`,
      descripcion: `${producto} cayó ${pct(variacion)} este período en todo el equipo (${fmt(ventasAnterior)} → ${fmt(ventasActual)} uds).`,
      producto,
      valor_numerico: variacion,
    })
  }

  return insights.slice(0, 3)
}

// ─── INSIGHT 13: PRODUCTO CONCENTRADO ────────────────────────────────────────

function insightsProductoConcentrado(
  sales: SaleRecord[],
  selectedPeriod: { year: number; month: number },
  index?: SaleIndex,
): Insight[] {
  const periodSales = index ? byPeriod(index, selectedPeriod.year, selectedPeriod.month) : salesInPeriod(sales, selectedPeriod.year, selectedPeriod.month)

  const byProd: Record<string, Record<string, number>> = {}
  periodSales.forEach((s) => {
    if (!s.producto) return
    if (!byProd[s.producto]) byProd[s.producto] = {}
    byProd[s.producto][s.vendedor] = (byProd[s.producto][s.vendedor] ?? 0) + s.unidades
  })

  const insights: Insight[] = []
  for (const [producto, byVendedor] of Object.entries(byProd)) {
    const total = Object.values(byVendedor).reduce((a, b) => a + b, 0)
    const sorted = Object.entries(byVendedor).sort(([, a], [, b]) => b - a)
    const [topVendedor, topVentas] = sorted[0]
    const topPct = (topVentas / total) * 100
    if (topPct <= 70) continue

    insights.push({
      id: uid('prod-concentrado'),
      tipo: 'riesgo_producto',
      prioridad: 'MEDIA',
      emoji: '⚠️',
      titulo: `Producto concentrado — ${producto}`,
      descripcion: `El ${pct(topPct)} de ${producto} lo vende solo ${topVendedor}. Si ese vendedor deja de mover ese producto, perdería su principal canal activo.`,
      producto,
      vendedor: topVendedor,
      valor_numerico: topPct,
    })
  }

  return insights.slice(0, 2)
}

// ─── INSIGHT 14: PRODUCTO EN CRECIMIENTO ─────────────────────────────────────

function insightsProductoEnCrecimiento(
  sales: SaleRecord[],
  selectedPeriod: { year: number; month: number },
  index?: SaleIndex,
): Insight[] {
  const { year, month } = selectedPeriod
  const prev = prevPeriod(year, month)

  const actual: Record<string, number> = {}
  const periodSalesCrecim = index ? byPeriod(index, year, month) : salesInPeriod(sales, year, month)
  periodSalesCrecim.forEach((s) => {
    if (!s.producto) return
    actual[s.producto] = (actual[s.producto] ?? 0) + s.unidades
  })
  const anterior: Record<string, number> = {}
  const prevSalesCrecim = index ? byPeriod(index, prev.year, prev.month) : salesInPeriod(sales, prev.year, prev.month)
  prevSalesCrecim.forEach((s) => {
    if (!s.producto) return
    anterior[s.producto] = (anterior[s.producto] ?? 0) + s.unidades
  })

  const insights: Insight[] = []
  for (const [producto, ventasActual] of Object.entries(actual)) {
    const ventasAnterior = anterior[producto] ?? 0
    if (ventasAnterior === 0) continue
    const variacion = ((ventasActual - ventasAnterior) / ventasAnterior) * 100
    if (variacion <= 30) continue

    insights.push({
      id: uid('prod-crecimiento'),
      tipo: 'riesgo_producto',
      prioridad: 'BAJA',
      emoji: '🚀',
      titulo: `Producto en crecimiento — ${producto}`,
      descripcion: `${producto} creció ${pct(variacion)} este período (${fmt(ventasAnterior)} → ${fmt(ventasActual)} uds).`,
      producto,
      valor_numerico: variacion,
    })
  }

  return insights.slice(0, 2)
}

// ─── INSIGHT 15: EQUIPO NO CERRARÁ META ──────────────────────────────────────

function insightEquipoNoCerraraMeta(teamStats: TeamStats, ticketEquipo: number, has_venta_neta: boolean): Insight | null {
  if (!teamStats.meta_equipo || !teamStats.proyeccion_equipo) return null
  const ratio = teamStats.proyeccion_equipo / teamStats.meta_equipo
  if (ratio >= 0.9) return null

  const brecha = teamStats.meta_equipo - teamStats.proyeccion_equipo
  const ritmoActual = teamStats.dias_transcurridos > 0
    ? teamStats.total_ventas / teamStats.dias_transcurridos : 0
  const ritmoNec = teamStats.dias_restantes > 0 ? brecha / teamStats.dias_restantes : 0

  const insight: Insight = {
    id: uid('equipo-meta'),
    tipo: 'riesgo_meta',
    prioridad: 'CRITICA',
    emoji: '🔴',
    titulo: 'Equipo difícilmente cerrará la meta del mes',
    descripcion: `El equipo proyecta cerrar en ${pct(ratio * 100)} de la meta. Faltan ${fmt(brecha)} uds en ${teamStats.dias_restantes} días. Ritmo necesario: ${fmt(ritmoNec, 1)} uds/día (actual: ${fmt(ritmoActual, 1)}).`,
    valor_numerico: ratio * 100,
    accion_sugerida: 'Ver en Metas',
  }
  if (has_venta_neta && ticketEquipo > 0 && brecha > 0) {
    insight.impacto_economico = {
      valor: Math.round(brecha * ticketEquipo),
      descripcion: 'en ventas proyectadas que no se alcanzarán',
      tipo: 'perdida',
    }
  }
  return insight
}

// ─── INSIGHT 16: META ALCANZABLE CON ESFUERZO ────────────────────────────────

function insightMetaAlcanzable(teamStats: TeamStats): Insight | null {
  if (!teamStats.meta_equipo || !teamStats.proyeccion_equipo) return null
  const ratio = teamStats.proyeccion_equipo / teamStats.meta_equipo
  if (ratio < 0.9 || ratio >= 1.0) return null

  const brecha = teamStats.meta_equipo - teamStats.proyeccion_equipo
  const ritmoActual = teamStats.dias_transcurridos > 0
    ? teamStats.total_ventas / teamStats.dias_transcurridos : 0
  const ritmoNec = teamStats.dias_restantes > 0 ? brecha / teamStats.dias_restantes : 0

  return {
    id: uid('meta-alcanzable'),
    tipo: 'riesgo_meta',
    prioridad: 'ALTA',
    emoji: '🟡',
    titulo: 'Meta alcanzable con esfuerzo',
    descripcion: `El equipo necesita ${fmt(brecha)} uds más en ${teamStats.dias_restantes} días. Es alcanzable si el ritmo sube de ${fmt(ritmoActual, 1)} a ${fmt(ritmoNec, 1)} uds/día.`,
    valor_numerico: ratio * 100,
    accion_sugerida: 'Ver en Metas',
  }
}

// ─── INSIGHT 17: PATRÓN DE SUBEJECUCIÓN ──────────────────────────────────────

function insightsPatronSubejecucion(
  vendorAnalysis: VendorAnalysis[],
  sales: SaleRecord[],
  metas: MetaRecord[],
  selectedPeriod: { year: number; month: number },
  index?: SaleIndex,
): Insight[] {
  const { year, month } = selectedPeriod
  const insights: Insight[] = []

  for (const v of vendorAnalysis) {
    if (!v.meta) continue
    let mesesBajo = 0
    const cumplimientos: number[] = []

    for (let i = 1; i <= 3; i++) {
      let y = year, m = month - i
      while (m < 0) { y--; m += 12 }
      const pk = periodKey(y, m)
      const metaHist = metas.find(
        (mr) => mr.mes_periodo === pk && mr.vendedor.toLowerCase() === v.vendedor.toLowerCase()
      )
      if (!metaHist) continue
      const periodSalesSubej = index ? byPeriod(index, y, m) : salesInPeriod(sales, y, m)
      const ventasHist = periodSalesSubej
        .filter((s) => s.vendedor === v.vendedor)
        .reduce((a, s) => a + s.unidades, 0)
      const cumpl = (ventasHist / metaHist.meta) * 100
      cumplimientos.push(cumpl)
      if (cumpl < 85) mesesBajo++
    }

    if (mesesBajo < 3) continue
    const promCumpl = cumplimientos.reduce((a, b) => a + b, 0) / cumplimientos.length

    insights.push({
      id: uid('subejec'),
      tipo: 'riesgo_meta',
      prioridad: 'ALTA',
      emoji: '🔁',
      titulo: `Patrón de subejecución — ${v.vendedor}`,
      descripcion: `${v.vendedor} ha cerrado bajo meta ${mesesBajo} meses consecutivos. Promedio de cumplimiento: ${promCumpl.toFixed(1)}%.`,
      vendedor: v.vendedor,
      valor_numerico: promCumpl,
      accion_sugerida: 'Ver en Metas',
    })
  }

  return insights
}

// ─── INSIGHT 18: META SUPERADA ────────────────────────────────────────────────

function insightsMetaSuperada(vendorAnalysis: VendorAnalysis[], teamStats: TeamStats): Insight[] {
  if (teamStats.dias_restantes > 0) return []

  return vendorAnalysis
    .filter((v) => v.meta && v.cumplimiento_pct && v.cumplimiento_pct > 110)
    .map((v) => ({
      id: uid('meta-superada'),
      tipo: 'riesgo_meta' as const,
      prioridad: 'BAJA' as const,
      emoji: '🏅',
      titulo: `Meta superada — ${v.vendedor}`,
      descripcion: `${v.vendedor} superó su meta en ${pct((v.cumplimiento_pct ?? 0) - 100)} este período (${fmt(v.ventas_periodo)} uds vs. meta ${fmt(v.meta ?? 0)} uds).`,
      vendedor: v.vendedor,
      valor_numerico: v.cumplimiento_pct,
    }))
}

// ─── INSIGHT 19: DOBLE RIESGO VENDEDOR ───────────────────────────────────────

function insightsDobleRiesgo(
  vendorAnalysis: VendorAnalysis[],
  clientesDormidos: ClienteDormido[],
  config: Configuracion,
  has_venta_neta: boolean,
): Insight[] {
  return vendorAnalysis
    .filter((v) => (v.riesgo === 'critico' || v.riesgo === 'riesgo'))
    .map((v) => {
      const dormidos = clientesDormidos.filter((c) => c.vendedor === v.vendedor)
      if (dormidos.length === 0) return null
      const insight: Insight = {
        id: uid('doble-riesgo'),
        tipo: 'cruzado' as const,
        prioridad: 'CRITICA' as const,
        emoji: '💥',
        titulo: `Doble riesgo — ${v.vendedor}`,
        descripcion: `${v.vendedor} lleva ${v.semanas_bajo_promedio} semanas en racha negativa y tiene ${dormidos.length} cliente(s) sin actividad en los últimos ${config.dias_dormido_threshold} días. El riesgo es acumulativo.`,
        vendedor: v.vendedor,
        valor_numerico: dormidos.length,
        accion_sugerida: 'Ver en Vendedores',
      }
      if (has_venta_neta) {
        const valorDormidos = dormidos.reduce((a, c) => a + c.valor_historico, 0)
        if (valorDormidos > 0) {
          insight.impacto_economico = {
            valor: Math.round(valorDormidos),
            descripcion: 'en cuentas sin actividad asignadas a este vendedor',
            tipo: 'riesgo',
          }
        }
      }
      return insight
    })
    .filter(Boolean) as Insight[]
}

// ─── INSIGHT 20: CAÍDA EXPLICADA ── (INSIGHT #2 DEL DEMO) ────────────────────

function insightsCaidaExplicada(
  vendorAnalysis: VendorAnalysis[],
  sales: SaleRecord[],
  clientesDormidos: ClienteDormido[],
  selectedPeriod: { year: number; month: number },
  has_venta_neta: boolean,
  index?: SaleIndex,
): Insight[] {
  const { year, month } = selectedPeriod
  const prev = prevPeriod(year, month)
  const insights: Insight[] = []

  for (const v of vendorAnalysis) {
    if ((v.periodos_base_promedio ?? 0) < 2) continue
    if (v.variacion_vs_promedio_pct === null || (v.variacion_vs_promedio_pct ?? 0) >= -10) continue
    if (v.ventas_mes_anterior === 0) continue

    const clientesActual: Record<string, number> = {}
    const clientesActualNeta: Record<string, number> = {}
    const periodSalesCaida2 = index ? byPeriod(index, year, month) : salesInPeriod(sales, year, month)
    periodSalesCaida2
      .filter((s) => s.vendedor === v.vendedor)
      .forEach((s) => {
        if (!s.cliente) return
        clientesActual[s.cliente] = (clientesActual[s.cliente] ?? 0) + s.unidades
        clientesActualNeta[s.cliente] = (clientesActualNeta[s.cliente] ?? 0) + (s.venta_neta ?? 0)
      })

    const clientesAnterior: Record<string, number> = {}
    const clientesAnteriorNeta: Record<string, number> = {}
    const prevSalesCaida2 = index ? byPeriod(index, prev.year, prev.month) : salesInPeriod(sales, prev.year, prev.month)
    prevSalesCaida2
      .filter((s) => s.vendedor === v.vendedor)
      .forEach((s) => {
        if (!s.cliente) return
        clientesAnterior[s.cliente] = (clientesAnterior[s.cliente] ?? 0) + s.unidades
        clientesAnteriorNeta[s.cliente] = (clientesAnteriorNeta[s.cliente] ?? 0) + (s.venta_neta ?? 0)
      })

    const caidaTotal = v.ventas_mes_anterior - v.ventas_periodo
    if (caidaTotal <= 0) continue

    const atribuible = Object.entries(clientesAnterior)
      .map(([cliente, ventAnt]) => ({
        cliente,
        caida: ventAnt - (clientesActual[cliente] ?? 0),
        ventasAnterior: ventAnt,
        ventasActual: clientesActual[cliente] ?? 0,
        caidaNeta: (clientesAnteriorNeta[cliente] ?? 0) - (clientesActualNeta[cliente] ?? 0),
      }))
      .filter((x) => x.caida > 0)
      .sort((a, b) => b.caida - a.caida)

    if (atribuible.length === 0) continue
    const top = atribuible[0]
    const pctExplicado = (top.caida / caidaTotal) * 100
    if (pctExplicado <= 50) continue

    const dormido = clientesDormidos.find((c) => c.cliente === top.cliente)

    const insight: Insight = {
      id: uid('caida-explicada'),
      tipo: 'cruzado',
      prioridad: 'CRITICA',
      emoji: '🔍',
      titulo: `Caída explicada — ${v.vendedor}`,
      descripcion: `El ${pct(pctExplicado)} de la caída de ${v.vendedor} proviene de un solo cliente: ${top.cliente}, que redujo sus compras de ${fmt(top.ventasAnterior)} a ${fmt(top.ventasActual)} uds.${dormido ? ` Días sin actividad: ${dormido.dias_sin_actividad}.` : ''}`,
      vendedor: v.vendedor,
      cliente: top.cliente,
      valor_numerico: pctExplicado,
      accion_sugerida: 'Ver en Clientes',
    }
    if (has_venta_neta && top.caidaNeta > 0) {
      insight.impacto_economico = {
        valor: Math.round(top.caidaNeta),
        descripcion: `de caída explicada por ${top.cliente}`,
        tipo: 'perdida',
      }
    }
    insights.push(insight)
  }

  return insights
}

// ─── FUNCIÓN PRINCIPAL ────────────────────────────────────────────────────────

export function generateInsights(
  vendorAnalysis: VendorAnalysis[],
  teamStats: TeamStats,
  sales: SaleRecord[],
  metas: MetaRecord[],
  clientesDormidos: ClienteDormido[],
  concentracion: ConcentracionRiesgo[],
  dataAvailability: DataAvailability,
  config: Configuracion,
  selectedPeriod: { year: number; month: number },
  index?: SaleIndex,
): Insight[] {
  _idCounter = 0

  const fechaReferencia = index && index.fechaReferencia.getTime() > 0
    ? index.fechaReferencia
    : sales.length > 0
      ? sales.reduce((max, s) => s.fecha > max ? s.fecha : max, sales[0].fecha)
      : new Date()

  // ── Pre-computaciones para impacto_economico ──
  const periodSalesAll = index ? byPeriod(index, selectedPeriod.year, selectedPeriod.month) : salesInPeriod(sales, selectedPeriod.year, selectedPeriod.month)
  const ticketEquipo = (() => {
    const u = periodSalesAll.reduce((a, s) => a + s.unidades, 0)
    const n = periodSalesAll.reduce((a, s) => a + (s.venta_neta ?? 0), 0)
    return u > 0 && dataAvailability.has_venta_neta ? n / u : 0
  })()
  const preciosPorVendedor = new Map<string, number>()
  if (dataAvailability.has_venta_neta) {
    for (const v of vendorAnalysis) {
      const vs = periodSalesAll.filter(s => s.vendedor === v.vendedor)
      const u = vs.reduce((a, s) => a + s.unidades, 0)
      const n = vs.reduce((a, s) => a + (s.venta_neta ?? 0), 0)
      preciosPorVendedor.set(v.vendedor, u > 0 ? n / u : ticketEquipo)
    }
  }
  const ventasNetaTop3 = dataAvailability.has_venta_neta && dataAvailability.has_cliente
    ? concentracion.slice(0, 3).reduce((sum, c) => {
        const clientSales = index
          ? (index.byClient.get(c.cliente) ?? []).filter(s => {
              const start = new Date(selectedPeriod.year, selectedPeriod.month, 1)
              const end = new Date(selectedPeriod.year, selectedPeriod.month + 1, 0, 23, 59, 59, 999)
              return s.fecha >= start && s.fecha <= end
            })
          : periodSalesAll.filter(s => s.cliente === c.cliente)
        return sum + clientSales.reduce((a, s) => a + (s.venta_neta ?? 0), 0)
      }, 0)
    : 0

  const all: (Insight | null | Insight[])[] = []

  // ── Riesgo de Vendedor ──
  for (const v of vendorAnalysis) {
    if (dataAvailability.has_metas) all.push(insightMetaEnPeligro(v, teamStats, preciosPorVendedor.get(v.vendedor) ?? 0, dataAvailability.has_venta_neta))
    all.push(insightRachaNegativa(v, config))
    if (dataAvailability.has_cliente) all.push(insightDependenciaCliente(v, sales, selectedPeriod, config, index))
    all.push(insightCaidaAcelerada(v))
    if (dataAvailability.has_metas) all.push(insightSuperandoMeta(v))
    all.push(insightMejorMomento(v, sales, selectedPeriod, index))
  }

  // ── Riesgo de Cliente ──
  if (dataAvailability.has_cliente) {
    all.push(...insightsClientesDormidos(clientesDormidos))
    all.push(...insightsClienteEnDeclive(sales, selectedPeriod, index))
    all.push(insightConcentracionSistemica(concentracion, teamStats, ventasNetaTop3, dataAvailability.has_venta_neta))
    all.push(...insightsClienteNuevoActivo(sales, selectedPeriod, fechaReferencia, index))
  }

  // ── Riesgo de Producto ──
  if (dataAvailability.has_producto) {
    all.push(...insightsProductoSinMovimiento(sales, fechaReferencia, index))
    all.push(...insightsProductoEnCaida(sales, selectedPeriod, index))
    if (dataAvailability.has_cliente) all.push(...insightsProductoConcentrado(sales, selectedPeriod, index))
    all.push(...insightsProductoEnCrecimiento(sales, selectedPeriod, index))
  }

  // ── Riesgo de Meta ──
  if (dataAvailability.has_metas) {
    all.push(insightEquipoNoCerraraMeta(teamStats, ticketEquipo, dataAvailability.has_venta_neta))
    all.push(insightMetaAlcanzable(teamStats))
    all.push(...insightsPatronSubejecucion(vendorAnalysis, sales, metas, selectedPeriod, index))
    all.push(...insightsMetaSuperada(vendorAnalysis, teamStats))
  }

  // ── Cruzados ──
  if (dataAvailability.has_cliente) {
    all.push(...insightsDobleRiesgo(vendorAnalysis, clientesDormidos, config, dataAvailability.has_venta_neta))
    all.push(...insightsCaidaExplicada(vendorAnalysis, sales, clientesDormidos, selectedPeriod, dataAvailability.has_venta_neta, index))
  }

  return sortInsights(all.flat())
}
