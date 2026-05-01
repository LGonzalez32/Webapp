import type { SaleRecord, MetaRecord, InventoryItem } from '../types'
import { emitIngestSummary } from './ingestTelemetry'

// ─── Los Pinos S.A. ──────────────────────────────────────────
// Ene 2024 – Dic 2028 · 8 vendedores · 30 clientes · 20 productos
// Ventas filtradas ≤ hoy · Metas completas 2024-2028 · Semilla determinística
// Insights engineered: deterioro Carlos, dependencia Ana, mono-categoría Sandra,
// subejecución Miguel Ángel, colapso Snacks, clientes dormidos, concentración

// ─── ESTACIONALIDAD ───────────────────────────────────────────────────────────

const ESTACIONAL: Record<number, number> = {
  1: 0.75, 2: 0.82, 3: 0.90, 4: 0.97, 5: 1.00, 6: 1.05,
  7: 1.12, 8: 1.08, 9: 0.95, 10: 1.02, 11: 1.15, 12: 1.40,
}

// ─── PRODUCTOS ────────────────────────────────────────────────────────────────

interface Prod { codigo: string; nombre: string; cat: string; precio: number }

const PRODS: Prod[] = [
  { codigo: 'LAC001', nombre: 'Leche Entera 1L',       cat: 'Lácteos',   precio: 1.80 },
  { codigo: 'LAC002', nombre: 'Yogurt Natural 500g',   cat: 'Lácteos',   precio: 2.50 },
  { codigo: 'LAC003', nombre: 'Queso Fresco 400g',     cat: 'Lácteos',   precio: 3.20 },
  { codigo: 'LAC004', nombre: 'Crema Ácida 250g',      cat: 'Lácteos',   precio: 1.50 },
  { codigo: 'LAC005', nombre: 'Mantequilla 225g',      cat: 'Lácteos',   precio: 2.80 },
  { codigo: 'REF001', nombre: 'Coca Cola 600ml',       cat: 'Refrescos', precio: 0.85 },
  { codigo: 'REF002', nombre: 'Pepsi 600ml',           cat: 'Refrescos', precio: 0.80 },
  { codigo: 'REF003', nombre: 'Agua Pura 500ml',       cat: 'Refrescos', precio: 0.50 },
  { codigo: 'REF004', nombre: 'Jugo Naranja 1L',       cat: 'Refrescos', precio: 1.60 },
  { codigo: 'REF005', nombre: 'Té Helado 500ml',       cat: 'Refrescos', precio: 1.20 },
  { codigo: 'SNA001', nombre: 'Papas Fritas 150g',     cat: 'Snacks',    precio: 1.10 },
  { codigo: 'SNA002', nombre: 'Galletas Soda 200g',    cat: 'Snacks',    precio: 0.90 },
  { codigo: 'SNA003', nombre: 'Cacahuates 100g',       cat: 'Snacks',    precio: 0.75 },
  { codigo: 'SNA004', nombre: 'Palomitas 80g',         cat: 'Snacks',    precio: 0.65 },
  { codigo: 'SNA005', nombre: 'Chicharrón 120g',       cat: 'Snacks',    precio: 0.85 },
  { codigo: 'LIM001', nombre: 'Detergente 1kg',        cat: 'Limpieza',  precio: 3.50 },
  { codigo: 'LIM002', nombre: 'Jabón Lavaplatos 500g', cat: 'Limpieza',  precio: 2.20 },
  { codigo: 'LIM003', nombre: 'Suavizante 1L',         cat: 'Limpieza',  precio: 2.80 },
  { codigo: 'LIM004', nombre: 'Cloro 1L',              cat: 'Limpieza',  precio: 1.40 },
  { codigo: 'LIM005', nombre: 'Desinfectante 750ml',   cat: 'Limpieza',  precio: 2.60 },
]

const BY_CAT: Record<string, Prod[]> = {}
for (const p of PRODS) {
  if (!BY_CAT[p.cat]) BY_CAT[p.cat] = []
  BY_CAT[p.cat].push(p)
}

// SNA001+SNA002 only (for when SNA003-005 are frozen for sin_movimiento)
const SNACKS_ACTIVOS = BY_CAT['Snacks'].filter(p => p.codigo === 'SNA001' || p.codigo === 'SNA002')

// ─── CLIENTES ─────────────────────────────────────────────────────────────────

