import { Page, expect } from "@playwright/test";
import { TestUtils, generateTestData } from "./test-utils";

/**
 * Base Page Object
 */
export abstract class BasePage {
  protected utils: TestUtils;

  constructor(protected page: Page) {
    this.utils = new TestUtils(page);
  }

  async goto(path: string): Promise<void> {
    const navigation = {
      "/configuracion": async () =>
        this.page.getByRole("button", { name: "Config.", exact: true }).click(),
      "/embarques": async () =>
        this.page.getByRole("button", { name: "Embarques", exact: true }).click(),
      "/programacion-recepcion": async () =>
        this.page.getByRole("button", { name: /Programar recepción/ }).click(),
    }[path];

    if (!navigation) {
      await this.utils.gotoAndWait(path);
      return;
    }

    await this.utils.gotoAndWait("/");
    await navigation();
    await this.utils.waitForLoadingToFinish();
  }

  async assertNoErrors(): Promise<void> {
    await this.utils.assertNoConsoleErrors([/favicon/, /Extension/, /webpack/, /hot-update/]);
  }
}

/**
 * NuevaRecepcionStep1 - Primera pantalla de recepción
 */
export class NuevaRecepcionStep1Page extends BasePage {
  private selectors = {
    hasOCYes: 'button:has-text("Sí, tengo OC")',
    hasOCNo: 'button:has-text("No tengo OC")',
    ocFolioInput: 'input[placeholder*="folio" i], input[name*="folio" i]',
    tarimasInput: 'input[placeholder*="tarima" i], input[name*="tarima" i]',
    proveedorSelect: 'label:has-text("Proveedor de mercancía") + div button',
    proveedorLogisticoSelect: 'label:has-text("Proveedor logístico") + div button',
    fileInput: 'input[type="file"][accept*="pdf"], input[type="file"][accept*="image"]',
    continueButton: 'button:has-text("Continuar")',
    loadingSpinner: '.animate-spin, [class*="spin"]',
    errorMessage: '[role="alert"], .text-red-700, .bg-red-',
    ocrResult: "text=OCR detectado",
    conversionsTable: "text=Conversiones y Stickers",
    retryEvidenceButton: 'button:has-text("Reintentar evidencia")',
    continueWithoutEvidence: "text=Continuar sin evidencia",
  };

  async openFromHome(): Promise<void> {
    // Primero ir a home si no estamos ahí
    await this.page.goto("/", { waitUntil: "networkidle" });
    console.log(`[openFromHome] Current URL: ${this.page.url()}`);
    console.log(`[openFromHome] Page title: ${await this.page.title()}`);
    // Debug: log all buttons on the page
    const buttons = await this.page.locator("button").allTextContents();
    console.log("[openFromHome] Buttons on page:", buttons);
    // Click en "Nueva recepción" en la pantalla Home
    await this.page.getByRole("button", { name: "Nueva recepción" }).first().click();
    await this.utils.waitForLoadingToFinish();
    await this.waitForCatalogsLoaded();
  }

  async waitForCatalogsLoaded(): Promise<void> {
    await this.utils.waitForCatalogsLoaded();
  }

  async selectHasOC(hasOC: boolean): Promise<void> {
    const selector = hasOC ? this.selectors.hasOCYes : this.selectors.hasOCNo;
    console.log(`Looking for selector: ${selector}`);
    console.log(`Current URL: ${this.page.url()}`);
    // Debug: log all buttons on the page
    const buttons = await this.page.locator("button").allTextContents();
    console.log("Buttons on page:", buttons);
    const pageContent = await this.page.content();
    console.log("Page content length:", pageContent.length);
    await this.page.waitForSelector(selector, {
      state: "visible",
      timeout: 15000,
    });
    await this.page.click(selector);
  }

  async fillOCFolio(folio: string): Promise<void> {
    await this.utils.fillInput("Folio", folio);
  }

  async fillTarimas(tarimas: string): Promise<void> {
    await this.utils.fillInput("Tarimas", tarimas);
  }

  async selectProveedor(nombre: string): Promise<void> {
    await this.utils.selectOption("Proveedor de mercancía", nombre);
  }

  async selectProveedorLogistico(nombre: string): Promise<void> {
    await this.utils.selectOption("Proveedor logístico", nombre);
  }

  async uploadOCRFile(filePath: string): Promise<void> {
    await this.page.setInputFiles(this.selectors.fileInput, filePath);
    // Esperar a que termine el procesamiento OCR
    await this.utils.waitForLoadingToFinish();
    await expect(this.page.locator(this.selectors.ocrResult)).toBeVisible({
      timeout: 30000,
    });
  }

