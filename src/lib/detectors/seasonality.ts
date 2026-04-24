/**
 * Detector seasonality — IMPLEMENTADO pero NO WIRED-UP (revertido en PR-M4c).
 *
 * Estado: PR-M4c introdujo regresión crítica en runtime:
 *   - totalImpact $75,127 → $50,573 (−$24,554)
 *   - ie-producto-stock_risk-* ($24,554 recuperable) desplazado del ranking
 *   - Motor 2 tiene cap de blocks; 3 seasonality candidates empujaron los
 *     hardcoded con mayor impact fuera del top-10
 *   - Seasonality participó del chainer → chains total: 1 → 5 (depth≥2: 0 → 1)
 *   - STRENGTH_THRESHOLD=0.20 demasiado permisivo: demo Los Pinos tiene
 *     estacionalidad fuerte (strengths observados: 1.05, 0.55, 0.47)
 *
 * Plan de re-habilitación (PR-M4c' pendiente):
 *   1. Cap protection: motor 2 reserva slots para candidates hardcoded con
 *      impact > umbral ($10k). Seasonality (impact=0) no puede desplazar
 *      recuperables de alto valor.
 *   2. Excluir seasonality del chainer: agregar a lista de tipos no-chainable.
 *      Seasonality es contextual/informativa, no debe formar cadenas.
 *   3. STRENGTH_THRESHOLD: 0.20 → 0.60. Reduce de 3 candidates a 1 en demo
 *      Los Pinos; mantiene sensibilidad en datasets reales con menor asimetría.
 *
 * El algoritmo subyacente (promedios mensuales, indices estacionales,
 * strength=max(peak-1, 1-valley)) es correcto. Solo requiere el scaffolding
 * defensivo en motor 2 y chainer antes de re-wire.
 */
// [PR-M4c] Detector seasonality — patrón cíclico anual en series temporales.
//
// Algoritmo (determinístico):
//   1. Filtro: is_monetary_primary (sólo venta_usd) y dim !== 'mes' (degenerate).
//   2. Para cada member de la dimensión, construir serie mensual (año-mes → valor).
//   3. Requiere ≥12 meses distintos en la historia total; 12 meses calendario cubiertos
//      en el member para detectar ciclo anual.
//   4. Calcular avg por mes calendario (1..12) promediando entre años disponibles.
//   5. index[m] = avg[m] / overall_avg.
//   6. seasonal_strength = max(max(index) - 1, 1 - min(index)).
//   7. Emite 1 candidato: el member con mayor strength ≥ 0.20. Si ninguno → [].
//
// Output:
//   - direccion='neutral' (patrón observacional, no gap recuperable)
//   - impact=0, detail.is_monetary=false → no afecta totalImpact
//   - Card visible en ranking como señal informativa
//
// Defensas heredadas:
//   - is_monetary_primary guard (PR-M4b'''-fix): sólo venta_usd
//   - Gate group-* (PR-M4d): bypass vía _extractTipoDim
//   - Dedup vs hardcoded (PR-M4d): no aplica (no hay hardcoded de este tipo)
//
// Ver docs/PR-M4b-audit.md para el diseño defensivo común con outlier.

import type { SaleRecord } from '../../types'
import type { Metric } from '../metricRegistry'
import type { Dimension } from '../dimensionRegistry'
import type { InsightType } from '../insightTypeRegistry'
import type { CrossEngineCandidate, CrossEngineContext } from '../crossEngine'

const MIN_MONTHS_TOTAL   = 12   // el dataset debe abarcar ≥12 meses
const MIN_CAL_MONTHS_MEM = 12   // el member debe tener las 12 lunas calendario
// [PR-M4c'] Subido de 0.20 → 0.60 tras runtime PR-M4c. Strengths observados en
// demo Los Pinos: producto Papas Fritas 150g = 1.05 (supera), categoria Snacks = 0.55
// (no supera), canal Mayoreo = 0.47 (no supera). Con 0.60, 3 candidates → 1 en demo.
// 0.20 era demasiado permisivo para datasets con asimetría estacional moderada.
const STRENGTH_THRESHOLD = 0.60

const MONTH_NAMES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

function _scoreToSeverity(score: number): 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA' {
  if (score >= 0.7) return 'CRITICA'
  if (score >= 0.5) return 'ALTA'
  if (score >= 0.3) return 'MEDIA'
  return 'BAJA'
}

