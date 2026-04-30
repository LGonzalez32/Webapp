import { describe, it, expect } from 'vitest'
import { computeRangeYoY } from '../../src/lib/analysis'
import { buildDefaultYtdRange, buildComparisonRangeYoY } from '../../src/lib/periods'
import type { SaleRecord } from '../../src/types'

function mk(year: number, month: number, day: number, unidades = 10, venta_neta?: number): SaleRecord {
  return {
    fecha: new Date(year, month, day, 12, 0, 0, 0),
    vendedor: 'V',
    cliente: 'C',
    producto: 'P',
    unidades,
    venta_neta: venta_neta ?? unidades,
  } as SaleRecord
}

// Dataset bi-anual con días específicos para validar same-day cutoff.
const SALES: SaleRecord[] = [
  // 2025: cubre todos los meses con datos predecibles
  mk(2025, 0, 5, 100), mk(2025, 0, 20, 100),       // ene-2025: 200
  mk(2025, 1, 5, 100), mk(2025, 1, 20, 100),       // feb-2025: 200
  mk(2025, 2, 5, 100), mk(2025, 2, 28, 100),       // mar-2025: 200
  mk(2025, 3, 5, 100), mk(2025, 3, 20, 100),       // abr-2025: 200
  mk(2025, 4, 5, 100),                              // may-2025: 100
  mk(2025, 5, 5, 100),                              // jun-2025: 100
  // 2026: rango Ene–Abr
  mk(2026, 0, 5, 50),  mk(2026, 0, 20, 50),         // ene-2026: 100
  mk(2026, 1, 5, 50),  mk(2026, 1, 6, 50),          // feb-2026: 100 hasta día 6
  mk(2026, 1, 28, 50),                              // feb-2026: +50 día 28
  mk(2026, 2, 5, 50),                               // mar-2026: 50
  mk(2026, 3, 5, 50),                               // abr-2026: 50
]

describe('computeRangeYoY', () => {
  it('rango YTD (0..fechaRef.month) replica el comportamiento legacy de computeYTD', () => {
    // fechaRef = 20-abr-2026; rango (0, 3) = ene–abr 2026.
    const fechaRef = new Date(2026, 3, 20, 12, 0, 0, 0)
    const r = computeRangeYoY(SALES, fechaRef, 0, 3)

    // Esperado: salesActual ∈ [1-ene-2026, endOfDay(20-abr-2026)]
    // = ene 100 + feb 150 + mar 50 + abr 50 (día 5 ≤ 20) = 350
    expect(r.ytd_actual_uds).toBe(350)

    // YoY: mismo rango año anterior, clamp al día 20 en abril (último mes con
    // fechaRef dentro del rango calendario).
    // salesAnterior ∈ [1-ene-2025, endOfDay(20-abr-2025)]
    // = ene 200 + feb 200 + mar 200 + abr 200 (días 5 y 20 ambos ≤ 20) = 800
    expect(r.ytd_anterior_uds).toBe(800)

    // Validación adicional: el rango actual coincide con buildDefaultYtdRange.
    const legacyRange = buildDefaultYtdRange(fechaRef)
    const legacyAnt = buildComparisonRangeYoY(legacyRange)
    const legacySalesActual = SALES.filter(s => s.fecha >= legacyRange.start && s.fecha <= legacyRange.end)
    const legacySalesAnt = SALES.filter(s => s.fecha >= legacyAnt.start && s.fecha <= legacyAnt.end)
    const legacyActualUds = legacySalesActual.reduce((a, s) => a + s.unidades, 0)
    const legacyAntUds = legacySalesAnt.reduce((a, s) => a + s.unidades, 0)
    expect(r.ytd_actual_uds).toBe(legacyActualUds)
    expect(r.ytd_anterior_uds).toBe(legacyAntUds)
  })

  it('rango parcial multi-mes (mar–jun) acumula esos meses + YoY del mismo rango', () => {
    // fechaRef fuera del rango (futuro): rango calendario completo.
    // mar-jun 2026 hasta hoy: solo hay datos hasta abr-2026 → mar 50 + abr 50 = 100.
    // Pero fechaRef en jul-2026 está fuera → calendarEnd completo del rango.
    const fechaRef = new Date(2026, 6, 15) // jul-2026, fuera del rango mar–jun
    const r = computeRangeYoY(SALES, fechaRef, 2, 5)

    // salesActual mar–jun 2026: solo mar(50) + abr(50) (no hay datos may/jun en 2026)
    expect(r.ytd_actual_uds).toBe(100)

    // YoY mar–jun 2025: mar 200 + abr 200 + may 100 + jun 100 = 600
    expect(r.ytd_anterior_uds).toBe(600)
  })

  it('rango single-month (sep–sep) sin ventas retorna 0 con variacion null', () => {
    const fechaRef = new Date(2026, 9, 1) // oct, fuera de septiembre
    const r = computeRangeYoY(SALES, fechaRef, 8, 8)
    expect(r.ytd_actual_uds).toBe(0)
    expect(r.ytd_anterior_uds).toBe(0)
    expect(r.variacion_ytd_uds_pct).toBeNull()
  })

  it('rango que incluye el mes de fechaRef aplica cutoff same-day en monthEnd YoY', () => {
    // fechaRef = 6-feb-2026. Rango (0, 1) = ene–feb 2026 hasta día 6.
    const fechaRef = new Date(2026, 1, 6, 12, 0, 0, 0)
    const r = computeRangeYoY(SALES, fechaRef, 0, 1)

    // salesActual: ene-2026 completo (100) + feb hasta día 6 (50+50=100) = 200.
    expect(r.ytd_actual_uds).toBe(200)

    // YoY: ene–feb 2025 con cutoff day 6 en feb: ene completo (200) + feb día 5 (100) = 300.
    // (feb-2025 día 20 NO entra: 20 > 6).
    expect(r.ytd_anterior_uds).toBe(300)
  })

  it('monthStart > monthEnd lanza error consistente con salesInRange/buildMonthlyRange', () => {
    const fechaRef = new Date(2026, 3, 20)
    expect(() => computeRangeYoY(SALES, fechaRef, 5, 2)).toThrow(/monthEnd.*monthStart/)
  })

  it('variacion_*_pct retorna null cuando el denominador YoY es 0', () => {
    // Set sin datos en 2025 para el rango pedido.
    const fechaRef = new Date(2026, 8, 15) // sep-2026
    const onlyCurrent: SaleRecord[] = [mk(2026, 8, 1, 50)] // solo sep-2026
    const r = computeRangeYoY(onlyCurrent, fechaRef, 8, 8)
    expect(r.ytd_actual_uds).toBe(50)
    expect(r.ytd_anterior_uds).toBe(0)
    expect(r.variacion_ytd_uds_pct).toBeNull()
  })
})
