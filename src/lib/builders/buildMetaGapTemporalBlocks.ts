// [PR-M11] Meta Gap Temporal — tendencia de cumplimiento de meta por vendedor.
//
// Detecta dos patrones complementarios:
//   A) Declive consecutivo: ≥3 meses de cumpl_pct estrictamente decreciente.
//   B) Brecha estructural:  ≥4 meses con gap ≥15 pp respecto al promedio del equipo.
//
// 100% temporal, 100% derivado de datos existentes. Sin IA, sin probabilidad.
// impactoUSD = 0 — señal de tendencia, no monetaria. Rutea por EVENT_TYPES_EXEMPT.

import type { SaleRecord, MetaRecord } from '../../types'
import type { InsightCandidate } from '../insight-engine'

// ─── Configuración ──────────────────────────────────────────────────────────

const MGT_MIN_MONTHS     = 3
const MGT_DECLINING_N    = 3
const MGT_STRUCTURAL_N   = 4
const MGT_STRUCTURAL_GAP = 15
const MGT_CRITICAL_PCT   = 50
const MGT_HIGH_PCT       = 70

// ─── Telemetría ─────────────────────────────────────────────────────────────

interface MgtTelemetry {
  vendedores_con_meta: number
  declining_found:     number
  structural_found:    number
  candidates_found:    number
  blocks_returned:     number
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const MESES_ES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
]

function _toDate(f: unknown): Date {
  return f instanceof Date ? f : new Date(f as string)
}

function _ym(anio: number, mes: number): string {
  return `${anio}-${String(mes).padStart(2, '0')}`
}

function _ymLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m || m < 1 || m > 12) return ym
  return `${MESES_ES[m - 1]} ${y}`
}

function _meanNum(vals: number[]): number {
  if (vals.length === 0) return 0
  return vals.reduce((s, v) => s + v, 0) / vals.length
}

function _metaValue(m: MetaRecord, tipoMetaActivo: string): number {
  if (tipoMetaActivo === 'uds') return m.meta_uds ?? m.meta ?? 0
  return m.meta_usd ?? 0
}

function _ventaValue(r: SaleRecord, tipoMetaActivo: string): number {
  return tipoMetaActivo === 'uds' ? (r.unidades ?? 0) : (r.venta_neta ?? 0)
}

interface MgtPoint { ym: string; cumplPct: number; vendido: number; metaVal: number }

// ─── Detector ───────────────────────────────────────────────────────────────

interface MgtDeclining {
  pattern:         'declining'
  monthsDeclining: number
  cumplActual:     number
  cumplInicio:     number
  serieTail:       MgtPoint[]
  score:           number
}

interface MgtStructural {
  pattern:                'structural'
  monthsBelow:            number
  meanGap:                number
  cumplPromedioVendedor:  number
  cumplPromedioEquipo:    number
  cumplActual:            number
  serieTail:              MgtPoint[]
  score:                  number
}

type MgtPattern = MgtDeclining | MgtStructural

function _detectDeclining(serie: MgtPoint[]): MgtDeclining | null {
  const n = serie.length
  if (n < MGT_DECLINING_N) return null
  // Verifica que los últimos MGT_DECLINING_N sean estrictamente decrecientes.
  for (let i = n - MGT_DECLINING_N + 1; i < n; i++) {
    if (!(serie[i].cumplPct < serie[i - 1].cumplPct)) return null
  }
  // Extender hacia atrás mientras el patrón se mantenga.
  let start = n - MGT_DECLINING_N
  while (start - 1 >= 0 && serie[start].cumplPct < serie[start - 1].cumplPct) {
    start--
  }
  const monthsDeclining = n - start
  const cumplInicio     = serie[start].cumplPct
  const cumplActual     = serie[n - 1].cumplPct
  const drop            = cumplInicio - cumplActual
  if (drop <= 0) return null
  const score = Math.max(0, Math.min(1, drop / 100))
  return {
    pattern: 'declining',
    monthsDeclining,
    cumplActual,
    cumplInicio,
    serieTail: serie.slice(start),
    score,
  }
}

function _detectStructural(
  serie: MgtPoint[],
  promedioEquipo: Map<string, number>,
): MgtStructural | null {
  const n = serie.length
  if (n < MGT_STRUCTURAL_N) return null
  const tail = serie.slice(n - MGT_STRUCTURAL_N)
  const gaps: number[] = []
  for (const p of tail) {
    const teamMean = promedioEquipo.get(p.ym)
    if (teamMean == null) return null
    const gap = teamMean - p.cumplPct
    if (gap < MGT_STRUCTURAL_GAP) return null
    gaps.push(gap)
  }
  const meanGap              = _meanNum(gaps)
  const cumplPromedioVend    = _meanNum(tail.map(p => p.cumplPct))
  const cumplPromedioEquipo  = _meanNum(tail.map(p => promedioEquipo.get(p.ym) ?? 0))
  const cumplActual          = serie[n - 1].cumplPct
  const score                = Math.max(0, Math.min(1, meanGap / 100))
  return {
    pattern: 'structural',
    monthsBelow:           MGT_STRUCTURAL_N,
    meanGap,
    cumplPromedioVendedor: cumplPromedioVend,
    cumplPromedioEquipo:   cumplPromedioEquipo,
    cumplActual,
    serieTail: tail,
    score,
  }
}

