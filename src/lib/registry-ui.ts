// registry-ui.ts
// Helpers que derivan estructuras de UI desde TABLE_REGISTRY.
// Sprint C del roadmap docs/ROADMAP-INGESTA-REGISTRY.md.
//
// Cualquier consumidor de UI (UploadPage, TemplatePreviewModal, DataPreview, etc.)
// debe leer desde acá, no construir arrays paralelos hardcodeados.
// Si necesitás un nuevo formato de UI, agregá un helper acá y migra el consumer.

import { TABLE_REGISTRY, type TableId } from './fileParser'
import type { FieldDefinition, FieldRole } from './registry-types'

export interface UiHeader {
  /** Canonical key del field. */
  col: string
  /** Si el campo es obligatorio (a nivel de fila individual, no grupal). */
  req: boolean
  /** Label legible para mostrar al usuario. */
  label: string
  /** Tooltip / help text opcional. */
  description?: string
  /** Rol — útil para badges o agrupado visual. */
  role: FieldRole
}

/**
 * Contexto en que se renderizan los headers:
 *  - 'template': para la plantilla XLSX descargable. Filtra por
 *    `visibleInTemplate !== false`. Útil para evitar duplicados de campos
 *    alternativos (ej. mes_periodo vs mes+anio: solo el canónico va).
 *  - 'preview': para el panel inline (TablaEjemplo, DataPreview chips).
 *    Filtra por `visibleInPreview !== false`. Muestra todas las
 *    alternativas para informar al usuario que el parser las acepta.
 *  - 'all': sin filtro. Útil para auditoría.
 */
export type UiHeaderContext = 'template' | 'preview' | 'all'

/**
 * Devuelve los headers ordenados por displayOrder, filtrados por contexto.
 * Reemplaza los arrays hardcodeados VENTAS_HEADERS/METAS_HEADERS/INVENTARIO_HEADERS
 * en UploadPage.
 */
export function getUiHeaders(tableId: TableId, context: UiHeaderContext = 'preview'): UiHeader[] {
  const def = TABLE_REGISTRY[tableId]
  if (!def) return []
  const required = new Set(def.obligatoriedad?.requireAllOf ?? [])
  return Object.values(def.fields)
    .filter(f => {
      if (context === 'template') return f.visibleInTemplate !== false
      if (context === 'preview')  return f.visibleInPreview  !== false
      return true
    })
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map(f => ({
      col: f.key,
      req: required.has(f.key),
      label: f.label,
      description: f.description,
      role: f.role,
    }))
}

/**
 * Genera la lista de headers (string[]) para construir la sheet XLSX de
 * plantilla. Filtra alternativas duplicadas via `visibleInTemplate`.
 */
export function getTemplateHeaderRow(tableId: TableId): string[] {
  return getUiHeaders(tableId, 'template').map(h => h.col)
}

/**
 * Genera filas de ejemplo para la plantilla XLSX usando los `example` de
 * cada FieldDefinition. Mismo filtro que getTemplateHeaderRow para que
 * headers y row tengan mismo length.
 */
export function getTemplateExampleRow(
  tableId: TableId,
  variants?: Record<string, string | number>,
): Array<string | number> {
  return getUiHeaders(tableId, 'template').map(h => {
    if (variants && h.col in variants) return variants[h.col]
    const field = TABLE_REGISTRY[tableId].fields[h.col]
    return field?.example ?? ''
  })
}

/**
 * Genera filas de ejemplo para el preview inline (TablaEjemplo). Mismo
 * filtro que `getUiHeaders(tableId, 'preview')` — incluye campos
 * alternativos que NO van en la plantilla pero el parser sí acepta.
 */
export function getPreviewExampleRow(
  tableId: TableId,
  variants?: Record<string, string | number>,
): Array<string | number> {
  return getUiHeaders(tableId, 'preview').map(h => {
    if (variants && h.col in variants) return variants[h.col]
    const field = TABLE_REGISTRY[tableId].fields[h.col]
    return field?.example ?? ''
  })
}

/**
 * Devuelve todos los nombres canónicos de campos que llevan rol 'date'
 * en cualquier tabla del registry. Usado por DataPreview para identificar
 * columnas que deben renderizarse como fecha en el preview.
 */
export function getAllDateFieldKeys(): readonly string[] {
  const set = new Set<string>()
  for (const def of Object.values(TABLE_REGISTRY)) {
    for (const f of Object.values(def.fields)) {
      if (f.role === 'date') set.add(f.key)
    }
  }
  return [...set]
}

/**
 * Devuelve las tablas que el usuario sube en el wizard, ordenadas por
 * displayOrder. Sprint D consumirá esto para generar pasos del wizard
 * dinámicamente.
 */
export function getUserUploadTables(): Array<{ id: TableId; def: typeof TABLE_REGISTRY[TableId] }> {
  return Object.entries(TABLE_REGISTRY)
    .map(([id, def]) => ({ id: id as TableId, def }))
    .filter(x => x.def.isUserUpload)
    .sort((a, b) => a.def.displayOrder - b.def.displayOrder)
}

/**
 * [Sprint D] Genera los pasos iniciales del wizard desde el registry.
 * Reemplaza el array literal `INITIAL_STEPS` en UploadPage. Cuando agregás
 * una tabla nueva con `isUserUpload: true`, aparece automáticamente como
 * paso del wizard sin tocar UploadPage.
 *
 * Output shape compatible con `UploadStep` de types/index.ts (id, label,
 * description, required, status).
 */
export function getInitialWizardSteps(): Array<{
  id: string
  label: string
  description: string
  required: boolean
  status: 'pending'
}> {
  return getUserUploadTables().map(({ def }) => ({
    id: def.wizardStepId,
    label: def.uploadLabel,
    description: def.description,
    required: def.wizardRequired,
    status: 'pending' as const,
  }))
}

/**
 * [Sprint D] Mapping de wizardStepId → TableId derivado del registry.
 * Reemplaza el `STEP_TO_TABLE_ID` hardcodeado de UploadPage.
 */
export function getStepIdToTableIdMap(): Record<string, TableId> {
  const out: Record<string, TableId> = {}
  for (const { id, def } of getUserUploadTables()) {
    out[def.wizardStepId] = id
  }
  return out
}

/** Helper: el `label` legible de una tabla. */
export function getTableLabel(tableId: TableId): string {
  return TABLE_REGISTRY[tableId]?.label ?? tableId
}

/** Helper: el `uploadLabel` (más descriptivo, para wizard step). */
export function getTableUploadLabel(tableId: TableId): string {
  return TABLE_REGISTRY[tableId]?.uploadLabel ?? TABLE_REGISTRY[tableId]?.label ?? tableId
}

/** Helper: la `description` de la tabla para subtítulos. */
export function getTableDescription(tableId: TableId): string {
  return TABLE_REGISTRY[tableId]?.description ?? ''
}

/**
 * Devuelve el FieldDefinition de un campo si existe en alguna tabla.
 * Útil cuando solo tenés el nombre canónico y necesitás label/description
 * (ej. un chip que solo conoce 'producto' como string).
 */
export function findFieldDefinition(fieldKey: string): FieldDefinition | undefined {
  for (const def of Object.values(TABLE_REGISTRY)) {
    if (def.fields[fieldKey]) return def.fields[fieldKey]
  }
  return undefined
}
