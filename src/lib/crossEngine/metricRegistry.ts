// Registro de métricas — capa del cross-engine genérico (./index.ts).
//
// ARQUITECTURA DE DOS SISTEMAS (Z.11.M-4 mini, 2026-04-27):
// Esta lista NO es la fuente del motor 2 hardcoded. Motor 2 lee de
// `insight-registry.ts:METRIC_REGISTRY` (lista mínima id+label de 12
// métricas). Esta versión enriquecida (con `requires`, `computeFn`,
// `significanceThresholdPct`, `is_monetary_primary`) sirve solo al
// cross-engine para iterar metric × dim × type y filtrar por
// DataAvailability.
//
// Solapamiento intencional con `insight-registry.ts`:
//   - 7 métricas en común (venta_usd↔venta, unidades, ticket_promedio,
//     precio_unitario, num_clientes_activos, frecuencia_compra,
//     cumplimiento_meta).
//   - 5 métricas en insight-registry no presentes acá (num_transacciones,
//     margen_bruto, margen_pct, skus_activos, ventas_por_cliente) —
//     habilitarlas en cross-engine requiere agregar `requires` y `computeFn`.
//
// Reglas:
//   - NO probabilidad, NO IA. Solo agregaciones deterministas.
//   - Toda métrica declara `requires: Array<keyof DataAvailability>`
//     → sólo aparece como "disponible" si TODOS sus flags son true.

import type { SaleRecord, DataAvailability } from '../../types'

export type MetricUnit = 'USD' | 'u' | 'USD/u' | 'clientes' | 'ventas/cliente' | 'pct'

export interface Metric {
  id: string
  label: string
  unit: MetricUnit
  /** Flags de DataAvailability que deben ser true para que la métrica sea elegible. */
  requires: Array<keyof DataAvailability>
  /** % mínimo de cambio para considerar significativo (umbral de detectores). */
  significanceThresholdPct: number
  /** Función pura sobre un slice de ventas. No muta, no efecto colateral. */
  computeFn: (sales: SaleRecord[]) => number
  /** [PR-M4b'''-fix] true solo para la métrica USD VOLUMÉTRICA primaria (venta_usd).
   *  ticket_promedio y precio_unitario también tienen unit='USD' pero son DERIVADAS
   *  (ratios): sumarlas/compararlas entre grupos produce interpretaciones engañosas.
   *  Este flag lo usa el detector outlier para filtrar estrictamente al USD primario. */
  is_monetary_primary?: boolean
}

export const METRIC_REGISTRY: Metric[] = [
  {
    id: 'venta_usd',
    label: 'Venta Neta (USD)',
    unit: 'USD',
    requires: ['has_venta_neta'],
    significanceThresholdPct: 0.10,
    computeFn: sales => sales.reduce((a, s) => a + (s.venta_neta ?? 0), 0),
    is_monetary_primary: true,   // [PR-M4b'''-fix] única USD volumétrica primaria
  },
  {
    id: 'unidades',
    label: 'Unidades',
    unit: 'u',
    requires: ['has_unidades'],
    significanceThresholdPct: 0.10,
    computeFn: sales => sales.reduce((a, s) => a + (s.unidades ?? 0), 0),
  },
  {
    id: 'ticket_promedio',
    label: 'Ticket Promedio',
    unit: 'USD',
    requires: ['has_venta_neta'],
    significanceThresholdPct: 0.15,
    computeFn: sales => {
      if (sales.length === 0) return 0
      const total = sales.reduce((a, s) => a + (s.venta_neta ?? 0), 0)
      return total / sales.length
    },
  },
  {
    id: 'precio_unitario',
    label: 'Precio Unitario',
    unit: 'USD/u',
    requires: ['has_precio_unitario'],
    significanceThresholdPct: 0.05,
    computeFn: sales => {
      const total = sales.reduce((a, s) => a + (s.venta_neta ?? 0), 0)
      const uds   = sales.reduce((a, s) => a + (s.unidades ?? 0), 0)
      return uds > 0 ? total / uds : 0
    },
  },
  {
    id: 'num_clientes_activos',
    label: 'Clientes Activos',
    unit: 'clientes',
    requires: ['has_cliente'],
    significanceThresholdPct: 0.10,
    computeFn: sales => {
      const keys = new Set<string>()
      for (const s of sales) {
        const k = s.clientKey ?? s.cliente ?? null
        if (k) keys.add(k)
      }
      return keys.size
    },
  },
  {
    id: 'frecuencia_compra',
    label: 'Frecuencia de Compra',
    unit: 'ventas/cliente',
    requires: ['has_cliente'],
    significanceThresholdPct: 0.15,
    computeFn: sales => {
      const keys = new Set<string>()
      for (const s of sales) {
        const k = s.clientKey ?? s.cliente ?? null
        if (k) keys.add(k)
      }
      return keys.size > 0 ? sales.length / keys.size : 0
    },
  },
  // [PR-M4a] cumplimiento_meta — métrica derivada (venta_neta / meta × 100).
  // Su computeFn real requiere acceso al contexto con MetaRecord[], que este
  // registry (puro sobre SaleRecord[]) no provee. Placeholder retorna 0; el
  // cross-engine (PR-M4b+) lo reescribe en su contexto con quotas disponibles.
  // Gate: requires has_metas (mapeo 1:1 del legacy has_meta_mensual).
  {
    id: 'cumplimiento_meta',
    label: 'Cumplimiento de Meta',
    unit: 'pct',
    requires: ['has_metas'],
    significanceThresholdPct: 0.15,
    computeFn: _sales => 0,
  },
]

/**
 * Filtra METRIC_REGISTRY por los flags activos en DataAvailability.
 * Una métrica es "disponible" si TODOS sus flags `requires` son `true`.
 */
export function getAvailableMetrics(availability: DataAvailability): Metric[] {
  return METRIC_REGISTRY.filter(m =>
    m.requires.every(flag => availability[flag] === true),
  )
}

/** Lookup directo por id (útil para el toggle global metricaGlobal). */
export function getMetricById(id: string): Metric | undefined {
  return METRIC_REGISTRY.find(m => m.id === id)
}
