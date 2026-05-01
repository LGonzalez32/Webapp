import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import * as path from 'node:path';

const VENTAS_FIXTURE = path.resolve('tests/fixtures/sample-ventas.csv');
const METAS_FIXTURE = path.resolve('tests/fixtures/sample-metas-ambiguo.csv');

const DB = 'salesflow-wizard';
const STORE = 'drafts';
const KEY = 'current';

type StoredDraft = {
  draft?: {
    metaUnitOverride?: 'unidades' | 'venta_neta';
    stepStatus?: Record<string, string>;
    metas?: unknown[];
  };
};

async function deleteWizardDB(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('salesflow-wizard');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  }));
}

async function readDraft(page: Page): Promise<StoredDraft | undefined> {
  return await page.evaluate(({ db, store, key }) => new Promise<StoredDraft | undefined>((resolve) => {
    const req = indexedDB.open(db, 1);
    req.onsuccess = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(store)) { d.close(); resolve(undefined); return; }
      const tx = d.transaction(store, 'readonly');
      const r = tx.objectStore(store).get(key);
      r.onsuccess = () => { d.close(); resolve(r.result as StoredDraft | undefined); };
      r.onerror = () => { d.close(); resolve(undefined); };
    };
    req.onerror = () => resolve(undefined);
  }), { db: DB, store: STORE, key: KEY });
}

async function dismissAllTours(page: Page) {
  for (let i = 0; i < 5; i++) {
    const ctrl = page.getByText(/^(Saltar (tour|por ahora)|Omitir|Cerrar tour)$/i).first();
    if (!(await ctrl.isVisible().catch(() => false))) return;
    await ctrl.click().catch(() => {});
    await page.waitForTimeout(300);
  }
}

async function waitForDraftCondition(page: Page, predicate: (d: StoredDraft | undefined) => boolean, timeoutMs = 10_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const d = await readDraft(page);
    if (predicate(d)) return d;
    await page.waitForTimeout(200);
  }
  throw new Error('waitForDraftCondition timed out');
}

async function uploadVentasFirst(page: Page) {
  // Subir ventas en step 1 (visible por default).
  const fileInputs = page.locator('input[type="file"][accept*=".csv"]');
  await expect(fileInputs.first()).toBeAttached();
  await fileInputs.first().setInputFiles(VENTAS_FIXTURE);
  // Esperar que se persista
  await waitForDraftCondition(page, (d) => (d?.draft?.stepStatus?.ventas === 'loaded'));
}

async function uploadMetasAmbiguo(page: Page) {
  // El wizard muestra 1 step a la vez; click "Siguiente" para llegar a metas.
  const next = page.getByRole('button', { name: /^Siguiente/i }).first();
  await next.click();
  await page.waitForTimeout(500);
  // Ahora el input visible es el de metas
  const fileInput = page.locator('input[type="file"][accept*=".csv"]').first();
  await expect(fileInput).toBeAttached();
  await fileInput.setInputFiles(METAS_FIXTURE);
}

test.describe('upload meta unit prompt', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?e2e_bypass=1');
    await deleteWizardDB(page);
  });

  test('A — happy path: header ambiguo abre modal, confirmar USD persiste override', async ({ page }) => {
    test.setTimeout(45_000);
    await page.goto('/cargar?e2e_bypass=1');
    await page.waitForLoadState('networkidle');
    await dismissAllTours(page);

    await uploadVentasFirst(page);
    await dismissAllTours(page);
    await uploadMetasAmbiguo(page);

    // El modal debe aparecer y mencionar el header detectado "Meta"
    const modal = page.locator('[role="dialog"][aria-labelledby="meta-unit-prompt-title"]');
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await expect(modal).toContainText('Meta');

    // Confirmar disabled hasta que se elija
    const confirmBtn = modal.getByRole('button', { name: /Confirmar/i });
    await expect(confirmBtn).toBeDisabled();

    // Click radio USD
    await modal.getByText(/USD — dólares/i).click();
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    // Modal cierra y step queda loaded; override persiste
    await expect(modal).toHaveCount(0);
    const final = await waitForDraftCondition(
      page,
      (d) => d?.draft?.metaUnitOverride === 'venta_neta' && d?.draft?.stepStatus?.metas === 'loaded',
    );
    expect(final?.draft?.metaUnitOverride).toBe('venta_neta');
    expect(final?.draft?.stepStatus?.metas).toBe('loaded');
  });

  test('B — persistencia post-reload: el modal NO reaparece, override sigue ahí', async ({ page }) => {
    test.setTimeout(45_000);
    await page.goto('/cargar?e2e_bypass=1');
    await page.waitForLoadState('networkidle');
    await dismissAllTours(page);
    await uploadVentasFirst(page);
    await dismissAllTours(page);
    await uploadMetasAmbiguo(page);

    const modal = page.locator('[role="dialog"][aria-labelledby="meta-unit-prompt-title"]');
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await modal.getByText(/USD — dólares/i).click();
    await modal.getByRole('button', { name: /Confirmar/i }).click();
    await waitForDraftCondition(page, (d) => d?.draft?.metaUnitOverride === 'venta_neta');

    // Reload preservando bypass
    await page.goto('/cargar?e2e_bypass=1');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500); // hydrate + restore

    // El modal NO reaparece tras hidratar
    await expect(modal).toHaveCount(0);

    // Override persiste en IDB
    const restored = await readDraft(page);
    expect(restored?.draft?.metaUnitOverride).toBe('venta_neta');
    expect(restored?.draft?.stepStatus?.metas).toBe('loaded');
  });

  test('C — cancelar descarta archivo, NO persiste override', async ({ page }) => {
    test.setTimeout(45_000);
    await page.goto('/cargar?e2e_bypass=1');
    await page.waitForLoadState('networkidle');
    await dismissAllTours(page);
    await uploadVentasFirst(page);
    await dismissAllTours(page);
    await uploadMetasAmbiguo(page);

    const modal = page.locator('[role="dialog"][aria-labelledby="meta-unit-prompt-title"]');
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await modal.getByRole('button', { name: /Cancelar/i }).click();
    await expect(modal).toHaveCount(0);

    // El step de metas NO queda loaded; metaUnitOverride NO persistido
    await page.waitForTimeout(800); // dejar que persist effect corra
    const after = await readDraft(page);
    expect(after?.draft?.metaUnitOverride).toBeUndefined();
    // Step de metas no loaded (puede ser pending o ausente del stepStatus map)
    const metaStatus = after?.draft?.stepStatus?.metas;
    expect(metaStatus === undefined || metaStatus === 'pending').toBe(true);
  });
});
