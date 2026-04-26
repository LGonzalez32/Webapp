import type { SaleRecord, MetaRecord } from '../types'

// ─── Statistical helpers (internal) ──────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0
  const m = mean(values)
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

function linearRegression(ys: number[]): { slope: number; r2: number } {
  const n = ys.length
  if (n < 2) return { slope: 0, r2: 0 }
  const xs = Array.from({ length: n }, (_, i) => i)
  const mx = mean(xs)
  const my = mean(ys)
  let num = 0; let dx2 = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    dx2 += (xs[i] - mx) ** 2
  }
  if (dx2 === 0) return { slope: 0, r2: 0 }
  const slope = num / dx2
  const intercept = my - slope * mx
  const yHat = xs.map(x => slope * x + intercept)
  const ssTot = ys.reduce((s, y) => s + (y - my) ** 2, 0)
  const ssRes = ys.reduce((s, y, i) => s + (y - yHat[i]) ** 2, 0)
  return { slope, r2: ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot) }
}

function pearsonR(xs: number[], ys: number[]): number {
  const n = xs.length
  if (n < 3) return 0
  const mx = mean(xs)
  const my = mean(ys)
  let num = 0; let dx2 = 0; let dy2 = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    dx2 += (xs[i] - mx) ** 2
    dy2 += (ys[i] - my) ** 2
  }
  const denom = Math.sqrt(dx2 * dy2)
  return denom === 0 ? 0 : num / denom
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type MetricUnit = 'USD' | 'uds' | 'pct' | 'count' | 'ratio'

export interface MetricComputeOpts {
  metas: MetaRecord[]
  metaType: 'uds' | 'usd'
  year: number
  month: number    // 0-indexed (Jan = 0)
  member?: string  // dimension value — needed for meta lookup (e.g. vendedor name)
}

export interface MetricDef {
  id: string
  label: string
  unit: MetricUnit
  higherIsBetter: boolean
  requiresMetas?: boolean
  compute: (records: SaleRecord[], opts: MetricComputeOpts) => number | null
  // [PR-FIX.8] qué insight types pueden analizar esta métrica (builders especializados).
  compatibleInsights?: string[]
  // Qué insight types del loop principal (trend/change/dominance/contribution/proportion_shift/meta_gap)
  // están permitidos para esta métrica. Si undefined → todos permitidos.
  // Usar para métricas de ratio/promedio donde dominance/contribution no tienen significado semántico.
  mainLoopInsightTypes?: string[]
}

export interface DimensionDef {
  id: string
  label: string
  field: string   // field name in SaleRecord
  // [PR-FIX.8] qué insight types pueden operar sobre esta dimensión.
  supports?: string[]
}

export interface DataPoint {
  member: string
  value: number
  prevValue?: number
  history?: number[]  // [oldest → newest] for trend detection
  value2?: number     // second metric value for correlation
  // [Z.7 T1 — A] extra metadata per point for inventory/cross-product types
  extra?: Record<string, unknown>
}

export interface DetectResult {
  found: boolean
  score: number                        // normalized 0–1
  detail: Record<string, unknown>
}

export type MotorStatus =
  | 'motor2_native'   // usa builders de Motor 2 directamente
  | 'motor2_target'   // legacy que debe migrar pronto
  | 'legacy_bridge'   // legacy parcialmente mapeado a Motor 2
  | 'legacy_keep'     // semántica específica no generalizable

export interface InsightTypeDef {
  id: string
  label: string
  needsHistory?: boolean
  needsPrevValue?: boolean
  needsValue2?: boolean
  /** [Z.4 — perf: cuello-1] Si true, el main loop solo evalúa miembros Pareto 80/20 del
   *  (dim, metric). Solo seguro para tipos que miden VOLUMEN ABSOLUTO (dominance).
   *  change/trend/proportion_shift miden % relativo y pueden tener ganadores fuera del 80/20. */
  prunable?: boolean
  // [Z.7 T1 — A] If true, this type is skipped in the main dim×metric loop and
  // handled by the special inventory pass in runInsightEngine.
  needsInventario?: boolean
  /** Clasificación de origen del tipo respecto al Motor 2. */
  motorStatus: MotorStatus
  detect: (points: DataPoint[], ctx?: Record<string, unknown>) => DetectResult | null
}

