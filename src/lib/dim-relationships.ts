// dim-relationships.ts
// Análisis automático de relaciones entre dimensiones desde la data.
// Detecta dependencias funcionales (FD) y clasifica pares como 1-1, 1-N, N-N.
// Usado por cross_delta para generar combos no-redundantes sin hardcodear
// jerarquías. Cuando se agregan dimensiones nuevas a DIMENSION_REGISTRY,
// el motor auto-detecta sus relaciones sin cambios de código.

import type { SaleRecord } from '../types'

/** Tipo de relación entre dos dimensiones. */
export type DimRelation =
  | '1-1'   // A determina a B y B determina a A (sinónimos)
  | '1-N'   // A determina a B pero no al revés (A es "padre")
  | 'N-1'   // B determina a A pero no al revés (B es "padre")
  | 'N-N'   // ninguna determina a la otra (independientes)

export interface DimAnalysis {
  /** Cardinalidad (valores únicos no-nulos) por dimensión. */
  cardinality: Map<string, number>
  /**
   * Mapa de dependencia funcional. Si fd.get('producto')?.has('categoria') === true,
   * entonces producto → categoria (cada producto mapea a una sola categoría).
   * Cuando un combo contiene un dim X y otro dim Y donde X→Y, Y es redundante.
   */
  fd: Map<string, Set<string>>
  /**
   * Clasificación de relación por par. Key: `${a}|${b}` con a < b alfabéticamente.
   */
  relation: Map<string, DimRelation>
  /** Nº de filas analizadas (para telemetría). */
  sampleSize: number
}

const MIN_DETERMINER_CARDINALITY = 5

/**
 * Analiza las relaciones funcionales entre dimensiones.
 *
 * Una FD A→B se considera válida si:
 * 1. Cada valor único de A mapea a exactamente un valor de B en los datos.
 * 2. La cardinalidad de A es ≥ MIN_DETERMINER_CARDINALITY (evita FDs espurias
 *    en datasets chicos, ej. 2 vendedores que casualmente sólo vendieron en
 *    2 canales distintos no implica que vendedor determine canal).
 *
 * Costo: O(N × D²) donde N = filas, D = nº dims. Llamar 1 vez por run.
 */
export function analyzeDimRelationships(
  sales: SaleRecord[],
  dims: string[],
): DimAnalysis {
  const cardinality = new Map<string, number>()
  // value-sets per (a, b): map.get(`${a}|${b}`).get(aValue) = Set<bValue>
  const valueMaps = new Map<string, Map<string, Set<string>>>()

  // Pre-compute cardinalities + per-pair value maps
  const dimSets = new Map<string, Set<string>>()
  for (const d of dims) dimSets.set(d, new Set())

  for (const s of sales) {
    const rec = s as unknown as Record<string, unknown>
    for (const d of dims) {
      const v = rec[d]
      if (typeof v !== 'string' || v.trim() === '') continue
      dimSets.get(d)!.add(v)
    }
    // Pair-wise tracking only between dims with values in this row
    for (let i = 0; i < dims.length; i++) {
      const a = dims[i]
      const av = rec[a]
      if (typeof av !== 'string' || av.trim() === '') continue
      for (let j = 0; j < dims.length; j++) {
        if (i === j) continue
        const b = dims[j]
        const bv = rec[b]
        if (typeof bv !== 'string' || bv.trim() === '') continue
        const key = `${a}|${b}`
        if (!valueMaps.has(key)) valueMaps.set(key, new Map())
        const m = valueMaps.get(key)!
        if (!m.has(av)) m.set(av, new Set())
        m.get(av)!.add(bv)
      }
    }
  }

  for (const [d, set] of dimSets) cardinality.set(d, set.size)

  // FD detection: A→B holds if every aValue maps to exactly one bValue
  const fd = new Map<string, Set<string>>()
  for (const d of dims) fd.set(d, new Set())

  for (const [pairKey, valueMap] of valueMaps) {
    const [a, b] = pairKey.split('|')
    const aCard = cardinality.get(a) ?? 0
    if (aCard < MIN_DETERMINER_CARDINALITY) continue
    let isFd = valueMap.size > 0
    for (const bSet of valueMap.values()) {
      if (bSet.size !== 1) { isFd = false; break }
    }
    if (isFd) fd.get(a)!.add(b)
  }

  // Classify pair relations
  const relation = new Map<string, DimRelation>()
  for (let i = 0; i < dims.length; i++) {
    for (let j = i + 1; j < dims.length; j++) {
      const a = dims[i], b = dims[j]
      const aDetB = fd.get(a)?.has(b) ?? false
      const bDetA = fd.get(b)?.has(a) ?? false
      let r: DimRelation
      if (aDetB && bDetA) r = '1-1'
      else if (aDetB)    r = '1-N'
      else if (bDetA)    r = 'N-1'
      else               r = 'N-N'
      relation.set(`${a}|${b}`, r)
    }
  }

  return { cardinality, fd, relation, sampleSize: sales.length }
}

