import { Page, expect } from '@playwright/test'

/**
 * Base Page Object - utilidades comunes
 */
export class BasePage {
  constructor(protected page: Page) {}

  async goto(path: string, waitUntil: 'load' | 'domcontentloaded' | 'networkidle' = 'domcontentloaded'): Promise<void> {
    await this.page.goto(path, { waitUntil })
  }

  async assertNoErrors(ignorePatterns: RegExp[] = []): Promise<void> {
    const errors: string[] = []
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text()
if (!ignorePatterns.some(p => p.test(text))) {
          errors.push(text)
        }
      }
    })
    this.page.on('pageerror', err => {
      if (!ignorePatterns.some(p => p.test(err.message))) {
        errors.push(err.message)
      }
    })
    await this.page.waitForTimeout(500)
    if (errors.length > 0) {
      throw new Error(`Console errors detected:\n${errors.join('\n')}`)
    }
  }

  async fillInput(label: string, value: string): Promise<void> {
    await this.page.getByLabel(label).fill(value)
  }

  async selectOption(label: string, optionText: string): Promise<void> {
    await this.page.getByLabel(label).click()
    await this.page.getByRole('option', { name: optionText }).click()
  }

  async clickButton(name: string): Promise<void> {
    await this.page.getByRole('button', { name }).click()
  }

  async waitForLoading(): Promise<void> {
    await expect(this.page.getByRole('button', { name: /cargando|guardando|creando/i })).toBeHidden({ timeout: 30000 })
  }
}

/**
 * LoginPage - Autenticación
 */
export class LoginPage extends BasePage {
  async login(email: string, password: string): Promise<void> {
    await this.page.goto('/login', { waitUntil: 'networkidle' })
    await this.page.fill('input[type="email"]', email)
    await this.page.fill('input[type="password"]', password)
    await this.page.click('button[type="submit"]')
    await this.page.waitForURL(/\/($|home)/, { timeout: 15000 })
  }
}

/**
 * HomePage - Dashboard principal
 */
export class HomePage extends BasePage {
  async expectLoaded(): Promise<void> {
    await expect(this.page.getByText('Nueva recepción')).toBeVisible({ timeout: 10000 })
    await expect(this.page.getByRole('button', { name: 'Recepciones', exact: true })).toBeVisible()
    await expect(this.page.getByText('Embarques')).toBeVisible()
  }

  async gotoRecepciones(): Promise<void> {
    await this.clickButton('Recepciones')
  }

  async gotoEmbarques(): Promise<void> {
    await this.clickButton('Embarques')
  }

  async gotoLotesCaducidades(): Promise<void> {
    await this.clickButton('Inventario')
    await this.clickButton('Lotes y Caducidades')
  }

  async gotoEvidencias(): Promise<void> {
    await this.clickButton('Evidencias')
  }

  async gotoConfiguracion(): Promise<void> {
    await this.clickButton('Config.')
  }
}

/**
 * NuevaRecepcionStep1Page - Paso 1 de nueva recepción
 */
export class NuevaRecepcionStep1Page extends BasePage {
  async waitForCatalogsLoaded(): Promise<void> {
    await expect(this.page.getByText('Cargando catálogos')).toBeHidden({ timeout: 15000 })
  }

  async selectHasOC(hasOC: boolean): Promise<void> {
    await this.clickButton(hasOC ? 'Sí, tengo OC' : 'No tengo OC')
  }

  async fillOCFolio(folio: string): Promise<void> {
    await this.fillInput('Folio', folio)
  }

  async fillTarimas(tarimas: string): Promise<void> {
    await this.fillInput('Tarimas', tarimas)
  }

  async selectProveedor(nombre: string): Promise<void> {
    await this.selectOption('Proveedor de mercancía', nombre)
  }

  async selectProveedorLogistico(nombre: string): Promise<void> {
    await this.selectOption('Proveedor logístico', nombre)
  }

