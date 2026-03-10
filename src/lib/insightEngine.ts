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
import {
  salesInPeriod,
  prevPeriod,
  periodKey,
  getVentasVendedorPorCliente,
  getMejoresPeriodosVendedor,
} from './analysis'

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
  return (insights.filter(Boolean) as Insight[]).sort(
    (a, b) => PRIORITY_ORDER[a.prioridad] - PRIORITY_ORDER[b.prioridad]
  )
}

// ─── INSIGHT 1: META EN PELIGRO ───────────────────────────────────────────────

function insightMetaEnPeligro(v: VendorAnalysis, teamStats: TeamStats): Insight | null {
  if (!v.meta || !v.proyeccion_cierre) return null
  if (teamStats.dias_restantes <= 5) return null
  if (v.proyeccion_cierre >= v.meta * 0.85) return null

  const pctMeta = (v.proyeccion_cierre / v.meta) * 100
  const ritmo = v.ritmo_necesario ?? 0

  return {
    id: uid('meta-peligro'),
    tipo: 'riesgo_vendedor',
    prioridad: 'CRITICA',
    emoji: '🚨',
    titulo: `Meta en peligro — ${v.vendedor}`,
    descripcion: `${v.vendedor} proyecta cerrar en ${pct(pctMeta)} de su meta. Necesita ${fmt(ritmo, 1)} uds/día para los ${teamStats.dias_restantes} días restantes (meta: ${fmt(v.meta)} uds).`,
    vendedor: v.vendedor,
    valor_numerico: pctMeta,
    accion_sugerida: 'Ver en Metas',
  }
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
): Insight | null {
  if (v.ventas_periodo === 0) return null

  const byCliente = getVentasVendedorPorCliente(sales, v.vendedor, selectedPeriod.year, selectedPeriod.month)
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
    descripcion: `${v.vendedor} genera el ${pct(topPct)} de sus ventas con un solo cliente (${topCliente}). Si ese cliente reduce compras, ${v.vendedor} pierde meta automáticamente.`,
    vendedor: v.vendedor,
    cliente: topCliente,
    valor_numerico: topPct,
    accion_sugerida: 'Ver en Clientes',
  }
}

// ─── INSIGHT 4: CAÍDA ACELERADA ───────────────────────────────────────────────

