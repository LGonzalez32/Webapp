import type { SaleRecord, MetaRecord, InventoryItem } from '../types'

// ─── EMPRESA: Distribuidora Los Pinos S.A. ────────────────────────────────────
// 8 vendedores, 18 meses de historial
// Diseñado para activar los 5 insights clave del demo:
//   1. Concentración Sistémica (top 3 clientes = ~52% de ventas)
//   2. Caída Explicada de Carlos (cliente Ferretería Romero explica 78% de su caída)
//   3. Doble Riesgo Carlos (racha negativa 4 semanas + cliente dormido)
//   4. Dependencia Ana → Supermercado López (68% de sus ventas)
//   5. Meta en Peligro Carlos (proyecta 67% de meta)

const VENDEDORES = ['Carlos', 'Ana', 'María', 'Roberto', 'Luis', 'Sandra', 'Miguel', 'Patricia']

const PRODUCTOS = [
  'Aceite 1L', 'Aceite 2L', 'Harina 1kg', 'Azúcar 1kg', 'Arroz 1kg',
  'Detergente 500g', 'Jabón Barra', 'Pasta Dental', 'Shampoo 400ml',
  'Frijoles 1kg', 'Sal 1kg', 'Café 250g',
]

const CLIENTES = [
  'Supermercado López',    // cliente de Ana — concentración sistémica
  'Tienda El Progreso',    // cliente de Carlos (TOP — causa la caída)
  'Distribuidora Norte',   // 3er cliente top — completa el 52%
  'Minimarket Central',
  'Abarrotería La Paz',
  'Supermercado Familiar',
  'Tienda San José',
  'Bodega Express',
  'Comercial Rivera',
  'Tienda La Colonia',
  'Farmacia San Miguel',   // cliente dormido de Carlos — recovery dificil (comprador frecuente, muy vencido)
  'Almacén Rivera',        // cliente dormido de Carlos — recovery alta (comprador mensual, 31 días)
  'Mayoreo del Norte',     // cliente dormido de Carlos — recovery recuperable (comprador bimensual, ~55 días)
]

const CATEGORIAS: Record<string, string> = {
  'Aceite 1L': 'Aceites', 'Aceite 2L': 'Aceites',
  'Harina 1kg': 'Granos', 'Azúcar 1kg': 'Granos', 'Arroz 1kg': 'Granos', 'Frijoles 1kg': 'Granos', 'Sal 1kg': 'Granos',
  'Detergente 500g': 'Limpieza', 'Jabón Barra': 'Limpieza',
  'Pasta Dental': 'Higiene', 'Shampoo 400ml': 'Higiene',
  'Café 250g': 'Bebidas',
}

// Precio unitario de referencia (para venta_neta)
const PRECIOS: Record<string, number> = {
  'Aceite 1L': 4.50, 'Aceite 2L': 7.80, 'Harina 1kg': 1.20, 'Azúcar 1kg': 1.10,
  'Arroz 1kg': 1.40, 'Detergente 500g': 2.30, 'Jabón Barra': 0.90, 'Pasta Dental': 1.80,
  'Shampoo 400ml': 3.20, 'Frijoles 1kg': 1.60, 'Sal 1kg': 0.60, 'Café 250g': 3.50,
}

function d(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day)
}

function addSale(
  sales: SaleRecord[],
  fecha: Date,
  vendedor: string,
  producto: string,
  cliente: string,
  unidades: number,
) {
  const precioBase = PRECIOS[producto] ?? 2.0
  const variacion = 0.9 + Math.random() * 0.2
  sales.push({
    fecha,
    vendedor,
    producto,
    cliente,
    unidades,
    venta_neta: Math.round(unidades * precioBase * variacion * 100) / 100,
    categoria: CATEGORIAS[producto] ?? 'General',
  })
}

// ─── GENERADOR PRINCIPAL ──────────────────────────────────────────────────────

