import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../../src/store/appStore'

// [Fix 3.B.8] Cobertura del nuevo comportamiento de setFechaRefISO:
// - Materializa selectedPeriod cuando el estado está neutro (year=0)
// - Re-materializa cuando el dataset es de un año distinto al activo
// - Preserva el rango activo del usuario en el caso típico (mismo año, worker re-run)

const ISO_FEB_2026 = new Date(2026, 1, 6, 12, 0, 0, 0).toISOString()
const ISO_JUN_2025 = new Date(2025, 5, 15, 12, 0, 0, 0).toISOString()

describe('appStore.setFechaRefISO range preservation', () => {
  beforeEach(() => {
    // Reset a estado neutro inicial
    useAppStore.setState({
      selectedPeriod: { year: 0, monthStart: 0, monthEnd: 0, month: 0 },
      fechaRefISO: null,
    })
  })

  it('estado neutro (year=0) materializa selectedPeriod al default YTD', () => {
    useAppStore.getState().setFechaRefISO(ISO_FEB_2026)
    const sp = useAppStore.getState().selectedPeriod
    expect(sp.year).toBe(2026)
    expect(sp.monthStart).toBe(0)
    expect(sp.monthEnd).toBe(1) // febrero
    expect(sp.month).toBe(1)
  })

  it('rango activo del usuario se preserva en worker re-run del mismo año', () => {
    // Simular: usuario eligió Feb–Feb (rango activo)
    useAppStore.setState({
      selectedPeriod: { year: 2026, monthStart: 1, monthEnd: 1, month: 1 },
    })
    // Worker corre y vuelve a llamar setFechaRefISO con el mismo año
    useAppStore.getState().setFechaRefISO(ISO_FEB_2026)
    const sp = useAppStore.getState().selectedPeriod
    // Rango del usuario INTACTO
    expect(sp.year).toBe(2026)
    expect(sp.monthStart).toBe(1)
    expect(sp.monthEnd).toBe(1)
    expect(sp.month).toBe(1)
  })

  it('año distinto fuerza re-materialización al default YTD del nuevo año', () => {
    // Usuario tenía rango activo en 2025
    useAppStore.setState({
      selectedPeriod: { year: 2025, monthStart: 3, monthEnd: 5, month: 5 },
    })
    // Carga dataset con fechaRef de feb-2026 → re-materializa
    useAppStore.getState().setFechaRefISO(ISO_FEB_2026)
    const sp = useAppStore.getState().selectedPeriod
    expect(sp.year).toBe(2026)
    expect(sp.monthStart).toBe(0)
    expect(sp.monthEnd).toBe(1)
    expect(sp.month).toBe(1)
  })

  it('inverso: año distinto en sentido año-pasado también re-materializa', () => {
    // Usuario en 2026, dataset cargado retrocede a 2025
    useAppStore.setState({
      selectedPeriod: { year: 2026, monthStart: 1, monthEnd: 1, month: 1 },
    })
    useAppStore.getState().setFechaRefISO(ISO_JUN_2025)
    const sp = useAppStore.getState().selectedPeriod
    expect(sp.year).toBe(2025)
    expect(sp.monthStart).toBe(0)
    expect(sp.monthEnd).toBe(5) // junio
    expect(sp.month).toBe(5)
  })
})