  async clickContinue(): Promise<void> {
    await this.utils.clickButton("Continuar");
  }

  async waitForCreation(): Promise<void> {
    await this.utils.waitForLoadingToFinish();
    // Espera a que desaparezca "Creando recepción..." o "Guardando evidencia..."
    await expect(this.page.locator("text=Creando recepción, text=Guardando evidencia")).toBeHidden({
      timeout: 60000,
    });
  }

  async expectError(message: string): Promise<void> {
    await this.utils.expectErrorMessage(message);
  }

  async expectOCRResult(): Promise<void> {
    await expect(this.page.locator(this.selectors.ocrResult)).toBeVisible({
      timeout: 30000,
    });
  }

  async expectConversionsTable(): Promise<void> {
    await expect(this.page.locator(this.selectors.conversionsTable)).toBeVisible({
      timeout: 10000,
    });
  }

  async expectRetryEvidenceOption(): Promise<void> {
    await expect(this.page.locator(this.selectors.retryEvidenceButton)).toBeVisible();
  }

  async expectContinueWithoutEvidence(): Promise<void> {
    await expect(this.page.locator(this.selectors.continueWithoutEvidence)).toBeVisible();
  }

  async clickRetryEvidence(): Promise<void> {
    await this.utils.clickButton("Reintentar evidencia");
  }

  async clickContinueWithoutEvidence(): Promise<void> {
    await this.page.click("text=Continuar sin evidencia");
  }

  /** Flujo completo: Recepción con OC + archivo OCR */
  async completeReceptionWithOC(data = generateTestData()): Promise<void> {
    await this.selectHasOC(true);
    await this.fillOCFolio(data.ocFolio);
    await this.fillTarimas(data.tarimas);
    await this.selectProveedor(data.proveedor);
    await this.selectProveedorLogistico(data.proveedorLogistico);
    // Nota: OCR file upload requiere archivo real
    await this.clickContinue();
    await this.waitForCreation();
  }

  /** Flujo completo: Recepción SIN OC */
  async completeReceptionWithoutOC(data = generateTestData()): Promise<void> {
    await this.selectHasOC(false);
    await this.fillTarimas(data.tarimas);
    await this.selectProveedor(data.proveedor);
    await this.selectProveedorLogistico(data.proveedorLogistico);
    await this.clickContinue();
    await this.waitForCreation();
  }
}

/**
 * NuevaRecepcionStep2 - Segunda pantalla (detalle de líneas)
 */
export class NuevaRecepcionStep2Page extends BasePage {
  private selectors = {
    backButton: 'button:has-text("Atrás")',
    continueButton: 'button:has-text("Continuar")',
    productRows: "table tbody tr",
    loteInput: 'input[placeholder*="lote" i]',
    caducidadInput: 'input[type="date"], input[placeholder*="caduc" i]',
    cantidadInput: 'input[type="number"]',
  };

  async verifyProductsLoaded(expectedCount: number): Promise<void> {
    await expect(this.page.locator(this.selectors.productRows)).toHaveCount(expectedCount);
  }

  async fillLoteForRow(rowIndex: number, lote: string): Promise<void> {
    await this.page
      .locator(this.selectors.productRows)
      .nth(rowIndex)
      .locator(this.selectors.loteInput)
      .fill(lote);
  }

  async fillCaducidadForRow(rowIndex: number, fecha: string): Promise<void> {
    await this.page
      .locator(this.selectors.productRows)
      .nth(rowIndex)
      .locator(this.selectors.caducidadInput)
      .fill(fecha);
  }

  async clickContinue(): Promise<void> {
    await this.utils.clickButton("Continuar");
    await this.utils.waitForLoadingToFinish();
  }

  async clickBack(): Promise<void> {
    await this.utils.clickButton("Atrás");
  }
}

/**
 * RecepcionCompletada - Pantalla final
 */
export class RecepcionCompletadaPage extends BasePage {
  private selectors = {
    successMessage: "text=Recepción completada, text=confirmada, text=guardada",
    tarimasTotal: "text=/\\d+\\s*TARIMAS/i",
    qrCodes: 'img[alt*="QR"], canvas',
    printButton: 'button:has-text("Imprimir"), button:has-text("Etiquetas")',
    newReceptionButton: 'button:has-text("Nueva recepción")',
  };

  async expectSuccess(): Promise<void> {
    await expect(this.page.locator(this.selectors.successMessage)).toBeVisible({
      timeout: 10000,
    });
  }

