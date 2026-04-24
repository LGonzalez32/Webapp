// [PR-M10] Correlation Detection — pares de métricas con movimiento inverso
// sostenido para una misma entidad. Correlación de Pearson clásica sobre
// series mensuales paralelas.
//
// Distinto de M7f (outlier multi-métrica): aquí se relacionan DOS métricas
// entre sí en el tiempo; outlier mira una sola métrica vs el grupo.
//
// No probabilidad, no IA. Solo media, stdev poblacional y Pearson r.
// Retorna InsightCandidate[] — ruteo vía EVENT_TYPES_EXEMPT con narrativa directa.

import type { SaleRecord } from '../../types'
import type { InsightCandidate } from '../insight-engine'
import { DIMENSION_REGISTRY, METRIC_REGISTRY } from '../insight-registry'

// ─── Configuración ──────────────────────────────────────────────────────────

type CorrMetric = 'ticket_promedio' | 'frecuencia_compra' | 'unidades' | 'precio_unitario'
type CorrDim    = string

interface CorrPair {
  metricA: CorrMetric
  metricB: CorrMetric
  dims:    CorrDim[]
}

// [PR-FIX.8] dims derivadas dinámicamente del registry — los pares (qué métricas
// correlacionar) son una decisión estadística que sigue siendo explícita.
const _corrDims = DIMENSION_REGISTRY
  .filter(d => d.supports?.includes('correlation'))
  .map(d => d.field)

// [PR-FIX.9] gate por METRIC_REGISTRY: un par sobrevive sólo si AMBAS métricas
// declaran 'correlation' en compatibleInsights. Quitar una métrica del registry
// la desactiva automáticamente sin tocar este archivo.
const _corrRegistrySet = new Set(
  METRIC_REGISTRY
    .filter(m => m.compatibleInsights?.includes('correlation'))
    .map(m => m.id),
)

const CORR_PAIRS: CorrPair[] = ([
  { metricA: 'ticket_promedio', metricB: 'frecuencia_compra', dims: _corrDims },
  { metricA: 'unidades',        metricB: 'precio_unitario',   dims: _corrDims },
] as CorrPair[]).filter(p => _corrRegistrySet.has(p.metricA) && _corrRegistrySet.has(p.metricB))

// [PR-FIX.10] Umbrales relajados para datos reales:
//   CORR_MIN_MONTHS:  6 → 5    (admitir series un mes más cortas)
//   CORR_R_THRESHOLD: -0.65 → -0.50 (correlación moderada ya es informativa)
//   CORR_R_STRONG:    -0.85 → -0.75 (CRITICA proporcional al nuevo umbral)
const CORR_MIN_MONTHS  = 5
const CORR_R_THRESHOLD = -0.50
const CORR_R_STRONG    = -0.75
const CORR_MIN_SHARE   = 0.01

const METRIC_LABELS: Record<CorrMetric, string> = {
  ticket_promedio:   'ticket promedio',
  frecuencia_compra: 'frecuencia de compra',
  unidades:          'unidades',
  precio_unitario:   'precio unitario',
}

// ─── Telemetría ─────────────────────────────────────────────────────────────

interface CorrTelemetry {
  pairs_evaluated:  number
  series_with_data: number
  candidates_found: number
  blocks_returned:  number
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function _toDate(f: unknown): Date {
  return f instanceof Date ? f : new Date(f as string)
}

function _monthKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function _meanPop(vals: number[]): number {
  if (vals.length === 0) return 0
  return vals.reduce((s, v) => s + v, 0) / vals.length
}

function _stdevPop(vals: number[], mean: number): number {
  if (vals.length === 0) return 0
  const sumSq = vals.reduce((s, v) => s + (v - mean) ** 2, 0)
  return Math.sqrt(sumSq / vals.length)
}

function _pearsonR(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length)
  if (n < 2) return null
  const ma = _meanPop(a)
  const mb = _meanPop(b)
  const sa = _stdevPop(a, ma)
  const sb = _stdevPop(b, mb)
  if (sa < 0.001 || sb < 0.001) return null
  let num = 0
  for (let i = 0; i < n; i++) num += (a[i] - ma) * (b[i] - mb)
  const denom = n * sa * sb
  if (denom === 0) return null
  return num / denom
}

