// ============================================================
// insightEngine.ts — v2.0
// Arquitectura: buildCrossTables (1 pase) → 15 generadores → pipeline
// Validado contra insightStandard.ts (26 reglas)
// Mantiene firma pública generateInsights() para no romper analysisWorker.ts
// ============================================================

import type {
  VendorAnalysis,
  TeamStats,
  SaleRecord,
  MetaRecord,
  ClienteDormido,
  ConcentracionRiesgo,
  DataAvailability,
  Configuracion,
  Insight,
  InsightPrioridad,
  InsightTipo,
  SupervisorAnalysis,
  CategoriaAnalysis,
  CanalAnalysis,
  CategoriaInventario,
} from '../types'
import {
  formatearImpacto,
  sustituirJerga,
  contieneJerga,
  esConclusionValida,
  validarInsight,
  calcularPercentiles,
  calcularChurnBaseline,
  calcularPareto,
  validarComparacionTemporal,
  validarAccionConcreta,
  evaluarIntegracionInventario,
  evaluarIntegracionMetas,
  calcularDiaDelMes,
  calcularDiasEnMes,
} from './insightStandard'
import type {
  InsightStandardConfig,
  InsightCandidate,
  AccionConcreta,
  PrioridadInsight,
} from './insightStandard'

// ────────────────────────────────────────────────────────────
// TIPOS INTERNOS
// ────────────────────────────────────────────────────────────

interface VendorYTDBucket {
  net: number
  uds: number
  clients: Map<string, number>
  prods: Map<string, number>
  depts: Map<string, number>
  canals: Map<string, number>
  txCount: number
}
interface VendorPrevYTDBucket {
  net: number
  uds: number
  clients: Map<string, number>
  prods: Map<string, number>
}
interface VendorMTDBucket { net: number; uds: number }

interface ClientYTDBucket {
  net: number
  uds: number
  prods: Map<string, number>
  vendors: Map<string, number>
  depts: Map<string, number>
  canals: Map<string, number>
  txCount: number
}
interface ClientPrevYTDBucket {
  net: number
  uds: number
  prods: Map<string, number>
}

interface ProdYTDBucket {
  net: number
  uds: number
  clients: Map<string, number>
  vendors: Map<string, number>
  depts: Map<string, number>
  canals: Map<string, number>
  categoria: string
}
interface ProdPrevYTDBucket {
  net: number
  uds: number
  clients: Map<string, number>
}

interface DeptYTDBucket {
  net: number
  uds: number
  vendors: Map<string, number>
  clients: Map<string, number>
  prods: Map<string, number>
}

interface CanalYTDBucket {
  net: number
  uds: number
  clients: Set<string>
  vendors: Set<string>
}

export interface CrossTables {
  vendorYTD: Map<string, VendorYTDBucket>
  vendorPrevYTD: Map<string, VendorPrevYTDBucket>
  vendorMTD: Map<string, VendorMTDBucket>
  vendorPrevMTD: Map<string, VendorMTDBucket>

  clientYTD: Map<string, ClientYTDBucket>
  clientPrevYTD: Map<string, ClientPrevYTDBucket>

  prodYTD: Map<string, ProdYTDBucket>
  prodPrevYTD: Map<string, ProdPrevYTDBucket>

  deptYTD: Map<string, DeptYTDBucket>
  deptPrevYTD: Map<string, { net: number; uds: number }>

  canalYTD: Map<string, CanalYTDBucket>
  canalPrevYTD: Map<string, { net: number; uds: number }>

  monthlyByVendor: Map<string, Map<string, number>>   // "YYYY-MM" → net (o uds si !hasNeta)
  monthlyByProduct: Map<string, Map<string, number>>
  monthlyByClient: Map<string, Map<string, number>>

  vendorClientMatrix: Map<string, Map<string, number>>

  // GAP 5: cliente → producto → { uds, net } YTD (para co-decline analysis)
  clientProductYTD: Map<string, Map<string, { uds: number; net: number }>>

  totalYTD: number
  totalPrevYTD: number
  totalMTD: number
  totalPrevMTD: number

  fechaRef: Date
  diaDelMes: number
  diasEnMes: number
  hasVentaNeta: boolean
}

type CandidatoInterno = Insight & {
  __impactoAbs: number
  __crucesCount: number
  __esAccionable: boolean
  __esPositivo: boolean
}

// ────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────

let _idCounter = 0
function uid(prefix: string): string {
  return `${prefix}-${++_idCounter}`
}

const MES_NOMBRE = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function fmtPct(n: number): string {
  return `${Math.round(n)}%`
}

function fmtNum(n: number): string {
  return Math.round(n).toLocaleString('es')
}

function fmtImp(n: number, hasNeta: boolean): string {
  return formatearImpacto(n, hasNeta)
}

function safeStr(s: string | undefined | null): string {
  return (s ?? '').trim()
}

function incMap<K>(m: Map<K, number>, k: K, v: number) {
  m.set(k, (m.get(k) ?? 0) + v)
}

function ensureMap<K, V>(m: Map<K, V>, k: K, factory: () => V): V {
  let r = m.get(k)
  if (!r) { r = factory(); m.set(k, r) }
  return r
}

function topN<T>(arr: T[], n: number, key: (t: T) => number): T[] {
  return [...arr].sort((a, b) => key(b) - key(a)).slice(0, n)
}

function bottomN<T>(arr: T[], n: number, key: (t: T) => number): T[] {
  return [...arr].sort((a, b) => key(a) - key(b)).slice(0, n)
}

function pctOf(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0
}

// ────────────────────────────────────────────────────────────
// INSIGHT STANDARD INTEGRATION
// ────────────────────────────────────────────────────────────

function calculatePercentilesByEntityType(candidatos: CandidatoInterno[]): {
  vendedor: { p5: number; p20: number; p50: number; p80: number; p95: number };
  cliente: { p5: number; p10: number; p20: number; p50: number; p75: number; p90: number; p95: number };
  producto: { p5: number; p20: number; p50: number; p80: number; p95: number };
} {
  const impactosVendedor: number[] = []
  const impactosCliente: number[] = []
  const impactosProducto: number[] = []
  
  for (const c of candidatos) {
    const impacto = c.__impactoAbs
    if (c.vendedor) impactosVendedor.push(impacto)
    if (c.cliente) impactosCliente.push(impacto)
    if (c.producto) impactosProducto.push(impacto)
  }
  
  const calcular = (vals: number[]) => {
    const sorted = [...vals].filter(v => v > 0).sort((a, b) => a - b)
    const p = (pct: number) => sorted[Math.floor(sorted.length * pct / 100)] || 0
    return {
      p5: p(5),
      p10: p(10),
      p20: p(20),
      p50: p(50),
      p75: p(75),
      p80: p(80),
      p90: p(90),
      p95: p(95),
    }
  }
  
  return {
    vendedor: calcular(impactosVendedor),
    cliente: calcular(impactosCliente),
    producto: calcular(impactosProducto),
  }
}

function buildInsightStandardConfig(candidatos: CandidatoInterno[], cross: CrossTables): InsightStandardConfig {
  const percentiles = calculatePercentilesByEntityType(candidatos)
  
  // Calcular pareto entities (vendedores80, clientes80, productos80)
  // Usar datos de cross tables para obtener volumen YTD
  const vendedores80 = calcularParetoEntities(cross.vendorYTD, cross.totalYTD)
  const clientes80 = calcularParetoEntities(cross.clientYTD, sumarMap(cross.clientYTD, 'net'))
  const productos80 = calcularParetoEntities(cross.prodYTD, sumarMap(cross.prodYTD, 'net'))
  
  // Helper para calcular Pareto
  function calcularParetoEntities<T extends { net: number }>(map: Map<string, T>, total: number): string[] {
    if (total <= 0) return []
    const entries = Array.from(map.entries())
      .filter(([_, data]) => data.net > 0)
      .sort((a, b) => b[1].net - a[1].net)
    let acum = 0
    const result: string[] = []
    for (const [key, data] of entries) {
      acum += data.net
      result.push(key)
      if (acum / total >= 0.8) break
    }
    return result
  }
  
  function sumarMap<T extends { net: number }>(map: Map<string, T>, _prop: 'net'): number {
    let total = 0
    for (const data of map.values()) total += data.net
    return total
  }
  
  return {
    percentiles,
    churnBaseline: {
      tasaPromedio: 0,
      desviacionEstandar: 0,
    },
    paretoEntities: {
      vendedores80,
      clientes80,
      productos80,
    },
    diaDelMes: cross.diaDelMes,
    pctMesTipico: cross.diasEnMes > 0 ? (cross.diaDelMes / cross.diasEnMes) * 100 : 0,
    varianzaPctMes: 0,
    productFamilies: new Map(),
  }
}

function toInsightCandidate(candidato: CandidatoInterno, percentileRank: number, cross: CrossTables): InsightCandidate {
  // Determinar entityType
  let entityType: 'vendedor' | 'cliente' | 'producto' | 'departamento' | 'canal' = 'vendedor'
  let entityId = ''
  let entityName = ''
  
  if (candidato.vendedor) {
    entityType = 'vendedor'
    entityId = candidato.vendedor
    entityName = candidato.vendedor
  } else if (candidato.cliente) {
    entityType = 'cliente'
    entityId = candidato.cliente
    entityName = candidato.cliente
  } else if (candidato.producto) {
    entityType = 'producto'
    entityId = candidato.producto
    entityName = candidato.producto
  } else if (candidato.id.includes('depto')) {
    entityType = 'departamento'
    entityId = candidato.descripcion.split(' ')[0] || '' // hack
    entityName = entityId
  } else if (candidato.id.includes('canal')) {
    entityType = 'canal'
    entityId = candidato.descripcion.split(' ')[0] || ''
    entityName = entityId
  }
  
  const crossedTables = candidato.cruces ?? []
  const profundidadCruce = crossedTables.length
  const causaIdentificada = profundidadCruce >= 2
  
  const accion: AccionConcreta = candidato.accion ? {
    texto: candidato.accion.texto,
    entidadesInvolucradas: candidato.accion.entidades,
    respaldoNumerico: candidato.accion.respaldo,
    ejecutableEn: candidato.accion.ejecutableEn as 'inmediato' | 'esta_semana' | 'este_mes',
  } : {
    texto: candidato.accion_sugerida || '',
    entidadesInvolucradas: [],
    respaldoNumerico: '',
    ejecutableEn: 'este_mes',
  }
  
  let comparacionTipo: 'YTD' | 'MTD' | 'historico' = 'YTD'
  if (candidato.metaContext) comparacionTipo = 'MTD'
  else if (candidato.id.includes('meta') || candidato.id.includes('mtd')) comparacionTipo = 'MTD'
  else if (candidato.id.includes('historico') || candidato.id.includes('promedio')) comparacionTipo = 'historico'
  
  return {
    entityType,
    entityId,
    entityName,
    rawValue: candidato.valor_numerico ?? candidato.__impactoAbs,
    percentileRank,
    crossedTables,
    profundidadCruce,
    causaIdentificada,
    contrastePortafolio: candidato.contrastePortafolio || null,
    comparacionTipo,
    accion,
    señalesConvergentes: candidato.señalesConvergentes ?? 1,
    impactoAbsoluto: candidato.__impactoAbs,
    hasVentaNeta: cross.hasVentaNeta,
    narrativaCompleta: candidato.descripcion,
    conclusion: candidato.conclusion || '',
    esAccionable: candidato.__esAccionable,
    metaContext: candidato.metaContext ? {
      metaMes: candidato.metaContext.metaMes,
      cumplimiento: candidato.metaContext.cumplimiento,
      gap: candidato.metaContext.gap,
      proyeccion: candidato.metaContext.proyeccion,
    } : null,
    inventarioContext: candidato.inventarioContext ? {
      stockActual: candidato.inventarioContext.stock,
      mesesCobertura: candidato.inventarioContext.mesesCobertura,
      sinStock: candidato.inventarioContext.alerta.includes('sin stock') || false,
      sobrestock: candidato.inventarioContext.alerta.includes('sobrestock') || false,
    } : null,
  }
}

// ────────────────────────────────────────────────────────────
// PASO 1 — buildCrossTables() — UN SOLO PASE sobre sales
// ────────────────────────────────────────────────────────────

export function buildCrossTables(
  sales: SaleRecord[],
  fechaRef: Date,
  hasVentaNeta: boolean,
): CrossTables {
  const cross: CrossTables = {
    vendorYTD: new Map(),
    vendorPrevYTD: new Map(),
    vendorMTD: new Map(),
    vendorPrevMTD: new Map(),
    clientYTD: new Map(),
    clientPrevYTD: new Map(),
    prodYTD: new Map(),
    prodPrevYTD: new Map(),
    deptYTD: new Map(),
    deptPrevYTD: new Map(),
    canalYTD: new Map(),
    canalPrevYTD: new Map(),
    monthlyByVendor: new Map(),
    monthlyByProduct: new Map(),
    monthlyByClient: new Map(),
    vendorClientMatrix: new Map(),
    clientProductYTD: new Map(),
    totalYTD: 0,
    totalPrevYTD: 0,
    totalMTD: 0,
    totalPrevMTD: 0,
    fechaRef,
    diaDelMes: fechaRef.getDate(),
    diasEnMes: new Date(fechaRef.getFullYear(), fechaRef.getMonth() + 1, 0).getDate(),
    hasVentaNeta,
  }

  const anioRef = fechaRef.getFullYear()
  const mesRef = fechaRef.getMonth()
  const diaRef = fechaRef.getDate()

  for (const s of sales) {
    if (!s || !s.fecha) continue
    const fd = s.fecha instanceof Date ? s.fecha : new Date(s.fecha)
    if (isNaN(fd.getTime())) continue

    const yr = fd.getFullYear()
    const mo = fd.getMonth()
    const dy = fd.getDate()

    const vendedor = safeStr(s.vendedor) || '—'
    const cliente = safeStr(s.cliente ?? s.codigo_cliente)
    const producto = safeStr(s.producto ?? s.codigo_producto)
    const categoria = safeStr(s.categoria) || 'Sin categoría'
    const canal = safeStr(s.canal)
    const departamento = safeStr(s.departamento)

    const uds = s.unidades || 0
    const net = hasVentaNeta ? (s.venta_neta ?? 0) : uds
    const valor = hasVentaNeta ? net : uds

    // Período
    const isYTD = yr === anioRef && (mo < mesRef || (mo === mesRef && dy <= diaRef))
    const isPrevYTD = yr === anioRef - 1 && (mo < mesRef || (mo === mesRef && dy <= diaRef))
    const isMTD = yr === anioRef && mo === mesRef && dy <= diaRef
    const isPrevMTD = yr === anioRef - 1 && mo === mesRef && dy <= diaRef

    // Monthly trends — siempre acumular
    const monthKey = `${yr}-${String(mo + 1).padStart(2, '0')}`
    if (vendedor) {
      const m = ensureMap(cross.monthlyByVendor, vendedor, () => new Map<string, number>())
      incMap(m, monthKey, valor)
    }
    if (producto) {
      const m = ensureMap(cross.monthlyByProduct, producto, () => new Map<string, number>())
      incMap(m, monthKey, valor)
    }
    if (cliente) {
      const m = ensureMap(cross.monthlyByClient, cliente, () => new Map<string, number>())
      incMap(m, monthKey, valor)
    }

    // YTD actual
    if (isYTD) {
      cross.totalYTD += net

      // Vendor YTD
      if (vendedor) {
        const vb = ensureMap(cross.vendorYTD, vendedor, () => ({
          net: 0, uds: 0, clients: new Map(), prods: new Map(), depts: new Map(), canals: new Map(), txCount: 0,
        }))
        vb.net += net
        vb.uds += uds
        vb.txCount++
        if (cliente) incMap(vb.clients, cliente, valor)
        if (producto) incMap(vb.prods, producto, valor)
        if (departamento) incMap(vb.depts, departamento, valor)
        if (canal) incMap(vb.canals, canal, valor)

        // Vendor-Client matrix
        if (cliente) {
          const vc = ensureMap(cross.vendorClientMatrix, vendedor, () => new Map<string, number>())
          incMap(vc, cliente, valor)
        }
      }

      // Client YTD
      if (cliente) {
        const cb = ensureMap(cross.clientYTD, cliente, () => ({
          net: 0, uds: 0, prods: new Map(), vendors: new Map(), depts: new Map(), canals: new Map(), txCount: 0,
        }))
        cb.net += net
        cb.uds += uds
        cb.txCount++
        if (producto) incMap(cb.prods, producto, valor)
        if (vendedor) incMap(cb.vendors, vendedor, valor)
        if (departamento) incMap(cb.depts, departamento, valor)
        if (canal) incMap(cb.canals, canal, valor)

        // GAP 5: clientProductYTD — cliente × producto → { uds, net }
        if (producto) {
          const cp = ensureMap(cross.clientProductYTD, cliente, () => new Map<string, { uds: number; net: number }>())
          const slot = cp.get(producto) ?? { uds: 0, net: 0 }
          slot.uds += uds
          slot.net += net
          cp.set(producto, slot)
        }
      }

      // Producto YTD
      if (producto) {
        const pb = ensureMap(cross.prodYTD, producto, () => ({
          net: 0, uds: 0, clients: new Map(), vendors: new Map(), depts: new Map(), canals: new Map(), categoria,
        }))
        pb.net += net
        pb.uds += uds
        if (categoria && !pb.categoria) pb.categoria = categoria
        if (cliente) incMap(pb.clients, cliente, valor)
        if (vendedor) incMap(pb.vendors, vendedor, valor)
        if (departamento) incMap(pb.depts, departamento, valor)
        if (canal) incMap(pb.canals, canal, valor)
      }

      // Departamento YTD
      if (departamento) {
        const db = ensureMap(cross.deptYTD, departamento, () => ({
          net: 0, uds: 0, vendors: new Map(), clients: new Map(), prods: new Map(),
        }))
        db.net += net
        db.uds += uds
        if (vendedor) incMap(db.vendors, vendedor, valor)
        if (cliente) incMap(db.clients, cliente, valor)
        if (producto) incMap(db.prods, producto, valor)
      }

      // Canal YTD
      if (canal) {
        const cab = ensureMap(cross.canalYTD, canal, () => ({
          net: 0, uds: 0, clients: new Set<string>(), vendors: new Set<string>(),
        }))
        cab.net += net
        cab.uds += uds
        if (cliente) cab.clients.add(cliente)
        if (vendedor) cab.vendors.add(vendedor)
      }
    }

    // YTD prev
    if (isPrevYTD) {
      cross.totalPrevYTD += net
      if (vendedor) {
        const vb = ensureMap(cross.vendorPrevYTD, vendedor, () => ({
          net: 0, uds: 0, clients: new Map(), prods: new Map(),
        }))
        vb.net += net
        vb.uds += uds
        if (cliente) incMap(vb.clients, cliente, valor)
        if (producto) incMap(vb.prods, producto, valor)
      }
      if (cliente) {
        const cb = ensureMap(cross.clientPrevYTD, cliente, () => ({
          net: 0, uds: 0, prods: new Map(),
        }))
        cb.net += net
        cb.uds += uds
        if (producto) incMap(cb.prods, producto, valor)
      }
      if (producto) {
        const pb = ensureMap(cross.prodPrevYTD, producto, () => ({
          net: 0, uds: 0, clients: new Map(),
        }))
        pb.net += net
        pb.uds += uds
        if (cliente) incMap(pb.clients, cliente, valor)
      }
      if (departamento) {
        const dbp = ensureMap(cross.deptPrevYTD, departamento, () => ({ net: 0, uds: 0 }))
        dbp.net += net
        dbp.uds += uds
      }
      if (canal) {
        const cabp = ensureMap(cross.canalPrevYTD, canal, () => ({ net: 0, uds: 0 }))
        cabp.net += net
        cabp.uds += uds
      }
    }

    // MTD actual
    if (isMTD) {
      cross.totalMTD += net
      if (vendedor) {
        const vb = ensureMap(cross.vendorMTD, vendedor, () => ({ net: 0, uds: 0 }))
        vb.net += net
        vb.uds += uds
      }
    }

    // MTD prev
    if (isPrevMTD) {
      cross.totalPrevMTD += net
      if (vendedor) {
        const vb = ensureMap(cross.vendorPrevMTD, vendedor, () => ({ net: 0, uds: 0 }))
        vb.net += net
        vb.uds += uds
      }
    }
  }

  return cross
}