  async expectTarimasCount(count: number): Promise<void> {
    await expect(this.page.locator(this.selectors.tarimasTotal)).toContainText(count.toString());
  }

  async expectQRCodes(count: number): Promise<void> {
    await expect(this.page.locator(this.selectors.qrCodes)).toHaveCount(count);
  }
}

/**
 * ProgramacionRecepcion - Flujo OCR programado
 */
export class ProgramacionRecepcionPage extends BasePage {
  private selectors = {
    fileInput: 'input[type="file"]',
    uploadButton: 'button:has-text("Subir"), button:has-text("Cargar")',
    ocrResults: "text=OCR, text=Resultado",
    matchProductsStep: "text=Match, text=Productos",
    conversionsStep: "text=Conversiones",
    completeStep: "text=Completar",
    continueButton: 'button:has-text("Continuar"), button:has-text("Siguiente")',
    backButton: 'button:has-text("Atrás")',
  };

  async uploadFile(filePath: string): Promise<void> {
    await this.page.setInputFiles(this.selectors.fileInput, filePath);
    await this.utils.waitForLoadingToFinish();
  }

  async expectOCRResults(): Promise<void> {
    await expect(this.page.locator(this.selectors.ocrResults)).toBeVisible({
      timeout: 30000,
    });
  }

  async clickContinue(): Promise<void> {
    await this.utils.clickButton("Continuar");
    await this.utils.waitForLoadingToFinish();
  }

  async clickComplete(): Promise<void> {
    await this.utils.clickButton("Completar");
    await this.utils.waitForLoadingToFinish();
  }
}

/**
 * Embarques - Gestión de embarques
 */
export class EmbarquesPage extends BasePage {
  private selectors = {
    newShipmentButton: 'button:has-text("Nuevo embarque"), button:has-text("Crear embarque")',
    shipmentList: 'table tbody tr, [class*="shipment"]',
    productSelector: 'label:has-text("Producto") + div button',
    warehouseSelector: 'label:has-text("Almacén") + div button',
    quantityInput: 'input[type="number"]',
    confirmButton: 'button:has-text("Confirmar")',
    scanQRButton: 'button:has-text("Escanear"), button:has-text("QR")',
  };

  async createShipment(product: string, warehouse: string, quantity: string): Promise<void> {
    await this.utils.clickButton("Nuevo embarque");
    await this.utils.selectOption("Producto", product);
    await this.utils.selectOption("Almacén", warehouse);
    await this.utils.fillInput("Cantidad", quantity);
    await this.utils.clickButton("Confirmar");
    await this.utils.waitForLoadingToFinish();
  }

  async expectShipmentInList(shipmentId: string): Promise<void> {
    await expect(this.page.locator(`text=${shipmentId}`)).toBeVisible();
  }
}

/**
 * Configuracion - Administración
 */
export class ConfiguracionPage extends BasePage {
  async goToTab(tab: "almacenes" | "proveedores" | "conversiones"): Promise<void> {
    if (tab === "proveedores") {
      await this.selectSupplierType("mercancias");
      return;
    }

    const tabMap = {
      almacenes: /Almacenes/,
      conversiones: /Conversiones/,
    };
    const selectedTab = this.page.getByRole("tab", { name: tabMap[tab] });
    await selectedTab.click();
    await this.utils.waitForLoadingToFinish();
    await expect(selectedTab).toHaveAttribute("aria-selected", "true");
  }

  async selectSupplierType(type: "mercancias" | "logistica"): Promise<void> {
    const tabName = type === "mercancias" ? /Prov\. Mercancía/ : /Prov\. Logística/;
    const selectedTab = this.page.getByRole("tab", { name: tabName });
    await selectedTab.click();
    await this.utils.waitForLoadingToFinish();
    await expect(selectedTab).toHaveAttribute("aria-selected", "true");
  }

  async createAlmacen(nombre: string, ubicacion: string, responsable: string): Promise<void> {
    await this.goToTab("almacenes");
    await this.utils.clickButton("Nuevo");
    await this.utils.fillInput("Nombre", nombre);
    await this.utils.fillInput("Ubicación", ubicacion);
    await this.utils.fillInput("Responsable", responsable);
    await this.utils.clickButton("Guardar");
    await this.utils.waitForLoadingToFinish();
  }
}

/**
 * Login / Autenticación
 */
export class LoginPage extends BasePage {
  private selectors = {
    emailInput: 'input[type="email"]',
    passwordInput: 'input[type="password"]',
    loginButton: 'button:has-text("Iniciar sesión"), button:has-text("Entrar")',
    errorMessage: '[role="alert"], .text-red',
  };

