/**
 * narrative-builder.ts — v2.2.0 (Z.3)
 * R111–R114: Builder Pattern tipado para narrativa de diagnóstico.
 *
 * Invariantes absorbidas por construcción:
 *   R68  — conectores determinísticos por índice/hash (render interno, no manual)
 *   R81  — advertencia_stock requiere payload tipado {sku, clasificacion, dias, uds}
 *   R83  — advertencia_dormido usa nombres reales (nunca conteos)
 *   R87  — conector huérfano imposible: solo se emite si existe cláusula siguiente
 *   R88  — espaciado em-dash garantizado post-render
 *   R91  — cierre_sin_acciones solo disponible vía NarrativeBuilder.sinAccionesLabel
 *   R94  — joinSentences es el único punto de composición (no concatenación manual)
 *   R95  — validateProductoContraTopList exige validadoContraTop: true como literal
 *   R97  — fmtSignedDelta deriva signo de Math.sign(n), no invierte
 *
 * Uso en builders legacy: addHechoPrincipal() para bullets de texto plano.
 * Uso futuro: addAdvertenciaStock(), addCitaProducto(), etc. para claúsulas tipadas.
 */

import type { DiagnosticSeverity } from '../types/diagnostic-types'

// ─── DisplayDelta (movido desde diagnostic-actions v2.2.0) ────────────────────

export interface DisplayDelta {
  value: number
  unit: 'USD' | 'uds' | 'txns' | 'pct_meta' | 'usd_ticket' | 'dias'
  sign: 'positivo' | 'negativo' | 'neutro'
}

function parseNum(s: string): number {
  return parseFloat(s.replace(/,/g, ''))
}

// R75: parse delta absoluto desde texto de summaryShort
export function parseDisplayDelta(
  summaryShort: string,
  blockId: string,
  badges: string[],
): DisplayDelta | null {
  const metaPartial = summaryShort.match(
    /lleva\s+(\d+(?:\.\d+)?)%\s+de\s+su\s+meta\s+al\s+d[íi]a\s+(\d+)/,
  )
  if (metaPartial) {
    const cumpl    = parseFloat(metaPartial[1])
    const dia      = parseInt(metaPartial[2])
    const expected = parseFloat(((dia / 30) * 100).toFixed(1))
    const gap      = parseFloat((cumpl - expected).toFixed(1))
    return { value: gap, unit: 'pct_meta', sign: gap >= 0 ? 'positivo' : 'negativo' }
  }

  const metaClosed = summaryShort.match(/cerr[oó]\s+el\s+mes\s+al\s+(\d+(?:\.\d+)?)%/)
  if (metaClosed) {
    const cumpl = parseFloat(metaClosed[1])
    return { value: cumpl - 100, unit: 'pct_meta', sign: 'negativo' }
  }

  if (blockId.includes('-dormido-')) {
    const m = summaryShort.match(/no\s+compra\s+hace\s+(\d+)\s+d[íi]as/)
    if (m) return { value: -parseInt(m[1]), unit: 'dias', sign: 'negativo' }
  }

  const ticketArrow = summaryShort.match(/\$(\d+(?:\.\d+)?)\s*→\s*\$(\d+(?:\.\d+)?)/)
  if (ticketArrow) {
    const delta = parseFloat(ticketArrow[2]) - parseFloat(ticketArrow[1])
    return { value: delta, unit: 'usd_ticket', sign: delta > 0 ? 'positivo' : delta < 0 ? 'negativo' : 'neutro' }
  }

  const usdVs = summaryShort.match(/(\d[\d,]*)\s+USD\s+vs\s+(\d[\d,]*)\s+USD/)
  if (usdVs) {
    const delta = parseNum(usdVs[1]) - parseNum(usdVs[2])
    return { value: delta, unit: 'USD', sign: delta > 0 ? 'positivo' : delta < 0 ? 'negativo' : 'neutro' }
  }

  const udsVs = summaryShort.match(/(\d[\d,]*)\s+uds\s+vs\s+(\d[\d,]*)\s+uds/)
  if (udsVs) {
    const delta = parseNum(udsVs[1]) - parseNum(udsVs[2])
    return { value: delta, unit: 'uds', sign: delta > 0 ? 'positivo' : delta < 0 ? 'negativo' : 'neutro' }
  }

  const txnsVs = summaryShort.match(/(\d[\d,]*)\s+txns\s+vs\s+(\d[\d,]*)\s+txns/)
  if (txnsVs) {
    const delta = parseNum(txnsVs[1]) - parseNum(txnsVs[2])
    return { value: delta, unit: 'txns', sign: delta > 0 ? 'positivo' : delta < 0 ? 'negativo' : 'neutro' }
  }

  const usdArrow = summaryShort.match(/(\d[\d,]*)\s+USD\s*→\s*(\d[\d,]*)\s+USD/)
  if (usdArrow) {
    const delta = parseNum(usdArrow[2]) - parseNum(usdArrow[1])
    return { value: delta, unit: 'USD', sign: delta > 0 ? 'positivo' : delta < 0 ? 'negativo' : 'neutro' }
  }

  const udsArrow = summaryShort.match(/(\d[\d,]*)\s+uds\s*→\s*(\d[\d,]*)\s+uds/)
  if (udsArrow) {
    const delta = parseNum(udsArrow[2]) - parseNum(udsArrow[1])
    return { value: delta, unit: 'uds', sign: delta > 0 ? 'positivo' : delta < 0 ? 'negativo' : 'neutro' }
  }

  if (badges?.[1] === 'Últimos 3 meses') {
    console.debug('[5I.1] delta missing:', blockId)
  }

  return null
}

