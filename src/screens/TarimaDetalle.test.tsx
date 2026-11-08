import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import { ReceptionProvider } from '@/context/ReceptionContext';
import { CatalogosProvider } from '@/context/CatalogosContext';
import { InventoryProvider } from '@/context/InventoryContext';
import { UIProvider } from '@/context/UIContext';

const mockServices = vi.hoisted(() => ({
  generateReceptionQrPngs: vi.fn(),
  downloadTarimaQr: vi.fn(),
  downloadTarimaQrBatch: vi.fn(),
  getByQR: vi.fn(),
  getPalletsByReception: vi.fn(),
  getProduct: vi.fn(),
  getReception: vi.fn(),
  getSupplier: vi.fn(),
}));

vi.mock('@/services/receptionQr', () => ({ generateReceptionQrPngs: mockServices.generateReceptionQrPngs }));
vi.mock('@/services/tarimaQrDownload', () => ({ downloadTarimaQr: mockServices.downloadTarimaQr, downloadTarimaQrBatch: mockServices.downloadTarimaQrBatch }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/services/firestore', () => ({
  createFirestoreServices: () => ({
    pallets: { getByQR: mockServices.getByQR, getByReception: mockServices.getPalletsByReception },
    products: { getById: mockServices.getProduct },
    receptions: { getById: mockServices.getReception },
    suppliers: { getById: mockServices.getSupplier },
  }),
}));

import TarimaDetalle from '@/screens/TarimaDetalle';

const renderWithProviders = (ui: React.ReactElement, initialReceptionState = {}) => {
  return render(
    <ReceptionProvider initialState={initialReceptionState}>
      <CatalogosProvider canQuery={true}>
        <InventoryProvider>
          <UIProvider>
            {ui}
          </UIProvider>
        </InventoryProvider>
      </CatalogosProvider>
    </ReceptionProvider>
  );
};

const QR_IDENTIFIER = 'TQR-REC-2026-1035-003';
const QR_PNG = 'data:image/png;base64,iVBORw0KGgo=';

