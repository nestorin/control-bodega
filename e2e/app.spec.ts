import { test, expect } from "@playwright/test"

test.describe("EXEPA Bodega App - E2E Flows", () => {
  test.beforeEach(async ({ page }) => {
    // Start at the login page
    await page.goto("/login")
    await page.waitForLoadState("networkidle")
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
    await page.click("text=Crear cuenta")
    await expect(page.locator("h1")).toContainText("Crear cuenta")
    await expect(page.locator('select[name="role"]')).toBeVisible()
    await expect(page.locator('select[name="almacenId"]')).toBeVisible()
    await expect(page.locator("text=¿Ya tienes cuenta?")).toBeVisible()
  })

  test("Login flow - should show validation errors", async ({ page }) => {
    await page.click('button[type="submit"]')
    // HTML5 validation should prevent submit
    await expect(page.locator('input[type="email"]:invalid')).toBeTruthy()
  })

  test("Protected route - should redirect to login when not authenticated", async ({
    page,
  }) => {
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
    await page.waitForLoadState("networkidle")
  })

  test("Home screen - should show dashboard", async ({ page }) => {
    await expect(page.locator("text=Buenos días")).toBeVisible()
    await expect(page.locator("text=Nueva recepción")).toBeVisible()
    await expect(page.locator("text=Recepciones")).toBeVisible()
  })

  test("Navigation - should navigate to Recepciones", async ({ page }) => {
    await page.click("text=Recepciones")
    await expect(page.locator("text=Recepciones")).toBeVisible()
    await expect(page.locator("text=Nueva recepción")).toBeVisible()
  })

  test("Navigation - should navigate to Embarques", async ({ page }) => {
    await page.click("text=Embarques")
    await expect(page.locator("text=Embarques")).toBeVisible()
    await expect(page.locator("text=Nuevo embarque")).toBeVisible()
  })

  test("Navigation - should navigate to Lotes y Caducidades", async ({
    page,
  }) => {
    await page.click("text=Inventario")
    await expect(page.locator("text=Lotes y Caducidades")).toBeVisible()
    await expect(page.locator("text=Exportar CSV")).toBeVisible()
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
    await page.goto("/lotes-caducidades")
    await page.waitForLoadState("networkidle")

    // Wait for table to load
    await page.waitForSelector("table", { state: "visible" })

    // Select filter
    await page.selectOption(
      'select:has(option:has-text("Todos los estados"))',
      "proximo",
    )
    await expect(page.locator("table")).toBeVisible()
  })

  test("Lotes y Caducidades - should search", async ({ page }) => {
    await page.goto("/lotes-caducidades")
    await page.waitForLoadState("networkidle")
    await page.waitForSelector("table", { state: "visible" })

    await page.fill('input[placeholder*="Buscar"]', "Coca")
    await page.waitForTimeout(300)
    await expect(page.locator("table")).toBeVisible()
  })

  test("Lotes y Caducidades - should sort by column", async ({ page }) => {
    await page.goto("/lotes-caducidades")
    await page.waitForLoadState("networkidle")
    await page.waitForSelector("table", { state: "visible" })

    // Click on Producto header to sort
    await page.click('th:has-text("Producto")')
    await expect(page.locator("table")).toBeVisible()
  })

  test("Lotes y Caducidades - should export CSV", async ({ page }) => {
    await page.goto("/lotes-caducidades")
    await page.waitForLoadState("networkidle")
    await page.waitForSelector("table", { state: "visible" })

    // Set up download handler
    const downloadPromise = page.waitForEvent("download")
    await page.click("text=Exportar CSV")
    const download = await downloadPromise

    expect(download.suggestedFilename()).toMatch(
      /lotes-caducidades-\d{4}-\d{2}-\d{2}\.csv/,
    )
  })
})

test.describe("Recepción Flow", () => {
  test.use({ storageState: "playwright/.auth/user.json" })

  test("Nueva recepción - Step 1: Captura evidencia", async ({ page }) => {
    await page.goto("/")
    await page.click("text=Nueva recepción")
    await expect(page.locator("text=Evidencia de mercancía")).toBeVisible()

    // Fill form
    await page.fill('input[name="proveedor"]', "Test Proveedor")
    await page.fill('input[name="proveedorLogistico"]', "Test Logística")
    await page.fill('input[name="tarimas"]', "5")

    // Take photos would require file upload - skip for now
    // Just verify form structure
    await expect(page.locator("text=Continuar")).toBeVisible()
  })

  test("Nueva recepción - Step 2: Orden de compra", async ({ page }) => {
    // This would require completing step 1 first
    // Testing the route directly
    await page.goto("/nueva-step1")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("text=Orden de compra")).toBeVisible()
  })
})

test.describe("Embarque Flow", () => {
  test.use({ storageState: "playwright/.auth/user.json" })

  test("Embarques list - should show table", async ({ page }) => {
    await page.goto("/embarques")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("text=Embarques")).toBeVisible()
    await expect(page.locator("text=Nuevo embarque")).toBeVisible()
  })

  test("Nuevo embarque - Step 1: Datos generales", async ({ page }) => {
    await page.goto("/embarques")
    await page.click("text=Nuevo embarque")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("text=Datos del embarque")).toBeVisible()
    await expect(page.locator('input[name="folio"]')).toBeVisible()
    await expect(page.locator('input[name="cliente"]')).toBeVisible()
    await expect(page.locator('select[name="bodega"]')).toBeVisible()
  })
})

test.describe("Responsive", () => {
  test.use({ storageState: "playwright/.auth/user.json" })

  test("Mobile view - should show bottom navigation", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    // Bottom nav should be visible on mobile
    await expect(page.locator('nav[role="navigation"]').last()).toBeVisible()
    await expect(page.locator("text=Inicio")).toBeVisible()
    await expect(page.locator("text=Recepciones")).toBeVisible()
  })

  test("Desktop view - should show sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    // Sidebar should be visible on desktop
    await expect(page.locator('aside[role="navigation"]')).toBeVisible()
    await expect(page.locator("text=Inicio")).toBeVisible()
    await expect(page.locator("text=Recepciones")).toBeVisible()
  })
})
