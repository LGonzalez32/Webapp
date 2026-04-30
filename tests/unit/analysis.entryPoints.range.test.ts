import { describe, it, expect } from 'vitest'
import {
  computeCommercialAnalysis,
  analyzeSupervisor,
  buildSaleIndex,
} from '../../src/lib/analysis'
import type { SaleRecord, MetaRecord, Configuracion } from '../../src/types'

// [Ticket 3.B.½] Tests de propagación del rango por los entry points del motor.
// Goldens cubren el path default (legacy YTD); estos tests cubren el path
// range-aware con monthStart/monthEnd != defaults.

function mk(year: number, month: number, day: number, vendedor: string, unidades = 100): SaleRecord {
  return {
    fecha: new Date(year, month, day, 12, 0, 0, 0),
    vendedor,
    cliente: 'Cliente A',
    producto: 'P1',
    unidades,
    venta_neta: unidades,
  } as SaleRecord
}

const MIN_CONFIG = {
  moneda: '$',
  dias_dormido_threshold: 60,
  umbral_riesgo_quiebre: 7,
  umbral_baja_cobertura: 15,
  umbral_normal: 60,
} as unknown as Configuracion

describe('analysis entry points — range-aware propagation (3.B.½)', () => {
  // Dataset: 2026 ene-abr, vendedor "V1" con 100 uds/mes; 2025 idem para YoY.
  const SALES: SaleRecord[] = [
    mk(2025, 0, 5, 'V1'), mk(2025, 1, 5, 'V1'), mk(2025, 2, 5, 'V1'), mk(2025, 3, 5, 'V1'),
    mk(2026, 0, 5, 'V1'), mk(2026, 1, 5, 'V1'), mk(2026, 2, 5, 'V1'), mk(2026, 3, 5, 'V1'),
  ]
  const FECHA_REF = new Date(2026, 3, 30, 12, 0, 0, 0)

  it('analyzeVendor (vía computeCommercialAnalysis): rango feb-feb produce ytd_actual_uds = solo febrero', () => {
    const sp = { year: 2026, month: 1, monthStart: 1, monthEnd: 1 }
    const result = computeCommercialAnalysis(SALES, [], [], sp, MIN_CONFIG)
    const v1 = result.vendorAnalysis.find(v => v.vendedor === 'V1')
    expect(v1).toBeDefined()
    // Solo feb-2026: 100 uds. Solo feb-2025: 100 uds.
    expect(v1!.ytd_actual_uds).toBe(100)
    expect(v1!.ytd_anterior_uds).toBe(100)
    // teamStats agrega lo mismo (un solo vendedor)
    const ts: any = result.teamStats
    expect(ts.ytd_actual_equipo_uds).toBe(100)
    expect(ts.ytd_anterior_equipo_uds).toBe(100)
  })

  it('default (sin monthStart/monthEnd) preserva semántica YTD legacy = (0, fechaRef.month)', () => {
    const sp = { year: 2026, month: 3 } // sin monthStart/monthEnd → legacy YTD
    const result = computeCommercialAnalysis(SALES, [], [], sp, MIN_CONFIG)
    const v1 = result.vendorAnalysis.find(v => v.vendedor === 'V1')
    expect(v1).toBeDefined()
    // YTD ene-abr 2026 = 4 meses × 100 = 400
    expect(v1!.ytd_actual_uds).toBe(400)
    expect(v1!.ytd_anterior_uds).toBe(400)
  })

  it('analyzeSupervisor: rango mar-abr propaga al YTD del supervisor', () => {
    const sp = { year: 2026, month: 3, monthStart: 2, monthEnd: 3 }
    const idx = buildSaleIndex(SALES.map(s => ({
      ...s,
      supervisor: 'S1',
    } as SaleRecord)))
    // analyzeSupervisor requiere vendorAnalysis pre-computado
    const commercial = computeCommercialAnalysis(SALES, [], [], sp, MIN_CONFIG, idx)
    const supervisors = analyzeSupervisor(commercial.vendorAnalysis, [] as MetaRecord[], sp, idx)
    const s1 = supervisors[0]
    expect(s1).toBeDefined()
    // mar+abr 2026 para V1 (único vendedor) = 200 uds. mar+abr 2025 = 200.
    expect(s1.ytd_actual_uds).toBe(200)
    expect(s1.ytd_anterior_uds).toBe(200)
  })

  it('sentinel year=0 (pre-hydration store state) cae a legacy YTD sin lanzar error', () => {
    // Caso real: el store arranca en estado neutro {year:0, monthStart:0, monthEnd:0}
    // antes de que setFechaRefISO materialice el shape. resolveYTDRange debe
    // tolerarlo silenciosamente con fallback al path legacy.
    const sp = { year: 0, month: 0, monthStart: 0, monthEnd: 0 }
    const result = computeCommercialAnalysis(SALES, [], [], sp, MIN_CONFIG)
    const v1 = result.vendorAnalysis.find(v => v.vendedor === 'V1')
    expect(v1).toBeDefined()
    // Legacy YTD = (0, fechaRef.month=3) sobre 2026 → 4 meses × 100 = 400 (mismo que test default)
    expect(v1!.ytd_actual_uds).toBe(400)
  })

  it('selectedPeriod.year ≠ fechaRef.year en path range-aware lanza error claro', () => {
    // Forzar mismatch: dataset solo 2026 (fechaRef = abr-2026), pero sp.year = 2025
    const sp = { year: 2025, month: 3, monthStart: 0, monthEnd: 3 }
    expect(() => computeCommercialAnalysis(SALES, [], [], sp, MIN_CONFIG)).toThrow(
      /selectedPeriod\.year.*≠.*fechaRef\.year/,
    )
  })
})
