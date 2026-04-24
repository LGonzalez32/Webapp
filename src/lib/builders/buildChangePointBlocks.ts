// [PR-M8a] Change Point Detection — quiebres de régimen en series mensuales.
//
// Distinto de change (MoM): change mira 1 mes vs 1 mes. change_point mira la
// serie completa y encuentra el k donde la media pre vs post difiere más en
// unidades de desviación estándar combinada (stat z / CUSUM simple).
//
// Regla cardinal: insight SOBRE COMPORTAMIENTO EN EL TIEMPO, no estructura.
// Nunca reportar "X tiene el menor Y"; sí reportar "Y de X cayó de A a B
// sostenidamente desde <mes>".
//
// No probabilidad, no IA. Solo media, stdev poblacional y z-score clásico.
// Retorna InsightCandidate[] (tipo estándar del motor 2) — se rutea vía
// EVENT_TYPES_EXEMPT con narrativa directa en title/description/conclusion/accion.

import type { SaleRecord } from '../../types'
import type { InsightCandidate } from '../insight-engine'
import { DIMENSION_REGISTRY, METRIC_REGISTRY } from '../insight-registry'

// ─── Configuración ──────────────────────────────────────────────────────────

// [PR-FIX.8] derivado dinámicamente del registry central.
const CP_METRICS: string[] = METRIC_REGISTRY
  .filter(m => m.compatibleInsights?.includes('change_point'))
  .map(m => m.id)
type CPMetric = string
type CPDim    = string

const CP_DIM_CONFIG: Record<string, string[]> = Object.fromEntries(
  CP_METRICS.map(metricId => [
    metricId,
    DIMENSION_REGISTRY
      .filter(d => d.supports?.includes('change_point'))
      .map(d => d.field),
  ]),
)

const CP_MIN_MONTHS     = 6
const CP_MIN_SPLIT      = 3
const CP_Z_THRESHOLD    = 1.5
const CP_MIN_REL_CHANGE = 0.1

// ─── Telemetría ─────────────────────────────────────────────────────────────

interface CpTelemetry {
  cells_evaluated:   number
  series_with_data:  number
  candidates_found:  number
  blocks_returned:   number
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const MESES_ES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
]

function _toDate(f: unknown): Date {
  return f instanceof Date ? f : new Date(f as string)
}

function _monthKey(d: Date): string {
  // YYYY-MM — ordenable léxicamente como cronológicamente.
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function _monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m || m < 1 || m > 12) return ym
  return `${MESES_ES[m - 1]} ${y}`
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

function _severityFromPct(absPct: number): 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA' {
  if (absPct >= 30) return 'CRITICA'
  if (absPct >= 15) return 'ALTA'
  return 'MEDIA'
}

interface SeriePoint {
  ym:     string
  value:  number   // valor de la métrica en ese mes (ticket | unidades | frec)
  ntx:    number   // # transacciones del mes (para filtros/depuración)
}

// Agrega serie mensual por entidad para una (metric, dim). Sólo meses con
// datos válidos para la métrica. Retorna Map<entity, SeriePoint[]> asc por ym.
function _buildMonthlySeriesByEntity(
  sales: SaleRecord[],
  dim: CPDim,
  metric: CPMetric,
): Map<string, SeriePoint[]> {
  // buckets: entity -> ym -> { ventas, unidades, ntx }
  const buckets = new Map<string, Map<string, { ventas: number; unidades: number; ntx: number }>>()

  for (const r of sales) {
    const ent = (r as unknown as Record<string, unknown>)[dim] as string | undefined
    if (!ent) continue
    const ym = _monthKey(_toDate(r.fecha))
    let monthMap = buckets.get(ent)
    if (!monthMap) { monthMap = new Map(); buckets.set(ent, monthMap) }
    const prev = monthMap.get(ym) ?? { ventas: 0, unidades: 0, ntx: 0 }
    prev.ventas   += r.venta_neta ?? 0
    prev.unidades += r.unidades   ?? 0
    prev.ntx      += 1
    monthMap.set(ym, prev)
  }

  const out = new Map<string, SeriePoint[]>()
  for (const [ent, monthMap] of buckets) {
    const points: SeriePoint[] = []
    for (const [ym, { ventas, unidades, ntx }] of monthMap) {
      if (ntx < 1) continue
      let value: number | null = null
      if (metric === 'ticket_promedio') {
        value = ntx > 0 ? ventas / ntx : null
      } else if (metric === 'unidades') {
        value = unidades > 0 ? unidades : null
      } else if (metric === 'frecuencia_compra') {
        // [PR-M8b] frecuencia_compra mensual = # transacciones del cliente ese mes.
        value = ntx
      }
      if (value == null || !isFinite(value) || value <= 0) continue
      points.push({ ym, value, ntx })
    }
    points.sort((a, b) => a.ym.localeCompare(b.ym))
    out.set(ent, points)
  }
  return out
}

