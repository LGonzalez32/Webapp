// [PR-M7d] Builder aditivo: outliers de num_transacciones por entidad.
//
// Primer builder verdaderamente Metric × Dimension × InsightType del motor 2.
// Detecta entidades (cliente, vendedor) cuya frecuencia de transacciones del
// período actual está estadísticamente lejos del grupo (|z| ≥ Z_SCORE_THRESHOLD).
//
// No probabilidad, no IA: media + stdev muestral + z-score clásico.
//
// Non-monetary: emite candidatos con score derivado de |z| pero impactoUSD no
// se computa aquí — el candidate se rutea vía EVENT_TYPES_EXEMPT y hereda
// non_monetary=true del metricId 'num_transacciones' ∈ NON_MONETARY_METRIC_IDS.
// NO aporta a totalImpact.

import type { SaleRecord } from '../../types'
import type { InsightCandidate } from '../insight-engine'
import { DIMENSION_REGISTRY, METRIC_REGISTRY } from '../insight-registry'

export const TRANSACTION_OUTLIER_MIN_TRANSACTIONS = 5
export const TRANSACTION_OUTLIER_MIN_POPULATION   = 4
export const TRANSACTION_OUTLIER_Z_THRESHOLD      = 2.0
export const TRANSACTION_OUTLIER_Z_CRITICAL       = 3.0

// [PR-FIX.8] derivados dinámicamente del registry. Métricas con
// compatibleInsights=['outlier']; dims que soportan 'outlier'.
export const M7F_METRICS: string[] = METRIC_REGISTRY
  .filter(m => m.compatibleInsights?.includes('outlier'))
  .map(m => m.id)
export type M7fMetric = string
export type M7fDim    = string

export const M7F_DIM_CONFIG: Record<string, string[]> = Object.fromEntries(
  M7F_METRICS.map(metricId => [
    metricId,
    DIMENSION_REGISTRY
      .filter(d => d.supports?.includes('outlier'))
      .map(d => d.field),
  ]),
)
export const M7F_MIN_OBSERVATIONS = 3
export const M7F_MIN_POPULATION   = 4
export const M7F_Z_THRESHOLD      = 2
export const M7F_Z_CRITICAL       = 3

export interface M7fTelemetryEntry {
  metric:     M7fMetric
  dimension:  M7fDim
  population: number
  mean:       number
  stdev:      number
  candidates: number
}

export interface M7fTelemetry {
  metrics_evaluated: M7fTelemetryEntry[]
  total_candidates:  number
  sample_outliers:   Array<{
    entity:  string
    metric:  M7fMetric
    dim:     M7fDim
    zScore:  number
    value:   number
  }>
}

export interface TransactionOutlierBuilderContext {
  currentSales:   SaleRecord[]
  selectedPeriod: { year: number; month: number }
}

export interface TransactionOutlierTelemetry {
  candidates_cliente:  number
  candidates_vendedor: number
  total_candidates:    number
  mean_cliente:        number
  stdev_cliente:       number
  mean_vendedor:       number
  stdev_vendedor:      number
  population_cliente:  number
  population_vendedor: number
  sample_outliers: Array<{ entity: string; dim: 'cliente' | 'vendedor'; zScore: number; value: number }>
  /** [PR-M7f] extensión multi-métrica — ausente si no corrió. */
  m7f?: M7fTelemetry
}

function _countByField(sales: SaleRecord[], field: 'cliente' | 'vendedor'): Map<string, number> {
  const map = new Map<string, number>()
  for (const r of sales) {
    const key = (r as unknown as Record<string, unknown>)[field] as string | undefined
    if (!key) continue
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return map
}

function _meanStdev(values: number[]): { mean: number; stdev: number } {
  if (values.length === 0) return { mean: 0, stdev: 0 }
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  if (values.length < 2) return { mean, stdev: 0 }
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1)
  return { mean, stdev: Math.sqrt(variance) }
}

function _scoreToSeverity(absZ: number): 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA' {
  if (absZ >= TRANSACTION_OUTLIER_Z_CRITICAL) return 'CRITICA'
  if (absZ >= TRANSACTION_OUTLIER_Z_THRESHOLD) return 'ALTA'
  return 'MEDIA'
}

