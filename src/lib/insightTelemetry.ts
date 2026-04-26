export type InsightCandidateOrigin =
  | 'motor1_legacy'
  | 'motor2_registry_loop'
  | 'cross_engine'
  | 'special_builder'
  | 'executive_compression'
  | 'legacy_render_adapter'

export type InsightPipelineStageId =
  | 'upload_parse'
  | 'analysis_worker'
  | 'motor1_legacy'
  | 'motor2_registry_loop'
  | 'cross_engine'
  | 'special_builders'
  | 'dedup'
  | 'ranker'
  | 'gate'
  | 'executive_compression'
  | 'render_adapter'

export interface InsightPipelineStageReport {
  id: InsightPipelineStageId
  status: 'ok' | 'partial' | 'skipped' | 'failed'
  durationMs?: number
  inputCount?: number
  outputCount?: number
  discardedCount?: number
  reason?: string
  metadata?: Record<string, unknown>
}

export interface InsightPortfolioAudit {
  economicImpact: number
  strategicNonMonetary: number
  confidence: number
  diversity: number
  actionability: number
  causalConnectivity: number
  portfolioScore: number
  reasons: string[]
}

export interface InsightCandidateTelemetryShape {
  _origin?: InsightCandidateOrigin
  metricId?: string
  dimensionId?: string
  insightTypeId?: string
  member?: string
  score?: number
  severity?: string
  accion?: unknown
  conclusion?: unknown
  entity_path?: string[]
  parent_entity_keys?: string[]
  child_entity_keys?: string[]
  root_problem_key?: string | null
  impacto_usd_normalizado?: number | null
  impacto_usd_source?: string
  // Sprint 3: precomputed by ranker with full context; used by buildPortfolioPreview
  _portfolioAudit?: InsightPortfolioAudit
}

export interface InsightRuntimeAuditReport {
  runAt: number
  summary: {
    candidatesReturned: number
    candidatesFiltered: number
    candidatesRejectedByGate: number
    chains: number
    executiveProblems: number
    residualCandidates: number
    legacyBlocks: number
    diagnosticBlocks: number
    enrichedBlocks: number
  }
  origins: Record<InsightCandidateOrigin | 'unknown', number>
  stages: Partial<Record<InsightPipelineStageId, InsightPipelineStageReport>>
  portfolioPreview: Array<{
    id: string
    currentRank: number
    portfolioRank: number
    portfolioScore: number
    reasons: string[]
  }>
}

const ORIGINS: Array<InsightCandidateOrigin | 'unknown'> = [
  'motor1_legacy',
  'motor2_registry_loop',
  'cross_engine',
  'special_builder',
  'executive_compression',
  'legacy_render_adapter',
  'unknown',
]

export function emptyOriginBreakdown(): Record<InsightCandidateOrigin | 'unknown', number> {
  return Object.fromEntries(ORIGINS.map((origin) => [origin, 0])) as Record<InsightCandidateOrigin | 'unknown', number>
}

export function summarizeCandidateOrigins(
  candidates: ReadonlyArray<InsightCandidateTelemetryShape>,
): Record<InsightCandidateOrigin | 'unknown', number> {
  const out = emptyOriginBreakdown()
  for (const c of candidates) {
    const origin = c._origin ?? 'unknown'
    out[origin] = (out[origin] ?? 0) + 1
  }
  return out
}

export function makeStageReport(
  id: InsightPipelineStageId,
  data: Omit<InsightPipelineStageReport, 'id'>,
): InsightPipelineStageReport {
  return {
    id,
    ...data,
    durationMs: data.durationMs == null ? undefined : Math.max(0, Math.round(data.durationMs)),
  }
}

