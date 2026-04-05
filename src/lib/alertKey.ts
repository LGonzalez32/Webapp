import type { Insight } from '../types'

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

/**
 * Genera una clave estable para identificar un insight entre re-procesamientos.
 * Combina tipo + detector (si existe) + entidades principales.
 * El id del insight NO es estable (usa contador), por eso usamos esta clave.
 */
export function getAlertKey(insight: Insight): string {
  // Usa detector explícito si existe; si no, extrae el prefijo del id
  // El id tiene formato "prefijo-numero" (ej: "doble-riesgo-20") — el prefijo es estable
  const detector = insight.detector ?? (insight.id ? insight.id.replace(/-\d+$/, '') : '')

  const parts: string[] = [insight.tipo]
  if (detector) parts.push(normalize(detector))
  if (insight.vendedor) parts.push(normalize(insight.vendedor))
  if (insight.cliente)  parts.push(normalize(insight.cliente))
  if (insight.producto) parts.push(normalize(insight.producto))

  // Fallback: si el título tiene "Descripción — Entidad", usar la entidad para
  // diferenciar alertas del mismo tipo/detector sin campos de entidad (ej: riesgo_producto
  // donde 3 categorías generan alertas idénticas salvo el título)
  if (insight.titulo) {
    const titleEntity = insight.titulo.includes(' — ')
      ? insight.titulo.split(' — ').pop()!.trim()
      : ''
    if (titleEntity && !parts.some(p => p === normalize(titleEntity))) {
      parts.push(normalize(titleEntity))
    }
  }

  return parts.join('__')
}
