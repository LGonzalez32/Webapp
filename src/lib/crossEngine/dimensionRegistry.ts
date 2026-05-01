// Registro de dimensiones — capa del cross-engine genérico (./index.ts).
//
// ARQUITECTURA DE DOS SISTEMAS (Z.11.M-4 mini, 2026-04-27):
// Esta lista NO es la fuente del motor 2 hardcoded. Motor 2 lee de
// `insight-registry.ts:DIMENSION_REGISTRY` (lista mínima id+label+field de
// 9 dimensiones). Esta versión enriquecida (con `requires`, `groupBy`,
// `formatValue`, `ordinalPriority`) sirve solo al cross-engine para
// iterar metric × dim × type y filtrar por DataAvailability.
//
// Solapamiento intencional con `insight-registry.ts`:
//   - 7 dimensiones en común (vendedor, producto, categoria, departamento,
//     supervisor, canal, cliente).
//   - `mes` solo acá (uso temporal del cross-engine).
//   - `subcategoria` y `proveedor` solo en insight-registry (motor 2 las
//     usa pero el cross-engine no las contempla aún).
//
// Reglas:
//   - NO probabilidad, NO IA. Agrupaciones deterministas.
//   - Cada dimensión declara `requires: Array<keyof DataAvailability>` y solo
//     aparece como "disponible" cuando TODOS sus flags son true.
//   - `vendedor` y `mes` son siempre disponibles.
//   - `cliente.groupBy` usa clientKey (poblado en parser/demo).

import type { SaleRecord, DataAvailability } from '../../types'

export type DimensionId =
  | 'vendedor'
  | 'producto'
  | 'categoria'
  | 'departamento'
  | 'supervisor'
  | 'canal'
  | 'cliente'
  | 'mes'

export interface Dimension {
  id: DimensionId
  label: string
  pluralLabel: string
  /** Flags de DataAvailability requeridos para que la dimensión esté disponible. */
  requires: Array<keyof DataAvailability>
  /** Clave de agrupación por fila. null = fila excluida de la dimensión. */
  groupBy: (sale: SaleRecord) => string | null
  /** Formato de display de la clave. */
  formatValue: (groupKey: string) => string
  /** Prioridad de orden por defecto en la UI (menor = más arriba). */
  ordinalPriority: number
}

const _monthKey = (d: Date): string => {
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  return `${y}-${m.toString().padStart(2, '0')}`
}

export const DIMENSION_REGISTRY_V2: Dimension[] = [
  {
    id: 'vendedor',
    label: 'Vendedor', pluralLabel: 'Vendedores',
    requires: [],                                 // vendedor es campo obligatorio en SaleRecord
    groupBy: s => (s.vendedor && s.vendedor.trim() !== '') ? s.vendedor : null,
    formatValue: k => k,
    ordinalPriority: 1,
  },
  {
    id: 'producto',
    label: 'Producto', pluralLabel: 'Productos',
    requires: ['has_producto'],
    groupBy: s => (s.producto && s.producto.trim() !== '') ? s.producto : null,
    formatValue: k => k,
    ordinalPriority: 2,
  },
  {
    id: 'categoria',
    label: 'Categoría', pluralLabel: 'Categorías',
    requires: ['has_categoria'],
    groupBy: s => (s.categoria && s.categoria.trim() !== '') ? s.categoria : null,
    formatValue: k => k,
    ordinalPriority: 3,
  },
  {
    id: 'departamento',
    label: 'Departamento', pluralLabel: 'Departamentos',
    requires: ['has_departamento'],
    groupBy: s => (s.departamento && s.departamento.trim() !== '') ? s.departamento : null,
    formatValue: k => k,
    ordinalPriority: 4,
  },
  {
    id: 'supervisor',
    label: 'Supervisor', pluralLabel: 'Supervisores',
    requires: ['has_supervisor'],
    groupBy: s => (s.supervisor && s.supervisor.trim() !== '') ? s.supervisor : null,
    formatValue: k => k,
    ordinalPriority: 5,
  },
  {
    id: 'canal',
    label: 'Canal', pluralLabel: 'Canales',
    requires: ['has_canal'],
    groupBy: s => (s.canal && s.canal.trim() !== '') ? s.canal : null,
    formatValue: k => k,
    ordinalPriority: 6,
  },
  {
    id: 'cliente',
    label: 'Cliente', pluralLabel: 'Clientes',
    requires: ['has_cliente'],
    groupBy: s => s.clientKey ?? (s.cliente?.trim().toUpperCase() || null),
    formatValue: k => k === 'SIN_CLIENTE' ? 'Sin cliente' : k,
    ordinalPriority: 7,
  },
  {
    id: 'mes',
    label: 'Mes', pluralLabel: 'Meses',
    requires: [],                                 // mes siempre deriva de fecha
    groupBy: s => s.fecha instanceof Date ? _monthKey(s.fecha) : null,
    formatValue: k => k,                          // PR-M6 puede humanizar a "Mar 2026"
    ordinalPriority: 8,
  },
]

/**
 * Filtra DIMENSION_REGISTRY_V2 por los flags activos en DataAvailability.
 * Una dimensión es "disponible" si TODOS sus flags `requires` son `true`.
 */
export function getAvailableDimensions(availability: DataAvailability): Dimension[] {
  return DIMENSION_REGISTRY_V2.filter(d =>
    d.requires.every(flag => availability[flag] === true),
  )
}

/** Lookup directo por id. */
export function getDimensionById(id: DimensionId): Dimension | null {
  return DIMENSION_REGISTRY_V2.find(d => d.id === id) ?? null
}
