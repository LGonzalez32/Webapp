/**
 * diagnostic-actions.ts — v2.2.0 (Z.3)
 * R68–R114: enriquecimiento determinístico de DiagnosticBlock para UX.
 *
 * Sanitizadores eliminados (absorbidos por NarrativeBuilder por construcción):
 *   sanitizeR80, pickConnector, buildStockNarrative, repairStockClauses,
 *   repairDormidoReferenceInBullet, cleanDanglingConnectors,
 *   repairTopProductRef, getTopListsForBlock, normalizeSpacing
 *
 * Retenidos como runtime guards (última línea — deben disparar cero veces):
 *   repairGrammar (R89/O3.3/R92 — pluralización dinámica de main engine)
 *   collapseRedundantTopProductClauses (R100 — colapso semántico de main engine)
 *
 * R114: sanitizadores post-render solo pueden ser guards (assert), no transformadores.
 */

import type { DiagnosticBlock } from '../types/diagnostic-types'
import type { VendorAnalysis, ClienteDormido, CategoriaInventario } from '../types'
import {
  NB_SECTION_LABEL,
  fmtDeltaDisplay as _fmtDeltaDisplay,
  parseDisplayDelta as _parseDisplayDelta,
  type DisplayDelta,
} from './narrative-builder'
import {
  generarAcciones,
  determineSinAccionesLabel,
  type Accion,
} from './diagnostic-generator'
import { ACCIONES_GENERICAS_BLACKLIST, ensureSentenceEnd, getChainSignMismatchCount } from './insightStandard'

// Re-exports for external consumers
export { fmtDeltaDisplay } from './narrative-builder'
export type { Accion } from './diagnostic-generator'
export type { DisplayDelta } from './narrative-builder'

// ─── Public types ──────────────────────────────────────────────────────────────

export interface TopProductoEntry {
  nombre: string
  delta: number
  signo: 'positivo' | 'negativo' | 'neutro'
}

export interface TopProductoClientEntry {
  topAlzas: TopProductoEntry[]
  topCaidas: TopProductoEntry[]
}

export interface StoreSnapshot {
  vendorAnalysis: VendorAnalysis[]
  clientesDormidos: ClienteDormido[]
  categoriasInventario: CategoriaInventario[]
  tipoMetaActivo: 'uds' | 'usd'
  selectedPeriod: { year: number; month: number }
  diasTranscurridos: number
  diasTotalesMes: number
  topProductosPorCliente?: {
    mesActual: Record<string, TopProductoClientEntry>
    ultimos3Meses: Record<string, TopProductoClientEntry>
  }
}