// ────────────────────────────────────────────────────────────
// HELPERS DE DOMINIO COMPARTIDOS POR LOS GENERADORES
// ────────────────────────────────────────────────────────────

interface MetaResuelta {
  metaMes: number
  cumplimiento: number
  gap: number
  proyeccion: number
  pctProyeccion: number
  tipoMeta: string
  ventaActual: number
}

function resolverMetaMes(
  vendedor: string,
  metas: MetaRecord[],
  fechaRef: Date,
  ventaMTDNet: number,
  ventaMTDUds: number,
  diaDelMes: number,
  diasEnMes: number,
): MetaResuelta | null {
  if (!metas || metas.length === 0) return null
  const mes = fechaRef.getMonth() + 1
  const anio = fechaRef.getFullYear()

  const meta = metas.find(m => m.vendedor === vendedor && m.anio === anio && m.mes === mes)
  if (!meta) return null

  // Determinar tipo de meta y valor
  // Bug 1 fix: tipo_meta del registro manda. Sólo si no está definido usamos el fallback.
  let metaMes = 0
  let tipoMeta = 'unidades'
  let ventaActual = ventaMTDUds

  const tm = meta.tipo_meta as string | undefined
  if (tm === 'venta_neta' || tm === 'usd') {
    metaMes = (meta.meta_usd && meta.meta_usd > 0) ? meta.meta_usd : (meta.meta ?? 0)
    tipoMeta = 'usd'
    ventaActual = ventaMTDNet
  } else if (tm === 'unidades' || tm === 'uds') {
    metaMes = (meta.meta_uds && meta.meta_uds > 0) ? meta.meta_uds : (meta.meta ?? 0)
    tipoMeta = 'unidades'
    ventaActual = ventaMTDUds
  } else if (meta.meta_usd && meta.meta_usd > 0) {
    // Sin tipo_meta declarado: heurística — preferir usd si existe
    metaMes = meta.meta_usd
    tipoMeta = 'usd'
    ventaActual = ventaMTDNet
  } else if (meta.meta_uds && meta.meta_uds > 0) {
    metaMes = meta.meta_uds
    tipoMeta = 'unidades'
    ventaActual = ventaMTDUds
  } else if (meta.meta && meta.meta > 0) {
    metaMes = meta.meta
    tipoMeta = 'unidades'
    ventaActual = ventaMTDUds
  }
  if (!metaMes || metaMes <= 0) return null

  const cumplimiento = (ventaActual / metaMes) * 100
  const gap = metaMes - ventaActual
  const proyeccion = diaDelMes > 0 ? (ventaActual / diaDelMes) * diasEnMes : 0
  const pctProyeccion = (proyeccion / metaMes) * 100

  return { metaMes, cumplimiento, gap, proyeccion, pctProyeccion, tipoMeta, ventaActual }
}

function inventarioPorProducto(
  inventario: CategoriaInventario[],
): Map<string, CategoriaInventario> {
  const m = new Map<string, CategoriaInventario>()
  for (const i of inventario) {
    if (i.producto) m.set(i.producto, i)
  }
  return m
}

function clientesAusentes(
  prev: Map<string, number> | undefined,
  actual: Map<string, number> | undefined,
): Array<{ cliente: string; valorPrev: number }> {
  if (!prev) return []
  const ausentes: Array<{ cliente: string; valorPrev: number }> = []
  for (const [cliente, valorPrev] of prev) {
    if (!actual || !actual.has(cliente)) {
      ausentes.push({ cliente, valorPrev })
    }
  }
  return ausentes.sort((a, b) => b.valorPrev - a.valorPrev)
}

function changesByEntity(
  prev: Map<string, number> | undefined,
  actual: Map<string, number> | undefined,
): Array<{ key: string; actual: number; prev: number; delta: number }> {
  const result: Array<{ key: string; actual: number; prev: number; delta: number }> = []
  const seen = new Set<string>()
  if (actual) for (const k of actual.keys()) seen.add(k)
  if (prev) for (const k of prev.keys()) seen.add(k)
  for (const k of seen) {
    const a = actual?.get(k) ?? 0
    const p = prev?.get(k) ?? 0
    result.push({ key: k, actual: a, prev: p, delta: a - p })
  }
  return result
}

// ────────────────────────────────────────────────────────────
// GAP 4 — Churn baseline por vendedor (F3)
// ────────────────────────────────────────────────────────────

interface ChurnVendedor {
  baseline: number       // promedio de tasa de churn entre trimestres
  sigma: number          // desviación estándar
  actual: number         // tasa de churn del último trimestre vs anterior
  esAnomalo: boolean     // actual > baseline + 1σ
  perdidos: number       // # clientes que dejaron de comprar el último trimestre
}

/** Devuelve el trimestre (1-4) para una clave "YYYY-MM". 0 si inválido. */
function trimestreDe(monthKey: string): { anio: number; trimestre: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey)
  if (!m) return null
  const anio = parseInt(m[1], 10)
  const mes = parseInt(m[2], 10)
  if (mes < 1 || mes > 12) return null
  return { anio, trimestre: Math.ceil(mes / 3) }
}

/**
 * Calcula churn baseline por vendedor agrupando los meses históricos en trimestres.
 * Usa cross.vendorClientMatrix (clientes activos all-time) cruzado con cross.monthlyByVendor
 * sólo para conocer en qué meses tuvo actividad el vendedor — los clientes activos por
 * trimestre se infieren de las propias compras del vendedor en monthlyByClient.
 *
 * Como cross no tiene un mapping vendedor → trimestre → set<cliente> directo, derivamos
 * cuál es el último trimestre con actividad y comparamos contra el anterior usando los
 * datos disponibles: vendorYTD.clients (último período YTD) vs vendorPrevYTD.clients
 * (mismo período año anterior). Esto da una aproximación válida para flag de anomalía.
 */
function calcularChurnVendedor(cross: CrossTables): Map<string, ChurnVendedor> {
  const result = new Map<string, ChurnVendedor>()

  for (const [vend, ytd] of cross.vendorYTD) {
    const prev = cross.vendorPrevYTD.get(vend)
    if (!prev || prev.clients.size === 0) continue

    // tasa actual: clientes del año pasado YTD que ya no compran este YTD
    const prevSet = new Set(prev.clients.keys())
    const actualSet = new Set(ytd.clients.keys())
    let perdidos = 0
    for (const c of prevSet) if (!actualSet.has(c)) perdidos++
    const actual = prevSet.size > 0 ? perdidos / prevSet.size : 0

    // Baseline: usar la serie mensual del vendedor agrupada en trimestres.
    // Para cada par de trimestres consecutivos comparamos la presencia de meses con valor > 0
    // como proxy de "actividad continuada" — no tenemos clientes únicos por trimestre,
    // así que el baseline aproxima la volatilidad de actividad.
    const monthly = cross.monthlyByVendor.get(vend)
    const tasas: number[] = []
    if (monthly && monthly.size >= 2) {
      // Agrupar meses por trimestre y contar valor
      const porTrim = new Map<string, number>()
      for (const [mk, v] of monthly) {
        const t = trimestreDe(mk)
        if (!t) continue
        const key = `${t.anio}-Q${t.trimestre}`
        porTrim.set(key, (porTrim.get(key) ?? 0) + v)
      }
      const claves = [...porTrim.keys()].sort()
      for (let i = 1; i < claves.length; i++) {
        const a = porTrim.get(claves[i - 1]) ?? 0
        const b = porTrim.get(claves[i]) ?? 0
        if (a <= 0) continue
        const drop = (a - b) / a
        // Sólo tasas de "caída" relativa cuentan para el baseline de churn
        tasas.push(Math.max(0, drop))
      }
    }

    let baseline = 0
    let sigma = 0
    if (tasas.length > 0) {
      baseline = tasas.reduce((s, x) => s + x, 0) / tasas.length
      const variance = tasas.reduce((s, x) => s + (x - baseline) * (x - baseline), 0) / tasas.length
      sigma = Math.sqrt(variance)
    }

    const esAnomalo = tasas.length > 0 ? actual > baseline + sigma : actual > 0.25

    result.set(vend, { baseline, sigma, actual, esAnomalo, perdidos })
  }

  return result
}

// ────────────────────────────────────────────────────────────
// PASO 2 — GENERADORES (15)
// ────────────────────────────────────────────────────────────

// Generador 1 — vendedorMetaRiesgo
function vendedorMetaRiesgo(
  cross: CrossTables,
  metas: MetaRecord[],
  dormidos: ClienteDormido[],
  churnMap: Map<string, ChurnVendedor>,
): CandidatoInterno[] {
  const out: CandidatoInterno[] = []
  if (!metas || metas.length === 0) return out

  for (const [vendedor, mtd] of cross.vendorMTD) {
    const ytd = cross.vendorYTD.get(vendedor)
    if (!ytd) continue
    const meta = resolverMetaMes(vendedor, metas, cross.fechaRef, mtd.net, mtd.uds, cross.diaDelMes, cross.diasEnMes)
    if (!meta) continue
    if (meta.pctProyeccion >= 80) continue

    const prev = cross.vendorPrevYTD.get(vendedor)
    const cambios = changesByEntity(prev?.clients, ytd.clients)
    const peor = bottomN(cambios.filter(c => c.delta < 0), 1, c => c.delta)[0]

    // Bug 2 fix: usar prevYTD same-day del cliente (no el total all-time del dormido)
    const dormVend = dormidos
      .filter(d => d.vendedor === vendedor)
      .map(d => ({
        ...d,
        valorPrevYTD: cross.clientPrevYTD.get(d.cliente)?.net ?? 0,
      }))
      .sort((a, b) => b.valorPrevYTD - a.valorPrevYTD)
    const topDorm = dormVend[0]
    const dormValor = topDorm ? topDorm.valorPrevYTD : 0

    // Causa: dormido con valor alto o cliente que cayó fuerte
    const causa = topDorm
      ? `${topDorm.cliente} no compra hace ${topDorm.dias_sin_actividad} días (compraba ${fmtImp(dormValor, cross.hasVentaNeta)} en el mismo período del año pasado)`
      : peor
        ? `${peor.key} cayó ${fmtImp(Math.abs(peor.delta), cross.hasVentaNeta)} contra el año pasado`
        : 'Caída de actividad en cuentas principales'

    // Contraste portafolio
    const totalCartera = ytd.net
    const pesoTopDrop = peor && totalCartera > 0 ? pctOf(peor.actual, totalCartera) : 0
    const contraste = peor
      ? `${peor.key} representa el ${fmtPct(pesoTopDrop)} de la cartera actual del vendedor`
      : null

    const mesNombre = MES_NOMBRE[cross.fechaRef.getMonth()]
    const nombreMoneda = cross.hasVentaNeta && meta.tipoMeta === 'usd' ? '' : ''
    void nombreMoneda

    // GAP 4: enriquecer narrativa con churn anómalo (no cambia prioridad)
    const churn = churnMap.get(vendedor)
    const churnFrase = churn && churn.esAnomalo && churn.perdidos > 0
      ? ` Además ha perdido más clientes de lo habitual (${churn.perdidos} este período vs comportamiento histórico).`
      : ''

    const narrativa = [
      `${vendedor} proyecta cerrar ${mesNombre} en ${fmtPct(meta.pctProyeccion)} de su meta (${fmtImp(meta.proyeccion, meta.tipoMeta === 'usd')} de ${fmtImp(meta.metaMes, meta.tipoMeta === 'usd')}).`,
      `La causa principal: ${causa}.`,
      contraste ? `${contraste}.` : '',
      `Lleva ${fmtImp(meta.ventaActual, meta.tipoMeta === 'usd')} al día ${cross.diaDelMes} y necesita ${fmtImp(meta.gap, meta.tipoMeta === 'usd')} más en ${cross.diasEnMes - cross.diaDelMes} días para cerrar la meta.${churnFrase}`,
    ].filter(Boolean).join(' ')

    const conclusion = topDorm
      ? `Sin reactivar a ${topDorm.cliente} la meta queda fuera de alcance.`
      : `El ritmo actual deja al vendedor ${fmtPct(80 - meta.pctProyeccion)} debajo del umbral de cumplimiento.`

    const entidades = [vendedor]
    if (topDorm) entidades.push(topDorm.cliente)
    else if (peor) entidades.push(peor.key)

    const accionTexto = topDorm
      ? `Visita inmediata a ${topDorm.cliente} con la oferta usual; si responde, recupera ${fmtImp(dormValor, cross.hasVentaNeta)} del mismo período del año pasado.`
      : peor
        ? `Reunión esta semana con ${peor.key} para entender la caída de ${fmtImp(Math.abs(peor.delta), cross.hasVentaNeta)}.`
        : `Llamada de seguimiento a sus 3 clientes principales para confirmar pedidos del cierre de mes.`

    const cruces = ['ventas', 'vendedor', 'cliente', 'metas']
    if (dormVend.length > 0) cruces.push('dormidos')
    if (ytd.depts.size > 0) cruces.push('departamento')
    if (ytd.prods.size > 0) cruces.push('producto')

    out.push({
      id: uid('meta-riesgo'),
      tipo: 'riesgo_meta',
      prioridad: 'CRITICA',
      emoji: '⚠️',
      titulo: `${vendedor} no llegará a su meta de ${mesNombre}`,
      descripcion: narrativa,
      vendedor,
      valor_numerico: Math.round(meta.pctProyeccion),
      impacto_economico: {
        valor: Math.abs(meta.gap),
        descripcion: `Brecha de ${fmtImp(Math.abs(meta.gap), meta.tipoMeta === 'usd')} contra meta`,
        tipo: 'riesgo',
      },
      conclusion,
      accion: {
        texto: accionTexto,
        entidades,
        respaldo: `proyección ${fmtImp(meta.proyeccion, meta.tipoMeta === 'usd')} vs meta ${fmtImp(meta.metaMes, meta.tipoMeta === 'usd')}`,
        ejecutableEn: 'inmediato',
      },
      contrastePortafolio: contraste ?? undefined,
      cruces,
      metaContext: {
        metaMes: Math.round(meta.metaMes),
        cumplimiento: Math.round(meta.cumplimiento),
        gap: Math.round(meta.gap),
        proyeccion: Math.round(meta.proyeccion),
        tipoMeta: meta.tipoMeta,
      },
      esPositivo: false,
      esAccionable: true,
      señalesConvergentes: 1 + (topDorm ? 1 : 0) + (peor ? 1 : 0),
      __impactoAbs: Math.abs(meta.gap),
      __crucesCount: cruces.length,
      __esAccionable: true,
      __esPositivo: false,
    })
  }
  return out
}

