import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('@/config/featureFlags', () => ({
  isFeatureEnabled: () => false,
}));

vi.mock('@/lib/firebase', () => ({
  db: null,
  storage: null,
}));

vi.mock('@/hooks/useAuthorization', () => ({
  useAuthorization: () => ({
    accessStatus: 'UNAUTHENTICATED',
    profile: null,
    canQuery: false,
  }),
}));

import CapturaTarima from '@/screens/CapturaTarima';
import { renderWithAppProviders } from '@/test/utils/renderWithAppProviders';

describe('CapturaTarima empty state', () => {
  it('renders the safe empty state when there is no active reception', () => {
    renderWithAppProviders(<CapturaTarima />, {
      currentReception: null,
    });

    expect(screen.getByRole('heading', { name: 'Sin recepción activa' })).toBeInTheDocument();
    expect(screen.getByText(/Iniciá una nueva recepción desde el inicio/i)).toBeInTheDocument();
  });

  it('keeps the back action available in the empty state', () => {
    renderWithAppProviders(<CapturaTarima />, {
      currentReception: null,
    });

    expect(screen.getByRole('button', { name: 'Volver al inicio' })).toBeInTheDocument();
  });
});
