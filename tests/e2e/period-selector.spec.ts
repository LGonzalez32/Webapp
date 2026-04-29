import { test, expect } from '@playwright/test'

// [Ticket 2.3.4] Tests del selector global Desde/Hasta del TopBar.
// El selector aparece sólo cuando hay datos cargados (selectedPeriod.year !== 0).
// Usamos /demo/dashboard porque tiene datos demo cargados automáticamente y
// AppLayout (que renderiza TopBar) está montado.

const SELECTOR_START = '[data-testid="period-monthStart"]'
const SELECTOR_END = '[data-testid="period-monthEnd"]'

async function gotoDemo(page: import('@playwright/test').Page) {
  await page.goto('/demo/dashboard')
  await page.waitForLoadState('networkidle')
  // Esperar que el selector global esté montado (= datos cargados)
  await page.waitForSelector('[data-testid="period-range-selector"]', { timeout: 10_000 })
}

test.describe('Selector global Desde/Hasta (Ticket 2.3.4)', () => {
  test('A — persistencia post-reload del rango elegido', async ({ page }) => {
    test.setTimeout(30_000)
    await gotoDemo(page)

    // Cambiar Desde a Feb (1) y Hasta a Abr (3). Ambos dentro del rango
    // habilitado (fechaRef demo = abril 2026 → meses ≤3 selectable en Hasta).
    await page.locator(SELECTOR_START).selectOption('1')
    await page.locator(SELECTOR_END).selectOption('3')

    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.waitForSelector('[data-testid="period-range-selector"]', { timeout: 10_000 })

    await expect(page.locator(SELECTOR_START)).toHaveValue('1')
    await expect(page.locator(SELECTOR_END)).toHaveValue('3')
  })

  test('B — auto-corrección cuando Desde > Hasta: lastChanged="start" → Hasta sigue a Desde', async ({ page }) => {
    test.setTimeout(30_000)
    await gotoDemo(page)

    // Estado conocido: Desde=Ene (0), Hasta=Mar (2). Hasta dentro del rango
    // habilitado. Desde NO tiene meses disabled (puede ir a futuro).
    await page.locator(SELECTOR_START).selectOption('0')
    await page.locator(SELECTOR_END).selectOption('2')
    await expect(page.locator(SELECTOR_END)).toHaveValue('2')

    // Cambiar Desde a Sep (8). Aunque Sep esté disabled en Hasta (mes futuro),
    // sí es seleccionable en Desde. El setter recibe (8, 2, 'start') → como
    // start>end y lastChanged='start', clampea end=start=8.
    await page.locator(SELECTOR_START).selectOption('8')
    await expect(page.locator(SELECTOR_START)).toHaveValue('8')
    await expect(page.locator(SELECTOR_END)).toHaveValue('8')
  })

  test('C — meses futuros tienen disabled en Hasta para el año actual', async ({ page }) => {
    test.setTimeout(30_000)
    await gotoDemo(page)

    // Inspeccionar las options del Hasta. Para el año en curso, los meses
    // posteriores al fechaRef.month deben tener disabled=true.
    // El demo data tiene fechaRef en abr-2026 (último mes con ventas).
    // Esperado: meses 0..3 enabled, 4..11 disabled (asumiendo fechaRef en
    // abril 2026). El test es defensivo: simplemente verifica que AL MENOS
    // un option está disabled, lo que prueba que la lógica corre.
    const disabledCount = await page.locator(`${SELECTOR_END} option[disabled]`).count()
    expect(disabledCount).toBeGreaterThan(0)
    expect(disabledCount).toBeLessThan(12)

    // Verificación adicional: el primer option (Ene, value=0) NUNCA debería
    // estar disabled.
    const firstOption = page.locator(`${SELECTOR_END} option[value="0"]`)
    await expect(firstOption).not.toHaveAttribute('disabled', '')
  })
})
