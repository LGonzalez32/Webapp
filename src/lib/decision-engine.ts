// [Z.9.3/Z.9.4] decision-engine.ts — Motor de Decisión Ejecutiva
//
// Z.9.3: Agrupa InsightCandidates en InsightChains (causal linking).
// Z.9.4: Agrupa InsightChains en ExecutiveProblems (compresión ejecutiva).
//
// Sin IA, sin probabilidad. Reglas determinísticas basadas en los campos Z.9.2
// (direction, time_scope, impacto_valor) ya hidratados por hydratarCandidatoZ9.
//
// Invariantes:
//   - No importar de insightStandard.ts (evita cadena circular con insight-engine.ts)
//   - No importar de diagnostic-actions.ts ni de páginas
//   - InsightCandidate importado solo desde insight-engine.ts
//   - tsc --noEmit: 0 errores al terminar cada fase

import type { InsightCandidate } from './insight-engine'
import type { InsightChain, InsightChainNode } from '../types/diagnostic-types'

// ─── Feature flag (Z.9.5) ────────────────────────────────────────────────────

/** Habilita el Panel Ejecutivo en EstadoComercialPage. */
export const EXECUTIVE_COMPRESSION_ENABLED = true

// ─── Constantes (R139–R141) ───────────────────────────────────────────────────

/** Contribución mínima del hijo respecto al padre para ser incluido en la cadena.
 *  Si impacto_valor del hijo es null, el umbral no se aplica (inclusion defensiva). */
export const MIN_CONTRIBUTION_TO_PARENT_PCT = 0.05   // [R139] 5%
/** Profundidad máxima del árbol causal (nivel 0 = root). */
export const MAX_CHAIN_DEPTH                = 4       // [R140]
/** Candidatos máximos por cadena antes del corte. */
export const MAX_CANDIDATES_PER_CHAIN       = 8       // [R141]
/** Umbral de similitud Jaccard (palabras) para suprimir evidencia redundante vs primaryCause. */
export const EVIDENCE_SIMILARITY_THRESHOLD  = 0.8     // [R147]

// Mirrors insightStandard.ts — cannot import from there (circular via insight-engine.ts)
const _MATERIALITY_FLOOR    = 0.02
const _MATERIALITY_HIGH     = 0.10
const _MATERIALITY_CRITICAL = 0.20
const _EXEC_TOP_N           = 4
const _STAT_ANOMALY_SCORE   = 0.85
// statistical_anomaly sola NO califica para ejecutivo (mirrors STATISTICAL_ANOMALY_REQUIRES_COMPANION)
const _STAT_ANOMALY_REQUIRES_COMPANION = true

// ─── MaterialityContext ───────────────────────────────────────────────────────

/**
 * Denominadores de materialidad para buildExecutiveProblems.
 * Todos en la misma unidad que totalImpactUSD del ExecutiveProblem.
 * El motor elige en orden preferido: salesLYSamePeriod → salesCurrentPeriod → salesYTDCurrent.
 */
export interface MaterialityContext {
  salesLYSamePeriod:  number | null   // ventas LY mismo período (preferido)
  salesCurrentPeriod: number | null   // fallback 1: período actual
  salesYTDCurrent:    number | null   // fallback 2: YTD actual
  metaPeriodo:        number | null   // opcional — no se usa como denominador
  periodLabel:        string          // ej "Abril 2026 vs Abril 2025"
}
/** Problemas ejecutivos máximos que llegan al render (Z.9.6). */
export const MAX_EXECUTIVE_PROBLEMS_SHOWN   = 7       // [R142]

// ─── ID canónico de candidato ────────────────────────────────────────────────

// InsightCandidate no tiene campo id. Derivamos un ID estable como clave de nodo.
// Colisión teórica: mismo tipo+dim+member con diferente time_scope — raro, aceptado.
function _candidateId(c: InsightCandidate): string {
  const member = c.member ?? '_global'
  return `${c.insightTypeId}:${c.dimensionId}:${member}`
}

// ─── buildRootProblemKey ─────────────────────────────────────────────────────

// [Z.9.6] Familia temporal para agrupar problemas ejecutivos.
// Colapsa granularidades técnicas distintas que representan el mismo
// horizonte de decisión.
function timeScopeFamily(
  ts: "mtd" | "ytd" | "rolling" | "monthly" | "seasonal" | "unknown" | undefined
): "current" | "longitudinal" | "seasonal" | "unknown" {
  switch (ts) {
    case 'mtd':
    case 'monthly':
      return 'current'
    case 'ytd':
    case 'rolling':
      return 'longitudinal'
    case 'seasonal':
      return 'seasonal'
    default:
      return 'unknown'
  }
}

