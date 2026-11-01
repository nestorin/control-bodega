import { test, expect } from "../fixtures/captura-tarima-setup";
import type { Page } from "@playwright/test";
import {
  EscanearQRPage,
  TarimaDetallePage,
  CapturaTarimaPage,
  HomePage,
} from "../utils/page-objects";

test.describe("Flujo: Captura de Tarima (Ciclo Completo)", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async ({ page }) => {
    // Verificar que la app carga y estamos autenticados
    const home = new HomePage(page);
    await home.goto("/");
    await home.expectLoaded();
  });

  async function gotoLegacyCaptura(page: Page) {
    await page.goto("/?test=legacy-captura-tarima", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(3000);

    const captura = new CapturaTarimaPage(page);
    await captura.expectLoaded(1, 5);
    await captura.assertNoErrors();
    return captura;
  }

  test("no ofrece una referencia ficticia cuando falta el id de recepción", async ({ page }) => {
    const detalle = new TarimaDetallePage(page);

    // ===== PASO 1: TarimaDetalle modo legacy (sin query Firestore) =====
    await detalle.gotoLegacy();
    await detalle.assertNoErrors();

    // El modo legacy no tiene un id de recepción real y no debe navegar con un folio inventado.
    await expect(page.getByText("Detalle de Tarima")).toBeVisible();
    await expect(page.getByText("Lote")).toBeVisible();
    await expect(page.getByText("Caducidad")).toBeVisible();
    await expect(page.getByRole("button", { name: /Ver referencia/ })).toHaveCount(0);
  });

  test("flujo completo de captura: 5 tarimas → finalización automática", async ({ page }) => {
    const captura = await gotoLegacyCaptura(page);

    // ===== PASO 1: CapturaTarima - Tarima 1 =====
    await captura.completeTarimaForm({
      lote: "LT-0926-A",
      caducidad: "2027-03-15",
    });

    // Avanzar a tarima 2
    await captura.clickSiguiente();

    // ===== PASO 2: CapturaTarima - Tarima 2 =====
    await captura.expectLoaded(2, 5);
    await captura.assertNoErrors();

    await captura.completeTarimaForm({
      lote: "LT-0926-B",
      caducidad: "2027-03-20",
    });

    // Avanzar a tarima 3
    await captura.clickSiguiente();

    // ===== PASO 3: CapturaTarima - Tarima 3 =====
    await captura.expectLoaded(3, 5);
    await captura.assertNoErrors();

    await captura.completeTarimaForm({
      lote: "LT-0926-C",
      caducidad: "2027-03-10",
    });

    // ===== PASO 4: Completar tarimas restantes =====
    await captura.clickSiguiente();
    await captura.expectLoaded(4, 5);
    await captura.completeTarimaForm({
      lote: "LT-0926-D",
      caducidad: "2027-04-01",
    });
    await captura.clickSiguiente();
    await captura.expectLoaded(5, 5);
    await captura.completeTarimaForm({
      lote: "LT-0926-E",
      caducidad: "2027-04-15",
    });
    await captura.clickSiguiente();

    // Current CapturaTarima finalizes automatically after saving the last pallet.
    await expect(page.getByText("Recepción completada")).toBeVisible({
      timeout: 10000,
    });

    await captura.assertNoErrors();
  });

  test("guardar borrador persiste datos al navegar entre tarimas", async ({ page }) => {
    const captura = await gotoLegacyCaptura(page);

    // Llenar y guardar borrador
    await captura.completeTarimaForm({
      lote: "LT-BORRADOR-001",
      caducidad: "2028-01-01",
    });
    await captura.clickSiguiente();

    // Ir a tarima 2 and return to the saved first pallet.
    await captura.expectLoaded(2, 5);
    await captura.goToTarima(1);
    await captura.expectLoaded(1, 5);

    // Verificar que se mantuvo el lote
    const lote = await page.locator('input[type="text"]').first().inputValue();
    expect(lote).toBe("LT-BORRADOR-001");
  });

  test("validación FEFO: fecha caducidad anterior se ingresa correctamente", async ({ page }) => {
    const captura = await gotoLegacyCaptura(page);

    // Ingresar fecha ya vencida (ayer)
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    await captura.fillCaducidad(ayer.toISOString().slice(0, 10));

    // Verificar que el valor se ingresó correctamente
    const caducidadInput = page.locator('input[type="date"]').first();
    await expect(caducidadInput).toHaveValue(ayer.toISOString().slice(0, 10));
  });

  test("escaneo múltiples tarimas consecutivas (reentrada al flujo)", async ({ page }) => {
    const home = new HomePage(page);

    // Tarima 1 - flujo completo (modo legacy de CapturaTarima)
    let captura = await gotoLegacyCaptura(page);
    await captura.completeTarimaForm({
      lote: "LT-MULTI-1",
      caducidad: "2028-01-01",
    });
    await captura.clickSiguiente();
    await page.waitForTimeout(2000);
    await captura.completeTarimaForm({
      lote: "LT-MULTI-2",
      caducidad: "2028-01-01",
    });
    await captura.clickSiguiente();
    await page.waitForTimeout(2000);
    await captura.completeTarimaForm({
      lote: "LT-MULTI-3",
      caducidad: "2028-01-01",
    });
    await captura.clickSiguiente();
    await page.waitForTimeout(2000);
    await captura.completeTarimaForm({
      lote: "LT-MULTI-4",
      caducidad: "2028-01-01",
    });
    await captura.clickSiguiente();
    await page.waitForTimeout(2000);
    await captura.completeTarimaForm({
      lote: "LT-MULTI-5",
      caducidad: "2028-01-01",
    });
    await captura.clickSiguiente();

    // Verificar finalización
    await expect(page.getByText("Recepción completada")).toBeVisible({
      timeout: 10000,
    });

    // Volver a Home (pantalla de éxito tiene botón para volver)
    await home.goto("/");
    await home.expectLoaded();

    // Nueva tarima - reentrada a CapturaTarima legacy
    captura = await gotoLegacyCaptura(page);
  });
});

test.describe("Flujo: Captura de Tarima - Casos Edge", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  async function gotoEscanearQR(page) {
    // Usar ruta de test directa para EscanearQR
    await page.goto("/?test=escanear-qr", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000); // Dar tiempo al useEffect para ejecutarse

    const escanear = new EscanearQRPage(page);
    await escanear.expectOnScanScreen();
  }

  test("ID inválido no navega y muestra error o permanece en escaneo", async ({ page }) => {
    await gotoEscanearQR(page);
    const escanear = new EscanearQRPage(page);
    await escanear.expectOnScanScreen();

    await escanear.enterManualTarimaId("INVALID-ID-123");

    // La UI puede permanecer en escaneo o mostrar el estado explícito de no encontrado.
    await expect(page.getByText("Tarima no encontrada")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByRole("button", { name: "Volver al escáner" })).toBeVisible();
  });

  test("input manual vacío no envía formulario", async ({ page }) => {
    await gotoEscanearQR(page);
    const escanear = new EscanearQRPage(page);
    await escanear.expectOnScanScreen();

    await page.getByRole("button", { name: "Buscar" }).click();

    // Debe mantenerse en pantalla (validación cliente)
    await expect(page.getByText("Escanear código QR")).toBeVisible();
  });

  test("cancelar en escaneo vuelve a home", async ({ page }) => {
    await gotoEscanearQR(page);
    const escanear = new EscanearQRPage(page);
    await escanear.expectOnScanScreen();

    await escanear.clickCancel();

    // Debe navegar a Home (pantalla principal)
    const home = new HomePage(page);
    await home.expectLoaded();
  });
});