interface Cliente { codigo: string; nombre: string; canal: string; vendedor: string; dpto: string }

const CLIENTES: Cliente[] = [
  // Autoservicio
  { codigo: 'CLI001', nombre: 'Supermercado López',      canal: 'Autoservicio', vendedor: 'Carlos Ramírez',    dpto: 'Santa Ana'    },
  { codigo: 'CLI002', nombre: 'Supermercado Nacional',   canal: 'Autoservicio', vendedor: 'Ana González',      dpto: 'Ahuachapán'   },
  { codigo: 'CLI003', nombre: 'Super Selectos Norte',    canal: 'Autoservicio', vendedor: 'María Castillo',    dpto: 'San Salvador' },
  { codigo: 'CLI004', nombre: 'Despensa Familiar',       canal: 'Autoservicio', vendedor: 'Luis Hernández',    dpto: 'La Libertad'  },
  { codigo: 'CLI005', nombre: 'Super Económico',         canal: 'Autoservicio', vendedor: 'Sandra Morales',    dpto: 'Cuscatlán'    },
  { codigo: 'CLI006', nombre: 'Hiper Paiz Central',      canal: 'Autoservicio', vendedor: 'Miguel Ángel Díaz', dpto: 'San Miguel'   },
  { codigo: 'CLI007', nombre: 'Super La Colonia',        canal: 'Autoservicio', vendedor: 'Patricia Vásquez',  dpto: 'Usulután'     },
  { codigo: 'CLI008', nombre: 'Walmart Occidente',       canal: 'Autoservicio', vendedor: 'Roberto Cruz',      dpto: 'Sonsonate'    },
  { codigo: 'CLI009', nombre: 'Súper Todo',              canal: 'Autoservicio', vendedor: 'Carlos Ramírez',    dpto: 'Santa Ana'    },
  { codigo: 'CLI010', nombre: 'Mercado Central',         canal: 'Autoservicio', vendedor: 'Ana González',      dpto: 'Ahuachapán'   },
  // Mostrador
  { codigo: 'CLI011', nombre: 'Tienda El Progreso',      canal: 'Mostrador',    vendedor: 'Carlos Ramírez',    dpto: 'Santa Ana'    },
  { codigo: 'CLI012', nombre: 'Pulpería San José',       canal: 'Mostrador',    vendedor: 'Ana González',      dpto: 'Ahuachapán'   },
  { codigo: 'CLI013', nombre: 'Tienda La Esperanza',     canal: 'Mostrador',    vendedor: 'María Castillo',    dpto: 'San Salvador' },
  { codigo: 'CLI014', nombre: 'Mini Super López',        canal: 'Mostrador',    vendedor: 'Luis Hernández',    dpto: 'La Libertad'  },
  { codigo: 'CLI015', nombre: 'Abarrotería Central',     canal: 'Mostrador',    vendedor: 'Sandra Morales',    dpto: 'Cuscatlán'    },
  { codigo: 'CLI016', nombre: 'Tienda El Carmen',        canal: 'Mostrador',    vendedor: 'Miguel Ángel Díaz', dpto: 'San Miguel'   },
  { codigo: 'CLI017', nombre: 'Pulpería La Bendición',   canal: 'Mostrador',    vendedor: 'Patricia Vásquez',  dpto: 'Usulután'     },
  { codigo: 'CLI018', nombre: 'Mini Market Norte',       canal: 'Mostrador',    vendedor: 'Roberto Cruz',      dpto: 'Sonsonate'    },
  { codigo: 'CLI019', nombre: 'Tienda La Palma',         canal: 'Mostrador',    vendedor: 'Carlos Ramírez',    dpto: 'Santa Ana'    },
  { codigo: 'CLI020', nombre: 'Abarrotería El Sol',      canal: 'Mostrador',    vendedor: 'María Castillo',    dpto: 'La Paz'       },
  // Mayoreo
  { codigo: 'CLI021', nombre: 'Mayoreo del Norte',       canal: 'Mayoreo',      vendedor: 'Ana González',      dpto: 'Ahuachapán'   },
  { codigo: 'CLI022', nombre: 'Comercial Central',   canal: 'Mayoreo',      vendedor: 'Luis Hernández',    dpto: 'San Salvador' },
  { codigo: 'CLI023', nombre: 'Mayorista El Salvador',   canal: 'Mayoreo',      vendedor: 'María Castillo',    dpto: 'La Libertad'  },
  { codigo: 'CLI024', nombre: 'Comercial Sur',       canal: 'Mayoreo',      vendedor: 'Sandra Morales',    dpto: 'La Paz'       },
  { codigo: 'CLI025', nombre: 'Mayoreo Oriente',         canal: 'Mayoreo',      vendedor: 'Miguel Ángel Díaz', dpto: 'San Miguel'   },
  { codigo: 'CLI026', nombre: 'Comercial La Unión',  canal: 'Mayoreo',      vendedor: 'Patricia Vásquez',  dpto: 'La Unión'     },
  { codigo: 'CLI027', nombre: 'Mayorista Occidente',     canal: 'Mayoreo',      vendedor: 'Roberto Cruz',      dpto: 'Sonsonate'    },
  { codigo: 'CLI028', nombre: 'Central de Abastos',      canal: 'Mayoreo',      vendedor: 'Carlos Ramírez',    dpto: 'San Salvador' },
  { codigo: 'CLI029', nombre: 'Comercial Pacífico',  canal: 'Mayoreo',      vendedor: 'Luis Hernández',    dpto: 'La Paz'       },
  { codigo: 'CLI030', nombre: 'Mayoreo Santa Ana',       canal: 'Mayoreo',      vendedor: 'Ana González',      dpto: 'Santa Ana'    },
]

