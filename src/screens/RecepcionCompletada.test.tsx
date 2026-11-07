import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const firestoreHarness = vi.hoisted(() => ({ enabled: false, loading: false }));

vi.mock("@/config/featureFlags", () => ({
  isFeatureEnabled: () => firestoreHarness.enabled,
}));
vi.mock("@/hooks/useFirestore", () => ({
  useDocument: () => ({ data: null, loading: firestoreHarness.loading, error: null }),
  useCollection: () => ({ data: [], loading: false, error: null }),
  useOfflineQueue: () => ({ enqueue: vi.fn(), isOnline: true }),
}));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ canQuery: firestoreHarness.enabled }),
}));
vi.mock("@/services/firestore", () => ({ createFirestoreServices: () => ({}) }));

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

  it("shows the completion summary and navigation while Firestore is still loading", () => {
    firestoreHarness.enabled = true;
    firestoreHarness.loading = true;

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
    expect(screen.getByRole("status")).toHaveTextContent("La recepción quedó registrada");
    expect(screen.queryByText("Cargando...")).not.toBeInTheDocument();

    firestoreHarness.enabled = false;
    firestoreHarness.loading = false;
  });
});
