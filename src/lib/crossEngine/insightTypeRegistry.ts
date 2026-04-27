// Registro de InsightTypes — capa del cross-engine genérico (./index.ts).
//
// ARQUITECTURA DE DOS SISTEMAS (Z.11.M-4 mini, 2026-04-27):
// Esta lista NO es la fuente del motor 2 hardcoded. Motor 2 lee de
// `insight-registry.ts:INSIGHT_TYPE_REGISTRY` (12 tipos con `detect()`
// inline). Esta versión declarativa (con `applicableMetrics`,
// `applicableDimensions`, `requires`, `status`, `motorStatus`) sirve solo
// al cross-engine para filtrar combos metric × dim × type por
// DataAvailability y dispatchar al `DETECTORS` map.
//
// Solapamiento intencional con `insight-registry.ts`:
//   - 12 tipos en común (todos los implementados con detect functions).
//   - 3 tipos extra acá (cliente_dormido, outlier, seasonality) — los dos
//     últimos son emitidos por el cross-engine (DETECTORS); cliente_dormido
//     viene de un builder especial en insight-engine.ts.
//   - 6 tipos del motor 2 NO listados acá (cliente_perdido, change_point,
//     steady_share, meta_gap_temporal, cross_delta) — emitidos por
//     builders especiales y no participan del cross-engine generic.
//
// Reglas:
//   - NO probabilidad, NO IA — la metadata es declarativa.
//   - status='implemented': motor 2 ya emite, cross-engine ignora (dedup).
//   - status='declared': cross-engine los emite si DETECTORS tiene su detectFn.

import type { DataAvailability } from '../../types'

export type InsightTypeId =
  // ya implementados en motor 2 (status='implemented')
  | 'trend'
  | 'change'
  | 'dominance'
  | 'contribution'
  | 'proportion_shift'
  | 'meta_gap'
  | 'correlation'
  | 'stock_risk'
  | 'stock_excess'
  | 'migration'
  | 'co_decline'
  | 'product_dead'
  | 'cliente_dormido'
  // declarados, detectFn llega en PR-M4 (status='declared')
  | 'outlier'
  | 'seasonality'

export interface InsightType {
  id: InsightTypeId
  label: string
  description: string
  /** Métricas (id del metricRegistry PR-M1) sobre las que aplica. null = todas. */
  applicableMetrics: string[] | null
  /** Dimensiones (id del dimensionRegistry PR-M2) sobre las que aplica. null = todas. */
  applicableDimensions: string[] | null
  /** Flags de DataAvailability requeridos adicionales. */
  requires: Array<keyof DataAvailability>
  /** Umbral base de significancia (interpretación depende del tipo). */
  significanceThreshold: number
  /** Si requiere histórico YoY (≥12 meses). No hay flag DataAvailability.has_yoy aún;
   *  PR-M4 agregará el check derivado del rango de fechas del dataset. */
  requiresYoY: boolean
  /** 'implemented' = motor 2 ya lo emite. 'declared' = detectFn pendiente (PR-M4). */
  status: 'implemented' | 'declared'
}

