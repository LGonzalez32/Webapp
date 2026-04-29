import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ─── Minimal in-memory IndexedDB mock ──────────────────────────────────────
// Sin deps externas (fake-indexeddb). Cubre la subset de la API que
// wizardCache usa: open + onupgradeneeded + transaction + put/get/clear.

type FakeStore = Map<string, unknown>

function makeRequest() {
  const r: {
    result: unknown
    error: Error | null
    onsuccess: (() => void) | null
    onerror: (() => void) | null
    onupgradeneeded: (() => void) | null
  } = { result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null }
  return r
}

function createMockIDB() {
  const dbs = new Map<string, FakeStore>()
  return {
    open(name: string, _version: number) {
      const req = makeRequest()
      const isFirst = !dbs.has(name)
      if (isFirst) dbs.set(name, new Map<string, unknown>())
      const store = dbs.get(name)!
      const db = {
        objectStoreNames: { contains: () => true },
        createObjectStore: () => ({}),
        transaction(_n: string, _mode?: string) {
          const tx: { oncomplete: (() => void) | null; onerror: (() => void) | null; objectStore: () => unknown } = {
            oncomplete: null, onerror: null,
            objectStore: () => ({
              put: (value: unknown, key: string) => {
                const r = makeRequest()
                store.set(key, value)
                setTimeout(() => { r.onsuccess?.(); tx.oncomplete?.() }, 0)
                return r
              },
              get: (key: string) => {
                const r = makeRequest()
                r.result = store.get(key)
                setTimeout(() => { r.onsuccess?.(); tx.oncomplete?.() }, 0)
                return r
              },
              clear: () => {
                const r = makeRequest()
                store.clear()
                setTimeout(() => { r.onsuccess?.(); tx.oncomplete?.() }, 0)
                return r
              },
            }),
          }
          return tx
        },
        close: () => { /* noop */ },
      }
      req.result = db
      setTimeout(() => {
        if (isFirst) req.onupgradeneeded?.()
        req.onsuccess?.()
      }, 0)
      return req
    },
    _getStore(name: string): FakeStore {
      let s = dbs.get(name)
      if (!s) { s = new Map(); dbs.set(name, s) }
      return s
    },
    _reset() { dbs.clear() },
  }
}

const mock = createMockIDB()

beforeEach(async () => {
  mock._reset()
  vi.stubGlobal('indexedDB', mock as unknown as IDBFactory)
  const { _resetForTests } = await import('../wizardCache')
  _resetForTests()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── Tests ────────────────────────────────────────────────────────────────

describe('wizardCache', () => {
  it('roundtrip preserva File en files map', async () => {
    const { saveDraftImmediate, loadDraft } = await import('../wizardCache')
    const file = new File(['hola mundo'], 'ventas.xlsx', { type: 'application/vnd.ms-excel' })
    await saveDraftImmediate({
      currentStep: 1,
      files: { ventas: file },
      mapping: { ventas: { fecha_venta: 'fecha' } },
    })
    const loaded = await loadDraft()
    expect(loaded).not.toBeNull()
    expect(loaded!.currentStep).toBe(1)
    expect(loaded!.files?.ventas).toBeInstanceOf(File)
    expect(loaded!.files?.ventas.name).toBe('ventas.xlsx')
    expect(loaded!.mapping?.ventas?.fecha_venta).toBe('fecha')
  })

  it('version mismatch retorna null y limpia el store', async () => {
    const { loadDraft, CURRENT_VERSION } = await import('../wizardCache')
    // Sembrar payload con version distinta directo en el mock
    const store = mock._getStore('salesflow-wizard')
    store.set('current', { version: CURRENT_VERSION + 999, savedAt: Date.now(), draft: { currentStep: 5 } })
    expect(store.get('current')).toBeDefined()
    const loaded = await loadDraft()
    expect(loaded).toBeNull()
    expect(store.get('current')).toBeUndefined()
  })

  it('TTL expira draft y limpia el store', async () => {
    const { saveDraftImmediate, loadDraft, TTL_MS } = await import('../wizardCache')
    const t0 = 1_700_000_000_000
    vi.spyOn(Date, 'now').mockReturnValue(t0)
    await saveDraftImmediate({ currentStep: 2 })
    const store = mock._getStore('salesflow-wizard')
    expect(store.get('current')).toBeDefined()
    // Avanzar reloj > TTL
    vi.spyOn(Date, 'now').mockReturnValue(t0 + TTL_MS + 1000)
    const loaded = await loadDraft()
    expect(loaded).toBeNull()
    expect(store.get('current')).toBeUndefined()
  })

  it('graceful fail si IndexedDB no disponible', async () => {
    vi.stubGlobal('indexedDB', undefined as unknown as IDBFactory)
    const { saveDraftImmediate, loadDraft, clearDraft } = await import('../wizardCache')
    await expect(saveDraftImmediate({ currentStep: 1 })).resolves.toBeUndefined()
    await expect(loadDraft()).resolves.toBeNull()
    await expect(clearDraft()).resolves.toBeUndefined()
  })

  it('flushPendingSaves espera saves debounced y commitea el último', async () => {
    const { saveDraft, flushPendingSaves, loadDraft } = await import('../wizardCache')
    void saveDraft({ currentStep: 1 })
    void saveDraft({ currentStep: 2 })
    const lastPromise = saveDraft({ currentStep: 3 })
    // Antes del debounce timer (500ms), el store no tiene nada
    expect(mock._getStore('salesflow-wizard').get('current')).toBeUndefined()
    await flushPendingSaves()
    await lastPromise
    const loaded = await loadDraft()
    expect(loaded?.currentStep).toBe(3)
  })
})