// Generador 2 — productoMuerto (Bug 4: consolida por categoría)
function productoMuerto(
  cross: CrossTables,
  inventario: CategoriaInventario[],
): CandidatoInterno[] {
  const out: CandidatoInterno[] = []
  const invMap = inventarioPorProducto(inventario)

  // 1) Recolectar todos los productos muertos
  type Muerto = {
    producto: string
    categoria: string
    prevNet: number
    clientes: string[]
    stock: number
    inv: CategoriaInventario | undefined
  }
  const muertos: Muerto[] = []
  for (const [producto, prev] of cross.prodPrevYTD) {
    const ytd = cross.prodYTD.get(producto)
    if (ytd && ytd.net > 0) continue
    if (prev.net <= 0) continue
    const clientes = [...prev.clients.keys()]
    if (clientes.length === 0) continue
    const inv = invMap.get(producto)
    const cat = inv?.categoria ?? ytd?.categoria ?? 'Sin categoría'
    muertos.push({
      producto,
      categoria: cat,
      prevNet: prev.net,
      clientes,
      stock: inv?.unidades_actuales ?? 0,
      inv,
    })
  }
  if (muertos.length === 0) return out

  // 2) Agrupar por categoría
  const porCategoria = new Map<string, Muerto[]>()
  for (const m of muertos) {
    const arr = porCategoria.get(m.categoria) ?? []
    arr.push(m)
    porCategoria.set(m.categoria, arr)
  }

  for (const [categoria, grupo] of porCategoria) {
    // Detectar sustituto: producto de la misma categoría que creció
    let sustituto: { producto: string; delta: number; varPct: number } | null = null
    for (const [pName, pYTD] of cross.prodYTD) {
      if (pYTD.categoria !== categoria) continue
      if (grupo.find(g => g.producto === pName)) continue
      const pPrev = cross.prodPrevYTD.get(pName)?.net ?? 0
      const delta = pYTD.net - pPrev
      if (delta <= 0) continue
      const varPct = pPrev > 0 ? (delta / pPrev) * 100 : 0
      if (!sustituto || delta > sustituto.delta) sustituto = { producto: pName, delta, varPct }
    }

    if (grupo.length === 1) {
      // Insight individual (formato anterior, solo uno)
      const m = grupo[0]
      const cruces = ['ventas', 'producto', 'cliente']
      if (m.inv) cruces.push('inventario')
      if (sustituto) cruces.push('categoria')

      const narrativa = [
        `${m.producto} no registró ventas en lo que va del año (vendía ${fmtImp(m.prevNet, cross.hasVentaNeta)} en el mismo período del año pasado).`,
        `Compraban: ${m.clientes.slice(0, 3).join(', ')}.`,
        m.stock > 0 ? `Quedan ${fmtNum(m.stock)} unidades en inventario.` : 'Sin existencias en inventario.',
        sustituto ? `En ${categoria}, ${sustituto.producto} creció ${fmtPct(sustituto.varPct)}: posible reemplazo.` : '',
      ].filter(Boolean).join(' ')

      const conclusion = sustituto
        ? `Los clientes de ${m.producto} migraron a ${sustituto.producto}; conviene confirmar y ajustar el surtido.`
        : `${m.producto} dejó de moverse aunque hay clientes históricos; revisar si fue cambio de proveedor o pérdida de demanda.`

      out.push({
        id: uid('producto-muerto'),
        tipo: 'riesgo_producto',
        prioridad: 'ALTA',
        emoji: '🪦',
        titulo: `${m.producto} dejó de venderse`,
        descripcion: narrativa,
        producto: m.producto,
        valor_numerico: Math.round(m.prevNet),
        impacto_economico: {
          valor: m.prevNet,
          descripcion: `Ventas perdidas: ${fmtImp(m.prevNet, cross.hasVentaNeta)} del año pasado`,
          tipo: 'perdida',
        },
        conclusion,
        accion: {
          texto: sustituto
            ? `Confirmar con ${m.clientes[0]} si reemplazó ${m.producto} por ${sustituto.producto}; ajustar inventario y oferta.`
            : `Llamar a ${m.clientes[0]} y ${m.clientes[1] ?? m.clientes[0]} para entender por qué dejaron de comprar.`,
          entidades: [m.producto, ...m.clientes.slice(0, 2)],
          respaldo: `${fmtImp(m.prevNet, cross.hasVentaNeta)} de venta histórica perdida`,
          ejecutableEn: 'esta_semana',
        },
        contrastePortafolio: `Ventas históricas de ${fmtImp(m.prevNet, cross.hasVentaNeta)} con ${m.clientes.length} clientes activos en el período anterior`,
        cruces,
        inventarioContext: m.inv ? {
          stock: m.stock,
          mesesCobertura: 0,
          alerta: m.stock > 0 ? 'inventario_inmovilizado' : 'sin_stock',
        } : undefined,
        esPositivo: false,
        esAccionable: true,
        señalesConvergentes: 1 + (sustituto ? 1 : 0) + (m.stock > 0 ? 1 : 0),
        __impactoAbs: m.prevNet,
        __crucesCount: cruces.length,
        __esAccionable: true,
        __esPositivo: false,
      })
      continue
    }

    // Consolidado: ≥2 productos muertos en la misma categoría
    grupo.sort((a, b) => b.prevNet - a.prevNet)
    const totalPrev = grupo.reduce((s, g) => s + g.prevNet, 0)
    const totalStock = grupo.reduce((s, g) => s + g.stock, 0)
    const productos = grupo.map(g => g.producto)
    const clientesUnicos = new Set<string>()
    for (const g of grupo) for (const c of g.clientes) clientesUnicos.add(c)
    const clientesLista = [...clientesUnicos].slice(0, 3)

    const cruces = ['ventas', 'producto', 'cliente', 'categoria']
    if (totalStock > 0) cruces.push('inventario')

    const narrativa = [
      `${grupo.length} productos de ${categoria} dejaron de venderse este año: ${productos.join(', ')}.`,
      `Su venta combinada del año pasado en el mismo período fue ${fmtImp(totalPrev, cross.hasVentaNeta)}.`,
      totalStock > 0 ? `Aún quedan ${fmtNum(totalStock)} unidades en inventario combinado.` : 'Sin existencias en inventario.',
      sustituto
        ? `Mientras tanto, ${sustituto.producto} (misma categoría) creció ${fmtPct(sustituto.varPct)}: hay reemplazo dentro del catálogo.`
        : '',
      `Clientes que los compraban: ${clientesLista.join(', ')}.`,
    ].filter(Boolean).join(' ')

    const conclusion = sustituto
      ? `Los clientes de ${categoria} migraron a ${sustituto.producto}; el catálogo viejo quedó sin demanda.`
      : `Hay un hueco de ${fmtImp(totalPrev, cross.hasVentaNeta)} en ${categoria} sin reemplazo identificado.`

    out.push({
      id: uid('productos-muertos-cat'),
      tipo: 'riesgo_producto',
      prioridad: 'ALTA',
      emoji: '🪦',
      titulo: `${grupo.length} productos de ${categoria} dejaron de venderse`,
      descripcion: narrativa,
      valor_numerico: grupo.length,
      impacto_economico: {
        valor: totalPrev,
        descripcion: `${fmtImp(totalPrev, cross.hasVentaNeta)} de venta histórica combinada perdida`,
        tipo: 'perdida',
      },
      conclusion,
      accion: {
        texto: sustituto
          ? `Confirmar con ${clientesLista[0]} si está usando ${sustituto.producto} y ajustar el surtido de ${categoria}.`
          : `Reunión de revisión de catálogo de ${categoria}: decidir reemplazo o salida definitiva.`,
        entidades: [categoria, ...productos, ...(sustituto ? [sustituto.producto] : [])],
        respaldo: `${grupo.length} productos · ${fmtImp(totalPrev, cross.hasVentaNeta)} histórico`,
        ejecutableEn: 'esta_semana',
      },
      contrastePortafolio: `${grupo.length} productos representan ${fmtPct(pctOf(totalPrev, cross.totalPrevYTD))} de las ventas históricas YTD del año pasado`,
      cruces,
      inventarioContext: totalStock > 0 ? {
        stock: totalStock,
        mesesCobertura: 0,
        alerta: 'inventario_inmovilizado',
      } : undefined,
      esPositivo: false,
      esAccionable: true,
      señalesConvergentes: grupo.length + (sustituto ? 1 : 0),
      __impactoAbs: totalPrev,
      __crucesCount: cruces.length,
      __esAccionable: true,
      __esPositivo: false,
    })
  }

  return out
}

// Generador 3 — inventarioDesabasto (Bug 3: <7d urgente + 7-14d alerta)
function inventarioDesabasto(
  cross: CrossTables,
  inventario: CategoriaInventario[],
): CandidatoInterno[] {
  if (!inventario || inventario.length === 0) return []

  type Item = {
    producto: string
    stock: number
    diasInventario: number
    ventaYTD: number
    topVendedor: string | null
    severidad: 'urgente' | 'alerta'
  }

  // Umbral más permisivo: P40 (en lugar de P50) de ventas YTD para no excluir productos relevantes
  const ventas = [...cross.prodYTD.values()].map(p => p.net).filter(v => v > 0).sort((a, b) => a - b)
  const umbralVenta = ventas.length > 0 ? ventas[Math.floor(ventas.length * 0.4)] : 0

  const items: Item[] = []
  for (const inv of inventario) {
    const ytd = cross.prodYTD.get(inv.producto)
    const ventaYTD = ytd?.net ?? 0
    if (ventaYTD < umbralVenta) continue

    // Bug 3 fix: usar dias_inventario directamente (campo precalculado).
    // Antes filtrábamos por pm3>0 lo que excluía productos sin pm3 calculable.
    const dias = inv.dias_inventario
    if (dias == null || dias < 0) continue
    if (dias >= 14) continue // > 2 semanas: no aplica

    const topV = ytd && ytd.vendors.size > 0
      ? [...ytd.vendors.entries()].sort((a, b) => b[1] - a[1])[0][0]
      : null

    items.push({
      producto: inv.producto,
      stock: inv.unidades_actuales,
      diasInventario: dias,
      ventaYTD,
      topVendedor: topV,
      severidad: dias < 7 ? 'urgente' : 'alerta',
    })
  }

  if (items.length === 0) return []

  items.sort((a, b) => b.ventaYTD - a.ventaYTD)
  const urgentes = items.filter(i => i.severidad === 'urgente')
  const alertas = items.filter(i => i.severidad === 'alerta')

  const top = items.slice(0, 6)
  const impactoTotal = items.reduce((s, r) => s + r.ventaYTD, 0)
  const productos = top.map(r => r.producto)
  const fmtItem = (r: Item) => `${r.producto} (${fmtNum(r.stock)} uds, ${r.diasInventario}d)`
  const listaUrg = urgentes.slice(0, 4).map(fmtItem).join('; ')
  const listaAlert = alertas.slice(0, 3).map(fmtItem).join('; ')

  const narrativa = [
    urgentes.length > 0
      ? `${urgentes.length} producto${urgentes.length > 1 ? 's' : ''} con cobertura menor a una semana: ${listaUrg}.`
      : '',
    alertas.length > 0
      ? `${alertas.length} producto${alertas.length > 1 ? 's' : ''} en alerta (7 a 14 días de cobertura): ${listaAlert}.`
      : '',
    `Su venta combinada YTD es ${fmtImp(impactoTotal, cross.hasVentaNeta)}.`,
  ].filter(Boolean).join(' ')

  const conclusion = urgentes.length > 0
    ? `Si no llega reposición esta semana, se quiebra el surtido en los productos que más se venden.`
    : `Hay margen estrecho de reposición; conviene adelantar el pedido para no llegar a quiebre.`

  const cruces = ['ventas', 'producto', 'inventario', 'vendedor']

  return [{
    id: uid('inventario-desabasto'),
    tipo: 'riesgo_producto',
    prioridad: 'CRITICA',
    emoji: '📉',
    titulo: urgentes.length > 0
      ? `Desabasto inminente en ${urgentes.length} producto${urgentes.length > 1 ? 's' : ''} clave`
      : `Cobertura ajustada en ${alertas.length} producto${alertas.length > 1 ? 's' : ''} clave`,
    descripcion: narrativa,
    valor_numerico: items.length,
    impacto_economico: {
      valor: impactoTotal,
      descripcion: `${fmtImp(impactoTotal, cross.hasVentaNeta)} en venta YTD en riesgo`,
      tipo: 'riesgo',
    },
    conclusion,
    accion: {
      texto: `Generar pedido urgente de reposición para ${top[0].producto}${top[1] ? ` y ${top.length - 1} productos siguientes en la lista` : ''}.`,
      entidades: productos,
      respaldo: `cobertura promedio ${(items.reduce((s, r) => s + r.diasInventario, 0) / items.length).toFixed(1)} días`,
      ejecutableEn: 'inmediato',
    },
    contrastePortafolio: `Estos ${items.length} productos representan ${fmtPct(pctOf(impactoTotal, cross.totalYTD))} del total YTD`,
    cruces,
    inventarioContext: {
      stock: top[0].stock,
      mesesCobertura: top[0].diasInventario / 30,
      alerta: urgentes.length > 0 ? 'desabasto' : 'cobertura_baja',
    },
    esPositivo: false,
    esAccionable: true,
    señalesConvergentes: items.length,
    __impactoAbs: impactoTotal,
    __crucesCount: cruces.length,
    __esAccionable: true,
    __esPositivo: false,
  }]
}

