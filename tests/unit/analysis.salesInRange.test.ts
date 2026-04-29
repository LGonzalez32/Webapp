import { describe, it, expect } from 'vitest'
import { salesInRange, salesInPeriod, salesInRangeYoYSameDay } from '../../src/lib/analysis'
import type { SaleRecord } from '../../src/types'

function mk(year: number, month: number, day: number, unidades = 10): SaleRecord {
  return {
    fecha: new Date(year, month, day, 12, 0, 0, 0),
    vendedor: 'V',
    cliente: 'C',
    producto: 'P',
    unidades,
    venta_neta: unidades,
  } as SaleRecord
}

const SALES: SaleRecord[] = [
  mk(2025, 11, 31), // dic-2025
  mk(2026, 0, 5),   // ene-2026
  mk(2026, 1, 14),  // feb-2026
  mk(2026, 2, 1),   // mar-2026
  mk(2026, 2, 31),  // mar-2026 último día
  mk(2026, 3, 15),  // abr-2026
  mk(2026, 4, 1),   // may-2026
  mk(2027, 0, 1),   // ene-2027
]

describe('salesInRange', () => {
  it('rango de un mes equivale a salesInPeriod (wrapper)', () => {
    const a = salesInRange(SALES, 2026, 1, 1)
    const b = salesInPeriod(SALES, 2026, 1)
    expect(a).toEqual(b)
    expect(a.length).toBe(1)
  })

  it('rango multi-mes incluye ventas de los meses intermedios', () => {
    const r = salesInRange(SALES, 2026, 1, 3) // feb-mar-abr
    expect(r.length).toBe(4) // feb(1) + mar(2) + abr(1)
    expect(r.every((s) => s.fecha.getFullYear() === 2026)).toBe(true)
    expect(r.every((s) => s.fecha.getMonth() >= 1 && s.fecha.getMonth() <= 3)).toBe(true)
  })

  it('excluye ventas del mismo año fuera del rango', () => {
    const r = salesInRange(SALES, 2026, 2, 2) // solo marzo
    expect(r.length).toBe(2)
    expect(r.every((s) => s.fecha.getMonth() === 2)).toBe(true)
  })

  it('excluye ventas de otros años', () => {
    const r = salesInRange(SALES, 2026, 0, 11) // todo 2026
    expect(r.length).toBe(6)
    expect(r.every((s) => s.fecha.getFullYear() === 2026)).toBe(true)
  })

  it('monthStart > monthEnd lanza error (mirror de periods.ts)', () => {
    expect(() => salesInRange(SALES, 2026, 5, 2)).toThrow(/monthEnd.*monthStart/)
  })

  it('salesInPeriod sigue funcionando idéntico post-refactor', () => {
    const r = salesInPeriod(SALES, 2026, 2)
    expect(r.length).toBe(2)
    expect(r.every((s) => s.fecha.getMonth() === 2 && s.fecha.getFullYear() === 2026)).toBe(true)
  })
})

// Dataset YoY: año anterior poblado (2025) para probar salesInRangeYoYSameDay
const YOY_SALES: SaleRecord[] = [
  // 2025: feb completo
  mk(2025, 1, 5),
  mk(2025, 1, 28),
  // 2025: marzo completo
  mk(2025, 2, 1),
  mk(2025, 2, 31),
  // 2025: abril días 10, 15, 20
  mk(2025, 3, 10),
  mk(2025, 3, 15),
  mk(2025, 3, 20),
  // 2025: mayo (no debe aparecer si rango termina en abril)
  mk(2025, 4, 1),
  // 2026: irrelevante para la función (siempre filtra year-1)
  mk(2026, 3, 15),
]

describe('salesInRangeYoYSameDay', () => {
  it('rango de un mes con cutoff equivale a salesInPeriod year-1 + filtro día', () => {
    // year=2026, monthStart=monthEnd=3 (abr), maxDay=15 → abr-2025 hasta día 15
    const r = salesInRangeYoYSameDay(YOY_SALES, 2026, 3, 3, 15)
    expect(r.length).toBe(2) // abr-10, abr-15
    expect(r.every((s) => s.fecha.getFullYear() === 2025 && s.fecha.getMonth() === 3 && s.fecha.getDate() <= 15)).toBe(true)
  })

  it('rango multi-mes: meses intermedios completos + último mes truncado', () => {
    // year=2026, monthStart=1 feb, monthEnd=3 abr, maxDay=15
    const r = salesInRangeYoYSameDay(YOY_SALES, 2026, 1, 3, 15)
    // feb completo (2) + mar completo (2) + abr cutoff día 15 (2) = 6
    expect(r.length).toBe(6)
    const months = r.map(s => s.fecha.getMonth()).sort()
    expect(months).toEqual([1, 1, 2, 2, 3, 3])
    // ningún registro de abr > día 15
    expect(r.every(s => !(s.fecha.getMonth() === 3 && s.fecha.getDate() > 15))).toBe(true)
    // ningún registro de mayo
    expect(r.every(s => s.fecha.getMonth() !== 4)).toBe(true)
  })

  it('maxDay <= 0 retorna []', () => {
    expect(salesInRangeYoYSameDay(YOY_SALES, 2026, 1, 3, 0)).toEqual([])
    expect(salesInRangeYoYSameDay(YOY_SALES, 2026, 1, 3, -5)).toEqual([])
  })

  it('monthStart > monthEnd lanza error', () => {
    expect(() => salesInRangeYoYSameDay(YOY_SALES, 2026, 5, 2, 15)).toThrow(/monthEnd.*monthStart/)
  })

  it('rango sin ventas en year-1 retorna []', () => {
    // year=2030 → busca year-1=2029, sin datos
    const r = salesInRangeYoYSameDay(YOY_SALES, 2030, 1, 3, 15)
    expect(r).toEqual([])
  })
})
