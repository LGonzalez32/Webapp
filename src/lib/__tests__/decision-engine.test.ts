/**
 * decision-engine.test.ts — invariant tests for the Motor de Decisión Ejecutiva.
 *
 * Cubre:
 *   - buildInsightChains no crea ciclos
 *   - buildInsightChains no conecta entidades sin intersección real (root_problem_key diferente)
 *   - buildExecutiveProblems no pierde el problema principal (top impacto aparece como root)
 *   - coveredCandidates es subconjunto estricto del pool
 *   - Pipeline no rompe cuando no hay metas / no hay venta_neta / no hay chain
 */

import { describe, it, expect } from 'vitest'
import {
  buildInsightChains,
  buildExecutiveProblems,
  buildRootProblemKey,
  sonInsightsRelacionables,
  type MaterialityContext,
} from '../decision-engine'
import type { InsightCandidate } from '../insight-engine'

// ── Helpers de fixture ────────────────────────────────────────────────────────

function makeCandidate(overrides: Partial<InsightCandidate>): InsightCandidate {
  return {
    metricId:      'venta',
    dimensionId:   'vendedor',
    insightTypeId: 'change_point',
    member:        'Vendedor Test',
    score:         0.5,
    severity:      'MEDIA',
    title:         'Cambio detectado',
    description:   'La venta cayó 15% respecto al período anterior.',
    detail:        {},
    // Z.9.2 defaults
    impacto_valor:       null,
    impacto_pct:         null,
    impacto_gap_meta:    null,
    impacto_recuperable: null,
    direction:           'neutral',
    time_scope:          'unknown',
    entity_path:         [],
    root_problem_key:    null,
    supporting_evidence: [],
    render_priority_score: 0,
    ...overrides,
  } as InsightCandidate
}

function makeDownVendedor(member: string, impacto: number): InsightCandidate {
  return makeCandidate({
    member,
    direction:           'down',
    time_scope:          'ytd',
    impacto_valor:       -impacto,
    impacto_pct:         -12,
    root_problem_key:    'down:vendedor:ytd',
    render_priority_score: impacto / 10_000,
    description: `${member} registró una caída de $${impacto.toLocaleString()} en YTD.`,
  })
}

// ── buildRootProblemKey ───────────────────────────────────────────────────────

describe('buildRootProblemKey', () => {
  it('genera clave con defaults cuando faltan campos', () => {
    const c = makeCandidate({})
    expect(buildRootProblemKey(c)).toBe('neutral:vendedor:unknown')
  })

  it('genera clave correcta con campos hidratados', () => {
    const c = makeCandidate({ direction: 'down', time_scope: 'ytd' })
    expect(buildRootProblemKey(c)).toBe('down:vendedor:ytd')
  })
})

// ── sonInsightsRelacionables ──────────────────────────────────────────────────

describe('sonInsightsRelacionables', () => {
  it('retorna false para el mismo objeto', () => {
    const c = makeCandidate({ root_problem_key: 'down:vendedor:ytd' })
    expect(sonInsightsRelacionables(c, c)).toBe(false)
  })

  it('retorna true si comparten root_problem_key', () => {
    const a = makeCandidate({ root_problem_key: 'down:vendedor:ytd' })
    const b = makeCandidate({ root_problem_key: 'down:vendedor:ytd', member: 'Otro' })
    expect(sonInsightsRelacionables(a, b)).toBe(true)
  })

  it('retorna true por dirección + métrica aunque no compartan key', () => {
    const a = makeCandidate({ direction: 'down', metricId: 'venta', root_problem_key: null })
    const b = makeCandidate({ direction: 'down', metricId: 'venta', root_problem_key: null, member: 'Otro' })
    expect(sonInsightsRelacionables(a, b)).toBe(true)
  })

  it('retorna false si difieren en dirección y key', () => {
    const a = makeCandidate({ direction: 'down', root_problem_key: 'down:vendedor:ytd' })
    const b = makeCandidate({ direction: 'up',   root_problem_key: 'up:vendedor:ytd', member: 'Otro' })
    expect(sonInsightsRelacionables(a, b)).toBe(false)
  })
})

