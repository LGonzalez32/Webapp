// [PR-M9] Steady Share Detection — proporción estable que cambia.
//
// Distinto de change_point: change_point mira el VALOR absoluto de la métrica
// por entidad en el tiempo. steady_share mira el SHARE relativo de la entidad
// dentro del total del grupo (valor_entidad / total_grupo) mes a mes. Detecta
// entidades que sostuvieron una cuota estable y la perdieron (o ganaron) de
// forma sostenida — posición relativa, no volumen absoluto.
//
// No probabilidad, no IA. Media, stdev poblacional, coeficiente de variación.
// Retorna InsightCandidate[] — ruteo vía EVENT_TYPES_EXEMPT con narrativa directa.

import type { SaleRecord } from '../../types'
import type { InsightCandidate } from '../insight-engine'
import { DIMENSION_REGISTRY, METRIC_REGISTRY } from '../insight-registry'

// ─── Configuración ──────────────────────────────────────────────────────────

// [PR-FIX.9] SS_METRICS deriva del METRIC_REGISTRY: solo se procesan las que
// declaran 'steady_share' en compatibleInsights. El builder accede al field
// 'venta_neta' del SaleRecord — el id en registry es 'venta', así que
// mapeamos registry-id → internal-field-name.
// TODO: alinear id 'venta' en METRIC_REGISTRY con campo 'venta_neta' del SaleRecord.
type SSMetric = 'venta_neta' | 'unidades'
type SSDim    = string

const _ssRegistrySet = new Set(
  METRIC_REGISTRY
    .filter(m => m.compatibleInsights?.includes('steady_share'))
    .map(m => m.id),
)
const SS_METRICS: SSMetric[] = (['venta_neta', 'unidades'] as const).filter(m =>
  _ssRegistrySet.has(m === 'venta_neta' ? 'venta' : m),
)

const _ssDims = DIMENSION_REGISTRY
  .filter(d => d.supports?.includes('steady_share'))
  .map(d => d.field)
const SS_DIM_CONFIG: Record<SSMetric, string[]> = {
  venta_neta: _ssDims,
  unidades:   _ssDims,
}

// [PR-FIX.10] Umbrales relajados para datos reales:
//   SS_MIN_MONTHS:    6 → 4   (admitir series más cortas)
//   SS_STABLE_WINDOW: 4 → 3   (ventana de estabilidad menor)
//   SS_STABLE_CV:     0.15 → 0.25 (admitir más fluctuación natural como "estable")
const SS_MIN_MONTHS    = 4
const SS_STABLE_WINDOW = 3
const SS_STABLE_CV     = 0.25
const SS_MIN_SHIFT     = 0.05
const SS_MIN_SHARE     = 0.03
const SS_POST_WINDOW   = 2

// ─── Telemetría ─────────────────────────────────────────────────────────────

interface SsTelemetry {
  cells_evaluated:  number
  series_with_data: number
  candidates_found: number
  blocks_returned:  number
}

// ─── Helpers (espejo de buildChangePointBlocks) ─────────────────────────────

const MESES_ES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
]

function _toDate(f: unknown): Date {
  return f instanceof Date ? f : new Date(f as string)
}

function _monthKey(d: Date): string {
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

function _severityFromPP(absPP: number): 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA' {
  if (absPP >= 15) return 'CRITICA'
  if (absPP >= 8)  return 'ALTA'
  return 'MEDIA'
}

// ─── Agregación: totales mensuales + shares por entidad ─────────────────────

interface ShareSerie {
  months:       string[]           // ym ordenados asc (coincidentes con shares)
  shares:       number[]           // share[i] en months[i]
}

function _readMetricValue(r: SaleRecord, metric: SSMetric): number {
  if (metric === 'venta_neta') return r.venta_neta ?? 0
  return r.unidades ?? 0
}

