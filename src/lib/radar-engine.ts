import type { VendorAnalysis, TeamStats, DataAvailability, Insight } from '../types'

// ─── Types ──────────────────────────────────────────────────────────────────

export type RadarCardType =
  | 'vendedor_crisis'
  | 'dinero_yendose'
  | 'mejor_jugador'
  | 'alerta_inventario'
  | 'categoria_colapso'
  | 'oportunidad_expansion'
  | 'dependencia_peligrosa'
  | 'ritmo_meta'
  | 'canal_problemas'
  | 'dato_curioso'
  | 'buena_noticia'
  | 'ranking_equipo'

export type RadarSeverity = 'critical' | 'warning' | 'positive' | 'info'

export interface RadarPanelData {
  panelType: 'categorias_colapso' | 'inventario_riesgo'
  categorias?: Array<{ nombre: string; caida: number; perdidaUSD: number }>
  producto?: string
  stock?: number
  diasInventario?: number
  promedioMensual?: number
  chatQuestion: string
}

export interface RadarAction {
  type: 'panel' | 'chat' | 'radar_panel'
  target: string
  label: string
  panelData?: RadarPanelData
}

export interface RadarCard {
  type: RadarCardType
  priority: number
  title: string
  metric: string
  metricLabel: string
  detail: string
  severity: RadarSeverity
  tag: 'nuevo' | 'cambió' | 'persistente' | null
  action: RadarAction
  entityType?: 'vendedor' | 'cliente' | 'producto' | 'categoria' | null
  entityId?: string | null
}

// ─── Input ──────────────────────────────────────────────────────────────────

