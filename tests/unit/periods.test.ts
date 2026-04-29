import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import {
  getFechaReferencia,
  buildDefaultYtdRange,
  buildMonthlyRange,
  buildComparisonRangeYoY,
  truncateRangeToData,
  formatPeriodLabel,
  type Range,
} from '../../src/lib/periods'

// Reloj congelado para detectar contaminación accidental con browser time.
// Si alguna primitiva usa new Date() sin argumento, fallará de forma visible.
const FROZEN_NOW = new Date(2026, 3, 29, 12, 0, 0, 0) // 29-abr-2026 12:00 local

beforeAll(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false })
  vi.setSystemTime(FROZEN_NOW)
})

afterAll(() => {
  vi.useRealTimers()
})

// ─── Grupo 1: getFechaReferencia ──────────────────────────────────

describe('getFechaReferencia', () => {
  it('devuelve la fecha más reciente de un set con varias fechas mezcladas', () => {
    const sales = [
      { fecha: new Date(2026, 0, 15) },
      { fecha: new Date(2026, 3, 20) }, // más reciente
      { fecha: new Date(2026, 1, 28) },
    ]
    const result = getFechaReferencia(sales)
    expect(result?.getTime()).toBe(new Date(2026, 3, 20).getTime())
  })

  it('soporta sales con .fecha como Date y como string ISO', () => {
    const sales = [
      { fecha: new Date(2026, 0, 15) },
      { fecha: '2026-04-20T15:30:00.000Z' },
      { fecha: new Date(2026, 1, 28) },
    ]
    const result = getFechaReferencia(sales)
    expect(result).toBeInstanceOf(Date)
    expect(result?.toISOString()).toBe('2026-04-20T15:30:00.000Z')
  })

  it('devuelve null para array vacío', () => {
    expect(getFechaReferencia([])).toBeNull()
  })

  it('devuelve la única fecha si sales tiene un solo elemento', () => {
    const only = new Date(2026, 5, 10)
    const result = getFechaReferencia([{ fecha: only }])
    expect(result?.getTime()).toBe(only.getTime())
  })
})

// ─── Grupo 2: buildDefaultYtdRange ────────────────────────────────

describe('buildDefaultYtdRange', () => {
  it('fechaRef = 2026-04-20T15:30:00 → start=2026-01-01T00:00:00.000, end=2026-04-20T23:59:59.999', () => {
    const fechaRef = new Date(2026, 3, 20, 15, 30, 0, 0)
    const r = buildDefaultYtdRange(fechaRef)
    expect(r.start.getTime()).toBe(new Date(2026, 0, 1, 0, 0, 0, 0).getTime())
    expect(r.end.getTime()).toBe(new Date(2026, 3, 20, 23, 59, 59, 999).getTime())
  })

  it('fechaRef = primer día del año → start y end ambos en 2026-01-01', () => {
    const fechaRef = new Date(2026, 0, 1, 8, 0, 0, 0)
    const r = buildDefaultYtdRange(fechaRef)
    expect(r.start.getTime()).toBe(new Date(2026, 0, 1, 0, 0, 0, 0).getTime())
    expect(r.end.getTime()).toBe(new Date(2026, 0, 1, 23, 59, 59, 999).getTime())
  })

  it('fechaRef = 2026-12-31T23:59:00 → end=2026-12-31T23:59:59.999', () => {
    const fechaRef = new Date(2026, 11, 31, 23, 59, 0, 0)
    const r = buildDefaultYtdRange(fechaRef)
    expect(r.end.getTime()).toBe(new Date(2026, 11, 31, 23, 59, 59, 999).getTime())
  })

  it('idempotencia: dos llamadas con mismo fechaRef devuelven rangos equivalentes', () => {
    const fechaRef = new Date(2026, 6, 15, 10, 0, 0, 0)
    const a = buildDefaultYtdRange(fechaRef)
    const b = buildDefaultYtdRange(fechaRef)
    expect(a.start.getTime()).toBe(b.start.getTime())
    expect(a.end.getTime()).toBe(b.end.getTime())
  })
})

// ─── Grupo 3: buildMonthlyRange ───────────────────────────────────

