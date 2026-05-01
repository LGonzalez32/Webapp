// [PR-FIX.7] Helpers puros para el bloque "Estado general de la empresa".
// Cada función retorna un objeto { texto, ...metadata } o null cuando la
// dimensión no tiene data suficiente. La UI compone los párrafos disponibles.
//
// NO tocar motor de insights ni store. Funciones puras sobre los slices que
// ya expone el dashboard (vendorAnalysis, categoriaAnalysis, canalAnalysis,
// sales crudas para derivar departamento on-the-fly).

import type {
  SaleRecord,
  VendorAnalysis,
  CategoriaAnalysis,
  CanalAnalysis,
} from '../types'
import { ensureSentenceEnd } from './insightStandard'

const fmtPct = (v: number): string => {
  const sign = v >= 0 ? '+' : ''
  return `${sign}${v.toFixed(1)}%`
}

const fmtInt = (v: number): string => Math.round(v).toLocaleString('es-SV')

function toDate(f: unknown): Date {
  return f instanceof Date ? f : new Date(f as string)
}

// ─── Párrafo 1: Negocio (vendedor top/bottom) ────────────────────────────────

export interface ParrafoNegocio {
  texto:            string
  vendedorTop:      string | null
  vendedorBottom:   string | null
  bottomPctMeta:    number | null
  bottomPctYoY:     number | null
  direccion:        'positiva' | 'negativa' | 'mixta'
}

export function getParrafoNegocio(vendorAnalysis: VendorAnalysis[]): ParrafoNegocio | null {
  if (!vendorAnalysis || vendorAnalysis.length === 0) return null
  const conYoY = vendorAnalysis.filter(v => typeof v.variacion_ytd_usd_pct === 'number' || typeof v.variacion_pct === 'number')
  if (conYoY.length === 0) return null
  const scored = conYoY.map(v => ({
    v,
    pct: (v.variacion_ytd_usd_pct ?? v.variacion_pct ?? 0) as number,
    cumpl: v.cumplimiento_pct ?? null,
  }))
  const top    = [...scored].sort((a, b) => b.pct - a.pct)[0]
  const bottom = [...scored].sort((a, b) => a.pct - b.pct)[0]
  if (!top || !bottom || top.v.vendedor === bottom.v.vendedor) return null
  const vendedorTop    = top.v.vendedor
  const vendedorBottom = bottom.v.vendedor
  const bottomPctMeta  = bottom.cumpl ?? null
  const bottomPctYoY   = bottom.pct

  const pos = top.pct > 0
  const neg = bottom.pct < 0
  const direccion: ParrafoNegocio['direccion'] = pos && neg ? 'mixta' : pos ? 'positiva' : 'negativa'

  // [PR-FIX.7.1 — A.2] promedio de cumplimiento del equipo para contraste N2
  const cumpls = scored.map(s => s.cumpl).filter((x): x is number => typeof x === 'number')
  const promedioCumplimiento = cumpls.length > 0
    ? cumpls.reduce((s, v) => s + v, 0) / cumpls.length
    : null

  // [PR-FIX.7.1 — A.1] opener adaptativo N1
  const opener =
    top.pct >= 5 && bottom.pct >= 0 ? 'El equipo avanza de forma pareja este mes.'
    : top.pct >= 5 && bottom.pct <  0 ? 'El equipo avanza con ritmos desiguales — hay motor y hay freno.'
    : top.pct <  5 && bottom.pct <  0 ? 'El equipo está atravesando un mes difícil.'
    :                                    'El equipo mantiene un ritmo estable, sin sobresaltos.'

  let texto = opener
  if (pos) {
    texto += ` Lo positivo: ${vendedorTop} sigue siendo motor de crecimiento del equipo`
    texto += top.pct >= 5 ? ` (${fmtPct(top.pct)} en el año).` : '.'
  }
  if (neg) {
    // [PR-FIX.7.2] gap vs promedio movido a paréntesis inline dentro del
    // detalle de cumplimiento (es un modificador del mismo, no un hecho
    // independiente). detalles queda con máx. 2 items → join natural.
    const detalles: string[] = []
    if (bottomPctMeta != null) {
      const gapPromedio =
        promedioCumplimiento != null && bottomPctMeta < promedioCumplimiento - 1
          ? ` (${(promedioCumplimiento - bottomPctMeta).toFixed(1)} pts debajo del promedio del equipo)`
          : ''
      detalles.push(`lleva ${bottomPctMeta.toFixed(1)}% de meta${gapPromedio}`)
    }
    if (bottom.pct < 0) detalles.push(`acumula ${fmtPct(bottom.pct)} en el año`)
    const cola = detalles.length > 0 ? ` — ${detalles.join(' y ')}` : ''
    texto += ` Lo preocupante: ${vendedorBottom} no logra remontar${cola}, lo que empieza a pesar en el resultado general.`
  } else if (!pos) {
    texto = `${vendedorTop} y ${vendedorBottom} mantienen un ritmo estable sin sorpresas este período.`
  }

  return {
    texto:          ensureSentenceEnd(texto),
    vendedorTop,
    vendedorBottom,
    bottomPctMeta,
    bottomPctYoY,
    direccion,
  }
}

