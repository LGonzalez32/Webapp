/**
 * diagnostic-generator.ts — v2.2.1 (Z.7 T1.5b)
 * T1.5b: fallback de generarAcciones lee sections[Acción] para tipos sin rama dedicada.
 * Generación determinística de acciones para EnrichedDiagnosticBlock.
 * R70, R71, R79, R85, R91: acciones respaldadas por store, sin LLM.
 */

import type { DiagnosticBlock } from '../types/diagnostic-types'
import type { VendorAnalysis, ClienteDormido, CategoriaInventario } from '../types'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface Accion {
  verbo: string
  texto: string
  fuente: string
}

export interface StoreForGenerator {
  vendorAnalysis: VendorAnalysis[]
  clientesDormidos: ClienteDormido[]
  categoriasInventario: CategoriaInventario[]
  tipoMetaActivo: 'uds' | 'usd'
  diasTranscurridos: number
  diasTotalesMes: number
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

const fmtInt = (n: number) => Math.round(n).toLocaleString('es-SV')

export function parseBlockMeta(id: string): {
  engine: 'ie' | 'legacy'
  insightType: string
  dimension: string
} {
  if (id.startsWith('ie-')) {
    if (/^ie-[^-]+-dormido-\d+$/.test(id)) {
      return { engine: 'ie', insightType: 'cliente_dormido', dimension: 'cliente' }
    }
    const m = id.match(/^ie-([^-]+)-(.+)-(\d+)$/)
    if (m) return { engine: 'ie', insightType: m[2], dimension: m[1] }
  }
  if (id.startsWith('vendor-')) return { engine: 'legacy', insightType: 'vendor', dimension: 'vendedor' }
  if (id === 'productos')        return { engine: 'legacy', insightType: 'productos', dimension: 'producto' }
  if (id === 'concentracion')    return { engine: 'legacy', insightType: 'concentracion', dimension: 'concentracion' }
  if (id === 'clientes-sueltos') return { engine: 'legacy', insightType: 'clientes', dimension: 'cliente' }
  if (id === 'positivo')         return { engine: 'legacy', insightType: 'positivo', dimension: 'equipo' }
  return { engine: 'legacy', insightType: 'unknown', dimension: 'unknown' }
}

export function determineSinAccionesLabel(
  block: DiagnosticBlock,
  sujeto: string,
  acciones: Accion[],
  store: StoreForGenerator,
): string | null {
  if (acciones.length > 0) return null
  const prefix = 'Sin acciones sugeridas — '

  const va = store.vendorAnalysis.find(v => v.vendedor === sujeto)
  if (va?.riesgo === 'superando' || (va?.cumplimiento_pct ?? 0) >= 100) {
    return prefix + 'va superando la meta.'
  }

  if (!va) {
    const { dimension } = parseBlockMeta(block.id)
    const hasPositiveDelta = /\+[\d$]/.test(block.summaryShort)
    if (hasPositiveDelta && (dimension === 'cliente' || dimension === 'zona' || dimension === 'departamento' || block.severity === 'positive')) {
      const phrases = [
        'va creciendo con buen ritmo — mantener la relación activa.',
        'mantiene tendencia positiva sostenida.',
      ]
      const idx = (block.id + sujeto).split('').reduce((s, c) => s + c.charCodeAt(0), 0) % 2
      return prefix + phrases[idx]
    }
  }

  if (block.severity === 'positive') {
    return prefix + 'va creciendo con buen ritmo.'
  }

  const allBlockText = [
    block.summaryShort,
    ...block.sections.flatMap(s => s.items),
  ].join(' ').toLowerCase()

  const hasDormidoForVendor = store.clientesDormidos.some(d => d.vendedor === sujeto)
  const hasDormidoMentioned = store.clientesDormidos.some(d =>
    allBlockText.includes(d.cliente.toLowerCase()),
  )
  const textMentionsDormidos =
    /clientes?\s+sin\s+comprar|semanas?\s+sin\s+comprar|d[íi]as?\s+sin\s+comprar/i.test(allBlockText)

  if (hasDormidoForVendor || hasDormidoMentioned || textMentionsDormidos) {
    return prefix + 'revisar la cartera de dormidos manualmente.'
  }

  return prefix + 'los datos históricos no muestran una palanca clara.'
}

export function generarAcciones(
  block: DiagnosticBlock,
  sujeto: string,
  store: StoreForGenerator,
): Accion[] {
  const acciones: Accion[] = []
  const { insightType, engine } = parseBlockMeta(block.id)
  const unidadLabel = store.tipoMetaActivo === 'uds' ? 'uds' : 'USD'
  const allBulletText = block.sections.flatMap(s => s.items).join(' ')

  if (insightType === 'meta_gap') {
    const va = store.vendorAnalysis.find(v => v.vendedor === sujeto)
    if (va) {
      const metaVal = store.tipoMetaActivo === 'uds'
        ? (va.meta_uds ?? va.meta ?? 0)
        : (va.meta_usd ?? va.meta ?? 0)
      const proyeccion = va.proyeccion_cierre ?? 0
      const gap = Math.max(0, (metaVal ?? 0) - proyeccion)
      const diasRestantes = store.diasTotalesMes - store.diasTranscurridos
      if (gap > 0 && diasRestantes > 0 && va.ritmo_necesario != null) {
        acciones.push({
          verbo: 'Reunirse',
          texto: `Reunirse con ${sujeto}: faltan ${fmtInt(gap)} ${unidadLabel} en ${diasRestantes} días (ritmo necesario ${fmtInt(va.ritmo_necesario)} vs actual ${fmtInt(va.ritmo_diario ?? 0)} ${unidadLabel}/día).`,
          fuente: `vendorAnalysis[vendedor="${sujeto}"].ritmo_necesario`,
        })
      }
    }
    const dormidosVendedor = store.clientesDormidos.filter(d => d.vendedor === sujeto)
    if (dormidosVendedor.length > 0) {
      const top = dormidosVendedor.slice(0, 3).map(d => d.cliente).join(', ')
      const resto = dormidosVendedor.length > 3 ? ` y ${dormidosVendedor.length - 3} más` : ''
      acciones.push({
        verbo: 'Llamar',
        texto: `Llamar a los ${dormidosVendedor.length} clientes dormidos de ${sujeto} (${top}${resto}).`,
        fuente: `clientesDormidos.filter(d => d.vendedor === "${sujeto}").length`,
      })
    }
    return acciones
  }

  if (insightType === 'change' || insightType === 'contribution') {
    const isDown = block.severity !== 'positive'
    if (isDown) {
      const dormidosCitados = store.clientesDormidos
        .filter(d => allBulletText.toLowerCase().includes(d.cliente.toLowerCase()))
        .slice(0, 1)
      if (dormidosCitados.length > 0) {
        const d = dormidosCitados[0]
        acciones.push({
          verbo: 'Llamar',
          texto: `Llamar a ${d.cliente} esta semana (${d.dias_sin_actividad} días sin comprar, asignado a ${d.vendedor}).`,
          fuente: `clientesDormidos[cliente="${d.cliente}"].dias_sin_actividad`,
        })
      }
      const lentos = store.categoriasInventario
        .filter(i => i.clasificacion === 'lento_movimiento' || i.clasificacion === 'sin_movimiento')
        .filter(i => allBulletText.toLowerCase().includes(i.categoria.toLowerCase()) ||
                     block.summaryShort.toLowerCase().includes(i.categoria.toLowerCase()))
        .slice(0, 2)
      if (lentos.length > 0) {
        const prods = lentos.map(i => `${i.producto} (${Math.round(i.dias_inventario)}d)`).join(', ')
        acciones.push({
          verbo: 'Revisar inventario',
          texto: `Revisar inventario de ${prods} — alta cobertura con baja rotación.`,
          fuente: `categoriasInventario.filter(i => i.clasificacion === 'lento_movimiento').slice(0, 2)`,
        })
      }
    } else {
      acciones.push({
        verbo: 'Mencionar en junta',
        texto: `Mencionar a ${sujeto} en la junta del lunes como patrón positivo a mantener.`,
        fuente: `block.severity === 'positive'`,
      })
      const topInventario = store.categoriasInventario
        .find(i => allBulletText.toLowerCase().includes(i.categoria.toLowerCase()) &&
                   i.clasificacion === 'normal')
      if (topInventario) {
        acciones.push({
          verbo: 'Confirmar',
          texto: `Confirmar stock de ${topInventario.producto} (${Math.round(topInventario.dias_inventario)} días de cobertura actual).`,
          fuente: `categoriasInventario[producto="${topInventario.producto}"].dias_inventario`,
        })
      }
    }
    return acciones
  }

  if (insightType === 'trend') {
    const isDown = block.severity !== 'positive'
    if (isDown) {
      const dormidoRelated = store.clientesDormidos
        .filter(d => block.summaryShort.toLowerCase().includes(d.cliente.toLowerCase()) ||
                     allBulletText.toLowerCase().includes(d.cliente.toLowerCase()))
        .slice(0, 1)
      if (dormidoRelated.length > 0) {
        const d = dormidoRelated[0]
        acciones.push({
          verbo: 'Llamar',
          texto: `Llamar a ${d.cliente} para confirmar pipeline (tendencia bajista últimos 3 meses).`,
          fuente: `clientesDormidos[cliente="${d.cliente}"].dias_sin_actividad`,
        })
      }
      const segLentos = store.categoriasInventario
        .filter(i => (i.clasificacion === 'lento_movimiento' || i.clasificacion === 'sin_movimiento') &&
                     (block.summaryShort.toLowerCase().includes(i.categoria.toLowerCase()) ||
                      sujeto.toLowerCase().includes(i.categoria.toLowerCase())))
        .slice(0, 1)
      if (segLentos.length > 0) {
        const inv = segLentos[0]
        acciones.push({
          verbo: 'Revisar inventario',
          texto: `Revisar inventario de ${inv.producto} en ${inv.categoria} (${Math.round(inv.dias_inventario)} días de cobertura, clasificación ${inv.clasificacion}).`,
          fuente: `categoriasInventario[producto="${inv.producto}"].dias_inventario`,
        })
      }
    } else {
      acciones.push({
        verbo: 'Confirmar',
        texto: `Confirmar que ${sujeto} tiene stock suficiente para sostener la tendencia creciente.`,
        fuente: `block.severity === 'positive'`,
      })
    }
    return acciones
  }

  if (insightType === 'cliente_dormido') {
    const vendorMatch = allBulletText.match(/vendedor:\s*([^,()\n]+)/i)
    const vendedorNombre = vendorMatch?.[1]?.trim() ?? ''
    acciones.push({
      verbo: 'Llamar',
      texto: `Llamar a ${sujeto}${vendedorNombre ? ` (asignado a ${vendedorNombre})` : ''} esta semana para reactivar la cuenta.`,
      fuente: `clientesDormidos[cliente="${sujeto}"].dias_sin_actividad`,
    })
    return acciones
  }

  // Legacy engine blocks
  if (engine === 'legacy') {
    if (insightType === 'vendor') {
      const vendedorNombre = block.id.replace('vendor-', '')
      const va = store.vendorAnalysis.find(v => v.vendedor === vendedorNombre)
      if (va) {
        const metaVal = store.tipoMetaActivo === 'uds'
          ? (va.meta_uds ?? va.meta ?? 0)
          : (va.meta_usd ?? va.meta ?? 0)
        const gap = Math.max(0, (metaVal ?? 0) - (va.proyeccion_cierre ?? 0))
        const dias = store.diasTotalesMes - store.diasTranscurridos
        if (gap > 0 && dias > 0 && va.ritmo_necesario != null) {
          acciones.push({
            verbo: 'Reunirse',
            texto: `Reunirse con ${vendedorNombre}: faltan ${fmtInt(gap)} ${unidadLabel} en ${dias} días.`,
            fuente: `vendorAnalysis[vendedor="${vendedorNombre}"].proyeccion_cierre`,
          })
        }
      }
      const dormidos = store.clientesDormidos.filter(d => d.vendedor === vendedorNombre)
      if (dormidos.length > 0) {
        const top = dormidos.slice(0, 3).map(d => d.cliente).join(', ')
        const resto = dormidos.length > 3 ? ` y ${dormidos.length - 3} más` : ''
        acciones.push({
          verbo: 'Llamar',
          texto: `Llamar a los ${dormidos.length} clientes dormidos de ${vendedorNombre} (${top}${resto}).`,
          fuente: `clientesDormidos.filter(d => d.vendedor === "${vendedorNombre}")`,
        })
      }
    }

    if (insightType === 'productos') {
      // [PR-FIX.3-C] Si el sujeto de la card es un producto y aparece en inventario
      // con rotación lenta/ausente, priorizarlo. Evita "Bloquear precio/promocionar X"
      // cuando el sujeto real de la card es Y (mismatch narrativo).
      const sujetoEntry = sujeto
        ? store.categoriasInventario.find(i =>
            i.producto === sujeto &&
            (i.clasificacion === 'lento_movimiento' || i.clasificacion === 'sin_movimiento'),
          )
        : undefined
      if (sujetoEntry) {
        acciones.push({
          verbo: 'Revisar rotación',
          texto: `Revisar rotación de ${sujetoEntry.producto} (${Math.round(sujetoEntry.dias_inventario)}d cobertura) — ajustar pedidos o activar promoción.`,
          fuente: `categoriasInventario[producto="${sujetoEntry.producto}"]`,
        })
      } else {
        const lentos = store.categoriasInventario
          .filter(i => i.clasificacion === 'lento_movimiento' || i.clasificacion === 'sin_movimiento')
          .slice(0, 2)
        if (lentos.length > 0) {
          const prods = lentos.map(i => `${i.producto} (${Math.round(i.dias_inventario)}d cobertura)`).join(', ')
          acciones.push({
            verbo: 'Bloquear precio',
            texto: `Bloquear precio / promocionar ${prods} — alta cobertura sin rotación.`,
            fuente: `categoriasInventario.filter(i => i.clasificacion === 'lento_movimiento').slice(0, 2)`,
          })
        }
      }
    }

    if (insightType === 'clientes') {
      const dormidosCitados = store.clientesDormidos
        .filter(d => allBulletText.toLowerCase().includes(d.cliente.toLowerCase()))
        .slice(0, 2)
      for (const d of dormidosCitados) {
        acciones.push({
          verbo: 'Llamar',
          texto: `Llamar a ${d.cliente} (${d.dias_sin_actividad} días sin comprar, atendido por ${d.vendedor}).`,
          fuente: `clientesDormidos[cliente="${d.cliente}"].dias_sin_actividad`,
        })
      }
    }

    if (insightType === 'positivo') {
      acciones.push({
        verbo: 'Mencionar en junta',
        texto: `Mencionar en la junta del lunes las ${block.insightIds.length} señales positivas del período.`,
        fuente: `block.insightIds.length`,
      })
    }
  }

  // [Z.7 T1.5b] fallback: si ninguna rama dedicada generó acciones, leer la sección "Acción" del block.
  // Esto cubre los nuevos tipos (stock_excess, stock_risk, migration, co_decline) cuyas acciones
  // ya fueron generadas por NARRATIVE_TEMPLATES en runInsightEngine y vienen en block.sections.
  if (acciones.length === 0) {
    const accionSection = block.sections.find((s) => s.label === 'Acción')
    if (accionSection && Array.isArray(accionSection.items)) {
      for (const raw of accionSection.items) {
        if (typeof raw !== 'string' || !raw.trim()) continue
        const texto = raw.replace(/^[→\s]+/, '').trim()
        if (!texto) continue
        acciones.push({
          verbo: 'Acción',
          texto,
          fuente: `block.sections[label="Acción"]`,
        })
      }
    }
  }

  return acciones
}