/**
 * Devuelve true si un combo contiene dependencias funcionales internas
 * (algún dim del combo está determinado por otro dim del combo). En ese
 * caso, el dim "hijo" es redundante: agregar B al combo no particiona más
 * que el combo ya hace por el padre A.
 */
export function isRedundantCombo(combo: readonly string[], analysis: DimAnalysis): boolean {
  for (const a of combo) {
    const determined = analysis.fd.get(a)
    if (!determined || determined.size === 0) continue
    for (const b of combo) {
      if (a !== b && determined.has(b)) return true
    }
  }
  return false
}

/**
 * Para pares 1-1, mantenemos solo uno (el de mayor cardinalidad — más granular).
 * Si un combo contiene un par 1-1, reemplazamos por el canónico.
 * Si tras reemplazos el combo tiene duplicados, retornamos null (skip).
 */
export function canonicalizeCombo(combo: readonly string[], analysis: DimAnalysis): string[] | null {
  const out: string[] = []
  for (const d of combo) {
    let chosen = d
    // Si d tiene par 1-1 con otro dim del combo, preferir el de mayor cardinalidad
    for (const e of combo) {
      if (e === d) continue
      const key = d < e ? `${d}|${e}` : `${e}|${d}`
      if (analysis.relation.get(key) === '1-1') {
        const cd = analysis.cardinality.get(d) ?? 0
        const ce = analysis.cardinality.get(e) ?? 0
        if (ce > cd) chosen = e
      }
    }
    out.push(chosen)
  }
  // Duplicados (resultado de canonicalización colapsando 1-1)
  const set = new Set(out)
  if (set.size !== out.length) return null
  return [...set].sort()
}

/**
 * Genera todas las combinaciones no-redundantes de tamaño [2, maxSize] sobre
 * el conjunto de dims. Aplica:
 *   - skip si combo es redundante (contiene FD interna)
 *   - canonicalización 1-1 (toma el de mayor cardinalidad)
 *   - cap MAX_COMBOS priorizando combos con cardinalidad efectiva mayor
 */
export interface GenerateCombosOptions {
  maxTupleSize?: number    // default 4
  maxCombos?: number       // default 200
}

export interface ComboTelemetry {
  totalRaw: number              // C(D,2) + C(D,3) + ...
  filteredRedundant: number     // skipeadas por FD interna
  filteredCanonical: number     // skipeadas tras colapsar 1-1
  capApplied: boolean
  finalCount: number
}

export function generateAutoCombos(
  dims: string[],
  analysis: DimAnalysis,
  opts: GenerateCombosOptions = {},
): { combos: string[][]; telemetry: ComboTelemetry } {
  const maxTupleSize = opts.maxTupleSize ?? 4
  const maxCombos    = opts.maxCombos ?? 200

  const sortedDims = [...dims].sort()
  const allCombos: string[][] = []
  let totalRaw = 0
  let filteredRedundant = 0
  let filteredCanonical = 0

  // Recursive subset generator for sizes 2..maxTupleSize
  function* subsets(start: number, current: string[], size: number): Generator<string[]> {
    if (current.length === size) { yield [...current]; return }
    for (let i = start; i < sortedDims.length; i++) {
      current.push(sortedDims[i])
      yield* subsets(i + 1, current, size)
      current.pop()
    }
  }

  for (let k = 2; k <= maxTupleSize; k++) {
    if (k > sortedDims.length) break
    for (const subset of subsets(0, [], k)) {
      totalRaw++
      if (isRedundantCombo(subset, analysis)) { filteredRedundant++; continue }
      const canon = canonicalizeCombo(subset, analysis)
      if (!canon) { filteredCanonical++; continue }
      // Re-check redundancy after canonicalization (may collapse pairs)
      if (isRedundantCombo(canon, analysis)) { filteredRedundant++; continue }
      allCombos.push(canon)
    }
  }

  // Dedup post-canonical (combos diferentes pueden colapsar al mismo canon)
  const seen = new Set<string>()
  const dedup: string[][] = []
  for (const c of allCombos) {
    const key = c.join('|')
    if (seen.has(key)) continue
    seen.add(key)
    dedup.push(c)
  }

  // Apply cap: priorizar combos con producto de cardinalidades más alto
  // (slices más granulares, con más miembros = más oportunidad de señal).
  let final = dedup
  let capApplied = false
  if (final.length > maxCombos) {
    capApplied = true
    final = [...dedup]
      .map(c => ({
        c,
        priority: c.reduce((acc, d) => acc * Math.max(1, analysis.cardinality.get(d) ?? 1), 1),
      }))
      .sort((a, b) => b.priority - a.priority)
      .slice(0, maxCombos)
      .map(x => x.c)
  }

  return {
    combos: final,
    telemetry: {
      totalRaw,
      filteredRedundant,
      filteredCanonical,
      capApplied,
      finalCount: final.length,
    },
  }
}