function _buildNarrative(
  sujeto: string,
  valor: number,
  mean: number,
  absZ: number,
  zSign: 'up' | 'down',
): { titulo: string; descripcion: string; conclusion: string; accionTexto: string } {
  const arrow = zSign === 'up' ? '↑' : '↓'
  const titulo = `${arrow} ${sujeto} — frecuencia ${zSign === 'up' ? 'alta' : 'baja'} de transacciones`
  // NOTA: la narrativa se consume directamente por EVENT_TYPES_EXEMPT (c.description,
  // c.conclusion, c.accion), no pasa por el validador V7 de buildContextUniversal,
  // así que usar "por encima/debajo del promedio del grupo" es seguro.
  const diff = valor - mean
  if (zSign === 'up') {
    return {
      titulo,
      descripcion: `${sujeto} registró ${valor} transacciones este mes, ${absZ.toFixed(1)}σ por encima del promedio del grupo (${mean.toFixed(0)}).`,
      conclusion:  `Esta frecuencia inusual indica comportamiento excepcional — puede señalar una cuenta en expansión o una oportunidad comercial que conviene replicar.`,
      accionTexto: `Revisar qué está impulsando el volumen de ${sujeto} — identificar si es replicable en otras cuentas del mismo perfil.`,
    }
  }
  return {
    titulo,
    descripcion: `${sujeto} registró ${valor} transacciones este mes, ${absZ.toFixed(1)}σ por debajo del promedio del grupo (${mean.toFixed(0)}) (${diff > 0 ? '+' : ''}${diff.toFixed(0)}).`.replace(/ \(\+?0\)\.$/, '.'),
    conclusion:  `Esta caída de frecuencia respecto al grupo puede señalar riesgo de desvinculación o un cambio en patrón de compra que conviene investigar.`,
    accionTexto: `Contactar a ${sujeto} para entender por qué bajó la frecuencia — confirmar si es estacional o requiere atención comercial.`,
  }
}

interface DimStats {
  mean:       number
  stdev:      number
  population: number
  candidates: number
}

function _processDimension(
  counts: Map<string, number>,
  dimensionId: 'cliente' | 'vendedor',
  candidates: InsightCandidate[],
  telemetry: TransactionOutlierTelemetry,
): DimStats {
  const valid = [...counts.entries()].filter(([, v]) => v >= TRANSACTION_OUTLIER_MIN_TRANSACTIONS)
  const values = valid.map(([, v]) => v)
  const population = valid.length
  if (population < TRANSACTION_OUTLIER_MIN_POPULATION) {
    return { mean: 0, stdev: 0, population, candidates: 0 }
  }
  const { mean, stdev } = _meanStdev(values)
  if (stdev < 1.0) return { mean, stdev, population, candidates: 0 }

  let emitted = 0
  for (const [entity, value] of valid) {
    const z = (value - mean) / stdev
    const absZ = Math.abs(z)
    if (absZ < TRANSACTION_OUTLIER_Z_THRESHOLD) continue
    const zSign: 'up' | 'down' = z >= 0 ? 'up' : 'down'
    const severity = _scoreToSeverity(absZ)
    const { titulo, descripcion, conclusion, accionTexto } = _buildNarrative(entity, value, mean, absZ, zSign)
    // score normalizado a [0,1] vía z/4 (z=4 → score=1). Consistente con
    // scoreToSeverity de runInsightEngine (>0.8 CRITICA). Cap en 1.
    const score = Math.min(1, absZ / 4)
    candidates.push({
      metricId:      'num_transacciones',
      dimensionId,
      insightTypeId: 'outlier',
      member:        entity,
      score,
      severity,
      title:         titulo,
      description:   descripcion,
      detail: {
        member: entity,
        value,
        mean,
        stdev,
        zScore:       z,
        absZ,
        zSign,
        population,
      },
      conclusion,
      accion: {
        texto:         accionTexto,
        entidades:     [entity],
        respaldo:      `z=${z.toFixed(2)}, n=${population}`,
        ejecutableEn:  severity === 'CRITICA' ? 'inmediato' : 'esta_semana',
      },
    })
    emitted++
    if (telemetry.sample_outliers.length < 3) {
      telemetry.sample_outliers.push({ entity, dim: dimensionId, zScore: Math.round(z * 1000) / 1000, value })
    }
  }
  return { mean, stdev, population, candidates: emitted }
}

