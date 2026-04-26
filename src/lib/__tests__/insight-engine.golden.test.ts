/**
 * insight-engine.golden.test.ts — Golden-master del motor de insights.
 *
 * Captura la salida estructural de runInsightEngine + filtrarConEstandar contra
 * el dataset demo (Los Pinos S.A.), con reloj congelado en 2026-04-24 12:00.
 * Cubre ambos modos de métrica activa: USD y UDS.
 *
 * Propósito (Fase 3 + extensión Fase 7-prep del roadmap documental — ver CLAUDE.md):
 *   Detectar cambios involuntarios de pass/fail del gate o de severidad cuando
 *   se mueva la lógica de filtrado a insightStandard.ts y cuando se ajuste el
 *   ranker/cap en Fase 7.
 *
 * Granularidad: estructural, no narrativa.
 *   - Snapshot del summary: counts por insightTypeId / dimensionId / severity.
 *   - Snapshot de filas filtradas: ID semántico + score/impacto redondeados +
 *     flags de presencia narrativa (hasDescription / hasAction / hasConclusion).
 *   - NO se inspecciona title/description/accion/conclusion porque cambia con
 *     tweaks de copy y no representa un cambio de comportamiento del gate.
 *
 * Cobertura:
 *   - tipoMetaActivo='usd' (caso primario, baseline histórico).
 *   - tipoMetaActivo='uds' (agregado pre-Fase 7 para blindar el refactor del
 *     ranker contra regresiones en el modo unidades).
 *
 * Si este test rompe inesperadamente:
 *   1. Confirmá que el dataset demo no cambió (commits a src/lib/demoData.ts).
 *   2. Confirmá que el reloj sigue congelado en 2026-04-24.
 *   3. Si el cambio es intencional (refactor del gate, ajuste de regla,
 *      ajuste de ranker), correr `npx vitest -u` para actualizar el snapshot,
 *      e incluir el diff en la review.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { getDemoData } from '../demoData'
import {
  buildSaleIndex,
  computeCommercialAnalysis,
  computeCategoriasInventario,
  analyzeSupervisor,
  analyzeCategoria,
  analyzeCanal,
} from '../analysis'
import {
  runInsightEngine,
  filtrarConEstandar,
  getLastInsightEngineStatus,
  getLastInsightRuntimeAuditReport,
  recordInsightRuntimeAuditReport,
  type InsightCandidate,
} from '../insight-engine'
import { getAgregadosParaFiltro } from '../domain-aggregations'
import type { Configuracion } from '../../types'

// ─── Reloj congelado ──────────────────────────────────────────────────────────
// getDemoData() usa new Date() internamente para decidir hasta qué mes generar
// ventas. Sin freeze, el golden cambiaría cada día.
const FROZEN_NOW = new Date(2026, 3, 24, 12, 0, 0) // April 24, 2026 12:00

// ─── Configuración de prueba (igual a DEFAULT_CONFIG del store) ───────────────
const TEST_CONFIG: Configuracion = {
  empresa: 'Mi Empresa',
  moneda: '$',
  dias_dormido_threshold: 30,
  semanas_racha_threshold: 3,
  pct_concentracion_threshold: 50,
  umbral_riesgo_quiebre: 7,
  umbral_baja_cobertura: 20,
  umbral_normal: 60,
  tema: 'dark',
  metricaGlobal: 'usd',
  giro: '',
  giro_custom: '',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const round = (n: number | null | undefined, dp = 2): number | null => {
  if (n == null || !Number.isFinite(n)) return null
  const f = 10 ** dp
  return Math.round((n as number) * f) / f
}

const counts = <T extends string>(arr: T[]): Record<T, number> => {
  const o = {} as Record<T, number>
  for (const x of arr) o[x] = (o[x] ?? 0) + 1
  // Ordenar keys para snapshot determinístico
  return Object.fromEntries(
    Object.entries(o).sort(([a], [b]) => a.localeCompare(b))
  ) as Record<T, number>
}

const stageSnapshot = (stages: Record<string, any> | undefined) => Object.fromEntries(
  Object.entries(stages ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, stage]) => [id, {
      status: stage.status,
      inputCount: stage.inputCount ?? null,
      outputCount: stage.outputCount ?? null,
      discardedCount: stage.discardedCount ?? null,
      reason: stage.reason ?? null,
    }]),
)

/**
 * Ejecuta el pipeline completo (motor + filtro) sobre el demo dataset y
 * devuelve el payload estructural que se compara contra snapshot.
 *
 * Compartido entre los casos USD y UDS para garantizar que la única diferencia
 * entre snapshots sea el efecto real del `tipoMetaActivo`, no del setup.
 */
