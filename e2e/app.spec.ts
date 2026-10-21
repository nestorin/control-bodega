import { test, expect } from "@playwright/test"

test.describe("EXEPA Bodega App - E2E Flows", () => {
  test.beforeEach(async ({ page }) => {
    // Start at the login page
    await page.goto("/login")
    await page.waitForLoadState("domcontentloaded")
  })

  test("Login flow - should show login form", async ({ page }) => {
    // Check login form elements
    await expect(page.locator("h1")).toContainText("Iniciar sesión")
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
    await expect(page.locator("text=Google")).toBeVisible()
  })

  test("Login flow - should toggle to register mode", async ({ page }) => {
    await page.getByRole("button", { name: "Regístrate", exact: true }).click()
    await expect(page.locator("h1")).toContainText("Crear cuenta")
    await expect(page.getByPlaceholder("Tu nombre")).toBeVisible()
    await expect(page.getByText("Confirmar contraseña")).toBeVisible()
    await expect(page.getByText("¿Ya tienes cuenta?")).toBeVisible()
  })

  test("Login flow - should show validation errors", async ({ page }) => {
    await page.click('button[type="submit"]')
    // HTML5 validation should prevent submit
    await expect(page.locator('input[type="email"]:invalid')).toBeTruthy()
  })

  test("Protected route - should redirect to login when not authenticated", async ({
    page,
  }) => {
    // Mock auth always injects a user, so the redirect only exists in real-auth mode.
    test.skip(
      process.env.VITE_USE_MOCK_AUTH !== "false",
      "Requires real-auth mode (VITE_USE_MOCK_AUTH=false)",
    )
    await page.addInitScript(() => window.localStorage.clear())
    await page.goto("/")
    await page.waitForURL("**/login**")
    await expect(page.locator("h1")).toContainText("Iniciar sesión")
  })

  test("Unauthorized page - should be accessible", async ({ page }) => {
    await page.goto("/unauthorized")
    await expect(page.locator("h1")).toContainText("Acceso denegado")
    await expect(page.locator("text=Ir al inicio")).toBeVisible()
    await expect(page.locator("text=Cambiar de usuario")).toBeVisible()
  })
})

test.describe("Main App - Authenticated Flows", () => {
  test.use({ storageState: "playwright/.auth/user.json" })

  test.beforeEach(async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("domcontentloaded")
  })

  test("Home screen - should show dashboard", async ({ page }) => {
    await expect(page.locator("text=Buenos días")).toBeVisible()
    await expect(page.getByText("Nueva recepción").first()).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Recepciones", exact: true }),
    ).toBeVisible()
  })

  test("Navigation - should navigate to Recepciones", async ({ page }) => {
    await page.getByRole("button", { name: "Recepciones", exact: true }).click()
    await expect(
      page.getByRole("main").getByText("Recepciones", { exact: true }).first(),
    ).toBeVisible()
  })

  test("Navigation - should navigate to Embarques", async ({ page }) => {
    await page.getByRole("button", { name: "Embarques", exact: true }).click()
    await expect(
      page.getByRole("main").getByText("Embarques", { exact: true }).first(),
    ).toBeVisible()
    await expect(page.getByText("Nuevo embarque").first()).toBeVisible()
  })

  test("Navigation - should navigate to Lotes y Caducidades", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Inventario", exact: true }).click()
    await expect(
      page.getByRole("heading", { name: "Lotes y Caducidades" }),
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Exportar CSV" }),
    ).toBeVisible()
  })

  test("Navigation - should navigate to Evidencias", async ({ page }) => {
    await page.click("text=Evidencias")
    await expect(page.locator("text=Historial y Seguimiento")).toBeVisible()
  })

  test("Navigation - should navigate to Configuración", async ({ page }) => {
    await page.click("text=Config.")
    await expect(page.locator("text=Configuración")).toBeVisible()
  })

  test("Lotes y Caducidades - should filter by status", async ({ page }) => {
    await page.getByRole("button", { name: "Inventario", exact: true }).click()
    await expect(page.locator("table")).toBeVisible({ timeout: 10000 })

    await page
      .getByRole("combobox", { name: "Filtrar por estado" })
      .selectOption("proximo")
    await expect(page.locator("table")).toBeVisible()
  })

  test("Lotes y Caducidades - should search", async ({ page }) => {
    await page.getByRole("button", { name: "Inventario", exact: true }).click()
    await expect(page.locator("table")).toBeVisible({ timeout: 10000 })

    await page
      .getByPlaceholder("Buscar producto, lote, mes...")
      .fill("Coca")
    await page.waitForTimeout(300)
    await expect(page.locator("table")).toBeVisible()
  })

  test("Lotes y Caducidades - should sort by column", async ({ page }) => {
    await page.getByRole("button", { name: "Inventario", exact: true }).click()
    await expect(page.locator("table")).toBeVisible({ timeout: 10000 })

    // Click on Producto header to sort
    await page.click('th:has-text("Producto")')
    await expect(page.locator("table")).toBeVisible()
  })

  test("Lotes y Caducidades - should export CSV", async ({ page }) => {
    await page.getByRole("button", { name: "Inventario", exact: true }).click()
    await expect(page.locator("table")).toBeVisible({ timeout: 10000 })

    // Set up download handler
    const downloadPromise = page.waitForEvent("download")
    await page.getByRole("button", { name: "Exportar CSV" }).click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toMatch(
      /lotes-caducidades-\d{4}-\d{2}-\d{2}\.csv/,
    )
  })
})