// [PR-M7f] Agrega los valores de una métrica por entidad (cliente | vendedor).
// Retorna { value, n } donde n es el # de registros subyacentes (≥ MIN_OBSERVATIONS).
function _aggregateMetricByField(
  sales: SaleRecord[],
  field: M7fDim,
  metric: M7fMetric,
): Map<string, { value: number; n: number }> {
  const groups = new Map<string, SaleRecord[]>()
  for (const r of sales) {
    const key = (r as unknown as Record<string, unknown>)[field] as string | undefined
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(r)
  }
  const out = new Map<string, { value: number; n: number }>()
  for (const [entity, records] of groups) {
    if (records.length < M7F_MIN_OBSERVATIONS) continue
    let value: number | null = null
    if (metric === 'ticket_promedio') {
      const totalVenta = records.reduce((s, r) => s + (r.venta_neta ?? 0), 0)
      value = records.length > 0 ? totalVenta / records.length : null
    } else if (metric === 'frecuencia_compra') {
      //  - vendedor → # transacciones / # clientes únicos atendidos
      //  - cliente  → # fechas distintas de compra en el período
      if (field === 'vendedor') {
        const clientesUnicos = new Set(
          records.map(r => (r as unknown as { cliente?: string }).cliente).filter(Boolean),
        ).size
        value = clientesUnicos > 0 ? records.length / clientesUnicos : null
      } else {
        const fechasUnicas = new Set(
          records.map(r => {
            const d = r.fecha instanceof Date ? r.fecha : new Date(r.fecha as string)
            return d.toISOString().slice(0, 10)
          }),
        ).size
        value = fechasUnicas
      }
    } else if (metric === 'ventas_por_cliente') {
      // [PR-M7h] Σventa_neta del vendedor / nº clientes únicos atendidos
      const totalVenta = records.reduce((s, r) => s + (r.venta_neta ?? 0), 0)
      const clientesUnicos = new Set(
        records.map(r => (r as unknown as { cliente?: string }).cliente)
          .filter((c): c is string => typeof c === 'string' && c.length > 0),
      ).size
      value = clientesUnicos > 0 ? totalVenta / clientesUnicos : null
    } else if (metric === 'precio_unitario') {
      // [PR-M7h] Σventa_neta / Σunidades del producto
      const totalVenta    = records.reduce((s, r) => s + (r.venta_neta ?? 0), 0)
      const totalUnidades = records.reduce((s, r) => s + (r.unidades ?? 0), 0)
      value = totalUnidades > 0 ? totalVenta / totalUnidades : null
    }
    if (value != null && isFinite(value) && value > 0) {
      out.set(entity, { value, n: records.length })
    }
  }
  return out
}

