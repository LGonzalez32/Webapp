/**
 * IndexedDB persistence for the in-progress upload wizard draft.
 * Mirrors dataCache.ts pattern (separate DB so invalidations are independent).
 *
 * Constraints:
 *  - localStorage no sirve: wizardDraft puede tener ventas/metas/inventario
 *    con 90k+ rows + File objects. Mismo motivo del comment de
 *    appStore.ts:407-408 sobre por qué sales/metas/inventory no van a
 *    localStorage.
 *  - IndexedDB usa structured-clone: File / Blob roundtrip nativos.
 *  - Si IndexedDB no disponible (Safari private mode), todo degrada
 *    silencioso: el wizard sigue funcionando, solo no persiste.
 */

import type { SaleRecord, MetaRecord, InventoryItem } from '../types'

const DB_NAME = 'salesflow-wizard'
const DB_VERSION = 1
const STORE_NAME = 'drafts'
const KEY = 'current'

export const CURRENT_VERSION = 1
export const TTL_MS = 7 * 24 * 60 * 60 * 1000
const DEBOUNCE_MS = 500

export type WizardDraft = {
  ventas?: SaleRecord[]
  metas?: MetaRecord[]
  inventario?: InventoryItem[]
  detectedCols?: Record<string, string[]>
  ignoredColumns?: Record<string, string[]>
  discardedRows?: Record<string, unknown[]>
  dateAmbiguity?: Record<string, { convention: string; evidence: string; ambiguous: boolean }>
  warnings?: Record<string, Array<{ code: string; message: string; field?: string }>>
  mapping?: Record<string, Record<string, string>>
  files?: Record<string, File>
  currentStep?: number
  stepStatus?: Record<string, 'pending' | 'loaded' | 'skipped' | 'error'>
}

type StoredDraft = {
  version: number
  savedAt: number
  draft: WizardDraft
}

function hasIDB(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function putValue(db: IDBDatabase, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(value, KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function getValue<T>(db: IDBDatabase): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(KEY)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
}

function clearStore(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function saveDraftImmediate(draft: WizardDraft): Promise<void> {
  if (!hasIDB()) return
  try {
    const db = await openDB()
    const stored: StoredDraft = { version: CURRENT_VERSION, savedAt: Date.now(), draft }
    await putValue(db, stored)
    db.close()
  } catch {
    // graceful fail — wizard funciona sin persist
  }
}

export async function loadDraft(): Promise<WizardDraft | null> {
  if (!hasIDB()) return null
  try {
    const db = await openDB()
    const stored = await getValue<StoredDraft>(db)
    if (!stored || typeof stored !== 'object') {
      db.close()
      return null
    }
    const expired = Date.now() - stored.savedAt > TTL_MS
    const wrongVersion = stored.version !== CURRENT_VERSION
    if (expired || wrongVersion || typeof stored.savedAt !== 'number') {
      await clearStore(db)
      db.close()
      return null
    }
    db.close()
    return stored.draft
  } catch {
    return null
  }
}

export async function clearDraft(): Promise<void> {
  if (!hasIDB()) return
  try {
    const db = await openDB()
    await clearStore(db)
    db.close()
  } catch {
    // graceful fail
  }
}

// ─── Debounce + flush ──────────────────────────────────────────────────────
//
// Permite que setWizardDraft del store dispare saves rápidos sin saturar IDB.
// flushPendingSaves() sincroniza antes de operaciones críticas (clearDraft
// post-doAnalyze) para evitar race "saved-after-cleared".

let pendingDraft: WizardDraft | null = null
let pendingTimer: ReturnType<typeof setTimeout> | null = null
let pendingPromise: Promise<void> | null = null
let pendingResolve: (() => void) | null = null

async function commitPending(): Promise<void> {
  const draft = pendingDraft
  pendingDraft = null
  pendingTimer = null
  const resolve = pendingResolve
  pendingResolve = null
  pendingPromise = null
  if (draft !== null) {
    await saveDraftImmediate(draft)
  }
  if (resolve) resolve()
}

export function saveDraft(draft: WizardDraft): Promise<void> {
  pendingDraft = draft
  if (!pendingPromise) {
    pendingPromise = new Promise<void>((resolve) => {
      pendingResolve = resolve
    })
  }
  if (pendingTimer) clearTimeout(pendingTimer)
  pendingTimer = setTimeout(() => { void commitPending() }, DEBOUNCE_MS)
  return pendingPromise
}

export async function flushPendingSaves(): Promise<void> {
  if (pendingTimer) {
    clearTimeout(pendingTimer)
    pendingTimer = null
  }
  if (pendingDraft !== null || pendingResolve !== null) {
    await commitPending()
  }
}

/** Test-only: reset internal debounce state between cases. */
export function _resetForTests(): void {
  if (pendingTimer) clearTimeout(pendingTimer)
  pendingDraft = null
  pendingTimer = null
  pendingPromise = null
  pendingResolve = null
}