// ─── Metric Registry ──────────────────────────────────────────────────────────

export const METRIC_REGISTRY: MetricDef[] = [
  {
    id: 'venta',
    label: 'Venta',
    unit: 'USD',
    higherIsBetter: true,
    compute: (records, opts) =>
      opts.metaType === 'uds'
        ? records.reduce((s, r) => s + r.unidades, 0)
        : records.reduce((s, r) => s + (r.venta_neta ?? 0), 0),
    compatibleInsights: ['steady_share'],
  },
  {
    id: 'unidades',
    label: 'Unidades',
    unit: 'uds',
    higherIsBetter: true,
    compute: (records) => records.reduce((s, r) => s + r.unidades, 0),
    compatibleInsights: ['change_point', 'steady_share', 'outlier', 'correlation'],
  },
  {
    id: 'ticket_promedio',
    label: 'Ticket promedio',
    unit: 'USD',
    higherIsBetter: true,
    compatibleInsights: ['change_point', 'outlier', 'correlation'],
    // Promedio — dominance/contribution/proportion_shift no tienen significado semántico sobre un promedio.
    mainLoopInsightTypes: ['trend', 'change'],
    compute: (records, opts) => {
      if (records.length === 0) return null
      const total =
        opts.metaType === 'uds'
          ? records.reduce((s, r) => s + r.unidades, 0)
          : records.reduce((s, r) => s + (r.venta_neta ?? 0), 0)
      return total / records.length
    },
  },
  {
    id: 'precio_unitario',
    label: 'Precio unitario',
    unit: 'USD',
    higherIsBetter: false,
    compute: (records) => {
      const totalUnidades = records.reduce((s, r) => s + r.unidades, 0)
      if (totalUnidades === 0) return null
      const totalNeto = records.reduce((s, r) => s + (r.venta_neta ?? 0), 0)
      return totalNeto / totalUnidades
    },
    compatibleInsights: ['change_point', 'outlier', 'correlation'],
    // Ratio — la suma de precios unitarios no tiene significado de negocio.
    mainLoopInsightTypes: ['trend', 'change'],
  },
  {
    id: 'num_transacciones',
    label: 'Nº de transacciones',
    unit: 'count',
    higherIsBetter: true,
    compute: (records) => records.length,
    compatibleInsights: [],
  },
  // [PR-M5c] Métrica declarada en PR-M1 (metricRegistry.ts paralelo) ahora
  // materializada en el motor 2 legacy para generar candidates via loop
  // genérico dim × metric × type. Distinta de num_transacciones (rows totales);
  // cuenta clientes distintos. Semántica: "cobertura de cartera".
  // totalImpact-safe: unit='count' + toUSD() fallthrough → 0, no suma a USD.
  {
    id: 'num_clientes_activos',
    label: 'Clientes activos',
    unit: 'count',
    higherIsBetter: true,
    compute: (records) => new Set(records.map(r => r.cliente).filter(Boolean)).size,
    compatibleInsights: [],
  },
  // [PR-FIX.8] ventas_por_cliente: métrica derivada usada por el outlier builder
  // (anteriormente hardcodeada). Σventa_neta / # clientes únicos del grupo.
  {
    id: 'ventas_por_cliente',
    label: 'Ventas por cliente',
    unit: 'USD',
    higherIsBetter: true,
    compute: (records) => {
      const clientes = new Set(records.map(r => r.cliente).filter(Boolean))
      if (clientes.size === 0) return 0
      return records.reduce((s, r) => s + (r.venta_neta ?? 0), 0) / clientes.size
    },
    compatibleInsights: ['outlier'],
    // Promedio derivado — misma razón que ticket_promedio.
    mainLoopInsightTypes: ['trend', 'change'],
  },
  {
    id: 'cumplimiento_meta',
    label: 'Cumplimiento de meta',
    unit: 'pct',
    higherIsBetter: true,
    requiresMetas: true,
    // Solo meta_gap (brecha del mes actual), trend (deterioro sostenido) y change (quiebre abrupto).
    // dominance/contribution/proportion_shift no aplican sobre un porcentaje de cumplimiento.
    mainLoopInsightTypes: ['meta_gap', 'trend', 'change'],
    compute: (records, opts) => {
      if (!opts.member || !opts.metas.length) return null
      const metaMes = opts.month + 1   // MetaRecord.mes is 1-indexed
      const metasVendedor = opts.metas.filter(
        m => m.vendedor === opts.member && m.anio === opts.year && m.mes === metaMes
      )
      const metaTotal = metasVendedor.reduce(
        (s, m) => s + (opts.metaType === 'uds' ? (m.meta_uds ?? 0) : (m.meta_usd ?? 0)),
        0
      )
      if (metaTotal <= 0) return null
      const venta =
        opts.metaType === 'uds'
          ? records.reduce((s, r) => s + r.unidades, 0)
          : records.reduce((s, r) => s + (r.venta_neta ?? 0), 0)
      return (venta / metaTotal) * 100
    },
    compatibleInsights: [],
  },
  {
    id: 'frecuencia_compra',
    label: 'Frecuencia de compra',
    unit: 'ratio',
    higherIsBetter: true,
    compute: (records) => {
      const clientes = new Set(records.map(r => r.cliente).filter(Boolean)).size
      if (clientes === 0) return null
      return records.length / clientes
    },
    compatibleInsights: ['change_point', 'outlier', 'correlation'],
    // Ratio transacciones/clientes — la suma de ratios no tiene significado de volumen.
    mainLoopInsightTypes: ['trend', 'change'],
  },
]

