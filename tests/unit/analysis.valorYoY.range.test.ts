import { describe, it, expect } from 'vitest'
import { computeCommercialAnalysis } from '../../src/lib/analysis'
import type { SaleRecord, Configuracion } from '../../src/types'

// [Ticket 3.B.4] Tests del nuevo comportamiento de valor_yoy_usd:
// suma rango [monthStart..monthEnd] del año anterior con same-day cutoff
// en monthEnd cuando coincide con fechaRef.month.

function mk(year: number, month: number, day: number, cliente: string, vendedor: string, neta = 100): SaleRecord {
  return {
    fecha: new Date(year, month, day, 12, 0, 0, 0),
    vendedor,
    cliente,
    producto: 'P1',
    unidades: neta,
    venta_neta: neta,
  } as SaleRecord
}

const MIN_CONFIG = {
  moneda: '$',
  dias_dormido_threshold: 30,
  umbral_riesgo_quiebre: 7,
  umbral_baja_cobertura: 15,
  umbral_normal: 60,
} as unknown as Configuracion

// Cliente que está dormido en 2026 pero compró en cada mes de 2025.
// Año 2026: solo 1 venta vieja (ene-2026) → 67+ días sin actividad cuando fechaRef = abr.
// Año 2025: ventas en ene/feb/mar/abr, días 5 y 20 cada uno.
const SALES: SaleRecord[] = [
  // 2025 — historial para YoY (cliente activo el año pasado)
  mk(2025, 0, 5, 'C1', 'V1'), mk(2025, 0, 20, 'C1', 'V1'),  // ene-2025: 200
  mk(2025, 1, 5, 'C1', 'V1'), mk(2025, 1, 20, 'C1', 'V1'),  // feb-2025: 200
  mk(2025, 2, 5, 'C1', 'V1'), mk(2025, 2, 20, 'C1', 'V1'),  // mar-2025: 200
  mk(2025, 3, 5, 'C1', 'V1'), mk(2025, 3, 20, 'C1', 'V1'),  // abr-2025: 200
  // 2026 — última compra ene 5; resto inactivo. fechaRef se calcula desde otra venta.
  mk(2026, 0, 5, 'C1', 'V1'),                                // ene-2026: 100
  // Otro cliente activo en 2026 para que fechaRef llegue a abr-2026
  mk(2026, 3, 6, 'C2', 'V1'),                                // abr-2026 día 6 → fechaRef
]

describe('valor_yoy_usd rango-aware (3.B.4)', () => {
  it('rango default (sin monthStart/monthEnd) suma YTD canónico = ene–abr 2025 hasta día 6 (same-day)', () => {
    // sp sin monthStart/monthEnd → fallback a alias legacy: monthEnd=month=3 (abr)
    const sp = { year: 2026, month: 3 }
    const result = computeCommercialAnalysis(SALES, [], [], sp, MIN_CONFIG)
    const c1 = result.clientesDormidos.find(d => d.cliente === 'C1')
    expect(c1).toBeDefined()
    // Range [0..3] de 2025, cutoff abr día 6 (=fechaRef.day):
    // ene full (200) + feb full (200) + mar full (200) + abr día 5 (100) = 700
    // (abr día 20 NO entra: 20 > 6).
    expect(c1!.valor_yoy_usd).toBe(700)
  })

  it('rango single-month feb–feb suma solo feb 2025 completo', () => {
    const sp = { year: 2026, month: 1, monthStart: 1, monthEnd: 1 }
    const result = computeCommercialAnalysis(SALES, [], [], sp, MIN_CONFIG)
    const c1 = result.clientesDormidos.find(d => d.cliente === 'C1')
    expect(c1).toBeDefined()
    // monthEnd=1 ≠ fechaRef.month=3 → sin cutoff → feb-2025 completo = 200
    expect(c1!.valor_yoy_usd).toBe(200)
  })

  it('rango multi-mes feb–abr aplica cutoff same-day SOLO en abr (mes de fechaRef)', () => {
    const sp = { year: 2026, month: 3, monthStart: 1, monthEnd: 3 }
    const result = computeCommercialAnalysis(SALES, [], [], sp, MIN_CONFIG)
    const c1 = result.clientesDormidos.find(d => d.cliente === 'C1')
    expect(c1).toBeDefined()
    // feb full (200) + mar full (200) + abr día 5 (100, día 20 excluido) = 500
    expect(c1!.valor_yoy_usd).toBe(500)
  })
})