/**
 * Clave canónica para agrupar candidatos en una cadena causal.
 * Formato: {direction}:{dimensionId}:{time_scope_family}
 * Ejemplo: "down:vendedor:current"
 *
 * [Z.9.6] Usa familia temporal (timeScopeFamily) en lugar de time_scope crudo
 * para colapsar mtd/monthly → current y ytd/rolling → longitudinal.
 * Esto permite que meta_gap_temporal y contribution del mismo vendedor
 * caigan en el mismo bucket aunque difieran en granularidad técnica.
 */
export function buildRootProblemKey(c: InsightCandidate): string {
  const direction         = c.direction  ?? 'neutral'
  const time_scope_family = timeScopeFamily(c.time_scope as "mtd" | "ytd" | "rolling" | "monthly" | "seasonal" | "unknown" | undefined)
  console.log('[Z.9.6] buildRootProblemKey', c.insightTypeId, c.member, '->', `${direction}:${c.dimensionId}:${time_scope_family}`)
  return `${direction}:${c.dimensionId}:${time_scope_family}`
}

// ─── getEntityGranularity ────────────────────────────────────────────────────

/**
 * Nivel de granularidad de la entidad del candidato.
 *   0 = equipo / global (sin member, o member=equipo/all)
 *   1 = dimensión leaf (vendedor individual, cliente, categoría, producto)
 *   2 = sub-dimensión (departamento, supervisor, canal — más granular que dim principal)
 */
const _SUB_DIMS = new Set(['departamento', 'supervisor', 'canal'])

export function getEntityGranularity(c: InsightCandidate): number {
  if (!c.member || c.member === '_global' || c.member === 'equipo') return 0
  if (_SUB_DIMS.has(c.dimensionId)) return 2
  return 1
}

// ─── compartenDireccion ──────────────────────────────────────────────────────

/** True si ambos candidatos tienen la misma dirección estadística (up/down/neutral). */
export function compartenDireccion(a: InsightCandidate, b: InsightCandidate): boolean {
  return (a.direction ?? 'neutral') === (b.direction ?? 'neutral')
}

// ─── sonInsightsRelacionables ─────────────────────────────────────────────────

/**
 * True si los candidatos son candidatos a pertenecer a la misma cadena causal.
 * Condición primaria:  comparten root_problem_key (ya calculada en Z.9.2/Z.9.3).
 * Condición secundaria: misma direction + metricId (proximidad semántica).
 * No aplicar entre el mismo objeto.
 */
export function sonInsightsRelacionables(
  a: InsightCandidate,
  b: InsightCandidate,
): boolean {
  if (a === b) return false
  // Primaria: mismo root_problem_key
  const rpkA = a.root_problem_key
  const rpkB = b.root_problem_key
  if (rpkA && rpkB && rpkA === rpkB) return true
  // Secundaria: misma dirección + métrica
  if (compartenDireccion(a, b) && a.metricId === b.metricId) return true
  return false
}

// ─── calcularContributionToParent ────────────────────────────────────────────

/**
 * Fracción del impacto del padre que el hijo explica.
 * Retorna un valor en [0, 1] o null si no hay insumos claros.
 * null no bloquea la inclusión del nodo — ver MIN_CONTRIBUTION_TO_PARENT_PCT.
 */
export function calcularContributionToParent(
  child:  InsightCandidate,
  parent: InsightCandidate,
): number | null {
  const cv = child.impacto_valor
  const pv = parent.impacto_valor
  if (cv == null || pv == null || !isFinite(cv) || !isFinite(pv) || pv === 0) return null
  return Math.min(1, Math.abs(cv) / Math.abs(pv))
}

// ─── _relationType ───────────────────────────────────────────────────────────

function _relationType(level: number): InsightChainNode['relationType'] {
  if (level === 0) return 'root'
  if (level === 1) return 'cause'
  if (level === 2) return 'subcause'
  return 'support'
}

// ─── _flattenTree ────────────────────────────────────────────────────────────

// ─── _jaccardSimilarity ───────────────────────────────────────────────────────

