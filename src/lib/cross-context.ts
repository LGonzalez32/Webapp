// ============================================================
// cross-context.ts — [Z.10.1] capa de contexto cruzado
// Funciones puras que encapsulan el contexto cruzado que hoy
// vive en insightEngine.ts. NO activa aún (no se importa desde
// ningún consumidor). Se cablea en Z.10.2.
// ============================================================

import type { SaleRecord, ClienteDormido } from '../types'

// ────────────────────────────────────────────────────────────
// TIPOS — espejo de los internos de insightEngine.ts
// (duplicación intencional: Motor 1 sigue intacto mientras
// construimos la infraestructura nueva; Paso 5 elimina la copia)
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

  monthlyByVendor: Map<string, Map<string, number>>
  monthlyByProduct: Map<string, Map<string, number>>
  monthlyByClient: Map<string, Map<string, number>>

  vendorClientMatrix: Map<string, Map<string, number>>

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

export interface ChurnVendedor {
  baseline: number
  sigma: number
  actual: number
  esAnomalo: boolean
  perdidos: number
}

// ────────────────────────────────────────────────────────────
// HELPERS internos (copiados de insightEngine.ts)
// ────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────
// 1) buildCrossTables — copiado 1:1 de insightEngine.ts L.202-427
// Un solo pase sobre sales para construir todas las agregaciones
// cruzadas (vendedor × cliente × producto × dept × canal) en YTD,
// PrevYTD, MTD, PrevMTD + series mensuales.
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

    const isYTD = yr === anioRef && (mo < mesRef || (mo === mesRef && dy <= diaRef))
    const isPrevYTD = yr === anioRef - 1 && (mo < mesRef || (mo === mesRef && dy <= diaRef))
    const isMTD = yr === anioRef && mo === mesRef && dy <= diaRef
    const isPrevMTD = yr === anioRef - 1 && mo === mesRef && dy <= diaRef

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

    if (isYTD) {
      cross.totalYTD += net

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

        if (cliente) {
          const vc = ensureMap(cross.vendorClientMatrix, vendedor, () => new Map<string, number>())
          incMap(vc, cliente, valor)
        }
      }

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

        if (producto) {
          const cp = ensureMap(cross.clientProductYTD, cliente, () => new Map<string, { uds: number; net: number }>())
          const slot = cp.get(producto) ?? { uds: 0, net: 0 }
          slot.uds += uds
          slot.net += net
          cp.set(producto, slot)
        }
      }

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

    if (isMTD) {
      cross.totalMTD += net
      if (vendedor) {
        const vb = ensureMap(cross.vendorMTD, vendedor, () => ({ net: 0, uds: 0 }))
        vb.net += net
        vb.uds += uds
      }
    }

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
// 2) trimestreDe — copiado 1:1 de insightEngine.ts L.551-558
// Devuelve { anio, trimestre } (1-4) para una clave "YYYY-MM".
// ────────────────────────────────────────────────────────────
function trimestreDe(monthKey: string): { anio: number; trimestre: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey)
  if (!m) return null
  const anio = parseInt(m[1], 10)
  const mes = parseInt(m[2], 10)
  if (mes < 1 || mes > 12) return null
  return { anio, trimestre: Math.ceil(mes / 3) }
}