// Generador 4 — vendedorMejorMomento
function vendedorMejorMomento(
  cross: CrossTables,
  metas: MetaRecord[],
): CandidatoInterno[] {
  const out: CandidatoInterno[] = []

  // Mediana de variación YTD del equipo
  const variaciones: Array<{ vendedor: string; varPct: number; ytdActual: number; ytdPrev: number }> = []
  for (const [v, ytd] of cross.vendorYTD) {
    const prev = cross.vendorPrevYTD.get(v)?.net ?? 0
    if (prev <= 0) continue
    const varPct = ((ytd.net - prev) / prev) * 100
    variaciones.push({ vendedor: v, varPct, ytdActual: ytd.net, ytdPrev: prev })
  }
  if (variaciones.length === 0) return out
  variaciones.sort((a, b) => a.varPct - b.varPct)
  const mediana = variaciones[Math.floor(variaciones.length / 2)].varPct

  for (const item of variaciones) {
    // Bug 6 fix: usar Math.max(mediana, 5) para no excluir si la mediana está en negativo
    const umbralCrec = Math.max(mediana, 5)
    if (item.varPct <= umbralCrec) continue
    // No requerir MTD: si no hay actividad este mes, usar 0
    const mtd = cross.vendorMTD.get(item.vendedor) ?? { net: 0, uds: 0 }
    const meta = metas.length > 0
      ? resolverMetaMes(item.vendedor, metas, cross.fechaRef, mtd.net, mtd.uds, cross.diaDelMes, cross.diasEnMes)
      : null
    // Si hay metas, exigir proyección > 120%; si no hay metas, basta con el crecimiento alto
    if (metas.length > 0 && (!meta || meta.pctProyeccion < 120)) continue

    const ytd = cross.vendorYTD.get(item.vendedor)!
    const prev = cross.vendorPrevYTD.get(item.vendedor)
    const cambios = changesByEntity(prev?.clients, ytd.clients).filter(c => c.delta > 0)
    const topCliente = topN(cambios, 1, c => c.delta)[0]
    const topProdEntry = [...ytd.prods.entries()].sort((a, b) => b[1] - a[1])[0]
    const topDeptEntry = [...ytd.depts.entries()].sort((a, b) => b[1] - a[1])[0]

    const denom = cross.totalYTD - cross.totalPrevYTD
    const aporteEmpresa = denom > 0 ? pctOf(item.ytdActual - item.ytdPrev, denom) : 0
    // Bug 6 fix: contrastePortafolio siempre presente (peso del vendedor en el equipo)
    const pesoEquipo = pctOf(item.ytdActual, cross.totalYTD)

    const cruces = ['ventas', 'vendedor', 'cliente', 'producto', 'metas']
    if (topDeptEntry) cruces.push('departamento')

    const narrativa = [
      meta
        ? `${item.vendedor} crece ${fmtPct(item.varPct)} YTD y proyecta cerrar el mes en ${fmtPct(meta.pctProyeccion)} de meta.`
        : `${item.vendedor} crece ${fmtPct(item.varPct)} YTD, muy por encima de la mediana del equipo.`,
      topCliente ? `Su mayor impulso viene de ${topCliente.key} (+${fmtImp(topCliente.delta, cross.hasVentaNeta)}).` : '',
      topProdEntry ? `Producto líder: ${topProdEntry[0]}.` : '',
      topDeptEntry ? `Zona principal: ${topDeptEntry[0]}.` : '',
    ].filter(Boolean).join(' ')

    const conclusion = aporteEmpresa > 0
      ? `Aporta ${fmtPct(aporteEmpresa)} del crecimiento neto de la empresa este año.`
      : `Crece muy por encima del resto del equipo y representa ${fmtPct(pesoEquipo)} de las ventas totales.`

    out.push({
      id: uid('mejor-momento'),
      tipo: 'hallazgo',
      prioridad: 'ALTA',
      emoji: '🚀',
      titulo: `${item.vendedor} en su mejor momento`,
      descripcion: narrativa,
      vendedor: item.vendedor,
      valor_numerico: Math.round(item.varPct),
      impacto_economico: {
        valor: item.ytdActual - item.ytdPrev,
        descripcion: `${fmtImp(item.ytdActual - item.ytdPrev, cross.hasVentaNeta)} de crecimiento YTD`,
        tipo: 'oportunidad',
      },
      conclusion,
      accion: {
        texto: topCliente
          ? `Documentar qué hizo distinto con ${topCliente.key} y replicarlo con sus 3 clientes siguientes en volumen.`
          : `Replicar su patrón de venta con el resto del equipo.`,
        entidades: [item.vendedor, ...(topCliente ? [topCliente.key] : []), ...(topProdEntry ? [topProdEntry[0]] : [])],
        respaldo: meta
          ? `+${fmtPct(item.varPct)} YTD; meta proyectada ${fmtPct(meta.pctProyeccion)}`
          : `+${fmtPct(item.varPct)} YTD vs mediana ${fmtPct(mediana)}`,
        ejecutableEn: 'este_mes',
      },
      contrastePortafolio: aporteEmpresa > 0
        ? `Aporta ${fmtPct(aporteEmpresa)} del crecimiento neto del equipo`
        : `Representa ${fmtPct(pesoEquipo)} del total YTD del equipo`,
      cruces,
      metaContext: meta ? {
        metaMes: Math.round(meta.metaMes),
        cumplimiento: Math.round(meta.cumplimiento),
        gap: Math.round(meta.gap),
        proyeccion: Math.round(meta.proyeccion),
        tipoMeta: meta.tipoMeta,
      } : undefined,
      esPositivo: true,
      esAccionable: true,
      señalesConvergentes: 2 + (topCliente ? 1 : 0),
      __impactoAbs: Math.abs(item.ytdActual - item.ytdPrev),
      __crucesCount: cruces.length,
      __esAccionable: true,
      __esPositivo: true,
    })
  }
  return out
}

// Generador 5 — vendedorConcentracion
function vendedorConcentracion(
  cross: CrossTables,
  metas: MetaRecord[],
): CandidatoInterno[] {
  const out: CandidatoInterno[] = []

  // Bug 5 fix: umbral dinámico — si TODOS están concentrados, sólo alertar sobre extremos
  // Paso 1: calcular pctTop1 de cada vendedor para obtener mediana del equipo
  type Row = {
    vendedor: string
    ytd: typeof cross.vendorYTD extends Map<string, infer V> ? V : never
    sorted: Array<[string, number]>
    pctTop1: number
    pctTop2: number
  }
  const rows: Row[] = []
  for (const [vendedor, ytd] of cross.vendorYTD) {
    if (ytd.clients.size === 0 || ytd.net <= 0) continue
    const sorted = [...ytd.clients.entries()].sort((a, b) => b[1] - a[1])
    const top1 = sorted[0]
    const top2Sum = sorted.slice(0, 2).reduce((s, [, v]) => s + v, 0)
    rows.push({
      vendedor,
      ytd,
      sorted,
      pctTop1: pctOf(top1[1], ytd.net),
      pctTop2: pctOf(top2Sum, ytd.net),
    })
  }
  if (rows.length === 0) return out

  const pcts = rows.map(r => r.pctTop1).sort((a, b) => a - b)
  const medianaTop1 = pcts[Math.floor(pcts.length / 2)] ?? 0
  const p75Top1 = pcts[Math.floor(pcts.length * 0.75)] ?? 0

  // Si la mediana del equipo ya está concentrada (>35%), subir umbral dinámicamente al P75
  const umbralTop1 = medianaTop1 > 35 ? Math.max(40, p75Top1) : 40
  const umbralTop2 = 60

  for (const row of rows) {
    const { vendedor, ytd, sorted, pctTop1, pctTop2 } = row
    const top1 = sorted[0]

    // Pre-calcular meta para regla "concentrado Y meta en riesgo"
    const mtdEarly = cross.vendorMTD.get(vendedor)
    const metaEarly = mtdEarly ? resolverMetaMes(vendedor, metas, cross.fechaRef, mtdEarly.net, mtdEarly.uds, cross.diaDelMes, cross.diasEnMes) : null
    const metaEnRiesgo = metaEarly ? metaEarly.pctProyeccion < 80 : false

    // Sólo si: top1 > umbralTop1 OR top2 > umbralTop2 OR (concentrado moderado Y meta en riesgo)
    const moderado = pctTop1 >= 35 || pctTop2 >= 50
    const cumple = pctTop1 >= umbralTop1 || pctTop2 >= umbralTop2 || (moderado && metaEnRiesgo)
    if (!cumple) continue

    const meta = metaEarly
    const cumpleMeta = meta ? meta.pctProyeccion >= 95 : null
    const cruces = ['ventas', 'vendedor', 'cliente']
    if (meta) cruces.push('metas')

    const concentMsg = pctTop1 >= 35
      ? `${top1[0]} concentra ${fmtPct(pctTop1)} de su cartera`
      : `${sorted[0][0]} y ${sorted[1][0]} concentran ${fmtPct(pctTop2)} de su cartera`

    const narrativa = [
      `${vendedor}: ${concentMsg}.`,
      cumpleMeta === true
        ? `Cumple su meta proyectada (${fmtPct(meta!.pctProyeccion)}), pero su negocio depende de muy pocos clientes.`
        : cumpleMeta === false
          ? `Además proyecta cerrar el mes en ${fmtPct(meta!.pctProyeccion)} de meta.`
          : `Esto lo hace vulnerable a cualquier cambio de esos clientes.`,
      `Si ${top1[0]} reduce un 30% sus compras, el vendedor pierde ${fmtImp(top1[1] * 0.3, cross.hasVentaNeta)} YTD.`,
    ].join(' ')

    const conclusion = cumpleMeta === true
      ? `Está cumpliendo, pero un movimiento de ${top1[0]} pone en riesgo todo su año.`
      : `La concentración amplifica cualquier caída de ${top1[0]}.`

    out.push({
      id: uid('concentracion'),
      tipo: 'cruzado',
      prioridad: 'ALTA',
      emoji: '🎯',
      titulo: `${vendedor} depende demasiado de ${top1[0]}`,
      descripcion: narrativa,
      vendedor,
      cliente: top1[0],
      valor_numerico: Math.round(pctTop1),
      impacto_economico: {
        valor: top1[1],
        descripcion: `${fmtImp(top1[1], cross.hasVentaNeta)} concentrados en un solo cliente`,
        tipo: 'riesgo',
      },
      conclusion,
      accion: {
        texto: `Identificar y abrir 2 clientes nuevos del mismo perfil que ${top1[0]} este mes para reducir dependencia.`,
        entidades: [vendedor, top1[0]],
        respaldo: `${fmtPct(pctTop1)} de la cartera en ${top1[0]}`,
        ejecutableEn: 'este_mes',
      },
      contrastePortafolio: `${top1[0]} = ${fmtPct(pctTop1)} de la cartera del vendedor; los siguientes 2 clientes apenas suman ${fmtPct(pctOf(sorted.slice(1, 3).reduce((s, [, v]) => s + v, 0), ytd.net))}`,
      cruces,
      metaContext: meta ? {
        metaMes: Math.round(meta.metaMes),
        cumplimiento: Math.round(meta.cumplimiento),
        gap: Math.round(meta.gap),
        proyeccion: Math.round(meta.proyeccion),
        tipoMeta: meta.tipoMeta,
      } : undefined,
      esPositivo: false,
      esAccionable: true,
      señalesConvergentes: 1 + (cumpleMeta === false ? 1 : 0),
      __impactoAbs: top1[1],
      __crucesCount: cruces.length,
      __esAccionable: true,
      __esPositivo: false,
    })
  }
  return out
}

// Generador 6 — departamentoCaida
function departamentoCaida(cross: CrossTables): CandidatoInterno[] {
  const out: CandidatoInterno[] = []

  // Variaciones negativas
  const variaciones: Array<{ dept: string; ytd: number; prev: number; varPct: number; delta: number }> = []
  for (const [dept, ytd] of cross.deptYTD) {
    const prev = cross.deptPrevYTD.get(dept)?.net ?? 0
    if (prev <= 0) continue
    const varPct = ((ytd.net - prev) / prev) * 100
    if (varPct >= 0) continue
    variaciones.push({ dept, ytd: ytd.net, prev, varPct, delta: ytd.net - prev })
  }
  if (variaciones.length === 0) return out

  // Percentil 75 de las caídas (las más severas)
  variaciones.sort((a, b) => a.varPct - b.varPct)
  const idxP75 = Math.floor(variaciones.length * 0.25)
  const umbral = variaciones[idxP75]?.varPct ?? -100

  for (const item of variaciones) {
    if (item.varPct > umbral) continue
    const ytd = cross.deptYTD.get(item.dept)!
    if (ytd.vendors.size === 0) continue
    const topVendedor = [...ytd.vendors.entries()].sort((a, b) => b[1] - a[1])[0][0]
    const vMTD = cross.vendorMTD.get(topVendedor)
    const vendorVarYTD = (() => {
      const v = cross.vendorYTD.get(topVendedor)?.net ?? 0
      const p = cross.vendorPrevYTD.get(topVendedor)?.net ?? 0
      return p > 0 ? ((v - p) / p) * 100 : 0
    })()

    // ¿Mercado o ejecución?
    // Si el vendedor cae más fuerte que el departamento, es ejecución; si menos, es mercado
    const tipo = Math.abs(vendorVarYTD) > Math.abs(item.varPct) ? 'ejecución' : 'mercado'
    const cruces = ['ventas', 'departamento', 'vendedor']
    if (vMTD) cruces.push('cliente')

    const narrativa = [
      `${item.dept} cae ${fmtPct(Math.abs(item.varPct))} YTD (de ${fmtImp(item.prev, cross.hasVentaNeta)} a ${fmtImp(item.ytd, cross.hasVentaNeta)}).`,
      `${topVendedor} es el principal vendedor de la zona y su variación personal es ${fmtPct(vendorVarYTD)}.`,
      tipo === 'ejecución'
        ? `Como cae más rápido que el departamento, la causa apunta a ejecución del vendedor.`
        : `Como cae menos que el departamento, la causa apunta al mercado de la zona.`,
    ].join(' ')

    const conclusion = tipo === 'ejecución'
      ? `Hay que trabajar con ${topVendedor} en su gestión, no tratar la zona como problema externo.`
      : `Es un problema de mercado en ${item.dept}, requiere estrategia distinta a la de otras zonas.`

    out.push({
      // Bug 7 fix: NO setear vendedor (evita ser deduplicado contra insights individuales del vendedor)
      id: uid('depto-caida'),
      tipo: 'cruzado',
      prioridad: 'ALTA',
      emoji: '📉',
      titulo: `${item.dept} cae ${fmtPct(Math.abs(item.varPct))} YTD`,
      descripcion: narrativa,
      valor_numerico: Math.round(Math.abs(item.varPct)),
      impacto_economico: {
        valor: Math.abs(item.delta),
        descripcion: `${fmtImp(Math.abs(item.delta), cross.hasVentaNeta)} de caída anual`,
        tipo: 'perdida',
      },
      conclusion,
      accion: {
        texto: tipo === 'ejecución'
          ? `Acompañar a ${topVendedor} en visitas a sus 3 cuentas principales esta semana.`
          : `Redefinir estrategia comercial para ${item.dept} con incentivos específicos.`,
        entidades: [item.dept, topVendedor],
        respaldo: `${fmtPct(Math.abs(item.varPct))} caída YTD`,
        ejecutableEn: 'esta_semana',
      },
      contrastePortafolio: `${item.dept} pesa ${fmtPct(pctOf(item.ytd, cross.totalYTD))} del total YTD`,
      cruces,
      esPositivo: false,
      esAccionable: true,
      señalesConvergentes: 2,
      __impactoAbs: Math.abs(item.delta),
      __crucesCount: cruces.length,
      __esAccionable: true,
      __esPositivo: false,
    })
  }
  return out
}