// ── buildInsightChains ────────────────────────────────────────────────────────

describe('buildInsightChains', () => {
  it('retorna [] con input vacío', () => {
    expect(buildInsightChains([])).toEqual([])
  })

  it('no forma chain con un solo candidato en el grupo (sin allowSingletons)', () => {
    const single = [makeDownVendedor('Solo', 5_000)]
    expect(buildInsightChains(single)).toHaveLength(0)
  })

  it('forma chain de 1 nodo con un solo candidato cuando allowSingletons=true', () => {
    const single = [makeDownVendedor('Solo', 5_000)]
    const chains = buildInsightChains(single, { allowSingletons: true })
    expect(chains).toHaveLength(1)
    expect(chains[0].nodes).toHaveLength(1)
    expect(chains[0].depth).toBe(1)
  })

  it('forma chain cuando hay ≥ 2 candidatos con la misma root_problem_key', () => {
    const candidates = [
      makeDownVendedor('Ana',   20_000),
      makeDownVendedor('Bruno', 10_000),
    ]
    const chains = buildInsightChains(candidates)
    expect(chains.length).toBeGreaterThanOrEqual(1)
  })

  it('no conecta candidatos con root_problem_key diferentes', () => {
    const candidates = [
      makeCandidate({ member: 'A', root_problem_key: 'down:vendedor:ytd', direction: 'down' }),
      makeCandidate({ member: 'B', root_problem_key: 'up:producto:mtd',   direction: 'up' }),
    ]
    const chains = buildInsightChains(candidates)
    // Dos keys distintas → grupos separados de 1 → ninguna chain
    expect(chains).toHaveLength(0)
  })

  it('no produce ciclos con candidatos que se referenciarían mutuamente', () => {
    // Tres candidatos en el mismo grupo — el BFS con `added` previene ciclos
    const candidates = [
      makeDownVendedor('Ana',   30_000),
      makeDownVendedor('Bruno', 20_000),
      makeDownVendedor('Carlos', 10_000),
    ]
    const chains = buildInsightChains(candidates)
    // Verificar que ningún candidateId aparece más de una vez en los nodos de una chain
    for (const chain of chains) {
      const seen = new Set<string>()
      for (const node of chain.nodes) {
        expect(seen.has(node.candidateId)).toBe(false)
        seen.add(node.candidateId)
      }
    }
  })

  it('respeta MAX_CANDIDATES_PER_CHAIN — no incluye más de 8 nodos por chain', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      makeDownVendedor(`Vendedor${i}`, (12 - i) * 1_000),
    )
    const chains = buildInsightChains(many)
    for (const chain of chains) {
      expect(chain.nodes.length).toBeLessThanOrEqual(8)
    }
  })
})

// ── buildExecutiveProblems ────────────────────────────────────────────────────