export const INSIGHT_TYPE_REGISTRY: InsightType[] = [
  // ────────────────────────────────────────────────────────────────────────
  // IMPLEMENTADOS — motor 2 emite hoy (referencia: src/lib/insight-registry.ts
  // + runInsightEngine special passes en src/lib/insight-engine.ts)
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'trend',
    label: 'Tendencia sostenida',
    description: 'Métrica con pendiente sostenida (r²≥0.7) y cambio >10% en los últimos 3 meses',
    applicableMetrics: null,
    applicableDimensions: ['vendedor', 'producto', 'categoria', 'departamento', 'canal'],
    requires: [],
    significanceThreshold: 0.10,
    requiresYoY: false,
    status: 'implemented',
  },
  {
    id: 'change',
    label: 'Cambio significativo',
    description: 'Salto ≥25% entre valor actual y valor previo (YoY MTD)',
    applicableMetrics: ['venta_usd', 'unidades'],
    applicableDimensions: ['producto', 'vendedor', 'categoria', 'departamento', 'canal', 'cliente'],
    requires: [],
    significanceThreshold: 0.25,
    requiresYoY: false,
    status: 'implemented',
  },
  {
    id: 'dominance',
    label: 'Concentración (Pareto)',
    description: 'Top-N elementos (20% del universo) concentran ≥60% del total',
    applicableMetrics: ['venta_usd', 'unidades', 'num_clientes_activos'],
    applicableDimensions: ['cliente', 'producto', 'vendedor'],
    requires: [],
    significanceThreshold: 0.60,
    requiresYoY: false,
    status: 'implemented',
  },
  {
    id: 'contribution',
    label: 'Mayor contribuyente al cambio',
    description: 'Miembro que aporta ≥20% del delta agregado (en la dirección del grupo)',
    applicableMetrics: ['venta_usd', 'unidades'],
    applicableDimensions: ['vendedor', 'producto', 'categoria', 'departamento', 'canal', 'cliente'],
    requires: [],
    significanceThreshold: 0.20,
    requiresYoY: false,
    status: 'implemented',
  },
  {
    id: 'proportion_shift',
    label: 'Cambio de participación',
    description: 'Sub-elemento cambia su % del total en ≥5 puntos vs periodo previo',
    applicableMetrics: ['venta_usd', 'unidades'],
    applicableDimensions: ['producto', 'categoria', 'canal', 'cliente'],
    requires: [],
    significanceThreshold: 0.05,
    requiresYoY: false,
    status: 'implemented',
  },
  {
    id: 'meta_gap',
    label: 'Brecha de meta',
    description: 'Cumplimiento proyectado <80% del target mensual',
    // [PR-M4a] alineado con metricRegistry: meta_gap evalúa contra
    // 'cumplimiento_meta' (métrica derivada, no el volumen bruto)
    applicableMetrics: ['cumplimiento_meta'],
    applicableDimensions: ['vendedor', 'departamento'],
    requires: ['has_metas'],
    significanceThreshold: 0.20,
    requiresYoY: false,
    status: 'implemented',
  },
  {
    id: 'correlation',
    label: 'Correlación entre métricas',
    description: 'Pares de métricas con |r|≥0.7 dentro de una dimensión',
    applicableMetrics: null,
    applicableDimensions: ['vendedor', 'producto', 'cliente'],
    requires: [],
    significanceThreshold: 0.70,
    requiresYoY: false,
    status: 'implemented',
  },
  {
    id: 'stock_risk',
    label: 'Desabasto proyectado',
    description: 'Producto con cobertura <7 días (urgente) o 7-14 días (alerta)',
    applicableMetrics: ['unidades'],
    applicableDimensions: ['producto'],
    requires: ['has_inventario'],
    significanceThreshold: 0,
    requiresYoY: false,
    status: 'implemented',
  },
  {
    id: 'stock_excess',
    label: 'Sobrestock',
    description: 'Producto con >3 meses de cobertura (capital inmovilizado)',
    applicableMetrics: ['unidades'],
    applicableDimensions: ['producto'],
    requires: ['has_inventario'],
    significanceThreshold: 0,
    requiresYoY: false,
    status: 'implemented',
  },
  {
    id: 'migration',
    label: 'Cambio de preferencia',
    description: 'Producto crece mientras otro de la misma categoría cae en volumen similar',
    applicableMetrics: ['venta_usd', 'unidades'],
    applicableDimensions: ['producto'],
    requires: [],
    significanceThreshold: 0,
    requiresYoY: false,
    status: 'implemented',
  },
  {
    id: 'co_decline',
    label: 'Caída simultánea',
    description: 'Productos que comparten base de clientes caen al mismo tiempo (overlap >40%)',
    applicableMetrics: ['venta_usd', 'unidades'],
    applicableDimensions: ['producto'],
    requires: [],
    significanceThreshold: 0,
    requiresYoY: false,
    status: 'implemented',
  },
  {
    id: 'product_dead',
    label: 'Producto sin venta',
    description: 'Producto pasó de tener ventas históricas >0 a venta actual 0 (PR-L2b.1)',
    applicableMetrics: ['venta_usd', 'unidades'],
    applicableDimensions: ['producto'],
    requires: [],
    significanceThreshold: 0,
    requiresYoY: false,
    status: 'implemented',
  },
  {
    id: 'cliente_dormido',
    label: 'Cliente dormido',
    description: 'Cliente sin actividad por N días (umbral configurable)',
    applicableMetrics: null,
    applicableDimensions: ['cliente'],
    requires: ['has_cliente'],
    significanceThreshold: 0,
    requiresYoY: false,
    status: 'implemented',
  },

  // ────────────────────────────────────────────────────────────────────────
  // DECLARADOS — PR-M4 implementará detectFn
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'outlier',
    label: 'Atípico',
    description: 'Elemento alejado del grupo en Z-score ≥2σ (QuickInsights/SpotIQ)',
    applicableMetrics: ['venta_usd', 'unidades', 'ticket_promedio', 'precio_unitario', 'frecuencia_compra'],
    applicableDimensions: ['vendedor', 'producto', 'cliente', 'departamento'],
    requires: [],
    significanceThreshold: 2.0,  // sigmas
    requiresYoY: false,
    status: 'declared',
  },
  {
    id: 'seasonality',
    label: 'Estacionalidad',
    description: 'Patrón cíclico año-sobre-año (requiere ≥12 meses de histórico)',
    applicableMetrics: ['venta_usd', 'unidades'],
    applicableDimensions: ['producto', 'categoria', 'canal', 'mes'],
    requires: [],
    significanceThreshold: 0.20,
    requiresYoY: true,
    status: 'declared',
  },
]

export function getImplementedInsightTypes(): InsightType[] {
  return INSIGHT_TYPE_REGISTRY.filter(t => t.status === 'implemented')
}

export function getDeclaredInsightTypes(): InsightType[] {
  return INSIGHT_TYPE_REGISTRY.filter(t => t.status === 'declared')
}

/**
 * InsightTypes aplicables a un par (metric, dimension) dado los flags actuales.
 * - Filtra por applicableMetrics (null = comodín)
 * - Filtra por applicableDimensions (null = comodín)
 * - Filtra por requires (todos los flags deben ser true)
 * - NO verifica requiresYoY todavía (no hay flag has_yoy; PR-M4 lo deriva del rango de fechas)
 */
export function getApplicableInsightTypes(
  metricId: string,
  dimensionId: string,
  availability: DataAvailability,
): InsightType[] {
  return INSIGHT_TYPE_REGISTRY.filter(t => {
    if (t.applicableMetrics !== null && !t.applicableMetrics.includes(metricId)) return false
    if (t.applicableDimensions !== null && !t.applicableDimensions.includes(dimensionId)) return false
    if (!t.requires.every(flag => availability[flag] === true)) return false
    return true
  })
}

export function getInsightTypeById(id: InsightTypeId): InsightType | null {
  return INSIGHT_TYPE_REGISTRY.find(t => t.id === id) ?? null
}