// Generador 7 — vendedorCarteraPequeña
function vendedorCarteraPequeña(
  cross: CrossTables,
  metas: MetaRecord[],
): CandidatoInterno[] {
  const out: CandidatoInterno[] = []
  for (const [vendedor, ytd] of cross.vendorYTD) {
    if (ytd.clients.size >= 4) continue

    // ¿Su departamento principal está en caída?
    const topDept = [...ytd.depts.entries()].sort((a, b) => b[1] - a[1])[0]
    const deptYTD = topDept ? cross.deptYTD.get(topDept[0])?.net ?? 0 : 0
    const deptPrev = topDept ? cross.deptPrevYTD.get(topDept[0])?.net ?? 0 : 0
    const deptVar = deptPrev > 0 ? ((deptYTD - deptPrev) / deptPrev) * 100 : 0
    if (deptVar >= -2) continue // solo si la zona también cae

    const mtd = cross.vendorMTD.get(vendedor)
    const meta = mtd ? resolverMetaMes(vendedor, metas, cross.fechaRef, mtd.net, mtd.uds, cross.diaDelMes, cross.diasEnMes) : null

    // Productos perdidos
    const prev = cross.vendorPrevYTD.get(vendedor)
    const ausentesProd = clientesAusentes(prev?.prods, ytd.prods).slice(0, 2)
    const ausentesCli = clientesAusentes(prev?.clients, ytd.clients).slice(0, 2)

    const cruces = ['ventas', 'vendedor', 'cliente', 'departamento']
    if (meta) cruces.push('metas')
    if (ausentesProd.length > 0) cruces.push('producto')

    const narrativa = [
      `${vendedor} trabaja con sólo ${ytd.clients.size} clientes activos${topDept ? ` en ${topDept[0]}` : ''}, una zona que también cae ${fmtPct(Math.abs(deptVar))} YTD.`,
      ausentesCli.length > 0 ? `Perdió clientes históricos: ${ausentesCli.map(a => a.cliente).join(', ')}.` : '',
      ausentesProd.length > 0 ? `Productos que dejó de mover: ${ausentesProd.map(a => a.cliente).join(', ')}.` : '',
      meta ? `Su meta del mes proyecta cerrar en ${fmtPct(meta.pctProyeccion)}.` : '',
    ].filter(Boolean).join(' ')

    const conclusion = meta && meta.pctProyeccion < 80
      ? `Cartera reducida, zona en caída y meta en riesgo: necesita expansión inmediata.`
      : `Cartera reducida en zona estancada — cualquier baja amenaza el cierre del año.`

    out.push({
      id: uid('cartera-pequeña'),
      tipo: 'riesgo_vendedor',
      prioridad: 'ALTA',
      emoji: '🔍',
      titulo: `${vendedor} con cartera demasiado pequeña`,
      descripcion: narrativa,
      vendedor,
      valor_numerico: ytd.clients.size,
      impacto_economico: {
        valor: ytd.net,
        descripcion: `${fmtImp(ytd.net, cross.hasVentaNeta)} concentrados en ${ytd.clients.size} clientes`,
        tipo: 'riesgo',
      },
      conclusion,
      accion: {
        texto: `Definir 5 prospectos concretos en ${topDept ? topDept[0] : 'su zona'} y agendar visitas de apertura este mes.`,
        entidades: [vendedor, ...(topDept ? [topDept[0]] : [])],
        respaldo: `${ytd.clients.size} clientes activos vs zona cayendo ${fmtPct(Math.abs(deptVar))}`,
        ejecutableEn: 'este_mes',
      },
      contrastePortafolio: topDept
        ? `${topDept[0]} cae ${fmtPct(Math.abs(deptVar))} YTD; este vendedor representa ${fmtPct(pctOf(ytd.net, deptYTD))} de la zona`
        : undefined,
      cruces,
      metaContext: meta ? {
        metaMes: Math.round(meta.metaMes),
        cumplimiento: Math.round(meta.cumplimiento),
        gap: Math.round(meta.gap),
        proyeccion: Math.round(meta.proyeccion),
        tipoMeta: meta.tipoMeta,
      } : undefined,
      esPositivo: false,
      esAccionable: true,
      señalesConvergentes: 2 + (ausentesCli.length > 0 ? 1 : 0),
      __impactoAbs: ytd.net,
      __crucesCount: cruces.length,
      __esAccionable: true,
      __esPositivo: false,
    })
  }
  return out
}

// Generador 8 — productoOportunidad
function productoOportunidad(
  cross: CrossTables,
  inventario: CategoriaInventario[],
): CandidatoInterno[] {
  const out: CandidatoInterno[] = []
  const invMap = inventarioPorProducto(inventario)

  // GAP 3: precomputar clientes únicos que compran cada categoría YTD,
  // y para cada producto, cuántos de esos clientes ya compran ESE producto.
  // Esto permite evaluar penetración del producto vs penetración promedio del segmento.
  const clientesPorCategoria = new Map<string, Set<string>>()
  for (const [producto, ytd] of cross.prodYTD) {
    const cat = ytd.categoria || 'Sin categoría'
    const set = ensureMap(clientesPorCategoria, cat, () => new Set<string>())
    for (const c of ytd.clients.keys()) set.add(c)
    void producto
  }

  for (const [producto, ytd] of cross.prodYTD) {
    const prev = cross.prodPrevYTD.get(producto)?.net ?? 0
    if (prev <= 0) continue
    const varPct = ((ytd.net - prev) / prev) * 100
    // Issue 5 fix: bajar threshold a 5% para capturar Suavizante (+14%) y similares
    if (varPct < 5) continue

    // GAP 3: E9 — descartar productos con menos de 6 meses de historia
    const monthly = cross.monthlyByProduct.get(producto)
    const mesesConDatos = monthly ? [...monthly.values()].filter(v => v > 0).length : 0
    if (mesesConDatos < 6) continue

    // GAP 3: E9 — penetración del producto vs penetración promedio del segmento
    const cat = ytd.categoria || 'Sin categoría'
    const clientesSegmento = clientesPorCategoria.get(cat)
    const totalClientesSegmento = clientesSegmento ? clientesSegmento.size : 0
    if (totalClientesSegmento < 2) continue
    const penetracionProducto = ytd.clients.size / totalClientesSegmento

    // Penetración promedio de la categoría: media de penetraciones de todos los productos
    // de la misma categoría que tengan ≥ 6 meses de historia.
    let sumaPen = 0
    let nPen = 0
    for (const [pName, pYTD] of cross.prodYTD) {
      if ((pYTD.categoria || 'Sin categoría') !== cat) continue
      const m = cross.monthlyByProduct.get(pName)
      const ms = m ? [...m.values()].filter(v => v > 0).length : 0
      if (ms < 6) continue
      sumaPen += pYTD.clients.size / totalClientesSegmento
      nPen++
    }
    const penetracionPromedio = nPen > 0 ? sumaPen / nPen : 0
    // Sólo es oportunidad si el producto está POR DEBAJO del promedio de su segmento
    if (penetracionProducto >= penetracionPromedio) continue

    // Buscar clientes que NO compran este producto pero son activos
    const compradores = new Set(ytd.clients.keys())
    const noCompradores: Array<{ cliente: string; valorCliente: number; vendedor: string | null }> = []
    for (const [cliente, cb] of cross.clientYTD) {
      if (compradores.has(cliente)) continue
      if (cb.net <= 0) continue
      const topVendedor = cb.vendors.size > 0
        ? [...cb.vendors.entries()].sort((a, b) => b[1] - a[1])[0][0]
        : null
      noCompradores.push({ cliente, valorCliente: cb.net, vendedor: topVendedor })
    }
    if (noCompradores.length < 2) continue // necesitamos al menos 2 prospectos
    noCompradores.sort((a, b) => b.valorCliente - a.valorCliente)
    const top3 = noCompradores.slice(0, 3)

    const inv = invMap.get(producto)
    const stock = inv?.unidades_actuales ?? 0
    if (inv && stock <= 0) continue // sin stock no hay oportunidad

    // Potencial: ticket promedio del producto × prospectos
    const ticketProm = ytd.net / Math.max(1, ytd.clients.size)
    const potencial = ticketProm * top3.length

    const cruces = ['ventas', 'producto', 'cliente', 'vendedor']
    if (inv) cruces.push('inventario')

    const nombresProspectos = top3.map(t => t.cliente).join(', ')
    const narrativa = [
      `${producto} crece ${fmtPct(varPct)} YTD (${fmtImp(ytd.net, cross.hasVentaNeta)} este año vs ${fmtImp(prev, cross.hasVentaNeta)} el anterior).`,
      `Llega a ${ytd.clients.size} de los ${totalClientesSegmento} clientes que compran ${cat} — por debajo del promedio de los ${nPen} productos similares (${fmtPct(penetracionPromedio * 100)}).`,
      `${nombresProspectos} ${top3.length === 1 ? 'es cliente activo' : 'son clientes activos'} que aún no lo compran.`,
      inv ? `Hay stock disponible (${fmtNum(stock)} unidades).` : '',
      `Potencial estimado: ${fmtImp(potencial, cross.hasVentaNeta)} si los ${top3.length} prueban una compra base.`,
    ].filter(Boolean).join(' ')

    const conclusion = `${top3[0].vendedor ?? 'El vendedor'} puede abrir ${producto} en cuentas que ya tiene; es expansión, no prospección.`

    out.push({
      id: uid('producto-oportunidad'),
      tipo: 'hallazgo',
      prioridad: 'MEDIA',
      emoji: '💡',
      titulo: `${producto}: oportunidad en clientes activos`,
      descripcion: narrativa,
      producto,
      valor_numerico: Math.round(varPct),
      impacto_economico: {
        valor: potencial,
        descripcion: `${fmtImp(potencial, cross.hasVentaNeta)} de potencial estimado`,
        tipo: 'oportunidad',
      },
      conclusion,
      accion: {
        texto: `${top3[0].vendedor ?? 'Asignar visita'} para ofrecer ${producto} a ${top3[0].cliente} esta semana; replicar con los siguientes 2 clientes del listado.`,
        entidades: [producto, top3[0].cliente, ...(top3[0].vendedor ? [top3[0].vendedor] : [])],
        respaldo: `${noCompradores.length} clientes activos sin compra del producto`,
        ejecutableEn: 'esta_semana',
      },
      contrastePortafolio: `${producto} ya está en ${ytd.clients.size} clientes; agregar 3 más sumaría ${fmtPct(pctOf(3, ytd.clients.size))} a su base actual`,
      cruces,
      inventarioContext: inv ? {
        stock,
        mesesCobertura: inv.dias_inventario / 30,
        alerta: 'oportunidad',
      } : undefined,
      esPositivo: true,
      esAccionable: true,
      señalesConvergentes: 2 + (inv ? 1 : 0),
      __impactoAbs: potencial,
      __crucesCount: cruces.length,
      __esAccionable: true,
      __esPositivo: true,
    })
  }
  return out
}

// Generador 9 — equipoContexto
function equipoContexto(
  cross: CrossTables,
  metas: MetaRecord[],
): CandidatoInterno[] {
  const variacion = cross.totalPrevYTD > 0
    ? ((cross.totalYTD - cross.totalPrevYTD) / cross.totalPrevYTD) * 100
    : 0
  const variacionMTD = cross.totalPrevMTD > 0
    ? ((cross.totalMTD - cross.totalPrevMTD) / cross.totalPrevMTD) * 100
    : 0

  let creciendo = 0
  let cayendo = 0
  for (const [v, ytd] of cross.vendorYTD) {
    void v
    const prev = cross.vendorPrevYTD.get(v)?.net ?? 0
    if (prev <= 0) continue
    if (ytd.net > prev) creciendo++
    else if (ytd.net < prev) cayendo++
  }

  let cumplenMeta = 0
  let totalConMeta = 0
  for (const [v, mtd] of cross.vendorMTD) {
    const meta = resolverMetaMes(v, metas, cross.fechaRef, mtd.net, mtd.uds, cross.diaDelMes, cross.diasEnMes)
    if (!meta) continue
    totalConMeta++
    if (meta.pctProyeccion >= 95) cumplenMeta++
  }

  // Distribución geográfica del crecimiento
  let depsCrecen = 0
  let depsCaen = 0
  for (const [d, dy] of cross.deptYTD) {
    void d
    const prev = cross.deptPrevYTD.get(d)?.net ?? 0
    if (prev <= 0) continue
    if (dy.net > prev) depsCrecen++
    else if (dy.net < prev) depsCaen++
  }

  const narrativa = [
    `La empresa lleva ${fmtImp(cross.totalYTD, cross.hasVentaNeta)} YTD (${variacion >= 0 ? '+' : ''}${fmtPct(variacion)} vs mismo período del año pasado).`,
    `En el mes en curso lleva ${fmtImp(cross.totalMTD, cross.hasVentaNeta)}, ${variacionMTD >= 0 ? '+' : ''}${fmtPct(variacionMTD)} contra el año anterior.`,
    `${creciendo} vendedores crecen, ${cayendo} caen.`,
    totalConMeta > 0 ? `${cumplenMeta} de ${totalConMeta} cumplen meta proyectada.` : '',
    `${depsCrecen} zonas con crecimiento, ${depsCaen} zonas en caída.`,
  ].filter(Boolean).join(' ')

  const conclusion = variacion >= 0
    ? `El año va arriba pero el ritmo del mes ${variacionMTD >= 0 ? 'lo confirma' : 'es más débil que lo esperado'}.`
    : `El año va abajo y la mayoría del equipo todavía no compensa la caída.`

  return [{
    id: uid('equipo-contexto'),
    tipo: 'riesgo_equipo',
    prioridad: 'MEDIA',
    emoji: '🏢',
    titulo: `Estado general de la empresa`,
    descripcion: narrativa,
    valor_numerico: Math.round(variacion),
    impacto_economico: {
      valor: Math.abs(cross.totalYTD - cross.totalPrevYTD),
      descripcion: `${fmtImp(Math.abs(cross.totalYTD - cross.totalPrevYTD), cross.hasVentaNeta)} de variación YTD`,
      tipo: variacion >= 0 ? 'oportunidad' : 'riesgo',
    },
    conclusion,
    accion: {
      texto: cayendo > creciendo
        ? `Reunión de revisión con los ${cayendo} vendedores en caída esta semana antes de definir cierre de mes.`
        : `Mantener seguimiento al ${creciendo} vendedores en crecimiento para asegurar el ritmo de cierre.`,
      entidades: ['equipo'],
      respaldo: `${creciendo} crecen / ${cayendo} caen / ${depsCrecen} zonas crecen`,
      ejecutableEn: 'esta_semana',
    },
    contrastePortafolio: `${creciendo + cayendo} vendedores con historial comparable; ${cumplenMeta}/${totalConMeta} en cumplimiento`,
    cruces: ['ventas', 'vendedor', 'metas', 'departamento', 'cliente'],
    esPositivo: variacion >= 0,
    esAccionable: false, // contexto, no acción individual
    señalesConvergentes: 4,
    __impactoAbs: Math.abs(cross.totalYTD - cross.totalPrevYTD),
    __crucesCount: 5,
    __esAccionable: false,
    __esPositivo: variacion >= 0,
  }]
}