// ─── Párrafo 2: Territorial + Canal ──────────────────────────────────────────

export interface ParrafoTerritorialCanal {
  texto:              string
  zonaTop:            string | null
  zonaTopPct:         number | null
  zonaBottom:         string | null
  zonaBottomPct:      number | null
  canalRetroceso:     string | null
  canalRetrocesoPct:  number | null
  canalEstable:       string | null
}

function aggregateDeptoYoY(
  sales: SaleRecord[],
  year: number,
  month: number,
  fechaReferencia: Date,
): Array<{ depto: string; pct: number }> {
  const curr = new Map<string, number>()
  const prev = new Map<string, number>()
  // Cap previous-year comparison at the same day-of-month to avoid comparing
  // a partial current month against a full previous month (rule: MTD YoY same-day-range).
  const isCurrentMonth =
    fechaReferencia.getFullYear() === year && fechaReferencia.getMonth() === month
  const maxDay = isCurrentMonth ? fechaReferencia.getDate() : 31

  for (const r of sales) {
    const d = toDate(r.fecha)
    const y = d.getFullYear()
    const m = d.getMonth()
    const depto = (r as unknown as { departamento?: string }).departamento
    if (!depto) continue
    const val = r.venta_neta ?? 0
    if (y === year && m === month) {
      curr.set(depto, (curr.get(depto) ?? 0) + val)
    } else if (y === year - 1 && m === month && d.getDate() <= maxDay) {
      prev.set(depto, (prev.get(depto) ?? 0) + val)
    }
  }
  const out: Array<{ depto: string; pct: number }> = []
  for (const [depto, cVal] of curr) {
    const pVal = prev.get(depto) ?? 0
    if (pVal <= 0) continue
    out.push({ depto, pct: ((cVal - pVal) / pVal) * 100 })
  }
  return out
}

