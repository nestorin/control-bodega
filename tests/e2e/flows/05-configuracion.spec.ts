import { test, expect } from "@playwright/test";
import { E2E_AUTH_STATE_PATH } from "../utils/auth-state";
import { ConfiguracionPage } from "../utils/page-objects";

test.describe("Configuración: CRUD Almacenes, Proveedores, Conversiones", () => {
  test.use({ storageState: E2E_AUTH_STATE_PATH });

  test("crea un almacén desde Configuración", async ({ page }) => {
    const config = new ConfiguracionPage(page);

    await config.goto("/configuracion");
    await config.assertNoErrors();

    // Ir a pestaña Almacenes
    await config.goToTab("almacenes");

    // Crear nuevo almacén
    const testAlmacen = `Almacén QA ${Date.now()}`;
    await config.createAlmacen(testAlmacen, "Zona Norte", "Juan Pérez");

    // Verificar que aparece en la lista
    await expect(page.locator(`text=${testAlmacen}`)).toBeVisible({
      timeout: 5000,
    });
  });

  test("muestra las pestañas de proveedores de mercancía y logística", async ({ page }) => {
    const config = new ConfiguracionPage(page);
    await config.goto("/configuracion");
    await config.goToTab("proveedores");
    await config.selectSupplierType("logistica");
  });

  test("muestra el módulo de conversiones", async ({ page }) => {
    const config = new ConfiguracionPage(page);
    await config.goto("/configuracion");
    await config.goToTab("conversiones");
  });
});
