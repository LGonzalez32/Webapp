import { describe, it, expect } from 'vitest'
import { salesInRange, salesInPeriod } from '../../src/lib/analysis'
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
