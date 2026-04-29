// uploadValidation.ts
// Sprint E del roadmap docs/ROADMAP-INGESTA-REGISTRY.md.
// Cross-table validation con dispatcher genérico. Las reglas se declaran en
// TABLE_REGISTRY[id].relations como CrossTableRule[] (discriminated union).
// Cuatro tipos built-in (dim_consistency, membership, range_overlap, custom) +
// registro de validators custom para reglas con cálculos arbitrarios.

import { TABLE_REGISTRY, getDimensionKeys, type TableId } from './fileParser'
import type { CrossTableRule } from './registry-types'

type LooseRecord = Record<string, unknown>

// ─── Tipos públicos ─────────────────────────────────────────────────────────

export type ValidationSeverity = 'error' | 'warning'

/** Issue producido por un evaluador de regla. */
export interface CrossTableValidationIssue {
  rule: CrossTableRule
  severity: ValidationSeverity
  /** Código semántico genérico (ej. 'CROSS_TABLE_DIM_MISSING'). */
  code: string
  /** Mensaje legible al usuario. */
  message: string
  /** Datos crudos para debug / detail. */
  details?: Record<string, unknown>
}

/** Snapshot de datos por tabla para evaluar reglas. */
export type DataByTable = Partial<Record<TableId, LooseRecord[]>>

type RuleEvaluator<R extends CrossTableRule> = (
  rule: R,
  data: DataByTable,
) => CrossTableValidationIssue[]

// ─── Registro de validators custom ──────────────────────────────────────────

const _customValidators = new Map<
  string,
  RuleEvaluator<Extract<CrossTableRule, { type: 'custom' }>>
>()

/**
 * Registra un evaluador custom. La regla debe declarar `type: 'custom'` y
 * `name: '<el-mismo-nombre>'` en TABLE_REGISTRY[X].relations.
 *
 * Ejemplo:
 *   registerCrossTableValidator('returns_ratio', (rule, data) => {
 *     const ratio = sum(data.returns) / sum(data.sales)
 *     if (ratio > 0.05) return [{ ... }]
 *     return []
 *   })
 */
export function registerCrossTableValidator(
  name: string,
  fn: RuleEvaluator<Extract<CrossTableRule, { type: 'custom' }>>,
): void {
  _customValidators.set(name, fn)
}

/** Útil para tests / debugging. */
export function _resetCustomValidators(): void {
  _customValidators.clear()
}

// ─── Helpers internos ───────────────────────────────────────────────────────

const hasStringValue = (record: LooseRecord, key: string): boolean => {
  const value = record[key]
  return typeof value === 'string' && value.trim() !== ''
}

const sharedDimsBetween = (sourceTable: TableId, targetTable: TableId): string[] => {
  const targetDims = new Set(getDimensionKeys(targetTable))
  return getDimensionKeys(sourceTable).filter((k) => targetDims.has(k))
}

// ─── Evaluadores built-in ──────────────────────────────────────────────────

const evalDimConsistency: RuleEvaluator<Extract<CrossTableRule, { type: 'dim_consistency' }>> = (
  rule,
  data,
) => {
  const sourceData = data[rule.sourceTable as TableId] ?? []
  const targetData = data[rule.targetTable as TableId] ?? []
  const issues: CrossTableValidationIssue[] = []

  // Si source no tiene datos, no hay nada que validar — incluso si
  // requireTargetLoaded está set. Evita disparar errors al inicio del wizard
  // cuando ninguna tabla se ha cargado aún.
  if (sourceData.length === 0) return issues

  if (rule.requireTargetLoaded && targetData.length === 0) {
    issues.push({
      rule,
      severity: rule.severity,
      code: 'CROSS_TABLE_TARGET_NOT_LOADED',
      message: `Subí primero los datos de ${rule.targetTable} — ${rule.sourceTable} se valida contra sus dimensiones.`,
      details: { sourceTable: rule.sourceTable, targetTable: rule.targetTable },
    })
    return issues
  }

  const dims = sharedDimsBetween(rule.sourceTable as TableId, rule.targetTable as TableId)
  const missing: string[] = []
  for (const dim of dims) {
    const sourceHasDim = sourceData.some((r) => hasStringValue(r, dim))
    if (!sourceHasDim) continue
    const targetHasDim = targetData.some((r) => hasStringValue(r, dim))
    if (!targetHasDim) missing.push(dim)
  }
  if (missing.length === 0) return issues

  issues.push({
    rule,
    severity: rule.severity,
    code: 'CROSS_TABLE_DIM_MISSING',
    message:
      `Tu archivo de ${rule.sourceTable} tiene ${missing.length === 1 ? 'una columna que no está' : 'columnas que no están'} en ${rule.targetTable}: ${missing.join(', ')}. ` +
      `No podemos cruzar ${rule.sourceTable} con ${rule.targetTable} si la dimensión no existe en ambas tablas.`,
    details: { missingFromTarget: missing, sourceTable: rule.sourceTable, targetTable: rule.targetTable },
  })
  return issues
}