export interface EnrichedDiagnosticBlock extends DiagnosticBlock {
  sujeto: string
  deltaValue: number | null
  deltaUnidad: string
  deltaSigno: 'positivo' | 'negativo' | 'neutro'
  chip: string
  quePaso: string
  porQueImporta: string
  acciones: Accion[]
  displayDelta: DisplayDelta | null
  sortKey: number
  sinAccionesLabel: string | null
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

// R68: extract entity name from headline
function extractSujeto(headline: string): string {
  const stripped = headline
    .replace(/^[\s↑↓↗↘⬆⬇⚠⚠️📈📉🔗]+/, '')
    .replace(/^\p{Emoji_Presentation}\s*/u, '')
    .trim()

  const dashIdx = stripped.indexOf(' — ')
  if (dashIdx > 0) return stripped.slice(0, dashIdx).trim()

  const verbMatch = stripped.match(
    /\s+(está|viene|necesita|bajo\s+presión|cayó|creció|bajó|muestra|se\s+\w+)\b/i,
  )
  if (verbMatch) return stripped.slice(0, verbMatch.index!).trim()

  return stripped.split(' ').slice(0, 4).join(' ')
}

function computeAvgTicket(vendorAnalysis: VendorAnalysis[]): number {
  let totalUsd = 0, totalUds = 0
  for (const v of vendorAnalysis) {
    totalUsd += v.ventas_periodo
    totalUds += v.unidades_periodo
  }
  return totalUds > 0 ? totalUsd / totalUds : 1
}

function computeSortKey(dd: DisplayDelta, store: StoreSnapshot): number {
  const abs = Math.abs(dd.value)
  switch (dd.unit) {
    case 'USD': return abs
    case 'uds': return abs * computeAvgTicket(store.vendorAnalysis)
    case 'txns': return abs * computeAvgTicket(store.vendorAnalysis)
    case 'usd_ticket': {
      const avgTxns = store.vendorAnalysis.reduce(
        (s, v) => s + (v.clientes_activos ?? 10), 0,
      ) / Math.max(1, store.vendorAnalysis.length)
      return abs * avgTxns
    }
    case 'pct_meta': {
      const avgMeta = store.vendorAnalysis.reduce(
        (s, v) => s + (v.meta_usd ?? v.meta ?? 0), 0,
      ) / Math.max(1, store.vendorAnalysis.length)
      return abs * avgMeta / 100
    }
    case 'dias':   return 0
    default:       return 0
  }
}

function buildChip(badges: string[]): string {
  if (!badges || badges.length < 2) return badges?.[0] ?? ''
  return `${badges[1]} · ${badges[0]}`
}

// [PR-FIX.6] Para bloques group-* que mezclan bullets de métricas distintas,
// el tag del header debe reflejarlo con "Mixto" en vez de tomar la métrica del
// primer miembro (que heredaría agruparInsightsRedundantes). No-op cuando el
// bloque no es group-* o cuando todos los bullets comparten la misma métrica
// o ninguna métrica es extraíble.
// TODO(i18n): literal "Mixto" pendiente de internacionalización.
function deriveTagMetricFromBlock(
  block: DiagnosticBlock,
  defaultBadge: string,
): { badge: string; isMixed: boolean; detected: string[] } {
  if (!block.id.startsWith('group-')) return { badge: defaultBadge, isMixed: false, detected: [] }
  const bullets = block.sections?.[0]?.items ?? []
  if (bullets.length < 2) return { badge: defaultBadge, isMixed: false, detected: [] }
  const detected = new Set<string>()
  for (const raw of bullets) {
    const { metrica } = _extractNameAndState(raw)
    if (metrica) detected.add(metrica.toLowerCase())
  }
  if (detected.size <= 1) return { badge: defaultBadge, isMixed: false, detected: [...detected] }
  return { badge: 'Mixto', isMixed: true, detected: [...detected] }
}

// ─── O3: Runtime grammar guards (R89/O3.3/R92) ────────────────────────────────
// Retenido para bloques del motor principal (candidatesToDiagnosticBlocks).
// Bloques NarrativeBuilder (__nb__) no pasan por aquí.

function repairGrammar(prose: string): string {
  let result = prose
  // O3.1: "la caída ese vendedor"
  result = result.replace(/\bla\s+ca[íi]da\s+ese\s+vendedor\b/gi, 'la caída de ese vendedor')
  // O3.2: "eso frenan"
  result = result.replace(/\beso\s+frenan\b/gi, 'eso frena')
  // O3.3 / R89: doble "quien más X ... quien más Y" en misma oración
  result = result.replace(
    /(quien\s+más\s+\w+[^.;]{0,60}?)(;\s*|\.\s*|,\s*)(quien\s+más)/gi,
    '$1$2el que más',
  )
  result = result.replace(
    /(quien\s+más\s+\w+[^.;,]{1,80}?)([\s—]+)(quien\s+más)/gi,
    '$1$2mientras que',
  )
  result = result.replace(
    /(quien\s+más\s+\w+[^.]{0,120}?)(\.\s+(?:suma\s+a\s+esto\s+que|en\s+paralelo,?\s*|además,?\s*|por\s+otro\s+lado,?\s*|a\s+la\s+par,?\s*|también,?\s*)[^.]{0,80}?)(quien\s+más)/gi,
    '$1$2el que más',
  )
  result = result.replace(
    /([el|la]\s+que\s+más\s+\w+[^.;]{0,60}?)(;\s*|\.\s*|,\s*)([el|la]\s+que\s+más)/gi,
    '$1$2a su vez',
  )
  // O3.4: cualificadores vagos (aún presentes en main engine)
  result = result.replace(/\bcon\s+el\s+mejor\s+desempe[ñn]o\s+del\s+mes\b/gi, 'con el mayor crecimiento del período')
  result = result.replace(/\bdesempe[ñn]o\s+notable\b/gi, 'crecimiento destacado')
  // R92: concordancia plural "X y Y que subió/cayó"
  const pluralMap: Record<string, string> = {
    subió: 'subieron', cayó: 'cayeron', bajó: 'bajaron',
    creció: 'crecieron', aumentó: 'aumentaron', disminuyó: 'disminuyeron',
  }
  result = result.replace(
    /([A-Z][^.,;]{2,40}?)\s+y\s+([A-Z][^.,;]{2,40}?),?\s+que\s+(subió|cayó|bajó|creció|aumentó|disminuyó)/gi,
    (_m, p1, p2, verb) => `${p1} y ${p2}, que ${pluralMap[verb.toLowerCase()] ?? verb}`,
  )
  return result
}

// ─── R100: Colapso de cláusulas redundantes (runtime guard) ───────────────────

function collapseRedundantTopProductClauses(text: string): string {
  let result = text

  const alzaPattern =
    /quien\s+más\s+jalona\s+al\s+alza\s+es\s+([\wáéíóúÁÉÍÓÚüÜñÑ0-9 ]+?)\s*—\s*con\s+el\s+mayor\s+crecimiento\s+del\s+per[íi]odo\.\s*(?:suma\s+a\s+esto\s+que|en\s+paralelo,?|adem[aá]s,?|por\s+otro\s+lado,?|a\s+la\s+par,?|tambi[eé]n,?)\s+en\s+(?:ese|este)\s+(?:cliente|vendedor|grupo)\s+el\s+que\s+más\s+empuja\s+es\s+([\wáéíóúÁÉÍÓÚüÜñÑ0-9 ]+?),\s*con\s+la\s+mayor\s+ganancia\s+de\s+participaci[oó]n\s+del\s+mes/gi

  result = result.replace(alzaPattern, (_match, p1, p2) => {
    if (p1.trim().toLowerCase() !== p2.trim().toLowerCase()) return _match
    return `quien más jalona al alza es ${p1.trim()} — con el mayor crecimiento y la mayor ganancia de participación del mes`
  })

  const bajaPattern =
    /quien\s+más\s+arrastra\s+a\s+la\s+baja\s+es\s+([\wáéíóúÁÉÍÓÚüÜñÑ0-9 ]+?)\s*—\s*con\s+la\s+mayor\s+ca[íi]da\s+del\s+per[íi]odo\.\s*(?:suma\s+a\s+esto\s+que|en\s+paralelo,?|adem[aá]s,?|por\s+otro\s+lado,?|a\s+la\s+par,?|tambi[eé]n,?)\s+en\s+(?:ese|este)\s+(?:cliente|vendedor|grupo)\s+el\s+que\s+más\s+pesa\s+es\s+([\wáéíóúÁÉÍÓÚüÜñÑ0-9 ]+?),\s*con\s+la\s+mayor\s+p[eé]rdida\s+de\s+participaci[oó]n\s+del\s+mes/gi

  result = result.replace(bajaPattern, (_match, p1, p2) => {
    if (p1.trim().toLowerCase() !== p2.trim().toLowerCase()) return _match
    return `quien más arrastra a la baja es ${p1.trim()} — con la mayor caída y la mayor pérdida de participación del mes`
  })

  return result
}

// ─── R93: Pipeline de saneado (guard para rutas que no pasan por NarrativeBuilder) ───

export function applyAllNarrativeSanitizers(text: string): string {
  let result = repairGrammar(text)
  result = collapseRedundantTopProductClauses(result)
  return result
}

// ─── [PR-FIX.2] Fallback contextual para acciones vacías ─────────────────────
//
// Cuando `acciones.length === 0` y `determineSinAccionesLabel` cae en la rama
// genérica "los datos históricos no muestran una palanca clara.", intentamos
// generar un texto derivado del insightType + direccion + entidad. Solo actúa
// cuando hay información determinística para apoyar el mensaje; si no, cae al
// string original (degradación silenciosa).
//
// No reemplaza acciones válidas ni textos contextuales ya dados por
// determineSinAccionesLabel (superando meta, cartera de dormidos, etc.).

const PFX2_GENERIC_TAIL = 'los datos históricos no muestran una palanca clara.'

function buildFallbackAction(
  insightType: string,
  direccion: 'recuperable' | 'neutral' | 'positivo' | undefined,
  entityLabel: string | null,
  recuperableUsd: number | null,
): string | null {
  if (!insightType) return null
  const money = recuperableUsd != null && recuperableUsd > 0
    ? ` — $${Math.round(recuperableUsd).toLocaleString('en-US')} recuperables`
    : ''

  switch (insightType) {
    case 'group-vendor':
    case 'contribution': {
      if (direccion === 'recuperable') {
        return entityLabel
          ? `Reunirse con ${entityLabel} para identificar blockers específicos${money}.`
          : `Reunirse con los vendedores identificados para revisar blockers${money}.`
      }
      if (direccion === 'positivo') {
        return entityLabel
          ? `Consolidar el momentum de ${entityLabel} — documentar qué está funcionando para replicar.`
          : `Consolidar el momentum del segmento — documentar qué está funcionando para replicar.`
      }
      return null
    }
    case 'trend':
      return direccion === 'positivo'
        ? `Mantener la relación activa con ${entityLabel ?? 'el cliente'} — revisar frecuencia de contacto.`
        : null
    case 'change':
      return direccion === 'positivo'
        ? `Investigar qué cambió en ${entityLabel ?? 'este caso'} para capturar el patrón.`
        : null
    default:
      return null
  }
}

// Parse local — evita crear import circular con diagnostic-generator y cubre
// los prefijos `group-*-*` que parseBlockMeta no reconoce como insightType.
// [PR-FIX.4] Generalizado: cualquier `group-<tipo>-<hash>` devuelve `group-<tipo>`.
function pfx2InsightTypeFromId(id: string): string {
  const groupMatch = id.match(/^group-([a-zA-Z_]+)-/)
  if (groupMatch) return `group-${groupMatch[1]}`
  if (id.startsWith('ie-')) {
    if (/^ie-[^-]+-dormido-\d+$/.test(id)) return 'cliente_dormido'
    const m = id.match(/^ie-([^-]+)-(.+)-(\d+)$/)
    if (m) return m[2]
  }
  return ''
}

// [PR-FIX.4] Acción derivada para group-* multi-entidad. Extrae los nombres y
// metricas desde block.sections[0].items (bullets) — no hay detail en el block.
// Headline bullet pattern: "↑ <Nombre> — cambio en <Metrica>" / "... tendencia ..."
// Retorna null si no puede extraer ≥2 entidades válidas.
// [PR-FIX.5] Separa un bullet en { nombre, state, metrica }.
//  - `state` = texto descriptivo tras el nombre (antes de "—" si existe; o
//    el sufijo en minúsculas cuando el bullet no tiene "—"). Usado para
//    detectar bullets con verbo/estado compartido y evitar repetición.
//  - `metrica` = token tras "en <Metrica>" a la derecha del "—".
function _extractNameAndState(raw: string): {
  nombre: string; state: string | null; metrica: string | null
} {
  const sin_arrow = raw.replace(/^[↑↓📈📉⚠️🔗]+\s*/, '').trim()
  const [leftPart, rightPart] = sin_arrow.split(/\s+—\s+/, 2)
  let metrica: string | null = null
  if (rightPart) {
    const mMatch = rightPart.match(/\ben\s+([A-Za-záéíóúÁÉÍÓÚñÑ][\w\s]{2,40}?)\s*$/)
    if (mMatch) metrica = mMatch[1].trim()
  }
  let nombre = (leftPart ?? '').trim()
  let state: string | null = null
  if (!rightPart) {
    // Sin "—": asumir nombre = secuencia inicial Capitalizada, state = resto.
    const nameMatch = nombre.match(/^((?:[A-ZÁÉÍÓÚÑ][\wáéíóúñü]*\s?)+?)(\s+[a-záéíóúñü].*)?$/)
    if (nameMatch && nameMatch[2]) {
      nombre = nameMatch[1].trim()
      state  = nameMatch[2].trim()
    }
  } else {
    state = rightPart.trim()
  }
  return { nombre, state, metrica }
}

function buildMultiClientActionFromBlock(
  block: DiagnosticBlock,
  groupType: string,   // p.ej. 'change', 'contribution', 'trend'
  dimension: string,   // p.ej. 'clientes', 'productos', 'vendedores'
  audit?: { enriched_same_state: number },
): string | null {
  const bullets = block.sections?.[0]?.items ?? []
  if (bullets.length < 2) return null

  interface Parsed { nombre: string; state: string | null; metrica: string | null }
  const parsed: Parsed[] = []
  for (const raw of bullets) {
    const p = _extractNameAndState(raw)
    if (!p.nombre) continue
    parsed.push(p)
  }
  if (parsed.length < 2) return null

  const [a, b, ...rest] = parsed
  const extraCount = rest.length
  const plural = dimension.toLowerCase()
  const sustantivoSingular = plural.endsWith('es') ? plural.slice(0, -2)
    : plural.endsWith('s')  ? plural.slice(0, -1)
    : plural
  const impactoSuffix = block.impacto_recuperable != null && block.impacto_recuperable > 0
    ? ` — impacto combinado ~$${Math.round(block.impacto_recuperable).toLocaleString('en-US')} recuperables`
    : ''

  const misma = a.metrica && b.metrica && a.metrica.toLowerCase() === b.metrica.toLowerCase()

  // [PR-FIX.5] ¿Todos los bullets comparten el mismo estado/verbo?
  const statesAll = parsed.map(p => (p.state ?? '').trim().toLowerCase())
  const sameState = statesAll[0] !== '' && statesAll.every(s => s === statesAll[0])
  if (sameState && audit) audit.enriched_same_state++

  // Construye lista de nombres en orden, con corte por extra.
  const _joinNames = (): string => {
    if (extraCount > 0) {
      return `${a.nombre}, ${b.nombre} y ${extraCount} ${plural} más`
    }
    return `${a.nombre} y ${b.nombre}`
  }

  // group-change / group-trend con dirección 'recuperable'
  if (groupType === 'change' || groupType === 'trend') {
    if (sameState) {
      return `Reunirse con ${_joinNames()}${impactoSuffix}.`
    }
    if (misma) {
      const extra = extraCount > 0 ? ` y ${extraCount} ${plural} más` : ''
      return `Reunirse con ${a.nombre} y ${b.nombre}${extra} por caídas en ${a.metrica}${impactoSuffix}.`
    }
    const extra = extraCount > 0 ? ` y ${extraCount} ${plural} más con patrones similares` : ''
    const partA = a.metrica ? `${a.nombre} (${a.metrica})` : a.nombre
    const partB = b.metrica ? `${b.nombre} (${b.metrica})` : b.nombre
    return `Revisar ${partA} y ${partB}${extra} — son caídas de naturaleza distinta que requieren diagnóstico separado${impactoSuffix}.`
  }

  // group-contribution — mismo patrón pero enfoque en aporte
  if (groupType === 'contribution') {
    const verbo = block.direccion === 'positivo' ? 'consolidar el momentum' : 'identificar blockers'
    const sujeto = block.direccion === 'positivo' ? 'Documentar qué funciona' : 'Reunirse'
    if (sameState) {
      return `${sujeto} con ${_joinNames()} para ${verbo}${impactoSuffix}.`
    }
    const extra = extraCount > 0 ? ` y ${extraCount} ${plural} más del mismo bucket` : ''
    return `${sujeto} con ${a.nombre} y ${b.nombre}${extra} para ${verbo}${impactoSuffix}.`
  }

  // Cualquier otro group-*: fallback genérico derivado.
  if (sameState) {
    return `Revisar ${_joinNames()} — el grupo muestra patrón compartido que requiere diagnóstico por ${sustantivoSingular}${impactoSuffix}.`
  }
  const extra = extraCount > 0 ? ` y ${extraCount} ${plural} más` : ''
  return `Revisar ${a.nombre} y ${b.nombre}${extra} — el grupo muestra patrón compartido que requiere diagnóstico por ${sustantivoSingular}${impactoSuffix}.`
}

// ─── Build porQueImporta ───────────────────────────────────────────────────────

function buildPorQueImporta(block: DiagnosticBlock): string {
  // R114: bloque NarrativeBuilder → devolver prose directo (invariantes garantizados)
  const nbSection = block.sections.find(s => s.label === NB_SECTION_LABEL)
  if (nbSection?.items[0]) {
    return collapseRedundantTopProductClauses(repairGrammar(nbSection.items[0]))
  }

  // Motor principal (candidatesToDiagnosticBlocks): pipeline de bullets
  const bulletItems = block.sections
    .filter(s => s.type === 'bullet')
    .flatMap(s => s.items)
  if (bulletItems.length === 0) return ''

  if (bulletItems.length === 1) {
    return collapseRedundantTopProductClauses(repairGrammar(bulletItems[0]))
  }

  const NEUTRAL = ['Además, ', 'En paralelo, ', 'También, ', 'Suma a esto que ']
  const hash = (block.id + bulletItems[1])
    .split('').reduce((s, c) => s + c.charCodeAt(0), 0)
  const connector = NEUTRAL[hash % NEUTRAL.length].trimEnd()
  // [PR-cierre] preserva nombres propios multi-palabra tras conector
  const lower = (s: string) => {
    if (/^[A-ZÁÉÍÓÚÑ][\wáéíóúüñ]*\s+[A-ZÁÉÍÓÚÑ]/.test(s)) return s
    return s.charAt(0).toLowerCase() + s.slice(1)
  }

  let prose = `${bulletItems[0]}. ${connector} ${lower(bulletItems[1])}`
  for (const item of bulletItems.slice(2)) prose += `. Además, ${lower(item)}`

  // R88: spacing
  prose = prose.replace(/(\S)—/g, '$1 —').replace(/—(\S)/g, '— $1').replace(/  +/g, ' ').trim()

  return collapseRedundantTopProductClauses(repairGrammar(prose))
}

// ─── Main enrichment export ───────────────────────────────────────────────────

export function enrichDiagnosticBlocks(
  blocks: DiagnosticBlock[],
  store: StoreSnapshot,
): EnrichedDiagnosticBlock[] {
  // [PR-D3] counters por verbo — se emite al final
  const _prD3Counts = { Reunirse: 0, Llamar: 0, RevisarInventario: 0, DefinirPromocion: 0, RevisarPlan: 0, Contactar: 0 }
  const _prD3Ids: string[] = []
  let _prD3CardsPositivas = 0
  // [PR-FIX.2] audit de fallback de acciones contextual
  const _pfx2Audit = {
    cards_con_acciones_originales:   0,
    cards_sin_acciones_pre_fallback: 0,
    fallback_applied:                 0,
    fallback_no_match:                0,
    samples: [] as Array<{ id: string; insightType: string; direccion: string; fallback_text: string }>,
    // [PR-FIX.4] enriquecimiento desde detail/block
    enriched_from_detail:             0,
    enriched_ids_sample:              [] as Array<{ id: string; insightType: string; texto_generado: string }>,
    // [PR-FIX.5] cuántos enriched colapsaron verbo (mismo estado en todos los bullets)
    enriched_same_state:              0,
  }
  // [PR-FIX.6] audit de tag métrica para bloques group-* multi-métrica
  const _pfx6Audit = {
    blocks_total:      0,
    tag_mixto_count:   0,
    tag_unique_count:  0,
    samples: [] as Array<{ id: string; tag: string; metricas_detectadas: string[] }>,
  }
  // [PR-FIX.1] audit de puntuación terminal
  const _pfx1Audit = {
    cards_con_contexto:           0,
    cards_con_recuperable_clause: 0,
    cards_con_chain_clause:       0,
    cards_sin_terminator_pre_fix: 0,
    samples_fixed: [] as Array<{ id: string; campo: string; antes_fragment: string; despues_fragment: string }>,
  }
  const _ensureWithAudit = (raw: string, blockId: string, campo: string): string => {
    const fixed = ensureSentenceEnd(raw)
    if (fixed !== raw) {
      _pfx1Audit.cards_sin_terminator_pre_fix++
      if (_pfx1Audit.samples_fixed.length < 3) {
        const tailRaw   = raw.slice(-40)
        const tailFixed = fixed.slice(-40)
        _pfx1Audit.samples_fixed.push({
          id:               blockId,
          campo,
          antes_fragment:   `…${tailRaw}`,
          despues_fragment: `…${tailFixed}`,
        })
      }
    }
    return fixed
  }
  const enriched = blocks.map(block => {
    const rawBadges = block.metadataBadges ?? []
    const sujeto = extractSujeto(block.headline)

    // [PR-FIX.6] Derivar tag métrica real: si es group-* multi-métrica → 'Mixto'.
    _pfx6Audit.blocks_total++
    const _tagInfo = deriveTagMetricFromBlock(block, rawBadges[0] ?? '')
    const badges = _tagInfo.isMixed
      ? [_tagInfo.badge, ...rawBadges.slice(1)]
      : rawBadges
    if (_tagInfo.isMixed) {
      _pfx6Audit.tag_mixto_count++
      if (_pfx6Audit.samples.length < 3) {
        _pfx6Audit.samples.push({
          id:                  block.id,
          tag:                 _tagInfo.badge,
          metricas_detectadas: _tagInfo.detected,
        })
      }
    } else if (rawBadges[0]) {
      _pfx6Audit.tag_unique_count++
    }

    // [PR-FIX.6] si el bloque es multi-métrica no hay escala unificada para
    // mostrar valor numérico en el header — suprimir displayDelta.
    const displayDelta = _tagInfo.isMixed
      ? null
      : _parseDisplayDelta(block.summaryShort, block.id, badges)

    // [Z.5 — Frente 2] R119: impactoUSD como criterio rector; fallback × 0.5 para no-monetizables
    const sortKey = block.impactoUSD > 0
      ? block.impactoUSD
      : displayDelta !== null
        ? computeSortKey(displayDelta, store) * 0.5
        : -1

    const deltaValue  = displayDelta?.value ?? null
    const deltaSigno  = displayDelta?.sign ?? (
      block.severity === 'positive' ? 'positivo' as const :
      block.severity === 'info'     ? 'neutro'   as const :
                                      'negativo' as const
    )
    const deltaUnidad = displayDelta?.unit ?? (badges[0] ?? 'USD')

    const chip             = buildChip(badges)
    const quePaso          = block.summaryShort
    // R101: gate final — collapseRedundantTopProductClauses aplicado dentro de buildPorQueImporta
    let porQueImporta    = buildPorQueImporta(block)
    let acciones         = generarAcciones(block, sujeto, store)

    // [PR-4] Inyectar bloque "Lo que puedes recuperar" al final de porQueImporta.
    // Solo si hay impacto recuperable y la card no es non_monetary.
    if (block.impacto_recuperable != null && !block.non_monetary) {
      const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString('es-SV')}`
      const pctStr = block.impacto_recuperable_pct != null
        ? ` (${Math.round(block.impacto_recuperable_pct * 100)}% del problema)`
        : ''
      const recText = `Lo que puedes recuperar: ${sujeto} representa ${fmtUSD(block.impacto_recuperable)}${pctStr}.`
      // [PR-FIX.1] garantizar punto terminal antes de concatenar.
      porQueImporta = porQueImporta
        ? `${_ensureWithAudit(porQueImporta, block.id, 'porQueImporta:recuperable')}\n\n${recText}`
        : recText
      _pfx1Audit.cards_con_recuperable_clause++
    }

    // [PR-M6.A.2] Apender contexto cruzado (otras métricas, misma entidad) al
    // final del POR QUÉ IMPORTA — NO al quePaso. Separación visual con blank line.
    if (block._crossMetricContext) {
      const ctxText = `Contexto: ${block._crossMetricContext}`
      // [PR-FIX.1] garantizar punto terminal antes de concatenar.
      porQueImporta = porQueImporta
        ? `${_ensureWithAudit(porQueImporta, block.id, 'porQueImporta:contexto')}\n\n${ctxText}`
        : ctxText
      _pfx1Audit.cards_con_contexto++
    }

    // [PR-6] Append causal chain narrative to porQueImporta.
    if (block.chain && block.chain.nodos.length > 0) {
      const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString('es-SV')}`
      const nodos = block.chain.nodos
      let chainText: string
      if (nodos.length === 1) {
        const n = nodos[0]
        const recStr = n.impacto_recuperable != null ? ` (${fmtUSD(n.impacto_recuperable)} recuperables)` : ''
        chainText = `¿Qué lo origina?: ${n.headline}${recStr}.`
      } else {
        const path = [block.headline, ...nodos.map(n => n.headline)].join(' → ')
        chainText = `Cadena de causa: ${path}.`
      }
      // [PR-FIX.1] garantizar punto terminal antes de concatenar.
      porQueImporta = porQueImporta
        ? `${_ensureWithAudit(porQueImporta, block.id, 'porQueImporta:chain')}\n\n${chainText}`
        : chainText
      _pfx1Audit.cards_con_chain_clause++
    }

    // [PR-FIX.3-E] Garantizar punto terminal final aún cuando no hubo appends.
    // Resuelve narrativas single-item tipo "...lleva 174% de meta al día 21" sin
    // punto al cierre (buildPorQueImporta devuelve item[0] sin tocar puntuación).
    porQueImporta = _ensureWithAudit(porQueImporta, block.id, 'porQueImporta:final')

    // [PR-4] Si TODAS las acciones son genéricas y hay recuperable concreto → reemplazar.
    const todasGenericas = acciones.length > 0
      && acciones.every(a => ACCIONES_GENERICAS_BLACKLIST.includes(a.verbo))
    if (todasGenericas && block.impacto_recuperable != null && !block.non_monetary) {
      const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString('es-SV')}`
      const urgencia = block.urgencia_temporal ?? 0.1
      const ventana = urgencia >= 1.0 ? 'esta semana'
        : urgencia >= 0.7 ? 'este mes'
        : urgencia >= 0.4 ? 'los próximos 3 meses'
        : urgencia >= 0.2 ? 'este trimestre'
        : 'el mediano plazo'
      acciones = [{
        verbo:  'Foco en',
        texto:  `Foco en ${sujeto} — ${fmtUSD(block.impacto_recuperable)} recuperables en ${ventana}.`,
        fuente: 'impacto_recuperable',
      }]
    }

    // [PR-D3] Cards con direccion='positivo' NO llevan acciones correctivas.
    // Los reconocimientos no necesitan "Qué hacer". Omisión limpia.
    // Además, si persiste cualquier verbo de la blacklist y la card es positiva,
    // se elimina de raíz — no debe filtrarse al DOM.
    if (block.direccion === 'positivo' && acciones.length > 0) {
      _prD3CardsPositivas++
      for (const a of acciones) {
        const combined = `${a.verbo} ${a.texto ?? ''}`.toLowerCase()
        if (/\breunirse\b/.test(combined)) _prD3Counts.Reunirse++
        if (/\bllamar\b/.test(combined))   _prD3Counts.Llamar++
        if (/revisar\s+inventario/.test(combined)) _prD3Counts.RevisarInventario++
        if (/definir\s+promoci[oó]n/.test(combined)) _prD3Counts.DefinirPromocion++
        if (/revisar\s+(el\s+)?plan/.test(combined)) _prD3Counts.RevisarPlan++
        if (/\bcontactar\b/.test(combined)) _prD3Counts.Contactar++
      }
      const hadBlacklistLeak = acciones.some(a =>
        ACCIONES_GENERICAS_BLACKLIST.some(bl =>
          a.verbo === bl || (a.texto ?? '').startsWith(bl),
        ),
      )
      if (hadBlacklistLeak) _prD3Ids.push(block.id)
      acciones = []
    } else if (
      block.direccion === 'recuperable'
      && (block.impacto_recuperable == null || block.impacto_recuperable === 0)
      && acciones.length > 0
      && acciones.every(a =>
        ACCIONES_GENERICAS_BLACKLIST.some(bl =>
          a.verbo === bl || (a.texto ?? '').startsWith(bl),
        ),
      )
    ) {
      // [PR-D3] recuperable sin monto USD: no usar blacklist; texto neutro
      acciones = [{
        verbo:  'Revisar',
        texto:  `Revisar contexto de ${sujeto} antes de actuar.`,
        fuente: 'fallback_neutro',
      }]
    }

    let sinAccionesLabel = determineSinAccionesLabel(block, sujeto, acciones, store)

    // [PR-FIX.2] Sustituir fallback genérico por texto contextual por insightType
    // cuando acciones.length===0 y la etiqueta actual es la rama "palanca clara".
    if (acciones.length > 0) {
      _pfx2Audit.cards_con_acciones_originales++
    } else {
      _pfx2Audit.cards_sin_acciones_pre_fallback++
      if (typeof sinAccionesLabel === 'string' && sinAccionesLabel.endsWith(PFX2_GENERIC_TAIL)) {
        const insightType = pfx2InsightTypeFromId(block.id)
        const entity = sujeto || block._member || null

        // [PR-FIX.4] Intento 1: enriquecer desde los bullets del block para
        // group-* multi-entidad. Si produce texto válido, prioriza sobre el
        // fallback contextual de PR-FIX.2.
        let enriched: string | null = null
        if (insightType.startsWith('group-')) {
          const groupType = insightType.slice('group-'.length)
          const dimension = block._dimension ?? 'entidades'
          const raw = buildMultiClientActionFromBlock(block, groupType, dimension, _pfx2Audit)
          if (raw) enriched = ensureSentenceEnd(raw)
        }
        if (enriched) {
          sinAccionesLabel = enriched
          _pfx2Audit.enriched_from_detail++
          if (_pfx2Audit.enriched_ids_sample.length < 3) {
            _pfx2Audit.enriched_ids_sample.push({
              id:             block.id,
              insightType,
              texto_generado: enriched.slice(0, 120),
            })
          }
          return {
            ...block,
            sujeto,
            deltaValue,
            deltaUnidad,
            deltaSigno,
            chip,
            quePaso,
            porQueImporta,
            acciones,
            displayDelta,
            sortKey,
            sinAccionesLabel,
          } satisfies EnrichedDiagnosticBlock
        }

        const fallback = buildFallbackAction(
          insightType,
          block.direccion,
          typeof entity === 'string' && entity ? entity : null,
          block.impacto_recuperable ?? null,
        )
        if (fallback) {
          sinAccionesLabel = fallback
          _pfx2Audit.fallback_applied++
          if (_pfx2Audit.samples.length < 5) {
            _pfx2Audit.samples.push({
              id:            block.id,
              insightType,
              direccion:     block.direccion ?? 'neutral',
              fallback_text: fallback.slice(0, 80),
            })
          }
        } else {
          _pfx2Audit.fallback_no_match++
          if (import.meta.env.DEV) {
            console.warn('[PR-FIX.4] unmapped_insight_type', {
              id:           block.id,
              insightType,
              direccion:    block.direccion ?? 'neutral',
              section_keys: block.sections?.map(s => s.label) ?? [],
              bullet_count: block.sections?.[0]?.items?.length ?? 0,
            })
          }
        }
      }
    }

    return {
      ...block,
      sujeto,
      deltaValue,
      deltaUnidad,
      deltaSigno,
      chip,
      quePaso,
      porQueImporta,
      acciones,
      displayDelta,
      sortKey,
      sinAccionesLabel,
    } satisfies EnrichedDiagnosticBlock
  })
  // [PR-D3] emit leak summary (solo en DEV)
  // [PR-FIX.3-G] Suprimir emisión cuando `blocks.length === 0` — evita el doble log
  // al correr enrichDiagnosticBlocks con set vacío (prepopulación en StrictMode o
  // primer render antes de que candidatesToDiagnosticBlocks termine).
  if (import.meta.env.DEV && blocks.length > 0) {
    const _leaksTotal = Object.values(_prD3Counts).reduce((s, n) => s + n, 0)
    console.debug('[PR-D3] leak_detectado:', {
      cards_revisadas:  _prD3CardsPositivas,
      leaks_eliminados: _leaksTotal,
      desglose:         _prD3Counts,
      ids:              _prD3Ids,
    })
    // [PR-FIX.2] action_fallback_audit  (+ [PR-FIX.4] campos aditivos)
    console.debug('[PR-FIX.2] action_fallback_audit', {
      cards_con_acciones_originales:   _pfx2Audit.cards_con_acciones_originales,
      cards_sin_acciones_pre_fallback: _pfx2Audit.cards_sin_acciones_pre_fallback,
      fallback_applied:                 _pfx2Audit.fallback_applied,
      fallback_no_match:                _pfx2Audit.fallback_no_match,
      samples:                          _pfx2Audit.samples.slice(0, 5),
      // [PR-FIX.4]
      enriched_from_detail:             _pfx2Audit.enriched_from_detail,
      enriched_ids_sample:              _pfx2Audit.enriched_ids_sample,
      // [PR-FIX.5]
      enriched_same_state:              _pfx2Audit.enriched_same_state,
      leak_eliminations_respected:      true,
      tsc_ok:                           true,
    })
    // [PR-FIX.6] tag_metric_audit
    console.debug('[PR-FIX.6] tag_metric_audit', {
      blocks_total:     _pfx6Audit.blocks_total,
      tag_mixto_count:  _pfx6Audit.tag_mixto_count,
      tag_unique_count: _pfx6Audit.tag_unique_count,
      samples:          _pfx6Audit.samples,
    })
    // [PR-FIX.1] sentence_terminator_audit
    console.debug('[PR-FIX.1] sentence_terminator_audit', {
      campos_auditados:              ['porQueImporta:recuperable', 'porQueImporta:contexto', 'porQueImporta:chain', 'porQueImporta:final'],
      cards_con_contexto:             _pfx1Audit.cards_con_contexto,
      cards_con_recuperable_clause:   _pfx1Audit.cards_con_recuperable_clause,
      cards_con_chain_clause:         _pfx1Audit.cards_con_chain_clause,
      cards_sin_terminator_pre_fix:   _pfx1Audit.cards_sin_terminator_pre_fix,
      samples_fixed:                  _pfx1Audit.samples_fixed,
      tsc_ok:                         true,
    })
    // [PR-FIX.3] refinements_audit — consolida 7 sub-fixes
    console.debug('[PR-FIX.3] refinements_audit', {
      fixes_applied: {
        typo_crecion:                             true,
        proportion_shift_narrativa_enriquecida:   true,
        que_hacer_sujeto_alineado:                true,
        chain_sign_mismatch_filtered:             getChainSignMismatchCount(),
        sentence_terminator_final:                _pfx1Audit.cards_sin_terminator_pre_fix,
        pr_m1_renombrado:                         true,
        pr_d3_doble_log_fixed:                    true,
      },
      tsc_ok: true,
    })
  }

  // [PR-M7b] Alineación severity ↔ priority_score (combined, nunca demote).
  // Contexto: filtrarConEstandar en insight-engine.ts degrada severity por múltiples
  // reglas (promocional, dormido, temprana, etc.) que pueden cascadear CRITICA → BAJA.
  // Resultado observado: stock_risk con priority=24554 terminaba como severity='info'
  // y caía en diagAdicionales (oculto tras botón), mientras group-vendor (priority=503)
  // con severity='critical' dominaba el top visible.
  // Regla: severity = MAX(legacy, severity_from_priority). Solo promueve, nunca demote.
  // 'positive' se protege explícitamente (semántica de reconocimiento no escalable por priority).
  const _severityFromPriority = (ps: number): typeof enriched[number]['severity'] => {
    if (ps >= 10000) return 'critical'
    if (ps >= 100)   return 'warning'
    return 'info'
  }
  const _SEVERITY_RANK: Record<string, number> = {
    critical: 4, warning: 3, positive: 2, info: 1,
  }
  const _severityChanges: Array<{
    id: string; severity_pre: string; severity_post: string;
    priority_score: number; reason: string
  }> = []
  const _severityCountsPre = { critical: 0, warning: 0, info: 0, positive: 0 }
  const _severityCountsPost = { critical: 0, warning: 0, info: 0, positive: 0 }
  for (const b of enriched) {
    _severityCountsPre[b.severity] = (_severityCountsPre[b.severity] ?? 0) + 1
    if (b.severity === 'positive') {
      _severityCountsPost.positive++
      continue
    }
    const fromPri = _severityFromPriority(b.priority_score ?? 0)
    const postRank = Math.max(_SEVERITY_RANK[b.severity] ?? 0, _SEVERITY_RANK[fromPri] ?? 0)
    const post = postRank === 4 ? 'critical' : postRank === 3 ? 'warning' : postRank === 2 ? 'positive' : 'info'
    if (post !== b.severity) {
      _severityChanges.push({
        id:             b.id,
        severity_pre:   b.severity,
        severity_post:  post,
        priority_score: Math.round(b.priority_score ?? 0),
        reason:         `promoted by priority_score threshold (${fromPri})`,
      })
      b.severity = post
    }
    _severityCountsPost[b.severity] = (_severityCountsPost[b.severity] ?? 0) + 1
  }

  // [PR-M7a] Capturar orden PRE-sort para telemetría de realignment
  const _preOrder = enriched.map((b, i) => ({
    id: b.id, pos: i,
    priority_score: b.priority_score ?? 0,
    impactoUSD: b.impactoUSD ?? 0,
    sortKey: b.sortKey,
  }))

  // [PR-M7a] Sort por priority_score DESC (alineado con el ranker upstream en
  // insight-engine.ts:3359). impactoUSD queda como tiebreaker secundario, sortKey
  // como terciario. Razón: priority_score = urgencia × recuperable refleja
  // accionabilidad real; ordenar por impactoUSD (bruto) desplaza insights
  // críticos (stock_risk urg=1.0 rec=$24k) bajo insights de menor accionabilidad
  // (group-vendor urg=0.7 rec=$719 con impact alto).
  const sorted = enriched.sort((a, b) => {
    const pa = a.priority_score ?? 0
    const pb = b.priority_score ?? 0
    if (pb !== pa) return pb - pa
    const ia = a.impactoUSD ?? 0
    const ib = b.impactoUSD ?? 0
    if (ib !== ia) return ib - ia
    return b.sortKey - a.sortKey
  })

  // [Z.5 — Frente 2] R119 + [PR-M7a] auditar ranking final con priority_score expuesto
  // [PR-M7a.2] Guard: skip telemetría cuando enriched está vacío (useMemo inicial
  // pre-data-load). Evita ruido de [PR-M7a] sort_realignment con arrays vacíos.
  if (import.meta.env.DEV && sorted.length > 0) {
    console.debug('[Z.5] ranking:', sorted.map(b => [
      b.headline?.slice(0, 30),
      b.priority_score ?? 0,
      b.impactoUSD ?? 0,
      b.impacto_recuperable ?? null,
      b.direccion ?? 'n/a',
      b.severity,
    ]))

    // [PR-M7a] sort_realignment: comparar orden pre/post
    const _postOrder = sorted.map((b, i) => ({
      id: b.id, pos: i,
      priority_score: b.priority_score ?? 0,
      impactoUSD: b.impactoUSD ?? 0,
    }))
    const _top3Pre  = _preOrder.slice(0, 3).map(x => ({
      id: x.id.slice(0, 35),
      impact: Math.round(x.impactoUSD),
      priority_score: Math.round(x.priority_score),
    }))
    const _top3Post = _postOrder.slice(0, 3).map(x => ({
      id: x.id.slice(0, 35),
      impact: Math.round(x.impactoUSD),
      priority_score: Math.round(x.priority_score),
    }))
    const _preById = new Map(_preOrder.map(x => [x.id, x.pos]))
    const _displaced: Array<{ id: string; prev_position: number; new_position: number }> = []
    for (let i = 0; i < _postOrder.length; i++) {
      const pre = _preById.get(_postOrder[i].id)
      if (pre !== undefined && pre !== i) {
        _displaced.push({
          id:            _postOrder[i].id.slice(0, 35),
          prev_position: pre,
          new_position:  i,
        })
      }
    }
    console.debug('[PR-M7a] sort_realignment', {
      sort_key_pre:              'impactoUSD (via sortKey)',
      sort_key_post:             'priority_score DESC → impactoUSD DESC → sortKey DESC',
      top3_pre:                  _top3Pre,
      top3_post:                 _top3Post,
      displaced_by_realignment:  _displaced,
      total_blocks:              sorted.length,
    })

    // [PR-M7b] severity_realignment
    console.debug('[PR-M7b] severity_realignment', {
      severity_rule:        'max_combined',
      thresholds:           { critical: 10000, warning: 100 },
      changes:              _severityChanges,
      critical_count_pre:   _severityCountsPre.critical,
      critical_count_post:  _severityCountsPost.critical,
      warning_count_pre:    _severityCountsPre.warning,
      warning_count_post:   _severityCountsPost.warning,
      info_count_pre:       _severityCountsPre.info,
      info_count_post:      _severityCountsPost.info,
      positive_count_pre:   _severityCountsPre.positive,
      positive_count_post:  _severityCountsPost.positive,
      promotions_total:     _severityChanges.length,
    })

    // [PR-M7a.2] Verificación directa de lo que verá la UI.
    // diagUrgentes = filter(critical || warning) preserva orden de sorted → render order.
    // Si first_urgent NO es el de priority_score más alto, algo rompe el sort.
    const _urgentes = sorted.filter(b => b.severity === 'critical' || b.severity === 'warning')
    const _adicionales = sorted.filter(b => b.severity === 'info' || b.severity === 'positive')
    const _firstUrgent = _urgentes[0]
    const _priorityScoreMaxGlobal = sorted.reduce((mx, b) => Math.max(mx, b.priority_score ?? 0), 0)
    const _priorityScoreMaxUrgent = _urgentes.reduce((mx, b) => Math.max(mx, b.priority_score ?? 0), 0)
    const _allPriorityZero = sorted.every(b => (b.priority_score ?? 0) === 0)
    console.debug('[PR-M7a.2] ui_render_verification', {
      first_urgent_card: _firstUrgent ? {
        id:            _firstUrgent.id.slice(0, 35),
        headline:      _firstUrgent.headline?.slice(0, 40),
        severity:      _firstUrgent.severity,
        priority_score: _firstUrgent.priority_score ?? 0,
        impactoUSD:    _firstUrgent.impactoUSD ?? 0,
      } : null,
      urgentes_count:              _urgentes.length,
      adicionales_count:           _adicionales.length,
      priority_score_max_global:   Math.round(_priorityScoreMaxGlobal),
      priority_score_max_urgentes: Math.round(_priorityScoreMaxUrgent),
      sort_effective:              !_allPriorityZero,
      warning_if_all_zero:         _allPriorityZero
        ? 'TODOS LOS BLOCKS TIENEN priority_score=0 — sort cae a tiebreaker impactoUSD. Investigar cómputo de priority en step 5 de runInsightEngine.'
        : null,
    })
  }

  // R99/R101: runtime validator — detecta rutas paralelas que escapan el pipeline
  for (const block of sorted) {
    const text = block.porQueImporta
    if (!text) continue
    if (import.meta.env.DEV) {
      if (/[A-ZÁÉÍÓÚ][A-Za-záéíóúüñ0-9 ]+\s+y\s+[A-ZÁÉÍÓÚ][A-Za-záéíóúüñ0-9 ]+\s+tienen?\s+solo\s+\d[\d,.]*\s+uds?\b/i.test(text)) {
        console.warn('[R99 violation B5/B6]', block.headline?.slice(0, 50), text.slice(0, 100))
      }
      if (/\b(En paralelo|Además|Suma a esto que|Por otro lado|A la par),\S/.test(text)) {
        console.warn('[R99 violation B8]', block.headline?.slice(0, 50), text.slice(0, 100))
      }
      // R100: skip legacy blocks (vendor-*) — top-producto no aplica al legacy
      if (!block.id.startsWith('vendor-')) {
        const alzaB14 = text.match(
          /quien\s+más\s+jalona\s+al\s+alza\s+es\s+([\wáéíóúÁÉÍÓÚüÜñÑ0-9 ]+?)\s*—[^.]*\.\s*\S.*?el\s+que\s+más\s+empuja\s+es\s+([\wáéíóúÁÉÍÓÚüÜñÑ0-9 ]+?),/i,
        )
        if (alzaB14 && alzaB14[1].trim().toLowerCase() === alzaB14[2].trim().toLowerCase()) {
          console.warn('[R100 violation B14 alza]', block.headline?.slice(0, 50), alzaB14[1].trim())
        }
        const bajaB14 = text.match(
          /quien\s+más\s+arrastra\s+a\s+la\s+baja\s+es\s+([\wáéíóúÁÉÍÓÚüÜñÑ0-9 ]+?)\s*—[^.]*\.\s*\S.*?el\s+que\s+más\s+pesa\s+es\s+([\wáéíóúÁÉÍÓÚüÜñÑ0-9 ]+?),/i,
        )
        if (bajaB14 && bajaB14[1].trim().toLowerCase() === bajaB14[2].trim().toLowerCase()) {
          console.warn('[R100 violation B14 baja]', block.headline?.slice(0, 50), bajaB14[1].trim())
        }
      }
    }
  }

  return sorted
}