/** Similitud Jaccard sobre tokens de palabras. Retorna 0..1. */
function _jaccardSimilarity(a: string, b: string): number {
  const tokenize = (s: string) => new Set(s.toLowerCase().split(/\s+/).filter(Boolean))
  const setA = tokenize(a)
  const setB = tokenize(b)
  let intersection = 0
  for (const w of setA) if (setB.has(w)) intersection++
  const union = setA.size + setB.size - intersection
  return union === 0 ? 1 : intersection / union
}

function _flattenTree(node: InsightChainNode): InsightChainNode[] {
  const result: InsightChainNode[] = [node]
  for (const child of node.children) {
    result.push(..._flattenTree(child))
  }
  return result
}

// ─── _computeMateriality ─────────────────────────────────────────────────────

/**
 * Calcula el bloque de materialidad de un ExecutiveProblem.
 * Si ctx es null o todos los denominadores son nulos → degraded=true, bucket='material'
 * (no ocultar, solo marcar; regla 4 del spec).
 */
function _computeMateriality(
  impactAbs: number,
  ctx: MaterialityContext | null,
): ExecutiveProblem['materiality'] {
  const unavailable = {
    ratio: null, denominator: null,
    denominatorSource: 'unavailable' as const,
    bucket: 'material' as const,
    degraded: true,
  }
  if (!ctx) return unavailable

  let denominator: number | null = null
  let denominatorSource: ExecutiveProblem['materiality']['denominatorSource'] = 'unavailable'
  let degraded = false

  if (ctx.salesLYSamePeriod != null && ctx.salesLYSamePeriod > 0) {
    denominator = ctx.salesLYSamePeriod
    denominatorSource = 'ly_same_period'
    degraded = false
  } else if (ctx.salesCurrentPeriod != null && ctx.salesCurrentPeriod > 0) {
    denominator = ctx.salesCurrentPeriod
    denominatorSource = 'current_period'
    degraded = true
  } else if (ctx.salesYTDCurrent != null && ctx.salesYTDCurrent > 0) {
    denominator = ctx.salesYTDCurrent
    denominatorSource = 'ytd_current'
    degraded = true
  } else {
    return unavailable
  }

  const ratio = impactAbs / denominator
  const bucket: ExecutiveProblem['materiality']['bucket'] =
    ratio < _MATERIALITY_FLOOR    ? 'below_floor' :
    ratio < _MATERIALITY_HIGH     ? 'material'    :
    ratio < _MATERIALITY_CRITICAL ? 'high'        : 'critical'

  return { ratio, denominator, denominatorSource, bucket, degraded }
}

// ─── buildInsightChains ──────────────────────────────────────────────────────

/**
 * Agrupa InsightCandidates en InsightChains por root_problem_key.
 *
 * Algoritmo:
 *   1. Garantizar root_problem_key en todos los candidatos.
 *   2. Agrupar por clave. Grupos con < 2 miembros no forman cadena.
 *   3. Por cada grupo: el candidato de mayor score es el root.
 *      El resto se adjunta en BFS por score descendente, hasta MAX_CHAIN_DEPTH.
 *   4. La contribución mínima (MIN_CONTRIBUTION_TO_PARENT_PCT) filtra nodos
 *      solo cuando AMBOS candidatos tienen impacto_valor no-null.
 *
 * Complejidad: O(n²) por grupo. Aceptable con MAX_CANDIDATES_PER_CHAIN = 8.
 *
 * No modifica los candidatos de entrada (excepto root_problem_key si estaba vacío).
 */