  async clickContinue(): Promise<void> {
    await this.clickButton('Continuar')
    await this.waitForLoading()
  }

  async completeReceptionWithOC(data = generateTestData()): Promise<void> {
    await this.selectHasOC(true)
    await this.fillOCFolio(data.ocFolio)
    await this.fillTarimas(data.tarimas)
    await this.selectProveedor(data.proveedor)
    await this.selectProveedorLogistico(data.proveedorLogistico)
    await this.clickContinue()
  }

  async completeReceptionWithoutOC(data = generateTestData()): Promise<void> {
    await this.selectHasOC(false)
    await this.fillTarimas(data.tarimas)
    await this.selectProveedor(data.proveedor)
    await this.selectProveedorLogistico(data.proveedorLogistico)
    await this.clickContinue()
  }
}

/**
 * NuevaRecepcionStep2Page - Paso 2 (detalle de líneas)
 */
export class NuevaRecepcionStep2Page extends BasePage {
  async verifyProductsLoaded(expectedCount: number): Promise<void> {
    await expect(this.page.getByRole('row', { name: /producto/i })).toHaveCount(expectedCount)
  }

  async fillLoteForRow(rowIndex: number, lote: string): Promise<void> {
    await this.page.getByRole('row').nth(rowIndex).getByLabel('Lote').fill(lote)
  }

  async fillCaducidadForRow(rowIndex: number, fecha: string): Promise<void> {
    await this.page.getByRole('row').nth(rowIndex).getByLabel('Caducidad').fill(fecha)
  }

  async clickContinue(): Promise<void> {
    await this.clickButton('Continuar')
    await this.waitForLoading()
  }

  async clickBack(): Promise<void> {
    await this.clickButton('Atrás')
  }
}

/**
 * RecepcionCompletadaPage - Pantalla final de recepción
 */
export class RecepcionCompletadaPage extends BasePage {
  async expectSuccess(): Promise<void> {
    await expect(this.page.getByText(/Recepción completada|confirmada|guardada/)).toBeVisible({ timeout: 10000 })
  }

  async expectTarimasCount(count: number): Promise<void> {
    await expect(this.page.getByText(new RegExp(`${count}\\s*TARIMAS`, 'i'))).toBeVisible()
  }
}

/**
 * ProgramacionRecepcionPage - Flujo OCR programado
 */
export class ProgramacionRecepcionPage extends BasePage {
  async uploadFile(filePath: string): Promise<void> {
    await this.page.setInputFiles('input[type="file"]', filePath)
    await this.waitForLoading()
  }

  async expectOCRResults(): Promise<void> {
    await expect(this.page.getByText(/OCR|Resultado/)).toBeVisible({ timeout: 30000 })
  }

  async clickContinue(): Promise<void> {
    await this.clickButton('Continuar')
    await this.waitForLoading()
  }

  async clickComplete(): Promise<void> {
    await this.clickButton('Completar')
    await this.waitForLoading()
  }
}

/**
 * EmbarquesPage - Gestión de embarques
 */
export class EmbarquesPage extends BasePage {
  async createShipment(product: string, warehouse: string, quantity: string): Promise<void> {
    await this.clickButton('Nuevo embarque')
    await this.selectOption('Producto', product)
    await this.selectOption('Almacén', warehouse)
    await this.fillInput('Cantidad', quantity)
    await this.clickButton('Confirmar')
    await this.waitForLoading()
  }

  async expectShipmentInList(shipmentId: string): Promise<void> {
    await expect(this.page.getByText(shipmentId)).toBeVisible()
  }
}

/**
 * ConfiguracionPage - Administración
 */
export class ConfiguracionPage extends BasePage {
  async goToTab(tab: 'almacenes' | 'proveedores' | 'conversiones'): Promise<void> {
    const tabMap = {
      almacenes: 'Almacenes',
      proveedores: 'Proveedores',
      conversiones: 'Conversiones',
    }
    await this.clickButton(tabMap[tab])
    await this.waitForLoading()
  }

