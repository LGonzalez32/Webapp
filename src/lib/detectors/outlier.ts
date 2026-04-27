/**
 * Detector outlier (Z-score) — IMPLEMENTADO pero NO WIRED-UP.
 *
 * Estado: PR-M4b revertido. Este archivo se preserva; no se invoca desde
 * crossEngine.ts (DETECTORS={}).
 *
 * Motivo del revert: el mecanismo `group-*` de motor 2 (agrupación en
 * insightStandard.ts:agruparInsightsRedundantes) empaca los outliers de
 * vendedor/producto bajo un único `group-vendor-*` con impact = suma de
 * desviaciones vs media. Eso es un artefacto estadístico, no un recuperable
 * real, y canibaliza el top-10 del ranking (−$24,554 en totalImpact).
 * Además, outliers de métricas no-USD entran al pool y son excluidos
 * después con razon=recuperable_sin_monto_usd, ocupando slots de top-10
 * sin aportar.
 *
 * Plan de re-habilitación (ver docs/PR-M4b-audit.md):
 *   1. PR-M4d: dedup vs hardcoded + gate al mecanismo group-* para outliers
 *   2. Subir Z_THRESHOLD a 2.5 (reduce falsos positivos ~5×)
 *   3. Filtrar outliers no-USD ANTES de entrar al pool (no emitirlos como
 *      candidates, o marcarlos non_monetary de raíz para que no ocupen slot)
 *   4. Decidir si outliers deben participar del mecanismo group-* o quedar
 *      como blocks individuales (preferible lo segundo para preservar señal
 *      individual del z-score)
 *
 * El algoritmo subyacente (Z-score muestral n-1, MIN_GROUPS=5, gate por
 * stddev<1e-6) es correcto y no requiere cambios — solo requiere la
 * infraestructura del pipeline que lo soporte sin canibalizar.
 */
// [PR-M4b] Detector de outlier por Z-score. Primer detector real del cross-engine.
//
// Algoritmo clásico:
//   1. Agrupar ctx.currentSales por dimension.groupBy
//   2. Calcular metric.computeFn(salesDelGrupo) para cada grupo
//   3. Media + desviación muestral (n-1)
//   4. Para cada grupo: z = (valor - media) / stddev
//   5. Si |z| >= Z_THRESHOLD → emite candidato
//
// Reglas del detector:
//   - Mínimo 5 grupos válidos (user spec). Con menos, stats no son confiables.
//   - stddev < 1e-6 (grupo homogéneo) → skip para evitar división por cero.
//   - Usa currentSales (no all sales) para detectar anomalías del período actual.
//   - Semántica de dirección por métrica: "higher is better" (venta_usd, unidades,
//     ticket_promedio, frecuencia_compra) → z>0 positivo; z<0 recuperable.
//     Neutras (precio_unitario) → z sin signo, dirección 'neutral'.
//
// Contrato de impacto:
//   - metric.unit==='USD' → impact es monetario directo, contribuye a totalImpact
//     si direccion='recuperable' (vía computeRecuperableFromCandidate en motor 2).
//   - metric.unit!=='USD' → non_monetary=true, no suma a totalImpact.
//
// Integración: el candidato se adapta al shape InsightCandidate en crossEngine.ts y
// se hace push al allCandidates de runInsightEngine. El block id resulta
// `ie-<dimId>-outlier-<idx>` por convención de motor 2 (no `xe-*`).

import type { SaleRecord } from '../../types'
import type { Metric } from '../crossEngine/metricRegistry'
import type { Dimension } from '../crossEngine/dimensionRegistry'
import type { InsightType } from '../crossEngine/insightTypeRegistry'
import type { CrossEngineCandidate, CrossEngineContext } from '../crossEngine/'

const MIN_GROUPS    = 5
// [PR-M4d] Subido de 2.0 a 2.5 tras PR-M4b audit. Con 2.0 el detector
// generaba ~5% de falsos positivos que canibalizaban el ranking via
// agruparInsightsRedundantes. Con 2.5, ~1% de la distribución gaussiana
// (5× más exigente). Ver docs/PR-M4b-audit.md §3.c.
const Z_THRESHOLD   = 2.5