const evalMembership: RuleEvaluator<Extract<CrossTableRule, { type: 'membership' }>> = (
  rule,
  data,
) => {
  const sourceData = data[rule.sourceTable as TableId] ?? []
  const targetData = data[rule.targetTable as TableId] ?? []
  if (sourceData.length === 0 || targetData.length === 0) return []

  const targetSet = new Set<string>()
  for (const r of targetData) {
    const v = r[rule.targetField]
    if (typeof v === 'string' && v.trim() !== '') targetSet.add(v.trim())
  }

  const orphans = new Set<string>()
  for (const r of sourceData) {
    const v = r[rule.sourceField]
    if (typeof v === 'string' && v.trim() !== '' && !targetSet.has(v.trim())) {
      orphans.add(v.trim())
    }
  }

  if (orphans.size === 0) return []

  const samples = [...orphans].slice(0, 5)
  return [{
    rule,
    severity: rule.severity,
    code: 'CROSS_TABLE_MEMBERSHIP_VIOLATION',
    message:
      `${rule.sourceTable}.${rule.sourceField} tiene ${orphans.size} valor${orphans.size === 1 ? '' : 'es'} ` +
      `que no existe${orphans.size === 1 ? '' : 'n'} en ${rule.targetTable}.${rule.targetField}: ` +
      `${samples.join(', ')}${orphans.size > samples.length ? '…' : ''}.`,
    details: { orphans: [...orphans], sourceField: rule.sourceField, targetField: rule.targetField },
  }]
}

const evalRangeOverlap: RuleEvaluator<Extract<CrossTableRule, { type: 'range_overlap' }>> = (
  rule,
  data,
) => {
  const sourceData = data[rule.sourceTable as TableId] ?? []
  const targetData = data[rule.targetTable as TableId] ?? []
  if (sourceData.length === 0 || targetData.length === 0) return []

  const toMs = (v: unknown): number | null => {
    if (v instanceof Date) return v.getTime()
    if (typeof v === 'string') {
      const t = new Date(v).getTime()
      return isNaN(t) ? null : t
    }
    if (typeof v === 'number' && isFinite(v)) return v
    return null
  }

  let srcMin = Infinity, srcMax = -Infinity
  for (const r of sourceData) {
    const t = toMs(r[rule.sourceField])
    if (t === null) continue
    if (t < srcMin) srcMin = t
    if (t > srcMax) srcMax = t
  }
  let tgtMin = Infinity, tgtMax = -Infinity
  for (const r of targetData) {
    const t = toMs(r[rule.targetField])
    if (t === null) continue
    if (t < tgtMin) tgtMin = t
    if (t > tgtMax) tgtMax = t
  }
  if (srcMin === Infinity || tgtMin === Infinity) return []

  const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  const srcRange = `[${fmt(srcMin)}, ${fmt(srcMax)}]`
  const tgtRange = `[${fmt(tgtMin)}, ${fmt(tgtMax)}]`

  if (rule.mode === 'within') {
    // src ⊆ tgt: source range debe estar dentro de target range
    if (srcMin >= tgtMin && srcMax <= tgtMax) return []
    return [{
      rule,
      severity: rule.severity,
      code: 'CROSS_TABLE_RANGE_OUT_OF_BOUNDS',
      message: `${rule.sourceTable}.${rule.sourceField} ${srcRange} sale del rango de ${rule.targetTable}.${rule.targetField} ${tgtRange}.`,
      details: { sourceRange: [fmt(srcMin), fmt(srcMax)], targetRange: [fmt(tgtMin), fmt(tgtMax)], mode: 'within' },
    }]
  } else {
    // intersect: deben tener al menos una intersección
    if (srcMax < tgtMin || srcMin > tgtMax) {
      return [{
        rule,
        severity: rule.severity,
        code: 'CROSS_TABLE_RANGE_NO_OVERLAP',
        message: `${rule.sourceTable}.${rule.sourceField} ${srcRange} no se intersecta con ${rule.targetTable}.${rule.targetField} ${tgtRange}.`,
        details: { sourceRange: [fmt(srcMin), fmt(srcMax)], targetRange: [fmt(tgtMin), fmt(tgtMax)], mode: 'intersect' },
      }]
    }
    return []
  }
}

