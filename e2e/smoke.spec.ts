import { test, expect } from "@playwright/test"

test.describe("EXEPA Bodega App - Smoke Tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("domcontentloaded")
  })

  test("should load the app", async ({ page }) => {
    await expect(page).toHaveTitle(/Exapa_Control_Bodega_V1.4/)
  })

  test("should have root element", async ({ page }) => {
    const root = page.locator("#root")
    await expect(root).toBeVisible()
  })

  test("should load CSS and JS assets", async ({ page }) => {
    const responses: string[] = []
    page.on("response", (response) => responses.push(response.url()))

    await page.reload({ waitUntil: "load" })

    const hasJs = responses.some((url) => url.includes(".js"))
    const hasCss = responses.some((url) => url.includes(".css"))

    expect(hasJs).toBe(true)
    expect(hasCss).toBe(true)
  })

  test("should have no console errors", async ({ page }) => {
    const errors: string[] = []
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text())
      }
    })

    await page.reload({ waitUntil: "load" })

    // Filter out expected errors (like favicon, etc.)
    const realErrors = errors.filter(
      (e) =>
        !e.includes("favicon") &&
        !e.includes("Failed to load resource") &&
        !e.includes("net::ERR"),
    )

    expect(realErrors).toHaveLength(0)
  })

  test("should respond to viewport changes", async ({ page }) => {
    // Test mobile
    await page.setViewportSize({ width: 375, height: 667 })
    await expect(page.locator("#root")).toBeVisible()

    // Test desktop
    await page.setViewportSize({ width: 1920, height: 1080 })
    await expect(page.locator("#root")).toBeVisible()
  })
})
