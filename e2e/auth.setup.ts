import { test, expect } from '@playwright/test'
import { chromium } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Configuración de emuladores y app
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9100'
const FIRESTORE_EMULATOR_URL = 'http://127.0.0.1:8082'
const APP_URL = 'http://127.0.0.1:4173'

// Credenciales de test (configurables via env para CI)
const TIMESTAMP = Date.now()
const TEST_EMAIL = process.env.E2E_TEST_EMAIL || `qa-${TIMESTAMP}@exepa.com`
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || 'test123456'
const TEST_DISPLAY_NAME = 'QA Test User'
const TEST_ORG_ID = 'org_exepa_001'
const TEST_WAREHOUSE_ID = 'wh_tehuacan_1'
const TEST_ROLE = 'SUPERVISOR'

/**
 * Inicializa Firebase Admin SDK para Firestore (bypass rules)
 */
function initAdminSDK() {
  if (getApps().length === 0) {
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8082'
    initializeApp({ projectId: 'demo-exepa-e2e' })
  }
  return getFirestore()
}

/**
 * Crea usuario en Firebase Auth Emulator via REST API
 */
async function createAuthUser(email: string, password: string, displayName: string): Promise<{ uid: string }> {
  const response = await fetch(`${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName, returnSecureToken: true }),
  })

  if (!response.ok) {
    const error = await response.json()
    if (error.error?.message?.includes('EMAIL_EXISTS')) {
      const signInResponse = await fetch(`${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      })
      if (!signInResponse.ok) throw new Error('Failed to sign in existing user')
      const { localId } = await signInResponse.json()
      console.log('ℹ️ Usuario ya existe, reutilizando:', email)
      return { uid: localId }
    }
    throw new Error(`Failed to create auth user: ${JSON.stringify(error)}`)
  }
  const { localId } = await response.json()
  console.log('✅ Usuario Auth creado:', email, '(UID:', localId, ')')
  return { uid: localId }
}

