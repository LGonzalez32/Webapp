import { test, expect } from '@playwright/test'

// Org real existente en el dataset (ver supabase). Si esta org se renombra/
// borra, actualizar este id. Si en el futuro se quiere robustez, exponer
// un endpoint de test-fixture que cree una org descartable.
const KNOWN_ORG_ID = '95e24653-8cfd-4e32-b5da-6593164fc628'
const KNOWN_ORG_NAME_PREFIX = 'Ferretería' // matchea inicio de "Ferretería El Tornillo S.A. de C.V."

const NONEXISTENT_ORG_ID = '00000000-0000-0000-0000-000000000000'

test.describe('S3 — RPC get_org_public_info + RLS organizations', () => {
  test('A — pre-login: /join/:orgId muestra el nombre de la org', async ({ page }) => {
    test.setTimeout(20_000)
    await page.goto(`/join/${KNOWN_ORG_ID}`)
    await page.waitForLoadState('networkidle')

    // El nombre de la org debe aparecer en la card
    const heading = page.getByText(/Te invitaron a unirte a/i).first()
    await expect(heading).toBeVisible({ timeout: 8_000 })
    await expect(page.getByText(new RegExp(KNOWN_ORG_NAME_PREFIX, 'i')).first()).toBeVisible()
  })

  test('B — pre-login: /join/<uuid-inexistente> muestra "Link inválido"', async ({ page }) => {
    test.setTimeout(20_000)
    await page.goto(`/join/${NONEXISTENT_ORG_ID}`)
    await page.waitForLoadState('networkidle')

    // El handler de error muestra "Link inválido" cuando RPC no encuentra row.
    await expect(page.getByText(/Link inválido/i).first()).toBeVisible({ timeout: 8_000 })
  })
})