function _severityFromR(r: number): 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA' {
  if (r <= CORR_R_STRONG) return 'CRITICA'
  // [PR-FIX.10] ALTA proporcional al nuevo CORR_R_STRONG (-0.75); antes -0.75
  if (r <= -0.65)         return 'ALTA'
  return 'MEDIA'
}

// ─── Agregación por (dim, mes) — produce mapas separados para cada métrica ──

interface BucketMonth { ventas: number; unidades: number; ntx: number }

function _bucketByDimAndMonth(
  sales: SaleRecord[],
  dim: CorrDim,
): Map<string, Map<string, BucketMonth>> {
  const out = new Map<string, Map<string, BucketMonth>>()
  for (const r of sales) {
    const ent = (r as unknown as Record<string, unknown>)[dim] as string | undefined
    if (!ent) continue
    const ym = _monthKey(_toDate(r.fecha))
    let entMap = out.get(ent)
    if (!entMap) { entMap = new Map(); out.set(ent, entMap) }
    const prev = entMap.get(ym) ?? { ventas: 0, unidades: 0, ntx: 0 }
    prev.ventas   += r.venta_neta ?? 0
    prev.unidades += r.unidades   ?? 0
    prev.ntx      += 1
    entMap.set(ym, prev)
  }
  return out
}

function _valueForMetric(bucket: BucketMonth, metric: CorrMetric): number | null {
  if (metric === 'ticket_promedio') {
    return bucket.ntx > 0 ? bucket.ventas / bucket.ntx : null
  }
  if (metric === 'frecuencia_compra') {
    return bucket.ntx > 0 ? bucket.ntx : null
  }
  if (metric === 'unidades') {
    return bucket.unidades > 0 ? bucket.unidades : null
  }
  // precio_unitario
  return bucket.unidades > 0 ? bucket.ventas / bucket.unidades : null
}

// ─── Narrativa ──────────────────────────────────────────────────────────────

function _buildNarrative(
  entity:   string,
  metricA:  CorrMetric,
  metricB:  CorrMetric,
  r:        number,
  n:        number,
): { titulo: string; descripcion: string; conclusion: string; accionTexto: string } {
  const labelA = METRIC_LABELS[metricA]
  const labelB = METRIC_LABELS[metricB]
  const titulo = `${entity} — ${labelA} y ${labelB} se mueven en sentido opuesto`
  const descripcion =
    `Durante ${n} meses, cuando ${labelA} sube, ${labelB} baja (correlación inversa r=${r.toFixed(2)}).`

  let conclusion: string
  let accionTexto: string

  if (
    (metricA === 'ticket_promedio' && metricB === 'frecuencia_compra') ||
    (metricA === 'frecuencia_compra' && metricB === 'ticket_promedio')
  ) {
    conclusion =
      `Sugiere que los clientes compran menos frecuente pero más caro — posible pérdida de ` +
      `clientes de compra recurrente o cambio en el mix hacia tickets altos.`
    accionTexto =
      `Revisar la cartera de clientes de ${entity}: identificar si se están perdiendo clientes ` +
      `de compra frecuente y si los de ticket alto compensan el volumen.`
  } else if (
    (metricA === 'unidades' && metricB === 'precio_unitario') ||
    (metricA === 'precio_unitario' && metricB === 'unidades')
  ) {
    conclusion =
      `Sugiere sensibilidad precio-volumen: cuando el precio unitario sube, el volumen baja — ` +
      `revisar si los aumentos de precio están deprimiendo la demanda.`
    accionTexto =
      `Evaluar la elasticidad precio de ${entity}: probar si una reducción de precio genera ` +
      `suficiente volumen adicional para compensar el margen.`
  } else {
    conclusion =
      `Las dos métricas se mueven en dirección opuesta de forma sostenida — conviene aislar la causa.`
    accionTexto =
      `Revisar el período completo de ${entity}: identificar qué factor está moviendo ambas métricas en sentido contrario.`
  }

  return { titulo, descripcion, conclusion, accionTexto }
}

// ─── Export principal ───────────────────────────────────────────────────────