export function buildInsightChains(
  candidates: InsightCandidate[],
  options?: { allowSingletons?: boolean },
): InsightChain[] {
  if (!candidates || candidates.length === 0) return []

  // 1. Garantizar root_problem_key
  for (const c of candidates) {
    if (!c.root_problem_key) {
      c.root_problem_key = buildRootProblemKey(c)
    }
  }

  // 2. Agrupar por root_problem_key
  const groups = new Map<string, InsightCandidate[]>()
  for (const c of candidates) {
    const key = c.root_problem_key!
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(c)
  }

  const chains: InsightChain[] = []

  for (const [problemKey, group] of groups) {
    if (group.length < 2) {
      // [R149] Singleton chain para candidatos de alto impacto sin par (ej: stock_risk)
      if (!options?.allowSingletons) continue
      const solo   = group[0]
      const soloId = _candidateId(solo)
      chains.push({
        chainId:         `chain:${problemKey}`,
        rootCandidateId: soloId,
        rootProblemKey:  problemKey,
        totalImpactValue: solo.impacto_valor != null && isFinite(solo.impacto_valor)
          ? Math.abs(solo.impacto_valor) : null,
        nodes: [{ candidateId: soloId, level: 0, relationType: 'root', children: [] }],
        depth: 1,
        width: 0,
      })
      continue
    }

    // [R143] Ordenar por render_priority_score (Z.9.6) con fallback a score
    const capped = [...group]
      .sort((a, b) => (b.render_priority_score ?? b.score) - (a.render_priority_score ?? a.score))
      .slice(0, MAX_CANDIDATES_PER_CHAIN)

    // El root es el de mayor score
    const root   = capped[0]
    const rootId = _candidateId(root)

    // Mapa id → candidato para lookup O(1)
    const byId = new Map<string, InsightCandidate>()
    for (const c of capped) byId.set(_candidateId(c), c)

    // 3. Construir árbol BFS
    const rootNode: InsightChainNode = {
      candidateId: rootId,
      level:        0,
      relationType: 'root',
      children:     [],
    }

    const added: Set<string>         = new Set([rootId])
    let   currentLevel: InsightChainNode[] = [rootNode]
    let   maxDepth = 0

    for (let lvl = 1; lvl < MAX_CHAIN_DEPTH && currentLevel.length > 0; lvl++) {
      const nextLevel: InsightChainNode[] = []

      for (const parentNode of currentLevel) {
        const parentCandidate = byId.get(parentNode.candidateId)
        if (!parentCandidate) continue

        for (const candidate of capped) {
          const cid = _candidateId(candidate)
          if (added.has(cid)) continue

          // Filtro de contribución — solo aplica cuando ambos son monetizables
          const contribution = calcularContributionToParent(candidate, parentCandidate)
          if (
            contribution !== null &&
            contribution < MIN_CONTRIBUTION_TO_PARENT_PCT
          ) continue

          const childNode: InsightChainNode = {
            candidateId:  cid,
            level:        lvl,
            relationType: _relationType(lvl),
            children:     [],
          }
          parentNode.children.push(childNode)
          nextLevel.push(childNode)
          added.add(cid)

          // [Z.9.7 Gap 2] Write-back de la relación en los objetos candidato
          // para que parent_entity_keys / child_entity_keys sean trazables desde
          // fuera del árbol. Mutación in-place, consistente con buildRootProblemKey
          // arriba y con hydratarCandidatoZ9.
          const parentId = _candidateId(parentCandidate)

          if (!Array.isArray(candidate.parent_entity_keys)) candidate.parent_entity_keys = []
          if (!Array.isArray(parentCandidate.child_entity_keys)) parentCandidate.child_entity_keys = []

          if (!candidate.parent_entity_keys.includes(parentId)) {
            candidate.parent_entity_keys.push(parentId)
          }
          if (!parentCandidate.child_entity_keys.includes(cid)) {
            parentCandidate.child_entity_keys.push(cid)
          }
        }
      }

      if (nextLevel.length > 0) maxDepth = lvl
      currentLevel = nextLevel
    }

    // 4. Calcular totalImpactValue — máximo impacto_valor entre nodos añadidos
    let totalImpactValue: number | null = root.impacto_valor ?? null
    for (const id of added) {
      const c = byId.get(id)
      if (!c) continue
      const v = c.impacto_valor
      if (v != null && isFinite(v)) {
        totalImpactValue = totalImpactValue == null
          ? Math.abs(v)
          : Math.max(totalImpactValue, Math.abs(v))
      }
    }

    const allNodes = _flattenTree(rootNode)

    chains.push({
      chainId:         `chain:${problemKey}`,
      rootCandidateId: rootId,
      rootProblemKey:  problemKey,
      totalImpactValue,
      nodes:           allNodes,
      depth:           maxDepth + 1,   // incluye nivel 0
      width:           rootNode.children.length,
    })
  }

  console.log('[Z.9.3] buildInsightChains', {
    input:  candidates.length,
    groups: groups.size,
    chains: chains.length,
  })

  return chains
}

// ════════════════════════════════════════════════════════════════════════════
// Z.9.4 — ExecutiveProblem: compresión ejecutiva de InsightChains
// ════════════════════════════════════════════════════════════════════════════

