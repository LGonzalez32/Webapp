/**
 * insight-engine.coverage.test.ts — Cobertura de tipos sin snapshot en
 * goldens existentes (Z.11.M-5).
 *
 * El golden master `insight-engine.golden.test.ts` corre sobre Los Pinos
 * demo. Esos datos no disparan 6 tipos del motor 2: dominance,
 * proportion_shift, correlation, change_point, steady_share, seasonality.
 * Este archivo agrega fixtures sintéticos minimales que disparan cada uno
 * y dejan un snapshot estructural.
 *
 * Granularidad: presencia + magnitudes redondeadas. NO se inspecciona
 * narrativa (title/description/accion) — eso cambia con tweaks de copy.
 *
 * Si un test rompe inesperadamente:
 *   1. Confirmá que la fórmula del detector no cambió.
 *   2. Si el cambio es intencional, correr `npx vitest -u` y justificar
 *      el diff en el commit.
 */

import { describe, it, expect } from 'vitest'
import { INSIGHT_TYPE_REGISTRY, type DataPoint, type DetectResult } from '../insight-registry'
import { buildChangePointBlocks } from '../builders/buildChangePointBlocks'
import { buildSteadyShareBlocks } from '../builders/buildSteadyShareBlocks'
import type { SaleRecord } from '../../types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const round = (n: number | null | undefined, dp = 4): number | null => {
  if (n == null || !Number.isFinite(n)) return null
  const f = 10 ** dp
  return Math.round((n as number) * f) / f
}

function detect(typeId: string, points: DataPoint[]): DetectResult | null {
  const def = INSIGHT_TYPE_REGISTRY.find(t => t.id === typeId)
  if (!def) throw new Error(`Insight type '${typeId}' not in INSIGHT_TYPE_REGISTRY`)
  return def.detect(points)
}

// Helper: construye SaleRecord minimal con defaults razonables
function sale(overrides: Partial<SaleRecord> & { fecha: Date; venta_neta?: number; unidades?: number }): SaleRecord {
  return {
    vendedor: 'V1',
    unidades: 1,
    venta_neta: 100,
    producto: 'P1',
    cliente: 'C1',
    categoria: 'Cat1',
    canal: 'Mayoreo',
    departamento: 'Dep1',
    supervisor: 'S1',
    ...overrides,
  }
}

// ─── 1. dominance ─────────────────────────────────────────────────────────────
//
// Detector requiere ≥3 puntos donde el top 20% concentre ≥60% del total.
// Fixture: 5 puntos, top-1 con 80% de share.

describe('dominance — concentration Pareto', () => {
  it('dispara cuando top-N concentra ≥60% del total', () => {
    const points: DataPoint[] = [
      { member: 'A', value: 800 },
      { member: 'B', value: 50 },
      { member: 'C', value: 50 },
      { member: 'D', value: 50 },
      { member: 'E', value: 50 },
    ]
    const r = detect('dominance', points)
    expect(r?.found).toBe(true)
    expect({
      type: 'dominance',
      score: round(r?.score ?? null),
      pctShare: round(r?.detail.pctShare as number),
      topMembers: r?.detail.topMembers,
      totalMembers: r?.detail.totalMembers,
    }).toMatchSnapshot()
  })

  it('NO dispara cuando concentración < 60%', () => {
    const points: DataPoint[] = [
      { member: 'A', value: 220 },
      { member: 'B', value: 200 },
      { member: 'C', value: 200 },
      { member: 'D', value: 200 },
      { member: 'E', value: 180 },
    ]
    const r = detect('dominance', points)
    expect(r).toBeNull()
  })
})

// ─── 2. proportion_shift ──────────────────────────────────────────────────────
//
// Detector requiere ≥2 puntos con prevValue, shift de share ≥5pp entre
// períodos. Fixture: A pasa de 50% a 70%, B de 50% a 30%.

describe('proportion_shift — cambio de participación', () => {
  it('dispara cuando shift ≥ 5pp', () => {
    const points: DataPoint[] = [
      { member: 'A', value: 700, prevValue: 500 },  // 70% ← 50%, +20pp
      { member: 'B', value: 300, prevValue: 500 },  // 30% ← 50%, -20pp
    ]
    const r = detect('proportion_shift', points)
    expect(r?.found).toBe(true)
    expect({
      type: 'proportion_shift',
      score: round(r?.score ?? null),
      member: r?.detail.member,
      shiftPct: round(r?.detail.shiftPct as number),
      prevShare: round(r?.detail.prevShare as number),
      currentShare: round(r?.detail.currentShare as number),
    }).toMatchSnapshot()
  })

  it('NO dispara cuando shift < 5pp', () => {
    const points: DataPoint[] = [
      { member: 'A', value: 510, prevValue: 500 },
      { member: 'B', value: 490, prevValue: 500 },
    ]
    const r = detect('proportion_shift', points)
    expect(r).toBeNull()
  })
})