describe('TarimaDetalle QR', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServices.getByQR.mockResolvedValue({
      qrIdentifier: QR_IDENTIFIER,
      productId: 'product-1',
      receptionId: 'reception-1',
      createdAt: { toDate: () => new Date('2026-10-30T00:00:00Z') },
      expiryDate: { toDate: () => new Date('2027-10-30T00:00:00Z') },
      quantity: 10,
      unit: 'cajas',
      status: 'ACTIVE',
    });
    mockServices.getPalletsByReception.mockResolvedValue([
      { qrIdentifier: QR_IDENTIFIER, palletNumber: 3 },
      { qrIdentifier: 'TQR-REC-2026-1035-004', palletNumber: 4 },
    ]);
    mockServices.getProduct.mockResolvedValue({ name: 'Agua mineral 600 ml', sku: 'AGUA-600' });
    mockServices.getReception.mockResolvedValue({ id: 'reception-1', purchaseOrderId: 'OC-24891' });
    mockServices.getSupplier.mockResolvedValue({ name: 'Proveedor', code: 'P-01' });
    mockServices.generateReceptionQrPngs.mockResolvedValue([QR_PNG]);
    mockServices.downloadTarimaQr.mockResolvedValue(undefined);
    mockServices.downloadTarimaQrBatch.mockResolvedValue(undefined);
  });

  it('renders the real QR preview and prints all reception codes', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderWithProviders(
      <TarimaDetalle
        onBack={vi.fn()}
        qrCode={QR_IDENTIFIER}
        authorizedWarehouseIds={['warehouse-1']}
      />,
      {}
    );

    const qrImage = await screen.findByAltText(`Código QR ${QR_IDENTIFIER}`);
    expect(mockServices.generateReceptionQrPngs).toHaveBeenCalledWith([QR_IDENTIFIER]);
    expect(qrImage.getAttribute('src')).toBe(QR_PNG);

    const printButton = screen.getByRole('button', { name: 'Imprimir códigos de la recepción' });
    await waitFor(() => expect(printButton).toBeEnabled());
    fireEvent.click(printButton);
    await waitFor(() => expect(print).toHaveBeenCalledOnce());
    print.mockRestore();
  });

  it('opens the download menu and downloads the selected QR format', async () => {
    renderWithProviders(<TarimaDetalle onBack={vi.fn()} qrCode={QR_IDENTIFIER} />, {});

    fireEvent.click(await screen.findByRole('button', { name: 'Descargar código QR' }));
    fireEvent.click(screen.getByRole('button', { name: /Documento PDF/ }));

    await waitFor(() => expect(mockServices.downloadTarimaQr).toHaveBeenCalledWith(QR_IDENTIFIER, 'PDF'));
  });

  it('downloads all registered and planned reception QR codes as a PDF', async () => {
    mockServices.getReception.mockResolvedValue({
      id: 'reception-1',
      purchaseOrderId: 'OC-24891',
      palletCount: 3,
      plannedPallets: [{ qrIdentifier: 'TQR-REC-2026-1035-005', palletNumber: 5 }],
    });
    renderWithProviders(
      <TarimaDetalle
        onBack={vi.fn()}
        qrCode={QR_IDENTIFIER}
        authorizedWarehouseIds={['warehouse-1']}
      />,
      {}
    );

    fireEvent.click(await screen.findByRole('button', { name: /Descargar todos \(PDF\)/ }));

    await waitFor(() =>
      expect(mockServices.downloadTarimaQrBatch).toHaveBeenCalledWith(
        [QR_IDENTIFIER, 'TQR-REC-2026-1035-004', 'TQR-REC-2026-1035-005'],
        'OC-24891',
      ),
    );
  });

  it('keeps the individual scannable QR preview separate from batch printing', async () => {
    renderWithProviders(<TarimaDetalle onBack={vi.fn()} qrCode={QR_IDENTIFIER} />, {});

    const qrImage = await screen.findByAltText(`Código QR ${QR_IDENTIFIER}`);
    expect(qrImage).toHaveAttribute('src', QR_PNG);
    expect(
      screen.getByRole('button', { name: 'Imprimir códigos de la recepción' }),
    ).toBeInTheDocument();
  });

  it('opens only the reception document linked to the scanned pallet', async () => {
    const onViewReference = vi.fn();
    const initialState = {
      currentReception: {
        ocFolio: 'OC-24891',
        receptionId: 'reception-1',
        tarimas: 12,
        proveedor: 'Distribuidora del Norte',
        proveedorLogistico: 'Logística Veloz',
      },
      sessionState: 'planning',
    };

    renderWithProviders(
      <TarimaDetalle onBack={vi.fn()} onViewReference={onViewReference} qrCode={QR_IDENTIFIER} />,
      initialState
    );

    fireEvent.click(await screen.findByRole('button', { name: /Ver referencia/ }));

    expect(onViewReference).toHaveBeenCalledWith(expect.objectContaining({ recId: 'reception-1' }));
  });

  it('does not offer a fake reception reference when the detail has no reception id', async () => {
    renderWithProviders(<TarimaDetalle onBack={vi.fn()} onViewReference={vi.fn()} />, {});

    await screen.findAllByText('TQR-24891-003');

    expect(screen.queryByRole('button', { name: /Ver referencia/ })).not.toBeInTheDocument();
  });

  it('prints every registered and planned QR code for the reception', async () => {
    mockServices.getReception.mockResolvedValue({
      id: 'reception-1',
      purchaseOrderId: 'OC-24891',
      palletCount: 3,
      plannedPallets: [{ qrIdentifier: 'TQR-REC-2026-1035-005', palletNumber: 5 }],
    });
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderWithProviders(
      <TarimaDetalle
        onBack={vi.fn()}
        qrCode={QR_IDENTIFIER}
        authorizedWarehouseIds={['warehouse-1']}
      />,
      {}
    );

    const printButton = await screen.findByRole('button', {
      name: 'Imprimir códigos de la recepción',
    });
    await waitFor(() => expect(printButton).toBeEnabled());
    fireEvent.click(printButton);

    await waitFor(() => {
      expect(document.querySelectorAll('#reception-qr-print-set svg')).toHaveLength(3);
      expect(print).toHaveBeenCalledOnce();
    });
    expect(mockServices.getPalletsByReception).toHaveBeenCalledWith('reception-1', ['warehouse-1']);
    print.mockRestore();
  });
});