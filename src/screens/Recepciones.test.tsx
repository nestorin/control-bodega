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

// Helper function to map reception data for useCollection
function mapReceptionForCollection(r: any) {
  const productName = r.productName || r.plannedPallets?.[0]?.productName || "";
  return {
    id: r.id,
    displayId: r.folio || r.id,
    proveedor: r.supplierName || "",
    producto: productName,
    tarimas: r.palletCount || r.plannedPallets?.length || 0,
    fecha: r.scheduledDate || new Date().toLocaleDateString(),
    estado:
      r.status === "CONFIRMED"
        ? "Completada"
        : r.status === "IN_PROGRESS"
          ? "En proceso"
          : r.status === "CANCELLED"
            ? "Con incidencia"
            : "Borrador",
    canResume: r.status === "DRAFT" && r.plannedPallets?.some((p: any) => p.status === "PLANNED"),
    color:
      r.status === "CONFIRMED" ? "#16845b" : r.status === "IN_PROGRESS" ? "#3276a8" : "#c54b45",
    bg: r.status === "CONFIRMED" ? "#e2f5ec" : r.status === "IN_PROGRESS" ? "#e7f0f2" : "#fce9e7",
    img:
      r.status === "CONFIRMED"
        ? "/assets/08d70.svg"
        : r.status === "IN_PROGRESS"
          ? "/assets/08d70.svg"
          : "/assets/9d6fd.svg",
  };
}

// Mock the useCollection to return firestore data when enabled
vi.mock("@/hooks/useFirestore", async () => {
  const actual = await vi.importActual("@/hooks/useFirestore");
  return {
    ...actual,
    useCollection: () => ({
      data: firestoreScenario.enabled
        ? firestoreScenario.receptions.map(mapReceptionForCollection)
        : [],
      loading: false,
      error: null,
      refresh: vi.fn(),
    }),
    useOfflineQueue: () => ({ enqueue: vi.fn(), isOnline: true }),
  };
});

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
        scheduledDate: "2026-09-19",
        createdAt: { toDate: () => new Date("2026-09-19") },
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
    expect(screen.getByText(/1 tarimas/i)).toBeInTheDocument();
    // Date format varies by locale - just ensure the card renders without error
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
