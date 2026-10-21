import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Seeds the Firestore emulator through its REST API. Runs after Playwright's
// webServer has answered on :8082 (webServer starts before globalSetup), and
// PATCH is create-or-replace so re-runs overwrite instead of duplicating.
const FIRESTORE_EMULATOR =
  "http://127.0.0.1:8082/v1/projects/demo-exepa-e2e/databases/(default)/documents";
const ORG_ID = "org_exepa_001";
const WAREHOUSE_ID = "wh_tehuacan_1";
const CATALOG_PATH = resolve(process.cwd(), "data/catalog/tehuacan-1-expiries-2026-10-04.json");

const str = (v: string) => ({ stringValue: v });
const int = (v: number) => ({ integerValue: String(v) });
const bool = (v: boolean) => ({ booleanValue: v });
const ts = (d: Date) => ({ timestampValue: d.toISOString() });

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000);
const monthKeyOf = (d: Date) => `${MONTHS[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`;

async function putDocument(path: string, fields: Record<string, unknown>): Promise<void> {
  const url = `${FIRESTORE_EMULATOR}/${path}`;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 20; attempt++) {
    try {
      const res = await fetch(url, {
        // PATCH creates-or-replaces; PUT only updates existing documents.
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      if (res.ok) return;
      const body = (await res.text()).slice(0, 300);
      lastError = new Error(`HTTP ${res.status} for ${path}: ${body}`);
      // 4xx means the payload/path is wrong; retrying cannot fix it.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw lastError;
      }
    } catch (err) {
      if (err === lastError) throw err;
      lastError = err; // emulator not accepting connections yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw lastError;
}

interface CatalogLot {
  id: string;
  warehouseId: string;
  productId: string;
  productName: string;
  lot: string;
  monthKey: string;
  expiryDate: string;
  cajas: number;
  sourceRow?: string;
  sourceQuantity?: number;
  inventoryQuantity?: number;
  quantityMismatch?: boolean;
  expiryPrecision?: string;
  sourceAdjustment?: string;
}

interface Catalog {
  organizationId: string;
  sourceFile: string;
  sourceDate: string;
  lots: CatalogLot[];
}

async function seedLotes(): Promise<number> {
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8")) as Catalog;
  for (const lot of catalog.lots) {
    const fields: Record<string, unknown> = {
      organizationId: str(catalog.organizationId),
      warehouseId: str(lot.warehouseId),
      productId: str(lot.productId),
      productName: str(lot.productName),
      lot: str(lot.lot),
      monthKey: str(lot.monthKey),
      expiryDate: ts(new Date(`${lot.expiryDate}T00:00:00.000Z`)),
      cajas: int(lot.cajas),
      quantityMismatch: bool(lot.quantityMismatch ?? false),
      expiryPrecision: str(lot.expiryPrecision ?? "month"),
      sourceFile: str(catalog.sourceFile),
      sourceDate: str(catalog.sourceDate),
      // BaseService.getAll orders by createdAt DESC by default, and Firestore
      // drops documents that lack the orderBy field.
      createdAt: ts(new Date(`${lot.expiryDate}T00:00:00.000Z`)),
    };
    if (lot.sourceRow !== undefined) fields.sourceRow = str(lot.sourceRow);
    if (lot.sourceQuantity !== undefined) fields.sourceQuantity = int(lot.sourceQuantity);
    if (lot.inventoryQuantity !== undefined) fields.inventoryQuantity = int(lot.inventoryQuantity);
    if (lot.sourceAdjustment !== undefined) fields.sourceAdjustment = str(lot.sourceAdjustment);
    await putDocument(`organizations/${ORG_ID}/lotes_caducidades/${lot.id}`, fields);
  }

  // Synthetic rows: the suite filters on "proximo" (needs >=1 row after the
  // filter) and searches for "Coca" (productName/lot/monthKey must contain it).
  const proximoDate = daysFromNow(15);
  const vencidoDate = daysFromNow(-5);
  const shared = {
    organizationId: str(ORG_ID),
    warehouseId: str(WAREHOUSE_ID),
    quantityMismatch: bool(false),
    expiryPrecision: str("day"),
    sourceFile: str("E2E synthetic row"),
    sourceDate: str(new Date().toISOString().slice(0, 10)),
    createdAt: ts(new Date()),
  };
  await putDocument(`organizations/${ORG_ID}/lotes_caducidades/cad_E2E_proximo`, {
    ...shared,
    productId: str("E2E-PROXIMO"),
    productName: str("COCA COLA 3L E2E"),
    lot: str("E2E-BATCH-01"),
    monthKey: str(monthKeyOf(proximoDate)),
    expiryDate: ts(proximoDate),
    cajas: int(24),
  });
  await putDocument(`organizations/${ORG_ID}/lotes_caducidades/cad_E2E_vencido`, {
    ...shared,
    productId: str("E2E-VENCIDO"),
    productName: str("PRODUCTO VENCIDO E2E"),
    lot: str("E2E-BATCH-02"),
    monthKey: str(monthKeyOf(vencidoDate)),
    expiryDate: ts(vencidoDate),
    cajas: int(6),
  });
  return catalog.lots.length + 2;
}

// pallets.getByQR runs a collection-group query on qrIdentifier + warehouseId;
// the mock profile is a global ADMIN, so authorized warehouses are canonical.
async function seedPallet(): Promise<void> {
  await putDocument(`organizations/${ORG_ID}/receptions/rec_e2e_001/pallets/pallet_e2e_001`, {
    organizationId: str(ORG_ID),
    warehouseId: str(WAREHOUSE_ID),
    receptionId: str("rec_e2e_001"),
    qrIdentifier: str("TQR-24891-001"),
    lot: str("E2E-BATCH-01"),
    expiryDate: ts(daysFromNow(45)),
    quantity: int(48),
    unit: str("cajas"),
    status: str("RECEIVED"),
    location: str("A-01-01"),
    createdAt: ts(new Date()),
  });
}

export default async function globalSetup(): Promise<void> {
  const lotes = await seedLotes();
  await seedPallet();
  console.log(
    `[global-setup] Emulator seeded: ${lotes} lotes + pallet TQR-24891-001 (org=${ORG_ID}, wh=${WAREHOUSE_ID})`,
  );
}