function runGoldenCase(tipoMetaActivo: 'usd' | 'uds') {
  // ── Arrange ───────────────────────────────────────────────────────────────
  const { sales, metas, inventory } = getDemoData()
  const idx = buildSaleIndex(sales)

  // selectedPeriod = el mes de la última venta (mismo criterio que UploadPage post-upload)
  const fr = idx.fechaReferencia
  const selectedPeriod = { year: fr.getFullYear(), month: fr.getMonth() }

  const commercial = computeCommercialAnalysis(
    sales, metas, inventory, selectedPeriod, TEST_CONFIG, idx, tipoMetaActivo,
  )
  const categoriasInventario = computeCategoriasInventario(
    sales, inventory, selectedPeriod, TEST_CONFIG, idx,
  )
  const supervisorAnalysis = analyzeSupervisor(
    commercial.vendorAnalysis, metas, selectedPeriod, idx,
  )

  const diasTotales = new Date(selectedPeriod.year, selectedPeriod.month + 1, 0).getDate()
  const diasTranscurridos =
    fr.getFullYear() === selectedPeriod.year && fr.getMonth() === selectedPeriod.month
      ? fr.getDate()
      : diasTotales

  const categoriaAnalysis = analyzeCategoria(
    metas, selectedPeriod, idx, diasTranscurridos, diasTotales,
  )
  const canalAnalysis = analyzeCanal(
    selectedPeriod, idx, diasTranscurridos, diasTotales,
  )

  // ── Act: motor + filtro ──────────────────────────────────────────────────
  // [Fase 3 — corrección] runInsightEngine retorna SELECTED (post-ranker/cap),
  // no el pool bruto. El total real generado por detectores vive en
  // getLastInsightEngineStatus().candidatesTotal. Capturamos ambos.
  const candidates: InsightCandidate[] = runInsightEngine({
    sales,
    metas,
    vendorAnalysis:      commercial.vendorAnalysis,
    categoriaAnalysis,
    canalAnalysis,
    supervisorAnalysis,
    concentracionRiesgo: commercial.concentracionRiesgo,
    clientesDormidos:    commercial.clientesDormidos,
    categoriasInventario,
    selectedPeriod,
    selectedMonths: null,
    tipoMetaActivo,
  })

  const engineStatus = getLastInsightEngineStatus()

  const agregados = getAgregadosParaFiltro(sales, selectedPeriod)

  const filtered = filtrarConEstandar(candidates, {
    diaDelMes:        diasTranscurridos,
    diasEnMes:        diasTotales,
    sales,
    metas,
    inventory:        categoriasInventario,
    clientesDormidos: commercial.clientesDormidos,
    ventaTotalNegocio: agregados?.ventaTotalNegocio ?? 0,
    tipoMetaActivo,
    selectedPeriod,
    agregados:        agregados ?? undefined,
  })

  const runtimeAudit = recordInsightRuntimeAuditReport({
    candidatesReturned: candidates,
    filteredCandidates: filtered,
    chainsCount: 0,
    executiveProblemsCount: 0,
    residualCandidatesCount: filtered.length,
    legacyBlocksCount: 0,
    diagnosticBlocksCount: filtered.length,
    enrichedBlocksCount: filtered.length,
  })
  expect(getLastInsightRuntimeAuditReport()).toBe(runtimeAudit)
  expect(
    Object.values(engineStatus?.originBreakdown ?? {}).reduce((sum, n) => sum + n, 0),
  ).toBe(engineStatus?.candidatesTotal ?? 0)

  // ── Assert payload: snapshot estructural ─────────────────────────────────
  const detectorsEmitted: Record<string, number> = {}
  if (engineStatus) {
    for (const [name, det] of Object.entries(engineStatus.detectors)) {
      detectorsEmitted[name] = det.candidatesEmitted
    }
  }

  const summary = {
    datasetSize: {
      sales:     sales.length,
      metas:     metas.length,
      inventory: inventory.length,
    },
    // engineStatus: bruto generado vs final seleccionado por el motor.
    // Si candidatesTotal >> candidatesSelected, el ranker/cap está activo y
    // el bajo número de "candidates.length" es esperado.
    engineStatus: engineStatus ? {
      candidatesTotal:    engineStatus.candidatesTotal,
      candidatesSelected: engineStatus.candidatesSelected,
      detectorsEmitted,
      origins:            engineStatus.originBreakdown,
      stages:             stageSnapshot(engineStatus.pipeline as Record<string, any>),
      rankerAudit: engineStatus.rankerAudit ? {
        protectedCount:   engineStatus.rankerAudit.protectedCount,
        regularCount:     engineStatus.rankerAudit.regularCount,
        regularCap:       engineStatus.rankerAudit.regularCap,
        regularSelected:  engineStatus.rankerAudit.regularSelected,
        selectedByOrigin: engineStatus.rankerAudit.selectedByOrigin,
        portfolioPreview: engineStatus.rankerAudit.portfolioPreview.slice(0, 5),
      } : null,
    } : null,
    runtimeAudit: {
      summary: runtimeAudit.summary,
      origins: runtimeAudit.origins,
      stages:  stageSnapshot(runtimeAudit.stages as Record<string, any>),
      portfolioPreview: runtimeAudit.portfolioPreview.slice(0, 5),
    },
    // Pool retornado por el motor (post-ranker/cap, pre-filtro estándar)
    poolReturnedByEngine: {
      total:         candidates.length,
      byInsightType: counts(candidates.map((c) => c.insightTypeId)),
      byDimension:   counts(candidates.map((c) => c.dimensionId)),
      bySeverity:    counts(candidates.map((c) => c.severity)),
    },
    // Pool tras filtrarConEstandar (gate canónico de insightStandard.ts)
    poolAfterFilter: {
      total:         filtered.length,
      passRate:      round(filtered.length / Math.max(1, candidates.length), 3),
      byInsightType: counts(filtered.map((c) => c.insightTypeId)),
      byDimension:   counts(filtered.map((c) => c.dimensionId)),
      bySeverity:    counts(filtered.map((c) => c.severity)),
    },
  }

  // [Fase 3 — golden] Filas en orden real del filtro (rank = índice + 1).
  // Campos: ID semántico + magnitudes redondeadas + flags narrativos.
  // NO se serializa title/description/accion/conclusion para evitar fragilidad.
  const rows = filtered.map((c, i) => ({
    rank:                i + 1,
    metricId:            c.metricId,
    dimensionId:         c.dimensionId,
    insightTypeId:       c.insightTypeId,
    member:              c.member,
    severity:            c.severity,
    scoreRounded:        round(c.score, 4),
    impactoValorRounded: round(c.impacto_valor, 0),
    impactoPctRounded:   round(c.impacto_pct, 2),
    direction:           c.direction ?? null,
    time_scope:          c.time_scope ?? null,
    root_problem_key:    c.root_problem_key ?? null,
    hasDescription:      Boolean(c.description && c.description.length > 0),
    hasAction:           Boolean(c.accion),
    hasConclusion:       Boolean(c.conclusion && c.conclusion.length > 0),
  }))

  return { summary, rows }
}

// ─── Cobertura USD (baseline histórico — preserva snapshot byte-idéntico) ────
describe('insight-engine golden master (demo dataset, USD)', () => {
  beforeAll(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    vi.setSystemTime(FROZEN_NOW)
  })

  afterAll(() => {
    vi.useRealTimers()
  })

  it('produces stable structural output for demo dataset', () => {
    expect(runGoldenCase('usd')).toMatchSnapshot()
  })
})

// ─── Cobertura UDS (Fase 7-prep — blinda el refactor del ranker en modo uds) ─
describe('insight-engine golden master (demo dataset, UDS)', () => {
  beforeAll(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    vi.setSystemTime(FROZEN_NOW)
  })

  afterAll(() => {
    vi.useRealTimers()
  })

  it('produces stable structural output for demo dataset', () => {
    expect(runGoldenCase('uds')).toMatchSnapshot()
  })
})