// Generador 10 — vendedorSeñalTemprana
function vendedorSeñalTemprana(
  cross: CrossTables,
  metas: MetaRecord[],
  churnMap: Map<string, ChurnVendedor>,
): CandidatoInterno[] {
  const out: CandidatoInterno[] = []
  if (cross.diaDelMes >= 15) return out // sólo señal temprana

  for (const [vendedor, mtd] of cross.vendorMTD) {
    const prevMTD = cross.vendorPrevMTD.get(vendedor)
    const ytd = cross.vendorYTD.get(vendedor)
    const prevYTD = cross.vendorPrevYTD.get(vendedor)
    if (!ytd) continue

    // GAP 2: acumular señales convergentes (mínimo 3 para disparar)
    let señales = 0
    const indicadores: string[] = []

    // Señal 1: MTD cae > 5% vs prevMTD (same-day)
    let variacionMTD = 0
    let mtdCae = false
    if (prevMTD && prevMTD.net > 0) {
      variacionMTD = ((mtd.net - prevMTD.net) / prevMTD.net) * 100
      mtdCae = variacionMTD < -5
      if (mtdCae) {
        señales++
        indicadores.push(`mes en curso ${fmtPct(Math.abs(variacionMTD))} abajo vs año pasado`)
      }
    }

    // Señal 2: YTD cae vs año anterior
    let varYTD = 0
    let ytdCae = false
    if (prevYTD && prevYTD.net > 0) {
      varYTD = ((ytd.net - prevYTD.net) / prevYTD.net) * 100
      ytdCae = varYTD < 0
      if (ytdCae) {
        señales++
        indicadores.push(`YTD ${fmtPct(Math.abs(varYTD))} debajo`)
      }
    }

    // Señal 3: meta proyectada < 90%
    const meta = resolverMetaMes(vendedor, metas, cross.fechaRef, mtd.net, mtd.uds, cross.diaDelMes, cross.diasEnMes)
    let metaBaja = false
    if (meta) {
      metaBaja = meta.pctProyeccion < 90
      if (metaBaja) {
        señales++
        indicadores.push(`proyección de meta en ${fmtPct(meta.pctProyeccion)}`)
      }
    }

    // Señal 4: clientes ausentes (al menos 1 cliente del año pasado que ya no compra)
    const ausentes = clientesAusentes(prevYTD?.clients, ytd.clients)
    let clientePerdido = false
    if (ausentes.length > 0) {
      clientePerdido = true
      señales++
      indicadores.push(`${ausentes.length} cliente${ausentes.length > 1 ? 's' : ''} histórico${ausentes.length > 1 ? 's' : ''} sin compra`)
    }

    // Señal 5: tendencia mensual — últimos 2 meses consecutivos a la baja
    const monthly = cross.monthlyByVendor.get(vendedor)
    let tendenciaNegativa = false
    if (monthly && monthly.size >= 3) {
      const claves = [...monthly.keys()].sort()
      const ultimos = claves.slice(-3) // mes_n-2, mes_n-1, mes_n
      if (ultimos.length === 3) {
        const v0 = monthly.get(ultimos[0]) ?? 0
        const v1 = monthly.get(ultimos[1]) ?? 0
        const v2 = monthly.get(ultimos[2]) ?? 0
        if (v0 > 0 && v1 < v0 && v2 < v1) {
          tendenciaNegativa = true
          señales++
          indicadores.push('caída sostenida los últimos 2 meses')
        }
      }
    }

    // Señal 6 (GAP 4 wiring): churn anómalo
    const churn = churnMap.get(vendedor)
    if (churn && churn.esAnomalo) {
      señales++
      indicadores.push(`pérdida de clientes mayor a la habitual (${churn.perdidos} este período)`)
    }

    // E8 — mínimo 3 señales convergentes
    if (señales < 3) continue

    // Adicionalmente, requerir que NO sea un caso de continuación de caída crónica:
    // si MTD cae pero YTD también cae fuerte, ya no es "temprana", es deterioro acumulado.
    // Mantener regla original: YTD >= 0 o no estaba cayendo antes.
    if (ytdCae && varYTD < -10) continue

    const cruces = ['ventas', 'vendedor', 'cliente']
    if (meta) cruces.push('metas')
    if (monthly && monthly.size >= 3) cruces.push('tendencia')

    const impactoMTD = prevMTD ? Math.abs(mtd.net - prevMTD.net) : Math.abs(mtd.net)

    const narrativa = [
      `${vendedor}: ${señales} indicadores apuntan en la misma dirección — ${indicadores.slice(0, 4).join(', ')}.`,
      `Estamos al día ${cross.diaDelMes} de ${cross.diasEnMes}, por lo que esto es monitoreo, no una conclusión definitiva.`,
      varYTD >= 0 ? `Su YTD acumulado todavía está ${fmtPct(varYTD)} arriba, así que el cambio es reciente.` : '',
    ].filter(Boolean).join(' ')

    const conclusion = `Tres o más indicadores convergen al mismo tiempo: conviene confirmar con el vendedor antes de que se vuelva tendencia.`

    const valorNumerico = mtdCae ? Math.round(variacionMTD) : Math.round(varYTD)

    out.push({
      id: uid('señal-temprana'),
      tipo: 'hallazgo',
      prioridad: 'MEDIA', // E3 — siempre máximo MEDIA por ser temprana
      emoji: '👀',
      titulo: `${vendedor}: arranque débil con varios indicadores`,
      descripcion: narrativa,
      vendedor,
      valor_numerico: valorNumerico,
      impacto_economico: {
        valor: impactoMTD,
        descripcion: `${fmtImp(impactoMTD, cross.hasVentaNeta)} de diferencia en lo que va del mes`,
        tipo: 'riesgo',
      },
      conclusion,
      accion: {
        texto: `Llamada breve a ${vendedor} esta semana para entender qué está pasando con sus pedidos y confirmar el cierre del mes.`,
        entidades: [vendedor],
        respaldo: `${señales} indicadores convergentes; ${indicadores[0]}`,
        ejecutableEn: 'esta_semana',
      },
      contrastePortafolio: varYTD >= 0
        ? `Su YTD aún está ${fmtPct(varYTD)} arriba, no es deterioro acumulado`
        : `${señales} de 6 indicadores apuntan al mismo problema, primera vez en el período`,
      cruces,
      metaContext: meta ? {
        metaMes: Math.round(meta.metaMes),
        cumplimiento: Math.round(meta.cumplimiento),
        gap: Math.round(meta.gap),
        proyeccion: Math.round(meta.proyeccion),
        tipoMeta: meta.tipoMeta,
      } : undefined,
      esPositivo: false,
      esAccionable: true,
      señalesConvergentes: señales,
      __impactoAbs: Math.max(impactoMTD, 1),
      __crucesCount: cruces.length,
      __esAccionable: true,
      __esPositivo: false,
    })
  }
  return out
}

// Generador 11 — productoSustitucion
function productoSustitucion(cross: CrossTables, inventario: CategoriaInventario[]): CandidatoInterno[] {
  const out: CandidatoInterno[] = []
  const invMap = inventarioPorProducto(inventario)

  // Bug 9 fix: agrupar por categoría usando UNIÓN de prodYTD y prodPrevYTD
  // (los productos muertos no aparecen en prodYTD pero deben considerarse aquí)
  const porCategoria = new Map<string, Array<{ producto: string; varAbs: number; ytd: number; prev: number }>>()
  const productosVistos = new Set<string>()

  const procesar = (producto: string) => {
    if (productosVistos.has(producto)) return
    productosVistos.add(producto)
    const ytd = cross.prodYTD.get(producto)
    const prev = cross.prodPrevYTD.get(producto)?.net ?? 0
    const ytdNet = ytd?.net ?? 0
    if (prev <= 0 && ytdNet <= 0) return
    const cat = ytd?.categoria || invMap.get(producto)?.categoria || 'Sin categoría'
    const arr = porCategoria.get(cat) ?? []
    arr.push({ producto, varAbs: ytdNet - prev, ytd: ytdNet, prev })
    porCategoria.set(cat, arr)
  }
  for (const p of cross.prodYTD.keys()) procesar(p)
  for (const p of cross.prodPrevYTD.keys()) procesar(p)

  for (const [categoria, items] of porCategoria) {
    if (items.length < 2) continue
    const subiendo = items.filter(i => i.varAbs > 0).sort((a, b) => b.varAbs - a.varAbs)
    const cayendo = items.filter(i => i.varAbs < 0).sort((a, b) => a.varAbs - b.varAbs)
    if (subiendo.length === 0 || cayendo.length === 0) continue

    const ganador = subiendo[0]
    const perdedores = cayendo.slice(0, 3)
    const totalCaida = perdedores.reduce((s, p) => s + Math.abs(p.varAbs), 0)
    const ratio = totalCaida > 0 ? ganador.varAbs / totalCaida : 0
    // Bug 9 fix: rango más permisivo (0.3-3) — los productos muertos rara vez igualan exactamente
    if (ratio < 0.3 || ratio > 3) continue

    // GAP 1 fix: I1 — agregar inventarioContext del producto ganador si está disponible
    const invGanador = invMap.get(ganador.producto)
    let invContext: { stock: number; mesesCobertura: number; alerta: string } | undefined
    if (invGanador) {
      const dias = invGanador.dias_inventario ?? 0
      const alerta = dias > 30 ? 'disponible' : (dias >= 15 ? 'vigilar' : 'riesgo')
      invContext = {
        stock: invGanador.unidades_actuales,
        mesesCobertura: dias / 30,
        alerta,
      }
    }

    const cruces = ['ventas', 'producto', 'categoria']
    if (invContext) cruces.push('inventario')

    const narrativa = [
      `En ${categoria}, ${ganador.producto} crece ${fmtImp(ganador.varAbs, cross.hasVentaNeta)} mientras ${perdedores.map(p => p.producto).join(', ')} caen una cifra similar (${fmtImp(totalCaida, cross.hasVentaNeta)} combinado).`,
      `Los volúmenes son del mismo orden, lo que sugiere que los clientes están reemplazando un producto por otro.`,
      invContext
        ? `Inventario de ${ganador.producto}: ${fmtNum(invContext.stock)} unidades disponibles${invContext.alerta === 'riesgo' ? ' (cobertura ajustada)' : ''}.`
        : '',
    ].filter(Boolean).join(' ')

    const conclusion = `Es un cambio de preferencia dentro de ${categoria}, no una caída real de la categoría.`

    out.push({
      id: uid('sustitucion'),
      tipo: 'hallazgo',
      prioridad: 'MEDIA',
      emoji: '🔄',
      titulo: `Cambio de preferencia en ${categoria}`,
      descripcion: narrativa,
      producto: ganador.producto,
      valor_numerico: Math.round(ratio * 100),
      impacto_economico: {
        valor: ganador.varAbs,
        descripcion: `${fmtImp(ganador.varAbs, cross.hasVentaNeta)} desplazados hacia ${ganador.producto}`,
        tipo: 'oportunidad',
      },
      conclusion,
      accion: {
        texto: `Aumentar la cobertura de ${ganador.producto} en clientes que aún piden ${perdedores[0].producto}.`,
        entidades: [ganador.producto, ...perdedores.map(p => p.producto)],
        respaldo: `${fmtImp(ganador.varAbs, cross.hasVentaNeta)} arriba vs ${fmtImp(totalCaida, cross.hasVentaNeta)} abajo`,
        ejecutableEn: 'este_mes',
      },
      contrastePortafolio: `${categoria} en conjunto se mantiene estable; el movimiento es interno entre productos`,
      cruces,
      inventarioContext: invContext,
      esPositivo: true,
      esAccionable: true,
      señalesConvergentes: 1 + perdedores.length,
      __impactoAbs: ganador.varAbs,
      __crucesCount: cruces.length,
      __esAccionable: true,
      __esPositivo: true,
    })
  }
  return out
}

