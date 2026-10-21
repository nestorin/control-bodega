import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Embarques from "@/screens/Embarques";

const mocks = vi.hoisted(() => {
  let resolveInitialShipments: (shipments: unknown[]) => void;
  const getByWarehouse = vi.fn(
    () =>
      new Promise<unknown[]>((resolve) => {
        resolveInitialShipments = resolve;
      }),
  );

  return {
    getByWarehouse,
    createShipment: vi.fn(() => new Promise(() => {})),
    resolveInitialShipments: (shipments: unknown[]) => resolveInitialShipments(shipments),
  };
});

vi.mock("@/config/featureFlags", () => ({
  isFeatureEnabled: () => true,
}));

vi.mock("@/hooks/useAuthorization", () => ({
  isPermissionDenied: () => false,
  useAuthorization: () => ({ canQuery: true }),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));

vi.mock("@/services/firestore", () => ({
  createFirestoreServices: () => ({
    conversions: { getAll: vi.fn().mockResolvedValue({ data: [] }) },
    shipments: {
      getByWarehouse: mocks.getByWarehouse,
      createShipment: mocks.createShipment,
      update: vi.fn().mockResolvedValue(undefined),
    },
  }),
}));

describe("Embarques initial Firestore reconciliation", () => {
  it("keeps the active local draft when the initial cloud list resolves without it", async () => {
    const user = userEvent.setup();
    render(<Embarques catalogoProductos={[]} catalogoProveedores={[]} catalogoConversiones={[]} />);

    await waitFor(() => expect(mocks.getByWarehouse).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Nuevo embarque" }));

    expect(screen.getByText("Datos del embarque")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("FAC-2024-0001"), "DRAFT-LATEST-001");

    await act(async () => {
      mocks.resolveInitialShipments([]);
    });

    expect(screen.getByText("Datos del embarque")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("FAC-2024-0001")).toHaveValue("DRAFT-LATEST-001");
  });
});
