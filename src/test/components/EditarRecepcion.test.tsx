import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockServices = vi.hoisted(() => ({
  getReception: vi.fn(),
  editReception: vi.fn(),
  getSupplier: vi.fn(),
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/hooks/useAuthorization', () => ({
  useAuthorization: () => ({ user: { uid: 'user-1' }, canQuery: true }),
}));
vi.mock('@/services/firestore', () => ({
  createFirestoreServices: () => ({
    receptions: { getById: mockServices.getReception, editReception: mockServices.editReception },
    suppliers: { getById: mockServices.getSupplier },
  }),
}));

import EditarRecepcion from '@/screens/EditarRecepcion';

const receptionDraft = {
  id: 'reception-1',
  warehouseId: 'warehouse-north',
  supplierId: 'supplier-1',
  supplierName: 'Proveedor real',
  supplierCode: 'P-01',
  logisticsProvider: 'Logística real',
  purchaseOrderNumber: 'OC-1001',
  folio: 'REC-1001',
  scheduledDate: '2026-10-30',
  status: 'DRAFT',
  version: 4,
  palletCount: 2,
  productName: 'Producto real',
  operationId: 'operation-1',
  actorUserId: 'user-1',
  plannedPallets: [
    {
      palletNumber: 1,
      lineIndex: 0,
      productId: 'product-1',
      productName: 'Producto real',
      quantity: 10,
      unit: 'cajas',
      qrIdentifier: 'TQR-reception-1-001',
      status: 'PLANNED',
      activated: false,
    },
    {
      palletNumber: 2,
      lineIndex: 0,
      productId: 'product-1',
      productName: 'Producto real',
      quantity: 5,
      unit: 'cajas',
      qrIdentifier: 'TQR-reception-1-002',
      status: 'PLANNED',
      activated: false,
    },
  ],
};

describe('EditarRecepcion - basic smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServices.getReception.mockResolvedValue(receptionDraft);
    mockServices.getSupplier.mockResolvedValue({ id: 'supplier-1', name: 'Proveedor real', code: 'P-01' });
    mockServices.editReception.mockResolvedValue(receptionDraft);
  });

  it('imports without error', () => {
    expect(EditarRecepcion).toBeDefined();
  });
});