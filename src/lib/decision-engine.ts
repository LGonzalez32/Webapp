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

/** Habilita el Panel Ejecutivo en EstadoComercialPage.
 *  Mantener en false hasta completar Z.9.6 (ranker + caps). */
export const EXECUTIVE_COMPRESSION_ENABLED = false

// ─── Constantes (R139–R141) ───────────────────────────────────────────────────

/** Contribución mínima del hijo respecto al padre para ser incluido en la cadena.
 *  Si impacto_valor del hijo es null, el umbral no se aplica (inclusion defensiva). */
export const MIN_CONTRIBUTION_TO_PARENT_PCT = 0.05   // [R139] 5%
/** Profundidad máxima del árbol causal (nivel 0 = root). */
export const MAX_CHAIN_DEPTH                = 4       // [R140]
/** Candidatos máximos por cadena antes del corte. */
export const MAX_CANDIDATES_PER_CHAIN       = 8       // [R141]
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

/**
 * Clave canónica para agrupar candidatos en una cadena causal.
 * Formato: {direction}:{dimensionId}:{time_scope}
 * Ejemplo: "down:vendedor:ytd"
 *
 * La agrupación por dimensionId+time_scope captura el patrón estructural:
 * "todos los vendedores cayendo en YTD" → misma clave → misma cadena.
 */
export function buildRootProblemKey(c: InsightCandidate): string {
  const direction  = c.direction  ?? 'neutral'
  const time_scope = c.time_scope ?? 'unknown'
  return `${direction}:${c.dimensionId}:${time_scope}`
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

// ─── sonInsightsRelacionablesZ9 ──────────────────────────────────────────────

/**
 * True si los candidatos son candidatos a pertenecer a la misma cadena causal.
 * Condición primaria:  comparten root_problem_key (ya calculada en Z.9.2/Z.9.3).
 * Condición secundaria: misma direction + metricId (proximidad semántica).
 * No aplicar entre el mismo objeto.
 */
export function sonInsightsRelacionablesZ9(
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

function _flattenTree(node: InsightChainNode): InsightChainNode[] {
  const result: InsightChainNode[] = [node]
  for (const child of node.children) {
    result.push(..._flattenTree(child))
  }
  return result
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
    if (group.length < 2) continue

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

// ─── Tipo ExecutiveProblem ────────────────────────────────────────────────────

/**
 * Agrupación ejecutiva de InsightChains que comparten la misma raíz del problema.
 * Unidad de presentación del Panel Ejecutivo (Z.9.5, bajo feature flag).
 */
export interface ExecutiveProblem {
  problemId:      string                          // "problem:{rootProblemKey}"
  rootProblemKey: string                          // e.g., "down:vendedor:ytd"
  headline:       string                          // "Caída en vendedores (YTD)"
  severity:       'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA'
  totalImpactUSD: number | null                   // suma de chain.totalImpactValue
  chainIds:       string[]                        // IDs de las cadenas incluidas
  candidateIds:   string[]                        // todos los candidatos de todas las cadenas
  entityCount:    number                          // miembros distintos afectados
  direction:      'up' | 'down' | 'neutral'
  dimensionId:    string
  time_scope:     'mtd' | 'ytd' | 'rolling' | 'monthly' | 'unknown'
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
 *   2. Por cada grupo: sumar totalImpactValue, reunir candidateIds y entidades.
 *   3. Calcular severity desde totalImpactUSD.
 *   4. Construir headline legible a partir de los componentes de la clave.
 *
 * No aplica EXECUTIVE_COMPRESSION_ENABLED — ese flag vive en el render (Z.9.5).
 */
export function buildExecutiveProblems(
  chains: InsightChain[],
): ExecutiveProblem[] {
  if (!chains || chains.length === 0) return []

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

    // Reunir candidateIds únicos
    const candidateSet = new Set<string>()
    for (const chain of groupChains) {
      for (const node of chain.nodes) {
        candidateSet.add(node.candidateId)
      }
    }
    const candidateIds = [...candidateSet]

    // Miembros distintos: extraer del candidateId (formato "type:dim:member")
    const memberSet = new Set<string>()
    for (const cid of candidateIds) {
      const parts = cid.split(':')
      if (parts.length >= 3) memberSet.add(parts.slice(2).join(':'))
    }
    const entityCount = memberSet.size

    // Descomponer la clave para headline y campos tipados
    const [dirStr = 'neutral', dimStr = '', scopeStr = 'unknown'] = problemKey.split(':')
    const direction  = (['up', 'down', 'neutral'].includes(dirStr)
      ? dirStr : 'neutral') as ExecutiveProblem['direction']
    const time_scope = (['mtd', 'ytd', 'rolling', 'monthly', 'unknown'].includes(scopeStr)
      ? scopeStr : 'unknown') as ExecutiveProblem['time_scope']

    const severity = _severityFromImpact(totalImpactUSD)
    const headline = _buildHeadline(problemKey, entityCount)

    problems.push({
      problemId:      `problem:${problemKey}`,
      rootProblemKey: problemKey,
      headline,
      severity,
      totalImpactUSD,
      chainIds:       groupChains.map(c => c.chainId),
      candidateIds,
      entityCount,
      direction,
      dimensionId:    dimStr,
      time_scope,
    })
  }

  // Ordenar: severity desc, luego impacto desc
  const _SEV_RANK: Record<string, number> = { CRITICA: 3, ALTA: 2, MEDIA: 1, BAJA: 0 }
  problems.sort((a, b) => {
    const ds = (_SEV_RANK[b.severity] ?? 0) - (_SEV_RANK[a.severity] ?? 0)
    if (ds !== 0) return ds
    return (b.totalImpactUSD ?? 0) - (a.totalImpactUSD ?? 0)
  })

  // [R142] Aplicar cap de problemas ejecutivos
  const capped = problems.slice(0, MAX_EXECUTIVE_PROBLEMS_SHOWN)

  console.log('[Z.9.4] buildExecutiveProblems', {
    chains:   chains.length,
    problems: problems.length,
    shown:    capped.length,
  })

  return capped
}
