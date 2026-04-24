import type { VendorAnalysis, TeamStats, DataAvailability, Insight } from '../types'

// ─── Types ──────────────────────────────────────────────────────────────────

export type PulsoSignalType =
  | 'vendedor_cayendo'        // S1
  | 'meta_peligro'            // S2
  | 'cliente_dormido'         // S3
  | 'cliente_enfriandose'     // S4
  | 'producto_declive'        // S5
  | 'categorias_caida'        // S6
  | 'inventario_quiebre'      // S7
  | 'zona_supervisor'         // S8
  | 'oportunidad_cruce'       // S9
  | 'vendedor_racha'          // S10

export type PulsoSeverity = 'critical' | 'warning' | 'positive' | 'info'

export interface PulsoPanelData {
  panelType: string
  categorias?: Array<{ nombre: string; caida: number; perdidaUSD: number; categoria?: string }>
  producto?: string
  stock?: number
  diasInventario?: number
  promedioMensual?: number
  chatQuestion: string
  // S2 meta
  proyeccion?: number
  meta?: number
  proyPct?: number
  diasRestantes?: number
  vendedoresBajoMeta?: Array<{ vendedor: string; proyPct: number; brecha: number }>
  vendedoresSobreMeta?: Array<{ vendedor: string; proyPct: number; excedente: number }>
  // S3 cliente dormido
  cliente?: string
  diasInactivo?: number
  valorHistorico?: number
  recoveryScore?: number
  recoveryLabel?: string
  vendedorAsignado?: string
  comprasHistoricas?: number
  // producto_declive enrichment
  caida_pct?: number
  ventas_mes_actual?: number
  categoria?: string
  // Inventory affected vendors
  vendedoresAfectados?: Array<{ vendedor: string; uds: number }>
  // S8 zona
  supervisor?: string
  metaZonaPct?: number
  vendedoresZona?: Array<{ vendedor: string; estado: string; metaPct: number | null; varPct: number | null }>
  // Generic enrichment
  diasTranscurridos?: number
  diasTotales?: number
}

export interface PulsoAction {
  type: 'panel' | 'chat' | 'pulso_panel'
  target: string
  label: string
  panelData?: PulsoPanelData
}

export interface PulsoCard {
  type: PulsoSignalType
  priority: number
  title: string
  metric: string
  metricLabel: string
  detail: string
  severity: PulsoSeverity
  tag: 'nuevo' | 'cambió' | 'persistente' | null
  action: PulsoAction
  entityType?: 'vendedor' | 'cliente' | 'producto' | 'categoria' | 'supervisor' | null
  entityId?: string | null
}

// ─── Input ──────────────────────────────────────────────────────────────────

export interface PulsoInput {
  vendorAnalysis: VendorAnalysis[]
  teamStats: TeamStats
  clientesDormidos: Array<{
    cliente: string
    dias_sin_actividad: number
    valor_yoy_usd: number
    recovery_label: string
    recovery_score: number
    vendedor: string
  }>
  concentracionRiesgo: Array<{ cliente: string; pct_del_total: number }>
  categoriasInventario: Array<{
    producto: string
    categoria: string
    clasificacion: string
    dias_inventario: number
    unidades_actuales: number
    pm3: number
  }>
  canalAnalysis: Array<{
    canal: string
    participacion_pct: number
    variacion_pct: number
    tendencia: string
    activo_periodo: boolean
  }>
  supervisorAnalysis: Array<{
    supervisor: string
    vendedores: string[]
    vendedores_criticos: number
    vendedores_riesgo: number
    cumplimiento_pct: number | null
    meta_zona: number | null
    proyeccion_cierre: number
    riesgo_zona: string
  }>
  insights: Insight[]
  dataAvailability: DataAvailability
  moneda: string
  showUSD: boolean
  estadoMes: {
    estado: string
    proyeccion_cierre: number
    actual: number
    historico_mes: number
    diasTranscurridos: number
    diasTotales: number
    gap_pct: number | null
    ingreso_actual: number
  }
  cumplimientoFinal: number
  sales: Array<{ fecha: Date; vendedor: string; unidades: number; producto?: string; cliente?: string; categoria?: string }>
  selectedPeriod: { year: number; month: number }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return Math.round(n).toLocaleString()
}