// ────────────────────────────────────────────────────────────
// 3) calcularChurnVendedor — copiado 1:1 de insightEngine.ts L.571-625
// Baseline estadístico de churn por vendedor (media + sigma de
// tasas trimestrales). Devuelve Map<vendedor, ChurnVendedor>.
// ────────────────────────────────────────────────────────────
export function calcularChurnVendedor(cross: CrossTables): Map<string, ChurnVendedor> {
  const result = new Map<string, ChurnVendedor>()

  for (const [vend, ytd] of cross.vendorYTD) {
    const prev = cross.vendorPrevYTD.get(vend)
    if (!prev || prev.clients.size === 0) continue

    const prevSet = new Set(prev.clients.keys())
    const actualSet = new Set(ytd.clients.keys())
    let perdidos = 0
    for (const c of prevSet) if (!actualSet.has(c)) perdidos++
    const actual = prevSet.size > 0 ? perdidos / prevSet.size : 0

    const monthly = cross.monthlyByVendor.get(vend)
    const tasas: number[] = []
    if (monthly && monthly.size >= 2) {
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
// 4) changesByEntity — copiado 1:1 de insightEngine.ts L.522-536
// Compara dos Maps<string, number> y devuelve deltas por key.
// ────────────────────────────────────────────────────────────
export function changesByEntity(
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
// Contextos por entidad — [Z.10 nuevas]
// Serializables directamente en detail.cross_context sin
// transformación adicional.
// ────────────────────────────────────────────────────────────

export interface ProductoContexto {
  clientesQueDejaronDeComprar: Array<{ cliente: string; valorPrevYTD: number; diasSinCompra?: number }>
  clientesDeVolumenPerdidos: Array<{ cliente: string; valorPrevYTD: number; pesoPrevPct: number }>
  departamentoMasAfectado: { nombre: string; caidaAbs: number; caidaPct: number } | null
  topVendedorAfectado: { nombre: string; caidaAbs: number } | null
  varPct: number
  varAbs: number
}

/**
 * [Z.10 nueva] Contexto cruzado para un producto: quién dejó de comprarlo,
 * clientes de volumen perdidos, departamento y vendedor más afectados.
 */
export function buildProductoContexto(producto: string, cross: CrossTables): ProductoContexto {
  const empty: ProductoContexto = {
    clientesQueDejaronDeComprar: [],
    clientesDeVolumenPerdidos: [],
    departamentoMasAfectado: null,
    topVendedorAfectado: null,
    varPct: 0,
    varAbs: 0,
  }

  const prodActual = cross.prodYTD.get(producto)
  const prodPrev = cross.prodPrevYTD.get(producto)
  if (!prodActual && !prodPrev) return empty

  const netActual = prodActual?.net ?? 0
  const netPrev = prodPrev?.net ?? 0
  const varAbs = netActual - netPrev
  const varPct = netPrev > 0 ? (varAbs / netPrev) * 100 : 0

  const totalPrevProd = netPrev

  // Clientes que dejaron de comprar: estaban en prev, ausentes en actual
  const actualClients = prodActual?.clients ?? new Map<string, number>()
  const prevClients = prodPrev?.clients ?? new Map<string, number>()
  const perdidos: Array<{ cliente: string; valorPrevYTD: number; diasSinCompra?: number }> = []
  for (const [cliente, valorPrev] of prevClients) {
    if (!actualClients.has(cliente)) {
      perdidos.push({ cliente, valorPrevYTD: valorPrev })
    }
  }
  perdidos.sort((a, b) => b.valorPrevYTD - a.valorPrevYTD)
  const clientesQueDejaronDeComprar = perdidos.slice(0, 5)

  // Clientes de volumen perdidos: de los ausentes, los que pesaban >= 10% del volumen previo del producto
  const clientesDeVolumenPerdidos: Array<{ cliente: string; valorPrevYTD: number; pesoPrevPct: number }> = []
  if (totalPrevProd > 0) {
    for (const p of perdidos) {
      const peso = (p.valorPrevYTD / totalPrevProd) * 100
      if (peso >= 10) {
        clientesDeVolumenPerdidos.push({
          cliente: p.cliente,
          valorPrevYTD: p.valorPrevYTD,
          pesoPrevPct: peso,
        })
      }
    }
  }

  // Departamento más afectado: reconstruir dept → prev usando clientPrevYTD (no tiene dept)
  // y mapear cliente→dept vía clientYTD.depts (asumimos dept estable por cliente).
  const deptPrev = new Map<string, number>()
  for (const [cliente, valorPrev] of prevClients) {
    const clientInfo = cross.clientYTD.get(cliente)
    if (!clientInfo || clientInfo.depts.size === 0) continue
    let topDept = ''
    let topVal = -1
    for (const [d, v] of clientInfo.depts) {
      if (v > topVal) { topVal = v; topDept = d }
    }
    if (!topDept) continue
    deptPrev.set(topDept, (deptPrev.get(topDept) ?? 0) + valorPrev)
  }
  const deptActual = prodActual?.depts ?? new Map<string, number>()
  let departamentoMasAfectado: ProductoContexto['departamentoMasAfectado'] = null
  {
    const keys = new Set<string>()
    for (const k of deptPrev.keys()) keys.add(k)
    for (const k of deptActual.keys()) keys.add(k)
    let peorCaida = 0
    for (const k of keys) {
      const p = deptPrev.get(k) ?? 0
      const a = deptActual.get(k) ?? 0
      const caida = p - a
      if (caida > peorCaida) {
        peorCaida = caida
        departamentoMasAfectado = {
          nombre: k,
          caidaAbs: caida,
          caidaPct: p > 0 ? (caida / p) * 100 : 0,
        }
      }
    }
  }

  // Top vendedor afectado: mayor caída entre prodActual.vendors y (no hay prev.vendors).
  // Reconstruir vendorPrev del producto igual que con dept, vía clientPrevYTD→vendorClientMatrix.
  const vendorPrevProd = new Map<string, number>()
  for (const [cliente, valorPrev] of prevClients) {
    const clientInfo = cross.clientYTD.get(cliente)
    if (!clientInfo || clientInfo.vendors.size === 0) continue
    let topV = ''
    let topVal = -1
    for (const [v, val] of clientInfo.vendors) {
      if (val > topVal) { topVal = val; topV = v }
    }
    if (!topV) continue
    vendorPrevProd.set(topV, (vendorPrevProd.get(topV) ?? 0) + valorPrev)
  }
  const vendorActualProd = prodActual?.vendors ?? new Map<string, number>()
  let topVendedorAfectado: ProductoContexto['topVendedorAfectado'] = null
  {
    const keys = new Set<string>()
    for (const k of vendorPrevProd.keys()) keys.add(k)
    for (const k of vendorActualProd.keys()) keys.add(k)
    let peor = 0
    for (const k of keys) {
      const p = vendorPrevProd.get(k) ?? 0
      const a = vendorActualProd.get(k) ?? 0
      const caida = p - a
      if (caida > peor) {
        peor = caida
        topVendedorAfectado = { nombre: k, caidaAbs: caida }
      }
    }
  }

  return {
    clientesQueDejaronDeComprar,
    clientesDeVolumenPerdidos,
    departamentoMasAfectado,
    topVendedorAfectado,
    varPct,
    varAbs,
  }
}

export interface VendedorContexto {
  clientesDormidos: Array<{ cliente: string; diasSinActividad: number; valorPrevYTD: number }>
  clientesPerdidos: Array<{ cliente: string; valorPrev: number }>
  topClienteCaida: { cliente: string; delta: number } | null
  churnAnomalo: boolean
  churnPerdidos: number
  topProductoYTD: { producto: string; valor: number } | null
  topDepartamentoYTD: { departamento: string; valor: number } | null
  aporteCrecimientoEquipoPct: number
  pesoEquipoPct: number
}

/**
 * [Z.10 nueva] Contexto cruzado para un vendedor: dormidos, perdidos,
 * top caída, flags de churn, aporte al equipo.
 */
export function buildVendedorContexto(
  vendedor: string,
  cross: CrossTables,
  dormidos: ClienteDormido[],
  churnMap: Map<string, ChurnVendedor>,
): VendedorContexto {
  const ytd = cross.vendorYTD.get(vendedor)
  const prev = cross.vendorPrevYTD.get(vendedor)

  // Clientes dormidos del vendedor (filtrar del array global)
  const clientesDormidos = (dormidos ?? [])
    .filter((d) => d.vendedor === vendedor)
    .map((d) => ({
      cliente: d.cliente,
      diasSinActividad: d.dias_sin_actividad,
      valorPrevYTD: d.valor_yoy_usd,
    }))

  // Clientes perdidos: presentes en prev, ausentes en actual
  const deltas = changesByEntity(prev?.clients, ytd?.clients)
  const clientesPerdidos = deltas
    .filter((d) => d.prev > 0 && d.actual === 0)
    .map((d) => ({ cliente: d.key, valorPrev: d.prev }))
    .sort((a, b) => b.valorPrev - a.valorPrev)

  // Top cliente con mayor caída (delta más negativo)
  let topClienteCaida: VendedorContexto['topClienteCaida'] = null
  for (const d of deltas) {
    if (d.delta < 0) {
      if (!topClienteCaida || d.delta < topClienteCaida.delta) {
        topClienteCaida = { cliente: d.key, delta: d.delta }
      }
    }
  }

  const churn = churnMap.get(vendedor)
  const churnAnomalo = churn?.esAnomalo ?? false
  const churnPerdidos = churn?.perdidos ?? 0

  // Top producto YTD
  let topProductoYTD: VendedorContexto['topProductoYTD'] = null
  if (ytd && ytd.prods.size > 0) {
    let best: [string, number] | null = null
    for (const [p, v] of ytd.prods) {
      if (!best || v > best[1]) best = [p, v]
    }
    if (best) topProductoYTD = { producto: best[0], valor: best[1] }
  }

  // Top departamento YTD
  let topDepartamentoYTD: VendedorContexto['topDepartamentoYTD'] = null
  if (ytd && ytd.depts.size > 0) {
    let best: [string, number] | null = null
    for (const [d, v] of ytd.depts) {
      if (!best || v > best[1]) best = [d, v]
    }
    if (best) topDepartamentoYTD = { departamento: best[0], valor: best[1] }
  }

  const netYtd = ytd?.net ?? 0
  const netPrev = prev?.net ?? 0
  const deltaTeam = cross.totalYTD - cross.totalPrevYTD
  const aporteCrecimientoEquipoPct = deltaTeam !== 0 ? ((netYtd - netPrev) / deltaTeam) * 100 : 0
  const pesoEquipoPct = cross.totalYTD > 0 ? (netYtd / cross.totalYTD) * 100 : 0

  return {
    clientesDormidos,
    clientesPerdidos,
    topClienteCaida,
    churnAnomalo,
    churnPerdidos,
    topProductoYTD,
    topDepartamentoYTD,
    aporteCrecimientoEquipoPct,
    pesoEquipoPct,
  }
}

export interface ClienteContexto {
  varPct: number
  varAbs: number
  topProductosCaida: Array<{ producto: string; caidaAbs: number }>
  vendedorPrincipal: string | null
  departamento: string | null
}

/**
 * [Z.10 nueva] Contexto cruzado para un cliente: variación, productos
 * con mayor caída, vendedor principal y departamento.
 */
export function buildClienteContexto(cliente: string, cross: CrossTables): ClienteContexto {
  const actual = cross.clientYTD.get(cliente)
  const prev = cross.clientPrevYTD.get(cliente)

  const netActual = actual?.net ?? 0
  const netPrev = prev?.net ?? 0
  const varAbs = netActual - netPrev
  const varPct = netPrev > 0 ? (varAbs / netPrev) * 100 : 0

  const deltasProd = changesByEntity(prev?.prods, actual?.prods)
  const topProductosCaida = deltasProd
    .filter((d) => d.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 5)
    .map((d) => ({ producto: d.key, caidaAbs: Math.abs(d.delta) }))

  let vendedorPrincipal: string | null = null
  if (actual && actual.vendors.size > 0) {
    let best: [string, number] | null = null
    for (const [v, val] of actual.vendors) {
      if (!best || val > best[1]) best = [v, val]
    }
    if (best) vendedorPrincipal = best[0]
  }

  let departamento: string | null = null
  if (actual && actual.depts.size > 0) {
    let best: [string, number] | null = null
    for (const [d, val] of actual.depts) {
      if (!best || val > best[1]) best = [d, val]
    }
    if (best) departamento = best[0]
  }

  return {
    varPct,
    varAbs,
    topProductosCaida,
    vendedorPrincipal,
    departamento,
  }
}

// [Z.10.1] capa de contexto cruzado — no activa aún, se consume en Z.10.2

// ────────────────────────────────────────────────────────────
// [Z.10.4] Helper unificado de enrichment
// ────────────────────────────────────────────────────────────

export interface EnrichmentContext {
  crossTables: CrossTables
  churnMap: Map<string, ChurnVendedor>
  dormidos: ClienteDormido[]
}

export interface EnrichInput {
  dimensionId: string
  member: string
  descripcion: string
  baseDetail: Record<string, unknown>
}

export interface EnrichOutput {
  description: string
  detail: Record<string, unknown>
}

/**
 * [Z.10.4] Contexto precomputado para enriquecer candidatos.
 * Se calcula UNA vez por run.
 */
export function buildEnrichmentContext(
  sales: SaleRecord[],
  fechaRef: Date,
  hasVentaNeta: boolean,
  dormidos?: ClienteDormido[],
): EnrichmentContext {
  const crossTables = buildCrossTables(sales, fechaRef, hasVentaNeta)
  const churnMap = calcularChurnVendedor(crossTables)
  return { crossTables, churnMap, dormidos: dormidos ?? [] }
}

/**
 * [Z.10.4] Enriquece un candidate con cross_context + frases narrativas.
 * Degrada silenciosamente si no aplica (dim no soportada, member vacío, builder lanza).
 * Nunca lanza.
 */
export function enriquecerCandidate(
  candidate: EnrichInput,
  enrichCtx: EnrichmentContext | undefined | null,
): EnrichOutput {
  const { dimensionId, member, descripcion, baseDetail } = candidate
  const fallback: EnrichOutput = { description: descripcion, detail: baseDetail }
  if (!member || !enrichCtx?.crossTables) return fallback

  try {
    let ctx: any = null
    if (dimensionId === 'producto') {
      ctx = buildProductoContexto(member, enrichCtx.crossTables)
    } else if (dimensionId === 'cliente') {
      ctx = buildClienteContexto(member, enrichCtx.crossTables)
    } else if (dimensionId === 'vendedor') {
      ctx = buildVendedorContexto(
        member,
        enrichCtx.crossTables,
        enrichCtx.dormidos,
        enrichCtx.churnMap,
      )
    } else {
      return fallback
    }
    if (!ctx) return fallback

    const parts: string[] = [descripcion]

    if (dimensionId === 'producto') {
      if (ctx.clientesDeVolumenPerdidos && ctx.clientesDeVolumenPerdidos.length > 0) {
        const clis = ctx.clientesDeVolumenPerdidos
          .slice(0, 2)
          .map((c: any) => c.cliente)
          .join(' y ')
        const n = ctx.clientesDeVolumenPerdidos.length
        parts.push(
          n === 1
            ? `${clis} dejó de comprar este año y era cliente de volumen.`
            : `${clis} dejaron de comprar este año y eran clientes de volumen.`,
        )
      }
      if (ctx.departamentoMasAfectado?.nombre) {
        parts.push(`El departamento ${ctx.departamentoMasAfectado.nombre} es el más afectado.`)
      }
    } else if (dimensionId === 'cliente') {
      if (ctx.topProductosCaida && ctx.topProductosCaida.length > 0) {
        const top = ctx.topProductosCaida
          .slice(0, 2)
          .map((p: any) => p.producto)
          .join(' y ')
        parts.push(`La caída se concentra en ${top}.`)
      }
      if (ctx.departamento && ctx.vendedorPrincipal) {
        parts.push(`Cliente atendido por ${ctx.vendedorPrincipal} en ${ctx.departamento}.`)
      }
    } else if (dimensionId === 'vendedor') {
      if (ctx.clientesDormidos && ctx.clientesDormidos.length > 0) {
        const cli = ctx.clientesDormidos[0]
        const n = ctx.clientesDormidos.length
        parts.push(
          n === 1
            ? `${cli.cliente} lleva ${cli.diasSinActividad} días sin actividad.`
            : `${n} clientes suyos están dormidos, encabezados por ${cli.cliente} (${cli.diasSinActividad}d).`,
        )
      }
      if (ctx.topClienteCaida?.cliente && ctx.topClienteCaida.delta < 0) {
        const abs = Math.abs(ctx.topClienteCaida.delta)
        const fmt = abs >= 100 ? `$${Math.round(abs)}` : `$${abs.toFixed(0)}`
        parts.push(`Mayor caída: ${ctx.topClienteCaida.cliente} (${fmt} menos).`)
      }
      if (ctx.churnAnomalo && ctx.churnPerdidos > 0) {
        parts.push(
          `Su churn (${ctx.churnPerdidos} clientes perdidos) es anómalo vs el resto del equipo.`,
        )
      }
    }

    const description = parts.length > 1 ? parts.join(' ') : descripcion
    const detail = { ...baseDetail, cross_context: ctx }
    return { description, detail }
  } catch {
    return fallback
  }
}
