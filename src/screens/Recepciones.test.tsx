import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const firestoreScenario = vi.hoisted(() => ({ enabled: false, receptions: [] as any[] }));

vi.mock("@/config/featureFlags", () => ({
  isFeatureEnabled: () => firestoreScenario.enabled,
}));

vi.mock("@/hooks/useFirestore", () => ({
  useCollection: () => ({
    data: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
  useOfflineQueue: () => ({ enqueue: vi.fn(), isOnline: true }),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/services/firestore", () => ({
  createFirestoreServices: () => ({
    receptions: { getByWarehouse: vi.fn(async () => firestoreScenario.receptions) },
  }),
}));

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({
    canQuery: firestoreScenario.enabled,
    canAccessWarehouse: () => firestoreScenario.enabled,
  }),
  isPermissionDenied: () => false,
}));

import Recepciones from "./Recepciones";

describe("Recepciones presentation", () => {
  it("renders local reception cards and keeps selection wired", () => {
    const onSelectTarima = vi.fn();
    const onEdit = vi.fn();

    render(<Recepciones onSelectTarima={onSelectTarima} onEdit={onEdit} />);

    expect(screen.getByText("OC-24891")).toBeInTheDocument();
    expect(screen.getAllByText("Completada").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Con incidencia").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Abrir recepción OC-24891" }));
    expect(onSelectTarima).toHaveBeenCalledWith("OC-24891");

    fireEvent.click(screen.getAllByTitle("Opciones")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(onEdit).toHaveBeenCalledWith("OC-24891");
  });

  it("supports keyboard activation of a reception card", () => {
    const onSelectTarima = vi.fn();

    render(<Recepciones onSelectTarima={onSelectTarima} onEdit={vi.fn()} />);

    fireEvent.keyDown(screen.getByRole("button", { name: "Abrir recepción OC-24850" }), {
      key: "Enter",
    });

    expect(onSelectTarima).toHaveBeenCalledWith("OC-24850");
  });

  it("offers resume using the Firestore document ID, not operationId", async () => {
    firestoreScenario.enabled = true;
    firestoreScenario.receptions = [
      {
        id: "reception-doc-1",
        operationId: "operation-1",
        folio: "REC-2026-1",
        supplierName: "El Florido",
        status: "DRAFT",
        plannedPallets: [{ productName: "Agua", status: "PLANNED" }],
      },
    ];
    const onResume = vi.fn();

    render(<Recepciones onSelectTarima={vi.fn()} onEdit={vi.fn()} onResume={onResume} />);

    const resume = await screen.findByRole("button", { name: "Reanudar recepción REC-2026-1" });
    expect(screen.getByText("El Florido")).toBeInTheDocument();
    expect(screen.getByText("Agua")).toBeInTheDocument();
    expect(screen.getByText("1 tarimas ·")).toBeInTheDocument();
    fireEvent.click(resume);
    expect(onResume).toHaveBeenCalledWith("reception-doc-1");
    firestoreScenario.enabled = false;
    firestoreScenario.receptions = [];
  });
});
