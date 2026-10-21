import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// Usar emulador
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8082'

const app = getApps().length === 0 
  ? initializeApp({ projectId: 'demo-exepa-e2e' })
  : getApps()[0]

const db = getFirestore(app)

const TEST_ORG_ID = 'org_exepa_001'
const TEST_WAREHOUSE_ID = 'wh_tehuacan_1'
const now = new Date()

const testPallets = [
  { qrIdentifier: 'TQR-24891-001', productId: 'prod-test-1', lot: 'LT-0926-A', quantity: 48, unit: 'cajas', expiryDate: new Date('2027-03-15') },
  { qrIdentifier: 'TQR-24891-002', productId: 'prod-test-2', lot: 'LT-0926-B', quantity: 50, unit: 'cajas', expiryDate: new Date('2027-03-20') },
  { qrIdentifier: 'TQR-24891-003', productId: 'prod-test-3', lot: 'LT-0926-C', quantity: 45, unit: 'cajas', expiryDate: new Date('2027-03-10') },
  { qrIdentifier: 'TQR-24891-004', productId: 'prod-test-4', lot: 'LT-0926-D', quantity: 40, unit: 'cajas', expiryDate: new Date('2027-04-01') },
  { qrIdentifier: 'TQR-24891-005', productId: 'prod-test-5', lot: 'LT-0926-E', quantity: 55, unit: 'cajas', expiryDate: new Date('2027-04-15') },
]

async function seed() {
  const receptionId = 'reception-test-e2e'
  const receptionRef = db.collection('organizations').doc(TEST_ORG_ID).collection('receptions').doc(receptionId)
  
  await receptionRef.set({
    id: receptionId,
    organizationId: TEST_ORG_ID,
    warehouseId: TEST_WAREHOUSE_ID,
    status: 'IN_PROGRESS',
    operationId: 'op-test-e2e',
    actorUserId: 'mock-user-123',
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
  
  console.log('✅ Tarimas de prueba creadas en Firestore emulator')
  process.exit(0)
}

seed().catch(console.error)
