// Cross-engine genérico: capa paralela al motor 2 hardcoded.
//
// ARQUITECTURA DE DOS SISTEMAS (decisión deliberada — Z.11.M-4 mini, 2026-04-27):
//
//   Sistema 1 — Motor 2 hardcoded (src/lib/insight-engine.ts):
//     - Iterа INSIGHT_TYPE_REGISTRY (insight-registry.ts) con detect functions
//       inline. 12 tipos: trend, change, dominance, contribution, correlation,
//       proportion_shift, meta_gap, stock_risk, stock_excess, migration,
//       co_decline, product_dead. Plus builders especiales (cliente_dormido,
//       cliente_perdido, change_point, steady_share, meta_gap_temporal,
//       cross_delta) que viven directamente en insight-engine.ts.
//
//   Sistema 2 — Cross-engine genérico (este archivo):
//     - Iterа metric × dimension × type usando registries con metadata rica
//       (./metricRegistry, ./dimensionRegistry, ./insightTypeRegistry).
//       Despacha a DETECTORS map que contiene detectFn por tipo. Hoy emite
//       outlier + seasonality. Plataforma para nuevos tipos genéricos.
//
// Por qué dos sistemas: el hardcoded tiene enriquecimiento de dominio
// (cross_context, narrativa rica, scoring custom) que el genérico no
// puede replicar sin acoplarse a cada tipo. El genérico es ideal para
// detectores estadísticos puros (outlier, seasonality) que NO requieren
// narrativa de dominio.
//
// Dedup: insight-engine.ts:6010 deduplica candidates cross-engine vs
// hardcoded por clave `member|dim|type` antes de mergear al pool.
//
// Reglas:
//   - NO probabilidad, NO IA
//   - Detectores ADITIVOS: no mutar ctx.sales, ctx.quotas, derivados.
//   - Fallo de un detector → loggea y continúa (no rompe pipeline).

import type { SaleRecord, MetaRecord, DataAvailability } from '../../types'
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
// outlier — Z≥2.5, USD-only guard, gate group-*, dedup vs hardcoded.
import { detectOutlier } from '../detectors/outlier'
// seasonality — STRENGTH_THRESHOLD 0.60, cap protection (stock_risk/vendor),
// chainer exclusion. Ver detectors/seasonality.ts header.
import { detectSeasonality } from '../detectors/seasonality'

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