  async login(email: string, password: string): Promise<void> {
    await this.page.fill(this.selectors.emailInput, email);
    await this.page.fill(this.selectors.passwordInput, password);
    await this.page.click(this.selectors.loginButton);
    await this.utils.waitForLoadingToFinish();
  }
}

/**
 * EscanearQR - Escaneo de código QR de tarima (cámara o manual)
 */
export class EscanearQRPage extends BasePage {
  private selectors = {
    videoFeed: "video",
    manualInput: 'input[placeholder*="TQR" i], input[placeholder*="ID" i]',
    buscarButton: 'button:has-text("Buscar")',
    cancelButton: 'button:has-text("Cancelar")',
    errorMessage: "text=No se pudo acceder a la cámara",
    scanningIndicator: '.animate-scanline, [style*="scanline"]',
  };

  async goto(): Promise<void> {
    await this.utils.gotoAndWait("/escanear-qr");
    // Esperar a que cargue el componente (video o input manual)
    await expect(this.page.locator("text=Escanear código QR")).toBeVisible({
      timeout: 10000,
    });
  }

  async assertNoErrors(): Promise<void> {
    await this.utils.assertNoConsoleErrors([
      /favicon/,
      /Extension/,
      /webpack/,
      /hot-update/,
      /camera/,
      /permission/,
    ]);
  }

  /** Ingresa ID de tarima manualmente (fallback cuando no hay cámara en CI) */
  async enterManualTarimaId(tarimaId: string): Promise<void> {
    await this.page.fill(this.selectors.manualInput, tarimaId);
    await this.page.click(this.selectors.buscarButton);
    await this.utils.waitForLoadingToFinish();
  }

  /** Click en Cancelar → vuelve a pantalla anterior */
  async clickCancel(): Promise<void> {
    await this.page.click(this.selectors.cancelButton);
    await this.utils.waitForLoadingToFinish();
  }

  /** Verifica que está en pantalla de escaneo */
  async expectOnScanScreen(): Promise<void> {
    await expect(this.page.locator("text=Escanear código QR")).toBeVisible();
    await expect(this.page.locator(this.selectors.manualInput)).toBeVisible();
    await expect(this.page.locator(this.selectors.buscarButton)).toBeVisible();
  }
}

/**
 * TarimaDetalle - Detalle de tarima escaneada
 */
export class TarimaDetallePage extends BasePage {
  private selectors = {
    tarimaId: "text=/TQR-\\d+-\\d+/",
    productoTitle: "text=/Agua mineral|Refresco|Jugo|Leche/i",
    backButton: 'button:has-text("Ver referencia")',
    printButton: 'button:has-text("Imprimir")',
    downloadButton: 'button:has-text("Descargar")',
    downloadFormats: '[role="menu"] button, .absolute.bottom-\\[calc\\(100%\\+6px\\)\\] button',
    conditionBadge: "text=Buenas condiciones, text=Con incidencia",
    vigenteBadge: "text=Vigente",
    recepcionCompleta: "text=RECEPCIÓN COMPLETA",
    detailRows: "div.flex.items-start.justify-between.w-full",
  };

  async expectLoaded(tarimaId: string): Promise<void> {
    await expect(this.page.locator(`text=${tarimaId}`)).toBeVisible({
      timeout: 10000,
    });
    await expect(this.page.locator(this.selectors.productoTitle)).toBeVisible();
    await expect(this.page.locator(this.selectors.conditionBadge)).toBeVisible();
    await expect(this.page.locator(this.selectors.vigenteBadge)).toBeVisible();
  }

  async clickVerReferencia(): Promise<void> {
    await this.page.click(this.selectors.backButton);
    await this.utils.waitForLoadingToFinish();
  }

  async clickImprimir(): Promise<void> {
    await this.page.click(this.selectors.printButton);
  }

  async clickDescargar(format?: "SVG" | "PNG" | "JPEG" | "PDF"): Promise<void> {
    await this.page.click(this.selectors.downloadButton);
    if (format) {
      await this.page.click(`text=.${format.toLowerCase()}`);
    }
  }

  async getDetalleValue(label: string): Promise<string> {
    const row = this.page.locator(
      `div.flex.items-start.justify-between.w-full:has-text("${label}")`,
    );
    const value = row.locator("p.font-bold").first();
    return (await value.textContent()) || "";
  }

  async assertNoErrors(): Promise<void> {
    await this.utils.assertNoConsoleErrors([/favicon/, /Extension/, /webpack/, /hot-update/]);
  }
}