// ─── Detector principal ─────────────────────────────────────────────────────

interface CpDetected {
  entity:       string
  metric:       CPMetric
  dim:          CPDim
  k:            number
  meanPre:      number
  meanPost:     number
  pctChange:    number
  absScore:     number
  direction:    'up' | 'down'
  changeMonth:  string
  monthsPost:   number
  n:            number
}

function _detectChangePoint(
  entity: string,
  series: SeriePoint[],
  metric: CPMetric,
  dim:    CPDim,
): CpDetected | null {
  const n = series.length
  if (n < CP_MIN_MONTHS) return null
  const values = series.map(p => p.value)

  let best: CpDetected | null = null

  for (let k = CP_MIN_SPLIT; k <= n - CP_MIN_SPLIT; k++) {
    const pre   = values.slice(0, k)
    const post  = values.slice(k)
    const mPre  = _meanPop(pre)
    const mPost = _meanPop(post)
    if (mPre === 0) continue
    const sPre  = _stdevPop(pre,  mPre)
    const sPost = _stdevPop(post, mPost)
    const sPooled = Math.sqrt((sPre * sPre * k + sPost * sPost * (n - k)) / n)
    if (sPooled < 0.01) continue

    const diff      = mPost - mPre
    const score     = Math.abs(diff) / sPooled
    const relChange = Math.abs(diff) / Math.abs(mPre)
    if (score < CP_Z_THRESHOLD)       continue
    if (relChange < CP_MIN_REL_CHANGE) continue

    if (!best || score > best.absScore) {
      best = {
        entity,
        metric,
        dim,
        k,
        meanPre:     mPre,
        meanPost:    mPost,
        pctChange:   (diff / mPre) * 100,
        absScore:    score,
        direction:   diff > 0 ? 'up' : 'down',
        changeMonth: series[k].ym,
        monthsPost:  n - k,
        n,
      }
    }
  }
  return best
}

// ─── Narrativa ──────────────────────────────────────────────────────────────

function _buildNarrative(cp: CpDetected): {
  titulo: string
  descripcion: string
  conclusion: string
  accionTexto: string
} {
  const monthLabel = _monthLabel(cp.changeMonth)
  const fmtUsd = (v: number) => `$${v.toFixed(2)}`
  const fmtInt = (v: number) => Math.round(v).toLocaleString('es-SV')
  const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
  const absPct = Math.abs(cp.pctChange).toFixed(1)

  if (cp.metric === 'ticket_promedio') {
    const titulo = `${cp.entity} — ticket promedio cambió de régimen desde ${monthLabel}`
    const descripcion =
      `Pasó de ${fmtUsd(cp.meanPre)} a ${fmtUsd(cp.meanPost)} (${fmtPct(cp.pctChange)}) ` +
      `sostenidamente desde ${monthLabel} (${cp.monthsPost} meses consecutivos).`
    const conclusion = cp.direction === 'down'
      ? `Una caída sostenida de ${absPct}% en ticket promedio reduce el ingreso por transacción — revisar mezcla de productos o política de descuentos desde ${monthLabel}.`
      : `Un alza sostenida de ${cp.pctChange.toFixed(1)}% en ticket promedio sugiere mejora en la mezcla o en el tipo de cliente atendido.`
    const accionTexto =
      `Identificar qué cambió en ${monthLabel}: cartera de clientes, descuentos aplicados, mix de productos. ` +
      `Comparar con el período anterior para aislar la causa.`
    return { titulo, descripcion, conclusion, accionTexto }
  }

  // [PR-M8b] unidades
  if (cp.metric === 'unidades') {
    const titulo = `${cp.entity} — unidades vendidas cambió de régimen desde ${monthLabel}`
    const descripcion =
      `Pasó de ${fmtInt(cp.meanPre)} uds a ${fmtInt(cp.meanPost)} uds (${fmtPct(cp.pctChange)}) ` +
      `sostenidamente desde ${monthLabel} (${cp.monthsPost} meses consecutivos).`
    const conclusion = cp.direction === 'down'
      ? `Una caída sostenida de ${absPct}% en unidades vendidas reduce el volumen — revisar disponibilidad, promociones o cambios en la cartera desde ${monthLabel}.`
      : `Un alza sostenida de ${cp.pctChange.toFixed(1)}% en unidades vendidas indica mayor volumen — validar si responde a una acción comercial o a un cambio en la cartera.`
    const accionTexto =
      `Identificar qué cambió en ${monthLabel}: promociones activas, nuevos clientes, cambios de surtido. ` +
      `Comparar con el período anterior para aislar la causa.`
    return { titulo, descripcion, conclusion, accionTexto }
  }

  // [PR-M8b] frecuencia_compra
  // cp.metric === 'frecuencia_compra'
  const titulo = `${cp.entity} — frecuencia de compra cambió de régimen desde ${monthLabel}`
  const descripcion =
    `Pasó de ${cp.meanPre.toFixed(1)} visitas/mes a ${cp.meanPost.toFixed(1)} visitas/mes (${fmtPct(cp.pctChange)}) ` +
    `sostenidamente desde ${monthLabel} (${cp.monthsPost} meses consecutivos).`
  const conclusion = cp.direction === 'down'
    ? `Una caída sostenida de ${absPct}% en frecuencia sugiere que el cliente visita o compra menos seguido — riesgo de desvinculación.`
    : `Un alza sostenida de ${cp.pctChange.toFixed(1)}% en frecuencia sugiere mayor engagement del cliente — identificar qué lo activó para replicarlo.`
  const accionTexto =
    `Revisar historial de visitas desde ${monthLabel}: cambios en la fuerza de ventas asignada, ` +
    `promociones de activación, o variaciones en el surtido disponible.`
  return { titulo, descripcion, conclusion, accionTexto }
}

