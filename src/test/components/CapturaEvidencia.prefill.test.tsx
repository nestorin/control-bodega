import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ReceptionProvider } from '@/context/ReceptionContext';
import { CatalogosProvider } from '@/context/CatalogosContext';
import { InventoryProvider } from '@/context/InventoryContext';
import { UIProvider } from '@/context/UIContext';

vi.mock('@/hooks/useAuthorization', () => ({
  useAuthorization: () => ({
    user: null,
    profile: null,
    canQuery: true,
  }),
}));

vi.mock('@/config/featureFlags', () => ({
  isFeatureEnabled: vi.fn(() => false),
}));

import CapturaEvidencia from '@/screens/CapturaEvidencia';

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

describe('CapturaEvidencia inherited data', () => {
  it('prefills provider, product, lot and expiry from ReceptionContext', async () => {
    const initialState = {
      currentReception: {
        proveedor: 'Proveedor Norte',
        productos: [{ nombre: 'Producto Demo' }],
        tarimas: 3,
        lote: 'LOT-001',
        caducidad: '2027-01-15',
      },
      sessionState: 'planning',
    };

    renderWithProviders(
      <CapturaEvidencia />,
      initialState
    );

    expect(screen.getByDisplayValue('Proveedor Norte')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Producto Demo')).toBeInTheDocument();
    expect(screen.getByDisplayValue('LOT-001')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2027-01-15')).toBeInTheDocument();
  });
});