const CLI_MAP: Record<string, Cliente> = {}
for (const c of CLIENTES) CLI_MAP[c.codigo] = c

// ─── VENDEDOR PROFILES ────────────────────────────────────────────────────────

interface VendorProfile {
  nombre: string
  supervisor: string
  dpto: string
  baseDiaria: number
  catWeights: Record<string, number>
  // client codes + base weights (CLI001=2.15 → 35% of Carlos; CLI021=7.43 → 65% of Ana)
  clients: Array<{ codigo: string; w: number }>
}

// Patricia altibajos: monthly cycle applied by (calendarMonth-1) % 12
const PATRICIA_CYCLE = [0.85, 1.15, 0.80, 1.20, 0.90, 1.10, 0.85, 1.25, 0.75, 1.20, 0.80, 1.15]

const VENDORS: VendorProfile[] = [
  {
    nombre: 'Carlos Ramírez', supervisor: 'Roberto Méndez', dpto: 'Santa Ana',
    baseDiaria: 18,
    catWeights: { Refrescos: 0.60, Lácteos: 0.15, Snacks: 0.15, Limpieza: 0.10 },
    // CLI001 weight 2.15 → ~35% historically; explains >50% of drop when absent
    clients: [
      { codigo: 'CLI001', w: 2.15 }, { codigo: 'CLI009', w: 1 },
      { codigo: 'CLI011', w: 1    }, { codigo: 'CLI019', w: 1 },
      { codigo: 'CLI028', w: 1    },
    ],
  },
  {
    nombre: 'Ana González', supervisor: 'Roberto Méndez', dpto: 'Ahuachapán',
    baseDiaria: 15,
    catWeights: { Lácteos: 0.55, Refrescos: 0.25, Snacks: 0.10, Limpieza: 0.10 },
    // CLI021 weight 7.43 → 65% of sales
    clients: [
      { codigo: 'CLI002', w: 1    }, { codigo: 'CLI010', w: 1    },
      { codigo: 'CLI012', w: 1    }, { codigo: 'CLI021', w: 7.43 },
      { codigo: 'CLI030', w: 1    },
    ],
  },
  {
    nombre: 'María Castillo', supervisor: 'Patricia Ruiz', dpto: 'San Salvador',
    baseDiaria: 20,
    catWeights: { Refrescos: 0.50, Limpieza: 0.25, Lácteos: 0.15, Snacks: 0.10 },
    clients: [
      { codigo: 'CLI003', w: 1 }, { codigo: 'CLI013', w: 1 },
      { codigo: 'CLI020', w: 1 }, { codigo: 'CLI023', w: 1 },
    ],
  },
  {
    nombre: 'Luis Hernández', supervisor: 'Patricia Ruiz', dpto: 'La Libertad',
    baseDiaria: 14,
    catWeights: { Limpieza: 0.55, Refrescos: 0.20, Lácteos: 0.15, Snacks: 0.10 },
    clients: [
      { codigo: 'CLI004', w: 1 }, { codigo: 'CLI014', w: 1 },
      { codigo: 'CLI022', w: 1 }, { codigo: 'CLI029', w: 1 },
    ],
  },
  {
    nombre: 'Sandra Morales', supervisor: 'Patricia Ruiz', dpto: 'Cuscatlán',
    baseDiaria: 16,
    // 90% Lácteos → mono-categoría insight
    catWeights: { Lácteos: 0.90, Refrescos: 0.05, Snacks: 0.03, Limpieza: 0.02 },
    clients: [
      { codigo: 'CLI005', w: 1 }, { codigo: 'CLI015', w: 1 }, { codigo: 'CLI024', w: 1 },
    ],
  },
  {
    nombre: 'Miguel Ángel Díaz', supervisor: 'Miguel Torres', dpto: 'San Miguel',
    baseDiaria: 12,
    catWeights: { Snacks: 0.50, Refrescos: 0.25, Lácteos: 0.15, Limpieza: 0.10 },
    clients: [
      { codigo: 'CLI006', w: 1 }, { codigo: 'CLI016', w: 1 }, { codigo: 'CLI025', w: 1 },
    ],
  },
  {
    nombre: 'Patricia Vásquez', supervisor: 'Miguel Torres', dpto: 'Usulután',
    baseDiaria: 14,
    catWeights: { Limpieza: 0.50, Refrescos: 0.25, Lácteos: 0.15, Snacks: 0.10 },
    clients: [
      { codigo: 'CLI007', w: 1 }, { codigo: 'CLI017', w: 1 }, { codigo: 'CLI026', w: 1 },
    ],
  },
  {
    nombre: 'Roberto Cruz', supervisor: 'Miguel Torres', dpto: 'Sonsonate',
    baseDiaria: 11,
    catWeights: { Refrescos: 0.55, Lácteos: 0.20, Snacks: 0.15, Limpieza: 0.10 },
    clients: [
      { codigo: 'CLI008', w: 1 }, { codigo: 'CLI018', w: 1 }, { codigo: 'CLI027', w: 1 },
    ],
  },
]