// ─── Export principal ───────────────────────────────────────────────────────

export function buildChangePointBlocks(
  sales: SaleRecord[],
): { candidates: InsightCandidate[]; telemetry: CpTelemetry } {
  const telemetry: CpTelemetry = {
    cells_evaluated:   0,
    series_with_data:  0,
    candidates_found:  0,
    blocks_returned:   0,
  }
  const candidates: InsightCandidate[] = []
  if (!sales || sales.length === 0) return { candidates, telemetry }

  try {
    for (const metric of CP_METRICS) {
      const dims = CP_DIM_CONFIG[metric]
      for (const dim of dims) {
        telemetry.cells_evaluated++
        const seriesByEntity = _buildMonthlySeriesByEntity(sales, dim, metric)
        for (const [entity, series] of seriesByEntity) {
          if (series.length < CP_MIN_MONTHS) continue
          telemetry.series_with_data++
          const cp = _detectChangePoint(entity, series, metric, dim)
          if (!cp) continue
          telemetry.candidates_found++

          const absPct   = Math.abs(cp.pctChange)
          const severity = _severityFromPct(absPct)
          const { titulo, descripcion, conclusion, accionTexto } = _buildNarrative(cp)
          // score normalizado a [0,1] vía absScore/4 (consistente con M7d/M7f).
          const score = Math.min(1, cp.absScore / 4)

          candidates.push({
            metricId:      metric,
            dimensionId:   dim,
            insightTypeId: 'change_point',
            member:        entity,
            score,
            severity,
            title:         titulo,
            description:   descripcion,
            detail: {
              member:       entity,
              metric,
              dim,
              k:            cp.k,
              meanPre:      cp.meanPre,
              meanPost:     cp.meanPost,
              pctChange:    cp.pctChange,
              absScore:     cp.absScore,
              direction:    cp.direction,
              changeMonth:  cp.changeMonth,
              monthsPost:   cp.monthsPost,
              n:            cp.n,
              source:       '[PR-M8a] change_point',
            },
            conclusion,
            accion: {
              texto:        accionTexto,
              entidades:    [entity],
              respaldo:     `z=${cp.absScore.toFixed(2)}, k=${cp.k}/${cp.n}, Δ=${cp.pctChange.toFixed(1)}%`,
              ejecutableEn: severity === 'CRITICA' ? 'inmediato' : 'esta_semana',
            },
          })
        }
      }
    }
  } catch {
    // degradación silenciosa (never throws)
  }

  telemetry.blocks_returned = candidates.length
  // Log obligatorio — un único console.log por invocación.
  // [PR-M8b] tag actualizado: mismo builder, 3 métricas × dims ampliadas.
  console.log('[PR-M8b] change_point_builder', {
    cells_evaluated:   telemetry.cells_evaluated,
    series_with_data:  telemetry.series_with_data,
    candidates_found:  telemetry.candidates_found,
    blocks_returned:   telemetry.blocks_returned,
  })
  return { candidates, telemetry }
}
