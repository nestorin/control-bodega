import { test, expect } from "@playwright/test";
import { E2E_AUTH_STATE_PATH } from "../utils/auth-state";
import { EmbarquesPage } from "../utils/page-objects";

test.describe("Flujo: Embarques y Escaneo QR", () => {
  test.use({ storageState: E2E_AUTH_STATE_PATH });

  test("abre Embarques y muestra la acción para crear un embarque", async ({ page }) => {
    const embarques = new EmbarquesPage(page);

    await embarques.goto("/embarques");
    await embarques.assertNoErrors();

    await expect(page.locator("header").filter({ hasText: "CONTROL DE SALIDAS" })).toContainText(
      "Embarques",
    );
    await expect(page.getByRole("button", { name: "Nuevo embarque", exact: true })).toBeVisible();
  });
});