const HIGHER_IS_BETTER = new Set<string>([
  'venta_usd', 'unidades', 'ticket_promedio', 'frecuencia_compra',
])
const NEUTRAL_METRICS = new Set<string>([
  'precio_unitario',  // un precio alto/bajo no tiene signo accionable sin más contexto
])

function _scoreToSeverity(score: number): 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA' {
  if (score >= 0.7) return 'CRITICA'
  if (score >= 0.5) return 'ALTA'
  if (score >= 0.3) return 'MEDIA'
  return 'BAJA'
}

export function detectOutlier(
  metric:    Metric,
  dimension: Dimension,
  _type:     InsightType,
  ctx:       CrossEngineContext,
): CrossEngineCandidate[] {
  // [PR-M4d + PR-M4b'''-fix] USD-only guard: solo la métrica USD VOLUMÉTRICA PRIMARIA
  // (venta_usd) cruza este guard. ticket_promedio y precio_unitario también tienen
  // unit='USD' en el registry (es la unidad de display, no la naturaleza estadística),
  // pero son DERIVADAS (ratios). Aplicar Z-score sobre un ratio entre grupos produce
  // señales espurias: un cliente con 1 venta de $500 tiene ticket_promedio=500, mientras
  // otro con 200 ventas de $1.000.000 total también tiene ticket_promedio=500 — no
  // comparables. El flag is_monetary_primary aísla explícitamente el caso volumétrico.
  // Ver docs/PR-M4b-audit.md §3.d.
  if (!metric.is_monetary_primary) return []

  // [PR-M4b''-diag] helper para el diagnóstico — round a 2 decimales
  const _round2 = (x: number) => Math.round(x * 100) / 100
  const _emitDiag = (payload: Record<string, unknown>) => {
    if (import.meta.env.DEV) {
      console.debug('[PR-M4-diag] outlier_scan:', {
        dimension: dimension.id,
        metric:    metric.id,
        threshold: Z_THRESHOLD,
        ...payload,
      })
    }
  }

  // 1. Agrupar currentSales por dimensión
  const groups = new Map<string, SaleRecord[]>()
  for (const s of ctx.currentSales) {
    const k = dimension.groupBy(s)
    if (!k) continue
    const arr = groups.get(k)
    if (arr) arr.push(s)
    else groups.set(k, [s])
  }
  if (groups.size < MIN_GROUPS) {
    _emitDiag({ n_groups: groups.size, outliers_generados: 0, razon: 'insufficient_groups' })
    return []
  }

  // 2. Calcular métrica por grupo
  const values: Array<{ key: string; value: number }> = []
  for (const [key, salesGrp] of groups) {
    const v = metric.computeFn(salesGrp)
    if (v == null || Number.isNaN(v) || !Number.isFinite(v)) continue
    values.push({ key, value: v })
  }
  if (values.length < MIN_GROUPS) {
    _emitDiag({ n_groups: values.length, outliers_generados: 0, razon: 'insufficient_valid_values' })
    return []
  }

  // 3. Stats muestrales
  const n        = values.length
  const mean     = values.reduce((a, g) => a + g.value, 0) / n
  const variance = values.reduce((a, g) => a + (g.value - mean) ** 2, 0) / (n - 1)
  const stddev   = Math.sqrt(variance)
  if (stddev < 1e-6) {
    _emitDiag({ n_groups: n, mean: _round2(mean), stddev: 0, outliers_generados: 0, razon: 'homogeneous_group' })
    return []
  }

  const higherIsBetter = HIGHER_IS_BETTER.has(metric.id)
  const neutral        = NEUTRAL_METRICS.has(metric.id)
  const isUSD          = metric.unit === 'USD'

  // 4. Emitir candidatos para |z| >= umbral
  // [PR-M4b''-diag] tracking de extremos para diagnóstico post-loop
  let _minZ = Infinity
  let _maxZ = -Infinity
  let _maxAbsZ = 0
  let _topMember: { member: string; z_score: number; value: number } | null = null

  const out: CrossEngineCandidate[] = []
  for (const g of values) {
    const z = (g.value - mean) / stddev
    // [PR-M4b''-diag] actualizar extremos ANTES del filtro por umbral
    if (z < _minZ) _minZ = z
    if (z > _maxZ) _maxZ = z
    const absZ = Math.abs(z)
    if (absZ > _maxAbsZ) {
      _maxAbsZ = absZ
      _topMember = { member: g.key, z_score: z, value: g.value }
    }
    if (absZ < Z_THRESHOLD) continue

    let direccion: 'positivo' | 'recuperable' | 'neutral'
    if (neutral) direccion = 'neutral'
    else if (higherIsBetter) direccion = z > 0 ? 'positivo' : 'recuperable'
    else direccion = z > 0 ? 'recuperable' : 'positivo'

    const impactAbs  = Math.abs(g.value - mean)
    const score      = Math.min(Math.abs(z) / 4, 1)   // z=2→0.5, z=4→1.0
    const severity   = _scoreToSeverity(score)
    const zStr       = z > 0 ? `+${z.toFixed(1)}σ` : `${z.toFixed(1)}σ`
    const meanStr    = mean.toLocaleString('es-SV', { maximumFractionDigits: 2 })
    const valStr     = g.value.toLocaleString('es-SV', { maximumFractionDigits: 2 })
    const unitLabel  = metric.unit
    const title      = `${dimension.label} atípico: ${dimension.formatValue(g.key)} (${metric.label})`
    const description = `${dimension.formatValue(g.key)} está ${zStr} del promedio del grupo — ${valStr} ${unitLabel} vs media ${meanStr} ${unitLabel} (n=${n}).`
    const conclusion = direccion === 'recuperable'
      ? `${dimension.formatValue(g.key)} está muy por debajo del promedio. Revisar causas antes de que marque el mes.`
      : direccion === 'positivo'
        ? `${dimension.formatValue(g.key)} sobresale positivamente. Analizar qué está funcionando para replicar.`
        : `Valor atípico en ${metric.label}; el signo no implica bueno/malo sin contexto.`

    out.push({
      metricId:      metric.id,
      dimensionId:   dimension.id,
      insightTypeId: 'outlier',
      member:        g.key,
      score,
      severity,
      title,
      description,
      conclusion,
      accion: {
        texto:        direccion === 'recuperable'
          ? `Revisar ${dimension.label.toLowerCase()} ${dimension.formatValue(g.key)}: está ${zStr} del promedio en ${metric.label}.`
          : `Analizar ${dimension.label.toLowerCase()} ${dimension.formatValue(g.key)}: ${zStr} sobre el promedio en ${metric.label}.`,
        entidades:    [g.key],
        respaldo:     `z=${z.toFixed(2)}, valor=${valStr}, media=${meanStr}, n=${n}`,
        ejecutableEn: direccion === 'recuperable' ? 'este_mes' : 'mediano_plazo',
      },
      detail: {
        tipo:       'outlier',
        metric:     metric.id,
        dimension:  dimension.id,
        groupKey:   g.key,
        valor:      g.value,
        mean,
        stddev,
        z_score:    Number(z.toFixed(3)),
        n_grupo:    n,
        direccion,
        unit:       metric.unit,
        is_monetary: isUSD,
        // campos para el motor 2 (computeRecuperableFromCandidate y _impactoEvento)
        impact:     impactAbs,
        // etiqueta informativa
        label:      `${dimension.label} "${g.key}" está ${z > 0 ? 'muy arriba' : 'muy abajo'} en ${metric.label}`,
      },
    })
  }

  // [PR-M4b''-diag] diagnóstico final — una línea por cada llamada con stats completas
  _emitDiag({
    n_groups:          n,
    mean:              _round2(mean),
    stddev:            _round2(stddev),
    max_abs_z:         _round2(_maxAbsZ),
    min_z:             _round2(_minZ),
    max_z:             _round2(_maxZ),
    below_threshold:   _maxAbsZ < Z_THRESHOLD,
    outliers_generados: out.length,
    top_miembro_z:     _topMember
      ? {
          member:  _topMember.member,
          z_score: _round2(_topMember.z_score),
          value:   _round2(_topMember.value),
        }
      : null,
  })

  return out
}