  async createAlmacen(nombre: string, ubicacion: string, responsable: string): Promise<void> {
    await this.goToTab('almacenes')
    await this.clickButton('Nuevo')
    await this.fillInput('Nombre', nombre)
    await this.fillInput('Ubicación', ubicacion)
    await this.fillInput('Responsable', responsable)
    await this.clickButton('Guardar')
    await this.waitForLoading()
  }
}

/**
 * EscanearQRPage - Escaneo de código QR de tarima (cámara o manual)
 * Selectores basados en accesibilidad (getByLabel, getByRole)
 */
export class EscanearQRPage extends BasePage {
  async goto(): Promise<void> {
    await this.page.goto('/escanear-qr', { waitUntil: 'networkidle' })
    await expect(this.page.getByText('Escanear código QR')).toBeVisible({ timeout: 10000 })
  }

  async expectOnScanScreen(): Promise<void> {
    await expect(this.page.getByText('Escanear código QR')).toBeVisible()
    await expect(this.page.getByPlaceholder(/TQR|ID/i)).toBeVisible()
    await expect(this.page.getByRole('button', { name: 'Buscar' })).toBeVisible()
  }

  /** Ingresa ID de tarima manualmente (fallback CI sin cámara) */
  async enterManualTarimaId(tarimaId: string): Promise<void> {
    await this.page.getByPlaceholder(/TQR|ID/i).fill(tarimaId)
    await this.clickButton('Buscar')
    await this.waitForLoading()
  }

  async clickCancel(): Promise<void> {
    await this.clickButton('Cancelar')
    await this.waitForLoading()
  }
}

/**
 * TarimaDetallePage - Detalle de tarima escaneada
 * Selectores basados en accesibilidad
 */
export class TarimaDetallePage extends BasePage {
  async gotoLegacy(): Promise<void> {
    await this.page.goto('/?test=legacy-tarima-detalle', { waitUntil: 'domcontentloaded' })
    await expect(this.page.getByText('Detalle de Tarima')).toBeVisible({ timeout: 10000 })
  }

  async expectLoaded(tarimaId: string): Promise<void> {
    await expect(this.page.getByText(tarimaId)).toBeVisible({ timeout: 10000 })
    await expect(this.page.getByText('Detalle de Tarima')).toBeVisible()
    await expect(this.page.getByLabel('Lote')).toBeVisible()
    await expect(this.page.getByLabel('Caducidad')).toBeVisible()
  }

  async getDetalleValue(label: string): Promise<string> {
    const row = this.page.locator(`:text("${label}")`).locator('..')
    const value = row.locator('p.font-bold, strong, [font-weight]').first()
    return await value.textContent() || ''
  }

  async clickVerReferencia(): Promise<void> {
    await this.clickButton('Ver referencia')
    await this.waitForLoading()
  }

  async clickImprimir(): Promise<void> {
    await this.clickButton('Imprimir')
  }

  async clickDescargar(format?: 'SVG' | 'PNG' | 'JPEG' | 'PDF'): Promise<void> {
    await this.clickButton('Descargar')
    if (format) {
      await this.page.getByRole('menuitem', { name: new RegExp(format, 'i') }).click()
    }
  }
}

/**
 * CapturaTarimaPage - Captura de lote, caducidad, condición por tarima
 * Selectores basados en accesibilidad (getByLabel, getByRole)
 */
export class CapturaTarimaPage extends BasePage {
  async goto(): Promise<void> {
    await this.page.goto('/escanear-qr', { waitUntil: 'networkidle' })
    await expect(this.page.getByText('Escanear código QR')).toBeVisible({ timeout: 10000 })
  }

  async expectOnScanScreen(): Promise<void> {
    await expect(this.page.getByText('Escanear código QR')).toBeVisible()
    await expect(this.page.getByPlaceholder(/TQR|ID/i)).toBeVisible()
    await expect(this.page.getByRole('button', { name: 'Buscar' })).toBeVisible()
  }

