/**
 * Thin IndexedDB wrapper to persist sales/metas/inventory between refreshes.
 * Avoids localStorage size limits (~5MB) — IndexedDB handles 100MB+ easily.
 */

const DB_NAME = 'salesflow-cache'
const DB_VERSION = 1
const STORE_NAME = 'datasets'

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

function put(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function get<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function saveDatasets(
  sales: unknown[],
  metas: unknown[],
  inventory: unknown[],
): Promise<void> {
  const db = await openDB()
  await Promise.all([
    put(db, 'sales', sales),
    put(db, 'metas', metas),
    put(db, 'inventory', inventory),
  ])
  db.close()
}

export async function loadDatasets(): Promise<{
  sales: unknown[] | undefined
  metas: unknown[] | undefined
  inventory: unknown[] | undefined
}> {
  const db = await openDB()
  const [sales, metas, inventory] = await Promise.all([
    get<unknown[]>(db, 'sales'),
    get<unknown[]>(db, 'metas'),
    get<unknown[]>(db, 'inventory'),
  ])
  db.close()
  return { sales, metas, inventory }
}

export async function clearDatasets(): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  tx.objectStore(STORE_NAME).clear()
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}
