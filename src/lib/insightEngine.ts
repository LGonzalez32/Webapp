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
  SupervisorAnalysis,
  CategoriaAnalysis,
  CanalAnalysis,
  CategoriaInventario,
} from '../types'
import {
  salesInPeriod,
  prevPeriod,
  getMejoresPeriodosVendedor,
  buildSaleIndex,
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

function normalizeStr(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

type DormidoNorm = ClienteDormido & { clienteNorm: string }

const PRIORITY_ORDER: Record<InsightPrioridad, number> = {
  CRITICA: 0, ALTA: 1, MEDIA: 2, BAJA: 3,
}

function sortInsights(insights: (Insight | null)[]): Insight[] {
  return (insights.filter(Boolean) as Insight[]).sort((a, b) => {
    const pDiff = PRIORITY_ORDER[a.prioridad] - PRIORITY_ORDER[b.prioridad]
    if (pDiff !== 0) return pDiff
    return (b.impacto_economico?.valor ?? 0) - (a.impacto_economico?.valor ?? 0)
  })
}

// ─── GRUPO 1 — META INDIVIDUAL ────────────────────────────────────────────────

// INSIGHT 1 — Meta en peligro
function insightMetaEnPeligro(
  v: VendorAnalysis,
  teamStats: TeamStats,
  sales: SaleRecord[],
  sp: { year: number; month: number },
  da: DataAvailability,
  ticketVendedor: number,
): Insight | null {
  if (!v.meta || !v.proyeccion_cierre) return null
  if (teamStats.dias_restantes <= 5) return null
  if (v.proyeccion_cierre >= v.meta * 0.85) return null

  const brecha = v.meta - v.proyeccion_cierre
  const pctMeta = (v.proyeccion_cierre / v.meta) * 100
  const { year, month } = sp
  const prevYear = { year: year - 1, month }

  const accionParts: string[] = []

  if (da.has_cliente) {
    const prevYearSales = salesInPeriod(sales, prevYear.year, prevYear.month)
      .filter(s => s.vendedor === v.vendedor && s.cliente)
    const currentClients = new Set(
      salesInPeriod(sales, year, month)
        .filter(s => s.vendedor === v.vendedor && s.cliente)
        .map(s => s.cliente!)
    )
    const clientesPrevYear: Record<string, number> = {}
    for (const s of prevYearSales) {
      if (s.cliente && !currentClients.has(s.cliente)) {
        clientesPrevYear[s.cliente] = (clientesPrevYear[s.cliente] ?? 0) + s.unidades
      }
    }
    const topAusente = Object.entries(clientesPrevYear).sort(([, a], [, b]) => b - a)[0]
    if (topAusente) {
      accionParts.push(`Contactar ${topAusente[0]} — compró ${fmt(topAusente[1])} uds en ${month + 1}/${year - 1}`)
    }
  }

  if (da.has_producto) {
    const prodVol: Record<string, number> = {}
    for (const s of sales.filter(s => s.vendedor === v.vendedor && s.producto)) {
      prodVol[s.producto!] = (prodVol[s.producto!] ?? 0) + s.unidades
    }
    const topProd = Object.entries(prodVol).sort(([, a], [, b]) => b - a)[0]
    if (topProd) accionParts.push(`Ofrecer ${topProd[0]}`)
  }

  if (da.has_canal && v.canal_principal) {
    accionParts.push(`por ${v.canal_principal}`)
  }

  const insight: Insight = {
    id: uid('meta-peligro'),
    tipo: 'riesgo_vendedor',
    prioridad: 'CRITICA',
    emoji: '🚨',
    titulo: `Meta en peligro — ${v.vendedor}`,
    descripcion: `${v.vendedor} proyecta cerrar ${fmt(v.proyeccion_cierre)} uds de ${fmt(v.meta)} uds. Brecha: ${fmt(brecha)} uds. Quedan ${teamStats.dias_restantes} días.`,
    vendedor: v.vendedor,
    valor_numerico: pctMeta,
    accion_sugerida: accionParts.length > 0 ? accionParts.join(' — ') : `Necesita ${fmt(brecha)} uds en ${teamStats.dias_restantes} días`,
  }
  if (da.has_venta_neta && ticketVendedor > 0 && brecha > 0) {
    insight.impacto_economico = {
      valor: Math.round(brecha * ticketVendedor),
      descripcion: 'Ingreso en riesgo si no se actúa',
      tipo: 'perdida',
    }
  }
  return insight
}

// INSIGHT 2 — Estado de meta del equipo
function insightEstadoMetaEquipo(
  teamStats: TeamStats,
  vendorAnalysis: VendorAnalysis[],
  sales: SaleRecord[],
  sp: { year: number; month: number },
  da: DataAvailability,
  ticketEquipo: number,
): Insight | null {
  if (!teamStats.meta_equipo || !teamStats.proyeccion_equipo) return null
  const ratio = teamStats.proyeccion_equipo / teamStats.meta_equipo
  if (ratio >= 0.99) return null

  const prioridad: InsightPrioridad = ratio < 0.90 ? 'CRITICA' : 'ALTA'
  const brecha = teamStats.meta_equipo - teamStats.proyeccion_equipo
  const { year, month } = sp

  let desc = `El equipo proyecta ${fmt(teamStats.proyeccion_equipo)} uds de ${fmt(teamStats.meta_equipo)} uds este mes. `
  desc += prioridad === 'CRITICA'
    ? 'No se cerrará la meta con el ritmo actual. '
    : 'La meta es alcanzable con esfuerzo concentrado. '
  desc += `Brecha: ${fmt(brecha)} uds en ${teamStats.dias_restantes} días restantes.`

  const accionParts: string[] = []

  // Capa vendedores: top 2 más cercanos a meta
  const cercanos = vendorAnalysis
    .filter(v => v.meta && v.proyeccion_cierre && v.proyeccion_cierre < v.meta)
    .map(v => ({ v, ratio: v.proyeccion_cierre! / v.meta!, falta: v.meta! - v.proyeccion_cierre! }))
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 2)
  for (const { v, falta } of cercanos) {
    accionParts.push(`${v.vendedor} necesita ${fmt(falta)} uds — al ${((v.proyeccion_cierre! / v.meta!) * 100).toFixed(0)}%`)
  }

  // Capa clientes: historial año anterior sin compra aún
  if (da.has_cliente) {
    const prevYear = { year: year - 1, month }
    const currentClients = new Set(salesInPeriod(sales, year, month).map(s => s.cliente).filter(Boolean))
    const clientesPrevYear: Record<string, number> = {}
    salesInPeriod(sales, prevYear.year, prevYear.month).forEach(s => {
      if (s.cliente && !currentClients.has(s.cliente)) {
        clientesPrevYear[s.cliente] = (clientesPrevYear[s.cliente] ?? 0) + s.unidades
      }
    })
    const topClientes = Object.entries(clientesPrevYear).sort(([, a], [, b]) => b - a).slice(0, 3)
    if (topClientes.length > 0) {
      accionParts.push(`Sin compra aún este mes (compraron en ${month + 1}/${year - 1}): ${topClientes.map(([c, u]) => `${c} (${fmt(u)} uds)`).join(', ')}`)
    }
  }

  // Capa productos: mayor cierre histórico
  if (da.has_producto) {
    const prodVol: Record<string, number> = {}
    for (let i = 1; i <= 6; i++) {
      let y = year, m = month - i
      while (m < 0) { y--; m += 12 }
      salesInPeriod(sales, y, m).forEach(s => {
        if (s.producto) prodVol[s.producto] = (prodVol[s.producto] ?? 0) + s.unidades
      })
    }
    const topProds = Object.entries(prodVol).sort(([, a], [, b]) => b - a).slice(0, 3).map(([p]) => p)
    if (topProds.length > 0) accionParts.push(`Productos con mayor cierre histórico: ${topProds.join(', ')}`)
  }

  const insight: Insight = {
    id: uid('equipo-meta'),
    tipo: 'riesgo_equipo',
    prioridad,
    emoji: prioridad === 'CRITICA' ? '🔴' : '🟡',
    titulo: prioridad === 'CRITICA' ? 'Equipo no cerrará la meta del mes' : 'Meta alcanzable con esfuerzo',
    descripcion: desc,
    valor_numerico: ratio * 100,
    accion_sugerida: accionParts.slice(0, 3).join(' | '),
  }
  if (da.has_venta_neta && ticketEquipo > 0 && brecha > 0) {
    insight.impacto_economico = {
      valor: Math.round(brecha * ticketEquipo),
      descripcion: 'en ventas proyectadas que no se alcanzarán',
      tipo: 'perdida',
    }
  }
  return insight
}

// ─── GRUPO 2 — DETERIORO VENDEDOR ────────────────────────────────────────────

// INSIGHT 3 — Vendedor en deterioro
function insightVendedorDeteriorado(
  v: VendorAnalysis,
  sales: SaleRecord[],
  sp: { year: number; month: number },
  da: DataAvailability,
): Insight | null {
  const { year, month } = sp

  // Pattern B: variacion_vs_promedio_pct < -15 (stores as %)
  const patternB = (v.variacion_vs_promedio_pct ?? 0) < -15 && (v.periodos_base_promedio ?? 0) >= 2

  // Pattern A: 2 consecutive months below historical avg
  let patternA = false
  if (v.promedio_3m && v.promedio_3m > 0) {
    const prev1 = prevPeriod(year, month)
    const ventasPrev1 = salesInPeriod(sales, prev1.year, prev1.month)
      .filter(s => s.vendedor === v.vendedor)
      .reduce((a, s) => a + s.unidades, 0)
    patternA = v.ventas_periodo < v.promedio_3m && ventasPrev1 > 0 && ventasPrev1 < v.promedio_3m
  }

  if (!patternA && !patternB) return null

  const prioridad: InsightPrioridad = (patternA && patternB) ? 'CRITICA' : 'ALTA'

  let descBase = `${v.vendedor} `
  if (patternA && patternB) {
    descBase += `lleva 2 meses bajo su promedio y cayó ${pct(Math.abs(v.variacion_vs_promedio_pct ?? 0))} vs su promedio histórico.`
  } else if (patternA) {
    descBase += `lleva 2 meses consecutivos bajo su promedio histórico (${fmt(v.promedio_3m ?? 0)} uds/mes).`
  } else {
    descBase += `cayó ${pct(Math.abs(v.variacion_vs_promedio_pct ?? 0))} vs su promedio de los últimos ${v.periodos_base_promedio ?? 3} períodos.`
  }

  const diagParts: string[] = []

  if (da.has_cliente) {
    const prev1 = prevPeriod(year, month)
    const curByClient: Record<string, number> = {}
    const prevByClient: Record<string, number> = {}
    salesInPeriod(sales, year, month).filter(s => s.vendedor === v.vendedor && s.cliente)
      .forEach(s => { curByClient[s.cliente!] = (curByClient[s.cliente!] ?? 0) + s.unidades })
    salesInPeriod(sales, prev1.year, prev1.month).filter(s => s.vendedor === v.vendedor && s.cliente)
      .forEach(s => { prevByClient[s.cliente!] = (prevByClient[s.cliente!] ?? 0) + s.unidades })

    const caidaTotal = Object.entries(prevByClient).reduce((a, [c, u]) => a + Math.max(0, u - (curByClient[c] ?? 0)), 0)
    if (caidaTotal > 0) {
      const top = Object.entries(prevByClient)
        .map(([c, u]) => ({ c, caida: Math.max(0, u - (curByClient[c] ?? 0)) }))
        .sort((a, b) => b.caida - a.caida)[0]
      if (top && top.caida > 0) {
        const pctExp = (top.caida / (v.ventas_mes_anterior || caidaTotal)) * 100
        diagParts.push(`${top.c} explica el ${pct(pctExp)} de la caída`)
      }
    }
  }

  if (da.has_producto) {
    const prev1 = prevPeriod(year, month)
    const curByProd: Record<string, number> = {}
    const prevByProd: Record<string, number> = {}
    salesInPeriod(sales, year, month).filter(s => s.vendedor === v.vendedor && s.producto)
      .forEach(s => { curByProd[s.producto!] = (curByProd[s.producto!] ?? 0) + s.unidades })
    salesInPeriod(sales, prev1.year, prev1.month).filter(s => s.vendedor === v.vendedor && s.producto)
      .forEach(s => { prevByProd[s.producto!] = (prevByProd[s.producto!] ?? 0) + s.unidades })
    const topProd = Object.entries(prevByProd)
      .map(([p, u]) => ({ p, caida: u > 0 ? ((u - (curByProd[p] ?? 0)) / u) * 100 : 0 }))
      .filter(x => x.caida > 0)
      .sort((a, b) => b.caida - a.caida)[0]
    if (topProd) diagParts.push(`${topProd.p} bajó ${pct(topProd.caida)} vs período anterior`)
  }

  if (da.has_metas && v.cumplimiento_pct != null) {
    diagParts.push(`Proyección actual: ${v.cumplimiento_pct.toFixed(1)}% de meta`)
  }

  return {
    id: uid('deterioro'),
    tipo: 'riesgo_vendedor',
    prioridad,
    emoji: prioridad === 'CRITICA' ? '🚨' : '📉',
    titulo: `Vendedor en deterioro — ${v.vendedor}`,
    descripcion: descBase + (diagParts.length > 0 ? ' ' + diagParts.join('. ') + '.' : ''),
    vendedor: v.vendedor,
    valor_numerico: Math.abs(v.variacion_vs_promedio_pct ?? 0),
  }
}

// INSIGHT 4 — Patrón de subejecución
function insightPatronSubejecucion(
  v: VendorAnalysis,
  sales: SaleRecord[],
  metas: MetaRecord[],
  sp: { year: number; month: number },
  da: DataAvailability,
): Insight | null {
  if (!v.meta) return null
  const { year, month } = sp

  let mesesBajo = 0
  const cumplimientos: Array<{ label: string; pct: number }> = []

  for (let i = 1; i <= 3; i++) {
    let y = year, m = month - i
    while (m < 0) { y--; m += 12 }
    const metaHist = metas.find(mr =>
      mr.anio === y && mr.mes === m + 1 &&
      normalizeStr(mr.vendedor ?? '') === normalizeStr(v.vendedor)
    )
    if (!metaHist) continue
    const ventasHist = salesInPeriod(sales, y, m)
      .filter(s => s.vendedor === v.vendedor)
      .reduce((a, s) => a + s.unidades, 0)
    const cumpl = (ventasHist / metaHist.meta) * 100
    cumplimientos.unshift({ label: `${m + 1}/${y}`, pct: cumpl })
    if (cumpl < 85) mesesBajo++
  }

  if (mesesBajo < 3) return null

  const histDesc = cumplimientos.map(x => `${x.label}: ${x.pct.toFixed(0)}%`).join(' · ')
  const diagParts: string[] = []

  if (da.has_cliente) {
    let y3 = year, m3 = month - 3
    while (m3 < 0) { y3--; m3 += 12 }
    const clientesBefore = new Set(
      salesInPeriod(sales, y3, m3).filter(s => s.vendedor === v.vendedor && s.cliente).map(s => s.cliente!)
    )
    const clientesCurrent = new Set(
      salesInPeriod(sales, year, month).filter(s => s.vendedor === v.vendedor && s.cliente).map(s => s.cliente!)
    )
    const perdidos = [...clientesBefore].filter(c => !clientesCurrent.has(c))
    if (perdidos.length > 0) diagParts.push(`Clientes que tenía hace 3 meses y ya no aparecen: ${perdidos.slice(0, 3).join(', ')}`)
  }

  if (da.has_producto) {
    let y3 = year, m3 = month - 3
    while (m3 < 0) { y3--; m3 += 12 }
    const prodsBefore = new Set(
      salesInPeriod(sales, y3, m3).filter(s => s.vendedor === v.vendedor && s.producto).map(s => s.producto!)
    )
    const prodsCurrent = new Set(
      salesInPeriod(sales, year, month).filter(s => s.vendedor === v.vendedor && s.producto).map(s => s.producto!)
    )
    const perdidos = [...prodsBefore].filter(p => !prodsCurrent.has(p))
    if (perdidos.length > 0) diagParts.push(`Productos que vendía hace 3 meses y dejó de vender: ${perdidos.slice(0, 3).join(', ')}`)
  }

  return {
    id: uid('subejec'),
    tipo: 'riesgo_vendedor',
    prioridad: 'ALTA',
    emoji: '🔁',
    titulo: `Patrón de subejecución — ${v.vendedor}`,
    descripcion: `${v.vendedor} lleva 3 meses consecutivos bajo el 85% de su meta: ${histDesc}.${diagParts.length > 0 ? ' ' + diagParts.join('. ') + '.' : ''}`,
    vendedor: v.vendedor,
    valor_numerico: cumplimientos.reduce((a, x) => a + x.pct, 0) / (cumplimientos.length || 1),
  }
}

// ─── GRUPO 3 — CLIENTES ───────────────────────────────────────────────────────

// INSIGHT 5 — Clientes en riesgo (dormidos + declive)
function insightClientesEnRiesgo(
  clientesDormidos: ClienteDormido[],
  sales: SaleRecord[],
  sp: { year: number; month: number },
  da: DataAvailability,
): Insight[] {
  const { year, month } = sp
  const prevYear = { year: year - 1, month }

  type CR = {
    tipo: 'dormido' | 'declive'
    cliente: string
    vendedor: string
    priority: number
    diasSin?: number
    caida?: number
    histUnidades?: number
    dormidoRef?: ClienteDormido
  }

  const riesgoList: CR[] = []

  for (const c of clientesDormidos) {
    riesgoList.push({
      tipo: 'dormido', cliente: c.cliente, vendedor: c.vendedor,
      priority: c.recovery_score * (c.dias_sin_actividad / 30),
      diasSin: c.dias_sin_actividad, dormidoRef: c,
    })
  }

  const currentByClient: Record<string, { ventas: number; vendedor: string }> = {}
  const prevYearByClient: Record<string, number> = {}
  salesInPeriod(sales, year, month).forEach(s => {
    if (!s.cliente) return
    if (!currentByClient[s.cliente]) currentByClient[s.cliente] = { ventas: 0, vendedor: s.vendedor }
    currentByClient[s.cliente].ventas += s.unidades
  })
  salesInPeriod(sales, prevYear.year, prevYear.month).forEach(s => {
    if (!s.cliente) return
    prevYearByClient[s.cliente] = (prevYearByClient[s.cliente] ?? 0) + s.unidades
  })

  for (const [cliente, { ventas, vendedor }] of Object.entries(currentByClient)) {
    const prevVentas = prevYearByClient[cliente] ?? 0
    if (prevVentas === 0) continue
    const caida = ((ventas - prevVentas) / prevVentas) * 100
    if (caida >= -30) continue
    if (riesgoList.some(r => normalizeStr(r.cliente) === normalizeStr(cliente))) continue
    riesgoList.push({
      tipo: 'declive', cliente, vendedor,
      priority: Math.abs(caida) * (prevVentas / 1000),
      caida, histUnidades: prevVentas,
    })
  }

  riesgoList.sort((a, b) => b.priority - a.priority)
  const top5 = riesgoList.slice(0, 5)
  if (top5.length === 0) return []

  let totalImpacto = 0
  const insights: Insight[] = top5.map(cr => {
    let desc = ''
    if (cr.tipo === 'dormido' && cr.dormidoRef) {
      const d = cr.dormidoRef
      desc = `${d.cliente} · ${d.dias_sin_actividad} días sin comprar (frecuencia esperada: ${d.frecuencia_esperada_dias ?? 'N/A'} días). Recovery: ${d.recovery_label} (${d.recovery_score}/100).`
      if (da.has_venta_neta) totalImpacto += d.valor_historico
    } else {
      desc = `${cr.cliente} · Cayó ${pct(Math.abs(cr.caida ?? 0))} vs ${month + 1}/${year - 1}. Compraba ${fmt(cr.histUnidades ?? 0)} uds en ese mes.`
    }
    return {
      id: uid('cliente-riesgo'),
      tipo: 'riesgo_cliente' as const,
      prioridad: 'ALTA' as const,
      emoji: cr.tipo === 'dormido' ? '😴' : '📉',
      titulo: cr.tipo === 'dormido' ? `Cliente dormido — ${cr.cliente}` : `Cliente en declive — ${cr.cliente}`,
      descripcion: desc,
      vendedor: cr.vendedor,
      cliente: cr.cliente,
      valor_numerico: cr.diasSin ?? Math.abs(cr.caida ?? 0),
    }
  })

  if (da.has_venta_neta && totalImpacto > 0 && insights[0]) {
    insights[0].impacto_economico = {
      valor: Math.round(totalImpacto),
      descripcion: 'en cuentas de clientes en riesgo',
      tipo: 'riesgo',
    }
  }

  return insights
}

// INSIGHT 6 — Concentración y dependencia de cartera
function insightConcentracionCartera(
  concentracion: ConcentracionRiesgo[],
  vendorAnalysis: VendorAnalysis[],
  sales: SaleRecord[],
  sp: { year: number; month: number },
  da: DataAvailability,
  config: Configuracion,
): Insight[] {
  const { year, month } = sp
  const periodSales = salesInPeriod(sales, year, month)
  const insights: Insight[] = []

  // Nivel equipo (top 3 > 40%)
  const top3 = concentracion.slice(0, 3)
  if (top3.length >= 2) {
    const pctTop3 = top3.reduce((a, c) => a + c.pct_del_total, 0)
    if (pctTop3 > 40) {
      const prioridad: InsightPrioridad = pctTop3 > 60 ? 'CRITICA' : 'ALTA'
      const detalle = top3.map(c => `${c.cliente}: ${c.pct_del_total.toFixed(1)}%`).join(' · ')
      const vendedoresExpuestos = [...new Set(top3.flatMap(c => c.vendedores_involucrados))]
      const insight: Insight = {
        id: uid('conc-equipo'),
        tipo: 'riesgo_cliente',
        prioridad,
        emoji: '🎯',
        titulo: 'Concentración sistémica de clientes',
        descripcion: `Top 3 clientes = ${pct(pctTop3)} de ventas totales. ${detalle}. Vendedores expuestos: ${vendedoresExpuestos.join(', ')}.`,
        valor_numerico: pctTop3,
      }
      if (da.has_venta_neta && concentracion[0]) {
        insight.impacto_economico = {
          valor: Math.round(concentracion[0].ventas_absolutas * 0.3),
          descripcion: 'pérdida estimada si el cliente principal reduce 30% su volumen',
          tipo: 'riesgo',
        }
      }
      insights.push(insight)
    }
  }

  // Nivel vendedor (1 cliente > threshold)
  for (const v of vendorAnalysis) {
    if (v.ventas_periodo === 0) continue
    const byCliente: Record<string, number> = {}
    periodSales.filter(s => s.vendedor === v.vendedor && s.cliente)
      .forEach(s => { byCliente[s.cliente!] = (byCliente[s.cliente!] ?? 0) + s.unidades })
    const sorted = Object.entries(byCliente).sort(([, a], [, b]) => b - a)
    if (sorted.length === 0) continue
    const [topCliente, topVentas] = sorted[0]
    const topPct = (topVentas / v.ventas_periodo) * 100
    if (topPct <= config.pct_concentracion_threshold) continue

    const insight: Insight = {
      id: uid('conc-vendedor'),
      tipo: 'riesgo_cliente',
      prioridad: 'ALTA',
      emoji: '⚠️',
      titulo: `Dependencia de cliente — ${v.vendedor}`,
      descripcion: `${v.vendedor} concentra el ${pct(topPct)} de sus ventas en ${topCliente}. Si este cliente para: impacto de ${fmt(topVentas)} uds/mes.`,
      vendedor: v.vendedor,
      cliente: topCliente,
      valor_numerico: topPct,
    }
    if (da.has_venta_neta) {
      const topNeta = periodSales.filter(s => s.vendedor === v.vendedor && s.cliente === topCliente)
        .reduce((a, s) => a + (s.venta_neta ?? 0), 0)
      if (topNeta > 0) {
        insight.impacto_economico = {
          valor: Math.round(topNeta),
          descripcion: 'en ventas concentradas en un solo cliente',
          tipo: 'riesgo',
        }
      }
    }
    insights.push(insight)
  }

  return insights
}

// INSIGHT 7 — Cliente nuevo activo (BAJA)
function insightClienteNuevoActivo(
  sales: SaleRecord[],
  sp: { year: number; month: number },
  fechaRef: Date,
): Insight[] {
  const { year, month } = sp
  const periodSales = salesInPeriod(sales, year, month)
  const hace28 = new Date(fechaRef.getTime() - 28 * 86400000)

  const byCliente: Record<string, { fechas: Date[]; vendedor: string }> = {}
  periodSales.forEach(s => {
    if (!s.cliente) return
    if (!byCliente[s.cliente]) byCliente[s.cliente] = { fechas: [], vendedor: s.vendedor }
    byCliente[s.cliente].fechas.push(s.fecha)
  })

  const insights: Insight[] = []
  for (const [cliente, { fechas, vendedor }] of Object.entries(byCliente)) {
    const allClientSales = sales.filter(s => s.cliente === cliente)
    const primeraGlobal = allClientSales.reduce((min, s) => s.fecha < min ? s.fecha : min, fechas[0])
    if (primeraGlobal < hace28) continue
    if (fechas.length < 2) continue
    const diasActivo = Math.floor((fechaRef.getTime() - primeraGlobal.getTime()) / 86400000)
    insights.push({
      id: uid('cliente-nuevo'),
      tipo: 'riesgo_cliente',
      prioridad: 'BAJA',
      emoji: '🆕',
      titulo: `Nuevo cliente activo — ${cliente}`,
      descripcion: `${cliente} realizó ${fechas.length} compras en ${diasActivo} días. Asignado a ${vendedor}.`,
      vendedor, cliente,
      valor_numerico: fechas.length,
    })
  }
  return insights.slice(0, 2)
}

// ─── GRUPO 4 — PRODUCTOS ──────────────────────────────────────────────────────

// INSIGHT 8 — Productos en riesgo (sin movimiento + caída)
function insightProductosEnRiesgo(
  sales: SaleRecord[],
  sp: { year: number; month: number },
  categoriasInventario: CategoriaInventario[],
  da: DataAvailability,
  fechaRef: Date,
): Insight[] {
  const { year, month } = sp
  const prevYear = { year: year - 1, month }
  const hace60 = new Date(fechaRef.getTime() - 60 * 86400000)

  type PR = {
    tipo: 'sin_movimiento' | 'caida'
    producto: string
    vendedor?: string
    cliente?: string
    diasSin?: number
    caida?: number
    ventasAnterior?: number
    unidadesActuales?: number
    diasInventario?: number
  }

  const lista: PR[] = []
  const yaRegistrados = new Set<string>()

  if (da.has_producto) {
    const productosSales = new Map<string, SaleRecord[]>()
    for (const s of sales) {
      if (!s.producto) continue
      const arr = productosSales.get(s.producto) ?? []
      arr.push(s)
      productosSales.set(s.producto, arr)
    }
    for (const [producto, ventasProd] of productosSales.entries()) {
      const ultima = ventasProd.reduce((mx, s) => s.fecha > mx.fecha ? s : mx, ventasProd[0])
      if (ultima.fecha >= hace60) continue
      const dias = Math.floor((fechaRef.getTime() - ultima.fecha.getTime()) / 86400000)
      const inv = categoriasInventario.find(c => normalizeStr(c.producto) === normalizeStr(producto))
      lista.push({
        tipo: 'sin_movimiento', producto, vendedor: ultima.vendedor, cliente: ultima.cliente,
        diasSin: dias, unidadesActuales: inv?.unidades_actuales, diasInventario: inv?.dias_inventario,
      })
      yaRegistrados.add(normalizeStr(producto))
    }
  }

  if (da.has_producto) {
    const curByProd: Record<string, { ventas: number; vendedor: string }> = {}
    const prevYearByProd: Record<string, number> = {}
    salesInPeriod(sales, year, month).forEach(s => {
      if (!s.producto) return
      if (!curByProd[s.producto]) curByProd[s.producto] = { ventas: 0, vendedor: s.vendedor }
      curByProd[s.producto].ventas += s.unidades
    })
    salesInPeriod(sales, prevYear.year, prevYear.month).forEach(s => {
      if (!s.producto) return
      prevYearByProd[s.producto] = (prevYearByProd[s.producto] ?? 0) + s.unidades
    })
    for (const [producto, { ventas, vendedor }] of Object.entries(curByProd)) {
      if (yaRegistrados.has(normalizeStr(producto))) continue
      const prevVentas = prevYearByProd[producto] ?? 0
      if (prevVentas === 0) continue
      const caida = ((ventas - prevVentas) / prevVentas) * 100
      if (caida >= -25) continue
      lista.push({ tipo: 'caida', producto, vendedor, caida, ventasAnterior: prevVentas })
    }
  }

  const sinMov = lista.filter(p => p.tipo === 'sin_movimiento').sort((a, b) => (b.diasSin ?? 0) - (a.diasSin ?? 0))
  const caidaList = lista.filter(p => p.tipo === 'caida').sort((a, b) => (a.caida ?? 0) - (b.caida ?? 0))

  return [...sinMov, ...caidaList].slice(0, 5).map(pr => {
    let desc = ''
    if (pr.tipo === 'sin_movimiento') {
      desc = `${pr.producto} · Sin ventas en ${pr.diasSin} días.`
      if (pr.vendedor) desc += ` Última venta: ${pr.vendedor}`
      if (pr.cliente) desc += ` a ${pr.cliente}`
      if (da.has_inventario && pr.unidadesActuales != null) {
        desc += `. Stock: ${fmt(pr.unidadesActuales)} uds (${pr.diasInventario} días sin rotación)`
      }
    } else {
      desc = `${pr.producto} · Cayó ${pct(Math.abs(pr.caida ?? 0))} vs ${month + 1}/${year - 1} (vendía ${fmt(pr.ventasAnterior ?? 0)} uds).`
    }
    return {
      id: uid('prod-riesgo'),
      tipo: 'riesgo_producto' as const,
      prioridad: 'ALTA' as const,
      emoji: pr.tipo === 'sin_movimiento' ? '📦' : '📉',
      titulo: pr.tipo === 'sin_movimiento' ? `Producto sin movimiento — ${pr.producto}` : `Producto en caída — ${pr.producto}`,
      descripcion: desc,
      producto: pr.producto,
      vendedor: pr.vendedor,
      valor_numerico: pr.diasSin ?? Math.abs(pr.caida ?? 0),
    }
  })
}

// INSIGHT 9 — Vendedor mono-categoría (mejorado)
function insightVendedorMonoCategoria(
  vendorAnalysis: VendorAnalysis[],
  sales: SaleRecord[],
  sp: { year: number; month: number },
  categoriaAnalysis: CategoriaAnalysis[],
  da: DataAvailability,
): Insight[] {
  const { year, month } = sp
  const periodSales = salesInPeriod(sales, year, month)
  const allProds = new Set(periodSales.filter(s => s.producto).map(s => s.producto!))

  type Mono = { v: VendorAnalysis; categoria: string; pctCat: number }
  const monos: Mono[] = []

  for (const v of vendorAnalysis) {
    const vSales = periodSales.filter(s => s.vendedor === v.vendedor && s.categoria)
    if (vSales.length === 0) continue
    const totalUnits = vSales.reduce((a, s) => a + s.unidades, 0)
    if (totalUnits === 0) continue
    const catMap = new Map<string, number>()
    for (const s of vSales) catMap.set(s.categoria!, (catMap.get(s.categoria!) ?? 0) + s.unidades)
    const [topCat, topUnits] = [...catMap.entries()].sort((a, b) => b[1] - a[1])[0]
    const pctCat = (topUnits / totalUnits) * 100
    if (pctCat >= 85) monos.push({ v, categoria: topCat, pctCat })
  }

  monos.sort((a, b) => b.pctCat - a.pctCat)

  return monos.slice(0, 3).map(({ v, categoria, pctCat }) => {
    const catInfo = categoriaAnalysis.find(c => normalizeStr(c.categoria) === normalizeStr(categoria))
    const parts: string[] = [`${v.vendedor} genera el ${pct(pctCat)} de sus ventas en "${categoria}".`]

    if (catInfo) {
      parts.push(`Tendencia: ${catInfo.tendencia}. Representa el ${catInfo.participacion_pct.toFixed(1)}% del portafolio total.`)
    }

    if (da.has_producto) {
      const vProds = new Set(periodSales.filter(s => s.vendedor === v.vendedor && s.producto).map(s => s.producto!))
      const missingProds = [...allProds].filter(p => !vProds.has(p))
      if (missingProds.length > 0) parts.push(`Productos del equipo que no toca: ${missingProds.slice(0, 3).join(', ')}.`)
    }

    if (da.has_metas && v.cumplimiento_pct != null && catInfo?.tendencia === 'caida') {
      parts.push(`Si la categoría cae 20%: proyección ~${(v.cumplimiento_pct * 0.80).toFixed(0)}% de meta.`)
    }

    return {
      id: uid('mono-cat'),
      tipo: 'riesgo_vendedor' as const,
      prioridad: 'MEDIA' as const,
      emoji: '🎯',
      titulo: `Vendedor mono-categoría — ${v.vendedor}`,
      descripcion: parts.join(' '),
      vendedor: v.vendedor,
      valor_numerico: pctCat,
    }
  })
}

// INSIGHT 10 — Producto en crecimiento (BAJA)
function insightProductoEnCrecimiento(
  sales: SaleRecord[],
  sp: { year: number; month: number },
): Insight[] {
  const { year, month } = sp
  const prev = prevPeriod(year, month)
  const actual: Record<string, number> = {}
  const anterior: Record<string, number> = {}
  salesInPeriod(sales, year, month).forEach(s => {
    if (s.producto) actual[s.producto] = (actual[s.producto] ?? 0) + s.unidades
  })
  salesInPeriod(sales, prev.year, prev.month).forEach(s => {
    if (s.producto) anterior[s.producto] = (anterior[s.producto] ?? 0) + s.unidades
  })

  const insights: Insight[] = []
  for (const [producto, ventasActual] of Object.entries(actual)) {
    const ventasAnt = anterior[producto] ?? 0
    if (ventasAnt === 0) continue
    const variacion = ((ventasActual - ventasAnt) / ventasAnt) * 100
    if (variacion <= 30) continue
    insights.push({
      id: uid('prod-crecimiento'),
      tipo: 'riesgo_producto',
      prioridad: 'BAJA',
      emoji: '🚀',
      titulo: `Producto en crecimiento — ${producto}`,
      descripcion: `${producto} creció ${pct(variacion)} este período (${fmt(ventasAnt)} → ${fmt(ventasActual)} uds).`,
      producto,
      valor_numerico: variacion,
    })
  }
  return insights.slice(0, 2)
}

// ─── GRUPO 5 — CRUZADOS ───────────────────────────────────────────────────────

// INSIGHT 11 — Doble riesgo (mejorado)
function insightDobleRiesgo(
  vendorAnalysis: VendorAnalysis[],
  clientesDormidos: ClienteDormido[],
  categoriasInventario: CategoriaInventario[],
  da: DataAvailability,
): Insight[] {
  const insights: Insight[] = []
  for (const v of vendorAnalysis) {
    if (v.riesgo !== 'critico' && v.riesgo !== 'riesgo') continue
    const dormidos = clientesDormidos.filter(c => normalizeStr(c.vendedor) === normalizeStr(v.vendedor))
    if (dormidos.length === 0) continue
    const top = dormidos.sort((a, b) => b.recovery_score - a.recovery_score)[0]

    const parts: string[] = [
      `${v.vendedor} está en estado ${v.riesgo} y tiene ${dormidos.length} clientes dormidos.`,
      `Prioritario: ${top.cliente} · ${top.dias_sin_actividad} días sin comprar. Recovery: ${top.recovery_label} (${top.recovery_score}/100).`,
    ]

    if (da.has_canal && v.canal_principal) parts.push(`Contactar por: ${v.canal_principal}.`)

    if (da.has_inventario && v.productos_lentos_con_historial?.[0]) {
      const inv = categoriasInventario.find(c =>
        normalizeStr(c.producto) === normalizeStr(v.productos_lentos_con_historial![0].producto)
      )
      if (inv) parts.push(`${inv.producto} tiene ${fmt(inv.unidades_actuales)} uds en stock disponibles.`)
    }

    if (da.has_metas && v.meta && v.proyeccion_cierre) {
      const brecha = v.meta - v.proyeccion_cierre
      if (brecha > 0 && top.valor_historico > 0) {
        parts.push(`Reactivar ${top.cliente} cubriría ${Math.min(100, (top.valor_historico / brecha) * 100).toFixed(0)}% de su brecha.`)
      }
    }

    const totalValor = dormidos.reduce((a, c) => a + c.valor_historico, 0)
    const insight: Insight = {
      id: uid('doble-riesgo'),
      tipo: 'cruzado',
      prioridad: 'CRITICA',
      emoji: '💥',
      titulo: `Doble riesgo — ${v.vendedor}`,
      descripcion: parts.join(' '),
      vendedor: v.vendedor,
      cliente: top.cliente,
      valor_numerico: dormidos.length,
    }
    if (da.has_venta_neta && totalValor > 0) {
      insight.impacto_economico = {
        valor: Math.round(totalValor),
        descripcion: 'en cuentas dormidas recuperables asignadas a este vendedor',
        tipo: 'riesgo',
      }
    }
    insights.push(insight)
  }
  return insights
}

// INSIGHT 12 — Caída explicada (mejorado)
function insightCaidaExplicada(
  vendorAnalysis: VendorAnalysis[],
  sales: SaleRecord[],
  clientesDormidos: ClienteDormido[],
  categoriasInventario: CategoriaInventario[],
  sp: { year: number; month: number },
  da: DataAvailability,
): Insight[] {
  const { year, month } = sp
  const prev = prevPeriod(year, month)
  const insights: Insight[] = []

  for (const v of vendorAnalysis) {
    if ((v.periodos_base_promedio ?? 0) < 2) continue
    if ((v.variacion_vs_promedio_pct ?? 0) >= -10) continue
    if (v.ventas_mes_anterior === 0) continue

    const curByClient: Record<string, { u: number; neta: number }> = {}
    const prevByClient: Record<string, { u: number; neta: number }> = {}
    salesInPeriod(sales, year, month).filter(s => s.vendedor === v.vendedor && s.cliente)
      .forEach(s => {
        if (!curByClient[s.cliente!]) curByClient[s.cliente!] = { u: 0, neta: 0 }
        curByClient[s.cliente!].u += s.unidades
        curByClient[s.cliente!].neta += s.venta_neta ?? 0
      })
    salesInPeriod(sales, prev.year, prev.month).filter(s => s.vendedor === v.vendedor && s.cliente)
      .forEach(s => {
        if (!prevByClient[s.cliente!]) prevByClient[s.cliente!] = { u: 0, neta: 0 }
        prevByClient[s.cliente!].u += s.unidades
        prevByClient[s.cliente!].neta += s.venta_neta ?? 0
      })

    const caidaTotal = v.ventas_mes_anterior - v.ventas_periodo
    if (caidaTotal <= 0) continue

    const atribuible = Object.entries(prevByClient)
      .map(([c, prev]) => ({
        cliente: c,
        caida: prev.u - (curByClient[c]?.u ?? 0),
        caidaNeta: prev.neta - (curByClient[c]?.neta ?? 0),
        ventAnt: prev.u, ventAct: curByClient[c]?.u ?? 0,
      }))
      .filter(x => x.caida > 0)
      .sort((a, b) => b.caida - a.caida)

    if (atribuible.length === 0) continue
    const top = atribuible[0]
    const pctExplicado = (top.caida / caidaTotal) * 100
    if (pctExplicado <= 50) continue

    const dormido = clientesDormidos.find(c => normalizeStr(c.cliente) === normalizeStr(top.cliente))
    const parts: string[] = [
      `${pct(pctExplicado)} de la caída de ${v.vendedor} viene de ${top.cliente} (${fmt(top.ventAnt)} → ${fmt(top.ventAct)} uds).${dormido ? ` Días sin actividad: ${dormido.dias_sin_actividad}.` : ''}`,
    ]

    if (da.has_producto) {
      const prevProds = new Set(
        salesInPeriod(sales, prev.year, prev.month)
          .filter(s => s.vendedor === v.vendedor && normalizeStr(s.cliente ?? '') === normalizeStr(top.cliente) && s.producto)
          .map(s => s.producto!)
      )
      const currProds = new Set(
        salesInPeriod(sales, year, month)
          .filter(s => s.vendedor === v.vendedor && normalizeStr(s.cliente ?? '') === normalizeStr(top.cliente) && s.producto)
          .map(s => s.producto!)
      )
      const dejoDe = [...prevProds].filter(p => !currProds.has(p))
      if (dejoDe.length > 0) parts.push(`Productos que dejó de comprar: ${dejoDe.slice(0, 3).join(', ')}.`)
    }

    if (da.has_inventario) {
      const prevProdsSales = salesInPeriod(sales, prev.year, prev.month)
        .filter(s => s.vendedor === v.vendedor && normalizeStr(s.cliente ?? '') === normalizeStr(top.cliente) && s.producto)
        .map(s => s.producto!)
      const conStock = prevProdsSales
        .map(p => categoriasInventario.find(c => normalizeStr(c.producto) === normalizeStr(p)))
        .filter((c): c is CategoriaInventario => c != null && c.unidades_actuales > 0)
        .slice(0, 2)
      if (conStock.length > 0) parts.push(`Con stock disponible: ${conStock.map(c => `${c.producto} (${fmt(c.unidades_actuales)} uds)`).join(', ')}.`)
    }

    if (da.has_metas && v.meta && v.proyeccion_cierre) {
      parts.push(`Sin este cliente: ${v.vendedor} proyecta ${((v.proyeccion_cierre / v.meta) * 100).toFixed(0)}% de meta.`)
    }

    const insight: Insight = {
      id: uid('caida-explicada'),
      tipo: 'cruzado',
      prioridad: 'CRITICA',
      emoji: '🔍',
      titulo: `Caída explicada — ${v.vendedor}`,
      descripcion: parts.join(' '),
      vendedor: v.vendedor,
      cliente: top.cliente,
      valor_numerico: pctExplicado,
    }
    if (da.has_venta_neta && top.caidaNeta > 0) {
      insight.impacto_economico = {
        valor: Math.round(top.caidaNeta),
        descripcion: `caída atribuible a ${top.cliente}`,
        tipo: 'perdida',
      }
    }
    insights.push(insight)
  }
  return insights
}

// INSIGHT 13 — Cliente dormido × inventario estancado
function insightClienteDormidoInventario(
  dormidosNorm: DormidoNorm[],
  categoriasInventario: CategoriaInventario[],
  sales: SaleRecord[],
  da: DataAvailability,
  productosPorCliente: Map<string, Set<string>>,
): Insight[] {
  const lentos = categoriasInventario.filter(
    c => c.clasificacion === 'sin_movimiento' || c.clasificacion === 'lento_movimiento'
  )
  if (lentos.length === 0) return []
  const dormidosRec = dormidosNorm.filter(c => c.recovery_label !== 'perdido')
  if (dormidosRec.length === 0) return []

  type Cruce = { dormido: DormidoNorm; prod: CategoriaInventario; prioProd: number; priority: number }
  const cruces: Cruce[] = []

  for (const dormido of dormidosRec) {
    const productosComprados = productosPorCliente.get(dormido.clienteNorm) ?? new Set<string>()
    for (const prod of lentos) {
      if (!productosComprados.has(normalizeStr(prod.producto))) continue
      const prioProd = prod.clasificacion === 'sin_movimiento' ? 0 : 1
      cruces.push({ dormido, prod, prioProd, priority: dormido.valor_historico * (prioProd === 0 ? 2 : 1) })
    }
  }

  cruces.sort((a, b) => a.prioProd - b.prioProd || b.priority - a.priority)

  return cruces.slice(0, 3).map(({ dormido, prod }) => {
    const parts: string[] = [
      `${dormido.cliente} lleva ${dormido.dias_sin_actividad} días sin comprar y compraba ${prod.producto} que hoy tiene ${prod.dias_inventario} días sin movimiento (${fmt(prod.unidades_actuales)} uds en stock).`,
      `Recovery: ${dormido.recovery_label} — compraba normalmente cada ${dormido.frecuencia_esperada_dias ?? 'N/A'} días.`,
    ]
    if (da.has_canal) {
      const canalSales = sales.filter(s => normalizeStr(s.vendedor) === normalizeStr(dormido.vendedor) && s.canal)
      if (canalSales.length > 0) {
        const canalMap: Record<string, number> = {}
        canalSales.forEach(s => { canalMap[s.canal!] = (canalMap[s.canal!] ?? 0) + s.unidades })
        const topCanal = Object.entries(canalMap).sort(([, a], [, b]) => b - a)[0]
        if (topCanal) parts.push(`Contactar por ${topCanal[0]}.`)
      }
    }
    return {
      id: uid('dormido-estancado'),
      tipo: 'cruzado' as const,
      prioridad: 'ALTA' as const,
      emoji: '🔗',
      titulo: `Cliente dormido × inventario estancado — ${dormido.cliente}`,
      descripcion: parts.join(' '),
      vendedor: dormido.vendedor,
      cliente: dormido.cliente,
      producto: prod.producto,
      valor_numerico: dormido.dias_sin_actividad,
    }
  })
}

// INSIGHT 14 — Supervisor con zona en riesgo
function insightSupervisorZonaRiesgo(
  supervisorAnalysis: SupervisorAnalysis[],
  clientesDormidos: ClienteDormido[],
  da: DataAvailability,
): Insight[] {
  return supervisorAnalysis
    .filter(s => s.riesgo_zona === 'critico' || s.riesgo_zona === 'riesgo')
    .map(s => {
      const prioridad: InsightPrioridad = s.riesgo_zona === 'critico' ? 'CRITICA' : 'ALTA'
      const nvend = s.vendedores.length
      const parts: string[] = [
        `Zona ${s.supervisor}: ${s.vendedores_criticos + s.vendedores_riesgo} de ${nvend} vendedores en riesgo o crítico.`,
      ]
      if (s.vendedores_criticos > 0) parts.push(`Vendedores críticos: ${s.vendedores_criticos}.`)
      if (da.has_cliente) {
        const dormidosZona = clientesDormidos.filter(c =>
          s.vendedores.some(v => normalizeStr(v) === normalizeStr(c.vendedor))
        )
        if (dormidosZona.length > 0) parts.push(`Clientes dormidos en la zona: ${dormidosZona.length}.`)
      }
      if (s.cumplimiento_pct != null) parts.push(`Proyección de zona: ${s.cumplimiento_pct.toFixed(1)}%.`)
      if (s.meta_zona != null && s.meta_zona > s.ventas_periodo) {
        parts.push(`Brecha total: ${fmt(s.meta_zona - s.ventas_periodo)} uds.`)
      }
      const insight: Insight = {
        id: uid('supervisor-riesgo'),
        tipo: 'riesgo_vendedor',
        fuente: 'supervisor',
        prioridad,
        emoji: '🗺️',
        titulo: `Zona en ${s.riesgo_zona === 'critico' ? 'riesgo crítico' : 'riesgo'} — ${s.supervisor}`,
        descripcion: parts.join(' '),
        valor_numerico: s.cumplimiento_pct ?? 0,
      }
      if (da.has_venta_neta && s.meta_zona != null && s.meta_zona > s.ventas_periodo) {
        insight.impacto_economico = {
          valor: Math.round(s.meta_zona - s.ventas_periodo),
          descripcion: 'brecha vs meta de zona',
          tipo: 'riesgo',
        }
      }
      return insight
    })
}

// ─── GRUPO 6 — DIMENSIONES ────────────────────────────────────────────────────

// INSIGHT 15 — Categoría en colapso
function insightCategoriaEnColapso(
  categoriaAnalysis: CategoriaAnalysis[],
  dormidosNorm: DormidoNorm[],
  periodSalesAll: SaleRecord[],
  sp: { year: number; month: number },
  da: DataAvailability,
  ticketEquipo: number,
  categoriasPorCliente: Map<string, Set<string>>,
): Insight[] {
  const { year, month } = sp
  return categoriaAnalysis
    .filter(c => c.tendencia === 'colapso' && c.variacion_vs_pm3 <= -40)
    .sort((a, b) => a.variacion_vs_pm3 - b.variacion_vs_pm3)
    .map(c => {
      const caida = c.pm3 - c.ventas_periodo
      const parts: string[] = [
        `"${c.categoria}" cayó ${pct(Math.abs(c.variacion_vs_pm3))} vs su promedio histórico. Representa el ${c.participacion_pct.toFixed(1)}% de las ventas totales.`,
      ]

      const catNorm = normalizeStr(c.categoria)
      const vendedoresExp: Record<string, number> = {}
      periodSalesAll.filter(s => s.categoria && normalizeStr(s.categoria) === catNorm)
        .forEach(s => { vendedoresExp[s.vendedor] = (vendedoresExp[s.vendedor] ?? 0) + s.unidades })
      const topVend = Object.entries(vendedoresExp).sort(([, a], [, b]) => b - a).slice(0, 3).map(([v]) => v)
      if (topVend.length > 0) parts.push(`Vendedores con mayor exposición: ${topVend.join(', ')}.`)

      if (da.has_cliente) {
        const dormidosEnCat = dormidosNorm.filter(cd =>
          categoriasPorCliente.get(cd.clienteNorm)?.has(catNorm) ?? false
        ).slice(0, 3)
        if (dormidosEnCat.length > 0) {
          parts.push(`Clientes que compraban la categoría y redujeron: ${dormidosEnCat.map(d => d.cliente).join(', ')}.`)
        }
      }

      if (da.has_metas && c.cumplimiento_pct != null) {
        parts.push(`Cumplimiento de meta: ${c.cumplimiento_pct.toFixed(1)}%.`)
      }

      const insight: Insight = {
        id: uid('cat-colapso'),
        tipo: 'riesgo_producto',
        prioridad: 'CRITICA',
        emoji: '💥',
        titulo: `Categoría en colapso — ${c.categoria}`,
        descripcion: parts.join(' '),
        valor_numerico: Math.abs(c.variacion_vs_pm3),
      }
      if (da.has_venta_neta && ticketEquipo > 0 && caida > 0) {
        insight.impacto_economico = {
          valor: Math.round(caida * ticketEquipo),
          descripcion: `ingreso perdido por caída de categoría ${c.categoria}`,
          tipo: 'perdida',
        }
      }
      return insight
    })
}

// INSIGHT 16 — Superando meta (BAJA — período cerrado)
function insightSuperandoMeta(
  vendorAnalysis: VendorAnalysis[],
  teamStats: TeamStats,
): Insight[] {
  if (teamStats.dias_restantes > 0) return []
  return vendorAnalysis
    .filter(v => v.meta && v.cumplimiento_pct && v.cumplimiento_pct > 110)
    .map(v => ({
      id: uid('superando'),
      tipo: 'riesgo_vendedor' as const,
      prioridad: 'BAJA' as const,
      emoji: '🏆',
      titulo: `Superando meta — ${v.vendedor}`,
      descripcion: `${v.vendedor} superó su meta en ${pct((v.cumplimiento_pct ?? 0) - 100)} (${fmt(v.ventas_periodo)} uds vs meta ${fmt(v.meta ?? 0)} uds).`,
      vendedor: v.vendedor,
      valor_numerico: v.cumplimiento_pct,
    }))
}

// INSIGHT 17 — Mejor momento histórico (BAJA)
function insightMejorMomento(
  vendorAnalysis: VendorAnalysis[],
  sales: SaleRecord[],
  sp: { year: number; month: number },
  idx: ReturnType<typeof buildSaleIndex>,
): Insight[] {
  const { year, month } = sp
  const insights: Insight[] = []
  for (const v of vendorAnalysis) {
    const historicos = getMejoresPeriodosVendedor(sales, v.vendedor, year, month, 6, idx)
    if (historicos.length === 0) continue
    if (v.ventas_periodo <= Math.max(...historicos)) continue
    insights.push({
      id: uid('mejor-momento'),
      tipo: 'riesgo_vendedor',
      prioridad: 'BAJA',
      emoji: '⭐',
      titulo: `Mejor momento — ${v.vendedor}`,
      descripcion: `${v.vendedor} está en su mejor período de los últimos 6 meses con ${fmt(v.ventas_periodo)} uds.`,
      vendedor: v.vendedor,
      valor_numerico: v.ventas_periodo,
    })
  }
  return insights
}

// ─── GRUPO 7 — HALLAZGOS (patrones no obvios) ───────────────────────────────

// HALLAZGO 1 — Dependencia de vendedor en canal
function insightDependenciaVendedor(
  vendorAnalysis: VendorAnalysis[],
  canalAnalysis: CanalAnalysis[],
  sales: SaleRecord[],
  sp: { year: number; month: number },
): Insight[] {
  if (vendorAnalysis.length < 2) return []
  const periodSales = salesInPeriod(sales, sp.year, sp.month)
  if (periodSales.length === 0) return []

  const insights: Insight[] = []

  // Concentración por canal
  for (const canal of canalAnalysis) {
    if (!canal.activo_periodo || canal.ventas_periodo === 0) continue
    const salesCanal = periodSales.filter(s => s.canal === canal.canal)
    const byVendedor = new Map<string, number>()
    for (const s of salesCanal) {
      byVendedor.set(s.vendedor, (byVendedor.get(s.vendedor) ?? 0) + s.unidades)
    }
    const totalCanal = [...byVendedor.values()].reduce((a, b) => a + b, 0)
    if (totalCanal === 0) continue
    for (const [vendedor, uds] of byVendedor) {
      const pctVendedor = (uds / totalCanal) * 100
      if (pctVendedor > 50) {
        insights.push({
          id: uid('hallazgo-dep-vendedor'),
          tipo: 'hallazgo',
          prioridad: pctVendedor > 65 ? 'ALTA' : 'MEDIA',
          emoji: '💡',
          titulo: `Dependencia de vendedor en ${canal.canal}`,
          descripcion: `El ${pct(pctVendedor)} del volumen de ${canal.canal} depende de ${vendedor} (${fmt(uds)} de ${fmt(totalCanal)} uds) — riesgo alto de concentración.`,
          vendedor,
          valor_numerico: pctVendedor,
          detector: 'dependencia_vendedor',
        })
      }
    }
  }

  // Concentración por departamento (si hay datos)
  const deptos = new Set(periodSales.map(s => s.departamento).filter(Boolean) as string[])
  if (deptos.size > 1) {
    for (const depto of deptos) {
      const salesDepto = periodSales.filter(s => s.departamento === depto)
      const byVendedor = new Map<string, number>()
      for (const s of salesDepto) {
        byVendedor.set(s.vendedor, (byVendedor.get(s.vendedor) ?? 0) + s.unidades)
      }
      const totalDepto = [...byVendedor.values()].reduce((a, b) => a + b, 0)
      if (totalDepto === 0) continue
      for (const [vendedor, uds] of byVendedor) {
        const pctVendedor = (uds / totalDepto) * 100
        if (pctVendedor > 50) {
          insights.push({
            id: uid('hallazgo-dep-depto'),
            tipo: 'hallazgo',
            prioridad: pctVendedor > 65 ? 'ALTA' : 'MEDIA',
            emoji: '💡',
            titulo: `Dependencia de vendedor en ${depto}`,
            descripcion: `El ${pct(pctVendedor)} del volumen de ${depto} depende de ${vendedor} (${fmt(uds)} de ${fmt(totalDepto)} uds) — riesgo alto de concentración.`,
            vendedor,
            valor_numerico: pctVendedor,
            detector: 'dependencia_vendedor',
          })
        }
      }
    }
  }

  return insights.slice(0, 3)
}

// HALLAZGO 2 — Migración de canal
function insightMigracionCanal(
  canalAnalysis: CanalAnalysis[],
): Insight[] {
  const activos = canalAnalysis.filter(c => c.activo_periodo || c.activo_anterior)
  if (activos.length < 2) return []

  const caidas = activos.filter(c => c.variacion_pct < -10 && c.ventas_anterior > 0)
  const crecimientos = activos.filter(c => c.variacion_pct > 10 && c.ventas_periodo > 0)

  const insights: Insight[] = []
  for (const caida of caidas) {
    const magnitudCaida = caida.ventas_anterior - caida.ventas_periodo
    for (const crec of crecimientos) {
      const magnitudCrec = crec.ventas_periodo - crec.ventas_anterior
      const mayor = Math.max(magnitudCaida, magnitudCrec)
      const diff = Math.abs(magnitudCaida - magnitudCrec)
      if (mayor > 0 && diff / mayor < 0.40) {
        insights.push({
          id: uid('hallazgo-migracion'),
          tipo: 'hallazgo',
          prioridad: 'MEDIA',
          emoji: '💡',
          titulo: `Migración de canal: ${caida.canal} → ${crec.canal}`,
          descripcion: `${caida.canal} cayó ${fmt(magnitudCaida)} uds pero ${crec.canal} creció ${fmt(magnitudCrec)} — el volumen está migrando de canal, no se está perdiendo.`,
          valor_numerico: magnitudCrec,
          detector: 'migracion_canal',
        })
      }
    }
  }

  return insights.slice(0, 2)
}

// HALLAZGO 3 — Outlier en variación
function insightOutlierVariacion(
  vendorAnalysis: VendorAnalysis[],
  teamStats: TeamStats,
): Insight[] {
  if (vendorAnalysis.length < 3) return []
  const conVar = vendorAnalysis.filter(v => v.variacion_pct !== null && v.variacion_pct !== undefined)
  if (conVar.length < 3) return []

  const promedioEquipo = teamStats.variacion_pct
  if (promedioEquipo === null || promedioEquipo === undefined) return []

  const insights: Insight[] = []
  for (const v of conVar) {
    const varV = v.variacion_pct!
    const diff = varV - promedioEquipo
    const absDiff = Math.abs(diff)
    const absPromedio = Math.abs(promedioEquipo)
    // La variación del vendedor difiere >1.5x del promedio del equipo
    if (absPromedio > 0 && absDiff > absPromedio * 1.5 && absDiff > 10) {
      const esPositivo = varV > promedioEquipo
      insights.push({
        id: uid('hallazgo-outlier'),
        tipo: 'hallazgo',
        prioridad: esPositivo ? 'MEDIA' : 'ALTA',
        emoji: '💡',
        titulo: esPositivo
          ? `Rendimiento atípico alto — ${v.vendedor}`
          : `Rendimiento atípico bajo — ${v.vendedor}`,
        descripcion: esPositivo
          ? `${v.vendedor} crece ${varV > 0 ? '+' : ''}${pct(varV)} cuando el equipo promedia ${promedioEquipo > 0 ? '+' : ''}${pct(promedioEquipo)} — rendimiento atípicamente alto.`
          : `${v.vendedor} varía ${varV > 0 ? '+' : '-'}${pct(varV)} cuando el equipo promedia ${promedioEquipo > 0 ? '+' : ''}${pct(promedioEquipo)} — rendimiento atípicamente bajo.`,
        vendedor: v.vendedor,
        valor_numerico: varV,
        detector: 'outlier_variacion',
      })
    }
  }

  return insights
    .sort((a, b) => Math.abs(b.valor_numerico ?? 0) - Math.abs(a.valor_numerico ?? 0))
    .slice(0, 3)
}

// HALLAZGO 4 — Causa raíz compartida
function insightCausaRaizCompartida(
  vendorAnalysis: VendorAnalysis[],
  sales: SaleRecord[],
  sp: { year: number; month: number },
  canalAnalysis: CanalAnalysis[],
): Insight[] {
  const periodSales = salesInPeriod(sales, sp.year, sp.month)
  if (periodSales.length === 0) return []

  const insights: Insight[] = []

  // Buscar en departamentos
  const deptos = new Set(periodSales.map(s => s.departamento).filter(Boolean) as string[])
  if (deptos.size >= 2) {
    const prev = prevPeriod(sp.year, sp.month)
    const prevSales = salesInPeriod(sales, prev.year, prev.month)
    const deptoVar = new Map<string, { actual: number; anterior: number }>()
    for (const d of deptos) {
      const act = periodSales.filter(s => s.departamento === d).reduce((a, s) => a + s.unidades, 0)
      const ant = prevSales.filter(s => s.departamento === d).reduce((a, s) => a + s.unidades, 0)
      deptoVar.set(d, { actual: act, anterior: ant })
    }
    const deptosEnCaida = [...deptoVar.entries()]
      .filter(([, v]) => v.anterior > 0 && v.actual < v.anterior * 0.9)
      .map(([d]) => d)

    if (deptosEnCaida.length >= 2) {
      const vendedoresPorDepto = new Map<string, Set<string>>()
      for (const d of deptosEnCaida) {
        const vends = new Set(periodSales.filter(s => s.departamento === d).map(s => s.vendedor))
        vendedoresPorDepto.set(d, vends)
      }
      const vendedorCount = new Map<string, string[]>()
      for (const [d, vends] of vendedoresPorDepto) {
        for (const v of vends) {
          if (!vendedorCount.has(v)) vendedorCount.set(v, [])
          vendedorCount.get(v)!.push(d)
        }
      }
      for (const [vendedor, deptosV] of vendedorCount) {
        if (deptosV.length >= 2) {
          insights.push({
            id: uid('hallazgo-causa-raiz'),
            tipo: 'hallazgo',
            prioridad: 'ALTA',
            emoji: '💡',
            titulo: `Posible causa raíz — ${vendedor}`,
            descripcion: `${deptosV.length} de los ${deptosEnCaida.length} departamentos en caída comparten al vendedor ${vendedor} — posible causa raíz.`,
            vendedor,
            valor_numerico: deptosV.length,
            detector: 'causa_raiz_compartida',
          })
        }
      }
    }
  }

  // Buscar en canales
  const canalesEnCaida = canalAnalysis.filter(c => c.activo_anterior && c.variacion_pct < -10)
  if (canalesEnCaida.length >= 2) {
    const vendedorCount = new Map<string, string[]>()
    for (const canal of canalesEnCaida) {
      const vends = new Set(periodSales.filter(s => s.canal === canal.canal).map(s => s.vendedor))
      for (const v of vends) {
        if (!vendedorCount.has(v)) vendedorCount.set(v, [])
        vendedorCount.get(v)!.push(canal.canal)
      }
    }
    for (const [vendedor, canalesV] of vendedorCount) {
      if (canalesV.length >= 2) {
        const yaDetectado = insights.some(i => i.vendedor === vendedor)
        if (!yaDetectado) {
          insights.push({
            id: uid('hallazgo-causa-raiz-canal'),
            tipo: 'hallazgo',
            prioridad: 'ALTA',
            emoji: '💡',
            titulo: `Posible causa raíz — ${vendedor}`,
            descripcion: `${canalesV.length} de los ${canalesEnCaida.length} canales en caída comparten al vendedor ${vendedor} — posible causa raíz.`,
            vendedor,
            valor_numerico: canalesV.length,
            detector: 'causa_raiz_compartida',
          })
        }
      }
    }
  }

  return insights.slice(0, 2)
}

// HALLAZGO 5 — Oportunidad no explotada
// TODO: habilitar completamente cuando exista desglose producto×departamento confiable
function insightOportunidadNoExplotada(
  sales: SaleRecord[],
  sp: { year: number; month: number },
): Insight[] {
  const periodSales = salesInPeriod(sales, sp.year, sp.month)
  if (periodSales.length === 0) return []

  const conProductoDepto = periodSales.filter(s => s.producto && s.departamento)
  if (conProductoDepto.length === 0) return []

  const deptos = new Set(conProductoDepto.map(s => s.departamento!))
  if (deptos.size < 2) return []

  const volProd = new Map<string, number>()
  for (const s of conProductoDepto) {
    volProd.set(s.producto!, (volProd.get(s.producto!) ?? 0) + s.unidades)
  }

  const volProdDepto = new Map<string, Map<string, number>>()
  for (const s of conProductoDepto) {
    if (!volProdDepto.has(s.producto!)) volProdDepto.set(s.producto!, new Map())
    const m = volProdDepto.get(s.producto!)!
    m.set(s.departamento!, (m.get(s.departamento!) ?? 0) + s.unidades)
  }

  const insights: Insight[] = []
  const promedioVolProd = [...volProd.values()].reduce((a, b) => a + b, 0) / volProd.size
  for (const [producto, volTotal] of volProd) {
    if (volTotal < promedioVolProd * 0.5) continue
    const porDepto = volProdDepto.get(producto)!
    const promPorDepto = volTotal / deptos.size
    for (const depto of deptos) {
      const volEnDepto = porDepto.get(depto) ?? 0
      if (volEnDepto < promPorDepto * 0.05) {
        insights.push({
          id: uid('hallazgo-oportunidad'),
          tipo: 'hallazgo',
          prioridad: 'MEDIA',
          emoji: '💡',
          titulo: `Oportunidad sin explotar — ${producto}`,
          descripcion: `${producto} tiene ${fmt(volTotal)} uds a nivel general pero ${volEnDepto === 0 ? '0 ventas' : `solo ${fmt(volEnDepto)} uds`} en ${depto} — territorio sin cobertura.`,
          producto,
          valor_numerico: volTotal,
          detector: 'oportunidad_no_explotada',
        })
      }
    }
  }

  return insights
    .sort((a, b) => (b.valor_numerico ?? 0) - (a.valor_numerico ?? 0))
    .slice(0, 3)
}

// ─── FUNCIÓN PRINCIPAL ────────────────────────────────────────────────────────

export function generateInsights(
  vendorAnalysis: VendorAnalysis[],
  teamStats: TeamStats,
  sales: SaleRecord[],
  metas: MetaRecord[],
  dataAvailability: DataAvailability,
  configuracion: Configuracion,
  clientesDormidos: ClienteDormido[],
  concentracionRiesgo: ConcentracionRiesgo[],
  categoriasInventario: CategoriaInventario[],
  supervisorAnalysis: SupervisorAnalysis[] = [],
  categoriaAnalysis: CategoriaAnalysis[] = [],
  canalAnalysis: CanalAnalysis[] = [],
  selectedPeriod?: { year: number; month: number },
): Insight[] {
  _idCounter = 0

  const fechaRef = sales.length > 0
    ? sales.reduce((mx, s) => s.fecha > mx ? s.fecha : mx, sales[0].fecha)
    : new Date()
  const sp = selectedPeriod ?? { year: fechaRef.getFullYear(), month: fechaRef.getMonth() }

  const periodSalesAll = salesInPeriod(sales, sp.year, sp.month)
  const totalUnits = periodSalesAll.reduce((a, s) => a + s.unidades, 0)
  const totalNeta = periodSalesAll.reduce((a, s) => a + (s.venta_neta ?? 0), 0)
  const ticketEquipo = dataAvailability.has_venta_neta && totalUnits > 0 ? totalNeta / totalUnits : 0

  const ticketPorVendedor = new Map<string, number>()
  if (dataAvailability.has_venta_neta) {
    for (const v of vendorAnalysis) {
      const vs = periodSalesAll.filter(s => s.vendedor === v.vendedor)
      const u = vs.reduce((a, s) => a + s.unidades, 0)
      const n = vs.reduce((a, s) => a + (s.venta_neta ?? 0), 0)
      ticketPorVendedor.set(v.vendedor, u > 0 ? n / u : ticketEquipo)
    }
  }

  // ── Pre-cómputos compartidos — O(N) una sola vez ──────────────────────────
  const idx = buildSaleIndex(sales)
  const productosPorCliente = new Map<string, Set<string>>()
  const categoriasPorCliente = new Map<string, Set<string>>()
  for (const s of sales) {
    const clave = s.cliente ?? s.codigo_cliente
    if (!clave) continue
    const claveNorm = normalizeStr(clave)
    const prod = s.producto ?? s.codigo_producto
    if (prod) {
      if (!productosPorCliente.has(claveNorm)) productosPorCliente.set(claveNorm, new Set())
      productosPorCliente.get(claveNorm)!.add(normalizeStr(prod))
    }
    if (s.categoria) {
      if (!categoriasPorCliente.has(claveNorm)) categoriasPorCliente.set(claveNorm, new Set())
      categoriasPorCliente.get(claveNorm)!.add(normalizeStr(s.categoria))
    }
  }
  const dormidosNorm: DormidoNorm[] = clientesDormidos.map(cd => ({
    ...cd,
    clienteNorm: normalizeStr(cd.cliente),
  }))

  const da = dataAvailability
  const all: (Insight | null | Insight[])[] = []

  // ── Grupo 1 — Meta Individual ──
  if (da.has_metas) {
    for (const v of vendorAnalysis) {
      all.push(insightMetaEnPeligro(v, teamStats, sales, sp, da, ticketPorVendedor.get(v.vendedor) ?? 0))
    }
    all.push(insightEstadoMetaEquipo(teamStats, vendorAnalysis, sales, sp, da, ticketEquipo))
  }

  // ── Grupo 2 — Deterioro Vendedor ──
  const deterioros = vendorAnalysis
    .map(v => insightVendedorDeteriorado(v, sales, sp, da))
    .filter(Boolean) as Insight[]
  deterioros.sort((a, b) => (b.valor_numerico ?? 0) - (a.valor_numerico ?? 0))
  all.push(...deterioros.slice(0, 3))

  if (da.has_metas) {
    for (const v of vendorAnalysis) {
      all.push(insightPatronSubejecucion(v, sales, metas, sp, da))
    }
  }

  // ── Grupo 3 — Clientes ──
  if (da.has_cliente) {
    all.push(...insightClientesEnRiesgo(clientesDormidos, sales, sp, da))
    all.push(...insightConcentracionCartera(concentracionRiesgo, vendorAnalysis, sales, sp, da, configuracion))
    all.push(...insightClienteNuevoActivo(sales, sp, fechaRef))
  }

  // ── Grupo 4 — Productos ──
  if (da.has_producto) {
    all.push(...insightProductosEnRiesgo(sales, sp, categoriasInventario, da, fechaRef))
    all.push(...insightProductoEnCrecimiento(sales, sp))
  }
  if (da.has_categoria) {
    all.push(...insightVendedorMonoCategoria(vendorAnalysis, sales, sp, categoriaAnalysis, da))
  }

  // ── Grupo 5 — Cruzados ──
  if (da.has_cliente) {
    all.push(...insightDobleRiesgo(vendorAnalysis, clientesDormidos, categoriasInventario, da))
    all.push(...insightCaidaExplicada(vendorAnalysis, sales, clientesDormidos, categoriasInventario, sp, da))
  }
  if (da.has_cliente && da.has_inventario) {
    all.push(...insightClienteDormidoInventario(dormidosNorm, categoriasInventario, sales, da, productosPorCliente))
  }
  if (da.has_supervisor) {
    all.push(...insightSupervisorZonaRiesgo(supervisorAnalysis, clientesDormidos, da))
  }

  // ── Grupo 6 — Dimensiones ──
  if (da.has_categoria) {
    all.push(...insightCategoriaEnColapso(categoriaAnalysis, dormidosNorm, periodSalesAll, sp, da, ticketEquipo, categoriasPorCliente))
  }
  if (da.has_metas) {
    all.push(...insightSuperandoMeta(vendorAnalysis, teamStats))
  }
  all.push(...insightMejorMomento(vendorAnalysis, sales, sp, idx))

  // ── Hallazgos (patrones no obvios) ──
  if (canalAnalysis.length > 0) {
    const h1 = insightDependenciaVendedor(vendorAnalysis, canalAnalysis, sales, sp)
    all.push(...h1)
    const h2 = insightMigracionCanal(canalAnalysis)
    all.push(...h2)
    const h4 = insightCausaRaizCompartida(vendorAnalysis, sales, sp, canalAnalysis)
    all.push(...h4)
  }
  const h3 = insightOutlierVariacion(vendorAnalysis, teamStats)
  all.push(...h3)
  if (da.has_producto) {
    const h5 = insightOportunidadNoExplotada(sales, sp)
    all.push(...h5)
  }

  return sortInsights(all.flat())
}
