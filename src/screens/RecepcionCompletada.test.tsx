import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/config/featureFlags", () => ({ isFeatureEnabled: () => false }));
vi.mock("@/hooks/useFirestore", () => ({
  useDocument: () => ({ data: null, loading: false, error: null }),
  useCollection: () => ({ data: [], loading: false, error: null }),
  useOfflineQueue: () => ({ enqueue: vi.fn(), isOnline: true }),
}));
vi.mock("@/lib/firebase", () => ({ db: null }));
vi.mock("@/hooks/useAuthorization", () => ({ useAuthorization: () => ({ canQuery: false }) }));

import RecepcionCompletada from "./RecepcionCompletada";

describe("RecepcionCompletada without Firestore observation", () => {
  it("shows the local completion summary instead of waiting forever", () => {
    render(
      <RecepcionCompletada
        onHome={vi.fn()}
        onPrint={vi.fn()}
        currentReception={{
          ocFolio: "REC-2026-0001",
          tarimas: 2,
          proveedor: "El Florido",
          proveedorLogistico: "Transportes Herrera",
          receptionId: "reception-op-1",
        }}
      />,
    );

    expect(screen.getByText("Recepción completada")).toBeInTheDocument();
    expect(screen.queryByText("Cargando...")).not.toBeInTheDocument();
  });
});