  async expectLoaded(tarima: number, total: number): Promise<void> {
    await expect(this.page.getByText(new RegExp(`Tarima ${tarima} de ${total}`))).toBeVisible({ timeout: 10000 })
    await expect(this.page.locator('input[type="text"]').first()).toBeVisible()
    await expect(this.page.locator('input[type="date"]').first()).toBeVisible()
  }

  async fillLote(value: string): Promise<void> {
    await this.page.locator('input[type="text"]').first().fill(value)
  }

  async fillCaducidad(value: string): Promise<void> {
    await this.page.locator('input[type="date"]').first().fill(value)
  }

  /** Ingresa ID de tarima manualmente (fallback CI sin cámara) */
  async enterManualTarimaId(tarimaId: string): Promise<void> {
    await this.page.getByPlaceholder(/TQR|ID/i).fill(tarimaId)
    await this.clickButton('Buscar')
    await this.waitForLoading()
  }

  async clickAtras(): Promise<void> {
    await this.clickButton('Atrás')
    await this.waitForLoading()
  }

  async clickGuardarBorrador(): Promise<void> {
    await this.clickButton('Guardar borrador')
    await this.waitForLoading()
  }

  async clickSiguiente(): Promise<void> {
    const header = await this.page.getByText(/Tarima \d+ de \d+/).first().textContent()
    const match = header?.match(/Tarima (\d+) de (\d+)/)
    const currentTarima = match ? Number(match[1]) : 1
    const totalTarimas = match ? Number(match[2]) : currentTarima
    await this.page.getByRole('button', { name: /Guardar y siguiente/ }).click()
    await this.waitForLoading()
    if (currentTarima < totalTarimas) {
      await expect(this.page.getByText(new RegExp(`Tarima ${currentTarima + 1} de ${totalTarimas}`))).toBeVisible({ timeout: 10000 })
    } else {
      await expect(this.page.getByText('Recepción completada')).toBeVisible({ timeout: 10000 })
    }
  }

  async clickFinalizar(): Promise<void> {
    await this.clickButton('Finalizar recepción')
    await this.waitForLoading()
  }

  /** Navega a tarima específica por número (dots navigation) */
  async goToTarima(num: number): Promise<void> {
    await this.page.getByRole('button', { name: String(num), exact: true }).click()
    await this.waitForLoading()
  }

  async getCurrentTarimaNumber(): Promise<number> {
    const text = await this.page.getByText(/Tarima \d+ de \d+/).textContent()
    const match = text?.match(/Tarima (\d+) de /)
    return match ? parseInt(match[1], 10) : 1
  }

  async fillCajas(value: string): Promise<void> {
    await this.page.locator('input[type="number"]').first().fill(value)
  }

  async selectCondicion(value: 'buenas' | 'incidencia'): Promise<void> {
    const label = value === 'buenas' ? 'Buenas' : 'Incidencia'
    await this.page.getByRole('radio', { name: label }).click()
  }

  /** Completa formulario de una tarima con datos de prueba */
  async completeTarimaForm(data: {
    lote?: string
    caducidad?: string
    cajas?: string
    condicion?: 'buenas' | 'incidencia'
  } = {}): Promise<void> {
    if (data.lote) await this.fillLote(data.lote)
    if (data.caducidad) await this.fillCaducidad(data.caducidad)
    if (data.cajas) await this.fillCajas(data.cajas)
    if (data.condicion) await this.selectCondicion(data.condicion)
  }
}

/**
 * CapturaEvidenciaPage - Captura de evidencia fotográfica y formulario
 * Selectores basados en accesibilidad (getByLabel, getByRole)
 */
export class CapturaEvidenciaPage extends BasePage {
  async goto(): Promise<void> {
    await this.page.goto('/?test=legacy-captura-evidencia', { waitUntil: 'domcontentloaded' })
    await expect(this.page.getByText('Capturar evidencia de')).toBeVisible({ timeout: 10000 })
  }