describe('buildMonthlyRange', () => {
  it('rango cerrado, fechaRef fuera (futuro): ene-feb 2026, fechaRef=2026-04-20 → fin = 28-feb 23:59:59', () => {
    const r = buildMonthlyRange(
      { year: 2026, monthStart: 0, monthEnd: 1 },
      new Date(2026, 3, 20),
    )
    expect(r.start.getTime()).toBe(new Date(2026, 0, 1, 0, 0, 0, 0).getTime())
    expect(r.end.getTime()).toBe(new Date(2026, 1, 28, 23, 59, 59, 999).getTime())
  })

  it('rango cerrado año bisiesto: solo feb 2024, fechaRef=2024-06-15 → fin = 29-feb 2024', () => {
    const r = buildMonthlyRange(
      { year: 2024, monthStart: 1, monthEnd: 1 },
      new Date(2024, 5, 15),
    )
    expect(r.end.getTime()).toBe(new Date(2024, 1, 29, 23, 59, 59, 999).getTime())
  })

  it('rango incluye fechaRef: ene-abr 2026, fechaRef=2026-04-20 → end truncado a 20-abr', () => {
    const r = buildMonthlyRange(
      { year: 2026, monthStart: 0, monthEnd: 3 },
      new Date(2026, 3, 20, 15, 30),
    )
    expect(r.start.getTime()).toBe(new Date(2026, 0, 1, 0, 0, 0, 0).getTime())
    expect(r.end.getTime()).toBe(new Date(2026, 3, 20, 23, 59, 59, 999).getTime())
  })

  it('rango = solo mes en curso: abr 2026, fechaRef=2026-04-20 → start=1-abr, end=20-abr', () => {
    const r = buildMonthlyRange(
      { year: 2026, monthStart: 3, monthEnd: 3 },
      new Date(2026, 3, 20),
    )
    expect(r.start.getTime()).toBe(new Date(2026, 3, 1, 0, 0, 0, 0).getTime())
    expect(r.end.getTime()).toBe(new Date(2026, 3, 20, 23, 59, 59, 999).getTime())
  })

  it('rango futuro respecto a fechaRef: may-jun 2026, fechaRef=2026-04-20 → may 1 - jun 30 sin truncar', () => {
    const r = buildMonthlyRange(
      { year: 2026, monthStart: 4, monthEnd: 5 },
      new Date(2026, 3, 20),
    )
    expect(r.start.getTime()).toBe(new Date(2026, 4, 1, 0, 0, 0, 0).getTime())
    expect(r.end.getTime()).toBe(new Date(2026, 5, 30, 23, 59, 59, 999).getTime())
  })

  it('rango año pasado completo: 2025, fechaRef=2026-04-20 → ene 1 - dic 31 2025 sin truncar', () => {
    const r = buildMonthlyRange(
      { year: 2025, monthStart: 0, monthEnd: 11 },
      new Date(2026, 3, 20),
    )
    expect(r.start.getTime()).toBe(new Date(2025, 0, 1, 0, 0, 0, 0).getTime())
    expect(r.end.getTime()).toBe(new Date(2025, 11, 31, 23, 59, 59, 999).getTime())
  })

  it('throw si monthEnd < monthStart', () => {
    expect(() =>
      buildMonthlyRange({ year: 2026, monthStart: 5, monthEnd: 2 }, new Date(2026, 3, 20)),
    ).toThrow(/monthEnd.*<.*monthStart/)
  })

  it('throw si monthStart fuera de [0,11]', () => {
    expect(() =>
      buildMonthlyRange({ year: 2026, monthStart: 12, monthEnd: 12 }, new Date(2026, 3, 20)),
    ).toThrow(/monthStart fuera de rango/)
    expect(() =>
      buildMonthlyRange({ year: 2026, monthStart: -1, monthEnd: 0 }, new Date(2026, 3, 20)),
    ).toThrow(/monthStart fuera de rango/)
  })
})

// ─── Grupo 4: buildComparisonRangeYoY ─────────────────────────────

describe('buildComparisonRangeYoY', () => {
  it('caso normal: 2026-01-01 a 2026-04-20T23:59:59 → 2025-01-01 a 2025-04-20T23:59:59', () => {
    const range: Range = {
      start: new Date(2026, 0, 1, 0, 0, 0, 0),
      end: new Date(2026, 3, 20, 23, 59, 59, 999),
    }
    const r = buildComparisonRangeYoY(range)
    expect(r.start.getTime()).toBe(new Date(2025, 0, 1, 0, 0, 0, 0).getTime())
    expect(r.end.getTime()).toBe(new Date(2025, 3, 20, 23, 59, 59, 999).getTime())
  })

  it('año bisiesto a no-bisiesto: rango incluye 29-feb-2024 → clamp a 28-feb-2023', () => {
    const range: Range = {
      start: new Date(2024, 0, 1),
      end: new Date(2024, 1, 29, 23, 59, 59, 999),
    }
    const r = buildComparisonRangeYoY(range)
    expect(r.end.getFullYear()).toBe(2023)
    expect(r.end.getMonth()).toBe(1) // feb
    expect(r.end.getDate()).toBe(28) // clamp
    expect(r.end.getHours()).toBe(23)
    expect(r.end.getMinutes()).toBe(59)
  })

  it('rango cross-year: dic 2025 - ene 2026 → dic 2024 - ene 2025', () => {
    const range: Range = {
      start: new Date(2025, 11, 15),
      end: new Date(2026, 0, 10, 23, 59, 59, 999),
    }
    const r = buildComparisonRangeYoY(range)
    expect(r.start.getFullYear()).toBe(2024)
    expect(r.start.getMonth()).toBe(11)
    expect(r.start.getDate()).toBe(15)
    expect(r.end.getFullYear()).toBe(2025)
    expect(r.end.getMonth()).toBe(0)
    expect(r.end.getDate()).toBe(10)
  })

  it('idempotencia: aplicar dos veces devuelve 2 años atrás', () => {
    const range: Range = {
      start: new Date(2026, 0, 1),
      end: new Date(2026, 3, 20, 23, 59, 59, 999),
    }
    const r1 = buildComparisonRangeYoY(range)
    const r2 = buildComparisonRangeYoY(r1)
    expect(r2.start.getFullYear()).toBe(2024)
    expect(r2.end.getFullYear()).toBe(2024)
    expect(r2.end.getMonth()).toBe(3)
    expect(r2.end.getDate()).toBe(20)
  })

  it('hora exacta preservada: end 2026-04-20T23:59:59.999 → 2025-04-20T23:59:59.999', () => {
    const range: Range = {
      start: new Date(2026, 0, 1, 0, 0, 0, 0),
      end: new Date(2026, 3, 20, 23, 59, 59, 999),
    }
    const r = buildComparisonRangeYoY(range)
    expect(r.end.getHours()).toBe(23)
    expect(r.end.getMinutes()).toBe(59)
    expect(r.end.getSeconds()).toBe(59)
    expect(r.end.getMilliseconds()).toBe(999)
  })
})

