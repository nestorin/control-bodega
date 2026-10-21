import { test, expect, type Page } from "@playwright/test";

/**
 * FEFO — Lotes y Caducidades.
 *
 * Seeds (global-setup): catálogo Tehuacan-1 (3 lotes con fecha fija) +
 * cad_E2E_proximo (+15d) + cad_E2E_vencido (-5d).
 *
 * Todas las aserciones de estado/mes son clock-aware: recalculan lo que la
 * pantalla DEBE mostrar con la misma fórmula que getStatus()/monthKeyOf() de
 * src/screens/LotesCaducidades.tsx, así el spec no caduca con el paso del
 * tiempo (ej. al acercarse el lote dic-26 a los 30 días deja de ser "ok").
 */

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000);

const monthKeyOf = (d: Date) => `${MONTHS[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`;

function statusOf(expiry: Date): "ok" | "proximo" | "vencido" {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const diff = Math.ceil((expiry.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return "vencido";
  if (diff <= 30) return "proximo";
  return "ok";
}

const SEED_LOTS = [
  {
    name: "BEBIDA SABOR COLA 3L C/6 PZS S",
    expiry: new Date("2026-12-01T00:00:00.000Z"),
    // monthKey stored by the catalog JSON (expiry is UTC midnight; recomputing
    // monthKey locally would yield nov-26 — the screen filters on the STORED value).
    monthKey: "dic-26",
  },
  {
    name: "LECHE EVAPORADA 360 GRS C/48 PZS S",
    expiry: new Date("2027-07-01T00:00:00.000Z"),
    monthKey: "jul-27",
  },
  {
    name: "LECHE CONDENSADA 375 GRS C/48 PZS S",
    expiry: new Date("2027-07-01T00:00:00.000Z"),
    monthKey: "jul-27",
  },
  {
    name: "COCA COLA 3L E2E",
    expiry: daysFromNow(15),
    monthKey: monthKeyOf(daysFromNow(15)),
  },
  {
    name: "PRODUCTO VENCIDO E2E",
    expiry: daysFromNow(-5),
    monthKey: monthKeyOf(daysFromNow(-5)),
  },
];

const BADGE: Record<"ok" | "proximo" | "vencido", string> = {
  ok: "OK",
  proximo: "PRÓXIMO",
  vencido: "VENCIDO",
};

function tally() {
  const t = { ok: 0, proximo: 0, vencido: 0 };
  for (const lot of SEED_LOTS) t[statusOf(lot.expiry)]++;
  return t;
}

const proximoKey = () => monthKeyOf(daysFromNow(15));

async function statNumber(page: Page, label: RegExp): Promise<number> {
  const text = await page.locator("span").filter({ hasText: label }).first().textContent();
  const match = text?.match(/(\d+)/);
  if (!match) throw new Error(`Stat "${label}" no encontrada en: ${text}`);
  return parseInt(match[1], 10);
}

test.describe("FEFO: Lotes y Caducidades", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    await page.goto("/");
    await expect(page.getByRole("button", { name: "Inventario", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Inventario", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Lotes y Caducidades" })).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(SEED_LOTS.length, {
      timeout: 15_000,
    });
  });

  test.afterEach(() => {
    expect(consoleErrors).toEqual([]);
  });

  test("carga los 5 lotes sembrados con estadísticas y orden FEFO (asc)", async ({ page }) => {
    const t = tally();

    await expect(page.locator("tbody tr")).toHaveCount(SEED_LOTS.length);
    expect(await statNumber(page, /OK:\s*\d/)).toBe(t.ok);
    expect(await statNumber(page, /Próximos:\s*\d/)).toBe(t.proximo);
    expect(await statNumber(page, /Vencidos:\s*\d/)).toBe(t.vencido);
    expect(await statNumber(page, /Total:\s*\d+\s*lotes/)).toBe(SEED_LOTS.length);

    // Orden por caducidad ascendente: el más vencido siempre encabezado.
    await expect(page.locator("tbody tr").first()).toContainText("PRODUCTO VENCIDO E2E");
  });

  test("clasifica cada lote con el badge correcto (clock-aware)", async ({ page }) => {
    for (const lot of SEED_LOTS) {
      const row = page.locator("tbody tr").filter({ hasText: lot.name });
      await expect(row).toHaveCount(1);
      await expect(row.getByText(BADGE[statusOf(lot.expiry)], { exact: true })).toBeVisible();
    }
  });

  test("filtra por estado devolviendo exactamente los lotes clasificados", async ({ page }) => {
    const t = tally();
    const statusFilter = page.getByRole("combobox", {
      name: "Filtrar por estado",
    });

    await statusFilter.selectOption("vencido");
    await expect(page.locator("tbody tr")).toHaveCount(t.vencido);
    const vencidoRow = page.locator("tbody tr").filter({ hasText: "PRODUCTO VENCIDO E2E" });
    await expect(vencidoRow).toBeVisible();
    await expect(vencidoRow.getByText("VENCIDO", { exact: true })).toBeVisible();

    await statusFilter.selectOption("proximo");
    await expect(page.locator("tbody tr")).toHaveCount(t.proximo);
    const proximoRow = page.locator("tbody tr").filter({ hasText: "COCA COLA 3L E2E" });
    await expect(proximoRow).toBeVisible();
    await expect(proximoRow.getByText("PRÓXIMO", { exact: true })).toBeVisible();

    await statusFilter.selectOption("all");
    await expect(page.locator("tbody tr")).toHaveCount(SEED_LOTS.length);
  });

  test("filtra por mes con el monthKey calculado en runtime", async ({ page }) => {
    const key = proximoKey();
    const expected = SEED_LOTS.filter((l) => l.monthKey === key).length;
    expect(expected).toBeGreaterThanOrEqual(1);

    await page.getByRole("combobox", { name: "Filtrar por mes" }).selectOption(key);
    await expect(page.locator("tbody tr")).toHaveCount(expected);
    await expect(page.locator("tbody tr").filter({ hasText: "COCA COLA 3L E2E" })).toBeVisible();
  });

  test("busca por producto: 'Coca' devuelve solo COCA COLA 3L E2E", async ({ page }) => {
    const search = page.getByPlaceholder("Buscar producto, lote, mes...");

    await search.fill("Coca");
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr").filter({ hasText: "COCA COLA 3L E2E" })).toBeVisible();

    await search.fill("");
    await expect(page.locator("tbody tr")).toHaveCount(SEED_LOTS.length);
  });
});
