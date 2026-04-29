import { test, expect } from '@playwright/test';

test.describe('smoke', () => {
  test('landing has h1', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('login has Google button', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: /Google/i }).first()).toBeVisible();
  });

  test('demo dashboard renders a kpi or large number', async ({ page }) => {
    await page.goto('/demo/dashboard');
    const kpi = page.locator('[data-testid="kpi"]');
    if (await kpi.count() > 0) {
      await expect(kpi.first()).toBeVisible();
    } else {
      await expect(page.locator('text=/\\$?\\s*\\d{1,3}([.,]\\d{3})+/').first()).toBeVisible();
    }
  });

  test('demo rotacion loads', async ({ page }) => {
    await page.goto('/demo/rotacion');
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test.fixme('demo clientes has at least 3 tabs', async ({ page }) => {
    // Sprint 1.2: tabs en ClientesPage carecen de role="tab" (a11y deuda)
    await page.goto('/demo/clientes');
    const tabs = page.getByRole('tab');
    await expect.poll(async () => await tabs.count(), { timeout: 8_000 }).toBeGreaterThanOrEqual(3);
  });

  test('demo departamentos renders an svg map', async ({ page }) => {
    await page.goto('/demo/departamentos');
    await expect(page.locator('svg').first()).toBeVisible();
  });
});