  async expectLoaded(): Promise<void> {
    await expect(this.page.getByText('Capturar evidencia de')).toBeVisible({ timeout: 10000 })
    await expect(this.page.getByText('Foto de la mercancía dentro del tráiler')).toBeVisible()
    await expect(this.page.getByRole('button', { name: 'Guardar evidencia' })).toBeVisible()
    await expect(this.page.getByRole('button', { name: 'Continuar' })).toBeVisible()
  }

  async uploadPhoto(slotIndex: 0 | 1, filePath: string): Promise<void> {
    // Click on the upload box for the specific slot
    const uploadBoxes = this.page.getByText(slotIndex === 0 ? 'Foto de la mercancía dentro del tráiler' : 'Foto del producto y su caducidad')
    await expect(uploadBoxes.first()).toBeVisible()
    await uploadBoxes.first().click()
    
    // Upload file via hidden input
    const fileInput = this.page.locator('input[type="file"]').first()
    await fileInput.setInputFiles(filePath)
    
    // Wait for preview to appear
    await expect(this.page.getByText('Foto capturada').first()).toBeVisible({ timeout: 5000 })
  }

  async fillForm(data: {
    proveedor?: string
    item?: string
    tarimas?: string
    caducidad?: string
    lote?: string
  }): Promise<void> {
    if (data.proveedor) await this.page.getByLabel('Nombre del proveedor').fill(data.proveedor)
    if (data.item) await this.page.getByLabel('Nombre del ítem a recibir').fill(data.item)
    if (data.tarimas) await this.page.getByLabel('Cantidad de tarimas a recibir').fill(data.tarimas)
    if (data.caducidad) await this.page.getByLabel('Caducidad del producto').fill(data.caducidad)
    if (data.lote) await this.page.getByLabel('Lote del producto (opcional)').fill(data.lote)
  }

  async clickSave(): Promise<void> {
    await this.clickButton('Guardar evidencia')
    // Wait for button text to change to "Guardado"
    await expect(this.page.getByText('Guardado')).toBeVisible({ timeout: 10000 })
    await this.waitForLoading()
  }

  async clickWhatsApp(): Promise<void> {
    await this.clickButton('WhatsApp')
    await this.waitForLoading()
  }

  async clickContinue(): Promise<void> {
    await this.clickButton('Continuar')
    await this.waitForLoading()
  }

  async expectSaved(): Promise<void> {
    await expect(this.page.getByText('Guardado')).toBeVisible({ timeout: 10000 })
    await expect(this.page.getByText('Evidencia guardada')).toBeVisible({ timeout: 10000 })
  }
}

/**
 * EvidenciaDetallePage - Detalle de evidencia con edición
 * Selectores basados en accesibilidad
 */
export class EvidenciaDetallePage extends BasePage {
  async goto(): Promise<void> {
    await this.page.goto('/?test=legacy-evidencia-detalle', { waitUntil: 'domcontentloaded' })
    await expect(this.page.getByText('Fotos de evidencia')).toBeVisible({ timeout: 10000 })
  }

  async expectLoaded(evidenciaId: string): Promise<void> {
    await expect(this.page.getByText(evidenciaId)).toBeVisible({ timeout: 10000 })
    await expect(this.page.getByText('Fotos de evidencia')).toBeVisible()
  }

  async clickEdit(): Promise<void> {
    await this.clickButton('Editar')
    await this.waitForLoading()
  }

  async clickSave(): Promise<void> {
    await this.clickButton('Guardar')
    await this.waitForLoading()
  }

  async clickCancel(): Promise<void> {
    await this.clickButton('Cancelar')
    await this.waitForLoading()
  }

  async clickDelete(): Promise<void> {
    await this.clickButton('Borrar')
    await this.waitForLoading()
  }

  async confirmDelete(): Promise<void> {
    await this.clickButton('Sí, borrar')
    await this.waitForLoading()
  }