export function fmtDeltaDisplay(d: DisplayDelta | null): string {
  if (d === null) return '—'
  const abs   = Math.abs(d.value)
  const signo = d.sign === 'positivo' ? '+' : d.sign === 'negativo' ? '−' : ''

  switch (d.unit) {
    case 'USD':
      if (abs >= 1_000_000) return `${signo}$${(abs / 1_000_000).toFixed(2)}M`
      if (abs >= 1_000)     return `${signo}$${(abs / 1_000).toFixed(1)}k`
      return `${signo}$${Math.round(abs)}`
    case 'uds':
      if (abs >= 1_000)     return `${signo}${(abs / 1_000).toFixed(1)}k uds`
      return `${signo}${Math.round(abs)} uds`
    case 'txns':   return `${signo}${Math.round(abs)} txns`
    case 'usd_ticket': return `${signo}$${abs.toFixed(2)}`
    case 'pct_meta':   return `${signo}${abs.toFixed(1)}%`
    case 'dias':       return `${signo}${Math.round(abs)} días`
    default:           return '—'
  }
}

// ─── Tipos públicos ────────────────────────────────────────────────────────────

export type ClauseKind =
  | 'hecho_principal'
  | 'cita_producto'
  | 'cita_cliente'
  | 'advertencia_stock'
  | 'advertencia_dormido'
  | 'contexto_canal'
  | 'contexto_meta'
  | 'cta'
  | 'cierre_sin_acciones'

type StockClasificacion = 'riesgo_quiebre' | 'baja_cobertura' | 'lento_movimiento' | 'sin_movimiento'

type RawClause = { text: string; kind: ClauseKind }

// R95: producto validado contra top-list con signo correcto (literal type)
export interface ValidatedProducto {
  nombre: string
  validadoContraTop: true
}

// ─── Conectores y constantes internas ─────────────────────────────────────────

const NEUTRAL_CONNECTORS = ['Además, ', 'En paralelo, ', 'También, ', 'Suma a esto que ']

// R68: selección hash (preserva byte-identity con el pickConnector original)
function pickConnector(blockId: string, secondText: string): string {
  const hash = (blockId + secondText)
    .split('')
    .reduce((s, c) => s + c.charCodeAt(0), 0)
  return NEUTRAL_CONNECTORS[hash % NEUTRAL_CONNECTORS.length]
}

const fmtInt = (n: number) => Math.round(n).toLocaleString('es-SV')

// R81/R85/R86: narrativa de stock por clasificación — nunca cifra agregada de 2 productos
function renderStock(sku: string, clasificacion: StockClasificacion, uds: number, dias: number): string {
  switch (clasificacion) {
    case 'riesgo_quiebre':
    case 'baja_cobertura':
      return `${sku} tiene solo ${Math.round(dias)} días de cobertura (${fmtInt(uds)} uds) — hay que reabastecer`
    case 'lento_movimiento':
    case 'sin_movimiento':
      return `${sku} lleva ${Math.round(dias)} días de inventario parado (${fmtInt(uds)} uds) — urge rotar`
  }
}

// ─── Utilidades exportadas ─────────────────────────────────────────────────────