// ─── Narrativa ──────────────────────────────────────────────────────────────

function _severityFromCumpl(pct: number): 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA' {
  if (pct < MGT_CRITICAL_PCT) return 'CRITICA'
  if (pct < MGT_HIGH_PCT)     return 'ALTA'
  return 'MEDIA'
}

function _buildNarrative(
  vendedor: string,
  pattern:  MgtPattern,
): { titulo: string; descripcion: string; conclusion: string; accionTexto: string } {
  if (pattern.pattern === 'declining') {
    const tail = pattern.serieTail.slice(-4)
    const cadena = tail.map(p => `${p.cumplPct.toFixed(0)}%`).join(' → ')
    const titulo = `${vendedor} — cumplimiento de meta en caída sostenida`
    const descripcion =
      `Lleva ${pattern.monthsDeclining} meses con cumplimiento decreciente: ${cadena}. ` +
      `Actualmente en ${pattern.cumplActual.toFixed(1)}% de meta.`
    let conclusion: string
    if (pattern.cumplActual < MGT_CRITICAL_PCT) {
      conclusion =
        `Un cumplimiento de ${pattern.cumplActual.toFixed(1)}% con tendencia bajista acumulada ` +
        `es una señal de riesgo alto — el vendedor puede cerrar el mes muy por debajo de lo planificado.`
    } else if (pattern.cumplActual < MGT_HIGH_PCT) {
      conclusion =
        `La tendencia bajista sostenida sugiere un problema que va más allá de la fluctuación normal — ` +
        `requiere atención esta semana.`
    } else {
      conclusion =
        `Aunque el cumplimiento aún se mantiene aceptable, la pendiente sostenida a la baja anticipa ` +
        `un deterioro si no se interviene.`
    }
    const accionTexto =
      `Revisar con ${vendedor} qué cambió en los últimos ${pattern.monthsDeclining} meses: ` +
      `cartera de clientes, mix de productos, o factores externos. Ajustar el plan de cierre si es necesario.`
    return { titulo, descripcion, conclusion, accionTexto }
  }

  // structural
  const titulo = `${vendedor} — por debajo del promedio del equipo durante ${MGT_STRUCTURAL_N}+ meses`
  const descripcion =
    `En los últimos ${pattern.monthsBelow} meses, ${vendedor} ha estado ${pattern.meanGap.toFixed(0)} ` +
    `puntos porcentuales por debajo del promedio del equipo ` +
    `(${pattern.cumplPromedioVendedor.toFixed(0)}% vs ${pattern.cumplPromedioEquipo.toFixed(0)}% del equipo).`
  const conclusion =
    `Una brecha estructural sostenida de ${pattern.meanGap.toFixed(0)} pp respecto al equipo sugiere ` +
    `que el problema es de fondo — no es solo un mes difícil.`
  const accionTexto =
    `Comparar la cartera, el territorio y las condiciones de ${vendedor} con los vendedores de mejor ` +
    `desempeño. Identificar si la brecha es de habilidad, de cartera o de oportunidad de mercado.`
  return { titulo, descripcion, conclusion, accionTexto }
}

// ─── Export principal ───────────────────────────────────────────────────────

