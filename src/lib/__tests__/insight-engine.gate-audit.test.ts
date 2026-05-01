/**
 * insight-engine.gate-audit.test.ts — Fase 7.2: Gate failure audit.
 *
 * Cuantifica POR QUÉ los candidatos fallan en `evaluateInsightCandidate` (gate
 * canónico Z.12 movido a `insightStandard.ts` en Fase 6A). NO cambia lógica.
 * El snapshot estructural es el artefacto de análisis.
 *
 * Pool auditado: el pool seleccionado por `runInsightEngine` (post ranker/cap),
 * incluyendo protected — el mismo input que recibe `filtrarConEstandar`. Esto
 * mide qué le pasa al gate sobre lo que el motor sí decide presentar.
 *
 * Contexto del gate:
 *   - `ventaTotalNegocio`: del mismo `getAgregadosParaFiltro` que usa el motor.
 *   - `paretoList`: calculado sobre el pool seleccionado (mismo criterio que
 *     `filtrarConEstandar`: dinero real, no score).
 *   - `crossCount`: replicamos `_z11ContarCrossConcreto` localmente para no
 *     ensanchar la API pública de `insight-engine.ts`.
 *
 * Hipótesis a contrastar (Fase 7.1 reverso): r3 (monetaryCoherence) excluye
 * sistemáticamente los tipos del pool regular porque tienen
 * `impacto_usd_source ∈ {non_monetary, unavailable}` o `impacto_usd_normalizado: null`.
 *
 * Si este test rompe inesperadamente: la causa es un cambio en el contrato del
 * gate, en el pool seleccionado, o en los datos demo. Ver MANIFIESTO §4 y §7.
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
  type InsightCandidate,
} from '../insight-engine'
import { getAgregadosParaFiltro } from '../domain-aggregations'
import {
  evaluateInsightCandidate,
  calcularPareto,
  type InsightGateRuleId,
} from '../insightStandard'
import type { Configuracion } from '../../types'

// ─── Mismas constantes que insight-engine.golden.test.ts ─────────────────────
const FROZEN_NOW = new Date(2026, 3, 24, 12, 0, 0)
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
  tableView: 'ytd',
  giro: '',
  giro_custom: '',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const RULE_ORDER: InsightGateRuleId[] = [
  'materiality',
  'pareto',
  'monetaryCoherence',
  'narrativeCoherence',
]

// Replicamos _z11ContarCrossConcreto (definido en insight-engine.ts, no exportado).
// Cuenta evidencia cruzada concreta presente en `c.detail.cross_context`.
function countCrossEvidence(c: InsightCandidate): number {
  const cx = (c?.detail as Record<string, unknown> | undefined)?.cross_context
  if (!cx || typeof cx !== 'object') return 0
  let n = 0
  for (const v of Object.values(cx as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim()) n++
    else if (Array.isArray(v) && v.length > 0) n++
    else if (v && typeof v === 'object') {
      const obj = v as Record<string, unknown>
      const name =
        obj.cliente ?? obj.producto ?? obj.vendedor ?? obj.member ??
        obj.departamento ?? obj.categoria
      if (typeof name === 'string' && name.trim()) n++
    }
  }
  return n
}

function emptyRuleCounter(): Record<InsightGateRuleId, number> {
  return { materiality: 0, pareto: 0, monetaryCoherence: 0, narrativeCoherence: 0 }
}

function sortedEntries<T>(o: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(o).sort(([a], [b]) => a.localeCompare(b))
  ) as Record<string, T>
}

function trunc(s: string | undefined | null, n: number): string | null {
  if (s == null) return null
  const t = String(s).trim()
  if (t.length === 0) return null
  return t.length <= n ? t : t.slice(0, n - 1) + '…'
}

function accionTexto(c: InsightCandidate): string | null {
  const a = c.accion
  if (!a) return null
  if (typeof a === 'string') return a
  if (typeof a === 'object' && 'texto' in a) return (a as { texto?: string }).texto ?? null
  return null
}

const round = (n: number | null | undefined, dp = 0): number | null => {
  if (n == null || !Number.isFinite(n)) return null
  const f = 10 ** dp
  return Math.round((n as number) * f) / f
}

// Run engine + audit gate. Devuelve payload determinístico para snapshot.
function auditGate(tipoMetaActivo: 'usd' | 'uds') {
  // ── Pipeline (idéntico al golden, sin filtrarConEstandar) ─────────────────
  const { sales, metas, inventory } = getDemoData()
  const idx = buildSaleIndex(sales)
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
      ? fr.getDate() : diasTotales
  const categoriaAnalysis = analyzeCategoria(metas, selectedPeriod, idx, diasTranscurridos, diasTotales)
  const canalAnalysis     = analyzeCanal(selectedPeriod, idx, diasTranscurridos, diasTotales)

  const candidates: InsightCandidate[] = runInsightEngine({
    sales, metas,
    vendorAnalysis: commercial.vendorAnalysis,
    categoriaAnalysis, canalAnalysis, supervisorAnalysis,
    concentracionRiesgo: commercial.concentracionRiesgo,
    clientesDormidos:    commercial.clientesDormidos,
    categoriasInventario,
    selectedPeriod,
    tipoMetaActivo,
  })

  const agregados = getAgregadosParaFiltro(sales, selectedPeriod)
  const ventaTotalNegocio = agregados?.ventaTotalNegocio ?? 0

  // [Mismo cálculo de paretoList que filtrarConEstandar — dinero real, no score]
  const paretoList = calcularPareto(
    candidates
      .map((c) => ({ nombre: c.member, valor: Math.abs(Number(c.impacto_usd_normalizado) || 0) }))
      .filter((e) => e.valor > 0),
  )

  // ── Audit por candidato ───────────────────────────────────────────────────
  const decisions = candidates.map((c) => ({
    c,
    decision: evaluateInsightCandidate(c, {
      ventaTotalNegocio,
      paretoList,
      crossCount: countCrossEvidence(c),
    }),
  }))

  const passing = decisions.filter((d) => d.decision.passes)
  const failing = decisions.filter((d) => !d.decision.passes)

  // 1. Fallos por regla (cuenta cuántos fallaron CADA regla — un candidato puede
  //    fallar varias y suma a varias columnas).
  const failsByRule = emptyRuleCounter()
  for (const { decision } of failing) {
    for (const r of decision.failedRules) failsByRule[r]++
  }

  // 2. Fallos por insightTypeId × regla
  const failsByTypeAndRule: Record<string, Record<InsightGateRuleId, number>> = {}
  for (const { c, decision } of failing) {
    if (!failsByTypeAndRule[c.insightTypeId]) failsByTypeAndRule[c.insightTypeId] = emptyRuleCounter()
    for (const r of decision.failedRules) failsByTypeAndRule[c.insightTypeId][r]++
  }

  // 3. Fallos por metricId × regla
  const failsByMetricAndRule: Record<string, Record<InsightGateRuleId, number>> = {}
  for (const { c, decision } of failing) {
    if (!failsByMetricAndRule[c.metricId]) failsByMetricAndRule[c.metricId] = emptyRuleCounter()
    for (const r of decision.failedRules) failsByMetricAndRule[c.metricId][r]++
  }

  // 4. Candidatos que fallan SOLO monetaryCoherence (pasarían si r3 fuese laxo).
  //    Lista corta — útil para evaluar el potencial de cambiar r3.
  const onlyR3Fails = failing
    .filter((d) =>
      d.decision.failedRules.length === 1 &&
      d.decision.failedRules[0] === 'monetaryCoherence',
    )
    .map(({ c }) => ({
      insightTypeId: c.insightTypeId,
      metricId:      c.metricId,
      dimensionId:   c.dimensionId,
      member:        c.member,
      impacto_usd_normalizado: c.impacto_usd_normalizado ?? null,
      impacto_usd_source:      c.impacto_usd_source ?? null,
    }))

  // 5. Distribución de impacto_usd_source en candidatos que fallan r3.
  //    Confirma o desmiente la hipótesis "non_monetary domina los fallos r3".
  const r3FailingCands = failing.filter((d) =>
    d.decision.failedRules.includes('monetaryCoherence'),
  )
  const usdSourceDistributionInR3Fails: Record<string, number> = {}
  for (const { c } of r3FailingCands) {
    const key = c.impacto_usd_source ?? '__null__'
    usdSourceDistributionInR3Fails[key] = (usdSourceDistributionInR3Fails[key] ?? 0) + 1
  }

  // 6. [Fase 7.3-D] Auditoría cualitativa: lista completa de los candidatos
  //    que mueren en el gate, con su payload narrativo + magnitudes. Permite
  //    decidir si son ruido aceptable o señal perdida.
  //    rank = posición en el pool seleccionado por el motor (1-indexed).
  const failingItems = decisions
    .map((d, idx) => ({ d, rank: idx + 1 }))
    .filter(({ d }) => !d.decision.passes)
    .map(({ d, rank }) => ({
      rank,
      member:             d.c.member,
      insightTypeId:      d.c.insightTypeId,
      metricId:           d.c.metricId,
      dimensionId:        d.c.dimensionId,
      severity:           d.c.severity,
      scoreRounded:       round(d.c.score, 4),
      impactoUsdRounded:  round(d.c.impacto_usd_normalizado, 0),
      impactoUsdSource:   d.c.impacto_usd_source ?? null,
      failedRules:        d.decision.failedRules,
      title:              trunc(d.c.title, 100),
      description:        trunc(d.c.description, 180),
      accion:             trunc(accionTexto(d.c), 140),
    }))

  // 7. [Fase 7.5-A] Auditoría enfocada: contribution + direction='up'.
  //    Antes de decidir si relajar Pareto para crecimientos materiales
  //    necesitamos saber si el caso ej. "María Castillo" es único o sistémico.
  //    Sin cambio funcional. Solo telemetría.
  //
  //    Criterios de elegibilidad propuestos para una eventual excepción:
  //      - insightTypeId === 'contribution'
  //      - direction === 'up'
  //      - score >= 0.95
  //      - severity ∈ {ALTA, CRITICA}
  //      - impacto_usd_normalizado >= 1% del negocio
  //    El snapshot muestra la lista completa + cuántos cumplen cada criterio.
  const ventaTotalNeg = ventaTotalNegocio > 0 ? ventaTotalNegocio : 1
  const contribUpDecisions = decisions.filter(
    (d) => d.c.insightTypeId === 'contribution' && d.c.direction === 'up',
  )
  const contributionPositiveAudit = {
    totalSelectedContributionUp: contribUpDecisions.length,
    passing: contribUpDecisions.filter((d) => d.decision.passes).length,
    failing: contribUpDecisions.filter((d) => !d.decision.passes).length,
    items: contribUpDecisions.map(({ c, decision }) => {
      const usdAbs = Math.abs(Number(c.impacto_usd_normalizado) || 0)
      const usdSharePct = usdAbs / ventaTotalNeg
      return {
        member:                c.member,
        metricId:              c.metricId,
        dimensionId:           c.dimensionId,
        severity:              c.severity,
        scoreRounded:          round(c.score, 4),
        impactoUsdRounded:     round(c.impacto_usd_normalizado, 0),
        usdShareOfBusinessPct: round(usdSharePct * 100, 2),
        impactoUsdSource:      c.impacto_usd_source ?? null,
        accionPresent:         Boolean(accionTexto(c)),
        passes:                decision.passes,
        failedRules:           decision.failedRules,
        // Cumplimiento de los 5 criterios propuestos:
        meetsScore095:         (c.score ?? 0) >= 0.95,
        meetsImpactoMin1pct:   usdSharePct >= 0.01,
        meetsSeverityHigh:     c.severity === 'ALTA' || c.severity === 'CRITICA',
        meetsAllProposed:
          (c.score ?? 0) >= 0.95 &&
          usdSharePct >= 0.01 &&
          (c.severity === 'ALTA' || c.severity === 'CRITICA'),
      }
    }),
  }

  // [Fase 7.6 / Sprint E1] Audit por modo (strict/relaxed/fail) × insightTypeId.
  // Mide el efecto cualitativo de añadir narrativas concretas (D1 añadió templates
  // trend/change). Hipótesis: muchos candidatos pasan de relaxed → strict cuando
  // accion ya no es null. Sin cambio funcional — solo telemetría.
  const gateAuditByMode: Record<'strict' | 'relaxed' | 'fail', Record<string, number>> = {
    strict:  {},
    relaxed: {},
    fail:    {},
  }
  for (const { c, decision } of decisions) {
    const bucket = gateAuditByMode[decision.mode]
    bucket[c.insightTypeId] = (bucket[c.insightTypeId] ?? 0) + 1
  }
  gateAuditByMode.strict  = sortedEntries(gateAuditByMode.strict)
  gateAuditByMode.relaxed = sortedEntries(gateAuditByMode.relaxed)
  gateAuditByMode.fail    = sortedEntries(gateAuditByMode.fail)

  return {
    poolSize:       candidates.length,
    gatePassCount:  passing.length,
    gateFailCount:  failing.length,
    // [Fase 7.5-B] Observabilidad: candidatos rescatados por la excepción
    // contribution-up. Si este contador crece descontroladamente en producción
    // hay que ajustar los criterios. Hoy esperamos ≤1 por dataset demo.
    gateRescuedByContributionUpException: passing.filter(
      (d) => d.decision.reason === 'relaxed:exception_contribution_up',
    ).length,
    gateAuditByMode,
    failsByRule,
    failsByTypeAndRule:   sortedEntries(failsByTypeAndRule),
    failsByMetricAndRule: sortedEntries(failsByMetricAndRule),
    onlyMonetaryCoherenceFails: {
      total: onlyR3Fails.length,
      items: onlyR3Fails, // lista pequeña; ordena natural por orden del pool
    },
    usdSourceDistributionInR3Fails: sortedEntries(usdSourceDistributionInR3Fails),
    failingItems,
    contributionPositiveAudit,
  }
}

describe('insight-engine gate failure audit (demo dataset, Fase 7.2)', () => {
  beforeAll(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    vi.setSystemTime(FROZEN_NOW)
  })

  afterAll(() => {
    vi.useRealTimers()
  })

  it('USD: rule-failure breakdown', () => {
    expect(auditGate('usd')).toMatchSnapshot()
  })

  it('UDS: rule-failure breakdown', () => {
    expect(auditGate('uds')).toMatchSnapshot()
  })
})
