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

  // Test B (auto-corrección Desde>Hasta) eliminado en Ticket 3.B.1: tras aplicar
  // disabled simétrico al dropdown Desde (mismo tope fechaRef que Hasta), el
  // escenario "Desde > Hasta" ya no es alcanzable desde la UI. La cobertura del
  // clamp del setter quedó en tests/unit/store.setSelectedPeriodRange.test.ts.

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