describe('buildExecutiveProblems', () => {
  it('retorna [] con chains vacías', () => {
    expect(buildExecutiveProblems([])).toEqual([])
  })

  it('el problema con mayor impacto aparece como el primero', () => {
    const bigGroup = [
      makeDownVendedor('Ana',   50_000),
      makeDownVendedor('Bruno', 40_000),
    ]
    const smallGroup = [
      makeCandidate({ member: 'X', root_problem_key: 'down:producto:mtd', direction: 'down', time_scope: 'mtd', impacto_valor: -1_000 }),
      makeCandidate({ member: 'Y', root_problem_key: 'down:producto:mtd', direction: 'down', time_scope: 'mtd', impacto_valor:   -500 }),
    ]
    const chains = buildInsightChains([...bigGroup, ...smallGroup])
    const problems = buildExecutiveProblems(chains, [...bigGroup, ...smallGroup])
    expect(problems.length).toBeGreaterThanOrEqual(1)
    // El de mayor score/impacto debe estar primero
    if (problems.length > 1) {
      expect(problems[0].renderPriorityScore).toBeGreaterThanOrEqual(problems[1].renderPriorityScore)
    }
  })

  it('coveredCandidates es subconjunto estricto del pool de candidatos', () => {
    const pool = [
      makeDownVendedor('Ana',   20_000),
      makeDownVendedor('Bruno', 15_000),
    ]
    const poolIds = new Set(pool.map(c =>
      `${c.insightTypeId}:${c.dimensionId}:${c.member ?? '_global'}`,
    ))
    const chains   = buildInsightChains(pool)
    const problems = buildExecutiveProblems(chains, pool)
    for (const p of problems) {
      for (const cid of p.coveredCandidates) {
        expect(poolIds.has(cid)).toBe(true)
      }
    }
  })

  it('no rompe cuando impacto_valor es null en todos los candidatos', () => {
    const candidates = [
      makeCandidate({ member: 'A', root_problem_key: 'down:vendedor:ytd', direction: 'down', impacto_valor: null }),
      makeCandidate({ member: 'B', root_problem_key: 'down:vendedor:ytd', direction: 'down', impacto_valor: null }),
    ]
    const chains = buildInsightChains(candidates)
    expect(() => buildExecutiveProblems(chains, candidates)).not.toThrow()
    const problems = buildExecutiveProblems(chains, candidates)
    if (problems.length > 0) {
      expect(problems[0].totalImpactUSD).toBeNull()
    }
  })

  it('no rompe cuando candidatePool está ausente (sin metas / sin venta_neta)', () => {
    const candidates = [
      makeDownVendedor('Ana',   10_000),
      makeDownVendedor('Bruno',  8_000),
    ]
    const chains = buildInsightChains(candidates)
    expect(() => buildExecutiveProblems(chains)).not.toThrow()
    const problems = buildExecutiveProblems(chains)
    if (problems.length > 0) {
      expect(problems[0].primaryCause).toBeNull()
      expect(problems[0].supportingEvidence).toEqual([])
    }
  })

  it('retorna [] (sin romper) cuando no hay chains suficientes', () => {
    // Un solo candidato → no forma chain → no hay executive problems
    const single = [makeDownVendedor('Solo', 5_000)]
    const chains  = buildInsightChains(single)
    const problems = buildExecutiveProblems(chains, single)
    expect(problems).toEqual([])
  })

  it('primaryCause es la descripción del candidato raíz', () => {
    const pool = [
      makeDownVendedor('Ana',   20_000),   // mayor impacto → root
      makeDownVendedor('Bruno', 10_000),
    ]
    const chains   = buildInsightChains(pool)
    const problems = buildExecutiveProblems(chains, pool)
    if (problems.length > 0 && problems[0].primaryCause != null) {
      expect(problems[0].primaryCause).toContain('Ana')
    }
  })

  it('secondaryCauses tiene como máximo 2 elementos', () => {
    const pool = Array.from({ length: 5 }, (_, i) =>
      makeDownVendedor(`V${i}`, (5 - i) * 5_000),
    )
    const chains   = buildInsightChains(pool)
    const problems = buildExecutiveProblems(chains, pool)
    for (const p of problems) {
      expect(p.secondaryCauses.length).toBeLessThanOrEqual(2)
    }
  })

  it('supportingEvidence tiene como máximo 3 elementos', () => {
    const pool = Array.from({ length: 6 }, (_, i) =>
      makeDownVendedor(`V${i}`, (6 - i) * 4_000),
    )
    const chains   = buildInsightChains(pool)
    const problems = buildExecutiveProblems(chains, pool)
    for (const p of problems) {
      expect(p.supportingEvidence.length).toBeLessThanOrEqual(3)
    }
  })

  it('[R147] problemDirection es "mejora" para candidatos con direction:up', () => {
    const pool = [
      makeCandidate({ member: 'A', direction: 'up', time_scope: 'ytd', impacto_valor: 15_000,
        root_problem_key: 'up:vendedor:ytd', render_priority_score: 1.5,
        description: 'Alza de $15,000 en YTD.' }),
      makeCandidate({ member: 'B', direction: 'up', time_scope: 'ytd', impacto_valor: 8_000,
        root_problem_key: 'up:vendedor:ytd', render_priority_score: 0.8,
        description: 'Alza de $8,000 en YTD.' }),
    ]
    const chains   = buildInsightChains(pool)
    const problems = buildExecutiveProblems(chains, pool)
    expect(problems.length).toBeGreaterThanOrEqual(1)
    expect(problems[0].problemDirection).toBe('mejora')
  })

  it('[R147] supportingEvidence idéntica a primaryCause es filtrada', () => {
    const sharedText = 'La venta cayó 15% respecto al período anterior.'
    const pool = [
      makeCandidate({ member: 'A', direction: 'down', time_scope: 'ytd', impacto_valor: -20_000,
        root_problem_key: 'down:vendedor:ytd', render_priority_score: 2.0,
        description: sharedText,
        supporting_evidence: [sharedText, 'Otro dato relevante distinto.'] }),
      makeCandidate({ member: 'B', direction: 'down', time_scope: 'ytd', impacto_valor: -10_000,
        root_problem_key: 'down:vendedor:ytd', render_priority_score: 1.0,
        description: 'B cayó en clientes clave.', supporting_evidence: [] }),
    ]
    const chains   = buildInsightChains(pool)
    const problems = buildExecutiveProblems(chains, pool)
    expect(problems.length).toBeGreaterThanOrEqual(1)
    const p = problems[0]
    if (p.primaryCause) {
      for (const ev of p.supportingEvidence) {
        expect(ev).not.toBe(p.primaryCause)
      }
    }
  })

  it('[R148] problema sub-material (<2%) se filtra cuando se pasa materialityCtx', () => {
    // impacto $133 vs base $155k = 0.086% → below_floor → debe ser filtrado
    const pool = [
      makeCandidate({ member: 'A', direction: 'down', time_scope: 'ytd', impacto_valor: -100,
        root_problem_key: 'down:vendedor:ytd', render_priority_score: 0.3,
        score: 0.3, description: 'Caída menor detectada.' }),
      makeCandidate({ member: 'B', direction: 'down', time_scope: 'ytd', impacto_valor: -33,
        root_problem_key: 'down:vendedor:ytd', render_priority_score: 0.2,
        score: 0.2, description: 'Reducción pequeña.' }),
    ]
    const ctx: MaterialityContext = {
      salesLYSamePeriod:  155_000,
      salesCurrentPeriod: 140_000,
      salesYTDCurrent:    155_000,
      metaPeriodo:        null,
      periodLabel:        'Abr 2026 vs Abr 2025',
    }
    const chains   = buildInsightChains(pool)
    const problems = buildExecutiveProblems(chains, pool, ctx)
    // ratio = 100/155000 ≈ 0.06% < 2% → below_floor → filtrado (score 0.3 < 0.85)
    expect(problems).toHaveLength(0)
  })

  // [R149] statistical_anomaly sola ya NO salva un below_floor (STATISTICAL_ANOMALY_REQUIRES_COMPANION)
  it('[R149-A] statistical_anomaly sola NO califica como ejecutivo', () => {
    const pool = [
      makeCandidate({ member: 'A', direction: 'down', time_scope: 'ytd', impacto_valor: -100,
        root_problem_key: 'down:vendedor:ytd', render_priority_score: 0.9,
        score: 0.9, description: 'Anomalía puntual detectada.' }),
      makeCandidate({ member: 'B', direction: 'down', time_scope: 'ytd', impacto_valor: -33,
        root_problem_key: 'down:vendedor:ytd', render_priority_score: 0.85,
        score: 0.85, description: 'Señal estadística alta.' }),
    ]
    const ctx: MaterialityContext = {
      salesLYSamePeriod:  155_000, salesCurrentPeriod: null,
      salesYTDCurrent: null, metaPeriodo: null, periodLabel: 'Abr 2026 vs Abr 2025',
    }
    const chains   = buildInsightChains(pool)
    const problems = buildExecutiveProblems(chains, pool, ctx)
    // below_floor + solo statistical_anomaly → filtrado (STATISTICAL_ANOMALY_REQUIRES_COMPANION)
    expect(problems).toHaveLength(0)
  })

  it('[R149-B] statistical_anomaly + material_magnitude sí pasa', () => {
    // score alto Y impacto material (>2% del período)
    const pool = [
      makeCandidate({ member: 'A', direction: 'down', time_scope: 'ytd', impacto_valor: -8_000,
        root_problem_key: 'down:vendedor:ytd', render_priority_score: 0.9,
        score: 0.9, description: 'Caída con señal estadística alta.' }),
      makeCandidate({ member: 'B', direction: 'down', time_scope: 'ytd', impacto_valor: -3_000,
        root_problem_key: 'down:vendedor:ytd', render_priority_score: 0.5,
        score: 0.5, description: 'Caída secundaria.' }),
    ]
    const ctx: MaterialityContext = {
      salesLYSamePeriod: 155_000, salesCurrentPeriod: null,
      salesYTDCurrent: null, metaPeriodo: null, periodLabel: 'Abr 2026 vs Abr 2025',
    }
    const chains   = buildInsightChains(pool)
    const problems = buildExecutiveProblems(chains, pool, ctx)
    expect(problems.length).toBeGreaterThanOrEqual(1)
    // ratio = 8000/155000 = 5.2% → material → material_magnitude
    expect(problems[0].relevanceReason).toContain('material_magnitude')
  })

  it('[R149-C] material_magnitude sola (sin anomalía) pasa el filtro', () => {
    const pool = [
      makeDownVendedor('Ana',   20_000),
      makeDownVendedor('Bruno', 10_000),
    ]
    const ctx: MaterialityContext = {
      salesLYSamePeriod: 100_000, salesCurrentPeriod: null,
      salesYTDCurrent: null, metaPeriodo: null, periodLabel: 'Abr 2026 vs Abr 2025',
    }
    const chains   = buildInsightChains(pool)
    const problems = buildExecutiveProblems(chains, pool, ctx)
    expect(problems.length).toBeGreaterThanOrEqual(1)
    expect(problems[0].relevanceReason).toContain('material_magnitude')
    expect(problems[0].materiality.bucket).not.toBe('below_floor')
  })

  it('[R149-E] Desabasto $25k con LY $149,902 sube como ejecutivo con bucket=high (allowSingletons)', () => {
    const pool = [
      makeCandidate({
        insightTypeId: 'stock_risk', dimensionId: 'producto', member: 'Producto X',
        direction: 'down', time_scope: 'rolling',
        impacto_valor: 25_182,
        root_problem_key: 'down:producto:rolling',
        render_priority_score: 0.8, score: 0.8,
        description: 'Desabasto inminente en 2 productos. Stock cubre menos de 7 días.',
      }),
    ]
    const ctx: MaterialityContext = {
      salesLYSamePeriod: 149_902, salesCurrentPeriod: null,
      salesYTDCurrent: null, metaPeriodo: null, periodLabel: 'Abr 2026 vs Abr 2025',
    }
    // Sin allowSingletons → no forma chain → no hay executive problems
    expect(buildExecutiveProblems(buildInsightChains(pool), pool, ctx)).toHaveLength(0)
    // Con allowSingletons → forma chain de 1 nodo → sube
    const chains   = buildInsightChains(pool, { allowSingletons: true })
    const problems = buildExecutiveProblems(chains, pool, ctx)
    expect(problems.length).toBeGreaterThanOrEqual(1)
    // ratio = 25182 / 149902 = 16.8% → bucket = 'high'
    expect(problems[0].materiality.bucket).toBe('high')
    expect(problems[0].relevanceReason).toContain('material_magnitude')
  })
})