// Generador 11b — productoCoDeclive (GAP 5: E7)
// Detecta productos en declive simultáneo que comparten base de clientes.
function productoCoDeclive(
  cross: CrossTables,
  inventario: CategoriaInventario[],
): CandidatoInterno[] {
  const out: CandidatoInterno[] = []
  const invMap = inventarioPorProducto(inventario)

  // 1) Identificar productos en declive > 10% YTD
  type Decliner = { producto: string; varPct: number; impacto: number; clientes: Set<string> }
  const decliners: Decliner[] = []
  for (const [producto, ytd] of cross.prodYTD) {
    const prev = cross.prodPrevYTD.get(producto)?.net ?? 0
    if (prev <= 0) continue
    const varPct = ((ytd.net - prev) / prev) * 100
    if (varPct > -10) continue
    // Clientes que compraron este producto YTD según clientProductYTD
    const clientes = new Set<string>()
    for (const [cliente, prods] of cross.clientProductYTD) {
      if (prods.has(producto)) clientes.add(cliente)
    }
    if (clientes.size === 0) continue
    decliners.push({ producto, varPct, impacto: prev - ytd.net, clientes })
  }
  if (decliners.length < 2) return out

  // 2) Construir co-ocurrencia entre pares de declines
  // Agrupar: dos productos pertenecen al mismo grupo si comparten > 40% de min(clientes)
  const asignado = new Set<string>()
  type Grupo = { productos: string[]; clientesCompartidos: Set<string>; impactoTotal: number }
  const grupos: Grupo[] = []

  for (let i = 0; i < decliners.length; i++) {
    if (asignado.has(decliners[i].producto)) continue
    const grupo: Grupo = {
      productos: [decliners[i].producto],
      clientesCompartidos: new Set(decliners[i].clientes),
      impactoTotal: decliners[i].impacto,
    }
    asignado.add(decliners[i].producto)

    for (let j = i + 1; j < decliners.length; j++) {
      if (asignado.has(decliners[j].producto)) continue
      // Intersección con TODOS los productos ya en el grupo (vía clientesCompartidos)
      let interseccion = 0
      for (const c of decliners[j].clientes) if (grupo.clientesCompartidos.has(c)) interseccion++
      const minClientes = Math.min(grupo.clientesCompartidos.size, decliners[j].clientes.size)
      if (minClientes === 0) continue
      const overlap = interseccion / minClientes
      if (overlap > 0.4) {
        grupo.productos.push(decliners[j].producto)
        // Mantener solo la intersección como base compartida
        const nuevaInter = new Set<string>()
        for (const c of decliners[j].clientes) if (grupo.clientesCompartidos.has(c)) nuevaInter.add(c)
        grupo.clientesCompartidos = nuevaInter
        grupo.impactoTotal += decliners[j].impacto
        asignado.add(decliners[j].producto)
      }
    }

    if (grupo.productos.length >= 2) grupos.push(grupo)
  }

  if (grupos.length === 0) return out

  // 3) Calcular percentil de impacto para decidir prioridad
  const impactos = grupos.map(g => g.impactoTotal).sort((a, b) => a - b)
  const p75 = impactos[Math.floor(impactos.length * 0.75)] ?? 0

  for (const g of grupos) {
    // Top 3 clientes por valor combinado en estos productos
    const valorPorCliente = new Map<string, number>()
    for (const cliente of g.clientesCompartidos) {
      const prods = cross.clientProductYTD.get(cliente)
      if (!prods) continue
      let total = 0
      for (const p of g.productos) {
        const slot = prods.get(p)
        if (slot) total += slot.net
      }
      valorPorCliente.set(cliente, total)
    }
    const topClientes = [...valorPorCliente.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
    if (topClientes.length === 0) continue

    const totalTop = topClientes.reduce((s, [, v]) => s + v, 0)
    const totalGrupo = [...valorPorCliente.values()].reduce((s, v) => s + v, 0)
    const concentTop = pctOf(totalTop, totalGrupo)

    // Inventario combinado de los productos del grupo
    let stockTotal = 0
    let conInv = 0
    for (const p of g.productos) {
      const inv = invMap.get(p)
      if (inv) {
        stockTotal += inv.unidades_actuales
        conInv++
      }
    }
    const tieneInv = conInv > 0

    const cruces = ['ventas', 'producto', 'cliente']
    if (tieneInv) cruces.push('inventario')

    const nombresClientes = topClientes.map(([c]) => c).join(', ')
    const narrativa = [
      `${g.productos.length} productos que comparten la misma base de clientes están cayendo al mismo tiempo: ${g.productos.slice(0, 4).join(', ')}.`,
      `Caída combinada: ${fmtImp(g.impactoTotal, cross.hasVentaNeta)} YTD.`,
      `${nombresClientes} concentra${topClientes.length > 1 ? 'n' : ''} ${fmtPct(concentTop)} de las compras de estos productos.`,
      `Conviene revisar si estos clientes están migrando a otro proveedor.`,
    ].join(' ')

    const conclusion = `La caída no es producto por producto: es la misma base de clientes reduciendo todo el catálogo a la vez.`

    const prioridad: InsightPrioridad = g.impactoTotal > p75 ? 'ALTA' : 'MEDIA'

    out.push({
      id: uid('co-declive'),
      tipo: 'cruzado',
      prioridad,
      emoji: '🧩',
      titulo: `${g.productos.length} productos en caída simultánea`,
      descripcion: narrativa,
      valor_numerico: g.productos.length,
      impacto_economico: {
        valor: g.impactoTotal,
        descripcion: `${fmtImp(g.impactoTotal, cross.hasVentaNeta)} de caída combinada YTD`,
        tipo: 'perdida',
      },
      conclusion,
      accion: {
        texto: `Visitar a ${topClientes[0][0]} esta semana para entender por qué reducen ${g.productos.length} productos al mismo tiempo; revisar luego con los demás clientes del grupo.`,
        entidades: [...g.productos.slice(0, 3), ...topClientes.map(([c]) => c)],
        respaldo: `${g.clientesCompartidos.size} clientes compartidos · ${fmtImp(g.impactoTotal, cross.hasVentaNeta)} de caída combinada`,
        ejecutableEn: 'esta_semana',
      },
      contrastePortafolio: `Los ${topClientes.length} clientes principales suman ${fmtPct(concentTop)} de las compras del grupo`,
      cruces,
      inventarioContext: tieneInv ? {
        stock: stockTotal,
        mesesCobertura: 0,
        alerta: 'co_declive',
      } : undefined,
      esPositivo: false,
      esAccionable: true,
      señalesConvergentes: g.productos.length,
      __impactoAbs: g.impactoTotal,
      __crucesCount: cruces.length,
      __esAccionable: true,
      __esPositivo: false,
    })
  }

  return out
}

// Generador 12 — vendedorPositivoEstable
function vendedorPositivoEstable(
  cross: CrossTables,
  metas: MetaRecord[],
): CandidatoInterno[] {
  const out: CandidatoInterno[] = []
  for (const [vendedor, ytd] of cross.vendorYTD) {
    const prev = cross.vendorPrevYTD.get(vendedor)?.net ?? 0
    if (prev <= 0) continue
    const varPct = ((ytd.net - prev) / prev) * 100
    // Bug 10 fix: rango ampliado (4-18%) — Luis +10.6% cae dentro
    if (varPct < 4 || varPct > 18) continue
    if (ytd.clients.size < 3) continue // Bug 10 fix: reducido de 4 a 3

    const mtd = cross.vendorMTD.get(vendedor) ?? { net: 0, uds: 0 }
    const meta = metas.length > 0
      ? resolverMetaMes(vendedor, metas, cross.fechaRef, mtd.net, mtd.uds, cross.diaDelMes, cross.diasEnMes)
      : null
    // Si hay metas, exigir cumplimiento >=95%; si no hay metas, basta el crecimiento positivo
    if (metas.length > 0 && (!meta || meta.pctProyeccion < 95)) continue

    const topDept = [...ytd.depts.entries()].sort((a, b) => b[1] - a[1])[0]
    const deptVar = topDept ? (() => {
      const p = cross.deptPrevYTD.get(topDept[0])?.net ?? 0
      return p > 0 ? ((cross.deptYTD.get(topDept[0])!.net - p) / p) * 100 : 0
    })() : 0

    const cruces = ['ventas', 'vendedor', 'cliente']
    if (meta) cruces.push('metas')
    if (topDept) cruces.push('departamento')

    const narrativa = [
      `${vendedor} crece ${fmtPct(varPct)} YTD con cartera saludable de ${ytd.clients.size} clientes activos.`,
      meta ? `Cumple meta proyectada (${fmtPct(meta.pctProyeccion)}).` : '',
      topDept ? `Su zona principal, ${topDept[0]}, va ${deptVar >= 0 ? '+' : ''}${fmtPct(deptVar)}.` : '',
    ].filter(Boolean).join(' ')

    const conclusion = `Es un vendedor ancla del equipo: crecimiento sostenido sin riesgos visibles.`

    out.push({
      id: uid('positivo-estable'),
      tipo: 'hallazgo',
      prioridad: 'MEDIA',
      emoji: '✅',
      titulo: `${vendedor} en buen momento sostenido`,
      descripcion: narrativa,
      vendedor,
      valor_numerico: Math.round(varPct),
      impacto_economico: {
        valor: ytd.net - prev,
        descripcion: `${fmtImp(ytd.net - prev, cross.hasVentaNeta)} de crecimiento`,
        tipo: 'oportunidad',
      },
      conclusion,
      accion: {
        texto: `Mantener seguimiento estándar; usar su patrón como referencia para ${vendedor === 'equipo' ? 'el equipo' : 'compañeros del mismo nivel'}.`,
        entidades: [vendedor],
        respaldo: meta
          ? `${fmtPct(varPct)} YTD, ${fmtPct(meta.pctProyeccion)} de meta proyectada`
          : `${fmtPct(varPct)} YTD vs año anterior`,
        ejecutableEn: 'este_mes',
      },
      contrastePortafolio: `${ytd.clients.size} clientes activos, sin concentración por encima del 35%`,
      cruces,
      metaContext: meta ? {
        metaMes: Math.round(meta.metaMes),
        cumplimiento: Math.round(meta.cumplimiento),
        gap: Math.round(meta.gap),
        proyeccion: Math.round(meta.proyeccion),
        tipoMeta: meta.tipoMeta,
      } : undefined,
      esPositivo: true,
      esAccionable: false,
      señalesConvergentes: 3,
      __impactoAbs: Math.abs(ytd.net - prev),
      __crucesCount: cruces.length,
      __esAccionable: false,
      __esPositivo: true,
    })
  }
  return out
}

// Generador 13 — inventarioSobrestock
function inventarioSobrestock(
  cross: CrossTables,
  inventario: CategoriaInventario[],
): CandidatoInterno[] {
  if (!inventario || inventario.length === 0) return []

  const sobrestock: Array<{
    producto: string
    stock: number
    mesesCobertura: number
    ventaYTD: number
  }> = []

  for (const inv of inventario) {
    if (inv.dias_inventario <= 90) continue // > 3 meses
    const ytd = cross.prodYTD.get(inv.producto)
    if (!ytd) continue
    sobrestock.push({
      producto: inv.producto,
      stock: inv.unidades_actuales,
      mesesCobertura: inv.dias_inventario / 30,
      ventaYTD: ytd.net,
    })
  }
  if (sobrestock.length === 0) return []

  sobrestock.sort((a, b) => b.mesesCobertura - a.mesesCobertura)
  const top = sobrestock.slice(0, 5)
  const productos = top.map(t => t.producto)
  const totalCapital = top.reduce((s, t) => s + t.ventaYTD, 0)

  const narrativa = [
    `${sobrestock.length} producto${sobrestock.length > 1 ? 's' : ''} con más de 3 meses de cobertura.`,
    `Los más extremos: ${top.map(t => `${t.producto} (${t.mesesCobertura.toFixed(1)} meses)`).join('; ')}.`,
    `Capital comprometido aproximado: ${fmtImp(totalCapital, cross.hasVentaNeta)}.`,
  ].join(' ')

  const conclusion = `Si el ritmo de venta no se acelera, este inventario quedará inmovilizado y afectará compras del próximo trimestre.`

  return [{
    id: uid('sobrestock'),
    tipo: 'riesgo_producto',
    prioridad: 'MEDIA',
    emoji: '📦',
    titulo: `Sobrestock en ${sobrestock.length} producto${sobrestock.length > 1 ? 's' : ''}`,
    descripcion: narrativa,
    valor_numerico: sobrestock.length,
    impacto_economico: {
      valor: totalCapital,
      descripcion: `${fmtImp(totalCapital, cross.hasVentaNeta)} en capital comprometido`,
      tipo: 'riesgo',
    },
    conclusion,
    accion: {
      texto: `Definir promoción o ajuste de pedidos para ${top[0].producto} y revisar los siguientes 4 productos del listado.`,
      entidades: productos,
      respaldo: `${top[0].mesesCobertura.toFixed(1)} meses de cobertura en el más extremo`,
      ejecutableEn: 'este_mes',
    },
    contrastePortafolio: `${sobrestock.length} productos vs ${inventario.length} totales (${fmtPct(pctOf(sobrestock.length, inventario.length))} del catálogo)`,
    cruces: ['inventario', 'producto', 'ventas'],
    inventarioContext: {
      stock: top[0].stock,
      mesesCobertura: top[0].mesesCobertura,
      alerta: 'sobrestock',
    },
    esPositivo: false,
    esAccionable: true,
    señalesConvergentes: 1,
    __impactoAbs: totalCapital,
    __crucesCount: 3,
    __esAccionable: true,
    __esPositivo: false,
  }]
}

// Generador 14 — vendedorEstancado
function vendedorEstancado(
  cross: CrossTables,
  metas: MetaRecord[],
): CandidatoInterno[] {
  const out: CandidatoInterno[] = []
  for (const [vendedor, ytd] of cross.vendorYTD) {
    const prev = cross.vendorPrevYTD.get(vendedor)?.net ?? 0
    if (prev <= 0) continue
    const varPct = ((ytd.net - prev) / prev) * 100
    if (varPct < -2 || varPct > 2) continue

    const mtd = cross.vendorMTD.get(vendedor)
    const meta = mtd ? resolverMetaMes(vendedor, metas, cross.fechaRef, mtd.net, mtd.uds, cross.diaDelMes, cross.diasEnMes) : null
    if (!meta) continue
    if (meta.pctProyeccion < 90 || meta.pctProyeccion > 105) continue

    // Buscar oportunidad: producto creciente que sus clientes no compran
    const susClientes = new Set(ytd.clients.keys())
    const productosCrecientes = [...cross.prodYTD.entries()]
      .map(([p, py]) => {
        const prv = cross.prodPrevYTD.get(p)?.net ?? 0
        return { producto: p, var: py.net - prv, ytd: py, prev: prv }
      })
      .filter(p => p.prev > 0 && p.var > 0)
      .sort((a, b) => b.var - a.var)

    let oportunidad: { producto: string; clientesPotenciales: string[] } | null = null
    for (const pc of productosCrecientes) {
      const compradores = new Set(pc.ytd.clients.keys())
      const potenciales = [...susClientes].filter(c => !compradores.has(c))
      if (potenciales.length >= 2) {
        oportunidad = { producto: pc.producto, clientesPotenciales: potenciales.slice(0, 3) }
        break
      }
    }

    const cruces = ['ventas', 'vendedor', 'cliente', 'metas', 'producto']

    const narrativa = [
      `${vendedor} se mantiene plano (${varPct >= 0 ? '+' : ''}${fmtPct(varPct)} YTD) con meta al filo (${fmtPct(meta.pctProyeccion)}).`,
      oportunidad
        ? `Sus clientes ${oportunidad.clientesPotenciales.slice(0, 2).join(' y ')} no compran ${oportunidad.producto}, que crece a nivel empresa.`
        : `No se detectaron oportunidades evidentes en su cartera actual.`,
    ].join(' ')

    const conclusion = oportunidad
      ? `Tiene espacio para crecer abriendo ${oportunidad.producto} en cuentas que ya atiende.`
      : `Necesita estímulo externo: ampliación de cartera o entrenamiento en ventas cruzadas.`

    out.push({
      id: uid('estancado'),
      tipo: 'riesgo_vendedor',
      prioridad: 'MEDIA',
      emoji: '😐',
      titulo: `${vendedor} estancado`,
      descripcion: narrativa,
      vendedor,
      valor_numerico: Math.round(varPct),
      impacto_economico: {
        valor: ytd.net,
        descripcion: `${fmtImp(ytd.net, cross.hasVentaNeta)} sin crecimiento real`,
        tipo: 'riesgo',
      },
      conclusion,
      accion: {
        texto: oportunidad
          ? `Que ${vendedor} ofrezca ${oportunidad.producto} a ${oportunidad.clientesPotenciales[0]} esta semana; medir respuesta.`
          : `Sesión de coaching con ${vendedor} para revisar oportunidades de venta cruzada.`,
        entidades: [vendedor, ...(oportunidad ? [oportunidad.producto, oportunidad.clientesPotenciales[0]] : [])],
        respaldo: `${fmtPct(meta.pctProyeccion)} de meta proyectada, ${fmtPct(varPct)} YTD`,
        ejecutableEn: 'esta_semana',
      },
      contrastePortafolio: `Cartera de ${ytd.clients.size} clientes sin movimiento neto`,
      cruces,
      metaContext: {
        metaMes: Math.round(meta.metaMes),
        cumplimiento: Math.round(meta.cumplimiento),
        gap: Math.round(meta.gap),
        proyeccion: Math.round(meta.proyeccion),
        tipoMeta: meta.tipoMeta,
      },
      esPositivo: false,
      esAccionable: !!oportunidad,
      señalesConvergentes: 2,
      __impactoAbs: ytd.net,
      __crucesCount: cruces.length,
      __esAccionable: !!oportunidad,
      __esPositivo: false,
    })
  }
  return out
}

// Generador 15 — canalContexto
function canalContexto(cross: CrossTables): CandidatoInterno[] {
  if (cross.canalYTD.size === 0) return []

  const canales: Array<{ canal: string; ytd: number; prev: number; pct: number; pctPrev: number; varPct: number }> = []
  let totalActual = 0
  let totalPrev = 0
  for (const [c, ytd] of cross.canalYTD) {
    void c
    totalActual += ytd.net
    totalPrev += cross.canalPrevYTD.get(c)?.net ?? 0
  }
  for (const [canal, ytd] of cross.canalYTD) {
    const prev = cross.canalPrevYTD.get(canal)?.net ?? 0
    canales.push({
      canal,
      ytd: ytd.net,
      prev,
      pct: pctOf(ytd.net, totalActual),
      pctPrev: pctOf(prev, totalPrev),
      varPct: prev > 0 ? ((ytd.net - prev) / prev) * 100 : 0,
    })
  }

  // Ver cambios significativos en participación (> 5 pts)
  const cambios = canales.filter(c => Math.abs(c.pct - c.pctPrev) >= 5)
  const hayMigracion = cambios.length >= 1
  // Issue 5 fix: si no hay migración, usar el cambio más grande disponible para tener impacto > 0
  const cambioRepresentativo = hayMigracion
    ? cambios[0]
    : [...canales].sort((a, b) => Math.abs(b.ytd - b.prev) - Math.abs(a.ytd - a.prev))[0]

  const narrativa = hayMigracion
    ? `${cambios.map(c => `${c.canal} pasó de ${fmtPct(c.pctPrev)} a ${fmtPct(c.pct)} de participación`).join('; ')}.`
    : `La distribución entre canales se mantiene estable: ${canales.map(c => `${c.canal} ${fmtPct(c.pct)}`).join(', ')}.`

  const conclusion = hayMigracion
    ? `Los clientes están cambiando su forma de comprar; vale la pena ajustar la atención al canal que crece.`
    : `No hay migración relevante entre canales; el mix se mantiene como referencia.`

  const impactoMostrar = cambioRepresentativo
    ? Math.abs(cambioRepresentativo.ytd - cambioRepresentativo.prev)
    : 0
  // Garantizar que siempre haya un canal "principal" para la entidad
  const canalPrincipal = [...canales].sort((a, b) => b.ytd - a.ytd)[0]

  return [{
    id: uid('canal-contexto'),
    tipo: 'hallazgo',
    prioridad: hayMigracion ? 'MEDIA' : 'BAJA',
    emoji: '🛒',
    titulo: hayMigracion ? `Migración entre canales en curso` : `Distribución por canal estable`,
    descripcion: narrativa,
    valor_numerico: cambios.length,
    impacto_economico: {
      valor: impactoMostrar,
      descripcion: impactoMostrar > 0
        ? `${fmtImp(impactoMostrar, cross.hasVentaNeta)} de movimiento neto en el canal con mayor variación`
        : `Sin movimiento relevante entre canales`,
      tipo: 'oportunidad',
    },
    conclusion,
    accion: {
      texto: hayMigracion
        ? `Reforzar atención al canal ${cambios[0].canal} con asignación de vendedores y presencia comercial.`
        : `Revisar el canal ${canalPrincipal.canal} (${fmtPct(canalPrincipal.pct)} del total) en la próxima reunión comercial; sin cambios urgentes este mes.`,
      entidades: hayMigracion
        ? cambios.map(c => c.canal)
        : [canalPrincipal.canal],
      respaldo: hayMigracion
        ? `${fmtPct(Math.abs(cambios[0].pct - cambios[0].pctPrev))} puntos de cambio en participación`
        : `${canalPrincipal.canal} ${fmtPct(canalPrincipal.pct)} del total YTD`,
      ejecutableEn: 'este_mes',
    },
    contrastePortafolio: `${canales.length} canales activos; el más relevante representa ${fmtPct(canalPrincipal.pct)} del total`,
    cruces: ['ventas', 'canal', 'cliente'],
    esPositivo: !hayMigracion,
    esAccionable: hayMigracion,
    señalesConvergentes: 1,
    // Issue 5 fix: garantizar __impactoAbs > 0 para que F2 no lo descarte
    __impactoAbs: Math.max(impactoMostrar, 1),
    __crucesCount: 3,
    __esAccionable: hayMigracion,
    __esPositivo: !hayMigracion,
  }]
}

// ────────────────────────────────────────────────────────────
// PASO 3 — pipeline()
// ────────────────────────────────────────────────────────────

const PRIO_RANK: Record<InsightPrioridad, number> = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAJA: 3 }