function _buildShareSeriesByEntity(
  sales: SaleRecord[],
  dim: SSMetric extends never ? never : SSDim,
  metric: SSMetric,
): Map<string, ShareSerie> {
  // 1) Totales mensuales del grupo + valor por (entity, month)
  const total       = new Map<string, number>()                      // ym → total_grupo
  const byEntityMes = new Map<string, Map<string, number>>()         // entity → ym → valor

  for (const r of sales) {
    const ent = (r as unknown as Record<string, unknown>)[dim] as string | undefined
    if (!ent) continue
    const v = _readMetricValue(r, metric)
    if (!isFinite(v) || v <= 0) continue
    const ym = _monthKey(_toDate(r.fecha))
    total.set(ym, (total.get(ym) ?? 0) + v)
    let entMap = byEntityMes.get(ent)
    if (!entMap) { entMap = new Map(); byEntityMes.set(ent, entMap) }
    entMap.set(ym, (entMap.get(ym) ?? 0) + v)
  }

  // Meses del grupo donde total > 0, ordenados.
  const monthsGroup = [...total.entries()]
    .filter(([, t]) => t > 0)
    .map(([ym]) => ym)
    .sort((a, b) => a.localeCompare(b))

  const out = new Map<string, ShareSerie>()
  for (const [ent, entMap] of byEntityMes) {
    const shares: number[] = []
    for (const ym of monthsGroup) {
      const t = total.get(ym) ?? 0
      const v = entMap.get(ym) ?? 0
      shares.push(t > 0 ? v / t : 0)
    }
    out.set(ent, { months: monthsGroup, shares })
  }
  return out
}

// ─── Detector ───────────────────────────────────────────────────────────────

interface SsDetected {
  entity:         string
  metric:         SSMetric
  dim:            SSDim
  k:              number
  meanPre:        number    // share medio pre-quiebre (0..1)
  meanPost:       number    // share medio post-quiebre (0..1)
  cvPre:          number
  shift:          number    // post − pre (puede ser negativo)
  score:          number    // |shift| / meanPre (cambio relativo)
  direction:      'up' | 'down'
  breakMonth:     string
  monthsStable:   number
  monthsPost:     number
  n:              number
}

function _detectSteadyShareShift(
  entity: string,
  serie:  ShareSerie,
  metric: SSMetric,
  dim:    SSDim,
): SsDetected | null {
  const shares = serie.shares
  const months = serie.months
  const n = shares.length
  if (n < SS_MIN_MONTHS) return null

  let best: SsDetected | null = null
  for (let k = SS_STABLE_WINDOW; k <= n - SS_POST_WINDOW; k++) {
    const pre  = shares.slice(0, k)
    const post = shares.slice(k)
    if (post.length < SS_POST_WINDOW) continue
    const mPre  = _meanPop(pre)
    if (mPre < SS_MIN_SHARE) continue          // entidad marginal
    const sPre  = _stdevPop(pre, mPre)
    const cvPre = mPre > 0 ? sPre / mPre : Infinity
    if (cvPre > SS_STABLE_CV) continue         // pre no es estable
    const mPost = _meanPop(post)
    const shift = mPost - mPre
    if (Math.abs(shift) < SS_MIN_SHIFT) continue
    const score = Math.abs(shift) / mPre

    if (!best || score > best.score) {
      best = {
        entity,
        metric,
        dim,
        k,
        meanPre:      mPre,
        meanPost:     mPost,
        cvPre,
        shift,
        score,
        direction:    shift > 0 ? 'up' : 'down',
        breakMonth:   months[k],
        monthsStable: k,
        monthsPost:   n - k,
        n,
      }
    }
  }
  return best
}

// ─── Narrativa ──────────────────────────────────────────────────────────────