export interface RadarInput {
  vendorAnalysis: VendorAnalysis[]
  teamStats: TeamStats
  clientesDormidos: Array<{
    cliente: string
    dias_sin_actividad: number
    valor_historico: number
    recovery_label: string
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
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return Math.round(n).toLocaleString()
}

// ─── Engine ─────────────────────────────────────────────────────────────────

export function computeRadarCards(input: RadarInput): RadarCard[] {
  const {
    vendorAnalysis, teamStats, clientesDormidos, concentracionRiesgo,
    categoriasInventario, canalAnalysis, insights, dataAvailability,
    moneda, showUSD, estadoMes, cumplimientoFinal,
  } = input

  const candidates: RadarCard[] = []

  // Track the worst vendedor for dedup with dinero_yendose
  let worstVendedorCrisis: string | null = null

  // ── 1. vendedor_crisis (C1+C2: human title, USD metric) ───────────────────
  const criticos = vendorAnalysis.filter(v => v.riesgo === 'critico')
  if (criticos.length > 0) {
    const worst = criticos.sort((a, b) => (a.variacion_vs_promedio_pct ?? 0) - (b.variacion_vs_promedio_pct ?? 0))[0]
    worstVendedorCrisis = worst.vendedor
    const dormidosVend = clientesDormidos.filter(c => c.vendedor === worst.vendedor)
    const valorEnRiesgo = dormidosVend.reduce((s, c) => s + c.valor_historico, 0)
    const caida = Math.abs(worst.variacion_vs_promedio_pct ?? 0)
    const nombre = worst.vendedor.split(' ')[0]

    candidates.push({
      type: 'vendedor_crisis',
      priority: 90 + Math.min(caida / 5, 10),
      title: `${worst.vendedor} está cayendo`,
      metric: showUSD && valorEnRiesgo > 0
        ? `${moneda} ${fmtK(valorEnRiesgo)}`
        : `${Math.round(caida)}%`,
      metricLabel: showUSD && valorEnRiesgo > 0
        ? 'en riesgo de perderse'
        : 'caída vs promedio',
      detail: `Cayó ${Math.round(caida)}% y tiene ${dormidosVend.length} cliente${dormidosVend.length !== 1 ? 's' : ''} sin comprar`,
      severity: 'critical',
      tag: worst.semanas_bajo_promedio <= 2 ? 'nuevo' : 'persistente',
      action: { type: 'panel', target: worst.vendedor, label: `Ver ${nombre}` },
      entityType: 'vendedor',
      entityId: worst.vendedor,
    })
  }

  // ── 2. dinero_yendose (C3: dedup with vendedor_crisis) ────────────────────
  if (clientesDormidos.length > 0) {
    // Filter out clients already covered by the crisis vendor
    const noCubiertos = worstVendedorCrisis
      ? clientesDormidos.filter(c => c.vendedor !== worstVendedorCrisis)
      : clientesDormidos
    if (noCubiertos.length > 0) {
      const totalValor = noCubiertos.reduce((s, c) => s + c.valor_historico, 0)
      const top = noCubiertos.sort((a, b) => b.valor_historico - a.valor_historico)[0]
      candidates.push({
        type: 'dinero_yendose',
        priority: 85 + Math.min(noCubiertos.length, 10),
        title: `${noCubiertos.length} cliente${noCubiertos.length > 1 ? 's' : ''} dejaron de comprar`,
        metric: showUSD && totalValor > 0 ? `${moneda} ${fmtK(totalValor)}` : `${noCubiertos.length}`,
        metricLabel: showUSD && totalValor > 0 ? 'en ventas históricas' : 'clientes inactivos',
        detail: `${top.cliente}: ${top.dias_sin_actividad} días sin actividad`,
        severity: 'critical',
        tag: null,
        action: { type: 'panel', target: top.cliente, label: `Ver ${top.cliente}` },
        entityType: 'cliente',
        entityId: top.cliente,
      })
    }
  }

  // ── 3. mejor_jugador (C5B: genuine positive card) ─────────────────────────
  {
    // First try vendedores superando meta
    const superando = vendorAnalysis.filter(v => v.riesgo === 'superando')
    if (superando.length > 0) {
      const best = superando.sort((a, b) => (b.cumplimiento_pct ?? 0) - (a.cumplimiento_pct ?? 0))[0]
      const nombre = best.vendedor.split(' ')[0]
      candidates.push({
        type: 'mejor_jugador',
        priority: 40,
        title: `${best.vendedor} está en racha`,
        metric: `+${Math.round(best.variacion_ytd_pct ?? best.cumplimiento_pct ?? 0)}%`,
        metricLabel: 'sobre su promedio',
        detail: `Mejor del equipo. ${best.clientes_activos ?? 0} clientes activos y superando proyección.`,
        severity: 'positive',
        tag: null,
        action: { type: 'panel', target: best.vendedor, label: `Ver ${nombre}` },
        entityType: 'vendedor',
        entityId: best.vendedor,
      })
    } else {
      // Fallback: best positive variation vendor
      const bestVar = vendorAnalysis
        .filter(v => (v.variacion_vs_promedio_pct ?? 0) > 0)
        .sort((a, b) => (b.variacion_vs_promedio_pct ?? 0) - (a.variacion_vs_promedio_pct ?? 0))[0]
      if (bestVar) {
        const nombre = bestVar.vendedor.split(' ')[0]
        candidates.push({
          type: 'mejor_jugador',
          priority: 40,
          title: `${bestVar.vendedor} está en racha`,
          metric: `+${Math.round(bestVar.variacion_vs_promedio_pct ?? 0)}%`,
          metricLabel: 'sobre su promedio',
          detail: `${bestVar.clientes_activos ?? 0} clientes activos este mes`,
          severity: 'positive',
          tag: null,
          action: { type: 'panel', target: bestVar.vendedor, label: `Ver ${nombre}` },
          entityType: 'vendedor',
          entityId: bestVar.vendedor,
        })
      } else {
        // Third fallback: vendor with most active clients = "pilar del equipo"
        const pilar = [...vendorAnalysis]
          .filter(v => v.riesgo !== 'critico')
          .sort((a, b) => (b.clientes_activos ?? 0) - (a.clientes_activos ?? 0))[0]
        if (pilar) {
          const nombre = pilar.vendedor.split(' ')[0]
          candidates.push({
            type: 'mejor_jugador',
            priority: 35,
            title: `${pilar.vendedor} es el pilar del equipo`,
            metric: `${pilar.clientes_activos ?? 0}`,
            metricLabel: 'clientes activos',
            detail: `Mayor cartera activa del equipo este mes`,
            severity: 'positive',
            tag: null,
            action: { type: 'panel', target: pilar.vendedor, label: `Ver ${nombre}` },
            entityType: 'vendedor',
            entityId: pilar.vendedor,
          })
        }
      }
    }
  }

  // ── 4. alerta_inventario (C8: human-readable detail) ──────────────────────
  if (dataAvailability.has_inventario) {
    const riesgoQuiebre = categoriasInventario.filter(c => c.clasificacion === 'riesgo_quiebre')
    if (riesgoQuiebre.length > 0) {
      const worst = riesgoQuiebre.sort((a, b) => a.dias_inventario - b.dias_inventario)[0]
      candidates.push({
        type: 'alerta_inventario',
        priority: 80 + (worst.dias_inventario < 3 ? 15 : 0),
        title: `${worst.producto} a punto de agotarse`,
        metric: `${worst.dias_inventario}`,
        metricLabel: 'días de inventario',
        detail: `Quedan ${worst.unidades_actuales.toLocaleString()} uds. Ritmo de venta: ${Math.round(worst.pm3).toLocaleString()}/mes${worst.dias_inventario <= 7 ? ' — hay que reponer ya.' : '.'}`,
        severity: 'critical',
        tag: worst.dias_inventario < 3 ? 'nuevo' : null,
        action: {
          type: 'radar_panel', target: worst.producto, label: 'Ver detalle',
          panelData: {
            panelType: 'inventario_riesgo',
            producto: worst.producto,
            stock: worst.unidades_actuales,
            diasInventario: worst.dias_inventario,
            promedioMensual: Math.round(worst.pm3),
            chatQuestion: `¿Qué debo hacer con ${worst.producto} que tiene solo ${worst.dias_inventario} días de inventario? Quedan ${worst.unidades_actuales} unidades.`,
          },
        },
        entityType: 'producto',
        entityId: worst.producto,
      })
    }
  }

  // Helper to build categoria action with radar_panel data
  const buildCategoriaAction = (items: Insight[], nombres: string[]): RadarAction => {
    const catData = items.map(i => ({
      nombre: i.titulo.split(' — ')[1]?.trim() || i.titulo.split(' — ')[0].trim(),
      caida: Math.abs(i.valor_numerico ?? 0),
      perdidaUSD: i.impacto_economico?.valor ?? 0,
    })).sort((a, b) => b.caida - a.caida)
    const chatQ = items.length >= 3
      ? `Tengo ${items.length} categorías en caída de más de 50%: ${nombres.join(', ')}. ¿Es un problema de mercado o algo interno?`
      : items.length === 1
      ? `La categoría ${nombres[0]} cayó ${catData[0]?.caida.toFixed(0)}%. ¿Qué está causando esta caída y qué puedo hacer?`
      : `Las categorías ${nombres.join(' y ')} cayeron más de 50%. ¿Qué está pasando y qué acciones tomar?`
    return {
      type: 'radar_panel', target: 'categorias', label: 'Ver categorías',
      panelData: { panelType: 'categorias_colapso', categorias: catData, chatQuestion: chatQ },
    }
  }

  // ── 5. categoria_colapso (C4: name in title, detect systemic) ─────────────
  {
    const productInsights = insights.filter(i => i.tipo === 'riesgo_producto' && i.prioridad === 'CRITICA')
    // Group by category-level collapse (>50% drop)
    const colapsadas = productInsights.filter(i => i.valor_numerico != null && Math.abs(i.valor_numerico) > 50)
    if (colapsadas.length >= 3) {
      // Systemic collapse
      const nombres = colapsadas.slice(0, 4).map(i => {
        const parts = i.titulo.split(' — ')
        return parts[1]?.trim() || parts[0].trim()
      })
      const minDrop = Math.min(...colapsadas.map(i => Math.abs(i.valor_numerico ?? 0)))
      candidates.push({
        type: 'categoria_colapso',
        priority: 85,
        title: `${colapsadas.length} categorías se desplomaron`,
        metric: `>${Math.round(minDrop)}%`,
        metricLabel: 'caída promedio',
        detail: `${nombres.join(', ')} cayeron más de 50%. Esto no es un producto — es una tendencia.`,
        severity: 'critical',
        tag: null,
        action: buildCategoriaAction(colapsadas, nombres),
        entityType: 'categoria',
      })
    } else if (colapsadas.length > 0) {
      const top = colapsadas[0]
      const catName = top.titulo.split(' — ')[1]?.trim() || top.titulo.split(' — ')[0].trim()
      const drop = Math.abs(top.valor_numerico ?? 0)
      if (colapsadas.length === 2) {
        const cat2 = colapsadas[1].titulo.split(' — ')[1]?.trim() || colapsadas[1].titulo.split(' — ')[0].trim()
        candidates.push({
          type: 'categoria_colapso',
          priority: 78,
          title: `${catName} y ${cat2} cayeron`,
          metric: `${Math.round(drop)}%`,
          metricLabel: 'caída mayor',
          detail: top.descripcion.split(/(?<=[.!])\s/)[0],
          severity: 'critical',
          tag: null,
          action: buildCategoriaAction(colapsadas, [catName, cat2]),
          entityType: 'categoria',
        })
      } else {
        candidates.push({
          type: 'categoria_colapso',
          priority: 75,
          title: `${catName} se desplomó`,
          metric: `${Math.round(drop)}%`,
          metricLabel: 'caída en ventas',
          detail: `La categoría "${catName}" cayó ${drop.toFixed(0)}% vs su promedio histórico.`,
          severity: drop > 50 ? 'critical' : 'warning',
          tag: null,
          action: buildCategoriaAction(colapsadas, [catName]),
          entityType: 'categoria',
        })
      }
    } else if (productInsights.length > 0) {
      const top = productInsights[0]
      const catName = top.titulo.split(' — ')[1]?.trim() || top.titulo.split(' — ')[0].trim()
      candidates.push({
        type: 'categoria_colapso',
        priority: 65,
        title: top.titulo.split(' — ')[0],
        metric: top.valor_numerico != null ? `${Math.round(top.valor_numerico)}%` : '—',
        metricLabel: 'caída en ventas',
        detail: top.descripcion.split(/(?<=[.!])\s/)[0],
        severity: 'warning',
        tag: null,
        action: buildCategoriaAction([top], [catName]),
        entityType: 'producto',
      })
    }
  }

  // ── 6. oportunidad_expansion (exclude dependency, concentration, and causa raíz) ─
  const hallazgos = insights.filter(i =>
    i.tipo === 'hallazgo'
    && !(i.detector === 'dependencia_vendedor' || /concentraci[oó]n|depende|causa ra[ií]z|posible causa/i.test(i.titulo))
  )
  if (hallazgos.length > 0) {
    const best = hallazgos[0]
    // Analytic insights about problems are 'info', genuine opportunities are 'positive'
    const isRiskAnalysis = /ca[ií]da|riesgo|deterioro|problem/i.test(best.descripcion)
    candidates.push({
      type: 'oportunidad_expansion',
      priority: 50,
      title: best.titulo.split(' — ')[0],
      metric: best.valor_numerico?.toLocaleString() ?? '✦',
      metricLabel: best.impacto_economico ? 'potencial' : 'oportunidad detectada',
      detail: best.descripcion.split(/(?<=[.!])\s/)[0],
      severity: isRiskAnalysis ? 'info' : 'positive',
      tag: null,
      action: best.vendedor
        ? { type: 'panel', target: best.vendedor, label: `Ver ${best.vendedor.split(' ')[0]}` }
        : { type: 'chat', target: `${best.titulo}. ${best.descripcion}. Dame un plan de acción concreto.`, label: 'Analizar con IA' },
      entityType: best.vendedor ? 'vendedor' : null,
      entityId: best.vendedor,
    })
  }

  // Generate dependencia_peligrosa from hallazgo insights about vendor concentration
  const depInsights = insights.filter(i =>
    i.tipo === 'hallazgo' && (i.detector === 'dependencia_vendedor' || /dependencia de vendedor/i.test(i.titulo))
  )
  if (depInsights.length > 0) {
    const dep = depInsights[0]
    const pctVal = dep.valor_numerico ?? 0
    candidates.push({
      type: 'dependencia_peligrosa',
      priority: 60 + (pctVal > 80 ? 20 : 0),
      title: dep.titulo.includes('zonas')
        ? dep.titulo
        : `Todo ${dep.titulo.split(' en ')[1] ?? 'el territorio'} depende de ${dep.vendedor ?? 'un vendedor'}`,
      metric: `${Math.round(pctVal)}%`,
      metricLabel: 'concentración de ventas',
      detail: dep.descripcion.split(/(?<=[.!])\s/)[0],
      severity: pctVal > 90 ? 'critical' : 'warning',
      tag: null,
      action: dep.vendedor
        ? { type: 'panel', target: dep.vendedor, label: `Ver ${dep.vendedor.split(' ')[0]}` }
        : { type: 'chat', target: `${dep.titulo}. ${dep.descripcion}. ¿Cómo diversifico?`, label: 'Analizar con IA' },
      entityType: dep.vendedor ? 'vendedor' : null,
      entityId: dep.vendedor,
    })
  }

  // (dependencia_peligrosa is now generated from hallazgo insights above, not concentracionRiesgo)

  // ── 8. ritmo_meta ─────────────────────────────────────────────────────────
  {
    const proy = estadoMes.proyeccion_cierre
    const meta = teamStats.meta_equipo
    const pct = cumplimientoFinal
    const proyPct = meta && meta > 0 ? proy / meta : null
    let metaDetail: string
    let metaSeverity: RadarSeverity
    if (!meta) {
      metaDetail = `${fmtK(estadoMes.actual)} uds vendidas al día ${estadoMes.diasTranscurridos}`
      metaSeverity = 'info'
    } else if (proyPct !== null && proyPct >= 0.95) {
      metaDetail = 'Al ritmo actual se alcanzará la meta'
      metaSeverity = 'positive'
    } else if (proyPct !== null && proyPct >= 0.70) {
      metaDetail = `Al ritmo actual llegarás al ${Math.round(proyPct * 100)}% de la meta`
      metaSeverity = 'warning'
    } else {
      metaDetail = `Al ritmo actual solo llegarás al ${Math.round((proyPct ?? 0) * 100)}% de la meta`
      metaSeverity = 'critical'
    }
    const isBehind = estadoMes.estado === 'atrasado'
    candidates.push({
      type: 'ritmo_meta',
      priority: isBehind && (estadoMes.gap_pct ?? 0) < -15 ? 55 : 30,
      title: meta ? `Meta: ${Math.round(pct)}% al día ${estadoMes.diasTranscurridos}` : 'Ritmo del mes',
      metric: `${fmtK(proy)}`,
      metricLabel: 'proyección de cierre',
      detail: metaDetail,
      severity: metaSeverity,
      tag: null,
      action: { type: 'chat', target: `La meta del equipo es ${meta ? meta.toLocaleString() + ' uds' : 'no definida'}. Proyección: ${fmtK(proy)} uds. ¿Qué acciones tomar para mejorar?`, label: 'Analizar con IA' },
    })
  }

  // ── 9. canal_problemas ────────────────────────────────────────────────────
  if (dataAvailability.has_canal) {
    const canalEnCaida = canalAnalysis
      .filter(c => c.activo_periodo && c.variacion_pct < -30)
      .sort((a, b) => a.variacion_pct - b.variacion_pct)[0]
    if (canalEnCaida) {
      candidates.push({
        type: 'canal_problemas',
        priority: 70,
        title: `Canal ${canalEnCaida.canal} en caída`,
        metric: `${Math.round(Math.abs(canalEnCaida.variacion_pct))}%`,
        metricLabel: 'caída vs histórico',
        detail: `Representaba ${canalEnCaida.participacion_pct.toFixed(0)}% de las ventas`,
        severity: 'warning',
        tag: null,
        action: { type: 'chat', target: `El canal ${canalEnCaida.canal} cayó ${Math.round(Math.abs(canalEnCaida.variacion_pct))}%. ¿Qué vendedores operan en este canal y qué pasó?`, label: 'Analizar con IA' },
      })
    }
  }

  // ── 10. dato_curioso ──────────────────────────────────────────────────────
  const cruzados = insights.filter(i => i.tipo === 'cruzado')
  if (cruzados.length > 0) {
    const c = cruzados[0]
    candidates.push({
      type: 'dato_curioso',
      priority: 45,
      title: c.titulo.split(' — ')[0],
      metric: c.valor_numerico?.toLocaleString() ?? '!',
      metricLabel: 'factores combinados',
      detail: c.descripcion.split(/(?<=[.!])\s/)[0],
      severity: 'warning',
      tag: null,
      action: c.vendedor
        ? { type: 'panel', target: c.vendedor, label: `Ver ${c.vendedor.split(' ')[0]}` }
        : { type: 'chat', target: `${c.titulo}. ${c.descripcion}. ¿Qué acciones recomiendas?`, label: 'Analizar con IA' },
      entityType: c.vendedor ? 'vendedor' : null,
      entityId: c.vendedor,
    })
  }

  // ── 11. buena_noticia ─────────────────────────────────────────────────────
  {
    const positiveInsights = insights.filter(i => i.tipo === 'hallazgo' && /racha positiva|nuevo cliente|crecimiento/i.test(i.titulo))
    if (positiveInsights.length > 0) {
      const p = positiveInsights[0]
      candidates.push({
        type: 'buena_noticia',
        priority: 35,
        title: p.titulo.split(' — ')[0],
        metric: p.valor_numerico?.toLocaleString() ?? '↑',
        metricLabel: 'crecimiento detectado',
        detail: p.descripcion.split(/(?<=[.!])\s/)[0],
        severity: 'positive',
        tag: 'nuevo',
        action: p.vendedor
          ? { type: 'panel', target: p.vendedor, label: `Ver ${p.vendedor.split(' ')[0]}` }
          : { type: 'chat', target: `${p.titulo}. ${p.descripcion}. ¿Cómo aprovecho esta tendencia?`, label: 'Analizar con IA' },
        entityType: p.vendedor ? 'vendedor' : null,
        entityId: p.vendedor,
      })
    } else if (teamStats.variacion_ytd_equipo != null && teamStats.variacion_ytd_equipo > 0) {
      // Fallback: YTD growth as positive card
      candidates.push({
        type: 'buena_noticia',
        priority: 30,
        title: `Ventas YTD +${teamStats.variacion_ytd_equipo.toFixed(1)}% vs año anterior`,
        metric: `+${teamStats.variacion_ytd_equipo.toFixed(1)}%`,
        metricLabel: 'crecimiento YTD',
        detail: `El equipo acumula crecimiento positivo respecto al mismo período del año pasado.`,
        severity: 'positive',
        tag: null,
        action: { type: 'chat', target: `Las ventas YTD crecieron ${teamStats.variacion_ytd_equipo.toFixed(1)}%. ¿Qué lo está impulsando y cómo mantenerlo?`, label: 'Analizar con IA' },
      })
    }
  }

  // ── 12. ranking_equipo ────────────────────────────────────────────────────
  if (vendorAnalysis.length >= 3) {
    const sorted = [...vendorAnalysis].sort((a, b) => (b.cumplimiento_pct ?? b.ventas_periodo) - (a.cumplimiento_pct ?? a.ventas_periodo))
    const top3 = sorted.slice(0, 3)
    const best = top3[0]
    candidates.push({
      type: 'ranking_equipo',
      priority: 25,
      title: 'Top 3 del equipo',
      metric: `${vendorAnalysis.length}`,
      metricLabel: 'vendedores activos',
      detail: top3.map((v, i) => `${['🥇','🥈','🥉'][i]} ${v.vendedor.split(' ')[0]}`).join(' · '),
      severity: 'positive',
      tag: null,
      action: { type: 'panel', target: best.vendedor, label: `Ver ${best.vendedor.split(' ')[0]}` },
      entityType: 'vendedor',
      entityId: best.vendedor,
    })
  }

  // ── Selection: top 5 with at least 1 positive ─────────────────────────────
  candidates.sort((a, b) => b.priority - a.priority)

  // Deduplicate by type
  const seen = new Set<RadarCardType>()
  const deduped = candidates.filter(c => {
    if (seen.has(c.type)) return false
    seen.add(c.type)
    return true
  })

  // Build top 5 with guarantee: at least 1 positive severity card
  // Prefer mejor_jugador > buena_noticia > ranking_equipo > any positive
  const top5 = deduped.slice(0, 5)
  const hasPositive = top5.some(c => c.severity === 'positive')
  if (!hasPositive) {
    const positiveCard =
      deduped.find(c => c.type === 'mejor_jugador') ??
      deduped.find(c => c.type === 'buena_noticia' && c.severity === 'positive') ??
      deduped.find(c => c.type === 'ranking_equipo') ??
      deduped.find(c => c.severity === 'positive')
    if (positiveCard) {
      if (top5.length >= 5) {
        top5[4] = positiveCard
      } else {
        top5.push(positiveCard)
      }
    }
  }

  return top5.slice(0, 5)
}
