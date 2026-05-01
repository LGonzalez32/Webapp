// [Step B — total migration] Adapter motor 2 → shape legacy `Insight[]`.
// Permite que los 8 consumidores que leen `store.insights` reciban output
// de motor 2 (runInsightEngine + filtrarConEstandar) sin cambios en su lado.
// Algunas características de motor 1 quedarán huérfanas hasta que el feature
// equivalente se porte a motor 2 (decisión explícita del usuario).

import type { Insight, InsightTipo, InsightPrioridad } from '../types'
import type { InsightCandidate } from './insight-engine'

const EMOJI_BY_TIPO: Record<InsightTipo, string> = {
  riesgo_vendedor:   '👤',
  riesgo_cliente:    '🏢',
  riesgo_producto:   '📦',
  riesgo_inventario: '📊',
  riesgo_meta:       '🎯',
  riesgo_equipo:     '👥',
  cruzado:           '🔗',
  hallazgo:          '💡',
}

function mapTipo(insightTypeId: string, dimensionId: string): InsightTipo {
  const t = insightTypeId.toLowerCase()
  const d = dimensionId.toLowerCase()
  if (t.includes('stock') || t.includes('inventario') || t.includes('rotacion') || d === 'inventario' || d === 'producto_inventario') return 'riesgo_inventario'
  if (t.includes('meta') || t.includes('gap')) return 'riesgo_meta'
  if (t.includes('cross') || t.includes('cruzado') || t.includes('migration') || t.includes('co_decline')) return 'cruzado'
  if (d === 'vendedor' || d === 'supervisor') return 'riesgo_vendedor'
  if (d === 'cliente' || t.includes('cliente_dormido') || t.includes('cliente_perdido')) return 'riesgo_cliente'
  if (d === 'producto') return 'riesgo_producto'
  if (d === 'equipo' || d === 'global') return 'riesgo_equipo'
  return 'hallazgo'
}

function mapPrioridad(severity: InsightCandidate['severity']): InsightPrioridad {
  // 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA' → mismo shape
  return severity
}

function mapEntityRefs(dimensionId: string, member: string | undefined, detail: Record<string, unknown>) {
  const m = (member ?? '').trim()
  const d = dimensionId.toLowerCase()
  let vendedor: string | undefined
  let cliente: string | undefined
  let producto: string | undefined

  if (d === 'vendedor' || d === 'supervisor') vendedor = m || undefined
  else if (d === 'cliente') cliente = m || undefined
  else if (d === 'producto') producto = m || undefined

  // Hidratar referencias secundarias desde detail si están disponibles
  if (!vendedor && typeof detail.vendedor === 'string') vendedor = detail.vendedor
  if (!cliente  && typeof detail.cliente  === 'string') cliente  = detail.cliente
  if (!producto && typeof detail.producto === 'string') producto = detail.producto

  return { vendedor, cliente, producto }
}

function buildId(c: InsightCandidate): string {
  const m = c.member && c.member.trim() ? c.member : '_global'
  return `m2:${c.insightTypeId}:${c.dimensionId}:${m}`
}

function buildImpactoEconomico(c: InsightCandidate): Insight['impacto_economico'] | undefined {
  const valor = c.impacto_usd_normalizado ?? null
  if (valor == null || valor === 0) return undefined
  const tipo: 'perdida' | 'riesgo' | 'oportunidad' =
    c.direction === 'up' ? 'oportunidad' :
    c.direction === 'down' ? 'perdida' : 'riesgo'
  return {
    valor: Math.abs(valor),
    descripcion: c.title,
    tipo,
  }
}

export function candidatesToInsights(candidates: InsightCandidate[]): Insight[] {
  return candidates.map((c): Insight => {
    const tipo      = mapTipo(c.insightTypeId, c.dimensionId)
    const prioridad = mapPrioridad(c.severity)
    const refs      = mapEntityRefs(c.dimensionId, c.member, c.detail ?? {})
    const accionTxt = typeof c.accion === 'string'
      ? c.accion
      : (c.accion?.texto ?? undefined)
    const accionObj = typeof c.accion === 'object' && c.accion ? c.accion : undefined
    const impactoUSD = c.impacto_usd_normalizado ?? undefined

    return {
      id:        buildId(c),
      tipo,
      prioridad,
      emoji:     EMOJI_BY_TIPO[tipo] ?? '•',
      titulo:    c.title || '',
      descripcion: c.description || '',
      vendedor:  refs.vendedor,
      cliente:   refs.cliente,
      producto:  refs.producto,
      valor_numerico: c.impacto_valor ?? undefined,
      accion_sugerida: accionTxt,
      impacto_economico: buildImpactoEconomico(c),
      detector:  c.insightTypeId,
      conclusion: c.conclusion,
      accion:    accionObj,
      esPositivo: c.severity === ('positive' as unknown as InsightCandidate['severity']) || c.direction === 'up',
      impactoUSD: typeof impactoUSD === 'number' ? Math.abs(impactoUSD) : undefined,
    }
  })
}