const evalCustom: RuleEvaluator<Extract<CrossTableRule, { type: 'custom' }>> = (rule, data) => {
  const fn = _customValidators.get(rule.name)
  if (!fn) {
    return [{
      rule,
      severity: rule.severity,
      code: 'CROSS_TABLE_CUSTOM_VALIDATOR_NOT_FOUND',
      message: `Regla custom '${rule.name}' declarada en el registry pero no hay validator registrado.`,
      details: { name: rule.name },
    }]
  }
  try {
    return fn(rule, data)
  } catch (e) {
    return [{
      rule,
      severity: 'warning',
      code: 'CROSS_TABLE_CUSTOM_VALIDATOR_ERROR',
      message: `Validator custom '${rule.name}' lanzó: ${e instanceof Error ? e.message : String(e)}`,
      details: { name: rule.name },
    }]
  }
}

// ─── Dispatcher ─────────────────────────────────────────────────────────────

/**
 * Evalúa una sola regla y devuelve los issues encontrados.
 * Si la regla no aplica (datos vacíos o sin violación), array vacío.
 */
export function evaluateCrossTableRule(
  rule: CrossTableRule,
  data: DataByTable,
): CrossTableValidationIssue[] {
  switch (rule.type) {
    case 'dim_consistency': return evalDimConsistency(rule, data)
    case 'membership':      return evalMembership(rule, data)
    case 'range_overlap':   return evalRangeOverlap(rule, data)
    case 'custom':          return evalCustom(rule, data)
  }
}

/**
 * Evalúa todas las reglas declaradas en `TABLE_REGISTRY[tableId].relations`.
 * Útil cuando se acaba de subir la tabla `tableId` y hay que confirmar que
 * cumple sus reglas contra los datos ya cargados.
 */
export function evaluateAllRulesForTable(
  tableId: TableId,
  data: DataByTable,
): CrossTableValidationIssue[] {
  const def = TABLE_REGISTRY[tableId]
  if (!def?.relations) return []
  return def.relations.flatMap((rule) => evaluateCrossTableRule(rule, data))
}

// ─── Compat shims (pre-Sprint E API) ────────────────────────────────────────
// UploadPage y otros consumers existentes usan estas funciones. Se reescribieron
// internamente para usar el dispatcher genérico, sin romper la API pública.

export function getSharedMetaSalesDimensions(): string[] {
  return sharedDimsBetween('metas', 'sales')
}

export function selectSalesForMetasValidation(
  wizardSales: LooseRecord[] | undefined,
  existingSales: LooseRecord[] | undefined,
): LooseRecord[] {
  return wizardSales && wizardSales.length > 0 ? wizardSales : existingSales ?? []
}

export function findMetaDimsMissingFromSales(
  metasRecords: LooseRecord[],
  salesRecords: LooseRecord[],
): string[] {
  // Reescrito para usar el dispatcher: corre la regla dim_consistency
  // metas→sales y extrae missingFromTarget del detail.
  const issues = evaluateCrossTableRule(
    {
      type: 'dim_consistency',
      sourceTable: 'metas',
      targetTable: 'sales',
      severity: 'error',
      requireTargetLoaded: false,
    },
    { metas: metasRecords, sales: salesRecords },
  )
  if (issues.length === 0) return []
  const missing = issues[0].details?.missingFromTarget
  return Array.isArray(missing) ? missing as string[] : []
}