// ─── Engine ─────────────────────────────────────────────────────────────────

export function computePulsoCards(input: PulsoInput): { visible: PulsoCard[]; total: number } {
  const {
    vendorAnalysis, teamStats, clientesDormidos,
    categoriasInventario, supervisorAnalysis, insights, dataAvailability,
    moneda, showUSD, estadoMes, cumplimientoFinal, sales, selectedPeriod,
  } = input

  const candidates: PulsoCard[] = []

  // ── S1: VENDEDOR CAYENDO (priority 100) ───────────────────────────────────
  const criticos = vendorAnalysis.filter(v => v.riesgo === 'critico')
  if (criticos.length > 0) {
    const worst = criticos.sort((a, b) => (a.variacion_vs_promedio_pct ?? 0) - (b.variacion_vs_promedio_pct ?? 0))[0]
    const dormidosVend = clientesDormidos.filter(c => c.vendedor === worst.vendedor)
    const caida = Math.abs(worst.variacion_vs_promedio_pct ?? 0)
    candidates.push({
      type: 'vendedor_cayendo',
      priority: 100,
      title: `${worst.vendedor} está cayendo`,
      metric: `${Math.round(caida)}%`,
      metricLabel: 'caída vs promedio',
      detail: `Cayó ${Math.round(caida)}% y tiene ${dormidosVend.length} cliente${dormidosVend.length !== 1 ? 's' : ''} sin comprar`,
      severity: 'critical',
      tag: worst.semanas_bajo_promedio <= 2 ? 'nuevo' : 'persistente',
      action: { type: 'panel', target: worst.vendedor, label: `Ver ${worst.vendedor.split(' ')[0]}` },
      entityType: 'vendedor',
      entityId: worst.vendedor,
    })
  }

  // ── S2: META EN PELIGRO (priority 95) ─────────────────────────────────────
  if (dataAvailability.has_metas && teamStats.meta_equipo && teamStats.meta_equipo > 0 && estadoMes.diasTranscurridos >= 7) {
    const proy = estadoMes.proyeccion_cierre
    const meta = teamStats.meta_equipo
    const proyPct = proy / meta
    if (proyPct < 0.70) {
      const diasRest = estadoMes.diasTotales - estadoMes.diasTranscurridos
      const faltan = Math.max(0, meta - proy)
      // Build vendedores bajo/sobre meta for the panel
      const vendBajo = vendorAnalysis
        .filter(v => v.meta && v.proyeccion_cierre !== undefined && v.meta > 0 && (v.proyeccion_cierre / v.meta) < 0.9)
        .map(v => ({ vendedor: v.vendedor, proyPct: Math.round((v.proyeccion_cierre! / v.meta!) * 100), brecha: Math.round(v.meta! - v.proyeccion_cierre!) }))
        .sort((a, b) => a.proyPct - b.proyPct)
      const vendSobre = vendorAnalysis
        .filter(v => v.meta && v.proyeccion_cierre !== undefined && v.meta > 0 && (v.proyeccion_cierre / v.meta) >= 1)
        .map(v => ({ vendedor: v.vendedor, proyPct: Math.round((v.proyeccion_cierre! / v.meta!) * 100), excedente: Math.round(v.proyeccion_cierre! - v.meta!) }))
        .sort((a, b) => b.excedente - a.excedente)
      candidates.push({
        type: 'meta_peligro',
        priority: 95,
        title: 'El equipo no va a llegar a la meta',
        metric: `${Math.round(proyPct * 100)}%`,
        metricLabel: 'proyectado',
        detail: `Proyectan ${fmtK(proy)} de ${fmtK(meta)} — faltan ${fmtK(faltan)} uds · ${diasRest} días`,
        severity: proyPct < 0.50 ? 'critical' : 'warning',
        tag: null,
        action: {
          type: 'pulso_panel', target: 'meta', label: 'Ver equipo',
          panelData: {
            panelType: 'meta_peligro', chatQuestion: `El equipo proyecta ${Math.round(proyPct * 100)}% de la meta (${fmtK(proy)} de ${fmtK(meta)}). ¿Qué acciones tomar en los próximos ${diasRest} días?`,
            proyeccion: proy, meta, proyPct: Math.round(proyPct * 100), diasRestantes: diasRest,
            vendedoresBajoMeta: vendBajo, vendedoresSobreMeta: vendSobre,
            diasTranscurridos: estadoMes.diasTranscurridos, diasTotales: estadoMes.diasTotales,
          },
        },
      })
    }
  }

  // ── S3: CLIENTE DORMIDO DE ALTO VALOR (priority 88) ───────────────────────
  if (dataAvailability.has_cliente && clientesDormidos.length > 0) {
    const top = [...clientesDormidos].sort((a, b) => b.valor_yoy_usd - a.valor_yoy_usd)[0]
    const otros = clientesDormidos.length - 1
    candidates.push({
      type: 'cliente_dormido',
      priority: 88,
      title: `${top.cliente} dejó de comprar`,
      metric: `${top.dias_sin_actividad}`,
      metricLabel: 'días inactivo',
      detail: `Historial: ${fmtK(top.valor_yoy_usd)} uds · Vendedor: ${top.vendedor}${otros > 0 ? ` · +${otros} clientes dormidos` : ''}`,
      severity: top.recovery_score < 40 ? 'critical' : top.recovery_score < 60 ? 'warning' : 'warning',
      tag: top.dias_sin_actividad <= 14 ? 'nuevo' : null,
      action: {
        type: 'pulso_panel', target: top.cliente, label: `Ver ${top.cliente}`,
        panelData: {
          panelType: 'cliente_dormido', chatQuestion: `${top.cliente} lleva ${top.dias_sin_actividad} días sin comprar. Vendedor: ${top.vendedor}. ¿Cómo recuperarlo?`,
          cliente: top.cliente, diasInactivo: top.dias_sin_actividad, valorHistorico: top.valor_yoy_usd,
          recoveryScore: top.recovery_score, recoveryLabel: top.recovery_label, vendedorAsignado: top.vendedor,
          diasTranscurridos: estadoMes.diasTranscurridos, diasTotales: estadoMes.diasTotales,
        },
      },
      entityType: 'cliente',
      entityId: top.cliente,
    })
  }

  // ── S5: PRODUCTO ESTRELLA EN DECLIVE (priority 78) ────────────────────────
  if (dataAvailability.has_producto) {
    const { year, month } = selectedPeriod
    // Calculate top products by volume over last 6 months
    const prodVol = new Map<string, { total6m: number; thisMonth: number; prev3m: number }>()
    for (const s of sales) {
      if (!s.producto) continue
      const d = s.fecha
      const sy = d.getFullYear(), sm = d.getMonth()
      const monthsAgo = (year - sy) * 12 + (month - sm)
      if (monthsAgo < 0 || monthsAgo > 5) continue
      const cur = prodVol.get(s.producto) ?? { total6m: 0, thisMonth: 0, prev3m: 0 }
      cur.total6m += s.unidades
      if (monthsAgo === 0) cur.thisMonth += s.unidades
      if (monthsAgo >= 1 && monthsAgo <= 3) cur.prev3m += s.unidades
      prodVol.set(s.producto, cur)
    }
    const topProds = [...prodVol.entries()]
      .sort((a, b) => b[1].total6m - a[1].total6m)
      .slice(0, 5)
    // Adjust for partial month
    const pDiasTotales = new Date(year, month + 1, 0).getDate()
    const pDiasTransc = estadoMes.diasTranscurridos || pDiasTotales
    const dayRatio = pDiasTransc / pDiasTotales
    for (const [prod, vol] of topProds) {
      const avg3m = vol.prev3m / 3
      const avg3mAdj = avg3m * dayRatio  // prorate to current day range
      if (avg3mAdj > 0 && vol.thisMonth < avg3mAdj * 0.6) {
        const dropPct = Math.round(((vol.thisMonth - avg3mAdj) / avg3mAdj) * 100)
        candidates.push({
          type: 'producto_declive',
          priority: 78,
          title: `${prod} cayó ${Math.abs(dropPct)}%`,
          metric: `${Math.abs(dropPct)}%`,
          metricLabel: `vs PM3 (día ${pDiasTransc}/${pDiasTotales})`,
          detail: `${fmtK(vol.thisMonth)} uds (día ${pDiasTransc}) vs ${fmtK(Math.round(avg3mAdj))} esperado`,
          severity: 'critical',
          tag: null,
          action: {
            type: 'pulso_panel', target: prod, label: 'Ver producto',
            panelData: {
              panelType: 'producto_declive', producto: prod,
              stock: categoriasInventario.find(c => c.producto === prod)?.unidades_actuales,
              diasInventario: categoriasInventario.find(c => c.producto === prod)?.dias_inventario,
              promedioMensual: Math.round(avg3mAdj),
              caida_pct: Math.abs(dropPct), ventas_mes_actual: vol.thisMonth,
              categoria: categoriasInventario.find(c => c.producto === prod)?.categoria,
              diasTranscurridos: estadoMes.diasTranscurridos, diasTotales: estadoMes.diasTotales,
              chatQuestion: `El producto ${prod} cayó ${Math.abs(dropPct)}% este mes vs su promedio de 3 meses. ¿Qué vendedores dejaron de venderlo y qué puedo hacer?`,
            },
          },
          entityType: 'producto',
          entityId: prod,
        })
        break // Only top 1
      }
    }
  }

  // ── S6: CATEGORÍAS EN CAÍDA SISTÉMICA (priority 72) ───────────────────────
  if (dataAvailability.has_categoria) {
    const productInsights = insights.filter(i => i.tipo === 'riesgo_producto' && i.prioridad === 'CRITICA')
    const colapsadas = productInsights.filter(i => i.valor_numerico != null && Math.abs(i.valor_numerico) > 50)
    if (colapsadas.length >= 2) {
      const nombres = colapsadas.slice(0, 4).map(i => i.titulo.split(' — ')[1]?.trim() || i.titulo.split(' — ')[0].trim())
      const minDrop = Math.min(...colapsadas.map(i => Math.abs(i.valor_numerico ?? 0)))
      const catData = colapsadas.map(i => ({
        nombre: i.titulo.split(' — ')[1]?.trim() || i.titulo.split(' — ')[0].trim(),
        caida: Math.abs(i.valor_numerico ?? 0),
        perdidaUSD: i.impacto_economico?.valor ?? 0,
      })).sort((a, b) => b.caida - a.caida)
      candidates.push({
        type: 'categorias_caida',
        priority: 72,
        title: `${colapsadas.length} categorías se desplomaron`,
        metric: `>${Math.round(minDrop)}%`,
        metricLabel: 'caída promedio',
        detail: `${nombres.join(', ')} cayeron más de 50%. Esto no es un producto — es una tendencia.`,
        severity: 'warning',
        tag: null,
        action: {
          type: 'pulso_panel', target: 'categorias', label: 'Ver categorías',
          panelData: { panelType: 'categorias_colapso', categorias: catData, chatQuestion: `Tengo ${colapsadas.length} categorías en caída >50%: ${nombres.join(', ')}. ¿Es un problema de mercado o algo interno?` },
        },
        entityType: 'categoria',
      })
    }
  }

  // ── S7: INVENTARIO EN QUIEBRE (priority 82) ──────────────────────────────
  if (dataAvailability.has_inventario) {
    const riesgoQuiebre = categoriasInventario.filter(c => c.clasificacion === 'riesgo_quiebre')
    if (riesgoQuiebre.length > 0) {
      const worst = riesgoQuiebre.sort((a, b) => a.dias_inventario - b.dias_inventario)[0]
      candidates.push({
        type: 'inventario_quiebre',
        priority: 82,
        title: `${worst.producto} se agota en ${worst.dias_inventario} días`,
        metric: `${worst.dias_inventario}`,
        metricLabel: 'días de inventario',
        detail: `Quedan ${worst.unidades_actuales.toLocaleString()} uds. Ritmo: ${Math.round(worst.pm3).toLocaleString()}/mes — reponer ya.`,
        severity: 'critical',
        tag: worst.dias_inventario < 3 ? 'nuevo' : null,
        action: (() => {
          // Calculate top 3 vendors selling this product this month
          const { year, month } = selectedPeriod
          const vendMap = new Map<string, number>()
          for (const s of sales) {
            if (s.producto !== worst.producto) continue
            const d = s.fecha
            if (d.getFullYear() === year && d.getMonth() === month) {
              vendMap.set(s.vendedor, (vendMap.get(s.vendedor) ?? 0) + s.unidades)
            }
          }
          const vendAfectados = [...vendMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([vendedor, uds]) => ({ vendedor, uds }))
          return {
          type: 'pulso_panel' as const, target: worst.producto, label: 'Ver inventario',
          panelData: {
            panelType: 'inventario_riesgo', producto: worst.producto, stock: worst.unidades_actuales,
            diasInventario: worst.dias_inventario, promedioMensual: Math.round(worst.pm3),
            vendedoresAfectados: vendAfectados,
            chatQuestion: `${worst.producto} tiene solo ${worst.dias_inventario} días de inventario. Quedan ${worst.unidades_actuales} uds. ¿Qué hacer?`,
          },
        }})(),
        entityType: 'producto',
        entityId: worst.producto,
      })
    }
  }

  // ── S8: ZONA SUPERVISOR EN PROBLEMAS (priority 68) ────────────────────────
  if (dataAvailability.has_supervisor && dataAvailability.has_metas && supervisorAnalysis.length > 0) {
    const peorZona = supervisorAnalysis
      .filter(s => (s.riesgo_zona === 'critico' || s.riesgo_zona === 'riesgo') && (s.vendedores_criticos + s.vendedores_riesgo) >= 2)
      .sort((a, b) => (a.cumplimiento_pct ?? 100) - (b.cumplimiento_pct ?? 100))[0]
    if (peorZona) {
      const metaPct = peorZona.cumplimiento_pct ?? 0
      const vendZona = vendorAnalysis
        .filter(v => peorZona.vendedores.includes(v.vendedor))
        .map(v => ({ vendedor: v.vendedor, estado: v.riesgo, metaPct: v.cumplimiento_pct ?? null, varPct: v.variacion_ytd_usd_pct ?? v.variacion_ytd_uds_pct ?? null }))
        .sort((a, b) => {
          const order: Record<string, number> = { critico: 0, riesgo: 1, ok: 2, superando: 3 }
          return (order[a.estado] ?? 2) - (order[b.estado] ?? 2)
        })
      const criticosZona = vendZona.filter(v => v.estado === 'critico')
      candidates.push({
        type: 'zona_supervisor',
        priority: 68,
        title: `Zona de ${peorZona.supervisor} necesita atención`,
        metric: `${Math.round(metaPct)}%`,
        metricLabel: 'meta de zona',
        detail: `${peorZona.vendedores_criticos} crítico${peorZona.vendedores_criticos > 1 ? 's' : ''}, ${peorZona.vendedores_riesgo} en riesgo${criticosZona.length > 0 ? `. ${criticosZona[0].vendedor} crítico` : ''}`,
        severity: metaPct < 50 ? 'critical' : 'warning',
        tag: null,
        action: {
          type: 'pulso_panel', target: peorZona.supervisor, label: `Ver zona`,
          panelData: {
            panelType: 'zona_supervisor', supervisor: peorZona.supervisor, metaZonaPct: Math.round(metaPct),
            vendedoresZona: vendZona,
            chatQuestion: `La zona de ${peorZona.supervisor} tiene ${peorZona.vendedores_criticos} vendedores críticos y cumple ${Math.round(metaPct)}% de meta. ¿Qué acciones tomar?`,
          },
        },
        entityType: 'supervisor',
        entityId: peorZona.supervisor,
      })
    }
  }

  // ── S9: OPORTUNIDAD CLIENTE × INVENTARIO (priority 55) ────────────────────
  if (dataAvailability.has_cliente && dataAvailability.has_producto && dataAvailability.has_inventario && clientesDormidos.length > 0) {
    const lentoMov = categoriasInventario.filter(c => c.clasificacion === 'lento_movimiento' || c.clasificacion === 'sin_movimiento')
    if (lentoMov.length > 0) {
      const lentoProds = new Set(lentoMov.map(c => c.producto))
      // Find a dormido client whose historically purchased product is in slow-move inventory
      for (const dormido of [...clientesDormidos].sort((a, b) => b.valor_yoy_usd - a.valor_yoy_usd)) {
        const clientSales = sales.filter(s => s.cliente === dormido.cliente && s.producto && lentoProds.has(s.producto))
        if (clientSales.length > 0) {
          const prodCounts = new Map<string, number>()
          clientSales.forEach(s => prodCounts.set(s.producto!, (prodCounts.get(s.producto!) ?? 0) + s.unidades))
          const topProd = [...prodCounts.entries()].sort((a, b) => b[1] - a[1])[0]
          const inv = lentoMov.find(c => c.producto === topProd[0])
          if (inv) {
            candidates.push({
              type: 'oportunidad_cruce',
              priority: 55,
              title: `Reactiva ${dormido.cliente} con ${topProd[0]}`,
              metric: `${inv.unidades_actuales}`,
              metricLabel: 'uds disponibles',
              detail: `${dormido.cliente} compraba ${topProd[0]}. Tienes stock parado. Oportunidad de reactivación.`,
              severity: 'positive',
              tag: null,
              action: {
                type: 'pulso_panel', target: dormido.cliente, label: 'Ver oportunidad',
                panelData: {
                  panelType: 'oportunidad_cruce', cliente: dormido.cliente, producto: topProd[0],
                  stock: inv.unidades_actuales, vendedorAsignado: dormido.vendedor,
                  chatQuestion: `${dormido.cliente} compraba ${topProd[0]} (${fmtK(topProd[1])} uds historial). Tenemos ${inv.unidades_actuales} uds en stock lento. ¿Cómo reactivar?`,
                },
              },
              entityType: 'cliente',
              entityId: dormido.cliente,
            })
            break // Only 1
          }
        }
      }
    }
  }

  // ── S10: VENDEDOR EN RACHA (priority 40) ──────────────────────────────────
  {
    const superando = vendorAnalysis.filter(v => v.riesgo === 'superando')
    if (superando.length > 0) {
      const best = superando.sort((a, b) => (b.cumplimiento_pct ?? 0) - (a.cumplimiento_pct ?? 0))[0]
      const varPct = Math.round(best.variacion_vs_promedio_pct ?? best.cumplimiento_pct ?? 0)
      candidates.push({
        type: 'vendedor_racha',
        priority: 40,
        title: `${best.vendedor} está en racha`,
        metric: `+${varPct > 0 ? varPct : Math.round(best.cumplimiento_pct ?? 0)}%`,
        metricLabel: 'sobre promedio',
        detail: `Mejor del equipo. ${best.clientes_activos ?? 0} clientes activos y superando proyección.`,
        severity: 'positive',
        tag: null,
        action: { type: 'panel', target: best.vendedor, label: `Ver ${best.vendedor.split(' ')[0]}` },
        entityType: 'vendedor',
        entityId: best.vendedor,
      })
    } else {
      // Fallback: best positive variation
      const bestVar = vendorAnalysis
        .filter(v => (v.variacion_vs_promedio_pct ?? 0) > 0)
        .sort((a, b) => (b.variacion_vs_promedio_pct ?? 0) - (a.variacion_vs_promedio_pct ?? 0))[0]
      if (bestVar) {
        candidates.push({
          type: 'vendedor_racha',
          priority: 35,
          title: `${bestVar.vendedor} está en racha`,
          metric: `+${Math.round(bestVar.variacion_vs_promedio_pct ?? 0)}%`,
          metricLabel: 'sobre promedio',
          detail: `${bestVar.clientes_activos ?? 0} clientes activos este mes`,
          severity: 'positive',
          tag: null,
          action: { type: 'panel', target: bestVar.vendedor, label: `Ver ${bestVar.vendedor.split(' ')[0]}` },
          entityType: 'vendedor',
          entityId: bestVar.vendedor,
        })
      }
    }
  }

  // ── Selection: top 6 with at least 1 positive ─────────────────────────────
  candidates.sort((a, b) => b.priority - a.priority)

  // Deduplicate by type
  const seen = new Set<PulsoSignalType>()
  const deduped = candidates.filter(c => {
    if (seen.has(c.type)) return false
    seen.add(c.type)
    return true
  })

  const MAX_VISIBLE = 6
  const top = deduped.slice(0, MAX_VISIBLE)

  // Ensure at least 1 positive card
  const hasPositive = top.some(c => c.severity === 'positive')
  if (!hasPositive) {
    const positiveCard = deduped.find(c => c.severity === 'positive')
    if (positiveCard) {
      if (top.length >= MAX_VISIBLE) top[MAX_VISIBLE - 1] = positiveCard
      else top.push(positiveCard)
    }
  }

  return { visible: top.slice(0, MAX_VISIBLE), total: deduped.length }
}