test.describe.serial('Auth Setup - Genera storageState', () => {
  test('genera auth state para tests E2E', async () => {
    const authDir = path.resolve(__dirname, '../playwright/.auth')
    const authFile = path.join(authDir, 'user.json')
    fs.mkdirSync(authDir, { recursive: true })

    console.log('🔐 Auth Setup: Creating test user and auth state...')

    const db = initAdminSDK()

    // 1. Crear usuario en Auth Emulator via REST
    const { uid } = await createAuthUser(TEST_EMAIL, TEST_PASSWORD, TEST_DISPLAY_NAME)

    // 2. Crear documento de membresía en Firestore (bypass rules con Admin SDK)
    const now = new Date()
    const membershipDoc = {
      uid,
      userId: uid,
      email: TEST_EMAIL,
      displayName: TEST_DISPLAY_NAME,
      role: TEST_ROLE,
      organizationId: TEST_ORG_ID,
      warehouseIds: [TEST_WAREHOUSE_ID],
      active: true,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    }

    await db.collection('organizations').doc(TEST_ORG_ID).collection('users').doc(uid).set(membershipDoc)
    console.log('✅ Membresía creada en Firestore:', { uid, orgId: TEST_ORG_ID, role: TEST_ROLE })

    // 3. Seed the catalog used by the legacy pallet-capture route. The app
    // enables the Firestore catalog in E2E, so local-only product IDs must be
    // present or CapturaTarima cannot resolve a product before saving.
    const testProducts = [
      { id: 'prod-test-1', name: 'Agua mineral 600 ml', sku: 'AGUA-600ML' },
      { id: 'prod-test-2', name: 'Refresco Cola 500 ml', sku: 'COLA-500ML' },
      { id: 'prod-test-3', name: 'Jugo Naranja 1L', sku: 'JUGO-1L' },
      { id: 'prod-test-4', name: 'Producto de prueba 4', sku: 'TEST-004' },
      { id: 'prod-test-5', name: 'Producto de prueba 5', sku: 'TEST-005' },
    ]
    const productsCollection = db.collection('organizations').doc(TEST_ORG_ID).collection('products')
    await Promise.all(testProducts.map((product) =>
      productsCollection.doc(product.id).set({
        ...product,
        organizationId: TEST_ORG_ID,
        unit: 'cajas',
        lotControlled: true,
        expiryControlled: true,
        category: 'E2E',
        createdAt: now,
        updatedAt: now,
      }),
    ))
    console.log('✅ Productos de prueba creados:', testProducts.map((product) => product.id))

    // 4. Crear recepción de prueba con tarimas para tests E2E
    const testPallets = [
      { qrIdentifier: 'TQR-24891-001', productId: 'prod-test-1', lot: 'LT-0926-A', quantity: 48, unit: 'cajas', expiryDate: new Date('2027-03-15') },
      { qrIdentifier: 'TQR-24891-002', productId: 'prod-test-2', lot: 'LT-0926-B', quantity: 50, unit: 'cajas', expiryDate: new Date('2027-03-20') },
      { qrIdentifier: 'TQR-24891-003', productId: 'prod-test-3', lot: 'LT-0926-C', quantity: 45, unit: 'cajas', expiryDate: new Date('2027-03-10') },
      { qrIdentifier: 'TQR-24891-004', productId: 'prod-test-4', lot: 'LT-0926-D', quantity: 40, unit: 'cajas', expiryDate: new Date('2027-04-01') },
      { qrIdentifier: 'TQR-24891-005', productId: 'prod-test-5', lot: 'LT-0926-E', quantity: 55, unit: 'cajas', expiryDate: new Date('2027-04-15') },
    ]

    const receptionId = 'reception-test-e2e'
    const receptionRef = db.collection('organizations').doc(TEST_ORG_ID).collection('receptions').doc(receptionId)
    await receptionRef.set({
      id: receptionId,
      organizationId: TEST_ORG_ID,
      warehouseId: TEST_WAREHOUSE_ID,
      status: 'IN_PROGRESS',
      operationId: 'op-test-e2e',
      actorUserId: uid,
      supplierId: 'supplier-test',
      purchaseOrderId: 'OC-TEST-001',
      version: 0,
      createdAt: now,
      updatedAt: now,
    })

    const palletsRef = receptionRef.collection('pallets')
    for (const pallet of testPallets) {
      await palletsRef.doc(pallet.qrIdentifier).set({
        id: pallet.qrIdentifier,
        organizationId: TEST_ORG_ID,
        warehouseId: TEST_WAREHOUSE_ID,
        receptionId: receptionId,
        qrIdentifier: pallet.qrIdentifier,
        status: 'CREATED',
        productId: pallet.productId,
        quantity: pallet.quantity,
        unit: pallet.unit,
        lot: pallet.lot,
        palletsCreated: 0,
        createdAt: now,
        updatedAt: now,
        expiryDate: pallet.expiryDate,
      })
    }
    console.log('✅ Tarimas de prueba creadas:', testPallets.map(p => p.qrIdentifier))

    // Verificar que se pueden leer
    const verifyPallets = await palletsRef.get()
    console.log('✅ Tarimas verificadas en Firestore:', verifyPallets.docs.map(d => d.id))
    verifyPallets.docs.forEach(doc => {
      const data = doc.data()
      console.log(`  ${doc.id}: warehouseId=${data.warehouseId}, qrIdentifier=${data.qrIdentifier}`)
    })

    // 4. Login real por UI y capturar storageState
    const browser = await chromium.launch()
    const context = await browser.newContext()
    const page = await context.newPage()

    // Capture console errors
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', err => errors.push(err.message))

    try {
      console.log('🌐 Navegando a login...')
      await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle' })

      // Wait for React to hydrate
      await page.waitForTimeout(5000)

      // Check for console errors
      if (errors.length > 0) {
        console.log('❌ Console errors:', errors)
      }

      // Check for loading indicators
      const loadingCount1 = await page.locator('text=Verificando acceso, text=Cargando, text=Loading, text=verificando, text=cargando').count()
      console.log('⏳ Loading indicators:', loadingCount1)

      // Check for root element content
      const rootHTML = await page.locator('#root').innerHTML().catch(() => '')
      console.log('🌳 #root innerHTML length:', rootHTML.length)
      console.log('🌳 #root preview:', rootHTML.substring(0, 500))

      // Check for any elements
      const allElements = await page.locator('*').count()
      console.log('🔢 Total DOM elements:', allElements)

      const h1Count = await page.locator('h1').count()
      const inputCount = await page.locator('input').count()
      const buttonCount = await page.locator('button').count()
      console.log('🔢 h1:', h1Count, 'inputs:', inputCount, 'buttons:', buttonCount)

      const h1Text = await page.locator('h1').allTextContents()
      console.log('📝 h1 texts:', h1Text)

      const pTexts = await page.locator('p').allTextContents()
      console.log('📝 p texts:', pTexts)

      // Verificar si ya estamos autenticados
      const isAuthenticated1 = await page.locator('text=Nueva recepción, text=Recepciones, text=Embarques, text=Config, text=Inventario, text=Evidencias').isVisible().catch(() => false)
      if (isAuthenticated1) {
        console.log('✅ Ya autenticado, guardando storageState...')
        await context.storageState({ path: authFile })
        console.log(`💾 Auth state guardado en: ${authFile}`)
        return
      }

      // Check for any text content
      const allText = await page.locator('*').allTextContents()
      console.log('📝 All text content:', allText.filter(t => t.trim()).slice(0, 20))

      // Check for loading indicators
      const loadingCount2 = await page.locator('text=Verificando acceso, text=Cargando, text=Loading, text=verificando, text=cargando').count()
      console.log('⏳ Loading indicators:', loadingCount2)

      // Check for root element content
      const rootContent = await page.locator('#root').textContent().catch(() => '')
      console.log('🌳 #root text:', rootContent?.substring(0, 200))

      // Check for any text content in body
      const allTextContent = await page.locator('*').allTextContents()
      console.log('📝 All text content:', allTextContent.filter(t => t.trim()).slice(0, 20))

      // Check for any visible elements
      const visibleElements = await page.locator('*:visible').count()
      console.log('👁️ Visible elements:', visibleElements)

      // Check for root element content
      const rootContentFull = await page.locator('#root').innerHTML().catch(() => '')
      console.log('🌳 #root innerHTML:', rootHTML.substring(0, 1000))

      // Verificar si ya estamos autenticados
      const isAuthenticated2 = await page.locator('text=Nueva recepción, text=Recepciones, text=Embarques, text=Config, text=Inventario, text=Evidencias').isVisible().catch(() => false)
      if (isAuthenticated2) {
        console.log('✅ Ya autenticado, guardando storageState...')
        await context.storageState({ path: authFile })
        console.log(`💾 Auth state guardado en: ${authFile}`)
        return
      }

      // Check for any text content in body
      const allTextContent2 = await page.locator('*').allTextContents()
      console.log('📝 All text content:', allTextContent2.filter(t => t.trim()).slice(0, 20))

      // Check for any visible elements
      const visibleElements2 = await page.locator('*:visible').count()
      console.log('👁️ Visible elements:', visibleElements2)

      // Check for root element content
      const rootContentFull2 = await page.locator('#root').innerHTML().catch(() => '')
      console.log('🌳 #root innerHTML:', rootHTML.substring(0, 1000))

      // Verificar si ya estamos autenticados
      const isAuthenticated3 = await page.locator('text=Nueva recepción, text=Recepciones, text=Embarques, text=Config, text=Inventario, text=Evidencias').isVisible().catch(() => false)
      if (isAuthenticated3) {
        console.log('✅ Ya autenticado, guardando storageState...')
        await context.storageState({ path: authFile })
        console.log(`💾 Auth state guardado en: ${authFile}`)
        return
      }

      // Check for any text content in body
      const allTextContent3 = await page.locator('*').allTextContents()
      console.log('📝 All text content:', allTextContent3.filter(t => t.trim()).slice(0, 20))

      // Check for any visible elements
      const visibleElements3 = await page.locator('*:visible').count()
      console.log('👁️ Visible elements:', visibleElements3)

      // Check for root element content
      const rootContentFull3 = await page.locator('#root').innerHTML().catch(() => '')
      console.log('🌳 #root innerHTML:', rootHTML.substring(0, 1000))

      // Verificar si ya estamos autenticados
      const isAuthenticated4 = await page.locator('text=Nueva recepción, text=Recepciones, text=Embarques, text=Config, text=Inventario, text=Evidencias').isVisible().catch(() => false)
      if (isAuthenticated4) {
        console.log('✅ Ya autenticado, guardando storageState...')
        await context.storageState({ path: authFile })
        console.log(`💾 Auth state guardado en: ${authFile}`)
        return
      }

      // Esperar formulario de login - usar selectores específicos del Login component
      console.log('🔍 Buscando elementos del login...')
      await page.waitForSelector('h1:has-text("Iniciar sesión"), h1:has-text("Iniciar")', { timeout: 15000 })
      await page.waitForSelector('p:has-text("Accede a tu almacén")', { timeout: 5000 })
      console.log('✅ Login form visible')

      // Rellenar credenciales
      await page.fill('input[type="email"], input[name="email"], input[placeholder*="correo" i], input[placeholder*="email" i]', TEST_EMAIL)
      await page.fill('input[type="password"], input[placeholder*="•••" i], input[placeholder*="password" i]', TEST_PASSWORD)

      // Enviar login
      await page.click('button[type="submit"], button:has-text("Iniciar"), button:has-text("Entrar"), button:has-text("Login"), button:has-text("Acceder")')

      // Esperar redirección post-login
      try {
        await page.waitForURL(/\/($|home|dashboard|recepcion|embarque)/, { timeout: 15000 })
      } catch {
        await page.waitForSelector('text=Nueva recepción, text=Recepciones, text=Embarques, text=Config, text=Inventario, text=Evidencias', { timeout: 15000 })
      }

      console.log('✅ Login exitoso, guardando storageState...')
      await context.storageState({ path: authFile })
      console.log(`💾 Auth state guardado en: ${authFile}`)

    } catch (error) {
      console.error('❌ Error en auth setup:', error)
      throw error
    } finally {
      await browser.close()
    }

    console.log('✅ Auth setup completado')
  })
})