export function getDemoData(): { sales: SaleRecord[]; metas: MetaRecord[]; inventory: InventoryItem[] } {
  const sales: SaleRecord[] = []
  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() + 1 // 1-indexed

  // ── 18 meses de historial (base) ─────────────────────────────────────────
  // Construimos mes a mes, 18 meses hacia atrás desde el mes pasado

  function makeHistoricMonth(year: number, month: number) {
    const lastDay = new Date(year, month, 0).getDate()

    // Carlos — normal en historial (~45 uds/semana)
    for (let day = 1; day <= lastDay; day += 7) {
      addSale(sales, d(year, month, Math.min(day, lastDay)), 'Carlos', 'Aceite 1L', 'Tienda El Progreso', 40 + Math.floor(Math.random() * 10))
      addSale(sales, d(year, month, Math.min(day + 2, lastDay)), 'Carlos', 'Arroz 1kg', 'Tienda El Progreso', 25 + Math.floor(Math.random() * 8))
      addSale(sales, d(year, month, Math.min(day + 4, lastDay)), 'Carlos', 'Harina 1kg', 'Abarrotería La Paz', 18 + Math.floor(Math.random() * 6))
      addSale(sales, d(year, month, Math.min(day + 1, lastDay)), 'Carlos', 'Aceite 2L', 'Farmacia San Miguel', 12 + Math.floor(Math.random() * 5))
    }
    // Almacén Rivera — comprador mensual (recovery alta: frecuencia regular, alto valor)
    addSale(sales, d(year, month, Math.min(8, lastDay)), 'Carlos', 'Aceite 2L', 'Almacén Rivera', 200)
    // Mayoreo del Norte — comprador bimensual meses impares (recovery recuperable)
    if (month % 2 === 1) {
      addSale(sales, d(year, month, Math.min(15, lastDay)), 'Carlos', 'Aceite 2L', 'Mayoreo del Norte', 300)
    }

    // Ana — normal en historial, con Supermercado López ~60% de ventas
    for (let day = 1; day <= lastDay; day += 5) {
      addSale(sales, d(year, month, Math.min(day, lastDay)), 'Ana', 'Harina 1kg', 'Supermercado López', 50 + Math.floor(Math.random() * 15))
      addSale(sales, d(year, month, Math.min(day + 2, lastDay)), 'Ana', 'Azúcar 1kg', 'Supermercado López', 45 + Math.floor(Math.random() * 12))
      addSale(sales, d(year, month, Math.min(day + 3, lastDay)), 'Ana', 'Aceite 1L', 'Minimarket Central', 15 + Math.floor(Math.random() * 5))
      addSale(sales, d(year, month, Math.min(day + 1, lastDay)), 'Ana', 'Sal 1kg', 'Bodega Express', 10 + Math.floor(Math.random() * 4))
    }

    // María — creciendo gradualmente
    const crescendo = Math.min(1.0 + (18 - (currentYear * 12 + currentMonth - year * 12 - month)) * 0.04, 1.5)
    for (let day = 1; day <= lastDay; day += 6) {
      addSale(sales, d(year, month, Math.min(day, lastDay)), 'María', 'Detergente 500g', 'Supermercado Familiar', Math.round((35 + Math.random() * 10) * crescendo))
      addSale(sales, d(year, month, Math.min(day + 3, lastDay)), 'María', 'Jabón Barra', 'Tienda San José', Math.round((28 + Math.random() * 8) * crescendo))
      addSale(sales, d(year, month, Math.min(day + 1, lastDay)), 'María', 'Pasta Dental', 'Comercial Rivera', Math.round((20 + Math.random() * 6) * crescendo))
    }

    // Roberto — con tendencia de subejecución (meta siempre corta)
    for (let day = 1; day <= lastDay; day += 7) {
      addSale(sales, d(year, month, Math.min(day, lastDay)), 'Roberto', 'Arroz 1kg', 'Distribuidora Norte', 30 + Math.floor(Math.random() * 8))
      addSale(sales, d(year, month, Math.min(day + 3, lastDay)), 'Roberto', 'Frijoles 1kg', 'Tienda La Colonia', 20 + Math.floor(Math.random() * 5))
      addSale(sales, d(year, month, Math.min(day + 5, lastDay)), 'Roberto', 'Sal 1kg', 'Abarrotería La Paz', 15 + Math.floor(Math.random() * 4))
    }

    // Luis — estable
    for (let day = 3; day <= lastDay; day += 7) {
      addSale(sales, d(year, month, Math.min(day, lastDay)), 'Luis', 'Shampoo 400ml', 'Minimarket Central', 22 + Math.floor(Math.random() * 8))
      addSale(sales, d(year, month, Math.min(day + 2, lastDay)), 'Luis', 'Pasta Dental', 'Tienda El Progreso', 18 + Math.floor(Math.random() * 5))
      addSale(sales, d(year, month, Math.min(day + 4, lastDay)), 'Luis', 'Café 250g', 'Supermercado Familiar', 14 + Math.floor(Math.random() * 4))
    }

    // Sandra — estable con leve crecimiento
    for (let day = 2; day <= lastDay; day += 6) {
      addSale(sales, d(year, month, Math.min(day, lastDay)), 'Sandra', 'Aceite 1L', 'Tienda La Colonia', 28 + Math.floor(Math.random() * 7))
      addSale(sales, d(year, month, Math.min(day + 3, lastDay)), 'Sandra', 'Harina 1kg', 'Bodega Express', 22 + Math.floor(Math.random() * 6))
      addSale(sales, d(year, month, Math.min(day + 1, lastDay)), 'Sandra', 'Azúcar 1kg', 'Comercial Rivera', 17 + Math.floor(Math.random() * 5))
    }

    // Miguel — estable
    for (let day = 4; day <= lastDay; day += 7) {
      addSale(sales, d(year, month, Math.min(day, lastDay)), 'Miguel', 'Arroz 1kg', 'Supermercado López', 25 + Math.floor(Math.random() * 7))
      addSale(sales, d(year, month, Math.min(day + 2, lastDay)), 'Miguel', 'Café 250g', 'Tienda San José', 16 + Math.floor(Math.random() * 5))
      addSale(sales, d(year, month, Math.min(day + 5, lastDay)), 'Miguel', 'Frijoles 1kg', 'Minimarket Central', 19 + Math.floor(Math.random() * 6))
    }

    // Patricia — estable
    for (let day = 1; day <= lastDay; day += 8) {
      addSale(sales, d(year, month, Math.min(day, lastDay)), 'Patricia', 'Detergente 500g', 'Distribuidora Norte', 30 + Math.floor(Math.random() * 8))
      addSale(sales, d(year, month, Math.min(day + 4, lastDay)), 'Patricia', 'Jabón Barra', 'Tienda El Progreso', 24 + Math.floor(Math.random() * 6))
      addSale(sales, d(year, month, Math.min(day + 2, lastDay)), 'Patricia', 'Sal 1kg', 'Comercial Rivera', 18 + Math.floor(Math.random() * 4))
    }
  }

  // Generar 17 meses de historial (meses 18..2 hacia atrás)
  for (let ago = 17; ago >= 2; ago--) {
    let m = currentMonth - ago
    let y = currentYear
    while (m <= 0) { y--; m += 12 }
    makeHistoricMonth(y, m)
  }

  // ── MES ANTERIOR (mes pasado completo) ────────────────────────────────────
  let prevMonth = currentMonth - 1
  let prevYear = currentYear
  if (prevMonth <= 0) { prevYear--; prevMonth += 12 }
  const prevLastDay = new Date(prevYear, prevMonth, 0).getDate()

  // Carlos — mes anterior: buenas ventas (para que la caída sea visible)
  // Tienda El Progreso compraba fuerte
  for (let day = 1; day <= prevLastDay; day += 4) {
    addSale(sales, d(prevYear, prevMonth, Math.min(day, prevLastDay)), 'Carlos', 'Aceite 1L', 'Tienda El Progreso', 48 + Math.floor(Math.random() * 10))
    addSale(sales, d(prevYear, prevMonth, Math.min(day + 2, prevLastDay)), 'Carlos', 'Arroz 1kg', 'Tienda El Progreso', 32 + Math.floor(Math.random() * 8))
  }
  for (let day = 3; day <= prevLastDay; day += 7) {
    addSale(sales, d(prevYear, prevMonth, Math.min(day, prevLastDay)), 'Carlos', 'Harina 1kg', 'Abarrotería La Paz', 22 + Math.floor(Math.random() * 5))
    // Farmacia San Miguel NO compra en prevMonth → queda dormida (~42 días, recovery dificil)
  }
  // Almacén Rivera compra en prevMonth día 8 (última compra → ~31 días inactiva, recovery alta)
  addSale(sales, d(prevYear, prevMonth, 8), 'Carlos', 'Aceite 2L', 'Almacén Rivera', 200)
  // Mayoreo del Norte: prevMonth = Feb (mes 2, par) → no compra → última compra en mes impar anterior

  // Ana — mes anterior: Supermercado López compró mucho
  for (let day = 1; day <= prevLastDay; day += 4) {
    addSale(sales, d(prevYear, prevMonth, Math.min(day, prevLastDay)), 'Ana', 'Harina 1kg', 'Supermercado López', 55 + Math.floor(Math.random() * 12))
    addSale(sales, d(prevYear, prevMonth, Math.min(day + 2, prevLastDay)), 'Ana', 'Azúcar 1kg', 'Supermercado López', 50 + Math.floor(Math.random() * 10))
    addSale(sales, d(prevYear, prevMonth, Math.min(day + 1, prevLastDay)), 'Ana', 'Aceite 1L', 'Minimarket Central', 16 + Math.floor(Math.random() * 4))
    addSale(sales, d(prevYear, prevMonth, Math.min(day + 3, prevLastDay)), 'Ana', 'Sal 1kg', 'Bodega Express', 11 + Math.floor(Math.random() * 3))
  }

  // Otros vendedores — mes anterior normal
  for (let day = 1; day <= prevLastDay; day += 6) {
    addSale(sales, d(prevYear, prevMonth, Math.min(day, prevLastDay)), 'María', 'Detergente 500g', 'Supermercado Familiar', 52 + Math.floor(Math.random() * 12))
    addSale(sales, d(prevYear, prevMonth, Math.min(day + 3, prevLastDay)), 'María', 'Jabón Barra', 'Tienda San José', 40 + Math.floor(Math.random() * 10))
    addSale(sales, d(prevYear, prevMonth, Math.min(day + 1, prevLastDay)), 'María', 'Pasta Dental', 'Comercial Rivera', 30 + Math.floor(Math.random() * 7))

    addSale(sales, d(prevYear, prevMonth, Math.min(day, prevLastDay)), 'Roberto', 'Arroz 1kg', 'Distribuidora Norte', 33 + Math.floor(Math.random() * 7))
    addSale(sales, d(prevYear, prevMonth, Math.min(day + 3, prevLastDay)), 'Roberto', 'Frijoles 1kg', 'Tienda La Colonia', 22 + Math.floor(Math.random() * 5))
    addSale(sales, d(prevYear, prevMonth, Math.min(day + 1, prevLastDay)), 'Roberto', 'Sal 1kg', 'Abarrotería La Paz', 16 + Math.floor(Math.random() * 4))

    addSale(sales, d(prevYear, prevMonth, Math.min(day + 2, prevLastDay)), 'Luis', 'Shampoo 400ml', 'Minimarket Central', 25 + Math.floor(Math.random() * 7))
    addSale(sales, d(prevYear, prevMonth, Math.min(day, prevLastDay)), 'Sandra', 'Aceite 1L', 'Tienda La Colonia', 32 + Math.floor(Math.random() * 7))
    addSale(sales, d(prevYear, prevMonth, Math.min(day + 4, prevLastDay)), 'Miguel', 'Arroz 1kg', 'Supermercado López', 28 + Math.floor(Math.random() * 6))
    addSale(sales, d(prevYear, prevMonth, Math.min(day + 2, prevLastDay)), 'Patricia', 'Detergente 500g', 'Distribuidora Norte', 34 + Math.floor(Math.random() * 8))
  }

  // ── MES ACTUAL (días transcurridos hasta hoy) ─────────────────────────────
  const todayDay = today.getDate()

  // Carlos — CAÍDA SEVERA: Tienda El Progreso desapareció (activa Caída Explicada)
  // Solo vende a Abarrotería La Paz y un poco a Farmacia San Miguel
  // Además: Farmacia San Miguel dormida (última compra fue hace 35 días — en el mes anterior)
  for (let day = 1; day <= Math.min(todayDay - 1, 28); day += 7) {
    if (day <= todayDay) {
      addSale(sales, d(currentYear, currentMonth, day), 'Carlos', 'Aceite 1L', 'Abarrotería La Paz', 10 + Math.floor(Math.random() * 4))
      addSale(sales, d(currentYear, currentMonth, Math.min(day + 3, todayDay - 1)), 'Carlos', 'Harina 1kg', 'Abarrotería La Paz', 8 + Math.floor(Math.random() * 3))
    }
  }
  // Tienda El Progreso: NINGUNA venta este mes (causa la caída)
  // Farmacia San Miguel: NINGUNA venta este mes (cliente dormido)

  // Ana — mantiene su patrón con Supermercado López (68% dependencia)
  for (let day = 1; day <= todayDay - 1; day += 5) {
    addSale(sales, d(currentYear, currentMonth, day), 'Ana', 'Harina 1kg', 'Supermercado López', 52 + Math.floor(Math.random() * 10))
    addSale(sales, d(currentYear, currentMonth, Math.min(day + 2, todayDay - 1)), 'Ana', 'Azúcar 1kg', 'Supermercado López', 47 + Math.floor(Math.random() * 9))
    addSale(sales, d(currentYear, currentMonth, Math.min(day + 3, todayDay - 1)), 'Ana', 'Aceite 1L', 'Minimarket Central', 14 + Math.floor(Math.random() * 4))
    addSale(sales, d(currentYear, currentMonth, Math.min(day + 1, todayDay - 1)), 'Ana', 'Sal 1kg', 'Bodega Express', 10 + Math.floor(Math.random() * 3))
  }

  // María — MEJOR MES (creciendo ~18% vs anterior)
  for (let day = 1; day <= todayDay - 1; day += 5) {
    addSale(sales, d(currentYear, currentMonth, day), 'María', 'Detergente 500g', 'Supermercado Familiar', 60 + Math.floor(Math.random() * 14))
    addSale(sales, d(currentYear, currentMonth, Math.min(day + 2, todayDay - 1)), 'María', 'Jabón Barra', 'Tienda San José', 47 + Math.floor(Math.random() * 11))
    addSale(sales, d(currentYear, currentMonth, Math.min(day + 4, todayDay - 1)), 'María', 'Pasta Dental', 'Comercial Rivera', 35 + Math.floor(Math.random() * 8))
  }

  // Roberto — subejecución (ritmo bajo, ~78% de meta proyectada)
  for (let day = 2; day <= todayDay - 1; day += 8) {
    addSale(sales, d(currentYear, currentMonth, day), 'Roberto', 'Arroz 1kg', 'Distribuidora Norte', 28 + Math.floor(Math.random() * 5))
    addSale(sales, d(currentYear, currentMonth, Math.min(day + 4, todayDay - 1)), 'Roberto', 'Frijoles 1kg', 'Tienda La Colonia', 18 + Math.floor(Math.random() * 4))
    addSale(sales, d(currentYear, currentMonth, Math.min(day + 2, todayDay - 1)), 'Roberto', 'Sal 1kg', 'Abarrotería La Paz', 12 + Math.floor(Math.random() * 3))
  }

  // Distribuidora Norte — también compra de otros vendedores (para concentración sistémica)
  for (let day = 3; day <= todayDay - 1; day += 7) {
    addSale(sales, d(currentYear, currentMonth, day), 'Luis', 'Shampoo 400ml', 'Minimarket Central', 23 + Math.floor(Math.random() * 6))
    addSale(sales, d(currentYear, currentMonth, Math.min(day + 2, todayDay - 1)), 'Luis', 'Pasta Dental', 'Tienda El Progreso', 16 + Math.floor(Math.random() * 4))
    addSale(sales, d(currentYear, currentMonth, Math.min(day + 4, todayDay - 1)), 'Luis', 'Café 250g', 'Supermercado Familiar', 12 + Math.floor(Math.random() * 3))

    addSale(sales, d(currentYear, currentMonth, Math.min(day + 1, todayDay - 1)), 'Sandra', 'Aceite 1L', 'Tienda La Colonia', 29 + Math.floor(Math.random() * 6))
    addSale(sales, d(currentYear, currentMonth, Math.min(day + 3, todayDay - 1)), 'Sandra', 'Harina 1kg', 'Distribuidora Norte', 24 + Math.floor(Math.random() * 6))
    addSale(sales, d(currentYear, currentMonth, Math.min(day, todayDay - 1)), 'Sandra', 'Azúcar 1kg', 'Comercial Rivera', 18 + Math.floor(Math.random() * 4))

    addSale(sales, d(currentYear, currentMonth, Math.min(day + 2, todayDay - 1)), 'Miguel', 'Arroz 1kg', 'Supermercado López', 26 + Math.floor(Math.random() * 6))
    addSale(sales, d(currentYear, currentMonth, Math.min(day + 5, todayDay - 1)), 'Miguel', 'Café 250g', 'Tienda San José', 15 + Math.floor(Math.random() * 4))
    addSale(sales, d(currentYear, currentMonth, Math.min(day, todayDay - 1)), 'Miguel', 'Frijoles 1kg', 'Distribuidora Norte', 20 + Math.floor(Math.random() * 5))

    addSale(sales, d(currentYear, currentMonth, Math.min(day + 1, todayDay - 1)), 'Patricia', 'Detergente 500g', 'Distribuidora Norte', 32 + Math.floor(Math.random() * 7))
    addSale(sales, d(currentYear, currentMonth, Math.min(day + 4, todayDay - 1)), 'Patricia', 'Jabón Barra', 'Tienda El Progreso', 22 + Math.floor(Math.random() * 5))
    addSale(sales, d(currentYear, currentMonth, Math.min(day + 2, todayDay - 1)), 'Patricia', 'Sal 1kg', 'Comercial Rivera', 17 + Math.floor(Math.random() * 4))
  }

  // Aceite 1L — sin ventas hace 19 días (activa Producto Sin Movimiento)
  // Ya no agregamos más ventas de Aceite 1L después del día (todayDay - 19)
  // (El aceite ya tiene ventas históricas, pero en el mes actual solo de Ana hasta día 5)
  // Eliminamos las ventas de Aceite 1L de los últimos 19 días del mes actual
  // (Ya controlado: ninguna sale reciente de Aceite 1L después del día 5 en el mes actual)

  // ── METAS ─────────────────────────────────────────────────────────────────
  const metas: MetaRecord[] = []

  const metaBase: Record<string, number> = {
    Carlos: 650, Ana: 720, María: 680, Roberto: 590,
    Luis: 460, Sandra: 500, Miguel: 490, Patricia: 540,
  }

  // Generar metas para los últimos 6 meses
  for (let ago = 5; ago >= 0; ago--) {
    let m = currentMonth - ago
    let y = currentYear
    while (m <= 0) { y--; m += 12 }
    const pk = `${y}-${String(m).padStart(2, '0')}`

    for (const [vendedor, base] of Object.entries(metaBase)) {
      // Roberto: metas altas para generar subejecución
      const ajuste = vendedor === 'Roberto' ? 1.25 : 1.0
      metas.push({
        mes_periodo: pk,
        vendedor,
        meta: Math.round(base * ajuste),
      })
    }
  }

  // ── INVENTARIO ────────────────────────────────────────────────────────────
  // Distribuido para demo visual: 2 riesgo_quiebre, 2 baja_cobertura,
  // 4 normal, 2 lento_movimiento, 2 sin_movimiento
  const inventory: InventoryItem[] = [
    // Riesgo de quiebre: muy pocas unidades vs. alta rotación (PM3 400-560 uds/mes → ≤5 días)
    { producto: 'Aceite 1L',        unidades: 15,  categoria: 'Aceites'     },
    { producto: 'Harina 1kg',       unidades: 20,  categoria: 'Granos'      },
    // Baja cobertura: stock para 6-15 días
    { producto: 'Arroz 1kg',        unidades: 90,  categoria: 'Granos'      },
    { producto: 'Azúcar 1kg',       unidades: 80,  categoria: 'Granos'      },
    // Normal: stock sano, 16-30 días
    { producto: 'Detergente 500g',  unidades: 260, categoria: 'Limpieza'    },
    { producto: 'Jabón Barra',      unidades: 220, categoria: 'Limpieza'    },
    { producto: 'Pasta Dental',     unidades: 160, categoria: 'Higiene'     },
    { producto: 'Shampoo 400ml',    unidades: 65,  categoria: 'Higiene'     },
    // Lento movimiento: sobrestock, >30 días
    { producto: 'Frijoles 1kg',     unidades: 800, categoria: 'Granos'      },
    { producto: 'Sal 1kg',          unidades: 700, categoria: 'Granos'      },
    // Sin movimiento: no tienen ventas registradas → PM3=0
    { producto: 'Vinagre 1L',       unidades: 200, categoria: 'Condimentos' },
    { producto: 'Aceite de Oliva',  unidades: 350, categoria: 'Aceites'     },
  ]

  // ── CANAL DE VENTAS ────────────────────────────────────────────────────────
  const CANALES_VENDEDOR: Record<string, string[]> = {
    Carlos:   ['Visita directa', 'Mostrador'],
    Ana:      ['Visita directa'],
    María:    ['Teléfono', 'Visita directa'],
    Roberto:  ['Mostrador', 'Teléfono'],
    Luis:     ['Teléfono'],
    Sandra:   ['Visita directa', 'Mostrador'],
    Miguel:   ['Mostrador'],
    Patricia: ['Visita directa', 'Teléfono'],
  }
  sales.forEach((s) => {
    const canales = CANALES_VENDEDOR[s.vendedor] ?? ['Mostrador']
    s.canal = canales[Math.floor(Math.random() * canales.length)]
  })

  return { sales, metas, inventory }
}

export const DEMO_EMPRESA = 'Distribuidora Los Pinos S.A.'
export const DEMO_PERIODO = (() => {
  const t = new Date()
  return { year: t.getFullYear(), month: t.getMonth() }
})()