function _buildNarrative(cp: SsDetected): {
  titulo: string
  descripcion: string
  conclusion: string
  accionTexto: string
} {
  const monthLabel   = _monthLabel(cp.breakMonth)
  const sharePrePct  = cp.meanPre  * 100
  const sharePostPct = cp.meanPost * 100
  const shiftPP      = cp.shift    * 100
  const absPP        = Math.abs(shiftPP).toFixed(1)
  const fmtPP        = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} pp`

  if (cp.metric === 'venta_neta') {
    const titulo = `${cp.entity} — participación en ventas cambió desde ${monthLabel}`
    const descripcion =
      `Sostuvo ~${sharePrePct.toFixed(1)}% de la venta del grupo durante ${cp.monthsStable} meses ` +
      `y desde ${monthLabel} pasó a ~${sharePostPct.toFixed(1)}% (${fmtPP(shiftPP)}).`
    const conclusion = cp.direction === 'down'
      ? `Una pérdida sostenida de ${absPP} pp en participación de ventas indica que otras entidades están capturando el espacio que antes tenía — revisar competitividad desde ${monthLabel}.`
      : `Una ganancia sostenida de ${shiftPP.toFixed(1)} pp en participación de ventas indica que esta entidad está creciendo más que el grupo — identificar qué lo está impulsando para replicarlo.`
    const accionTexto =
      `Comparar el mix de productos, clientes o canales antes y después de ${monthLabel} ` +
      `para identificar la causa del desplazamiento.`
    return { titulo, descripcion, conclusion, accionTexto }
  }

  // metric === 'unidades'
  const titulo = `${cp.entity} — participación en unidades cambió desde ${monthLabel}`
  const descripcion =
    `Sostuvo ~${sharePrePct.toFixed(1)}% de las unidades del grupo durante ${cp.monthsStable} meses ` +
    `y desde ${monthLabel} pasó a ~${sharePostPct.toFixed(1)}% (${fmtPP(shiftPP)}).`
  const conclusion = cp.direction === 'down'
    ? `Una caída sostenida de ${absPP} pp en participación de unidades sugiere pérdida de volumen relativo — revisar surtido, disponibilidad o actividad comercial desde ${monthLabel}.`
    : `Una ganancia sostenida de ${shiftPP.toFixed(1)} pp en participación de unidades indica mayor volumen relativo — validar si responde a una acción comercial o cambio de cartera.`
  const accionTexto =
    `Revisar qué cambió en ${monthLabel}: nuevos productos incorporados, cambios en la fuerza de ventas ` +
    `o variaciones en la demanda del segmento.`
  return { titulo, descripcion, conclusion, accionTexto }
}

// ─── Export principal ───────────────────────────────────────────────────────

export function buildSteadyShareBlocks(
  sales: SaleRecord[],
): { candidates: InsightCandidate[]; telemetry: SsTelemetry } {
  const telemetry: SsTelemetry = {
    cells_evaluated:  0,
    series_with_data: 0,
    candidates_found: 0,
    blocks_returned:  0,
  }
  const candidates: InsightCandidate[] = []
  if (!sales || sales.length === 0) return { candidates, telemetry }

  try {
    for (const metric of SS_METRICS) {
      const dims = SS_DIM_CONFIG[metric]
      for (const dim of dims) {
        telemetry.cells_evaluated++
        const seriesByEntity = _buildShareSeriesByEntity(sales, dim, metric)
        for (const [entity, serie] of seriesByEntity) {
          if (serie.shares.length < SS_MIN_MONTHS) continue
          telemetry.series_with_data++
          const cp = _detectSteadyShareShift(entity, serie, metric, dim)
          if (!cp) continue
          telemetry.candidates_found++

          const absPP    = Math.abs(cp.shift * 100)
          const severity = _severityFromPP(absPP)
          const { titulo, descripcion, conclusion, accionTexto } = _buildNarrative(cp)
          // score normalizado a [0,1] — cambio relativo grande ≈ 1.0.
          const score = Math.min(1, cp.score / 2)

          candidates.push({
            metricId:      metric,
            dimensionId:   dim,
            insightTypeId: 'steady_share',
            member:        entity,
            score,
            severity,
            title:         titulo,
            description:   descripcion,
            detail: {
              member:        entity,
              metric,
              dim,
              k:             cp.k,
              meanPre:       cp.meanPre,
              meanPost:      cp.meanPost,
              cvPre:         cp.cvPre,
              shift:         cp.shift,
              shiftPP:       cp.shift * 100,
              direction:     cp.direction,
              breakMonth:    cp.breakMonth,
              monthsStable:  cp.monthsStable,
              monthsPost:    cp.monthsPost,
              n:             cp.n,
              source:        '[PR-M9] steady_share',
            },
            conclusion,
            accion: {
              texto:        accionTexto,
              entidades:    [entity],
              respaldo:     `shift=${(cp.shift * 100).toFixed(1)}pp, cv_pre=${cp.cvPre.toFixed(2)}, k=${cp.k}/${cp.n}`,
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
  console.log('[PR-M9] steady_share_builder', {
    cells_evaluated:  telemetry.cells_evaluated,
    series_with_data: telemetry.series_with_data,
    candidates_found: telemetry.candidates_found,
    blocks_returned:  telemetry.blocks_returned,
  })
  return { candidates, telemetry }
}