  async clickWhatsApp(): Promise<void> {
    await this.clickButton('Enviar evidencia por WhatsApp')
    await this.waitForLoading()
  }

  async clickBack(): Promise<void> {
    await this.clickButton('Volver a evidencias')
    await this.waitForLoading()
  }

  async editField(field: string, value: string): Promise<void> {
    // The input doesn't have a label attribute or placeholder, find it by the preceding label text
    const input = this.page.locator('p', { hasText: field }).locator('..').locator('input')
    await input.fill(value)
  }

  async setEditing(editing: boolean): Promise<void> {
    if (editing) await this.clickEdit()
    else await this.clickCancel()
  }
}

/**
 * LotesCaducidadesPage - Gestión de lotes y caducidades (FEFO)
 * Selectores basados en accesibilidad (getByLabel, getByRole, getByText)
 */
export class LotesCaducidadesPage extends BasePage {
  async goto(): Promise<void> {
    // Navegación via sidebar: Inventario → Lotes y Caducidades
    const home = new HomePage(this.page)
    await home.goto('/')
    await home.expectLoaded()
    await home.gotoLotesCaducidades()
    await this.expectLoaded()
  }

  async gotoDirect(): Promise<void> {
    // Acceso directo via URL test mode
    await this.page.goto('/?test=legacy-lotes-caducidades', { waitUntil: 'domcontentloaded' })
    await this.expectLoaded()
  }

  async expectLoaded(): Promise<void> {
    await expect(this.page.getByText('Lotes y Caducidades')).toBeVisible({ timeout: 10000 })
    await expect(this.page.getByPlaceholder('Buscar producto, lote, mes...')).toBeVisible()
    await expect(this.page.getByRole('button', { name: 'Sincronizar' })).toBeVisible()
    await expect(this.page.getByRole('button', { name: 'Exportar CSV' })).toBeVisible()
  }

  // ===== TOOLBAR =====
  async search(query: string): Promise<void> {
    await this.page.getByPlaceholder('Buscar producto, lote, mes...').fill(query)
  }

  async filterByStatus(status: 'all' | 'ok' | 'proximo' | 'vencido'): Promise<void> {
    await this.page.getByRole('combobox', { name: 'Filtrar por estado' }).selectOption(status)
  }

  async filterByMonth(month: string): Promise<void> {
    await this.page.getByRole('combobox', { name: 'Filtrar por mes' }).selectOption(month)
  }

  async sortBy(field: 'productName' | 'lot' | 'expiryDate' | 'cajas' | 'monthKey' | 'diasParaCaducar', direction?: 'asc' | 'desc'): Promise<void> {
    const header = this.page.getByRole('columnheader', { name: new RegExp(fieldToLabel(field)) })
    await header.click()
    if (direction) {
      // Click again if need to reverse
      const currentDir = await this.page.getByRole('columnheader', { name: new RegExp(fieldToLabel(field)) }).getAttribute('aria-sort')
      if (direction === 'desc' && currentDir !== 'descending') {
        await header.click()
      } else if (direction === 'asc' && currentDir !== 'ascending') {
        await header.click()
      }
    }
  }

  async clickSync(): Promise<void> {
    await this.clickButton('Sincronizar')
    await this.waitForLoading()
  }

  async clickExportCSV(): Promise<void> {
    await this.clickButton('Exportar CSV')
    // Verificar descarga (opcional)
  }

  async clickImport(): Promise<void> {
    await this.clickButton('Importar inventario')
  }

  // ===== IMPORT FLOW =====
  async uploadImportFile(filePath: string): Promise<void> {
    await this.page.locator('input[type="file"][accept=".xls,.xlsx,.csv"]').setInputFiles(filePath)
    await expect(this.page.getByText('Vista previa:')).toBeVisible({ timeout: 10000 })
  }

  async importAction(action: 'REPLACE' | 'ADD' | 'DISCARD'): Promise<void> {
    const btnMap = { REPLACE: 'Sustituir', ADD: 'Sumar', DISCARD: 'Descartar' }
    await this.clickButton(btnMap[action])
    await this.waitForLoading()
  }