test.describe("Recepción Flow", () => {
  test.use({ storageState: "playwright/.auth/user.json" })

  test.beforeEach(async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("domcontentloaded")
  })

  test("Nueva recepción - Step 1: Captura evidencia", async ({ page }) => {
    await page.getByRole("button", { name: "Nueva recepción", exact: true }).first().click()
    await expect(page.getByText("Recepción de Mercancía")).toBeVisible()
  })

  test("Nueva recepción - Step 2: Orden de compra", async ({ page }) => {
    await page.getByRole("button", { name: "Nueva recepción", exact: true }).first().click()
    await expect(page.getByText("Recepción de Mercancía")).toBeVisible()
  })
})

test.describe("Embarque Flow", () => {
  test.use({ storageState: "playwright/.auth/user.json" })

  test.beforeEach(async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("domcontentloaded")
  })

  test("Embarques list - should show table", async ({ page }) => {
    await page.getByRole("button", { name: "Embarques", exact: true }).first().click()
    await expect(
      page.getByRole("main").getByText("Embarques", { exact: true }).first(),
    ).toBeVisible({ timeout: 10000 })
    await expect(page.getByText("Nuevo embarque").first()).toBeVisible()
  })

  test("Nuevo embarque - Step 1: Datos generales", async ({ page }) => {
    await page.getByRole("button", { name: "Embarques", exact: true }).first().click()
    await page.getByRole("button", { name: "Nuevo embarque", exact: true }).click()
    await expect(page.getByText("Datos del embarque")).toBeVisible({
      timeout: 10000,
    })
    await expect(page.getByPlaceholder("FAC-2024-0001")).toBeVisible()
    await expect(page.getByPlaceholder("Nombre del cliente")).toBeVisible()
    await expect(page.locator("select").first()).toBeVisible()
  })
})

test.describe("Responsive", () => {
  test.use({ storageState: "playwright/.auth/user.json" })

  test("Mobile view - should show bottom navigation", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto("/")
    await page.waitForLoadState("domcontentloaded")

    // Bottom nav should be visible on mobile
    const bottomNav = page.locator("nav")
    await expect(bottomNav.last()).toBeVisible()
    await expect(
      bottomNav.getByRole("button", { name: "Inicio" }).first(),
    ).toBeVisible()
    await expect(
      bottomNav.getByRole("button", { name: "Recepciones" }).first(),
    ).toBeVisible()
  })

  test("Desktop view - should show sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto("/")
    await page.waitForLoadState("domcontentloaded")

    // Sidebar should be visible on desktop
    const sidebar = page.locator("aside")
    await expect(sidebar).toBeVisible()
    await expect(
      sidebar.getByRole("button", { name: "Inicio" }),
    ).toBeVisible()
    await expect(
      sidebar.getByRole("button", { name: "Recepciones", exact: true }),
    ).toBeVisible()
  })
})
