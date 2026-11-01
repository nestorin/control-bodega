import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const firestoreScenario = vi.hoisted(() => ({
  enabled: false,
  receptions: [] as any[],
  reception: null as any,
  pallets: [] as any[],
}));
const downloadTarimaQrBatch = vi.hoisted(() => vi.fn());

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
    receptions: {
      getByWarehouse: vi.fn(async () => firestoreScenario.receptions),
      getById: vi.fn(async () => firestoreScenario.reception),
    },
    pallets: { getByReception: vi.fn(async () => firestoreScenario.pallets) },
  }),
}));
vi.mock("@/services/tarimaQrDownload", () => ({ downloadTarimaQrBatch }));

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
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
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
    const onSelectTarima = vi.fn();
    const onEdit = vi.fn();

    render(<Recepciones onSelectTarima={onSelectTarima} onEdit={onEdit} onResume={onResume} />);

    const resume = await screen.findByRole("button", { name: "Reanudar recepción REC-2026-1" });
    expect(screen.getByText("El Florido")).toBeInTheDocument();
    expect(screen.getByText("Agua")).toBeInTheDocument();
    expect(screen.getByText("1 tarimas ·")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abrir recepción REC-2026-1" }));
    expect(onSelectTarima).toHaveBeenCalledWith("reception-doc-1");
    fireEvent.click(screen.getAllByTitle("Opciones")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(onEdit).toHaveBeenCalledWith("reception-doc-1");
    fireEvent.click(resume);
    expect(onResume).toHaveBeenCalledWith("reception-doc-1");
    firestoreScenario.enabled = false;
    firestoreScenario.receptions = [];
  });

  it("prints the registered and planned QR codes for the selected reception", async () => {
    firestoreScenario.enabled = true;
    firestoreScenario.receptions = [
      {
        id: "reception-doc-1",
        folio: "REC-2026-1",
        supplierName: "El Florido",
        productName: "Agua",
        palletCount: 2,
        warehouseId: "warehouse-north",
        status: "IN_PROGRESS",
        plannedPallets: [{ qrIdentifier: "TQR-REC-2026-1-002", palletNumber: 2 }],
      },
    ];
    firestoreScenario.reception = firestoreScenario.receptions[0];
    firestoreScenario.pallets = [{ qrIdentifier: "TQR-REC-2026-1-001", palletNumber: 1 }];
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<Recepciones onSelectTarima={vi.fn()} onEdit={vi.fn()} />);

    await screen.findByText("REC-2026-1");
    fireEvent.click(screen.getAllByTitle("Opciones")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Imprimir QRs" }));

    await waitFor(() => {
      expect(document.querySelectorAll("#reception-list-qr-print svg")).toHaveLength(2);
      expect(print).toHaveBeenCalledOnce();
    });
    firestoreScenario.enabled = false;
    firestoreScenario.receptions = [];
    firestoreScenario.reception = null;
    firestoreScenario.pallets = [];
    print.mockRestore();
  });

  it("downloads a PDF with every QR code for the selected reception", async () => {
    firestoreScenario.enabled = true;
    firestoreScenario.receptions = [
      {
        id: "reception-doc-1",
        folio: "REC-2026-1",
        supplierName: "El Florido",
        productName: "Agua",
        palletCount: 1,
        warehouseId: "warehouse-north",
        status: "CONFIRMED",
        plannedPallets: [{ qrIdentifier: "TQR-REC-2026-1-001", palletNumber: 1 }],
      },
    ];
    firestoreScenario.reception = firestoreScenario.receptions[0];
    firestoreScenario.pallets = [];
    render(<Recepciones onSelectTarima={vi.fn()} onEdit={vi.fn()} />);

    await screen.findByText("REC-2026-1");
    fireEvent.click(screen.getAllByTitle("Opciones")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Descargar QR" }));

    await waitFor(() => {
      expect(downloadTarimaQrBatch).toHaveBeenCalledWith(["TQR-REC-2026-1-001"], "REC-2026-1");
    });
    firestoreScenario.enabled = false;
    firestoreScenario.receptions = [];
    firestoreScenario.reception = null;
    firestoreScenario.pallets = [];
  });
});