// [PR-M7f] Narrativa específica por métrica. Encaja en c.title/description/
// conclusion/accion para ruteo EVENT_TYPES_EXEMPT.
function _buildNarrativeByMetric(
  sujeto:      string,
  metric:      M7fMetric,
  dimensionId: M7fDim,
  valor:       number,
  mean:        number,
  absZ:        number,
  zSign:       'up' | 'down',
): { titulo: string; descripcion: string; conclusion: string; accionTexto: string } {
  const arrow = zSign === 'up' ? '↑' : '↓'
  const fmt = (v: number) => v >= 100 ? v.toFixed(0) : v.toFixed(2)

  if (metric === 'ticket_promedio') {
    const titulo = `${arrow} ${sujeto} — ticket promedio ${zSign === 'up' ? 'alto' : 'bajo'}`
    return {
      titulo,
      descripcion: `${sujeto} tiene ticket promedio de $${fmt(valor)}, ${absZ.toFixed(1)}σ ${zSign === 'up' ? 'por encima' : 'por debajo'} del promedio del grupo ($${fmt(mean)}).`,
      conclusion:  zSign === 'up'
        ? `Un ticket promedio elevado puede indicar foco en productos premium, clientes de mayor volumen o una oportunidad de replicar el patrón.`
        : `Un ticket promedio bajo puede indicar mezcla desbalanceada, descuentos excesivos o limitaciones en la oferta disponible.`,
      accionTexto: zSign === 'up'
        ? `Revisar con ${sujeto} qué está impulsando el ticket — identificar si es replicable en ${dimensionId === 'vendedor' ? 'otros vendedores' : 'otras cuentas'}.`
        : `Revisar con ${sujeto} el mix de productos y la política de precios — entender si hay fuga de margen.`,
    }
  }

  if (metric === 'frecuencia_compra') {
    const titulo = `${arrow} ${sujeto} — frecuencia de compra ${zSign === 'up' ? 'alta' : 'baja'}`
    return {
      titulo,
      descripcion: `${sujeto} tiene una frecuencia de compra de ${fmt(valor)}, ${absZ.toFixed(1)}σ ${zSign === 'up' ? 'por encima' : 'por debajo'} del promedio del grupo (${fmt(mean)}).`,
      conclusion:  zSign === 'up'
        ? `Una frecuencia alta indica actividad intensa — aprovechar para afianzar relación y entender qué motiva la recurrencia.`
        : `Una frecuencia baja puede señalar desvinculación progresiva o un cambio en el ciclo de compra que conviene investigar.`,
      accionTexto: zSign === 'up'
        ? `Documentar qué impulsa la recurrencia de ${sujeto} para replicar el patrón.`
        : `Contactar a ${sujeto} para entender la caída de frecuencia — confirmar si es estacional o requiere atención comercial.`,
    }
  }

  // [PR-M7h] ventas_por_cliente — solo dim=vendedor
  if (metric === 'ventas_por_cliente') {
    const titulo = `${arrow} ${sujeto} — ventas por cliente ${zSign === 'up' ? 'altas' : 'bajas'}`
    const fmt2 = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`
    return {
      titulo,
      descripcion: `${sujeto} genera ${fmt2(valor)} por cliente activo, ${absZ.toFixed(1)}σ ${zSign === 'up' ? 'por encima' : 'por debajo'} del promedio del equipo (${fmt2(mean)}).`,
      conclusion:  zSign === 'up'
        ? `Una proporción alta indica alta productividad por cuenta — puede indicar pocos clientes muy rentables o un patrón de upsell exitoso.`
        : `Una proporción baja puede indicar cartera diluida, clientes de bajo valor o bajo aprovechamiento de cada cuenta.`,
      accionTexto: zSign === 'up'
        ? `Documentar qué hace ${sujeto} con sus cuentas clave — identificar si el patrón es replicable en el equipo.`
        : `Revisar con ${sujeto} la composición de su cartera — evaluar si concentrar esfuerzo en cuentas de mayor potencial.`,
    }
  }

  // [PR-M7h] precio_unitario — solo dim=producto
  // metric === 'precio_unitario'
  const titulo = `${arrow} ${sujeto} — precio unitario ${zSign === 'up' ? 'alto' : 'bajo'}`
  const fmtP = (v: number) => `$${v.toFixed(2)}`
  return {
    titulo,
    descripcion: `${sujeto} tiene precio unitario de ${fmtP(valor)}, ${absZ.toFixed(1)}σ ${zSign === 'up' ? 'por encima' : 'por debajo'} del promedio del grupo (${fmtP(mean)}).`,
    conclusion:  zSign === 'up'
      ? `Un precio unitario alto puede reflejar posicionamiento premium o baja presión competitiva — vigilar si es sostenible.`
      : `Un precio unitario bajo puede señalar descuentos sistemáticos, presión de precio o mezcla desfavorable de presentaciones.`,
    accionTexto: zSign === 'up'
      ? `Verificar que el precio de ${sujeto} responde a su posicionamiento real y no a un error de captura.`
      : `Revisar la política de precios de ${sujeto} — confirmar si los descuentos tienen justificación comercial.`,
  }
}

/**
 * [PR-M7d] Ejecuta el builder y devuelve candidatos outlier + telemetría.
 * Función pura: no muta ctx, solo lee ctx.currentSales.
 */
export function buildTransactionOutlierBlocks(
  ctx: TransactionOutlierBuilderContext,
): { candidates: InsightCandidate[]; telemetry: TransactionOutlierTelemetry } {
  const telemetry: TransactionOutlierTelemetry = {
    candidates_cliente:  0,
    candidates_vendedor: 0,
    total_candidates:    0,
    mean_cliente:        0,
    stdev_cliente:       0,
    mean_vendedor:       0,
    stdev_vendedor:      0,
    population_cliente:  0,
    population_vendedor: 0,
    sample_outliers:     [],
  }
  const candidates: InsightCandidate[] = []
  if (!ctx.currentSales || ctx.currentSales.length === 0) return { candidates, telemetry }

  const clientCounts  = _countByField(ctx.currentSales, 'cliente')
  const vendorCounts  = _countByField(ctx.currentSales, 'vendedor')

  const cli = _processDimension(clientCounts, 'cliente',  candidates, telemetry)
  const ven = _processDimension(vendorCounts, 'vendedor', candidates, telemetry)

  telemetry.mean_cliente        = Math.round(cli.mean  * 100) / 100
  telemetry.stdev_cliente       = Math.round(cli.stdev * 100) / 100
  telemetry.population_cliente  = cli.population
  telemetry.candidates_cliente  = cli.candidates
  telemetry.mean_vendedor       = Math.round(ven.mean  * 100) / 100
  telemetry.stdev_vendedor      = Math.round(ven.stdev * 100) / 100
  telemetry.population_vendedor = ven.population
  telemetry.candidates_vendedor = ven.candidates
  telemetry.total_candidates    = cli.candidates + ven.candidates

  // [PR-M7f] Extensión multi-métrica: ticket_promedio y frecuencia_compra
  // por cliente y vendedor. No afecta contadores M7d (frecuencia tx). Los
  // candidatos emitidos tienen metricId propio → dedup por key no colisiona.
  const m7f: M7fTelemetry = {
    metrics_evaluated: [],
    total_candidates:  0,
    sample_outliers:   [],
  }
  for (const metric of M7F_METRICS) {
    const dims = M7F_DIM_CONFIG[metric]
    for (const dim of dims) {
      const aggregated = _aggregateMetricByField(ctx.currentSales, dim, metric)
      const values = [...aggregated.values()].map(v => v.value)
      const population = values.length
      if (population < M7F_MIN_POPULATION) {
        m7f.metrics_evaluated.push({ metric, dimension: dim, population, mean: 0, stdev: 0, candidates: 0 })
        continue
      }
      const { mean, stdev } = _meanStdev(values)
      if (stdev < 1e-6) {
        m7f.metrics_evaluated.push({
          metric, dimension: dim, population,
          mean:  Math.round(mean  * 100) / 100,
          stdev: Math.round(stdev * 100) / 100,
          candidates: 0,
        })
        continue
      }
      let emitted = 0
      for (const [entity, { value }] of aggregated) {
        const z    = (value - mean) / stdev
        const absZ = Math.abs(z)
        if (absZ < M7F_Z_THRESHOLD) continue
        const zSign: 'up' | 'down' = z >= 0 ? 'up' : 'down'
        const severity = absZ >= M7F_Z_CRITICAL ? 'CRITICA'
          : absZ >= M7F_Z_THRESHOLD ? 'ALTA'
          : 'MEDIA'
        const narr = _buildNarrativeByMetric(entity, metric, dim, value, mean, absZ, zSign)
        const score = Math.min(1, absZ / 4)
        candidates.push({
          metricId:      metric,
          dimensionId:   dim,
          insightTypeId: 'outlier',
          member:        entity,
          score,
          severity,
          title:         narr.titulo,
          description:   narr.descripcion,
          detail: {
            member:     entity,
            metric,
            value,
            mean,
            stdev,
            zScore:     z,
            absZ,
            zSign,
            population,
            source:     '[PR-M7f] multi_metric_outlier',
          },
          conclusion:    narr.conclusion,
          accion: {
            texto:        narr.accionTexto,
            entidades:    [entity],
            respaldo:     `z=${z.toFixed(2)}, n=${population}`,
            ejecutableEn: severity === 'CRITICA' ? 'inmediato' : 'esta_semana',
          },
        })
        emitted++
        if (m7f.sample_outliers.length < 5) {
          m7f.sample_outliers.push({
            entity,
            metric,
            dim,
            zScore: Math.round(z * 1000) / 1000,
            value:  Math.round(value * 100) / 100,
          })
        }
      }
      m7f.metrics_evaluated.push({
        metric, dimension: dim, population,
        mean:       Math.round(mean  * 100) / 100,
        stdev:      Math.round(stdev * 100) / 100,
        candidates: emitted,
      })
      m7f.total_candidates += emitted
    }
  }
  telemetry.m7f = m7f

  return { candidates, telemetry }
}