export function getParrafoTerritorialCanal(
  sales: SaleRecord[],
  year: number,
  month: number,
  canalAnalysis: CanalAnalysis[],
  fechaReferencia: Date,
): ParrafoTerritorialCanal | null {
  const deptoYoY = aggregateDeptoYoY(sales, year, month, fechaReferencia)
  const hayTerritorial = deptoYoY.length >= 2
  const hayCanales     = canalAnalysis && canalAnalysis.length >= 2

  if (!hayTerritorial && !hayCanales) return null

  let zonaTop: string | null = null, zonaTopPct: number | null = null
  let zonaBottom: string | null = null, zonaBottomPct: number | null = null
  if (hayTerritorial) {
    const sorted = [...deptoYoY].sort((a, b) => b.pct - a.pct)
    zonaTop       = sorted[0].depto
    zonaTopPct    = sorted[0].pct
    zonaBottom    = sorted[sorted.length - 1].depto
    zonaBottomPct = sorted[sorted.length - 1].pct
    if (zonaTop === zonaBottom) { zonaBottom = null; zonaBottomPct = null }
  }

  let canalRetroceso: string | null = null, canalRetrocesoPct: number | null = null
  let canalEstable: string | null = null
  if (hayCanales) {
    const peor = [...canalAnalysis].sort((a, b) => (a.variacion_pct ?? 0) - (b.variacion_pct ?? 0))[0]
    const estable = [...canalAnalysis].find(c => c.canal !== peor?.canal && Math.abs(c.variacion_pct ?? 0) < 5)
    if (peor && (peor.variacion_pct ?? 0) < 0) {
      canalRetroceso    = peor.canal
      canalRetrocesoPct = peor.variacion_pct ?? 0
    }
    if (estable) canalEstable = estable.canal
  }

  const partesTerritorio: string[] = []
  if (zonaTop && zonaBottom && zonaTopPct != null && zonaBottomPct != null) {
    // [PR-FIX.7.1 — A.3/N3] tri-rama según signo de zonaTopPct: "compensar" solo
    // cuando realmente la zona líder crece con fuerza. Corrige H18.
    if (zonaTopPct > 2) {
      partesTerritorio.push(
        `Territorialmente, ${zonaTop} (${fmtPct(zonaTopPct)}) amortigua la caída de ${zonaBottom} (${fmtPct(zonaBottomPct)}), la zona más débil.`,
      )
    } else if (zonaTopPct > -5) {
      partesTerritorio.push(
        `Territorialmente, ${zonaTop} se mantiene plano (${fmtPct(zonaTopPct)}) mientras ${zonaBottom} retrocede ${fmtPct(zonaBottomPct)}.`,
      )
    } else {
      partesTerritorio.push(
        `Territorialmente, todas las zonas activas retroceden — ${zonaBottom} (${fmtPct(zonaBottomPct)}) es la más afectada, seguida de ${zonaTop} (${fmtPct(zonaTopPct)}).`,
      )
    }
  } else if (zonaTop && zonaTopPct != null) {
    partesTerritorio.push(`Territorialmente, ${zonaTop} (${fmtPct(zonaTopPct)}) lidera el desempeño de las zonas activas.`)
  }

  const partesCanal: string[] = []
  if (canalRetroceso && canalRetrocesoPct != null && canalEstable) {
    // [PR-FIX.7.1 — A.4/N4] cierre data-driven con brecha real entre canales
    const canalEstableObj = canalAnalysis.find(c => c.canal === canalEstable)
    const canalEstablePct = canalEstableObj?.variacion_pct ?? 0
    const brecha = Math.abs(canalRetrocesoPct - canalEstablePct)
    const cierre = brecha >= 3
      ? ` — la brecha entre ambos canales es de ${brecha.toFixed(1)} pts.`
      : `.`
    partesCanal.push(`En canales, ${canalRetroceso} retrocede ${fmtPct(canalRetrocesoPct)} mientras ${canalEstable} se mantiene${cierre}`)
  } else if (canalRetroceso && canalRetrocesoPct != null) {
    partesCanal.push(`En canales, ${canalRetroceso} retrocede ${fmtPct(canalRetrocesoPct)} — conviene auditar qué está cambiando ahí.`)
  }

  const texto = [...partesTerritorio, ...partesCanal].join(' ')
  if (!texto) return null

  return {
    texto:             ensureSentenceEnd(texto),
    zonaTop, zonaTopPct,
    zonaBottom, zonaBottomPct,
    canalRetroceso, canalRetrocesoPct,
    canalEstable,
  }
}

// ─── Párrafo 3: Clientes + Productos ─────────────────────────────────────────

export interface ParrafoClientesProductos {
  texto:                 string
  numClientesActivos:    number
  cambioClientesYoY:     number | null
  topShare:              number | null
  numProductosActivos:   number
  cambioProductosYoY:    number | null
}