  // ===== TABLE OPERATIONS =====
  async expectRowCount(count: number): Promise<void> {
    await expect(this.page.locator('tbody tr')).toHaveCount(count)
  }

  async getRowById(loteId: string): Promise<Record<string, string>> {
    const row = this.page.locator('tbody tr', { hasText: loteId })
    const cells = row.locator('td')
    const columns = ['productName', 'lot', 'expiryDate', 'monthKey', 'cajas', 'status', 'diasParaCaducar']
    const result: Record<string, string> = {}
    for (let i = 0; i < columns.length; i++) {
      result[columns[i]] = await cells.nth(i).textContent() || ''
    }
    return result
  }

  async editCajas(loteId: string, nuevasCajas: string | number): Promise<void> {
    const row = this.page.locator('tbody tr', { hasText: loteId })
    // Click edit icon (pencil)
    await row.getByRole('button', { name: 'Editar cajas' }).click()
    await this.page.waitForTimeout(300)
    const input = this.page.locator('input[type="number"]').first()
    await expect(input).toBeVisible()
    await input.fill(String(nuevasCajas))
    // Guardar (check icon)
    await row.getByRole('button', { name: 'Guardar' }).click()
    await this.waitForLoading()
  }

  async cancelEdit(loteId: string): Promise<void> {
    const row = this.page.locator('tbody tr', { hasText: loteId })
    await row.getByRole('button', { name: 'Cancelar' }).click()
  }

  async expectStatusCount(status: 'ok' | 'proximo' | 'vencido', count: number): Promise<void> {
    const badges = this.page.locator(`text=${status === 'ok' ? 'OK' : status === 'proximo' ? 'PRÓXIMO' : 'VENCIDO'}`)
    await expect(badges).toHaveCount(count)
  }

  // ===== EXPORT =====
  async exportCSV(): Promise<void> {
    await this.clickExportCSV()
    // Verificar descarga (opcional)
  }

  // ===== UTILIDADES =====
  async getStatusBadge(loteId: string): Promise<'ok' | 'proximo' | 'vencido'> {
    const row = this.page.locator('tbody tr', { hasText: loteId })
    const badge = row.locator('[class*="rounded-full"]')
    const text = await badge.textContent()
    if (text?.includes('VENCIDO')) return 'vencido'
    if (text?.includes('PRÓXIMO')) return 'proximo'
    return 'ok'
  }

  async getRowData(loteId: string): Promise<Record<string, string>> {
    return this.getRowById(loteId)
  }
}

// Helper para convertir field name a label de columna
function fieldToLabel(field: string): string {
  const map: Record<string, string> = {
    productName: 'Producto',
    lot: 'Lote',
    expiryDate: 'Caducidad',
    monthKey: 'Mes',
    cajas: 'Cajas',
    status: 'Estado',
    diasParaCaducar: 'Días',
  }
  return map[field] || field
}

/**
 * Fixtures de prueba para evidencias
 */
export const EVIDENCIA_TEST = {
  fotoTrailer: 'tests/e2e/fixtures/sample-trailer.jpg',
  fotoProducto: 'tests/e2e/fixtures/sample-producto.jpg',
}

/**
 * Genera datos de prueba únicos
 */
export function generateTestData() {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(7)
  return {
    ocFolio: `OC-QA-${timestamp}`,
    tarimas: '5',
    proveedor: 'Proveedor Norte',
    proveedorLogistico: 'Logística Veloz',
    operationId: `OP-QA-${timestamp}-${random}`,
  }
}

/**
 * IDs de tarima válidos para testing (formato real: TQR-XXXXX-XXX)
 */
export const TARIMAS_TEST = [
  'TQR-24891-001',
  'TQR-24891-002',
  'TQR-24891-003',
  'TQR-24891-004',
  'TQR-24891-005',
]
