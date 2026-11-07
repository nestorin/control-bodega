import { test, expect } from "@playwright/test";
import { E2E_AUTH_STATE_PATH } from "../utils/auth-state";
import { ProgramacionRecepcionPage } from "../utils/page-objects";

test.describe("Flujo: Programación de Recepción con OCR", () => {
  test.use({ storageState: E2E_AUTH_STATE_PATH });

  test("abre la programación y muestra el paso de carga OCR", async ({ page }) => {
    const programacion = new ProgramacionRecepcionPage(page);

    await programacion.goto("/programacion-recepcion");
    await programacion.assertNoErrors();

    // The upload and OCR assertions require a real fixture and remain pending.
    await expect(page.getByText("Paso 1 · Cargar Orden de Compra", { exact: true })).toBeVisible();

    // 2. Subir archivo (PDF/JPG de prueba)
    // NOTA: Requiere tests/e2e/fixtures/sample-invoice.pdf
    // await programacion.uploadFile('tests/e2e/fixtures/sample-invoice.pdf')

    // 3. Verificar resultados OCR
    // await programacion.expectOCRResults()

    // 4. Verificar match de productos (confirmado/sugerido/manual)
    // await expect(page.locator('text=confirmado, text=sugerido, text=manual')).toBeVisible()

    // 5. Avanzar por pasos: Match -> Conversiones -> Completar
    // await programacion.clickContinue() // Match
    // await programacion.clickContinue() // Conversiones
    // await programacion.clickComplete() // Completa
  });
});
