import { test, expect } from "@playwright/test"
import { EscanearQRPage } from "./utils/page-objects"

test.describe("TarimaDetalle — E2E QR Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("domcontentloaded")
  })

  test("manual QR lookup opens seeded tarima detail", async ({ page }) => {
    // Sidebar nav (aria-label exact "Escanear QR"); the Home QuickActionCard
    // has the same title but no onClick, and its accessible name includes the
    // description, so exact matching resolves to the sidebar alone.
    await page.getByRole("button", { name: "Escanear QR", exact: true }).click()

    const escanear = new EscanearQRPage(page)
    await escanear.expectOnScanScreen()

    // Seeded by e2e/global-setup.ts: collection-group lookup on qrIdentifier.
    await escanear.enterManualTarimaId("TQR-24891-001")

    await expect(page.getByText("Detalle de Tarima")).toBeVisible({
      timeout: 15000,
    })
    await expect(page.getByText("TQR-24891-001").first()).toBeVisible()
    await expect(page.getByText("Lote")).toBeVisible()
    await expect(page.getByText("Caducidad")).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Ver referencia" }),
    ).toBeVisible()
  })
})