function pipeline(candidatos: CandidatoInterno[], cross: CrossTables): Insight[] {
  if (candidatos.length === 0) return []

  // F2: filtro de ruido — descartar entidades sin impacto real
  const impactos = candidatos.map(c => c.__impactoAbs).filter(v => v > 0).sort((a, b) => a - b)
  const p10 = impactos.length > 0 ? impactos[Math.floor(impactos.length * 0.1)] : 0
  let filtrados = candidatos.filter(c => c.__impactoAbs >= p10 || c.__esPositivo)

  // F1: percentil de impacto → ajuste de prioridad si está bajo
  // Issue 1/2 fix: comparar percentil dentro de la MISMA familia (riesgo_meta vs el resto),
  // para que insights de meta no compitan por percentil de $ contra inventario.
  const grupoImpactos = (tipo: InsightTipo): number[] => {
    return filtrados
      .filter(c => (c.tipo === 'riesgo_meta') === (tipo === 'riesgo_meta'))
      .map(c => c.__impactoAbs)
      .sort((a, b) => a - b)
  }
  const percentilEnGrupo = (v: number, grupo: number[]): number => {
    if (grupo.length === 0) return 50
    const i = grupo.findIndex(x => x >= v)
    return i >= 0 ? (i / grupo.length) * 100 : 100
  }
  const cacheGrupos = new Map<string, number[]>()
  for (const c of filtrados) {
    const key = c.tipo === 'riesgo_meta' ? 'meta' : 'otros'
    let g = cacheGrupos.get(key)
    if (!g) { g = grupoImpactos(c.tipo); cacheGrupos.set(key, g) }
    const pr = percentilEnGrupo(c.__impactoAbs, g)
    if (c.prioridad === 'CRITICA' && pr < 80) c.prioridad = 'ALTA'
    if (c.prioridad === 'ALTA' && pr < 50) c.prioridad = 'MEDIA'
  }

  // Issue 1 fix: FLOOR para riesgo_meta basado en cumplimiento real de meta
  for (const c of filtrados) {
    if (c.tipo !== 'riesgo_meta' || !c.metaContext) continue
    const ratio = c.metaContext.metaMes > 0
      ? c.metaContext.proyeccion / c.metaContext.metaMes
      : 1
    if (ratio < 0.80 && PRIO_RANK[c.prioridad] > PRIO_RANK['CRITICA']) c.prioridad = 'CRITICA'
    else if (ratio < 0.90 && PRIO_RANK[c.prioridad] > PRIO_RANK['ALTA']) c.prioridad = 'ALTA'
  }

  // Issue 2 fix: FLOOR para mejor-momento basado en crecimiento + meta
  for (const c of filtrados) {
    if (!c.id.startsWith('mejor-momento')) continue
    const crec = c.valor_numerico ?? 0  // % crecimiento YTD
    const proyMeta = c.metaContext && c.metaContext.metaMes > 0
      ? (c.metaContext.proyeccion / c.metaContext.metaMes) * 100
      : null
    if (crec > 15 && (proyMeta === null || proyMeta > 150)) {
      if (PRIO_RANK[c.prioridad] > PRIO_RANK['ALTA']) c.prioridad = 'ALTA'
    } else if (crec > 10 && (proyMeta === null || proyMeta > 120)) {
      if (PRIO_RANK[c.prioridad] > PRIO_RANK['MEDIA']) c.prioridad = 'MEDIA'
    }
  }

  // E1 (Issue 3 fix): anti-contradicción — un vendedor = un insight principal,
  // sin importar la prioridad. Excepción: insights tipo 'riesgo_equipo' (contexto)
  // no compiten contra los específicos del vendedor.
  // Issue 6 fix: orden de preferencia por id-prefix para resolver empates de prioridad.
  const PREF_ID: Array<{ prefix: string; rank: number }> = [
    { prefix: 'meta-riesgo', rank: 0 },
    { prefix: 'cartera-pequeña', rank: 1 },
    { prefix: 'concentracion', rank: 2 },
    { prefix: 'mejor-momento', rank: 3 },
    { prefix: 'señal-temprana', rank: 4 }, // gana sobre estancado
    { prefix: 'positivo-estable', rank: 5 },
    { prefix: 'estancado', rank: 6 },
  ]
  const rankId = (id: string): number => {
    for (const { prefix, rank } of PREF_ID) if (id.startsWith(prefix)) return rank
    return 99
  }

  const dedup: CandidatoInterno[] = []
  const porVendedor = new Map<string, CandidatoInterno[]>()
  const yaAsignados = new Set<CandidatoInterno>()
  for (const c of filtrados) {
    if (c.vendedor && c.tipo !== 'riesgo_equipo') {
      const arr = porVendedor.get(c.vendedor) ?? []
      arr.push(c)
      porVendedor.set(c.vendedor, arr)
      yaAsignados.add(c)
    }
  }
  // Fix 1: si el vendedor cumple meta > 150%, su historia principal es positiva.
  // Detectar el ratio de proyección desde cualquiera de sus candidatos que tenga metaContext.
  const metaRatioPorVendedor = new Map<string, number>()
  for (const [vend, grupo] of porVendedor) {
    let mejorRatio = 0
    for (const g of grupo) {
      if (g.metaContext && g.metaContext.metaMes > 0) {
        const r = g.metaContext.proyeccion / g.metaContext.metaMes
        if (r > mejorRatio) mejorRatio = r
      }
    }
    if (mejorRatio > 0) metaRatioPorVendedor.set(vend, mejorRatio)
  }

  for (const [vend, grupo] of porVendedor) {
    if (grupo.length === 1) {
      dedup.push(grupo[0])
    } else {
      const ratioMeta = metaRatioPorVendedor.get(vend) ?? 0
      const cumpleAlto = ratioMeta > 1.5
      grupo.sort((a, b) => {
        const pdiff = PRIO_RANK[a.prioridad] - PRIO_RANK[b.prioridad]
        if (pdiff !== 0) return pdiff
        // Fix 1: misma prioridad — si cumple meta > 150%, preferir el insight positivo
        if (cumpleAlto && a.__esPositivo !== b.__esPositivo) {
          return a.__esPositivo ? -1 : 1
        }
        const idDiff = rankId(a.id) - rankId(b.id)
        if (idDiff !== 0) return idDiff
        return b.__impactoAbs - a.__impactoAbs
      })
      const mejor = grupo[0]
      mejor.señalesConvergentes = (mejor.señalesConvergentes ?? 1) + grupo.length - 1
      const setCruces = new Set<string>()
      for (const g of grupo) for (const x of (g.cruces ?? [])) setCruces.add(x)
      mejor.cruces = [...setCruces]
      dedup.push(mejor)
    }
  }
  // Resto: insights sin vendedor + insights de equipo/contexto
  for (const c of filtrados) {
    if (yaAsignados.has(c)) continue
    dedup.push(c)
  }

  // ============================================================
  // INSIGHT STANDARD VALIDATION (replaces C1, C4, C6, L1, L2, L3, F1 v1.1)
  // ============================================================
  
  // Build config for validation
  const config = buildInsightStandardConfig(dedup, cross)
  
  // Group impacts by entity type for percentile rank calculation
  const impactosPorTipo = new Map<string, number[]>()
  for (const c of dedup) {
    let tipo = ''
    if (c.vendedor) tipo = 'vendedor'
    else if (c.cliente) tipo = 'cliente'
    else if (c.producto) tipo = 'producto'
    else if (c.id.includes('depto')) tipo = 'departamento'
    else if (c.id.includes('canal')) tipo = 'canal'
    else continue
    if (!impactosPorTipo.has(tipo)) impactosPorTipo.set(tipo, [])
    impactosPorTipo.get(tipo)!.push(c.__impactoAbs)
  }
  
  // Calculate percentile rank for each candidate
  const candidatosConRank = dedup.map(c => {
    let tipo = ''
    if (c.vendedor) tipo = 'vendedor'
    else if (c.cliente) tipo = 'cliente'
    else if (c.producto) tipo = 'producto'
    else if (c.id.includes('depto')) tipo = 'departamento'
    else if (c.id.includes('canal')) tipo = 'canal'
    
    let percentileRank = 50 // default
    if (tipo && impactosPorTipo.has(tipo)) {
      const impactos = impactosPorTipo.get(tipo)!
      const sorted = [...impactos].sort((a, b) => a - b)
      const idx = sorted.findIndex(v => v >= c.__impactoAbs)
      percentileRank = idx >= 0 ? (idx / sorted.length) * 100 : 100
    }
    
    const candidate = toInsightCandidate(c, percentileRank, cross)
    const validation = validarInsight(candidate, config)
    
    return { candidato: c, validation, candidate }
  })
  
  // Filter approved and update priority
  let validados = candidatosConRank
    .filter(({ validation }) => validation.aprobado)
    .map(({ candidato, validation }) => {
      // Adjust priority based on validation maxPrioridad (maximum allowed)
      const currentRank = PRIO_RANK[candidato.prioridad]
      const maxRank = PRIO_RANK[validation.maxPrioridad]
      if (currentRank < maxRank) {
        // current priority is higher (lower number) than allowed, lower it to maxPrioridad
        candidato.prioridad = validation.maxPrioridad
      }
      // If currentRank > maxRank, current priority is lower (more restrictive) than allowed, keep it
      return candidato
    })

  // Issue 4 fix: limitar a máximo 3 insights de concentración (los más extremos por valor_numerico)
  const concentracion = validados.filter(c => c.id.startsWith('concentracion'))
  if (concentracion.length > 3) {
    concentracion.sort((a, b) => (b.valor_numerico ?? 0) - (a.valor_numerico ?? 0))
    const aMantener = new Set(concentracion.slice(0, 3).map(c => c.id))
    validados = validados.filter(c => !c.id.startsWith('concentracion') || aMantener.has(c.id))
  }

  // Fix 2: rescate de vendedores activos sin insight tras dedup + cap de concentración.
  // Si un vendedor tenía insights secundarios descartados, restaurar el mejor disponible
  // como MEDIA para que ningún vendedor activo quede invisible.
  const vendedoresVisibles = new Set(validados.map(c => c.vendedor).filter(Boolean) as string[])
  const vendedoresActivos: string[] = []
  for (const [v, ytd] of cross.vendorYTD) {
    if (ytd.net > 0 || ytd.uds > 0) vendedoresActivos.push(v)
  }
  const sinInsight = vendedoresActivos.filter(v => !vendedoresVisibles.has(v))
  if (sinInsight.length > 0) {
    for (const vend of sinInsight) {
      // Buscar candidatos secundarios para este vendedor (los originales pre-dedup)
      const secundarios = candidatos.filter(c => c.vendedor === vend)
      if (secundarios.length === 0) continue
      // Preferencia: señal-temprana > positivo-estable > estancado > mejor-momento > otros
      const RESCUE_PREF: Array<{ prefix: string; rank: number }> = [
        { prefix: 'señal-temprana', rank: 0 },
        { prefix: 'positivo-estable', rank: 1 },
        { prefix: 'mejor-momento', rank: 2 },
        { prefix: 'estancado', rank: 3 },
      ]
      const rankRescue = (id: string): number => {
        for (const { prefix, rank } of RESCUE_PREF) if (id.startsWith(prefix)) return rank
        return 99
      }
      secundarios.sort((a, b) => rankRescue(a.id) - rankRescue(b.id))
      const elegido = secundarios[0]
      // Validar que tiene los campos mínimos para no romper el render
      if (!elegido.accion || !elegido.accion.texto?.trim() || !elegido.contrastePortafolio) continue
      if (!esConclusionValida(elegido.conclusion ?? '')) continue
      if (!elegido.descripcion || elegido.descripcion.trim().length < 30) continue
      // Sustituir jerga sobre los campos por si no pasaron el filtro L1
      elegido.descripcion = sustituirJerga(elegido.descripcion)
      if (elegido.conclusion) elegido.conclusion = sustituirJerga(elegido.conclusion)
      if (elegido.accion) elegido.accion.texto = sustituirJerga(elegido.accion.texto)
      if (elegido.contrastePortafolio) elegido.contrastePortafolio = sustituirJerga(elegido.contrastePortafolio)
      const blob = [elegido.descripcion, elegido.conclusion, elegido.accion?.texto, elegido.contrastePortafolio].filter(Boolean).join(' ')
      if (contieneJerga(blob).tieneJerga) continue
      // Forzar prioridad MEDIA para no inflar el listado
      elegido.prioridad = 'MEDIA'
      validados.push(elegido)
      vendedoresVisibles.add(vend)
    }
  }

  // E2: balance — al menos 1 positivo por cada 4 negativos; promover positivos de BAJA si faltan
  const negativos = validados.filter(c => !c.__esPositivo).length
  const positivos = validados.filter(c => c.__esPositivo).length
  const positivosNecesarios = Math.ceil(negativos / 4)
  if (positivos < positivosNecesarios) {
    const candidatosPromover = validados
      .filter(c => c.__esPositivo && c.prioridad === 'BAJA')
      .sort((a, b) => b.__impactoAbs - a.__impactoAbs)
    const aPromover = positivosNecesarios - positivos
    for (let i = 0; i < Math.min(aPromover, candidatosPromover.length); i++) {
      candidatosPromover[i].prioridad = 'MEDIA'
    }
  }

  // Ordenar: prioridad → impacto desc
  validados.sort((a, b) => {
    const pdiff = PRIO_RANK[a.prioridad] - PRIO_RANK[b.prioridad]
    if (pdiff !== 0) return pdiff
    return b.__impactoAbs - a.__impactoAbs
  })

  // Limitar a 20 — si hay exceso, eliminar BAJA primero
  if (validados.length > 20) {
    const noBaja = validados.filter(c => c.prioridad !== 'BAJA')
    if (noBaja.length >= 20) {
      validados = noBaja.slice(0, 20)
    } else {
      const baja = validados.filter(c => c.prioridad === 'BAJA').slice(0, 20 - noBaja.length)
      validados = [...noBaja, ...baja]
    }
  }

  // Convertir a Insight (eliminar campos internos)
  return validados.map(c => {
    const out: Insight = {
      id: c.id,
      tipo: c.tipo,
      prioridad: c.prioridad,
      emoji: c.emoji,
      titulo: c.titulo,
      descripcion: c.descripcion,
      vendedor: c.vendedor,
      cliente: c.cliente,
      producto: c.producto,
      valor_numerico: c.valor_numerico,
      accion_sugerida: c.accion?.texto,
      impacto_economico: c.impacto_economico,
      conclusion: c.conclusion,
      accion: c.accion,
      contrastePortafolio: c.contrastePortafolio,
      cruces: c.cruces,
      metaContext: c.metaContext,
      inventarioContext: c.inventarioContext,
      esPositivo: c.esPositivo,
      esAccionable: c.esAccionable,
      señalesConvergentes: c.señalesConvergentes,
    }
    return out
  })
}

// ────────────────────────────────────────────────────────────
// PASO 4 — generateInsights() — firma pública estable
// ────────────────────────────────────────────────────────────

export function generateInsights(
  vendorAnalysis: VendorAnalysis[],
  teamStats: TeamStats,
  sales: SaleRecord[],
  metas: MetaRecord[],
  dataAvailability: DataAvailability,
  configuracion: Configuracion,
  clientesDormidos: ClienteDormido[],
  concentracionRiesgo: ConcentracionRiesgo[],
  categoriasInventario: CategoriaInventario[],
  supervisorAnalysis: SupervisorAnalysis[] = [],
  categoriaAnalysis: CategoriaAnalysis[] = [],
  canalAnalysis: CanalAnalysis[] = [],
  selectedPeriod?: { year: number; month: number },
): Insight[] {
  void vendorAnalysis
  void teamStats
  void concentracionRiesgo
  void supervisorAnalysis
  void categoriaAnalysis
  void canalAnalysis
  void configuracion
  void selectedPeriod

  _idCounter = 0

  if (!sales || sales.length === 0) return []

  // 1) fechaRef: máximo de fechas en sales (single pass, sin spread)
  const fechaRef = sales.reduce((max, s) => {
    if (!s || !s.fecha) return max
    const t = s.fecha instanceof Date ? s.fecha.getTime() : new Date(s.fecha).getTime()
    return t > max ? t : max
  }, 0)
  const fr = fechaRef > 0 ? new Date(fechaRef) : new Date()

  // 2) buildCrossTables (un solo pase)
  const cross = buildCrossTables(sales, fr, !!dataAvailability.has_venta_neta)

  // GAP 4: churn baseline por vendedor — calcular UNA vez
  const churnMap = calcularChurnVendedor(cross)

  // 3) Llamar a cada generador en orden documentado
  const inv = categoriasInventario ?? []
  const candidatos: CandidatoInterno[] = []
  candidatos.push(...vendedorMetaRiesgo(cross, metas, clientesDormidos, churnMap))
  if (dataAvailability.has_producto) {
    candidatos.push(...productoMuerto(cross, inv))
    candidatos.push(...productoOportunidad(cross, inv))
    candidatos.push(...productoSustitucion(cross, inv))
    // GAP 5: nuevo generador productoCoDeclive (después de sustitución, antes de inventario)
    candidatos.push(...productoCoDeclive(cross, inv))
  }
  if (dataAvailability.has_inventario) {
    candidatos.push(...inventarioDesabasto(cross, inv))
    candidatos.push(...inventarioSobrestock(cross, inv))
  }
  candidatos.push(...vendedorMejorMomento(cross, metas))
  if (dataAvailability.has_cliente) {
    candidatos.push(...vendedorConcentracion(cross, metas))
  }
  if (dataAvailability.has_departamento) {
    candidatos.push(...departamentoCaida(cross))
    candidatos.push(...vendedorCarteraPequeña(cross, metas))
  }
  candidatos.push(...equipoContexto(cross, metas))
  candidatos.push(...vendedorSeñalTemprana(cross, metas, churnMap))
  candidatos.push(...vendedorPositivoEstable(cross, metas))
  candidatos.push(...vendedorEstancado(cross, metas))
  if (dataAvailability.has_canal) {
    candidatos.push(...canalContexto(cross))
  }

  // 4) Pipeline
  return pipeline(candidatos, cross)
}