export function getParrafoClientesProductos(
  sales: SaleRecord[],
  year: number,
  month: number,
): ParrafoClientesProductos | null {
  const currClientes = new Set<string>()
  const prevClientes = new Set<string>()
  const currProductos = new Set<string>()
  const prevProductos = new Set<string>()
  const ventasPorCliente = new Map<string, number>()
  let ventaTotalCurr = 0
  for (const r of sales) {
    const d = toDate(r.fecha)
    const y = d.getFullYear()
    const m = d.getMonth()
    const cli = (r.clientKey ?? r.cliente ?? '') as string
    const prod = (r as unknown as { producto?: string }).producto ?? ''
    const val  = r.venta_neta ?? 0
    if (y === year && m === month) {
      if (cli) { currClientes.add(cli); ventasPorCliente.set(cli, (ventasPorCliente.get(cli) ?? 0) + val) }
      if (prod) currProductos.add(prod)
      ventaTotalCurr += val
    } else if (y === year - 1 && m === month) {
      if (cli)  prevClientes.add(cli)
      if (prod) prevProductos.add(prod)
    }
  }
  if (currClientes.size === 0 && currProductos.size === 0) return null

  const cambioClientesYoY = prevClientes.size > 0
    ? ((currClientes.size - prevClientes.size) / prevClientes.size) * 100
    : null
  const cambioProductosYoY = prevProductos.size > 0
    ? ((currProductos.size - prevProductos.size) / prevProductos.size) * 100
    : null

  // Top-3 share
  const top3Sum = [...ventasPorCliente.values()].sort((a, b) => b - a).slice(0, 3).reduce((s, v) => s + v, 0)
  const topShare = ventaTotalCurr > 0 ? (top3Sum / ventaTotalCurr) * 100 : null

  const partes: string[] = []
  if (currClientes.size > 0) {
    const cambioTxt = cambioClientesYoY != null ? ` (${fmtPct(cambioClientesYoY)} vs año anterior)` : ''
    // [PR-FIX.7.1 — A.5/N5] verbo adaptativo según cambioClientesYoY
    const verboBase =
      cambioClientesYoY == null ? 'La base de clientes se mantiene en' :
      cambioClientesYoY >=  5   ? 'La base de clientes crece a' :
      cambioClientesYoY <= -5   ? 'La base de clientes se reduce a' :
                                   'La base de clientes se mantiene en'
    partes.push(`${verboBase} ${currClientes.size} activos${cambioTxt}.`)
  }
  if (topShare != null && currClientes.size >= 3) {
    const calificador = topShare < 40 ? 'buena distribución de riesgo'
      : topShare < 60 ? 'concentración moderada'
      : 'alta concentración — vigilar dependencia de pocos clientes'
    partes.push(`Los 3 principales representan el ${topShare.toFixed(1)}% de la venta — ${calificador}.`)
  }
  if (currProductos.size > 0) {
    const cambioTxt = cambioProductosYoY != null ? ` (${fmtPct(cambioProductosYoY)} vs año anterior)` : ''
    partes.push(`En productos, ${currProductos.size} productos activos${cambioTxt}.`)
  }

  if (partes.length === 0) return null
  return {
    texto:                ensureSentenceEnd(partes.join(' ')),
    numClientesActivos:   currClientes.size,
    cambioClientesYoY,
    topShare,
    numProductosActivos:  currProductos.size,
    cambioProductosYoY,
  }
}

// ─── Párrafo 4: Categorías ───────────────────────────────────────────────────

export interface ParrafoCategorias {
  texto:          string
  catAfectadaTop: string | null
  crecieronCount: number
  cayeronCount:   number
}

export function getParrafoCategorias(
  categoriaAnalysis: CategoriaAnalysis[],
  territorialHasPattern: boolean,
): ParrafoCategorias | null {
  if (!categoriaAnalysis || categoriaAnalysis.length === 0) return null
  const crecieron = categoriaAnalysis.filter(c => (c.variacion_pct ?? 0) > 0)
  const cayeron   = categoriaAnalysis.filter(c => (c.variacion_pct ?? 0) < 0)
    .sort((a, b) => (a.variacion_pct ?? 0) - (b.variacion_pct ?? 0))

  const catAfectadaTop = cayeron[0]?.categoria ?? null
  const topCaidas = cayeron.slice(0, 2).map(c => c.categoria)

  let texto: string
  if (crecieron.length === 0 && cayeron.length > 0) {
    texto = `A nivel de categorías, ninguna creció este mes — ${topCaidas.join(' y ')} ${topCaidas.length > 1 ? 'son las más afectadas' : 'es la más afectada'}.`
  } else if (crecieron.length > 0 && cayeron.length === 0) {
    texto = `A nivel de categorías, todas crecieron este mes — ${crecieron[0].categoria} lidera el avance (${fmtPct(crecieron[0].variacion_pct ?? 0)}).`
  } else if (crecieron.length > 0 && cayeron.length > 0) {
    texto = `A nivel de categorías, ${crecieron[0].categoria} lidera el avance (${fmtPct(crecieron[0].variacion_pct ?? 0)}) mientras ${topCaidas.join(' y ')} ${topCaidas.length > 1 ? 'son las más afectadas' : 'es la más afectada'}.`
  } else {
    return null
  }

  // [PR-FIX.7.1 — A.6/N7] cierre derivado de magnitudes reales de crecieron/cayeron
  const fuerteCrece = crecieron.some(c => (c.variacion_pct ?? 0) > 10)
  const fuerteCae   = cayeron.some(c => (c.variacion_pct ?? 0) < -10)
  let cierre = ''
  if (fuerteCrece && fuerteCae) {
    cierre = ' Mezcla heterogénea — conviene mirar cada categoría por separado.'
  } else if (!fuerteCrece && cayeron.length >= 2) {
    cierre = ' La contracción se extiende a varias categorías.'
  } else if ((crecieron.length + cayeron.length) >= 2 && !fuerteCrece && !fuerteCae) {
    cierre = ' Mezcla estable sin movimientos marcados.'
  }
  texto += cierre
  void territorialHasPattern // flag conservada para futura rama territorial

  return {
    texto:          ensureSentenceEnd(texto),
    catAfectadaTop,
    crecieronCount: crecieron.length,
    cayeronCount:   cayeron.length,
  }
}