interface CorrDetected {
  entity:    string
  dim:       CorrDim
  metricA:   CorrMetric
  metricB:   CorrMetric
  r:         number
  n:         number
}

export function buildCorrelationBlocks(
  sales: SaleRecord[],
): { candidates: InsightCandidate[]; telemetry: CorrTelemetry } {
  const telemetry: CorrTelemetry = {
    pairs_evaluated:  0,
    series_with_data: 0,
    candidates_found: 0,
    blocks_returned:  0,
  }
  const candidates: InsightCandidate[] = []
  if (!sales || sales.length === 0) return { candidates, telemetry }

  try {
    // Total global de venta_neta para el filtro CORR_MIN_SHARE.
    let totalVentaGlobal = 0
    for (const r of sales) totalVentaGlobal += r.venta_neta ?? 0

    // Dedup interno: mantener el mejor r (más negativo) por (entity, dim).
    const bestByEntity = new Map<string, CorrDetected>()

    for (const pair of CORR_PAIRS) {
      for (const dim of pair.dims) {
        telemetry.pairs_evaluated++
        const buckets = _bucketByDimAndMonth(sales, dim)

        for (const [entity, entMap] of buckets) {
          // Construir series paralelas A/B usando solo meses válidos en ambas.
          const seriesA: number[] = []
          const seriesB: number[] = []
          let ventasEntidad = 0
          for (const [, bucket] of entMap) {
            ventasEntidad += bucket.ventas
            const vA = _valueForMetric(bucket, pair.metricA)
            const vB = _valueForMetric(bucket, pair.metricB)
            if (vA == null || vB == null) continue
            if (!isFinite(vA) || !isFinite(vB) || vA <= 0 || vB <= 0) continue
            seriesA.push(vA)
            seriesB.push(vB)
          }
          if (seriesA.length < CORR_MIN_MONTHS) continue

          // Filtro share mínimo: la entidad debe representar ≥ 1% del total global.
          if (totalVentaGlobal > 0 && (ventasEntidad / totalVentaGlobal) < CORR_MIN_SHARE) continue

          telemetry.series_with_data++
          const r = _pearsonR(seriesA, seriesB)
          if (r == null) continue
          if (r > CORR_R_THRESHOLD) continue

          const key = `${dim}:${entity}`
          const prev = bestByEntity.get(key)
          if (!prev || r < prev.r) {
            bestByEntity.set(key, {
              entity,
              dim,
              metricA: pair.metricA,
              metricB: pair.metricB,
              r,
              n: seriesA.length,
            })
          }
        }
      }
    }

    telemetry.candidates_found = bestByEntity.size

    for (const cp of bestByEntity.values()) {
      const severity = _severityFromR(cp.r)
      const { titulo, descripcion, conclusion, accionTexto } = _buildNarrative(
        cp.entity, cp.metricA, cp.metricB, cp.r, cp.n,
      )
      candidates.push({
        metricId:      `${cp.metricA}_${cp.metricB}`,
        dimensionId:   cp.dim,
        insightTypeId: 'correlation',
        member:        cp.entity,
        score:         Math.abs(cp.r),
        severity,
        title:         titulo,
        description:   descripcion,
        detail: {
          member:   cp.entity,
          metricA:  cp.metricA,
          metricB:  cp.metricB,
          dim:      cp.dim,
          r:        cp.r,
          n:        cp.n,
          source:   '[PR-M10] correlation',
        },
        conclusion,
        accion: {
          texto:        accionTexto,
          entidades:    [cp.entity],
          respaldo:     `r=${cp.r.toFixed(2)}, n=${cp.n}`,
          ejecutableEn: severity === 'CRITICA' ? 'inmediato' : 'esta_semana',
        },
      })
    }
  } catch {
    // degradación silenciosa (never throws)
  }

  telemetry.blocks_returned = candidates.length
  console.log('[PR-M10] correlation_builder', {
    pairs_evaluated:  telemetry.pairs_evaluated,
    series_with_data: telemetry.series_with_data,
    candidates_found: telemetry.candidates_found,
    blocks_returned:  telemetry.blocks_returned,
  })
  return { candidates, telemetry }
}
