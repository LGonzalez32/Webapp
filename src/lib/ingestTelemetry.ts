// [PR-M1-fix] Emisor centralizado de telemetría [PR-M1] ingest_summary.
// Fuente única para ambas rutas de ingesta:
//   - parseSalesFile()  (Excel subido por el usuario)
//   - getDemoData()     (datos de Los Pinos S.A. cargados desde código)
//
// Aditivo: solo DEV. No muta estado. No afecta el pipeline.

import type { SaleRecord, DataAvailability } from '../types'
import { detectDataAvailability } from './fileParser'
import { getAvailableMetrics } from './crossEngine/metricRegistry'
import { getAvailableDimensions } from './crossEngine/dimensionRegistry'
import {
  getImplementedInsightTypes,
  getDeclaredInsightTypes,
  getApplicableInsightTypes,
} from './crossEngine/insightTypeRegistry'

/**
 * Computa flags desde `sales` via detectDataAvailability + resuelve métricas
 * disponibles via getAvailableMetrics, y emite el log [PR-M1] ingest_summary.
 *
 * Se invoca EXACTAMENTE UNA VEZ por carga de datos (Excel o demo).
 */
export function emitIngestSummary(sales: SaleRecord[]): void {
  if (!import.meta.env.DEV) return
  const total = sales.length
  if (total === 0) {
    console.debug('[PR-M1] ingest_summary', {
      filas_total: 0, filas_invalidas: 0,
      filas_con_unidades: 0, filas_con_venta_neta: 0, filas_con_cliente: 0,
      has_unidades: false, has_venta_neta: false, has_cliente: false, has_precio_unitario: false,
      metricas_disponibles: [] as string[],
      dimensiones_disponibles: [] as string[],
      // [PR-FIX.3-F] fields renombrados para explicitar origen (motor 1 vs motor 2).
      insight_types_motor1:                  [] as string[],
      insight_types_motor2_active:           [] as string[],
      insight_types_motor2_total_disponibles: [] as string[],
      cruces_potenciales: 0,
      razon: 'sin_filas',
    })
    return
  }

  const filas_con_unidades   = sales.reduce((n, s) => n + (s.unidades > 0 ? 1 : 0), 0)
  const filas_con_venta_neta = sales.reduce((n, s) => n + (s.venta_neta != null && s.venta_neta > 0 ? 1 : 0), 0)
  const filas_con_cliente    = sales.reduce((n, s) => {
    const k = s.clientKey ?? s.cliente ?? null
    return n + (k ? 1 : 0)
  }, 0)
  const filas_invalidas = sales.reduce((n, s) =>
    n + (s.unidades == null || Number.isNaN(s.unidades) || s.unidades < 0 ? 1 : 0), 0)

  // detectDataAvailability devuelve Omit<DataAvailability, 'has_metas'|'has_inventario'>.
  // Completamos con false para cumplir el tipo; los consumidores de métricas no dependen de esos dos flags.
  const partial = detectDataAvailability(sales)
  const availability: DataAvailability = {
    ...partial,
    has_metas: false,
    has_inventario: false,
  }

  const metricsDisp       = getAvailableMetrics(availability)
  const dimsDisp          = getAvailableDimensions(availability)
  const metricas_disponibles    = metricsDisp.map(m => m.id)
  // [PR-M2] dimensiones disponibles según availability flags
  const dimensiones_disponibles = dimsDisp.map(d => d.id)

  // [PR-M3] insight types y cruces potenciales
  // [PR-FIX.3-F] clarificar origen: implementados = motor 1 hardcoded,
  // declarados = motor 2 active. Se exponen ambos más el total de motor 2.
  const insight_types_motor1                   = getImplementedInsightTypes().map(t => t.id)
  const insight_types_motor2_active            = getDeclaredInsightTypes().map(t => t.id)
  const insight_types_motor2_total_disponibles = [
    ...insight_types_motor2_active,
    // Declarativos del catálogo Power BI no materializados en el motor 2 activo.
    // Si más adelante se promueven a `status:'declared'`, entrarán automáticamente
    // vía getDeclaredInsightTypes y este literal puede quedar como duplicado benigno.
    'trend', 'change', 'dominance', 'contribution', 'correlation',
  ].filter((v, i, a) => a.indexOf(v) === i)
  // cruces_potenciales: suma de |T aplicables| sobre todos los pares (metric × dim) disponibles
  let cruces_potenciales = 0
  for (const m of metricsDisp) {
    for (const d of dimsDisp) {
      cruces_potenciales += getApplicableInsightTypes(m.id, d.id, availability).length
    }
  }

  console.debug('[PR-M1] ingest_summary', {
    filas_total:          total,
    filas_invalidas,
    filas_con_unidades,
    filas_con_venta_neta,
    filas_con_cliente,
    has_unidades:         availability.has_unidades ?? false,
    has_venta_neta:       availability.has_venta_neta,
    has_cliente:          availability.has_cliente,
    has_precio_unitario:  availability.has_precio_unitario ?? false,
    metricas_disponibles,
    dimensiones_disponibles,
    // [PR-FIX.3-F] campos renombrados — ver comentario arriba.
    insight_types_motor1,
    insight_types_motor2_active,
    insight_types_motor2_total_disponibles,
    cruces_potenciales,
    razon:                null,
  })
}
