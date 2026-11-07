import { Page, Locator, expect } from "@playwright/test";

/**
 * Utilidades comunes para tests E2E
 */
export class TestUtils {
  constructor(private page: Page) {}

  /** Espera a que desaparezca el loading de catálogos */
  async waitForCatalogsLoaded(): Promise<void> {
    await expect(this.page.locator("text=Cargando catálogos")).toBeHidden({
      timeout: 15000,
    });
  }

  /** Verifica que no hay errores en consola */
  async assertNoConsoleErrors(ignorePatterns: RegExp[] = []): Promise<void> {
    const errors: string[] = [];
    this.page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        if (!ignorePatterns.some((p) => p.test(text))) {
          errors.push(text);
        }
      }
    });
    this.page.on("pageerror", (err) => {
      if (!ignorePatterns.some((p) => p.test(err.message))) {
        errors.push(err.message);
      }
    });

    // Espera un poco para capturar errores async
    await this.page.waitForTimeout(1000);

    if (errors.length > 0) {
      throw new Error(`Console errors detected:\n${errors.join("\n")}`);
    }
  }

  /** Rellena un select personalizado (componente Select) */
  async selectOption(label: string, optionText: string): Promise<void> {
    // Click en el select para abrirlo
    const selectButton = this.page.locator(
      `label:has-text("${label}") + div button, label:has-text("${label}") ~ div button`,
    );
    await selectButton.click();

    // Espera y click en la opción
    await this.page.locator(`[role="option"]:has-text("${optionText}")`).click();
  }

  /** Rellena un input por su label asociado */
  async fillInput(label: string, value: string): Promise<void> {
    const input = this.page.locator(
      `label:has-text("${label}") + input, label:has-text("${label}") ~ input, input[placeholder*="${label}" i]`,
    );
    await input.fill(value);
  }

  /** Sube un archivo al input de tipo file */
  async uploadFile(inputSelector: string, filePath: string): Promise<void> {
    await this.page.setInputFiles(inputSelector, filePath);
  }

  /** Click en botón por texto */
  async clickButton(text: string): Promise<void> {
    await this.page.locator(`button:has-text("${text}")`).click();
  }

  /** Espera a que aparezca un toast/mensaje de error */
  async expectErrorMessage(text: string): Promise<void> {
    await expect(this.page.locator(`text=${text}, [role="alert"]:has-text("${text}")`)).toBeVisible(
      { timeout: 5000 },
    );
  }

  /** Espera a que desaparezca un spinner/loading */
  async waitForLoadingToFinish(): Promise<void> {
    await expect(
      this.page.locator('[class*="spin"], [class*="loading"], .animate-spin'),
    ).toBeHidden({ timeout: 30000 });
  }

  /** Navega y espera a que la página cargue */
  async gotoAndWait(path: string): Promise<void> {
    await this.page.goto(path, { waitUntil: "networkidle" });
    await this.waitForLoadingToFinish();
  }

  /** Obtiene el valor de localStorage */
  async getLocalStorage(key: string): Promise<string | null> {
    return await this.page.evaluate((k) => localStorage.getItem(k), key);
  }

  /** Simula estar offline */
  async goOffline(): Promise<void> {
    await this.page.context().setOffline(true);
  }

  /** Simula estar online */
  async goOnline(): Promise<void> {
    await this.page.context().setOffline(false);
  }

  /** Espera a que se complete una operación asíncrona (por estado de botón) */
  async waitForButtonState(buttonText: string, disabled: boolean): Promise<void> {
    const btn = this.page.locator(`button:has-text("${buttonText}")`);
    if (disabled) {
      await expect(btn).toBeDisabled();
    } else {
      await expect(btn).toBeEnabled();
    }
  }
}

/**
 * Genera datos de prueba únicos
 */
export function generateTestData() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return {
    ocFolio: `OC-QA-${timestamp}`,
    tarimas: "5",
    proveedor: "Proveedor Norte",
    proveedorLogistico: "Logística Veloz",
    operationId: `OP-QA-${timestamp}-${random}`,
  };
}

/**
 * Espera a que una promesa se resuelva con timeout
 */
export async function waitFor<T>(promise: Promise<T>, timeoutMs: number = 10000): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

/**
 * Verifica que un elemento tiene atributos de accesibilidad correctos
 */
export async function assertAccessibility(page: Page, selector: string): Promise<void> {
  const element = page.locator(selector);
  await expect(element).toBeVisible();
  // Verifica atributos básicos
  const tagName = await element.evaluate((el) => el.tagName.toLowerCase());
  if (["button", "a"].includes(tagName)) {
    // Elementos interactivos deben tener nombre accesible
    const accessibleName =
      (await element.getAttribute("aria-label")) || (await element.textContent());
    if (!accessibleName?.trim()) {
      throw new Error(`Element ${selector} lacks accessible name`);
    }
  }
}