/**
 * CapturaTarima - Captura de lote, caducidad, condición por tarima
 */
export class CapturaTarimaPage extends BasePage {
  private selectors = {
    progressText: "text=/Tarima \\d+ de \\d+/",
    progressBar: ".bg-\\[\\#f2b84b\\].h-2",
    navDots: 'button[title*="Tarima"]',
    tarimaId: "text=/TQR-\\d+-\\d+/",
    productoInput:
      'input[value*="Agua mineral"], input[value*="Refresco"], input[value*="Jugo"], input[value*="Leche"]',
    loteInput: 'input[value*="LT-"]',
    caducidadInput: 'input[value*="Mar"], input[value*="202"], input[placeholder*="caduc" i]',
    cajasInput: 'input[value="48"], input[type="number"]',
    condicionBuenas: 'button:has-text("Buenas condiciones")',
    condicionIncidencia: 'button:has-text("Con incidencia")',
    btnAtras: 'button:has-text("Atrás"), button:has-text("← Tarima")',
    btnGuardarBorrador: 'button:has-text("Guardar borrador")',
    btnSiguiente: 'button:has-text("Tarima \\d+ →")',
    btnFinalizar: 'button:has-text("Finalizar recepción")',
    condicionBadge: "text=Buenas condiciones, text=Con incidencia",
  };

  async expectLoaded(expectedTarimaNum: number, total: number = 20): Promise<void> {
    await expect(this.page.locator(`text=Tarima ${expectedTarimaNum} de ${total}`)).toBeVisible({
      timeout: 10000,
    });
    await expect(this.page.locator(this.selectors.tarimaId)).toBeVisible();
    await expect(this.page.locator(this.selectors.productoInput)).toBeVisible();
    await expect(this.page.locator(this.selectors.loteInput)).toBeVisible();
    await expect(this.page.locator(this.selectors.caducidadInput)).toBeVisible();
    await expect(this.page.locator(this.selectors.cajasInput)).toBeVisible();
  }

  async fillProducto(value: string): Promise<void> {
    await this.page.fill(this.selectors.productoInput, value);
  }

  async fillLote(value: string): Promise<void> {
    await this.page.fill(this.selectors.loteInput, value);
  }

  async fillCaducidad(value: string): Promise<void> {
    await this.page.fill(this.selectors.caducidadInput, value);
  }

  async fillCajas(value: string): Promise<void> {
    await this.page.fill(this.selectors.cajasInput, value);
  }

  async selectCondicion(condicion: "buenas" | "incidencia"): Promise<void> {
    const btn =
      condicion === "buenas" ? this.selectors.condicionBuenas : this.selectors.condicionIncidencia;
    await this.page.click(btn);
  }

  async clickAtras(): Promise<void> {
    await this.page.click(this.selectors.btnAtras);
    await this.utils.waitForLoadingToFinish();
  }

  async clickGuardarBorrador(): Promise<void> {
    await this.page.click(this.selectors.btnGuardarBorrador);
    await this.utils.waitForLoadingToFinish();
  }

  async clickSiguiente(): Promise<void> {
    await this.page.click(this.selectors.btnSiguiente);
    await this.utils.waitForLoadingToFinish();
  }

  async clickFinalizar(): Promise<void> {
    await this.page.click(this.selectors.btnFinalizar);
    await this.utils.waitForLoadingToFinish();
  }

  /** Navega a tarima específica por número (click en dot) */
  async goToTarima(num: number): Promise<void> {
    await this.page.click(`button[title="Tarima ${num}"]`);
    await this.utils.waitForLoadingToFinish();
  }

  async getCurrentTarimaNumber(): Promise<number> {
    const text = await this.page.locator(this.selectors.progressText).textContent();
    const match = text?.match(/Tarima (\d+) de /);
    return match ? parseInt(match[1], 10) : 1;
  }

  async assertNoErrors(): Promise<void> {
    await this.utils.assertNoConsoleErrors([/favicon/, /Extension/, /webpack/, /hot-update/]);
  }

  /** Completa formulario de una tarima con datos de prueba */
  async completeTarimaForm(
    data: {
      producto?: string;
      lote?: string;
      caducidad?: string;
      cajas?: string;
      condicion?: "buenas" | "incidencia";
    } = {},
  ): Promise<void> {
    if (data.producto) await this.fillProducto(data.producto);
    if (data.lote) await this.fillLote(data.lote);
    if (data.caducidad) await this.fillCaducidad(data.caducidad);
    if (data.cajas) await this.fillCajas(data.cajas);
    if (data.condicion) await this.selectCondicion(data.condicion);
  }
}
