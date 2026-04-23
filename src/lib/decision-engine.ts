// [Z.9.3] decision-engine.ts — Motor de Decisión Ejecutiva
//
// Responsabilidad única de este módulo: agrupar InsightCandidates en InsightChains
// para su consumo posterior por Z.9.4 (ExecutiveProblems).
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

// ─── Constantes (R139–R141) ───────────────────────────────────────────────────

/** Contribución mínima del hijo respecto al padre para ser incluido en la cadena.
 *  Si impacto_valor del hijo es null, el umbral no se aplica (inclusion defensiva). */
export const MIN_CONTRIBUTION_TO_PARENT_PCT = 0.05   // [R139] 5%
/** Profundidad máxima del árbol causal (nivel 0 = root). */
export const MAX_CHAIN_DEPTH                = 4       // [R140]
/** Candidatos máximos por cadena antes del corte. */
export const MAX_CANDIDATES_PER_CHAIN       = 8       // [R141]

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

    // Ordenar por score desc y limitar
    const capped = [...group]
      .sort((a, b) => b.score - a.score)
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