// ─── 3. correlation ───────────────────────────────────────────────────────────
//
// Detector requiere ≥4 puntos con value2 poblado, |r| ≥ 0.7.
// Fixture: 4 puntos con correlación lineal perfecta (r=1).

describe('correlation — entre métricas', () => {
  it('dispara con correlación positiva fuerte (r ≥ 0.7)', () => {
    const points: DataPoint[] = [
      { member: 'A', value: 100, value2: 10 },
      { member: 'B', value: 200, value2: 20 },
      { member: 'C', value: 300, value2: 30 },
      { member: 'D', value: 400, value2: 40 },
    ]
    const r = detect('correlation', points)
    expect(r?.found).toBe(true)
    expect({
      type: 'correlation',
      score: round(r?.score ?? null),
      r: round(r?.detail.r as number),
      direction: r?.detail.direction,
      n: r?.detail.n,
    }).toMatchSnapshot()
  })

  it('dispara con correlación negativa fuerte', () => {
    const points: DataPoint[] = [
      { member: 'A', value: 100, value2: 40 },
      { member: 'B', value: 200, value2: 30 },
      { member: 'C', value: 300, value2: 20 },
      { member: 'D', value: 400, value2: 10 },
    ]
    const r = detect('correlation', points)
    expect(r?.found).toBe(true)
    expect(r?.detail.direction).toBe('negative')
  })

  it('NO dispara con datos no correlacionados', () => {
    const points: DataPoint[] = [
      { member: 'A', value: 100, value2: 30 },
      { member: 'B', value: 200, value2: 10 },
      { member: 'C', value: 300, value2: 50 },
      { member: 'D', value: 400, value2: 20 },
    ]
    const r = detect('correlation', points)
    expect(r).toBeNull()
  })
})

// ─── 4. change_point ──────────────────────────────────────────────────────────
//
// Builder requiere ≥6 meses con quiebre de régimen (z ≥ 1.5, rel_change ≥ 10%).
// Fixture: 12 meses con producto P1; meses 1-6 = 100/mes, meses 7-12 = 400/mes.
// Mean shift de 3x dispara el detector.

describe('change_point — quiebre de régimen', () => {
  it('dispara con mean shift sostenido en serie mensual', () => {
    const sales: SaleRecord[] = []
    for (let m = 0; m < 12; m++) {
      const venta = m < 6 ? 100 : 400
      sales.push(sale({
        fecha: new Date(2025, m, 15),
        producto: 'P1',
        venta_neta: venta,
        unidades: venta / 10,
      }))
    }

    const { candidates, telemetry } = buildChangePointBlocks(sales)
    const cps = candidates.filter(c => c.insightTypeId === 'change_point' && c.member === 'P1')
    expect(cps.length).toBeGreaterThan(0)
    expect({
      type: 'change_point',
      candidates_total: candidates.length,
      cells_evaluated: telemetry.cells_evaluated,
      series_with_data: telemetry.series_with_data,
      candidates_found: telemetry.candidates_found,
      first_candidate: cps[0] ? {
        metric: cps[0].metricId,
        dim: cps[0].dimensionId,
        member: cps[0].member,
        severity: cps[0].severity,
        score: round(cps[0].score),
      } : null,
    }).toMatchSnapshot()
  })

  it('NO dispara con serie estable', () => {
    const sales: SaleRecord[] = []
    for (let m = 0; m < 12; m++) {
      sales.push(sale({
        fecha: new Date(2025, m, 15),
        producto: 'P1',
        venta_neta: 100 + (m % 2) * 5, // ruido marginal
      }))
    }
    const { candidates } = buildChangePointBlocks(sales)
    const cps = candidates.filter(c => c.member === 'P1')
    expect(cps.length).toBe(0)
  })
})

// ─── 5. steady_share ──────────────────────────────────────────────────────────
//
// Builder detecta cambio sostenido de participación de un member en serie de
// shares mensuales. Fixture: 12 meses con 2 productos; share de P1 estable
// 30% en meses 1-6 y luego salta a 70% sostenido en 7-12.