// ─── Grupo 5: truncateRangeToData ─────────────────────────────────

describe('truncateRangeToData', () => {
  it('end > fechaRef (otro día) → end clampeado a endOfDay(fechaRef)', () => {
    const range: Range = {
      start: new Date(2026, 0, 1),
      end: new Date(2026, 4, 31, 23, 59, 59, 999),
    }
    const fechaRef = new Date(2026, 3, 20, 15, 30)
    const r = truncateRangeToData(range, fechaRef)
    expect(r.start.getTime()).toBe(range.start.getTime())
    expect(r.end.getTime()).toBe(new Date(2026, 3, 20, 23, 59, 59, 999).getTime())
  })

  it('end día anterior a fechaRef → rango sin cambios', () => {
    const range: Range = {
      start: new Date(2026, 0, 1),
      end: new Date(2026, 2, 31, 23, 59, 59, 999), // 31-mar
    }
    const fechaRef = new Date(2026, 3, 20) // 20-abr
    const r = truncateRangeToData(range, fechaRef)
    expect(r.start.getTime()).toBe(range.start.getTime())
    expect(r.end.getTime()).toBe(range.end.getTime())
  })

  it('end mismo día que fechaRef pero hora menor → clampea hacia adelante a 23:59:59.999', () => {
    const range: Range = {
      start: new Date(2026, 0, 1),
      end: new Date(2026, 3, 20, 10, 0, 0, 0),
    }
    const fechaRef = new Date(2026, 3, 20, 15, 30)
    const r = truncateRangeToData(range, fechaRef)
    expect(r.end.getTime()).toBe(new Date(2026, 3, 20, 23, 59, 59, 999).getTime())
  })

  it('start no se modifica nunca, incluso si start > fechaRef', () => {
    const range: Range = {
      start: new Date(2026, 5, 1),
      end: new Date(2026, 5, 30, 23, 59, 59, 999),
    }
    const fechaRef = new Date(2026, 3, 20)
    const r = truncateRangeToData(range, fechaRef)
    expect(r.start.getTime()).toBe(range.start.getTime())
    // end > fechaRef → trunca a endOfDay(fechaRef)
    expect(r.end.getTime()).toBe(new Date(2026, 3, 20, 23, 59, 59, 999).getTime())
  })
})

// ─── Grupo 6: formatPeriodLabel ───────────────────────────────────

describe('formatPeriodLabel', () => {
  it('mes único formato largo: "Junio 2026"', () => {
    expect(formatPeriodLabel(2026, 5, 5)).toBe('Junio 2026')
  })

  it('rango formato largo: "Mar–Jun 2026"', () => {
    expect(formatPeriodLabel(2026, 2, 5)).toBe('Mar–Jun 2026')
  })

  it('rango formato short: "Mar–Jun \'26"', () => {
    expect(formatPeriodLabel(2026, 2, 5, { short: true })).toBe("Mar–Jun '26")
  })

  it('inicio igual a fin equivale a mes único (ignora opts.short)', () => {
    expect(formatPeriodLabel(2026, 3, 3)).toBe('Abril 2026')
    expect(formatPeriodLabel(2026, 3, 3, { short: true })).toBe('Abril 2026')
  })

  it('monthStart > monthEnd lanza error', () => {
    expect(() => formatPeriodLabel(2026, 5, 2)).toThrow(/monthEnd.*monthStart/)
  })

  it('mes inválido (-1, 12, NaN) lanza error', () => {
    expect(() => formatPeriodLabel(2026, -1, 5)).toThrow(/monthStart fuera de rango/)
    expect(() => formatPeriodLabel(2026, 0, 12)).toThrow(/monthEnd fuera de rango/)
    expect(() => formatPeriodLabel(2026, NaN, 5)).toThrow(/monthStart fuera de rango/)
    expect(() => formatPeriodLabel(2026, 0, NaN)).toThrow(/monthEnd fuera de rango/)
  })
})