// ─── Pesos para renderPriorityScore del ExecutiveProblem ─────────────────────
// No pueden vivir en insightStandard.ts — importar de allí crearía ciclo:
//   insight-engine.ts → insightStandard.ts → decision-engine.ts → insight-engine.ts
export const EP_W_VALUE         = 2.0   // log1p(|totalImpactUSD|)
export const EP_W_TIME          = 3.0   // urgencia por time_scope
export const EP_W_CONCENTRATION = 1.0   // concentración en focusBlock
export const EP_W_DEPTH         = 0.5   // profundidad causal de la chain
export const EP_W_SEV           = 0.4   // multiplicador por severidad

const _EP_SCOPE_URGENCY: Record<string, number> = {
  mtd: 1.0, monthly: 0.8, ytd: 0.6, rolling: 0.5, unknown: 0.4,
  // [fix-1.5] valores que timeScopeFamily() realmente produce:
  current: 1.0, longitudinal: 0.6, seasonal: 0.5,
}
const _EP_SEV_RANK: Record<string, number> = { CRITICA: 4, ALTA: 3, MEDIA: 2, BAJA: 1 }

// ─── Tipo ExecutiveProblem ────────────────────────────────────────────────────

/**
 * Agrupación ejecutiva de InsightChains que comparten la misma raíz del problema.
 * Unidad de presentación del Panel Ejecutivo (Z.9.5).
 */
export interface ExecutiveProblem {
  problemId:          string                        // "problem:{rootProblemKey}"
  rootProblemKey:     string                        // e.g., "down:vendedor:ytd"
  headline:           string                        // "Caída en vendedores (YTD)"
  severity:           'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA'
  totalImpactUSD:     number | null                 // suma de chain.totalImpactValue
  totalImpactPct:     number | null                 // % sobre baseline; max entre candidatos cubiertos
  chainIds:           string[]                      // IDs de las cadenas incluidas
  coveredCandidates:  string[]                      // IDs de todos los candidatos agrupados
  entityCount:        number                        // miembros distintos afectados
  direction:          'up' | 'down' | 'neutral'
  dimensionId:        string
  time_scope:         'mtd' | 'ytd' | 'rolling' | 'monthly' | 'unknown' | 'current' | 'longitudinal' | 'seasonal'
  primaryCause:       string | null                 // descripción del candidato raíz (observacional)
  secondaryCauses:    string[]                      // títulos de candidatos causa (máx 2)
  focusBlock:         {                             // entidad con mayor impacto_valor absoluto
    entityType:  string
    entityName:  string
    impactValue: number | null
  } | null
  supportingEvidence: string[]                      // frases con cifras concretas (máx 3)
  problemDirection:   'deterioro' | 'mejora' | 'mixto' // dirección semántica para sección UI
  materiality: {
    ratio:             number | null                // |totalImpactUSD| / denominator
    denominator:       number | null                // valor usado como denominador
    denominatorSource: 'ly_same_period' | 'current_period' | 'ytd_current' | 'unavailable'
    bucket:            'below_floor' | 'material' | 'high' | 'critical'
    degraded:          boolean                      // true si no se pudo usar LY
  }
  relevanceReason:    Array<'material_magnitude' | 'statistical_anomaly' | 'chain_depth'>
  contextSnapshot: {
    salesLYSamePeriod: number | null
    periodLabel:       string
  }
  renderPriorityScore: number                       // score determinístico (no exponer en UI)
}

// ─── Helpers de headline ─────────────────────────────────────────────────────

const _DIRECTION_LABEL: Record<string, string> = {
  down:    'Caída',
  up:      'Alza',
  neutral: 'Variación',
}

const _DIM_LABEL: Record<string, string> = {
  vendedor:    'en vendedores',
  cliente:     'en clientes',
  producto:    'en productos',
  categoria:   'en categorías',
  canal:       'por canal',
  departamento:'por departamento',
  supervisor:  'por supervisor',
}

const _SCOPE_LABEL: Record<string, string> = {
  ytd:     'YTD',
  mtd:     'mes actual',
  rolling: 'últimos meses',
  monthly: 'mensual',
  unknown: '',
  // [fix-1.5] valores que timeScopeFamily() produce actualmente:
  current:      'mes actual',
  longitudinal: 'tendencia histórica',
  seasonal:     'patrón estacional',
}