// R97: signo derivado de Math.sign(n) — imposible invertir
export function fmtSignedDelta(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${sign}${Math.abs(n).toFixed(1)}%`
}

// R95/R96: validación contra top-list con signo explícito
export function validateProductoContraTopList(
  nombre: string,
  topList: Array<{ nombre: string }>,
): ValidatedProducto | null {
  const norm = nombre.toLowerCase().trim()
  const found = topList.find(t => t.nombre.toLowerCase() === norm)
  return found ? { nombre: found.nombre, validadoContraTop: true } : null
}

// R94: joinSentences es el único punto de composición garantizado
export function joinSentences(parts: string[], sep = '. '): string {
  return parts.filter(Boolean).join(sep)
}

// ─── NarrativeBuilder ─────────────────────────────────────────────────────────

export class NarrativeBuilder {
  private clauses: RawClause[] = []
  readonly sujeto: string
  readonly severity: DiagnosticSeverity
  private readonly blockId: string
  readonly cumplimientoPct?: number
  private readonly maxClauses: number

  constructor(
    sujeto: string,
    severity: DiagnosticSeverity,
    blockId: string,
    cumplimientoPct?: number,
    maxClauses = Infinity,
  ) {
    this.sujeto = sujeto
    this.severity = severity
    this.blockId = blockId
    this.cumplimientoPct = cumplimientoPct
    this.maxClauses = maxClauses
  }

  private addClause(kind: ClauseKind, text: string): this {
    if (text && this.clauses.length < this.maxClauses && !this.clauses.some(c => c.text === text)) {
      this.clauses.push({ kind, text })
    }
    return this
  }

  // R111: hecho_principal para texto plano genérico (builders legacy usan solo este método)
  addHechoPrincipal(text: string): this {
    return this.addClause('hecho_principal', text)
  }

  // R113: cita_producto requiere ValidatedProducto (validadoContraTop: true literal)
  addCitaProducto(producto: ValidatedProducto, description: string): this {
    return this.addClause('cita_producto', `${producto.nombre} — ${description}`)
  }

  addCitaCliente(clientes: string[], accion: string): this {
    if (clientes.length === 0) return this
    const names = clientes.slice(0, 2).join(' y ')
    return this.addClause('cita_cliente', `${names} ${accion}`)
  }

  // R112: advertencia_stock requiere payload obligatorio — imposible texto "stock ..." libre
  addAdvertenciaStock(
    sku: string,
    clasificacion: StockClasificacion,
    dias: number,
    uds: number,
  ): this {
    return this.addClause('advertencia_stock', renderStock(sku, clasificacion, uds, dias))
  }

  // R83 absorbido: siempre usa nombres reales (nunca conteos)
  addAdvertenciaDormido(clientes: string[], diasDormido?: number): this {
    if (clientes.length === 0) return this
    const text =
      clientes.length === 1 && diasDormido != null
        ? `${clientes[0]} lleva ${diasDormido} días sin comprar`
        : `${clientes[0]}${clientes[1] ? ` y ${clientes[1]}` : ''} llevan varias semanas sin comprar`
    return this.addClause('advertencia_dormido', text)
  }

  addContextoCanal(canal: string, variacionPct: number): this {
    const sign = variacionPct >= 0 ? '+' : ''
    return this.addClause('contexto_canal', `${canal} ${sign}${variacionPct.toFixed(1)}%`)
  }

  addContextoMeta(pct: number, diaDelMes: number): this {
    return this.addClause('contexto_meta', `lleva ${pct.toFixed(1)}% de meta al día ${diaDelMes}`)
  }

  // R91: etiqueta sin-acciones según severity + cumplimiento (no agrega a clauses)
  static sinAccionesLabel(
    reason: 'meta_superada' | 'crecimiento_sostenido' | 'sin_datos_accionables' = 'sin_datos_accionables',
  ): string {
    const prefix = 'Sin acciones sugeridas — '
    switch (reason) {
      case 'meta_superada':          return prefix + 'va superando la meta.'
      case 'crecimiento_sostenido':  return prefix + 'mantiene tendencia positiva sostenida.'
      default:                       return prefix + 'los datos históricos no muestran una palanca clara.'
    }
  }

  get clauseCount(): number {
    return this.clauses.length
  }

  // R111/R94: único punto de composición final de cláusulas
  render(): string {
    const texts = this.clauses.map(c => c.text).filter(Boolean)
    if (texts.length === 0) return ''
    if (texts.length === 1) return texts[0]

    const [first, second, ...rest] = texts
    // [PR-cierre] No bajar mayúscula cuando la cláusula empieza con nombre propio
    // (dos palabras consecutivas capitalizadas, e.g. "Ana González", "Supermercado Nacional").
    const lower = (s: string) => {
      if (/^[A-ZÁÉÍÓÚÑ][\wáéíóúüñ]*\s+[A-ZÁÉÍÓÚÑ]/.test(s)) return s
      return s.charAt(0).toLowerCase() + s.slice(1)
    }

    // R68: conector hash-based (preserva byte-identity con original pickConnector)
    // R87: conector solo emitido si existe cláusula siguiente — imposible huérfano
    const connector = pickConnector(this.blockId, second).trimEnd()
    let result = `${first}. ${connector} ${lower(second)}`
    for (const item of rest) result += `. Además, ${lower(item)}`

    // R88: espaciado garantizado alrededor de em-dash
    result = result.replace(/(\S)—/g, '$1 —').replace(/—(\S)/g, '— $1').replace(/  +/g, ' ')

    return result.trim()
  }
}

// ─── Sección centinela para builders migrados ─────────────────────────────────

// R114: la sección '__nb__' marca bloques cuyo porQueImporta fue producido por NarrativeBuilder.
// buildPorQueImporta en diagnostic-actions.ts la detecta y devuelve el prose directo
// sin aplicar sanitizadores (los invariantes ya están garantizados por construcción).
export const NB_SECTION_LABEL = '__nb__'
