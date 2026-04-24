// [PR-M4a] Cross-engine genérico: itera Metric × Dimension × InsightType
// y ejecuta los detectFn registrados en DETECTORS para tipos con
// status='declared'. Los 13 tipos 'implemented' siguen viviendo en el motor 2
// hardcoded (insight-engine.ts) y se IGNORAN aquí.
//
// Estado: SKELETON. DETECTORS está vacío → runCrossEngine() retorna
// candidates=[] en todos los datasets. PR-M4b agrega outlier; PR-M4c agrega
// seasonality. La plomería está en su lugar para que esos PRs solo necesiten
// añadir una función al map.
//
// Reglas heredadas:
//   - NO probabilidad, NO IA
//   - Detectores deben ser ADITIVOS: no mutar ctx.sales, ctx.quotas, ni
//     estructuras derivadas del caller
//   - Fallo de un detector → se loggea y se continúa (no rompe pipeline)

import type { SaleRecord, MetaRecord, DataAvailability } from '../types'
import {
  getAvailableMetrics,
  type Metric,
} from './metricRegistry'
import {
  getAvailableDimensions,
  type Dimension,
} from './dimensionRegistry'
import {
  getApplicableInsightTypes,
  type InsightType,
  type InsightTypeId,
} from './insightTypeRegistry'
// [PR-M4b'] outlier re-habilitado sobre infra M4d (USD-only guard,
// Z≥2.5, gate group-*, dedup vs hardcoded). Ver docs/PR-M4b-audit.md.
import { detectOutlier } from './detectors/outlier'
// [PR-M4c'] seasonality re-habilitado sobre 3 correcciones estructurales:
//   A) Cap protection en runInsightEngine (stock_risk/group-vendor protegidos)
//   B) Chainer exclusion en sonInsightsRelacionables
//   C) STRENGTH_THRESHOLD 0.20 → 0.60 (más exigente)
// Ver detectors/seasonality.ts header para historial del revert.
import { detectSeasonality } from './detectors/seasonality'

// InsightCandidate shape (fuente: src/lib/insight-engine.ts).
// Replicamos los campos obligatorios aquí para evitar import circular.
// Los detectores emiten este shape; runInsightEngine hace push directo a su
// allCandidates: InsightCandidate[].
export interface CrossEngineCandidate {
  metricId:      string
  dimensionId:   string
  insightTypeId: string
  member:        string
  score:         number
  severity:      'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA'
  title:         string
  description:   string
  detail:        Record<string, unknown>
  conclusion?:   string
  accion?:       { texto: string; entidades: string[]; respaldo: string; ejecutableEn: string }
}

export interface CrossEngineContext {
  /** Todas las ventas del dataset, sin filtro de periodo. */
  sales:         SaleRecord[]
  /** Ventas del periodo actual (pre-filtradas por runInsightEngine). */
  currentSales:  SaleRecord[]
  /** Ventas del YoY equivalente al periodo actual. */
  prevSales:     SaleRecord[]
  /** Metas (si has_metas=true). */
  quotas:        MetaRecord[]
  /** Flags de disponibilidad (source of truth para gating). */
  availability:  DataAvailability
  /** Periodo evaluado. */
  period:        { year: number; month: number }
  /** Tipo de meta activo (uds/usd) — afecta cómo interpreta venta_neta vs unidades. */
  tipoMetaActivo: 'uds' | 'usd'
}

export type CrossDetectFn = (
  metric:    Metric,
  dimension: Dimension,
  type:      InsightType,
  ctx:       CrossEngineContext,
) => CrossEngineCandidate[]

/**
 * Registro de detectores por InsightTypeId. Sólo se ejecutan tipos con
 * status='declared' — los 'implemented' siguen en el motor hardcoded.
 *
 * [PR-M4a] vacío. [PR-M4b → revertido] outlier desconectado por canibalización.
 * [PR-M4d] infra defensiva implementada (4 gates activos). [PR-M4b'] outlier re-wired.
 * Ver docs/PR-M4b-audit.md.
 *
 * Para que un tipo corra, debe además tener status='declared' en el registry.
 * Los 13 tipos 'implemented' se IGNORAN aquí aunque tengan entry en DETECTORS.
 */
const DETECTORS: Partial<Record<InsightTypeId, CrossDetectFn>> = {
  outlier:     detectOutlier,
  seasonality: detectSeasonality,   // [PR-M4c'] re-wired con 3 fixes estructurales
}

export interface CrossTelemetry {
  metricas_usadas:             number
  dimensiones_usadas:          number
  tipos_ejecutados:            string[]          // detectores realmente invocados
  candidates_por_tipo:         Record<string, number>
  candidates_total:            number
  deduplicados_vs_hardcoded:   number            // siempre 0 en M4a; M4d activa la dedup
  errores:                     Array<{ type: string; error: string }>
  tiempo_ms:                   number
}

/**
 * Ejecuta el cross-engine: metrics × dimensions × (declared types) → candidates.
 * Garantías:
 *   - Con DETECTORS={} retorna candidates=[] y telemetry con candidates_total=0
 *   - Errores de detectores individuales NO propagan (se capturan y loggean)
 *   - No muta ctx
 */
export function runCrossEngine(ctx: CrossEngineContext): {
  candidates: CrossEngineCandidate[]
  telemetry:  CrossTelemetry
} {
  const t0 = performance.now()
  const availableMetrics    = getAvailableMetrics(ctx.availability)
  const availableDimensions = getAvailableDimensions(ctx.availability)
  const candidates: CrossEngineCandidate[] = []
  const candidates_por_tipo: Record<string, number> = {}
  const tipos_ejecutados_set = new Set<string>()
  const errores: Array<{ type: string; error: string }> = []

  for (const metric of availableMetrics) {
    for (const dim of availableDimensions) {
      const types = getApplicableInsightTypes(metric.id, dim.id, ctx.availability)
        .filter(t => t.status === 'declared')
      for (const type of types) {
        const detectFn = DETECTORS[type.id]
        if (!detectFn) continue   // tipo declared sin implementación todavía
        tipos_ejecutados_set.add(type.id)
        try {
          const found = detectFn(metric, dim, type, ctx)
          candidates.push(...found)
          candidates_por_tipo[type.id] = (candidates_por_tipo[type.id] ?? 0) + found.length
        } catch (e) {
          errores.push({ type: type.id, error: e instanceof Error ? e.message : String(e) })
        }
      }
    }
  }

  const telemetry: CrossTelemetry = {
    metricas_usadas:           availableMetrics.length,
    dimensiones_usadas:        availableDimensions.length,
    tipos_ejecutados:          [...tipos_ejecutados_set],
    candidates_por_tipo,
    candidates_total:          candidates.length,
    deduplicados_vs_hardcoded: 0,   // PR-M4d activará el conteo real
    errores,
    tiempo_ms:                 Math.round(performance.now() - t0),
  }

  return { candidates, telemetry }
}