// ─── PRNG DETERMINISTA (semilla fija → datos idénticos en cada carga) ────────
// Implementación mulberry32 — misma semilla siempre produce la misma secuencia
let _seed = 0x9A7B4C1D
function rng(): number {
  _seed |= 0
  _seed = _seed + 0x6D2B79F5 | 0
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed)
  t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// ─── UTILIDADES ───────────────────────────────────────────────────────────────

function rb(lo: number, hi: number): number { return lo + rng() * (hi - lo) }

function pickWeighted<T>(items: T[], weights: number[]): T {
  let r = rng() * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

function pickRandom<T>(arr: T[]): T { return arr[Math.floor(rng() * arr.length)] }

// ─── TENDENCIA ────────────────────────────────────────────────────────────────
// monthsFromRef: distancia en meses desde fechaReferencia (negativo = pasado)
// totalMonths: total de meses generados (para normalizar tendencias de crecimiento)

function tendencia(nombre: string, monthsFromRef: number, calMonth: number, totalMonths: number): number {
  // Normalizar posición 0..1 dentro de los 60 meses para tendencias graduales
  const pos = Math.max(0, Math.min(1, (totalMonths + monthsFromRef) / totalMonths))
  switch (nombre) {
    case 'Carlos Ramírez':    return monthsFromRef >= -1 ? 0.55 : 1.0  // caída últimos 2 meses
    case 'María Castillo':    return 1.0 + 0.6 * pos   // crecimiento gradual a lo largo de todo el rango
    case 'Miguel Ángel Díaz': return monthsFromRef >= -2 ? 0.75 : 1.0  // caída últimos 3 meses
    case 'Patricia Vásquez':  return PATRICIA_CYCLE[(calMonth - 1) % 12]
    case 'Roberto Cruz':      return 1.0 + 0.96 * pos   // crecimiento fuerte gradual
    default:                  return rb(0.95, 1.05)   // Luis + Sandra: estable con micro-variación
  }
}

// ─── GENERADOR PRINCIPAL ──────────────────────────────────────────────────────
// Genera datos de Ene 2024 a Dic 2028, filtra ventas ≤ hoy al retornar

const START_YEAR = 2024
const END_YEAR = 2028
const TOTAL_MONTHS = (END_YEAR - START_YEAR + 1) * 12 // 60

export function getDemoData(): { sales: SaleRecord[]; metas: MetaRecord[]; inventory: InventoryItem[] } {
  // Reset seed para datos determinísticos en cada llamada
  _seed = 0x9A7B4C1D

  const allSales: SaleRecord[] = []
  const today = new Date()

  // ── Precompute category baselines for meta estimation ─────────────────────
  const CAT_BASELINE_DAILY: Record<string, number> = { Lácteos: 0, Refrescos: 0, Snacks: 0, Limpieza: 0 }
  for (const v of VENDORS) {
    for (const [cat, w] of Object.entries(v.catWeights)) {
      CAT_BASELINE_DAILY[cat] = (CAT_BASELINE_DAILY[cat] ?? 0) + v.baseDiaria * w
    }
  }

  // Referencia: el mes/año de "hoy" para calcular distancias
  const refYear = today.getFullYear()
  const refMonth = today.getMonth() + 1 // 1-based

  // ── Sales generation ──────────────────────────────────────────────────────
  for (let y = START_YEAR; y <= END_YEAR; y++) {
    for (let m = 1; m <= 12; m++) {
      // Distancia en meses desde la fecha de referencia (negativo = pasado, positivo = futuro)
      const monthsFromRef = (y - refYear) * 12 + (m - refMonth)

      const daysInMonth = new Date(y, m, 0).getDate()
      const seasonal = ESTACIONAL[m]

      // Factor de crecimiento anual: 3% menos por año antes de 2026, 5% más por año después
      const yearDiff = y - 2026
      const growthFactor = yearDiff < 0 ? 1 + yearDiff * 0.03 : 1 + yearDiff * 0.05

      // Snacks colapso: solo en el mes actual (monthsFromRef === 0)
      const snacksCollapso = monthsFromRef === 0

      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(y, m - 1, day)
        if (date.getDay() === 0) continue  // skip Sundays

        for (const vendor of VENDORS) {
          const t = tendencia(vendor.nombre, monthsFromRef, m, TOTAL_MONTHS)
          const nTrans = Math.max(1, Math.round(vendor.baseDiaria * seasonal * t * growthFactor * rb(0.7, 1.3)))

          // Active clients: CLI001 + CLI011 dormidos last 2 months (Carlos)
          let activeClients = vendor.clients
          if (vendor.nombre === 'Carlos Ramírez' && monthsFromRef >= -1 && monthsFromRef <= 0) {
            activeClients = vendor.clients.filter(c => c.codigo !== 'CLI001' && c.codigo !== 'CLI011')
            if (activeClients.length === 0) continue
          }

          const cCodes = activeClients.map(c => c.codigo)
          const cWeights = activeClients.map(c => c.w)

          // Category weights, adjusted for Snacks colapso
          let catW = { ...vendor.catWeights }
          if (snacksCollapso && catW.Snacks) {
            catW = { ...catW, Snacks: 0.05 }
          }
          const cats = Object.keys(catW)
          const catWvals = cats.map(k => catW[k])

          for (let tx = 0; tx < nTrans; tx++) {
            const cat = pickWeighted(cats, catWvals)

            // SNA003/004/005 frozen last 6 months → sin_movimiento
            let prodPool: Prod[]
            if (cat === 'Snacks') {
              prodPool = (monthsFromRef >= -5 && monthsFromRef <= 0) ? SNACKS_ACTIVOS : BY_CAT['Snacks']
              if (prodPool.length === 0) continue
            } else {
              prodPool = BY_CAT[cat]
            }
            const prod = pickRandom(prodPool)

            const clientCode = pickWeighted(cCodes, cWeights)
            const cliente = CLI_MAP[clientCode]

            // 5% devoluciones (unidades negativas)
            const esDevolucion = rng() < 0.05
            const unidades = esDevolucion
              ? -(Math.ceil(rng() * 5))
              : Math.ceil(rng() * 14) + 1

            const venta_neta = Math.round(unidades * prod.precio * rb(0.92, 1.08) * 100) / 100

            allSales.push({
              fecha: date,
              vendedor: vendor.nombre,
              producto: prod.nombre,
              cliente: cliente.nombre,
              unidades,
              venta_neta,
              categoria: prod.cat,
              canal: cliente.canal,
              departamento: cliente.dpto,
              supervisor: vendor.supervisor,
            })
          }
        }
      }
    }
  }

  // ── Filtrar ventas: solo hasta hoy ─────────────────────────────────────────
  const sales = allSales.filter(s => s.fecha <= today)

  // Poblar clientKey derivado — paridad con ruta parser de Excel.
  // Ahora solo desde cliente nombre (codigo_cliente eliminado del schema).
  for (const s of sales) {
    const nombre = typeof s.cliente === 'string' ? s.cliente.trim() : ''
    s.clientKey = nombre !== '' ? nombre.toUpperCase() : null
  }

  // ── METAS (Ene 2024 – Dic 2028, sin filtrar — metas futuras son válidas) ──
  const metas: MetaRecord[] = []

  for (let y = START_YEAR; y <= END_YEAR; y++) {
    for (let m = 1; m <= 12; m++) {
      const seasonal = ESTACIONAL[m]
      const yearDiff = y - 2026
      const growthFactor = yearDiff < 0 ? 1 + yearDiff * 0.03 : 1 + yearDiff * 0.05

      // Por vendedor
      for (const vendor of VENDORS) {
        const meta = Math.round(vendor.baseDiaria * 8 * 26 * seasonal * 0.95 * growthFactor)
        const metaUsd = Math.round(meta * 1.15)
        metas.push({ mes: m, anio: y, vendedor: vendor.nombre, meta, meta_uds: meta, meta_usd: metaUsd, tipo_meta: 'unidades' })
      }
      // [fix-1.1] Metas agregadas puras (supervisor / categoría sin vendedor) eliminadas:
      // analysis.ts las excluye y MetasPage Histórico EQUIPO las sumaba al denominador,
      // produciendo cumplimiento de equipo ~27% vs individuales 49–210%. Las dimensiones
      // supervisor/categoría se cubren por las metas multi-dim (vendedor+canal,
      // vendedor+categoría, vendedor+cliente+canal) generadas más abajo.

      // Multi-dim metas (Sprint visibility): metas con 2-3 dimensiones para
      // que meta_gap_combo tenga combinaciones reales que evaluar y crossCount
      // del candidato sea ≥ 2 (necesario para Z.11 regla B/C). Solo para
      // current year ± 1 para no inflar el dataset.
      const isFocusYear = y >= 2025 && y <= 2027
      if (isFocusYear) {
        for (const vendor of VENDORS) {
          const vendorMeta = Math.round(vendor.baseDiaria * 8 * 26 * seasonal * 0.95 * growthFactor)

          // 2-dim: vendedor + canal — distribuye la meta del vendor entre los
          // canales donde realmente atiende clientes.
          const channelDist: Record<string, number> = {}
          let totalW = 0
          for (const c of vendor.clients) {
            const cliente = CLIENTES.find(x => x.codigo === c.codigo)
            if (!cliente) continue
            channelDist[cliente.canal] = (channelDist[cliente.canal] ?? 0) + c.w
            totalW += c.w
          }
          for (const [canal, w] of Object.entries(channelDist)) {
            const share = totalW > 0 ? w / totalW : 0
            const meta = Math.round(vendorMeta * share)
            if (meta < 30) continue   // skip metas triviales
            const metaUsd = Math.round(meta * 1.15)
            metas.push({
              mes: m, anio: y,
              vendedor: vendor.nombre, canal,
              meta, meta_uds: meta, meta_usd: metaUsd, tipo_meta: 'unidades',
            })
          }

          // 2-dim: vendedor + categoría principal (top categoría del vendor).
          const topCat = Object.entries(vendor.catWeights)
            .sort((a, b) => b[1] - a[1])[0]
          if (topCat) {
            const [cat, w] = topCat
            const meta = Math.round(vendorMeta * w)
            if (meta >= 30) {
              metas.push({
                mes: m, anio: y,
                vendedor: vendor.nombre, categoria: cat,
                meta, meta_uds: meta, meta_usd: Math.round(meta * 1.15),
                tipo_meta: 'unidades',
              })
            }
          }

          // 3-dim: vendedor + cliente top + canal — el cliente más pesado del vendor.
          const topClient = [...vendor.clients].sort((a, b) => b.w - a.w)[0]
          if (topClient) {
            const cliente = CLIENTES.find(c => c.codigo === topClient.codigo)
            if (cliente) {
              const share = totalW > 0 ? topClient.w / totalW : 0
              const meta = Math.round(vendorMeta * share)
              if (meta >= 50) {
                metas.push({
                  mes: m, anio: y,
                  vendedor: vendor.nombre,
                  cliente: cliente.nombre,
                  canal: cliente.canal,
                  meta, meta_uds: meta, meta_usd: Math.round(meta * 1.15),
                  tipo_meta: 'unidades',
                })
              }
            }
          }
        }
      }
    }
  }

  // ── INVENTARIO ────────────────────────────────────────────────────────────
  // Stock calibrado contra PM3 estimado por producto (unidades = round(pm3 * días / 30)):
  //   riesgo_quiebre  (≤7d):   LAC003 ~5d, REF005 ~5d
  //   baja_cobertura  (8-20d): LAC002 ~13d, REF003 ~13d, REF004 ~15d, LIM003 ~14d
  //   normal          (21-60d): LAC001 ~35d, LAC004 ~28d, REF001 ~40d, REF002 ~30d, LIM001 ~45d, LIM002 ~32d
  //   lento_movimiento (>60d): LAC005 ~90d, SNA001 ~90d, SNA002 ~75d, LIM004 ~80d, LIM005 ~100d
  //   sin_movimiento  (PM3=0): SNA003/004/005 – sin ventas últimos 6 meses (agoMonths ≤ 5)
  // [schema-cleanup] inventory snapshots ahora llevan fecha (fecha de corte).
  // El demo usa la fecha "today" del generador (hora actual del sistema al momento
  // de runtime).
  const inventoryDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const inventory: InventoryItem[] = [
    { fecha: inventoryDate, producto: 'Leche Entera 1L',       categoria: 'Lácteos',   unidades: 1870 },
    { fecha: inventoryDate, producto: 'Yogurt Natural 500g',   categoria: 'Lácteos',   unidades:  690 },
    { fecha: inventoryDate, producto: 'Queso Fresco 400g',     categoria: 'Lácteos',   unidades:  270 },
    { fecha: inventoryDate, producto: 'Crema Ácida 250g',      categoria: 'Lácteos',   unidades: 1490 },
    { fecha: inventoryDate, producto: 'Mantequilla 225g',      categoria: 'Lácteos',   unidades: 4800 },
    { fecha: inventoryDate, producto: 'Coca Cola 600ml',       categoria: 'Refrescos', unidades: 2670 },
    { fecha: inventoryDate, producto: 'Pepsi 600ml',           categoria: 'Refrescos', unidades: 2000 },
    { fecha: inventoryDate, producto: 'Agua Pura 500ml',       categoria: 'Refrescos', unidades:  870 },
    { fecha: inventoryDate, producto: 'Jugo Naranja 1L',       categoria: 'Refrescos', unidades: 1000 },
    { fecha: inventoryDate, producto: 'Té Helado 500ml',       categoria: 'Refrescos', unidades:  330 },
    { fecha: inventoryDate, producto: 'Papas Fritas 150g',     categoria: 'Snacks',    unidades: 5220 },
    { fecha: inventoryDate, producto: 'Galletas Soda 200g',    categoria: 'Snacks',    unidades: 4350 },
    { fecha: inventoryDate, producto: 'Cacahuates 100g',       categoria: 'Snacks',    unidades:   35 },
    { fecha: inventoryDate, producto: 'Palomitas 80g',         categoria: 'Snacks',    unidades:   28 },
    { fecha: inventoryDate, producto: 'Chicharrón 120g',       categoria: 'Snacks',    unidades:   22 },
    { fecha: inventoryDate, producto: 'Detergente 1kg',        categoria: 'Limpieza',  unidades: 1880 },
    { fecha: inventoryDate, producto: 'Jabón Lavaplatos 500g', categoria: 'Limpieza',  unidades: 1330 },
    { fecha: inventoryDate, producto: 'Suavizante 1L',         categoria: 'Limpieza',  unidades:  580 },
    { fecha: inventoryDate, producto: 'Cloro 1L',              categoria: 'Limpieza',  unidades: 3330 },
    { fecha: inventoryDate, producto: 'Desinfectante 750ml',   categoria: 'Limpieza',  unidades: 4170 },
  ]

  // [PR-M1-fix] telemetría de ingesta (demo) — fuente única con parser Excel
  emitIngestSummary(sales)

  return { sales, metas, inventory }
}

export const DEMO_EMPRESA = 'Los Pinos S.A.'
export const DEMO_PERIODO = (() => {
  const t = new Date()
  return { year: t.getFullYear(), month: t.getMonth() } // 0-indexed month, matches last filtered sale date
})()
