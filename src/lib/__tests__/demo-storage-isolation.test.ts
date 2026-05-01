/**
 * demo-storage-isolation.test.ts — Sprint F4
 *
 * Audit: ¿el modo demo (`dataSource === 'demo'`) escribe a las keys persistidas
 * `salesflow-storage` y `salesflow-alert-status` cuando se cargan datos demo?
 *
 * Si lo hace, la sesión demo contamina el storage del browser y filtra a una
 * sesión real posterior (la org viene de DEMO_EMPRESA, los flags de alertas
 * vienen de mocks, etc.).
 *
 * El test NO arregla el problema. Si encuentra un leak, lo documenta como
 * blocker para un sprint futuro.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

// ─── Mock de localStorage que graba en un Map ───────────────────────────────
const storageMap = new Map<string, string>()
const setItemSpy = vi.fn((key: string, value: string) => {
  storageMap.set(key, value)
})
const getItemSpy = vi.fn((key: string) => storageMap.get(key) ?? null)
const removeItemSpy = vi.fn((key: string) => {
  storageMap.delete(key)
})

const mockStorage = {
  setItem: setItemSpy,
  getItem: getItemSpy,
  removeItem: removeItemSpy,
  clear: () => storageMap.clear(),
  key: (i: number) => Array.from(storageMap.keys())[i] ?? null,
  get length() { return storageMap.size },
}

// Stub global ANTES de importar el store (Zustand persist captura el storage
// al inicializar el middleware).
beforeAll(() => {
  vi.stubGlobal('localStorage', mockStorage)
  vi.stubGlobal('window', { localStorage: mockStorage })
})

afterAll(() => {
  vi.unstubAllGlobals()
})

const PERSISTED_KEYS = ['salesflow-storage', 'salesflow-alert-status'] as const
const UI_PREF_KEYS = [
  'sf_sidebar_collapsed',
  'sf_demo_badge_seen',
  'sf_tip_dimensiones',
  'sf_pivot_dims',
  'sf_pivot_advanced_seen',
  'sf_metas_pivot_dims',
  'sf_onboarding_tour_done',
] as const

describe('Sprint F4 — demo mode localStorage isolation audit', () => {
  it('reports which keys the store writes during demo data load', async () => {
    // Limpiar estado entre tests
    storageMap.clear()
    setItemSpy.mockClear()

    // Import dinámico para que ocurra DESPUÉS del stub
    const { useAppStore } = await import('../../store/appStore')
    const { getDemoData, DEMO_EMPRESA } = await import('../demoData')

    const { sales, metas, inventory } = getDemoData()
    const store = useAppStore.getState()

    // Simulamos exactamente el flujo de useAutoLoad.ts en modo demo:
    // useAutoLoad setea dataSource='demo' antes de los datasets (vía setDataSource
    // en el redirect de demo). Replicamos esa secuencia.
    store.setDataSource('demo')
    store.setSales(sales)
    store.setMetas(metas)
    store.setInventory(inventory)
    store.setConfiguracion({ empresa: DEMO_EMPRESA })

    // Esperar a que el middleware Zustand persist flushee.
    await new Promise(resolve => setTimeout(resolve, 50))

    // Capturar lo que se escribió, agrupado por key
    const writtenKeys = new Set(setItemSpy.mock.calls.map(c => c[0]))

    // ── Reporte ──────────────────────────────────────────────────────────────
    const writtenPersisted = PERSISTED_KEYS.filter(k => writtenKeys.has(k))
    const writtenUiPrefs   = UI_PREF_KEYS.filter(k => writtenKeys.has(k))
    const writtenOther     = Array.from(writtenKeys).filter(
      k => !(PERSISTED_KEYS as readonly string[]).includes(k)
        && !(UI_PREF_KEYS as readonly string[]).includes(k),
    )

    const auditReport = {
      writtenPersisted, // ← debería estar vacío si no hay leak
      writtenUiPrefs,   // ← OK que esté lleno
      writtenOther,     // ← desconocidos: investigar
      leakDetected: writtenPersisted.length > 0,
    }

    // El snapshot estructural deja evidencia documental del estado.
    expect(auditReport).toMatchSnapshot()
  })
})