// ─── Acción prioritaria + subtítulo + señales ────────────────────────────────

export interface AccionPrioritaria {
  texto:   string
  sujeto:  string
  ventana: 'esta semana' | 'este mes' | 'este trimestre'
}

export function getAccionPrioritaria(
  vendorAnalysis: VendorAnalysis[],
  parrafoNegocio: ParrafoNegocio | null,
): AccionPrioritaria | null {
  if (!vendorAnalysis || vendorAnalysis.length === 0) return null
  const bottomName = parrafoNegocio?.vendedorBottom ?? null
  const bottom = bottomName
    ? vendorAnalysis.find(v => v.vendedor === bottomName)
    : [...vendorAnalysis].sort((a, b) => (a.variacion_ytd_usd_pct ?? a.variacion_pct ?? 0) - (b.variacion_ytd_usd_pct ?? b.variacion_pct ?? 0))[0]
  if (!bottom) return null
  const sujeto = bottom.vendedor
  const pct    = bottom.variacion_ytd_usd_pct ?? bottom.variacion_pct ?? 0
  const semanas = bottom.semanas_bajo_promedio ?? 0

  let contexto: string
  if (semanas >= 3) contexto = `lleva ${semanas} semanas bajo el promedio`
  else if (pct < 0) contexto = `acumula ${fmtPct(pct)} de rezago en el año`
  else contexto = 'requiere ajuste antes del cierre'

  // Ventana según severidad
  const ventana: AccionPrioritaria['ventana'] = semanas >= 4 || pct <= -15
    ? 'esta semana'
    : pct < 0 || semanas >= 2
      ? 'este mes'
      : 'este trimestre'

  const texto = `Revisar el plan de cierre con ${sujeto} — ${contexto}`
  return {
    texto:  ensureSentenceEnd(texto),
    sujeto,
    ventana,
  }
}

// [PR-FIX.7.1 — A.7/N8] 6 ramas adaptativas + opcional brechaTopBottom.
export function getSubtituloEstado(
  positivas: number,
  negativas: number,
  brechaTopBottom?: number,
): string {
  const ratio = negativas === 0 ? Infinity : positivas / negativas
  if (ratio >= 2.5)  return 'Mes favorable — aprovechar el impulso.'
  if (ratio >= 1.5)  return 'Buen ritmo — el reto es sostenerlo.'
  if (ratio <= 0.4)  return 'Mes complicado — priorizar contención de daños.'
  if (ratio <= 0.66) return 'Semana exigente — foco en recuperar señales clave.'
  if (brechaTopBottom != null && brechaTopBottom > 30) {
    return 'Equipo polarizado — decisiones selectivas por vendedor.'
  }
  return 'Señales mixtas — el mes pide decisiones selectivas.'
}

// ─── Orquestador ─────────────────────────────────────────────────────────────