describe('steady_share — cambio sostenido de participación', () => {
  it('dispara con shift estable de share entre regímenes', () => {
    const sales: SaleRecord[] = []
    for (let m = 0; m < 12; m++) {
      const p1Share = m < 6 ? 0.30 : 0.70
      const total = 1000
      sales.push(sale({
        fecha: new Date(2025, m, 15),
        producto: 'P1',
        venta_neta: total * p1Share,
      }))
      sales.push(sale({
        fecha: new Date(2025, m, 15),
        producto: 'P2',
        venta_neta: total * (1 - p1Share),
      }))
    }

    const { candidates, telemetry } = buildSteadyShareBlocks(sales)
    const ss = candidates.filter(c => c.insightTypeId === 'steady_share')
    expect(ss.length).toBeGreaterThan(0)
    expect({
      type: 'steady_share',
      candidates_total: candidates.length,
      cells_evaluated: telemetry.cells_evaluated,
      candidates_found: telemetry.candidates_found,
      first_candidate: ss[0] ? {
        metric: ss[0].metricId,
        dim: ss[0].dimensionId,
        member: ss[0].member,
        severity: ss[0].severity,
        score: round(ss[0].score),
      } : null,
    }).toMatchSnapshot()
  })

  it('NO dispara con shares estables sin shift', () => {
    const sales: SaleRecord[] = []
    for (let m = 0; m < 12; m++) {
      sales.push(sale({ fecha: new Date(2025, m, 15), producto: 'P1', venta_neta: 500 }))
      sales.push(sale({ fecha: new Date(2025, m, 15), producto: 'P2', venta_neta: 500 }))
    }
    const { candidates } = buildSteadyShareBlocks(sales)
    const ss = candidates.filter(c => c.insightTypeId === 'steady_share')
    expect(ss.length).toBe(0)
  })
})

// ─── 6. seasonality ───────────────────────────────────────────────────────────
//
// Detector requiere ≥12 meses, patrón cíclico anual con strength ≥ 0.60.
// Vive en cross-engine — su entrada es CrossEngineContext, no sales[].
// Para evitar boilerplate de construir Metric+Dimension+InsightType+Context,
// invocamos directamente al detector con shapes mínimos.
//
// Fixture: 24 meses con pico Q4 (oct-dic) cada año, valles en Q2.

describe('seasonality — patrón cíclico anual', () => {
  it('dispara con pico estacional sostenido entre años', async () => {
    // Importar lazy para evitar carga si tests anteriores fallan
    const { detectSeasonality } = await import('../detectors/seasonality')
    const { METRIC_REGISTRY } = await import('../crossEngine/metricRegistry')
    const { DIMENSION_REGISTRY_V2 } = await import('../crossEngine/dimensionRegistry')
    const { INSIGHT_TYPE_REGISTRY: ITR_V2 } = await import('../crossEngine/insightTypeRegistry')

    const ventaUsd = METRIC_REGISTRY.find(m => m.id === 'venta_usd')
    const dimProducto = DIMENSION_REGISTRY_V2.find(d => d.id === 'producto')
    const seasonalityType = ITR_V2.find(t => t.id === 'seasonality')

    if (!ventaUsd || !dimProducto || !seasonalityType) {
      throw new Error('Setup error: registries no exponen los entries esperados')
    }

    // 24 meses (2024-2025), un único producto P1 con patrón Q4-pico.
    // Q4 = oct(9), nov(10), dic(11) → 3x el baseline.
    const sales: SaleRecord[] = []
    for (let year = 2024; year <= 2025; year++) {
      for (let m = 0; m < 12; m++) {
        const isQ4 = m >= 9 && m <= 11
        const venta = isQ4 ? 1500 : 500
        sales.push(sale({
          fecha: new Date(year, m, 15),
          producto: 'P1',
          venta_neta: venta,
        }))
      }
    }

    const ctx = {
      sales,
      currentSales: sales.filter(s => s.fecha.getFullYear() === 2025 && s.fecha.getMonth() === 11),
      prevSales: sales.filter(s => s.fecha.getFullYear() === 2024 && s.fecha.getMonth() === 11),
      quotas: [],
      availability: {
        has_producto: true, has_cliente: true, has_venta_neta: true,
        has_categoria: true, has_canal: true, has_supervisor: true,
        has_departamento: true, has_metas: false, has_inventario: false,
        has_unidades: true, has_precio_unitario: true,
        has_subcategoria: false, has_proveedor: false, has_costo_unitario: false,
      },
      period: { year: 2025, month: 11 },
      tipoMetaActivo: 'usd' as const,
    }

    const cands = detectSeasonality(ventaUsd, dimProducto, seasonalityType, ctx)
    expect(cands.length).toBeGreaterThan(0)
    const c = cands[0]
    expect({
      type: 'seasonality',
      candidates: cands.length,
      first: {
        metric: c.metricId,
        dim: c.dimensionId,
        member: c.member,
        insightTypeId: c.insightTypeId,
        severity: c.severity,
        score: round(c.score),
      },
    }).toMatchSnapshot()
  })
})