function _ymKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function detectSeasonality(
  metric:    Metric,
  dimension: Dimension,
  _type:     InsightType,
  ctx:       CrossEngineContext,
): CrossEngineCandidate[] {
  const _round2 = (x: number) => Math.round(x * 100) / 100
  const _emitDiag = (payload: Record<string, unknown>) => {
    if (import.meta.env.DEV) {
      console.debug('[PR-M4-diag] seasonality_scan:', {
        dimension: dimension.id,
        metric:    metric.id,
        threshold: STRENGTH_THRESHOLD,
        ...payload,
      })
    }
  }

  // Defensa is_monetary_primary — sólo venta_usd cruza
  if (!metric.is_monetary_primary) return []

  // Skip dim='mes' — el member ES el mes, serie degenerate
  if (dimension.id === 'mes') {
    _emitDiag({ candidates_generados: 0, razon: 'dim_mes_not_applicable' })
    return []
  }

  // Inventario de meses totales del dataset
  const allMonths = new Set<string>()
  for (const s of ctx.sales) {
    if (s.fecha instanceof Date) allMonths.add(_ymKey(s.fecha))
  }
  const monthsHistoricos = allMonths.size
  if (monthsHistoricos < MIN_MONTHS_TOTAL) {
    _emitDiag({ meses_historicos: monthsHistoricos, candidates_generados: 0, razon: 'insufficient_months' })
    return []
  }

  // Ventas por member de la dimensión
  const salesByMember = new Map<string, SaleRecord[]>()
  for (const s of ctx.sales) {
    const k = dimension.groupBy(s)
    if (!k) continue
    const arr = salesByMember.get(k)
    if (arr) arr.push(s)
    else salesByMember.set(k, [s])
  }

  type Result = {
    member:       string
    strength:     number
    peakMonth:    number
    peakIdx:      number
    valleyMonth:  number
    valleyIdx:    number
    nMonthsMem:   number
    overallMean:  number
  }
  const results: Result[] = []

  for (const [member, memSales] of salesByMember) {
    // Agrupar por año-mes dentro del member
    const byYM = new Map<string, SaleRecord[]>()
    for (const s of memSales) {
      if (!(s.fecha instanceof Date)) continue
      const k = _ymKey(s.fecha)
      const arr = byYM.get(k)
      if (arr) arr.push(s)
      else byYM.set(k, [s])
    }
    if (byYM.size < MIN_CAL_MONTHS_MEM) continue

    // Acumular valores por mes calendario (1..12) a través de años
    const calAgg = new Map<number, number[]>()
    for (const [ymKey, monthSales] of byYM) {
      const month = parseInt(ymKey.split('-')[1], 10)
      const v = metric.computeFn(monthSales)
      if (!Number.isFinite(v) || Number.isNaN(v)) continue
      const arr = calAgg.get(month)
      if (arr) arr.push(v)
      else calAgg.set(month, [v])
    }
    if (calAgg.size < 12) continue  // no cubre las 12 lunas

    // Promedio por mes calendario + overall mean
    const avgByMonth: number[] = []
    for (let m = 1; m <= 12; m++) {
      const vals = calAgg.get(m) ?? []
      const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
      avgByMonth.push(avg)
    }
    const overallMean = avgByMonth.reduce((a, b) => a + b, 0) / 12
    if (overallMean <= 0) continue

    // Índices estacionales y extremos
    let peakIdx = 0, peakMonth = 1
    let valleyIdx = Infinity, valleyMonth = 1
    for (let m = 1; m <= 12; m++) {
      const idx = avgByMonth[m - 1] / overallMean
      if (idx > peakIdx) { peakIdx = idx; peakMonth = m }
      if (idx < valleyIdx) { valleyIdx = idx; valleyMonth = m }
    }
    const strength = Math.max(peakIdx - 1, 1 - valleyIdx)
    results.push({ member, strength, peakMonth, peakIdx, valleyMonth, valleyIdx, nMonthsMem: byYM.size, overallMean })
  }

  if (results.length === 0) {
    _emitDiag({ meses_historicos: monthsHistoricos, candidates_generados: 0, razon: 'no_members_with_12_calendar_months' })
    return []
  }

  // Top por strength
  results.sort((a, b) => b.strength - a.strength)
  const top = results[0]
  const belowThreshold = top.strength < STRENGTH_THRESHOLD

  _emitDiag({
    meses_historicos:   monthsHistoricos,
    miembros_evaluados: results.length,
    seasonal_strength:  _round2(top.strength),
    mes_pico:           top.peakMonth,
    index_pico:         _round2(top.peakIdx),
    mes_valle:          top.valleyMonth,
    index_valle:        _round2(top.valleyIdx),
    below_threshold:    belowThreshold,
    candidates_generados: belowThreshold ? 0 : 1,
    top_member:         top.member,
  })

  if (belowThreshold) return []

  // Emitir candidato
  const score    = Math.min(top.strength / 0.5, 1)   // strength 0.2→0.4, 0.5+→1.0
  const severity = _scoreToSeverity(score)
  const peakName    = MONTH_NAMES_ES[top.peakMonth - 1]
  const valleyName  = MONTH_NAMES_ES[top.valleyMonth - 1]
  const peakPctStr   = `${(top.peakIdx * 100).toFixed(0)}%`
  const valleyPctStr = `${(top.valleyIdx * 100).toFixed(0)}%`
  const memberLabel  = dimension.formatValue(top.member)

  return [{
    metricId:      metric.id,
    dimensionId:   dimension.id,
    insightTypeId: 'seasonality',
    member:        top.member,
    score,
    severity,
    title:         `Patrón estacional en ${dimension.label} ${memberLabel}`,
    description:   `${dimension.label} ${memberLabel} tiene pico en ${peakName} (${peakPctStr} del promedio) y valle en ${valleyName} (${valleyPctStr}). Fuerza: ${_round2(top.strength)} sobre ${top.nMonthsMem} meses.`,
    conclusion:    `Patrón cíclico anual detectado. Útil para planificación de inventario y promociones.`,
    accion: {
      texto:        `Anticipar recursos/inventario para ${peakName}; evaluar campañas de empuje en ${valleyName}.`,
      entidades:    [top.member],
      respaldo:     `Strength ${_round2(top.strength)} sobre ${top.nMonthsMem} meses observados`,
      ejecutableEn: 'mediano_plazo',
    },
    detail: {
      tipo:              'seasonality',
      metric:            metric.id,
      dimension:         dimension.id,
      member:            top.member,
      seasonal_strength: top.strength,
      mes_pico:          top.peakMonth,
      index_pico:        top.peakIdx,
      mes_valle:         top.valleyMonth,
      index_valle:       top.valleyIdx,
      n_months:          top.nMonthsMem,
      direccion:         'neutral',     // patrón observacional, no gap recuperable
      is_monetary:       false,         // no contribuye a totalImpact (non_monetary)
      impact:            0,
    },
  }]
}
