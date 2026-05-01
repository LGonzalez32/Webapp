// registry-types.ts
// Tipos shared entre TABLE_REGISTRY (runtime) y los record types (compile-time).
// Foundation de Sprint B del roadmap docs/ROADMAP-INGESTA-REGISTRY.md.
// La derivación de tipos canónicos (Sprint G) usa estas definiciones.

/** Tipos primitivos que un campo puede llevar tras parsing. */
export type ValueType = 'string' | 'number' | 'date' | 'boolean'

/** Rol semántico del campo en el modelo de datos. */
export type FieldRole = 'date' | 'metric' | 'dimension' | 'attribute'

/**
 * Metadata enriquecida por campo. Es la fuente de verdad para:
 *   - tipos derivados (Sprint G)
 *   - UI de chips, plantilla, preview (Sprint C)
 *   - obligatoriedad y roles agregados (Sprint B)
 *
 * `nullable=true` ⇔ campo opcional (no requerido). En tipos derivados produce
 * `key?: ValueType`.
 */
export interface FieldDefinition {
  /** Nombre canónico. Coincide con la key de TableDefinition.mappings. */
  key: string
  /** Etiqueta humana para UI (chips, headers de plantilla, preview). */
  label: string
  /** Texto de ayuda corto, opcional. Se muestra como tooltip o sublabel. */
  description?: string
  /** Valor de ejemplo para la plantilla descargable. */
  example?: string | number
  /** Rol semántico — agrupa el campo en {date, metric, dimension, attribute}. */
  role: FieldRole
  /** Tipo primitivo del valor parseado. Drives tipo derivado. */
  valueType: ValueType
  /** Si true, el campo no es obligatorio. */
  nullable: boolean
  /** Orden visual en chips, plantilla, preview. */
  displayOrder: number
  /**
   * Marca el campo como parte de un grupo de obligatoriedad.
   * Ej: 'metric_pair' agrupa 'unidades' y 'venta_neta' como
   * "al menos uno de los dos".
   */
  requirementGroup?: string
  /** Si true, aparece en la plantilla XLSX descargable. Default true. */
  visibleInTemplate?: boolean
  /** Si true, aparece en el panel DataPreview de chips. Default true. */
  visibleInPreview?: boolean
}

/**
 * Reglas cross-table declarativas. Discriminated union — Sprint E lo consume.
 * Por ahora se incluye en el shape para que TableDefinition esté completo,
 * pero el evaluador genérico vive en uploadValidation.ts (no se reescribe en B).
 */
export type CrossTableRule =
  | {
      type: 'dim_consistency'
      sourceTable: string
      targetTable: string
      severity: 'error' | 'warning'
      requireTargetLoaded?: boolean
    }
  | {
      type: 'membership'
      sourceTable: string
      sourceField: string
      targetTable: string
      targetField: string
      severity: 'error' | 'warning'
    }
  | {
      type: 'range_overlap'
      sourceTable: string
      sourceField: string
      targetTable: string
      targetField: string
      severity: 'error' | 'warning'
      mode: 'within' | 'intersect'
    }
  | {
      type: 'custom'
      name: string
      severity: 'error' | 'warning'
      params?: Record<string, unknown>
    }

// ─── Helpers de derivación ─────────────────────────────────────────────────

/** Mapea ValueType al tipo TS primitivo correspondiente. */
type ValueTypeToTs<V extends ValueType> =
  V extends 'string'  ? string  :
  V extends 'number'  ? number  :
  V extends 'date'    ? Date    :
  V extends 'boolean' ? boolean :
  never

/**
 * Helper interno: aplica `?` cuando nullable=true.
 * Usamos un trick con intersección para que TS preserve el optional.
 */
type ApplyOptional<F extends FieldDefinition> =
  F['nullable'] extends true
    ? { [K in F['key']]?: ValueTypeToTs<F['valueType']> }
    : { [K in F['key']]:  ValueTypeToTs<F['valueType']> }

/**
 * Deriva el record type de una colección de FieldDefinition.
 * Sprint G consumirá esto para reemplazar interfaces estáticas.
 *
 * Ejemplo de uso (cuando esté el registry tipado fuerte):
 *   type SaleRecord = InferRecord<typeof TABLE_REGISTRY.sales.fields>
 */
export type InferRecord<
  Fields extends Record<string, FieldDefinition>
> = {
  [K in keyof Fields as Fields[K]['nullable'] extends true ? never : Fields[K]['key']]:
    ValueTypeToTs<Fields[K]['valueType']>
} & {
  [K in keyof Fields as Fields[K]['nullable'] extends true ? Fields[K]['key'] : never]?:
    ValueTypeToTs<Fields[K]['valueType']>
}

// Marker para evitar warnings de helper no exportado
export type _ApplyOptional<F extends FieldDefinition> = ApplyOptional<F>

// ─── Helpers de runtime ────────────────────────────────────────────────────

/** Extrae las keys de los fields que tienen un rol específico. */
export function fieldsByRole(
  fields: Record<string, FieldDefinition>,
  role: FieldRole,
): readonly string[] {
  return Object.values(fields)
    .filter(f => f.role === role)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map(f => f.key)
}

/** Devuelve true si todos los keys requeridos por roles existen como fields. */
export function rolesConsistentWithFields(
  fields: Record<string, FieldDefinition>,
  roles: { date: readonly string[]; metrics: readonly string[]; dimensions: readonly string[]; attributes: readonly string[] },
): { ok: true } | { ok: false; missing: string[] } {
  const missing: string[] = []
  const allRolesKeys = [...roles.date, ...roles.metrics, ...roles.dimensions, ...roles.attributes]
  for (const k of allRolesKeys) {
    if (!fields[k]) missing.push(k)
  }
  return missing.length === 0 ? { ok: true } : { ok: false, missing }
}
