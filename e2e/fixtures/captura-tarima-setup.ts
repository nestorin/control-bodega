import { test as base, type Page } from '@playwright/test'

/**
 * Fixture que inicializa la sesión de recepción con conversionesTabla
 * para que CapturaTarima genere las tarimas correctamente.
 */
interface CapturaTarimaFixtures {
  capturaTarimaSession: Page
}

export const test = base.extend<CapturaTarimaFixtures>({
  capturaTarimaSession: async ({ page }, use) => {
    // Configurar sessionStorage con datos de recepción válidos
    await page.addInitScript(() => {
      const session = {
        receptionId: 'reception-test-e2e',
        folio: 'OC-TEST-001',
        warehouseId: 'wh_tehuacan_1',
        provider: 'Proveedor Test',
        logisticsProvider: 'Logística Test',
        productIds: ['prod-test-1', 'prod-test-2', 'prod-test-3', 'prod-test-4', 'prod-test-5'],
        totalPallets: 5,
      }

      const sessionData = {
        data: session,
        phase: 'PALLETS',
      }

      try {
        sessionStorage.setItem('reception-session', JSON.stringify(sessionData))
      } catch (e) {
        console.warn('[E2E] No se pudo setear sessionStorage:', e)
      }
    })

    // También inyectar conversionesTabla en localStorage para que la app la use
    await page.addInitScript(() => {
      const conversiones = [
        {
          producto: 'Agua mineral 600 ml',
          productId: 'prod-test-1',
          codigo: 'AGUA-600ML',
          unidades: 48,
          unidad: 'cajas',
          piezasPorCaja: 24,
          cajasPorTarima: 2,
          cajas: 48,
          tarimas: 2,
          stickers: 8,
          conversionMatch: true,
        },
        {
          producto: 'Refresco Cola 500 ml',
          productId: 'prod-test-2',
          codigo: 'COLA-500ML',
          unidades: 50,
          unidad: 'cajas',
          piezasPorCaja: 25,
          cajasPorTarima: 2,
          cajas: 50,
          tarimas: 2,
          stickers: 8,
          conversionMatch: true,
        },
        {
          producto: 'Jugo Naranja 1L',
          productId: 'prod-test-3',
          codigo: 'JUGO-1L',
          unidades: 45,
          unidad: 'cajas',
          piezasPorCaja: 15,
          cajasPorTarima: 3,
          cajas: 45,
          tarimas: 1,
          stickers: 4,
          conversionMatch: true,
        },
      ]

      try {
        localStorage.setItem('conversionesTabla', JSON.stringify(conversiones))
      } catch (e) {
        console.warn('[E2E] No se pudo setear localStorage conversionesTabla:', e)
      }
    })

    await use(page)
  },
})

export { expect } from '@playwright/test'