// ─── Dimension Registry ───────────────────────────────────────────────────────

export const DIMENSION_REGISTRY: DimensionDef[] = [
  { id: 'vendedor',     label: 'Vendedor',      field: 'vendedor',
    supports: ['change_point', 'steady_share', 'outlier', 'correlation'] },
  { id: 'producto',     label: 'Producto',      field: 'producto',
    supports: ['change_point', 'steady_share', 'outlier'] },
  { id: 'categoria',    label: 'Categoría',     field: 'categoria',
    supports: ['change_point', 'steady_share', 'outlier'] },
  { id: 'canal',        label: 'Canal',         field: 'canal',
    supports: ['change_point', 'steady_share', 'outlier'] },
  { id: 'departamento', label: 'Departamento',  field: 'departamento',
    supports: ['change_point', 'steady_share', 'outlier'] },
  { id: 'supervisor',   label: 'Supervisor',    field: 'supervisor',
    supports: ['change_point', 'steady_share', 'outlier'] },
  { id: 'cliente',      label: 'Cliente',       field: 'cliente',
    supports: ['change_point', 'steady_share', 'outlier', 'correlation'] },
]

// ─── Insight Type Registry ────────────────────────────────────────────────────

export const INSIGHT_TYPE_REGISTRY: InsightTypeDef[] = [
  // outlier eliminado como insight primario (Fase 4B): dato estadístico
  // crudo sin causa accionable. Si detectás desviación significativa,
  // usala como DATO SECUNDARIO dentro del contexto de otra card
  // (ej: "su cliente X además tiene ticket muy por debajo del promedio").

  // ── 1. trend ─────────────────────────────────────────────────────────────────
  {
    id: 'trend',
    label: 'Tendencia sostenida',
    motorStatus: 'legacy_bridge',   // semántica cubierta por change_point, aún no migrado
    needsHistory: true,
    detect(points) {
      let best: DetectResult | null = null
      for (const p of points) {
        if (!p.history || p.history.filter(v => v > 0).length < 3) continue
        const { slope, r2 } = linearRegression(p.history)
        if (r2 < 0.7) continue
        const base = Math.max(mean(p.history), 1)
        const pctChange = (slope * (p.history.length - 1)) / base
        if (Math.abs(pctChange) < 0.10) continue
        const score = Math.min(Math.abs(pctChange) * r2, 1)
        if (!best || score > best.score) {
          best = {
            found: true,
            score,
            detail: { member: p.member, direction: slope > 0 ? 'up' : 'down', slope, months: p.history.length, pctChange },
          }
        }
      }
      return best
    },
  },

  // ── 3. change ────────────────────────────────────────────────────────────────
  {
    id: 'change',
    label: 'Cambio significativo',
    motorStatus: 'legacy_bridge',   // MoM simple; change_point builder cubre series largas
    needsPrevValue: true,
    detect(points) {
      const withPrev = points.filter(p => p.prevValue != null && p.prevValue > 0)
      if (withPrev.length === 0) return null
      let best: DetectResult | null = null
      for (const p of withPrev) {
        const pctChange = ((p.value - p.prevValue!) / p.prevValue!) * 100
        if (Math.abs(pctChange) < 25) continue
        const score = Math.min(Math.abs(pctChange) / 100, 1)
        if (!best || score > best.score) {
          best = {
            found: true,
            score,
            detail: { member: p.member, current: p.value, previous: p.prevValue, pctChange, direction: pctChange > 0 ? 'up' : 'down' },
          }
        }
      }
      return best
    },
  },

  // ── 4. dominance ─────────────────────────────────────────────────────────────
  {
    id: 'dominance',
    label: 'Concentración (Pareto)',
    motorStatus: 'legacy_keep',     // riesgo de concentración Pareto: semántica propia, no generalizable
    prunable: true, // [Z.4 — perf: cuello-1] mide volumen absoluto: los no-Pareto no pueden dominar
    detect(points) {
      if (points.length < 3) return null
      const total = points.reduce((s, p) => s + p.value, 0)
      if (total === 0) return null
      const sorted = [...points].sort((a, b) => b.value - a.value)
      const topN = Math.max(1, Math.ceil(points.length * 0.2))
      const topMembers = sorted.slice(0, topN)
      const topTotal = topMembers.reduce((s, p) => s + p.value, 0)
      const pctShare = (topTotal / total) * 100
      if (pctShare < 60) return null
      return {
        found: true,
        score: Math.min((pctShare - 60) / 40, 1),
        detail: { topMembers: topMembers.map(p => p.member), pctShare, totalMembers: points.length },
      }
    },
  },

  // ── 5. contribution ──────────────────────────────────────────────────────────
  {
    id: 'contribution',
    label: 'Mayor contribuyente al cambio',
    motorStatus: 'motor2_target',   // lógica de contribución alineada con steady_share builder
    needsPrevValue: true,
    detect(points) {
      const withPrev = points.filter(p => p.prevValue != null)
      if (withPrev.length < 2) return null
      const totalChange = withPrev.reduce((s, p) => s + (p.value - p.prevValue!), 0)
      if (Math.abs(totalChange) < 1) return null
      const totalCurrent = withPrev.reduce((s, p) => s + p.value, 0)
      const totalPrev    = withPrev.reduce((s, p) => s + p.prevValue!, 0)
      let best: DetectResult | null = null
      // Fase 5C — FALLO #2 (R52): solo miembros que genuinamente CONTRIBUYEN a la
      // dirección del agregado. Un miembro que crece mientras el grupo cae no
      // "aporta al descenso" — resiste la caída. Se suprime; otra fase podrá
      // emitir insight de "resistencia" por separado.
      const groupSign = Math.sign(totalChange)
      for (const p of withPrev) {
        const memberChange = p.value - p.prevValue!
        if (groupSign !== 0 && Math.sign(memberChange) !== groupSign) continue
        const contributionPct = (memberChange / totalChange) * 100
        const score = Math.min(Math.abs(contributionPct) / 100, 1)
        if (!best || score > best.score) {
          best = {
            found: true,
            score,
            detail: {
              member: p.member,
              contributionPct,
              totalChange,
              memberChange,
              totalCurrent,
              totalPrev,
              memberValue: p.value,
              memberPrevValue: p.prevValue,
            },
          }
        }
      }
      return best
    },
  },

  // ── 6. correlation ───────────────────────────────────────────────────────────
  {
    id: 'correlation',
    label: 'Correlación entre métricas',
    motorStatus: 'motor2_native',   // buildCorrelationBlocks.ts
    needsValue2: true,
    detect(points) {
      const valid = points.filter(p => p.value2 != null)
      if (valid.length < 4) return null
      const xs = valid.map(p => p.value)
      const ys = valid.map(p => p.value2!)
      const r = pearsonR(xs, ys)
      if (Math.abs(r) < 0.7) return null
      return {
        found: true,
        score: Math.abs(r),
        detail: { r, direction: r > 0 ? 'positive' : 'negative', n: valid.length },
      }
    },
  },

  // ── 7. proportion_shift ──────────────────────────────────────────────────────
  {
    id: 'proportion_shift',
    label: 'Cambio de participación',
    motorStatus: 'motor2_native',   // buildSteadyShareBlocks.ts (shiftPP field)
    needsPrevValue: true,
    detect(points) {
      const withPrev = points.filter(p => p.prevValue != null)
      if (withPrev.length < 2) return null
      const totalCurrent = withPrev.reduce((s, p) => s + p.value, 0)
      const totalPrev = withPrev.reduce((s, p) => s + p.prevValue!, 0)
      if (totalCurrent === 0 || totalPrev === 0) return null
      let best: DetectResult | null = null
      for (const p of withPrev) {
        const currentShare = (p.value / totalCurrent) * 100
        const prevShare = (p.prevValue! / totalPrev) * 100
        const shiftPct = currentShare - prevShare
        if (Math.abs(shiftPct) < 5) continue
        const score = Math.min(Math.abs(shiftPct) / 30, 1)
        if (!best || score > best.score) {
          best = {
            found: true,
            score,
            detail: { member: p.member, prevShare, currentShare, shiftPct },
          }
        }
      }
      return best
    },
  },

  // ── 8. meta_gap ──────────────────────────────────────────────────────────────
  {
    id: 'meta_gap',
    label: 'Brecha de meta',
    motorStatus: 'motor2_target',   // buildMetaGapTemporalBlocks cubre el patrón temporal
    detect(points) {
      // value = cumplimiento % (0–100+)
      const atRisk = points.filter(p => p.value > 0 && p.value < 80)
      if (atRisk.length === 0) return null
      const worst = atRisk.reduce((a, b) => a.value < b.value ? a : b)
      return {
        found: true,
        score: Math.min((100 - worst.value) / 70, 1),   // 70-pt gap = score 1.0
        detail: { member: worst.member, cumplimiento: worst.value, gap: 100 - worst.value },
      }
    },
  },

  // ── [Z.7 T1 — A] stock_risk — migra inventarioDesabasto (insightEngine.ts L963) ──────
  {
    id: 'stock_risk',
    label: 'Desabasto proyectado',
    motorStatus: 'motor2_native',   // pase de inventario dedicado en runInsightEngine
    needsInventario: true,
    detect(points, ctx) {
      // points: { member: producto, value: stockActual, extra: { diasCobertura, mesesCobertura, ventaYTD, topVendedor } }
      // Replicar criterio del viejo: umbralVenta = p40 de ventas (L980)
      const umbralVenta = (ctx?.umbralVenta as number) ?? 0
      const items = points.filter(p => {
        const d = p.extra?.diasCobertura as number | undefined
        if (d == null || d < 0 || d >= 14) return false
        if ((p.extra?.ventaYTD as number ?? 0) < umbralVenta) return false
        return true
      }).map(p => ({
        member: p.member,
        stock: p.value,
        diasCobertura: p.extra!.diasCobertura as number,
        ventaYTD: p.extra!.ventaYTD as number,
        topVendedor: (p.extra?.topVendedor as string | null) ?? null,
        severidad: (p.extra!.diasCobertura as number) < 7 ? 'urgente' : 'alerta',
      }))
      if (items.length === 0) return null
      // El viejo ordena por ventaYTD DESC (L1010)
      items.sort((a, b) => b.ventaYTD - a.ventaYTD)
      const urgentes = items.filter(i => i.severidad === 'urgente')
      const alertas  = items.filter(i => i.severidad === 'alerta')
      const impactoTotal = items.reduce((s, r) => s + r.ventaYTD, 0)
      return {
        found: true,
        score: Math.min(items.length / 5, 1),
        detail: {
          items, urgentes, alertas, impactoTotal,
          topProduct: items[0].member,
        },
      }
    },
  },

  // ── [Z.7 T1 — A] stock_excess — migra inventarioSobrestock (insightEngine.ts L2499) ──
  {
    id: 'stock_excess',
    label: 'Sobrestock',
    motorStatus: 'motor2_native',   // pase de inventario dedicado en runInsightEngine
    needsInventario: true,
    detect(points) {
      // points: { member: producto, value: stockActual, extra: { mesesCobertura, ventaYTD } }
      // El viejo usa dias_inventario > 90 (L2513)
      const sobrestock = points.filter(p => {
        const m = p.extra?.mesesCobertura as number | undefined
        return m != null && m > 3
      }).map(p => ({
        member:         p.member,
        stock:          p.value,
        mesesCobertura: p.extra!.mesesCobertura as number,
        ventaYTD:       p.extra!.ventaYTD as number,
      }))
      if (sobrestock.length === 0) return null
      // El viejo ordena por mesesCobertura DESC (L2525)
      sobrestock.sort((a, b) => b.mesesCobertura - a.mesesCobertura)
      const top = sobrestock.slice(0, 5)
      const totalCapital = top.reduce((s, t) => s + t.ventaYTD, 0)
      return {
        found: true,
        score: Math.min(sobrestock.length / 10, 1),
        detail: {
          sobrestock, top, totalCapital,
          topProduct: sobrestock[0].member,
        },
      }
    },
  },

  // ── [Z.7 T1 — A] migration — migra productoSustitucion (insightEngine.ts L2157) ──────
  {
    id: 'migration',
    label: 'Cambio de preferencia',
    motorStatus: 'motor2_native',   // detector de sustitución de producto (Z.7 T1)
    needsPrevValue: true,
    detect(points) {
      // points: { member: producto, value: ytdNet, prevValue: prevNet, extra: { categoria, varAbs } }
      // Replicar heurística del viejo: groupar por categoría, buscar pares (A cae, B sube)
      // con ratio 0.3–3 (L2191-L2192)
      const porCategoria = new Map<string, typeof points>()
      for (const p of points) {
        const cat = (p.extra?.categoria as string) ?? 'Sin categoría'
        if (!porCategoria.has(cat)) porCategoria.set(cat, [])
        porCategoria.get(cat)!.push(p)
      }
      let best: DetectResult | null = null
      for (const [categoria, items] of porCategoria) {
        if (items.length < 2) continue
        const subiendo = items
          .filter(i => (i.value - (i.prevValue ?? 0)) > 0)
          .sort((a, b) => (b.value - (b.prevValue ?? 0)) - (a.value - (a.prevValue ?? 0)))
        const cayendo = items
          .filter(i => (i.value - (i.prevValue ?? 0)) < 0)
          .sort((a, b) => (a.value - (a.prevValue ?? 0)) - (b.value - (b.prevValue ?? 0)))
        if (subiendo.length === 0 || cayendo.length === 0) continue
        const ganador    = subiendo[0]
        const perdedores = cayendo.slice(0, 3)
        const totalCaida = perdedores.reduce((s, p) => s + Math.abs(p.value - (p.prevValue ?? 0)), 0)
        const ganancia   = ganador.value - (ganador.prevValue ?? 0)
        // El viejo usa ratio 0.3–3 (L2191)
        const ratio = totalCaida > 0 ? ganancia / totalCaida : 0
        if (ratio < 0.3 || ratio > 3) continue
        const score = Math.min(ganancia / Math.max(ganador.value, 1), 1)
        if (!best || score > best.score) {
          best = {
            found: true,
            score,
            detail: {
              declining:   perdedores[0].member,
              rising:      ganador.member,
              grupo:       categoria,
              magnitud:    ganancia,
              ganador,
              perdedores,
              totalCaida,
              ratio,
            },
          }
        }
      }
      return best
    },
  },

  // ── [Z.7 T1 — A] co_decline — migra productoCoDeclive (insightEngine.ts L2258) ────────
  {
    id: 'co_decline',
    label: 'Caída simultánea',
    motorStatus: 'motor2_native',   // detector de caída simultánea con clientes compartidos (Z.7 T1)
    needsPrevValue: true,
    detect(points) {
      // points: { member: producto, value: ytdNet, prevValue: prevNet, extra: { clientes: string[] } }
      // Replicar: declive > 10%, overlap > 40%, min 2 miembros (L2272, L2306, L2317)
      type Decliner = { producto: string; varPct: number; impacto: number; clientes: Set<string> }
      const decliners: Decliner[] = []
      for (const p of points) {
        const prev = p.prevValue ?? 0
        if (prev <= 0) continue
        const varPct = ((p.value - prev) / prev) * 100
        if (varPct > -10) continue
        const clientes = new Set<string>((p.extra?.clientes as string[] | undefined) ?? [])
        if (clientes.size === 0) continue
        decliners.push({ producto: p.member, varPct, impacto: prev - p.value, clientes })
      }
      if (decliners.length < 2) return null

      const asignado = new Set<string>()
      type Grupo = { productos: string[]; clientesCompartidos: Set<string>; impactoTotal: number }
      const grupos: Grupo[] = []

      for (let i = 0; i < decliners.length; i++) {
        if (asignado.has(decliners[i].producto)) continue
        const grupo: Grupo = {
          productos: [decliners[i].producto],
          clientesCompartidos: new Set(decliners[i].clientes),
          impactoTotal: decliners[i].impacto,
        }
        asignado.add(decliners[i].producto)
        for (let j = i + 1; j < decliners.length; j++) {
          if (asignado.has(decliners[j].producto)) continue
          let interseccion = 0
          for (const c of decliners[j].clientes) if (grupo.clientesCompartidos.has(c)) interseccion++
          const minClientes = Math.min(grupo.clientesCompartidos.size, decliners[j].clientes.size)
          if (minClientes === 0) continue
          // El viejo usa overlap > 0.4 (L2306)
          if (interseccion / minClientes > 0.4) {
            grupo.productos.push(decliners[j].producto)
            const nuevaInter = new Set<string>()
            for (const c of decliners[j].clientes) if (grupo.clientesCompartidos.has(c)) nuevaInter.add(c)
            grupo.clientesCompartidos = nuevaInter
            grupo.impactoTotal += decliners[j].impacto
            asignado.add(decliners[j].producto)
          }
        }
        // El viejo usa >= 2 (L2317)
        if (grupo.productos.length >= 2) grupos.push(grupo)
      }
      if (grupos.length === 0) return null

      const impactos = grupos.map(g => g.impactoTotal).sort((a, b) => a - b)
      const p75 = impactos[Math.floor(impactos.length * 0.75)] ?? 0
      const best = grupos.sort((a, b) => b.impactoTotal - a.impactoTotal)[0]
      const topClientes = [...best.clientesCompartidos].slice(0, 3)

      return {
        found: true,
        score: Math.min(best.impactoTotal / 50000, 1),
        detail: {
          cluster:      best.productos,
          impactoTotal: best.impactoTotal,
          grupos,
          p75,
          topClientes,
        },
      }
    },
  },

  // ── [PR-L2b.1] product_dead — migra productoMuerto (insightEngine.ts L778 pre-L2b.1) ──
  // Producto con venta actual 0 y venta histórica > 0. Distinto de stock_excess (mide
  // inventario ocioso sin tocar ventas) y de trend (mide pendiente, no ausencia total).
  {
    id: 'product_dead',
    label: 'Producto sin venta',
    motorStatus: 'motor2_native',   // detector de producto muerto (PR-L2b.1)
    needsPrevValue: true,
    detect(points, ctx) {
      // points: { member: producto, value: ytdNet, prevValue: prevNet, extra: { categoria, clientes: string[] } }
      // ctx?: { invMap: Map<producto, stockActual> }
      const invMap = (ctx?.invMap as Map<string, number> | undefined) ?? new Map<string, number>()
      type Dead = { member: string; categoria: string; prevNet: number; clientes: string[]; stock: number }
      const dead: Dead[] = []
      for (const p of points) {
        const current = p.value
        const prev    = p.prevValue ?? 0
        if (current > 0) continue       // aún vende → no muerto
        if (prev <= 0) continue         // tampoco vendía antes → irrelevante
        const categoria = (p.extra?.categoria as string | undefined) ?? 'Sin categoría'
        const clientes  = (p.extra?.clientes  as string[]   | undefined) ?? []
        if (clientes.length === 0) continue  // sin historia de clientes → dato ruidoso
        dead.push({
          member:    p.member,
          categoria,
          prevNet:   prev,
          clientes,
          stock:     invMap.get(p.member) ?? 0,
        })
      }
      if (dead.length === 0) return null

      dead.sort((a, b) => b.prevNet - a.prevNet)
      const totalPrev  = dead.reduce((s, d) => s + d.prevNet, 0)
      const totalStock = dead.reduce((s, d) => s + d.stock, 0)

      // Agrupar por categoría; elegir top para contexto de "sustituto"
      const porCategoria = new Map<string, Dead[]>()
      for (const d of dead) {
        const arr = porCategoria.get(d.categoria) ?? []
        arr.push(d)
        porCategoria.set(d.categoria, arr)
      }
      const topCat = [...porCategoria.entries()].sort(
        (a, b) => b[1].reduce((s, d) => s + d.prevNet, 0) - a[1].reduce((s, d) => s + d.prevNet, 0),
      )[0]
      const topCategoria = topCat[0]
      const topCatSet = new Set(topCat[1].map(d => d.member))

      // Sustituto: producto de la misma categoría top con delta positivo
      let sustituto: { member: string; delta: number } | null = null
      for (const p of points) {
        if (topCatSet.has(p.member)) continue
        if ((p.extra?.categoria as string | undefined) !== topCategoria) continue
        const delta = (p.value ?? 0) - (p.prevValue ?? 0)
        if (delta <= 0) continue
        if (!sustituto || delta > sustituto.delta) sustituto = { member: p.member, delta }
      }

      // Score: normalizado por cantidad de muertos (5 productos = score 1.0)
      const score = Math.min(dead.length / 5, 1)

      return {
        found: true,
        score,
        detail: {
          items:         dead,
          totalPrev,
          totalStock,
          productCount:  dead.length,
          topCategoria,
          sustituto,
          topProduct:    dead[0].member,
        },
      }
    },
  },
]