export function buildMetaGapTemporalBlocks(params: {
  sales:          SaleRecord[]
  metas:          MetaRecord[]
  tipoMetaActivo: string
  selectedPeriod: { year: number; month: number }
}): { candidates: InsightCandidate[]; telemetry: MgtTelemetry } {
  const telemetry: MgtTelemetry = {
    vendedores_con_meta: 0,
    declining_found:     0,
    structural_found:    0,
    candidates_found:    0,
    blocks_returned:     0,
  }
  const candidates: InsightCandidate[] = []

  const { sales, metas, tipoMetaActivo, selectedPeriod } = params
  if (!metas || metas.length === 0) return { candidates, telemetry }
  if (!sales || sales.length === 0) return { candidates, telemetry }
  // [PR-M11 fix] cutoff = mes seleccionado (selectedPeriod.month es 0-indexed,
  // MetaRecord.mes es 1-indexed). Excluye meses futuros donde vendido=0 ensucia
  // la serie con una racha artificial de 0% que rompe la condición de declive.
  const ymCutoff = _ym(selectedPeriod.year, selectedPeriod.month + 1)

  try {
    // 1. Pre-bucket de ventas por vendedor × ym (uds o usd según tipo).
    const ventasByVendYm = new Map<string, Map<string, number>>()
    for (const r of sales) {
      const v = r.vendedor
      if (!v) continue
      const d = _toDate(r.fecha)
      const ym = _ym(d.getFullYear(), d.getMonth() + 1)
      let m = ventasByVendYm.get(v)
      if (!m) { m = new Map(); ventasByVendYm.set(v, m) }
      m.set(ym, (m.get(ym) ?? 0) + _ventaValue(r, tipoMetaActivo))
    }

    // 2. Construir series de cumplimiento por vendedor + matriz mes→[cumpls]
    const seriesByVend = new Map<string, MgtPoint[]>()
    const cumplsPorMes = new Map<string, number[]>()

    // Agrupar metas por vendedor para mantener orden cronológico.
    const metasByVend = new Map<string, MetaRecord[]>()
    for (const m of metas) {
      const v = m.vendedor
      if (!v) continue
      if (!metasByVend.has(v)) metasByVend.set(v, [])
      metasByVend.get(v)!.push(m)
    }

    for (const [vendedor, metasVend] of metasByVend) {
      // Dedup por ym (puede haber múltiples filas de meta por mes/vendedor — sumar).
      const metaPorYm = new Map<string, number>()
      for (const m of metasVend) {
        if (!m.anio || !m.mes || m.mes < 1 || m.mes > 12) continue
        const ym = _ym(m.anio, m.mes)
        if (ym > ymCutoff) continue   // [PR-M11 fix] skip meses futuros sin ventas
        const val = _metaValue(m, tipoMetaActivo)
        if (!isFinite(val)) continue
        metaPorYm.set(ym, (metaPorYm.get(ym) ?? 0) + val)
      }
      const ventasVend = ventasByVendYm.get(vendedor) ?? new Map<string, number>()
      const serie: MgtPoint[] = []
      for (const [ym, metaVal] of metaPorYm) {
        if (metaVal <= 0) continue
        const vendido  = ventasVend.get(ym) ?? 0
        const cumplPct = (vendido / metaVal) * 100
        serie.push({ ym, cumplPct, vendido, metaVal })
      }
      serie.sort((a, b) => a.ym.localeCompare(b.ym))
      if (serie.length < MGT_MIN_MONTHS) continue
      seriesByVend.set(vendedor, serie)
      for (const p of serie) {
        if (!cumplsPorMes.has(p.ym)) cumplsPorMes.set(p.ym, [])
        cumplsPorMes.get(p.ym)!.push(p.cumplPct)
      }
    }

    telemetry.vendedores_con_meta = seriesByVend.size

    // 3. Promedio del equipo por ym
    const promedioEquipo = new Map<string, number>()
    for (const [ym, vals] of cumplsPorMes) {
      promedioEquipo.set(ym, _meanNum(vals))
    }

    // 4. Detectar patrones por vendedor
    for (const [vendedor, serie] of seriesByVend) {
      const declining  = _detectDeclining(serie)
      const structural = _detectStructural(serie, promedioEquipo)
      if (declining)  telemetry.declining_found++
      if (structural) telemetry.structural_found++
      let chosen: MgtPattern | null = null
      if (declining && structural) {
        chosen = declining.score >= structural.score ? declining : structural
      } else {
        chosen = declining ?? structural
      }
      if (!chosen) continue
      telemetry.candidates_found++

      const narr = _buildNarrative(vendedor, chosen)
      const cumplActual = chosen.cumplActual
      const severity    = _severityFromCumpl(cumplActual)
      const lastYm      = serie[serie.length - 1].ym

      candidates.push({
        metricId:      'cumplimiento_meta',
        dimensionId:   'vendedor',
        insightTypeId: 'meta_gap_temporal',
        member:        vendedor,
        score:         chosen.score,
        severity,
        title:         narr.titulo,
        description:   narr.descripcion,
        detail: {
          member:       vendedor,
          metric:       'cumplimiento_meta',
          dim:          'vendedor',
          pattern:      chosen.pattern,
          cumplActual,
          lastYm,
          lastYmLabel:  _ymLabel(lastYm),
          serieTail:    chosen.serieTail.map(p => ({
            ym:       p.ym,
            cumplPct: Math.round(p.cumplPct * 10) / 10,
            vendido:  p.vendido,
            metaVal:  p.metaVal,
          })),
          impactoUSD:   0,
          ...(chosen.pattern === 'declining'
            ? {
                monthsDeclining: chosen.monthsDeclining,
                cumplInicio:     chosen.cumplInicio,
              }
            : {
                monthsBelow:           chosen.monthsBelow,
                meanGap:               chosen.meanGap,
                cumplPromedioVendedor: chosen.cumplPromedioVendedor,
                cumplPromedioEquipo:   chosen.cumplPromedioEquipo,
              }),
          source: '[PR-M11] meta_gap_temporal',
        },
        conclusion: narr.conclusion,
        accion: {
          texto:        narr.accionTexto,
          entidades:    [vendedor],
          respaldo:     chosen.pattern === 'declining'
            ? `n=${chosen.monthsDeclining} meses bajando, cumpl=${cumplActual.toFixed(1)}%`
            : `gap_medio=${chosen.meanGap.toFixed(1)}pp, n=${chosen.monthsBelow} meses`,
          ejecutableEn: severity === 'CRITICA' ? 'inmediato' : 'esta_semana',
        },
      })
    }
  } catch {
    // degradación silenciosa (never throws)
  }

  telemetry.blocks_returned = candidates.length
  return { candidates, telemetry }
}
