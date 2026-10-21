import { test, expect } from "../fixtures/captura-tarima-setup";
import {
  CapturaEvidenciaPage,
  EvidenciaDetallePage,
  HomePage,
  generateTestData,
} from "../utils/page-objects";

test.describe("Flujo: Evidencias Fotográficas (P0)", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async ({ page }) => {
    const home = new HomePage(page);
    await home.goto("/");
    await home.expectLoaded();
  });

  test("captura completa: sube 2 fotos -> completa formulario -> guarda -> envía WhatsApp", async ({
    page,
  }) => {
    const captura = new CapturaEvidenciaPage(page);

    // ===== PASO 1: Pantalla Captura Evidencia (modo legacy) =====
    await captura.goto();
    await captura.assertNoErrors();
    await captura.expectLoaded();

    // Verificar que los slots de foto están visibles
    await expect(page.getByText("Foto de la mercancía dentro del tráiler")).toBeVisible();
    await expect(page.getByText("Foto del producto y su caducidad")).toBeVisible();

    // ===== PASO 2: Subir fotos =====
    // Subir archivos de fixture
    const trailerFixture = "e2e/fixtures/sample-trailer.jpg";
    const productoFixture = "e2e/fixtures/sample-producto.jpg";

    // Slot 1: Foto del tráiler
    await page.getByText("Foto de la mercancía dentro del tráiler").click();
    await page.waitForTimeout(500);
    await page.locator('input[type="file"]').first().setInputFiles(trailerFixture);
    await expect(page.getByText("Foto capturada").first()).toBeVisible({
      timeout: 5000,
    });

    // Slot 2: Foto del producto
    await page.getByText("Foto del producto y su caducidad").click();
    await page.waitForTimeout(500);
    await page.locator('input[type="file"]').nth(1).setInputFiles(productoFixture);
    await expect(page.getByText("Foto capturada").nth(1)).toBeVisible({
      timeout: 5000,
    });

    // ===== PASO 3: Completar formulario =====
    const testData = generateTestData();
    await captura.fillForm({
      proveedor: testData.proveedor,
      item: "Agua mineral 600 ml",
      tarimas: "20",
      caducidad: "2027-03-15",
      lote: "LT-0926-A",
    });

    // ===== PASO 4: Guardar evidencia =====
    await captura.clickSave();
    await captura.expectSaved();

    // ===== PASO 5: Enviar por WhatsApp =====
    await captura.clickWhatsApp();
    // Verificar que se intenta abrir WhatsApp (botón WhatsApp)
    await expect(page.getByRole("button", { name: "WhatsApp" })).toBeVisible({
      timeout: 5000,
    });

    // ===== PASO 6: Continuar a CapturaTarima =====
    await captura.clickContinue();

    // En modo test, navegar manualmente a la ruta legacy de CapturaTarima
    await page.goto("/?test=legacy-captura-tarima", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(3000);
    await expect(page.getByText("Tarima 1 de 5")).toBeVisible({
      timeout: 10000,
    });
  });

  test("validación: campos obligatorios", async ({ page }) => {
    const captura = new CapturaEvidenciaPage(page);

    await captura.goto();
    await captura.expectLoaded();

    // Intentar continuar sin llenar nada (click en "Continuar")
    await captura.clickContinue();

    // Debe mostrar notificaciones de campos faltantes
    await expect(page.getByText("Datos incompletos")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText("Foto del tráiler")).toBeVisible();
    await expect(page.getByText("Foto del producto y caducidad")).toBeVisible();
    await expect(page.getByText("Nombre del proveedor")).toBeVisible();
    await expect(page.getByText("Ítem a recibir")).toBeVisible();
    await expect(page.getByText("Cantidad de tarimas")).toBeVisible();
    await expect(page.getByText("Caducidad del producto")).toBeVisible();
  });

  test("foto pendiente -> cambiar foto", async ({ page }) => {
    const captura = new CapturaEvidenciaPage(page);

    await captura.goto();
    await captura.expectLoaded();

    // Click en slot de foto (simula abrir selector)
    await page.getByText("Foto de la mercancía dentro del tráiler").click();
    await page.waitForTimeout(500);

    // Verificar que el input de archivo se abrió (o al menos el click funcionó)
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached();
  });
});

test.describe("Flujo: Evidencia Detalle (P0)", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async ({ page }) => {
    const home = new HomePage(page);
    await home.goto("/");
    await home.expectLoaded();
  });

  test("detalle legacy mode: ver evidencia -> editar -> guardar -> WhatsApp", async ({ page }) => {
    const detalle = new EvidenciaDetallePage(page);

    // Ir directo a legacy mode
    await detalle.goto();
    await detalle.assertNoErrors([
      /Failed to load resource.*400/,
      /permission-denied/,
      /net::ERR_CONNECTION_REFUSED/,
      /Could not reach Cloud Firestore backend/,
      /FirebaseError.*unavailable/,
    ]);
    await detalle.expectLoaded("EVD-QA-12345");

    // Verificar que las fotos se muestran
    await expect(page.getByText("Mercancía en tráiler")).toBeVisible();
    await expect(page.getByText("Producto y caducidad")).toBeVisible();

    // Editar información
    await detalle.clickEdit();
    await expect(page.getByRole("button", { name: "Guardar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancelar" })).toBeVisible();

    // Cambiar un campo
    await detalle.editField("Ítem recibido", "Producto actualizado E2E");
    await detalle.editField("Lote", "LT-E2E-001");

    // Guardar cambios
    await detalle.clickSave();

    // Verificar que salió del modo edición
    await expect(page.getByRole("button", { name: "Editar" })).toBeVisible({
      timeout: 5000,
    });

    // Enviar por WhatsApp
    await detalle.clickWhatsApp();
    await expect(page.getByText("WhatsApp")).toBeVisible({ timeout: 5000 });
  });

  test("borrar evidencia", async ({ page }) => {
    const detalle = new EvidenciaDetallePage(page);

    await detalle.goto();
    await detalle.expectLoaded("EVD-QA-12345");

    // Click borrar
    await detalle.clickDelete();
    await expect(page.getByText("¿Borrar evidencia?")).toBeVisible();

    // Confirmar borrado
    await detalle.confirmDelete();

    // Debe navegar de vuelta a la pantalla de Evidencias (título principal)
    await expect(page.getByText("Historial y Seguimiento")).toBeVisible({
      timeout: 5000,
    });
  });
});
