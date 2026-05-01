/**
 * cleanup-and-storage.test.ts — Sprint H3
 *
 * Cobertura para:
 *   A. cleanupClientState (G4 botón "Limpiar caché" + logout T5)
 *   B. Custom storage wrapper en appStore (G1 fix del leak F4 demo)
 *
 * Ambos son código crítico para evitar contaminación entre sesiones.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest'

// ─── Mock de localStorage compartido ────────────────────────────────────────
const storageMap = new Map<string, string>()
const setItemSpy = vi.fn((key: string, value: string) => { storageMap.set(key, value) })
const getItemSpy = vi.fn((key: string) => storageMap.get(key) ?? null)
const removeItemSpy = vi.fn((key: string) => { storageMap.delete(key) })

const mockStorage = {
  setItem: setItemSpy,
  getItem: getItemSpy,
  removeItem: removeItemSpy,
  clear: () => storageMap.clear(),
  key: (i: number) => Array.from(storageMap.keys())[i] ?? null,
  get length() { return storageMap.size },
}

beforeAll(() => {
  vi.stubGlobal('localStorage', mockStorage)
  vi.stubGlobal('window', { localStorage: mockStorage })
})

afterAll(() => {
  vi.unstubAllGlobals()
})

beforeEach(() => {
  storageMap.clear()
  setItemSpy.mockClear()
  getItemSpy.mockClear()
  removeItemSpy.mockClear()
})

const USER_LS_KEYS = [
  'salesflow-storage',
  'salesflow-alert-status',
  'sf_chat_messages',
  'sf_chat_usage',
] as const

const UI_PREF_KEYS = [
  'sf_sidebar_collapsed',
  'sf_demo_badge_seen',
  'sf_pivot_dims',
  'sf_metas_pivot_dims',
  'sf_onboarding_tour_done',
] as const

describe('A — cleanupClientState (Sprint G4 + Sprint A T5)', () => {
  it('removes all USER_LS_KEYS from localStorage', async () => {
    // Pre-populate storage as if a real session were active
    for (const key of USER_LS_KEYS) storageMap.set(key, 'previous-session')
    for (const key of UI_PREF_KEYS) storageMap.set(key, 'device-pref')

    const { cleanupClientState } = await import('../cleanupClientState')
    await cleanupClientState()

    for (const key of USER_LS_KEYS) {
      expect(removeItemSpy).toHaveBeenCalledWith(key)
      expect(storageMap.has(key)).toBe(false)
    }
  })

  it('preserves UI prefs (sidebar, badge, pivot dims, etc.)', async () => {
    for (const key of UI_PREF_KEYS) storageMap.set(key, 'device-pref')
    storageMap.set('salesflow-storage', 'session-data')

    const { cleanupClientState } = await import('../cleanupClientState')
    await cleanupClientState()

    for (const key of UI_PREF_KEYS) {
      expect(removeItemSpy).not.toHaveBeenCalledWith(key)
      expect(storageMap.has(key)).toBe(true)
    }
  })

  it('calls useOrgStore.reset() to clear in-memory non-persisted state', async () => {
    const { useOrgStore } = await import('../../store/orgStore')
    const resetSpy = vi.spyOn(useOrgStore.getState(), 'reset')

    const { cleanupClientState } = await import('../cleanupClientState')
    await cleanupClientState()

    expect(resetSpy).toHaveBeenCalledTimes(1)
    resetSpy.mockRestore()
  })
})

describe('B — Storage wrapper conditional on dataSource (Sprint G1)', () => {
  it('SKIPS write to salesflow-storage when dataSource === "demo"', async () => {
    const { useAppStore } = await import('../../store/appStore')
    const store = useAppStore.getState()

    // Simulate demo flow exactly as useAutoLoad does
    store.setDataSource('demo')
    store.setConfiguracion({ empresa: 'Mi Empresa Demo' })

    await new Promise(resolve => setTimeout(resolve, 50))

    const writtenKeys = setItemSpy.mock.calls.map(c => c[0])
    expect(writtenKeys).not.toContain('salesflow-storage')
  })

  it('WRITES to salesflow-storage when dataSource === "real" with the given configuracion', async () => {
    const { useAppStore } = await import('../../store/appStore')
    const store = useAppStore.getState()

    store.setDataSource('real')
    store.setConfiguracion({ empresa: 'Acme Real' })

    await new Promise(resolve => setTimeout(resolve, 50))

    const writes = setItemSpy.mock.calls.filter(c => c[0] === 'salesflow-storage')
    expect(writes.length).toBeGreaterThan(0)

    // Last write should contain the live configuracion
    const last = writes[writes.length - 1][1]
    const parsed = JSON.parse(last)
    expect(parsed?.state?.configuracion?.empresa).toBe('Acme Real')
  })
})