function _buildHeadline(problemKey: string, entityCount: number): string {
  const [dir = 'neutral', dim = '', scope = 'unknown'] = problemKey.split(':')
  const dirLabel   = _DIRECTION_LABEL[dir]  ?? 'Variación'
  const dimLabel   = _DIM_LABEL[dim]        ?? `en ${dim}`
  const scopeLabel = _SCOPE_LABEL[scope]    ?? scope
  const scopePart  = scopeLabel ? ` (${scopeLabel})` : ''
  const countPart  = entityCount > 1 ? ` — ${entityCount} entidades` : ''
  return `${dirLabel} ${dimLabel}${scopePart}${countPart}`
}

// ─── Severidad desde impacto ─────────────────────────────────────────────────

function _severityFromImpact(usd: number | null): ExecutiveProblem['severity'] {
  if (usd == null) return 'MEDIA'
  if (usd >= 10_000) return 'CRITICA'
  if (usd >=  3_000) return 'ALTA'
  if (usd >=  1_000) return 'MEDIA'
  return 'BAJA'
}

// ─── buildExecutiveProblems ──────────────────────────────────────────────────

/**
 * Agrupa InsightChains en ExecutiveProblems por rootProblemKey compartida.
 *
 * Algoritmo:
 *   1. Agrupar chains por rootProblemKey.
 *   2. Por cada grupo: sumar totalImpactValue, reunir coveredCandidates y entidades.
 *   3. Si se recibe candidatePool, derivar primaryCause, secondaryCauses, focusBlock,
 *      supportingEvidence y totalImpactPct desde los candidatos reales.
 *   4. Calcular severity y renderPriorityScore.
 *   5. Construir headline legible a partir de los componentes de la clave.
 *
 * No aplica EXECUTIVE_COMPRESSION_ENABLED — ese flag vive en el render (Z.9.5).
 *
 * @param candidatePool  Pool completo de InsightCandidate para enriquecer los campos
 *                       narrativos. Opcional: si ausente, esos campos quedan en
 *                       null / [].
 */