export interface EstadoGeneralResult {
  parrafoNegocio:          ParrafoNegocio | null
  parrafoTerritorialCanal: ParrafoTerritorialCanal | null
  parrafoClientesProd:     ParrafoClientesProductos | null
  parrafoCategorias:       ParrafoCategorias | null
  accionPrioritaria:       AccionPrioritaria | null
  subtitulo:               string
  senalesConvergentes:     number
  positivas:               number
  negativas:               number
  dimensionsUsed:          string[]
}

export function computeEstadoGeneral(
  sales: SaleRecord[],
  year: number,
  month: number,
  vendorAnalysis: VendorAnalysis[],
  categoriaAnalysis: CategoriaAnalysis[],
  canalAnalysis: CanalAnalysis[],
): EstadoGeneralResult {
  // fechaReferencia = max(sales.fecha) — same invariant as the rest of the pipeline.
  const fechaReferencia = sales.length > 0
    ? new Date(sales.reduce((max, s) => {
        const t = (s.fecha instanceof Date ? s.fecha : new Date(s.fecha as string)).getTime()
        return t > max ? t : max
      }, 0))
    : new Date()

  const parrafoNegocio          = getParrafoNegocio(vendorAnalysis)
  const parrafoTerritorialCanal = getParrafoTerritorialCanal(sales, year, month, canalAnalysis, fechaReferencia)
  const parrafoClientesProd     = getParrafoClientesProductos(sales, year, month)
  const parrafoCategorias       = getParrafoCategorias(
    categoriaAnalysis,
    !!(parrafoTerritorialCanal?.zonaBottom || parrafoTerritorialCanal?.canalRetroceso),
  )
  const accionPrioritaria       = getAccionPrioritaria(vendorAnalysis, parrafoNegocio)

  // Conteo de señales: cada dimensión aporta +1 positiva o +1 negativa según dirección neta.
  let positivas = 0, negativas = 0
  const dimensionsUsed: string[] = []
  if (parrafoNegocio) {
    dimensionsUsed.push('vendedor')
    if (parrafoNegocio.direccion === 'positiva') positivas++
    else if (parrafoNegocio.direccion === 'negativa') negativas++
    else { positivas++; negativas++ }
  }
  if (parrafoTerritorialCanal) {
    if (parrafoTerritorialCanal.zonaTop)    { dimensionsUsed.push('departamento'); positivas++ }
    if (parrafoTerritorialCanal.zonaBottom) negativas++
    if (parrafoTerritorialCanal.canalRetroceso) { dimensionsUsed.push('canal'); negativas++ }
    if (parrafoTerritorialCanal.canalEstable)   positivas++
  }
  if (parrafoClientesProd) {
    if (parrafoClientesProd.numClientesActivos > 0) dimensionsUsed.push('cliente')
    if (parrafoClientesProd.cambioClientesYoY != null) {
      if (parrafoClientesProd.cambioClientesYoY >= 0) positivas++; else negativas++
    }
    if (parrafoClientesProd.numProductosActivos > 0) dimensionsUsed.push('producto')
    if (parrafoClientesProd.cambioProductosYoY != null) {
      if (parrafoClientesProd.cambioProductosYoY >= 0) positivas++; else negativas++
    }
  }
  if (parrafoCategorias) {
    dimensionsUsed.push('categoria')
    positivas += parrafoCategorias.crecieronCount > 0 ? 1 : 0
    negativas += parrafoCategorias.cayeronCount   > 0 ? 1 : 0
  }

  const senalesConvergentes = Math.max(positivas, negativas)

  // [PR-FIX.7.1 — A.7] brecha top-bottom del equipo para subtítulo polarizado
  const vendWithPct = vendorAnalysis
    .map(v => v.variacion_ytd_usd_pct ?? v.variacion_pct)
    .filter((x): x is number => typeof x === 'number')
  const brechaTopBottom =
    vendWithPct.length >= 2
      ? Math.max(...vendWithPct) - Math.min(...vendWithPct)
      : undefined

  const subtitulo = getSubtituloEstado(positivas, negativas, brechaTopBottom)

  return {
    parrafoNegocio,
    parrafoTerritorialCanal,
    parrafoClientesProd,
    parrafoCategorias,
    accionPrioritaria,
    subtitulo,
    senalesConvergentes,
    positivas,
    negativas,
    dimensionsUsed: [...new Set(dimensionsUsed)],
  }
}
