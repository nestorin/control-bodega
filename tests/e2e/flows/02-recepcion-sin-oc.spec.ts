import { test, expect } from "@playwright/test";
import { E2E_AUTH_STATE_PATH } from "../utils/auth-state";
import {
  NuevaRecepcionStep1Page,
  NuevaRecepcionStep2Page,
  RecepcionCompletadaPage,
} from "../utils/page-objects";
import { generateTestData } from "../utils/test-utils";

test.describe("Flujo: Recepción SIN OC", () => {
  test.use({ storageState: E2E_AUTH_STATE_PATH });

  test("crea recepción sin folio de OC", async ({ page }) => {
    const step1 = new NuevaRecepcionStep1Page(page);
    const step2 = new NuevaRecepcionStep2Page(page);
    const completada = new RecepcionCompletadaPage(page);
    const data = generateTestData();

    await step1.goto("/nueva-recepcion");
    await step1.waitForCatalogsLoaded();
    await step1.assertNoErrors();

    // Seleccionar "No tengo OC"
    await step1.selectHasOC(false);

    // Debe mostrar aviso "Sin OC, la recepción se registrará sin folio"
    await expect(page.locator("text=Sin OC, la recepción se registrará sin folio")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator("text=Folio de orden de compra")).toBeHidden();

    // Rellenar datos mínimos
    await step1.fillTarimas(data.tarimas);
    await step1.selectProveedor(data.proveedor);
    await step1.selectProveedorLogistico(data.proveedorLogistico);

    // Continuar sin evidencia
    await step1.clickContinue();
    await step1.waitForCreation();

    // Verificar navegación exitosa
    await expect(page).toHaveURL(/.*(nueva-recepcion-paso2|recepcion-completada)/);

    if (page.url().includes("paso2")) {
      await step2.verifyProductsLoaded(0); // Sin OCR, productos manuales
      await step2.clickContinue();
    }

    await completada.expectSuccess();
    await step1.assertNoErrors();
  });
});
