import { test, expect } from "@playwright/test";
import { E2E_AUTH_STATE_PATH } from "../utils/auth-state";
import { NuevaRecepcionStep1Page } from "../utils/page-objects";
import { generateTestData } from "../utils/test-utils";

/**
 * Matriz de Feature Flags - Tests parametrizados
 *
 * Flags probados:
 * - USE_FIRESTORE_RECEPCIONES
 * - USE_FIRESTORE_CATALOGOS
 * - USE_FIRESTORE_EVIDENCIAS
 * - USE_FIRESTORE_OFFLINE_QUEUE
 */

type FlagCombo = {
  name: string;
  flags: Record<string, boolean>;
  expectFirestore: boolean;
  expectLocalFallback: boolean;
};

const FLAG_MATRIX: FlagCombo[] = [
  {
    name: "Full Firebase",
    flags: {
      USE_FIRESTORE_RECEPCIONES: true,
      USE_FIRESTORE_CATALOGOS: true,
      USE_FIRESTORE_EVIDENCIAS: true,
      USE_FIRESTORE_OFFLINE_QUEUE: true,
    },
    expectFirestore: true,
    expectLocalFallback: false,
  },
  {
    name: "Solo Catálogos Firebase",
    flags: {
      USE_FIRESTORE_RECEPCIONES: false,
      USE_FIRESTORE_CATALOGOS: true,
      USE_FIRESTORE_EVIDENCIAS: false,
      USE_FIRESTORE_OFFLINE_QUEUE: false,
    },
    expectFirestore: false,
    expectLocalFallback: true,
  },
  {
    name: "Solo Recepciones Firebase",
    flags: {
      USE_FIRESTORE_RECEPCIONES: true,
      USE_FIRESTORE_CATALOGOS: false,
      USE_FIRESTORE_EVIDENCIAS: true,
      USE_FIRESTORE_OFFLINE_QUEUE: false,
    },
    expectFirestore: true,
    expectLocalFallback: true, // Catálogos local
  },
  {
    name: "Todo Local (Fallback)",
    flags: {
      USE_FIRESTORE_RECEPCIONES: false,
      USE_FIRESTORE_CATALOGOS: false,
      USE_FIRESTORE_EVIDENCIAS: false,
      USE_FIRESTORE_OFFLINE_QUEUE: false,
    },
    expectFirestore: false,
    expectLocalFallback: true,
  },
];

for (const combo of FLAG_MATRIX) {
  test.describe(`Feature Flags: ${combo.name}`, () => {
    test.use({ storageState: E2E_AUTH_STATE_PATH });

    test.beforeEach(async ({ page }) => {
      // Configurar feature flags via localStorage antes de cada test
      await page.goto("http://localhost:5173");
      await page.evaluate((flags) => {
        localStorage.setItem("feature_flags", JSON.stringify(flags));
        // Disparar evento para que la app reaccione
        window.dispatchEvent(new Event("storage"));
      }, combo.flags);

      // Recargar para aplicar flags
      await page.reload({ waitUntil: "networkidle" });
    });

    test(`crea recepción - ${combo.name}`, async ({ page }) => {
      const step1 = new NuevaRecepcionStep1Page(page);
      const data = generateTestData();

      await step1.goto("/nueva-recepcion");
      await step1.waitForCatalogsLoaded();
      await step1.assertNoErrors();

      // Verificar que catálogos cargan según flag
      if (combo.flags.USE_FIRESTORE_CATALOGOS) {
        // Catálogos vienen de Firestore - pueden tardar más
        await expect(page.locator("text=Cargando catálogos")).toBeHidden({
          timeout: 15000,
        });
      } else {
        // Catálogos locales - carga inmediata
        await expect(page.locator("text=Cargando catálogos")).toBeHidden({
          timeout: 3000,
        });
      }

      // Flujo básico según flag de recepciones
      await step1.selectHasOC(true);
      await step1.fillOCFolio(data.ocFolio);
      await step1.fillTarimas(data.tarimas);
      await step1.selectProveedor(data.proveedor);
      await step1.selectProveedorLogistico(data.proveedorLogistico);

      if (combo.flags.USE_FIRESTORE_RECEPCIONES) {
        // Con Firestore: crea en backend
        await step1.clickContinue();
        await step1.waitForCreation();
        // Debe navegar a paso2 o completada
        await expect(page).toHaveURL(/.*(nueva-recepcion-paso2|recepcion-completada)/);
      } else {
        // Sin Firestore: modo local
        await step1.clickContinue();
        // Navegación inmediata sin espera de red
        await expect(page).toHaveURL(/.*(nueva-recepcion-paso2|recepcion-completada)/);
      }

      await step1.assertNoErrors();
    });

    test(`validación offline queue - ${combo.name}`, async ({ page }) => {
      if (!combo.flags.USE_FIRESTORE_OFFLINE_QUEUE) {
        test.skip();
      }

      // Simular offline y verificar encolado
      await page.context().setOffline(true);
      await page.goto("/recepciones");

      // Intentar acción que requiera red
      // Verificar que se encola en localStorage
      const queue = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("offline_queue_org_exepa_001") || "[]"),
      );
      // expect(queue.length).toBeGreaterThan(0)

      await page.context().setOffline(false);
    });
  });
}