function insightCaidaAcelerada(v: VendorAnalysis): Insight | null {
  if (v.variacion_pct === null || v.variacion_pct >= -20) return null

  return {
    id: uid('caida'),
    tipo: 'riesgo_vendedor',
    prioridad: 'ALTA',
    emoji: '⬇️',
    titulo: `Caída acelerada — ${v.vendedor}`,
    descripcion: `${v.vendedor} cayó ${pct(v.variacion_pct)} vs. el período anterior (${fmt(v.ventas_mes_anterior)} → ${fmt(v.ventas_periodo)} uds).`,
    vendedor: v.vendedor,
    valor_numerico: v.variacion_pct,
    accion_sugerida: 'Ver en Vendedores',
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
): Insight | null {
  const historicos = getMejoresPeriodosVendedor(sales, v.vendedor, selectedPeriod.year, selectedPeriod.month, 6)
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

function insightsClientesDormidos(clientesDormidos: ClienteDormido[]): Insight[] {
  return clientesDormidos.slice(0, 3).map((c) => ({
    id: uid('dormido'),
    tipo: 'riesgo_cliente' as const,
    prioridad: 'ALTA' as const,
    emoji: '😴',
    titulo: `Cliente dormido — ${c.cliente}`,
    descripcion: `${c.cliente} no compra desde hace ${c.dias_sin_actividad} días. Históricamente generaba ${fmt(c.valor_historico / Math.max(c.compras_historicas, 1), 1)} uds/compra. Vendedor asignado: ${c.vendedor}.`,
    vendedor: c.vendedor,
    cliente: c.cliente,
    valor_numerico: c.dias_sin_actividad,
    accion_sugerida: 'Ver en Clientes',
  }))
}

// ─── INSIGHT 8: CLIENTE EN DECLIVE ───────────────────────────────────────────

function insightsClienteEnDeclive(
  sales: SaleRecord[],
  selectedPeriod: { year: number; month: number },
): Insight[] {
  const { year, month } = selectedPeriod
  const prev = prevPeriod(year, month)

  const actual: Record<string, { ventas: number; vendedor: string }> = {}
  salesInPeriod(sales, year, month).forEach((s) => {
    if (!s.cliente) return
    if (!actual[s.cliente]) actual[s.cliente] = { ventas: 0, vendedor: s.vendedor }
    actual[s.cliente].ventas += s.unidades
  })

  const anterior: Record<string, number> = {}
  salesInPeriod(sales, prev.year, prev.month).forEach((s) => {
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
): Insight | null {
  const top3 = concentracion.slice(0, 3)
  if (top3.length < 2) return null

  const pctTop3 = top3.reduce((a, c) => a + c.pct_del_total, 0)
  if (pctTop3 <= 40) return null

  const impacto30 = Math.round(teamStats.total_ventas * (pctTop3 / 100) * 0.3)
  const nombres = top3.map((c) => c.cliente).join(', ')

  return {
    id: uid('concentracion'),
    tipo: 'riesgo_cliente',
    prioridad: 'CRITICA',
    emoji: '🎯',
    titulo: 'Concentración sistémica de clientes',
    descripcion: `El ${pct(pctTop3)} de las ventas del equipo depende de ${top3.length} clientes (${nombres}). Si cualquiera reduce compras un 30%, el equipo pierde ${fmt(impacto30)} uds en el mes.`,
    valor_numerico: pctTop3,
    accion_sugerida: 'Ver en Clientes',
  }
}

// ─── INSIGHT 10: CLIENTE NUEVO ACTIVO ────────────────────────────────────────

function insightsClienteNuevoActivo(
  sales: SaleRecord[],
  selectedPeriod: { year: number; month: number },
  fechaReferencia: Date,
): Insight[] {
  const { year, month } = selectedPeriod
  const periodSales = salesInPeriod(sales, year, month)
  const hace28 = new Date(fechaReferencia.getTime() - 28 * 86400000)

  const byCliente: Record<string, { fechas: Date[]; vendedor: string }> = {}
  periodSales.forEach((s) => {
    if (!s.cliente) return
    if (!byCliente[s.cliente]) byCliente[s.cliente] = { fechas: [], vendedor: s.vendedor }
    byCliente[s.cliente].fechas.push(s.fecha)
  })

  const insights: Insight[] = []
  for (const [cliente, { fechas, vendedor }] of Object.entries(byCliente)) {
    const primeraGlobal = sales
      .filter((s) => s.cliente === cliente)
      .reduce((min, s) => (s.fecha < min ? s.fecha : min), fechas[0])

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

function insightsProductoSinMovimiento(sales: SaleRecord[], fechaReferencia: Date): Insight[] {
  const hace15 = new Date(fechaReferencia.getTime() - 15 * 86400000)
  const productos = new Set(sales.map((s) => s.producto).filter(Boolean)) as Set<string>

  const insights: Insight[] = []
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

  return insights.slice(0, 3)
}

// ─── INSIGHT 12: PRODUCTO EN CAÍDA ───────────────────────────────────────────

function insightsProductoEnCaida(
  sales: SaleRecord[],
  selectedPeriod: { year: number; month: number },
): Insight[] {
  const { year, month } = selectedPeriod
  const prev = prevPeriod(year, month)

  const actual: Record<string, number> = {}
  salesInPeriod(sales, year, month).forEach((s) => {
    if (!s.producto) return
    actual[s.producto] = (actual[s.producto] ?? 0) + s.unidades
  })
  const anterior: Record<string, number> = {}
  salesInPeriod(sales, prev.year, prev.month).forEach((s) => {
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
): Insight[] {
  const periodSales = salesInPeriod(sales, selectedPeriod.year, selectedPeriod.month)

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
      descripcion: `El ${pct(topPct)} de ${producto} lo vende solo ${topVendedor}. Si ese vendedor sale, el producto pierde su principal canal.`,
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
): Insight[] {
  const { year, month } = selectedPeriod
  const prev = prevPeriod(year, month)

  const actual: Record<string, number> = {}
  salesInPeriod(sales, year, month).forEach((s) => {
    if (!s.producto) return
    actual[s.producto] = (actual[s.producto] ?? 0) + s.unidades
  })
  const anterior: Record<string, number> = {}
  salesInPeriod(sales, prev.year, prev.month).forEach((s) => {
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

function insightEquipoNoCerraraMeta(teamStats: TeamStats): Insight | null {
  if (!teamStats.meta_equipo || !teamStats.proyeccion_equipo) return null
  const ratio = teamStats.proyeccion_equipo / teamStats.meta_equipo
  if (ratio >= 0.9) return null

  const brecha = teamStats.meta_equipo - teamStats.proyeccion_equipo
  const ritmoActual = teamStats.dias_transcurridos > 0
    ? teamStats.total_ventas / teamStats.dias_transcurridos : 0
  const ritmoNec = teamStats.dias_restantes > 0 ? brecha / teamStats.dias_restantes : 0

  return {
    id: uid('equipo-meta'),
    tipo: 'riesgo_meta',
    prioridad: 'CRITICA',
    emoji: '🔴',
    titulo: 'Equipo no cerrará la meta del mes',
    descripcion: `El equipo proyecta cerrar en ${pct(ratio * 100)} de la meta. Faltan ${fmt(brecha)} uds en ${teamStats.dias_restantes} días. Ritmo necesario: ${fmt(ritmoNec, 1)} uds/día (actual: ${fmt(ritmoActual, 1)}).`,
    valor_numerico: ratio * 100,
    accion_sugerida: 'Ver en Metas',
  }
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
      const ventasHist = salesInPeriod(sales, y, m)
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
): Insight[] {
  return vendorAnalysis
    .filter((v) => (v.riesgo === 'critico' || v.riesgo === 'riesgo'))
    .map((v) => {
      const dormidos = clientesDormidos.filter((c) => c.vendedor === v.vendedor)
      if (dormidos.length === 0) return null
      return {
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
    })
    .filter(Boolean) as Insight[]
}

// ─── INSIGHT 20: CAÍDA EXPLICADA ── (INSIGHT #2 DEL DEMO) ────────────────────

function insightsCaidaExplicada(
  vendorAnalysis: VendorAnalysis[],
  sales: SaleRecord[],
  clientesDormidos: ClienteDormido[],
  selectedPeriod: { year: number; month: number },
): Insight[] {
  const { year, month } = selectedPeriod
  const prev = prevPeriod(year, month)
  const insights: Insight[] = []

  for (const v of vendorAnalysis) {
    if (v.variacion_pct === null || v.variacion_pct >= -15) continue
    if (v.ventas_mes_anterior === 0) continue

    const clientesActual: Record<string, number> = {}
    salesInPeriod(sales, year, month)
      .filter((s) => s.vendedor === v.vendedor)
      .forEach((s) => {
        if (!s.cliente) return
        clientesActual[s.cliente] = (clientesActual[s.cliente] ?? 0) + s.unidades
      })

    const clientesAnterior: Record<string, number> = {}
    salesInPeriod(sales, prev.year, prev.month)
      .filter((s) => s.vendedor === v.vendedor)
      .forEach((s) => {
        if (!s.cliente) return
        clientesAnterior[s.cliente] = (clientesAnterior[s.cliente] ?? 0) + s.unidades
      })

    const caidaTotal = v.ventas_mes_anterior - v.ventas_periodo
    if (caidaTotal <= 0) continue

    const atribuible = Object.entries(clientesAnterior)
      .map(([cliente, ventAnt]) => ({
        cliente,
        caida: ventAnt - (clientesActual[cliente] ?? 0),
        ventasAnterior: ventAnt,
        ventasActual: clientesActual[cliente] ?? 0,
      }))
      .filter((x) => x.caida > 0)
      .sort((a, b) => b.caida - a.caida)

    if (atribuible.length === 0) continue
    const top = atribuible[0]
    const pctExplicado = (top.caida / caidaTotal) * 100
    if (pctExplicado <= 50) continue

    const dormido = clientesDormidos.find((c) => c.cliente === top.cliente)

    insights.push({
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
    })
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
): Insight[] {
  _idCounter = 0

  const fechaReferencia = sales.length > 0
    ? sales.reduce((max, s) => s.fecha > max ? s.fecha : max, sales[0].fecha)
    : new Date()

  const all: (Insight | null | Insight[])[] = []

  // ── Riesgo de Vendedor ──
  for (const v of vendorAnalysis) {
    if (dataAvailability.has_metas) all.push(insightMetaEnPeligro(v, teamStats))
    all.push(insightRachaNegativa(v, config))
    if (dataAvailability.has_cliente) all.push(insightDependenciaCliente(v, sales, selectedPeriod, config))
    all.push(insightCaidaAcelerada(v))
    if (dataAvailability.has_metas) all.push(insightSuperandoMeta(v))
    all.push(insightMejorMomento(v, sales, selectedPeriod))
  }

  // ── Riesgo de Cliente ──
  if (dataAvailability.has_cliente) {
    all.push(...insightsClientesDormidos(clientesDormidos))
    all.push(...insightsClienteEnDeclive(sales, selectedPeriod))
    all.push(insightConcentracionSistemica(concentracion, teamStats))
    all.push(...insightsClienteNuevoActivo(sales, selectedPeriod, fechaReferencia))
  }

  // ── Riesgo de Producto ──
  if (dataAvailability.has_producto) {
    all.push(...insightsProductoSinMovimiento(sales, fechaReferencia))
    all.push(...insightsProductoEnCaida(sales, selectedPeriod))
    if (dataAvailability.has_cliente) all.push(...insightsProductoConcentrado(sales, selectedPeriod))
    all.push(...insightsProductoEnCrecimiento(sales, selectedPeriod))
  }

  // ── Riesgo de Meta ──
  if (dataAvailability.has_metas) {
    all.push(insightEquipoNoCerraraMeta(teamStats))
    all.push(insightMetaAlcanzable(teamStats))
    all.push(...insightsPatronSubejecucion(vendorAnalysis, sales, metas, selectedPeriod))
    all.push(...insightsMetaSuperada(vendorAnalysis, teamStats))
  }

  // ── Cruzados ──
  if (dataAvailability.has_cliente) {
    all.push(...insightsDobleRiesgo(vendorAnalysis, clientesDormidos, config))
    all.push(...insightsCaidaExplicada(vendorAnalysis, sales, clientesDormidos, selectedPeriod))
  }

  return sortInsights(all.flat())
}
