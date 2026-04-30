import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../../src/store/appStore'

// [Ticket 3.B.1] Cobertura unit del clamp de setSelectedPeriodRange.
// Reemplaza el Test B E2E de period-selector.spec.ts, que quedó inalcanzable
// desde la UI tras aplicar disabled simétrico al dropdown Desde.

describe('appStore.setSelectedPeriodRange clamp', () => {
  beforeEach(() => {
    useAppStore.setState({
      selectedPeriod: { year: 2026, monthStart: 0, monthEnd: 3, month: 3 },
    })
  })

  it('lastChanged="start" + monthStart > monthEnd → monthEnd se ajusta a monthStart', () => {
    useAppStore.getState().setSelectedPeriodRange(8, 2, 'start')
    const sp = useAppStore.getState().selectedPeriod
    expect(sp.monthStart).toBe(8)
    expect(sp.monthEnd).toBe(8)
    expect(sp.month).toBe(8) // alias sincronizado a monthEnd
  })

  it('lastChanged="end" + monthEnd < monthStart → monthStart se ajusta a monthEnd', () => {
    useAppStore.getState().setSelectedPeriodRange(5, 1, 'end')
    const sp = useAppStore.getState().selectedPeriod
    expect(sp.monthStart).toBe(1)
    expect(sp.monthEnd).toBe(1)
    expect(sp.month).toBe(1)
  })
})