export function buildPortfolioAudit(
  candidate: InsightCandidateTelemetryShape,
  context: {
    ventaTotalNegocio?: number
    selectedOrigins?: Record<string, number>
    selectedTypes?: Record<string, number>
    selectedDimensions?: Record<string, number>
  } = {},
): InsightPortfolioAudit {
  const reasons: string[] = []
  const ventaTotal = Math.max(1, Math.abs(context.ventaTotalNegocio ?? 0))
  const usd = Math.abs(candidate.impacto_usd_normalizado ?? 0)
  const economicImpact = Math.min(1, usd / ventaTotal)
  if (usd > 0) reasons.push('economic_impact')

  // Sprint 3: graded strategic value per type — reflects decision urgency, not just
  // "is non-monetary". Monetary types contribute 0 here; economicImpact carries them.
  const STRATEGIC_NM_SCORE: Record<string, number> = {
    change_point:      0.90, // structural regime shift → reallocate resources
    meta_gap_temporal: 0.85, // direct management action, time-bound
    cliente_dormido:   0.80, // recovery window is closing
    migration:         0.80, // cannibalization → active portfolio decision
    product_dead:      0.70, // catalog hygiene with inventory cost
    steady_share:      0.65, // slow erosion → medium urgency
    cross_delta:       0.60, // directional signal, needs triangulation
    co_decline:        0.55, // cluster signal, less actionable alone
    correlation:       0.45, // diagnostic, not directly actionable
  }
  const source = candidate.impacto_usd_source ?? 'unavailable'
  const insightType = candidate.insightTypeId ?? ''
  const typeScore = STRATEGIC_NM_SCORE[insightType]
  // Non-monetary types not in the table also carry partial strategic value
  const isNonMonetary = source === 'non_monetary' || source === 'unavailable'
  const rawStrategic = typeScore ?? (isNonMonetary ? 0.35 : 0)
  // Weight by confidence: low-score signals get reduced strategic weight
  const strategicNonMonetary = rawStrategic > 0
    ? rawStrategic * Math.min(1, (candidate.score ?? 0) * 2)
    : 0
  if (strategicNonMonetary >= 0.30) reasons.push('strategic_signal')

  const confidence = Math.max(0, Math.min(1, candidate.score ?? 0))
  if (confidence >= 0.75) reasons.push('high_confidence')

  const typeCount = context.selectedTypes?.[candidate.insightTypeId ?? ''] ?? 0
  const dimCount = context.selectedDimensions?.[candidate.dimensionId ?? ''] ?? 0
  const diversity = Math.max(0, Math.min(1, 1 - Math.max(typeCount - 1, dimCount - 1) * 0.15))
  if (diversity >= 0.85) reasons.push('diversity_preserved')

  const actionability = candidate.accion || candidate.conclusion ? 1 : 0.35
  if (actionability >= 1) reasons.push('actionable')

  const hasEntityPath = (candidate.entity_path?.length ?? 0) > 0
  const hasRelations = (candidate.parent_entity_keys?.length ?? 0) > 0 || (candidate.child_entity_keys?.length ?? 0) > 0
  const causalConnectivity = hasRelations ? 1 : hasEntityPath || candidate.root_problem_key ? 0.65 : 0.25
  if (causalConnectivity >= 0.65) reasons.push('causal_context')

  const portfolioScore =
    economicImpact * 0.34 +
    strategicNonMonetary * 0.18 +
    confidence * 0.18 +
    diversity * 0.10 +
    actionability * 0.10 +
    causalConnectivity * 0.10

  return {
    economicImpact,
    strategicNonMonetary,
    confidence,
    diversity,
    actionability,
    causalConnectivity,
    portfolioScore,
    reasons,
  }
}

export function buildPortfolioPreview(
  candidates: ReadonlyArray<InsightCandidateTelemetryShape>,
): InsightRuntimeAuditReport['portfolioPreview'] {
  const ranked = candidates
    .map((candidate, currentRank) => ({
      candidate,
      currentRank: currentRank + 1,
      // Prefer precomputed audit (set by ranker with full context); fall back to
      // context-free computation only when the candidate hasn't been through the ranker.
      audit: candidate._portfolioAudit ?? buildPortfolioAudit(candidate),
    }))
    .sort((a, b) => b.audit.portfolioScore - a.audit.portfolioScore)

  const portfolioRankById = new Map<string, number>()
  ranked.forEach((entry, idx) => {
    portfolioRankById.set(candidateAuditId(entry.candidate), idx + 1)
  })

  return candidates.slice(0, 12).map((candidate, idx) => {
    const id = candidateAuditId(candidate)
    const audit = candidate._portfolioAudit ?? buildPortfolioAudit(candidate)
    return {
      id,
      currentRank: idx + 1,
      portfolioRank: portfolioRankById.get(id) ?? idx + 1,
      portfolioScore: Math.round(audit.portfolioScore * 1000) / 1000,
      reasons: audit.reasons,
    }
  })
}

function candidateAuditId(candidate: InsightCandidateTelemetryShape): string {
  return [
    candidate._origin ?? 'unknown',
    candidate.insightTypeId ?? 'unknown_type',
    candidate.dimensionId ?? 'unknown_dim',
    candidate.metricId ?? 'unknown_metric',
    candidate.member ?? '_global',
  ].join(':')
}
