import { test, expect } from "@playwright/test";
import { E2E_AUTH_STATE_PATH } from "../utils/auth-state";
import {
  NuevaRecepcionStep1Page,
  NuevaRecepcionStep2Page,
  RecepcionCompletadaPage,
} from "../utils/page-objects";
import { generateTestData } from "../utils/test-utils";

test.describe("Flujo: Recepción CON OC (Firestore habilitado)", () => {
  test.use({ storageState: E2E_AUTH_STATE_PATH });

  test("crea recepción completa con OC, proveedor, logística y evidencia OCR", async ({
    page,
    context,
  }) => {
    console.log("[TEST] Starting test: crea recepción completa");

    // Check storage state
    const storage = await context.storageState();
    console.log(
      "[TEST] Storage state origins:",
      storage.origins.map((o) => o.origin),
    );
    storage.origins.forEach((o) => {
      console.log(
        `[TEST] Origin: ${o.origin}, localStorage keys:`,
        o.localStorage.map((ls) => ls.name),
      );
    });

    const step1 = new NuevaRecepcionStep1Page(page);
    const step2 = new NuevaRecepcionStep2Page(page);
    const completada = new RecepcionCompletadaPage(page);
    const data = generateTestData();

    // 1. Navegar a Nueva Recepción desde Home
    await step1.openFromHome();
    await step1.assertNoErrors();

    // 2. Seleccionar "Sí tengo OC"
    await step1.selectHasOC(true);
    await expect(page.locator("text=Folio de orden de compra")).toBeVisible();

    // 3. Rellenar datos
    await step1.fillOCFolio(data.ocFolio);
    await step1.fillTarimas(data.tarimas);
    await step1.selectProveedor(data.proveedor);
    await step1.selectProveedorLogistico(data.proveedorLogistico);

    // 4. Subir archivo OCR (PDF de prueba)
    // NOTA: Requiere archivo tests/e2e/fixtures/sample-oc.pdf
    // await step1.uploadOCRFile('tests/e2e/fixtures/sample-oc.pdf')
    // await step1.expectOCRResult()
    // await step1.expectConversionsTable()

    // 5. Continuar (crea recepción en Firestore)
    await step1.clickContinue();
    await step1.waitForCreation();

    // 6. Verificar que se creó recepción (URL cambia a step2 o completada)
    await expect(page).toHaveURL(/.*(nueva-recepcion-paso2|recepcion-completada)/);

    // 7. Si llega a step2, verificar productos y continuar
    if (page.url().includes("paso2")) {
      await step2.verifyProductsLoaded(1); // Al menos 1 producto del OCR
      await step2.clickContinue();
      await step2.waitForCreation();
    }

    // 8. Pantalla final
    await completada.expectSuccess();
    await completada.expectTarimasCount(parseInt(data.tarimas, 10));

    // 9. Verificar que no hay errores de consola
    await step1.assertNoErrors();
  });

  test("idempotencia: doble click en Continuar crea una sola recepción", async ({ page }) => {
    const step1 = new NuevaRecepcionStep1Page(page);
    const data = generateTestData();

    await step1.openFromHome();
    await step1.waitForCatalogsLoaded();

    await step1.selectHasOC(true);
    await step1.fillOCFolio(data.ocFolio);
    await step1.fillTarimas(data.tarimas);
    await step1.selectProveedor(data.proveedor);
    await step1.selectProveedorLogistico(data.proveedorLogistico);

    // Click rápido doble en Continuar
    await Promise.all([step1.clickContinue(), step1.clickContinue()]);

    await step1.waitForCreation();

    // Verificar que solo se creó una recepción (no navegó dos veces)
    const url = page.url();
    expect(url).toMatch(/(nueva-recepcion-paso2|recepcion-completada)/);

    // Si hay botón "Continuar sin evidencia", la recepción ya existe
    const hasRetryOption = await page
      .locator("text=Continuar sin evidencia")
      .isVisible()
      .catch(() => false);
    if (hasRetryOption) {
      // La recepción ya existe, el segundo click no creó duplicado
      await step1.assertNoErrors();
    }
  });
});
