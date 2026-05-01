import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const DB = 'salesflow-wizard';
const STORE = 'drafts';
const KEY = 'current';

async function deleteDB(page: Page) {
  await page.evaluate((db) => new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(db);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  }), DB);
}

async function seedRaw(page: Page, payload: unknown) {
  await page.evaluate(({ db, store, key, payload }) => new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(db, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(store)) d.createObjectStore(store);
    };
    req.onsuccess = () => {
      const d = req.result;
      const tx = d.transaction(store, 'readwrite');
      tx.objectStore(store).put(payload, key);
      tx.oncomplete = () => { d.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  }), { db: DB, store: STORE, key: KEY, payload });
}

async function readRaw(page: Page): Promise<unknown> {
  return await page.evaluate(({ db, store, key }) => new Promise<unknown>((resolve) => {
    const req = indexedDB.open(db, 1);
    req.onsuccess = () => {
      const d = req.result;
      const tx = d.transaction(store, 'readonly');
      const r = tx.objectStore(store).get(key);
      r.onsuccess = () => { d.close(); resolve(r.result); };
      r.onerror = () => { d.close(); resolve(undefined); };
    };
    req.onerror = () => resolve(undefined);
  }), { db: DB, store: STORE, key: KEY });
}

test.describe('wizardCache integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?e2e_bypass=1');
    await deleteDB(page);
  });

  test('valid v1 draft persists across page mount + hydration does not corrupt it', async ({ page }) => {
    await page.goto('/?e2e_bypass=1');
    await seedRaw(page, {
      version: 1,
      savedAt: Date.now(),
      draft: {
        currentStep: 1,
        mapping: { ventas: { fecha_venta: 'fecha' } },
        stepStatus: { ventas: 'pending', metas: 'pending', inventario: 'pending' },
      },
    });
    await page.goto('/cargar?e2e_bypass=1');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800); // hydrateWizardDraftFromCache async

    const stored = await readRaw(page) as { version?: number; draft?: { currentStep?: number; mapping?: Record<string, Record<string, string>> } } | undefined;
    expect(stored).toBeDefined();
    expect(stored?.version).toBe(1);
    expect(stored?.draft?.currentStep).toBe(1);
    expect(stored?.draft?.mapping?.ventas?.fecha_venta).toBe('fecha');
  });

  test('stale draft (wrong version) gets cleared on hydrate', async ({ page }) => {
    await seedRaw(page, {
      version: 999,
      savedAt: Date.now(),
      draft: { currentStep: 5 },
    });
    await page.goto('/cargar?e2e_bypass=1');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);

    const stored = await readRaw(page);
    expect(stored).toBeUndefined();
  });

  test('expired draft (>7 days) gets cleared on hydrate', async ({ page }) => {
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    await seedRaw(page, {
      version: 1,
      savedAt: Date.now() - SEVEN_DAYS - 1000,
      draft: { currentStep: 2 },
    });
    await page.goto('/cargar?e2e_bypass=1');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);

    const stored = await readRaw(page);
    expect(stored).toBeUndefined();
  });
});