export function buildExecutiveProblems(
  chains: InsightChain[],
  candidatePool?: InsightCandidate[],
  materialityCtx?: MaterialityContext,
): ExecutiveProblem[] {
  if (!chains || chains.length === 0) return []

  // Construir lookup de candidatos por ID si se proporcionó el pool
  const candidateById = new Map<string, InsightCandidate>()
  if (candidatePool) {
    for (const c of candidatePool) {
      candidateById.set(_candidateId(c), c)
    }
  }

  const groups = new Map<string, InsightChain[]>()
  for (const chain of chains) {
    const key = chain.rootProblemKey
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(chain)
  }

  const problems: ExecutiveProblem[] = []

  for (const [problemKey, groupChains] of groups) {
    // Sumar impacto total
    let totalImpactUSD: number | null = null
    for (const chain of groupChains) {
      const v = chain.totalImpactValue
      if (v != null && isFinite(v)) {
        totalImpactUSD = (totalImpactUSD ?? 0) + v
      }
    }

    // Reunir coveredCandidates únicos + nodos en orden (root primero)
    const coveredSet     = new Set<string>()
    const orderedNodes: Array<{ candidateId: string; level: number }> = []
    for (const chain of groupChains) {
      for (const node of chain.nodes) {
        if (!coveredSet.has(node.candidateId)) {
          coveredSet.add(node.candidateId)
          orderedNodes.push({ candidateId: node.candidateId, level: node.level })
        }
      }
    }
    orderedNodes.sort((a, b) => a.level - b.level)
    const coveredCandidates = [...coveredSet]

    // Miembros distintos: extraer del candidateId (formato "type:dim:member")
    const memberSet = new Set<string>()
    for (const cid of coveredCandidates) {
      const parts = cid.split(':')
      if (parts.length >= 3) memberSet.add(parts.slice(2).join(':'))
    }
    const entityCount = memberSet.size

    // Descomponer la clave para headline y campos tipados
    const [dirStr = 'neutral', dimStr = '', scopeStr = 'unknown'] = problemKey.split(':')
    const direction  = (['up', 'down', 'neutral'].includes(dirStr)
      ? dirStr : 'neutral') as ExecutiveProblem['direction']
    const time_scope = (['current', 'longitudinal', 'seasonal', 'mtd', 'ytd', 'rolling', 'monthly', 'unknown'].includes(scopeStr)
      ? scopeStr : 'unknown') as ExecutiveProblem['time_scope']

    // ── Campos enriquecidos (requieren candidatePool) ────────────────────────
    let primaryCause:       string | null = null
    let secondaryCauses:    string[]      = []
    let focusBlock:         ExecutiveProblem['focusBlock'] = null
    let supportingEvidence: string[]      = []
    let totalImpactPct:     number | null = null

    let ranked: InsightCandidate[] = []
    if (candidateById.size > 0) {
      // Candidatos en orden de nivel (root = level 0 = primaryCause)
      ranked = orderedNodes
        .map(n => candidateById.get(n.candidateId))
        .filter((c): c is InsightCandidate => c != null)

      // primaryCause: descripción del candidato raíz
      const rootCandidate = ranked[0]
      if (rootCandidate) {
        primaryCause = rootCandidate.description ?? null
      }

      // secondaryCauses: títulos de los siguientes 2 candidatos por nivel
      secondaryCauses = ranked
        .slice(1, 3)
        .map(c => c.title)
        .filter(Boolean)

      // focusBlock: candidato con mayor |impacto_valor|
      let maxImpact: number | null = null
      for (const c of ranked) {
        const iv = c.impacto_valor
        if (iv != null && isFinite(iv) && (maxImpact == null || Math.abs(iv) > maxImpact)) {
          maxImpact = Math.abs(iv)
          const name = (c.detail['member'] as string | undefined) ?? c.member ?? c.dimensionId
          focusBlock = {
            entityType:  c.dimensionId,
            entityName:  name,
            impactValue: iv,
          }
        }
      }

      // supportingEvidence: bullets trazables, máx 3 (supporting_evidence primero, fallback a description)
      const evidenceSrc: string[] = []
      for (const c of ranked) {
        if (evidenceSrc.length >= 3) break
        const ev = c.supporting_evidence
        if (ev && ev.length > 0) {
          for (const e of ev) {
            if (evidenceSrc.length < 3) evidenceSrc.push(e)
          }
        } else if (c.description && evidenceSrc.length < 3) {
          evidenceSrc.push(c.description)
        }
      }
      // [R147] Filtrar evidencia redundante — si similar a primaryCause en ≥ EVIDENCE_SIMILARITY_THRESHOLD
      const dedupedEvidence = primaryCause
        ? evidenceSrc.filter(e => _jaccardSimilarity(e, primaryCause) < EVIDENCE_SIMILARITY_THRESHOLD)
        : evidenceSrc
      supportingEvidence = dedupedEvidence.slice(0, 3)

      // totalImpactPct: máximo impacto_pct absoluto entre los candidatos cubiertos
      for (const c of ranked) {
        const p = c.impacto_pct
        if (p != null && isFinite(p)) {
          if (totalImpactPct == null || Math.abs(p) > Math.abs(totalImpactPct)) {
            totalImpactPct = p
          }
        }
      }
    }

    // ── problemDirection — derivada de los candidatos cubiertos ──────────────
    let problemDirection: ExecutiveProblem['problemDirection']
    if (candidateById.size > 0) {
      const dirs = new Set(
        orderedNodes
          .map(n => candidateById.get(n.candidateId)?.direction ?? 'neutral')
      )
      if (dirs.size === 1) {
        const d = [...dirs][0]
        problemDirection = d === 'up' ? 'mejora' : d === 'down' ? 'deterioro' : 'mixto'
      } else {
        problemDirection = 'mixto'
      }
    } else {
      problemDirection = direction === 'up' ? 'mejora' : direction === 'down' ? 'deterioro' : 'mixto'
    }

    // ── materiality (R148) ──────────────────────────────────────────────────
    const impactAbs = totalImpactUSD != null && isFinite(totalImpactUSD)
      ? Math.abs(totalImpactUSD) : 0
    const materiality = _computeMateriality(impactAbs, materialityCtx ?? null)

    // ── relevanceReason ───────────────────────────────────────────────────────
    const relevanceReason: ExecutiveProblem['relevanceReason'] = []
    if (materiality.bucket !== 'below_floor') relevanceReason.push('material_magnitude')
    const rootScore = ranked[0] != null
      ? (ranked[0].render_priority_score ?? ranked[0].score ?? 0)
      : 0
    if (rootScore >= _STAT_ANOMALY_SCORE) relevanceReason.push('statistical_anomaly')
    // chain_depth requiere cadena causal multi-nivel (≥3 niveles: root→cause→subcause)
    const maxChainDepth = groupChains.reduce((max, c) => Math.max(max, c.depth ?? 1), 0)
    if (maxChainDepth >= 3) relevanceReason.push('chain_depth')

    // ── contextSnapshot ────────────────────────────────────────────────────────
    const contextSnapshot: ExecutiveProblem['contextSnapshot'] = {
      salesLYSamePeriod: materialityCtx?.salesLYSamePeriod ?? null,
      periodLabel:       materialityCtx?.periodLabel ?? '',
    }

    // ── severity ─────────────────────────────────────────────────────────────
    const severity = _severityFromImpact(totalImpactUSD)

    // ── headline ─────────────────────────────────────────────────────────────
    const headline = _buildHeadline(problemKey, entityCount)

    // ── renderPriorityScore para ExecutiveProblem ─────────────────────────────
    // Formula: log1p(|totalImpactUSD|)*W_VALUE + scopeUrgency*W_TIME
    //          + concentration*W_CONCENTRATION + depth*W_DEPTH + sevRank*W_SEV
    const ivAbs    = totalImpactUSD != null && isFinite(totalImpactUSD) ? Math.abs(totalImpactUSD) : 0
    const ivScore  = Math.log1p(ivAbs) * EP_W_VALUE
    const timeScore = (_EP_SCOPE_URGENCY[time_scope] ?? 0.4) * EP_W_TIME
    const concRatio = (focusBlock?.impactValue != null && ivAbs > 0)
      ? Math.min(1, Math.abs(focusBlock.impactValue) / ivAbs) : 0
    const concScore = concRatio * EP_W_CONCENTRATION
    const avgDepth  = groupChains.length > 0
      ? groupChains.reduce((s, c) => s + (c.depth ?? 1), 0) / groupChains.length : 1
    const depthScore = Math.min(1, avgDepth / MAX_CHAIN_DEPTH) * EP_W_DEPTH
    const sevScore  = (_EP_SEV_RANK[severity] ?? 1) * EP_W_SEV
    const renderPriorityScore = ivScore + timeScore + concScore + depthScore + sevScore

    problems.push({
      problemId:           `problem:${problemKey}`,
      rootProblemKey:      problemKey,
      headline,
      severity,
      totalImpactUSD,
      totalImpactPct,
      chainIds:            groupChains.map(c => c.chainId),
      coveredCandidates,
      entityCount,
      direction,
      dimensionId:         dimStr,
      time_scope,
      primaryCause,
      secondaryCauses,
      focusBlock,
      supportingEvidence,
      problemDirection,
      materiality,
      relevanceReason,
      contextSnapshot,
      renderPriorityScore,
    })
  }

  // Ordenar: renderPriorityScore desc (incorpora severity + impacto + scope)
  problems.sort((a, b) => b.renderPriorityScore - a.renderPriorityScore)

  // [R148/R149] Filtro de admisión ejecutiva:
  //   A. material_magnitude → pasa siempre (bucket ∈ {material, high, critical})
  //   B. chain_depth → pasa siempre (cadena causal real ≥ 3 niveles)
  //   C. statistical_anomaly sola → NO pasa (_STAT_ANOMALY_REQUIRES_COMPANION)
  //   D. statistical_anomaly + otra razón → pasa por A o B
  const eligible = materialityCtx
    ? problems.filter(p => {
        if (!_STAT_ANOMALY_REQUIRES_COMPANION) return p.relevanceReason.length > 0
        const hasMagnitude = p.relevanceReason.includes('material_magnitude')
        const hasChain     = p.relevanceReason.includes('chain_depth')
        return hasMagnitude || hasChain
      })
    : problems  // sin contexto de materialidad → no filtrar (compatible con tests sin ctx)

  // [R142/R148] Cap → EXEC_TOP_N cuando hay contexto; MAX_EXECUTIVE_PROBLEMS_SHOWN como safety
  const capN = materialityCtx ? _EXEC_TOP_N : MAX_EXECUTIVE_PROBLEMS_SHOWN
  const capped = eligible.slice(0, capN)

  console.log('[Z.9.4] buildExecutiveProblems', {
    chains:    chains.length,
    problems:  problems.length,
    eligible:  eligible.length,
    shown:     capped.length,
  })

  return capped
}
