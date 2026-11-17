import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReceptionProvider, UIProvider, useReceptionContext } from "@/context";
import { mergePalletStatuses } from "@/domains/reception/receptionResume";
import type { PalletDoc } from "@/services/firestore/types";
import type { PlannedReceptionPallet } from "@/services/firestore/types";

const firestoreScenario = vi.hoisted(() => ({
  enabled: false,
  receptions: [] as any[],
  reception: null as any,
  pallets: [] as any[],
  admin: false,
  mutationOptions: {
    canDelete: false,
    canCancel: false,
    canRestore: false,
    canHide: false,
    canShow: false,
  },
}));
const downloadTarimaQrBatch = vi.hoisted(() => vi.fn());
const mutateReception = vi.hoisted(() => vi.fn(async () => undefined));
const advanceToInProgress = vi.hoisted(() => vi.fn(async () => undefined));
const routerNavigate = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useLocation: () => ({ pathname: "/" }),
    useNavigate: () => routerNavigate,
  };
});

vi.mock("@/config/featureFlags", () => ({
  isFeatureEnabled: () => firestoreScenario.enabled,
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));

vi.mock("@/services/firestore", () => ({
  createFirestoreServices: () => ({
    receptions: {
      getByWarehouse: vi.fn(async (warehouseId: string) =>
        warehouseId === "wh_tehuacan_1" ? firestoreScenario.receptions : [],
      ),
      getById: vi.fn(async () => firestoreScenario.reception),
      mutationOptions: vi.fn(async () => firestoreScenario.mutationOptions),
      mutateReception,
      advanceToInProgress,
    },
    pallets: { getByReception: vi.fn(async () => firestoreScenario.pallets) },
  }),
}));

vi.mock("@/services/tarimaQrDownload", () => ({ downloadTarimaQrBatch }));

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({
    canQuery: firestoreScenario.enabled,
    warehouseIds: ["wh_tehuacan_1", "wh_tehuacan_2"],
    canAccessWarehouse: (warehouseId: string) => ["wh_tehuacan_1", "wh_tehuacan_2"].includes(warehouseId),
    hasAnyRole: () => firestoreScenario.admin,
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

function ReceptionStateProbe() {
  const { currentScreen, currentReception, editReceptionData, sessionState } =
    useReceptionContext();
  // The edit path stores the Firestore document, whose canonical identifier is `id`.
  const editReceptionId =
    editReceptionData?.receptionId ??
    (editReceptionData && "id" in editReceptionData ? String(editReceptionData.id) : "");

  const firstPalletStatus = currentReception?.plannedPallets?.[0]?.status ?? "";
  const secondPalletStatus = currentReception?.plannedPallets?.[1]?.status ?? "";

  return (
    <>
      <span data-testid="current-screen">{currentScreen}</span>
      <span data-testid="session-state">{sessionState}</span>
      <span data-testid="current-reception-id">{currentReception?.receptionId ?? ""}</span>
      <span data-testid="current-planned-pallets-count">
        {currentReception?.plannedPallets?.length ?? 0}
      </span>
      <span data-testid="first-pallet-status">{firstPalletStatus}</span>
      <span data-testid="second-pallet-status">{secondPalletStatus}</span>
      <span data-testid="edit-reception-id">{editReceptionId}</span>
    </>
  );
}

function renderRecepciones(props: ComponentProps<typeof Recepciones> = {}) {
  return render(
    <UIProvider>
      <ReceptionProvider initialState={{ currentScreen: "recepciones" }}>
        <ReceptionStateProbe />
        <Recepciones {...props} />
      </ReceptionProvider>
    </UIProvider>,
  );
}

describe("mergePalletStatuses", () => {
  it("merges real pallet statuses into planned pallets by qrIdentifier", () => {
    const planned: PlannedReceptionPallet[] = [
      {
        qrIdentifier: "TQR-1-001",
        palletNumber: 1,
        productId: "prod-1",
        productName: "Agua",
        quantity: 10,
        unit: "cajas",
        lineIndex: 0,
        status: "PLANNED",
      },
      {
        qrIdentifier: "TQR-1-002",
        palletNumber: 2,
        productId: "prod-1",
        productName: "Agua",
        quantity: 10,
        unit: "cajas",
        lineIndex: 0,
        status: "PLANNED",
      },
    ];

    const realPallets: PalletDoc[] = [
      {
        id: "pallet-1",
        qrIdentifier: "TQR-1-001",
        receptionId: "rec-1",
        warehouseId: "wh_tehuacan_1",
        productId: "prod-1",
        quantity: 10,
        unit: "cajas",
        status: "RECEIVED",
        palletNumber: 1,
        organizationId: "org-1",
        createdAt: {} as any,
        updatedAt: {} as any,
      },
      {
        id: "pallet-2",
        qrIdentifier: "TQR-1-002",
        receptionId: "rec-1",
        warehouseId: "wh_tehuacan_1",
        productId: "prod-1",
        quantity: 10,
        unit: "cajas",
        status: "CREATED",
        palletNumber: 2,
        organizationId: "org-1",
        createdAt: {} as any,
        updatedAt: {} as any,
      },
    ];

    const merged = mergePalletStatuses(planned, realPallets);

    expect(merged[0].status).toBe("RECEIVED");
    expect(merged[1].status).toBe("PLANNED");
    // Original planned array should not be mutated
    expect(planned[0].status).toBe("PLANNED");
    expect(planned[1].status).toBe("PLANNED");
  });

  it("keeps planned status when no matching real pallet exists", () => {
    const planned: PlannedReceptionPallet[] = [
      {
        qrIdentifier: "TQR-1-001",
        palletNumber: 1,
        productId: "prod-1",
        productName: "Agua",
        quantity: 10,
        unit: "cajas",
        lineIndex: 0,
        status: "PLANNED",
      },
    ];

    const realPallets: PalletDoc[] = [
      {
        id: "pallet-2",
        qrIdentifier: "TQR-1-002",
        receptionId: "rec-1",
        warehouseId: "wh_tehuacan_1",
        productId: "prod-1",
        quantity: 10,
        unit: "cajas",
        status: "RECEIVED",
        palletNumber: 2,
        organizationId: "org-1",
        createdAt: {} as any,
        updatedAt: {} as any,
      },
    ];

    const merged = mergePalletStatuses(planned, realPallets);

    expect(merged[0].status).toBe("PLANNED");
  });

  it("maps STORED status to RECEIVED", () => {
    const planned: PlannedReceptionPallet[] = [
      {
        qrIdentifier: "TQR-1-001",
        palletNumber: 1,
        productId: "prod-1",
        productName: "Agua",
        quantity: 10,
        unit: "cajas",
        lineIndex: 0,
        status: "PLANNED",
      },
    ];

    const realPallets: PalletDoc[] = [
      {
        id: "pallet-1",
        qrIdentifier: "TQR-1-001",
        receptionId: "rec-1",
        warehouseId: "wh_tehuacan_1",
        productId: "prod-1",
        quantity: 10,
        unit: "cajas",
        status: "STORED",
        palletNumber: 1,
        organizationId: "org-1",
        createdAt: {} as any,
        updatedAt: {} as any,
      },
    ];

    const merged = mergePalletStatuses(planned, realPallets);

    expect(merged[0].status).toBe("RECEIVED");
  });

  it("maps BLOCKED status to PLANNED", () => {
    const planned: PlannedReceptionPallet[] = [
      {
        qrIdentifier: "TQR-1-001",
        palletNumber: 1,
        productId: "prod-1",
        productName: "Agua",
        quantity: 10,
        unit: "cajas",
        lineIndex: 0,
        status: "PLANNED",
      },
    ];

    const realPallets: PalletDoc[] = [
      {
        id: "pallet-1",
        qrIdentifier: "TQR-1-001",
        receptionId: "rec-1",
        warehouseId: "wh_tehuacan_1",
        productId: "prod-1",
        quantity: 10,
        unit: "cajas",
        status: "BLOCKED",
        palletNumber: 1,
        organizationId: "org-1",
        createdAt: {} as any,
        updatedAt: {} as any,
      },
    ];

    const merged = mergePalletStatuses(planned, realPallets);

    expect(merged[0].status).toBe("PLANNED");
  });
});

describe("Recepciones presentation", () => {
  beforeEach(() => {
    firestoreScenario.enabled = false;
    firestoreScenario.receptions = [];
    firestoreScenario.reception = null;
    firestoreScenario.pallets = [];
    firestoreScenario.admin = false;
    firestoreScenario.mutationOptions = {
      canDelete: false,
      canCancel: false,
      canRestore: false,
      canHide: false,
      canShow: false,
    };
    routerNavigate.mockClear();
    downloadTarimaQrBatch.mockClear();
    mutateReception.mockClear();
  });
  it("renders local reception cards and keeps selection wired", () => {
    const onSelectTarima = vi.fn();
    const onEdit = vi.fn();

    renderRecepciones({ onSelectTarima, onEdit });

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

    renderRecepciones({ onSelectTarima, onEdit: vi.fn() });

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

    renderRecepciones({ onSelectTarima, onEdit, onResume });

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
        warehouseId: "wh_tehuacan_1",
        status: "IN_PROGRESS",
        plannedPallets: [{ qrIdentifier: "TQR-REC-2026-1-002", palletNumber: 2 }],
      },
    ];
    firestoreScenario.reception = firestoreScenario.receptions[0];
    firestoreScenario.pallets = [{ qrIdentifier: "TQR-REC-2026-1-001", palletNumber: 1 }];
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    renderRecepciones({ onSelectTarima: vi.fn(), onEdit: vi.fn() });

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
        warehouseId: "wh_tehuacan_1",
        status: "CONFIRMED",
        plannedPallets: [{ qrIdentifier: "TQR-REC-2026-1-001", palletNumber: 1 }],
      },
    ];
    firestoreScenario.reception = firestoreScenario.receptions[0];
    firestoreScenario.pallets = [];
    renderRecepciones({ onSelectTarima: vi.fn(), onEdit: vi.fn() });

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

  it("hides cancelled and hidden receptions by default but exposes them through filters", async () => {
    firestoreScenario.enabled = true;
    firestoreScenario.receptions = [
      { id: "active", status: "DRAFT", folio: "REC-A" },
      { id: "cancelled", status: "CANCELLED", folio: "REC-C" },
      { id: "hidden", status: "DRAFT", hiddenAt: {}, folio: "REC-H" },
    ];
    renderRecepciones({ onSelectTarima: vi.fn(), onEdit: vi.fn() });

    expect(await screen.findByText("REC-A")).toBeInTheDocument();
    expect(screen.queryByText("REC-C")).not.toBeInTheDocument();
    expect(screen.queryByText("REC-H")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Cancelada" } });
    expect(screen.getByText("REC-C")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Oculta" } });
    expect(screen.getByText("REC-H")).toBeInTheDocument();

    firestoreScenario.enabled = false;
    firestoreScenario.receptions = [];
  });

  it("offers server-approved admin actions and waits for mutation success", async () => {
    firestoreScenario.enabled = true;
    firestoreScenario.admin = true;
    firestoreScenario.mutationOptions = {
      canDelete: false,
      canCancel: true,
      canRestore: false,
      canHide: true,
      canShow: false,
    };
    firestoreScenario.receptions = [{ id: "draft", status: "DRAFT", folio: "REC-D" }];
    renderRecepciones({ onSelectTarima: vi.fn(), onEdit: vi.fn() });

    await screen.findByText("REC-D");
    fireEvent.click(screen.getByTitle("Opciones"));
    expect(await screen.findByRole("button", { name: "Cancelar borrador" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Eliminar borrador" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar borrador" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar borrador" }));
    await waitFor(() =>
      expect(mutateReception).toHaveBeenCalledWith("draft", "CANCEL", expect.any(String)),
    );

    firestoreScenario.admin = false;
    firestoreScenario.enabled = false;
    firestoreScenario.receptions = [];
    mutateReception.mockClear();
  });

  it("does not expose lifecycle mutations to a non-admin member", async () => {
    firestoreScenario.enabled = true;
    firestoreScenario.admin = false;
    firestoreScenario.receptions = [{ id: "draft", status: "DRAFT", folio: "REC-D" }];
    renderRecepciones({ onSelectTarima: vi.fn(), onEdit: vi.fn() });

    await screen.findByText("REC-D");
    fireEvent.click(screen.getByTitle("Opciones"));
    expect(screen.queryByRole("button", { name: "Cancelar borrador" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Eliminar borrador" })).not.toBeInTheDocument();

    firestoreScenario.enabled = false;
    firestoreScenario.receptions = [];
  });

  it("resumes an IN_PROGRESS reception through state and replaces the URL", async () => {
    firestoreScenario.enabled = true;
    const reception = {
      id: "reception-in-progress",
      folio: "REC-RESUME-1",
      supplierName: "El Florido",
      warehouseId: "wh_tehuacan_1",
      status: "IN_PROGRESS",
      scheduledDate: "2026-09-19",
      plannedPallets: [
        {
          qrIdentifier: "TQR-1-001",
          palletNumber: 1,
          productName: "Agua",
          quantity: 10,
          unit: "cajas",
          status: "PLANNED",
          lineIndex: 0,
        },
        {
          qrIdentifier: "TQR-1-002",
          palletNumber: 2,
          productName: "Agua",
          quantity: 10,
          unit: "cajas",
          status: "PLANNED",
          lineIndex: 0,
        },
      ],
    };
    firestoreScenario.receptions = [reception];
    firestoreScenario.reception = reception;
    // Real pallets from subcollection: first one RECEIVED, second still PLANNED (CREATED)
    firestoreScenario.pallets = [
      {
        id: "pallet-1",
        qrIdentifier: "TQR-1-001",
        receptionId: "reception-in-progress",
        warehouseId: "wh_tehuacan_1",
        productId: "prod-agua",
        quantity: 10,
        unit: "cajas",
        status: "RECEIVED",
        palletNumber: 1,
        organizationId: "org_exepa_001",
        createdAt: {} as any,
        updatedAt: {} as any,
      },
      {
        id: "pallet-2",
        qrIdentifier: "TQR-1-002",
        receptionId: "reception-in-progress",
        warehouseId: "wh_tehuacan_1",
        productId: "prod-agua",
        quantity: 10,
        unit: "cajas",
        status: "CREATED",
        palletNumber: 2,
        organizationId: "org_exepa_001",
        createdAt: {} as any,
        updatedAt: {} as any,
      },
    ];

    renderRecepciones();
    fireEvent.click(await screen.findByRole("button", { name: "Reanudar recepción REC-RESUME-1" }));

    await waitFor(() => {
      expect(screen.getByTestId("current-screen")).toHaveTextContent("captura-tarima");
      expect(screen.getByTestId("session-state")).toHaveTextContent("pallets");
      expect(screen.getByTestId("current-reception-id")).toHaveTextContent("reception-in-progress");
      expect(screen.getByTestId("current-planned-pallets-count")).toHaveTextContent("2");
      // Verify merged statuses: first pallet RECEIVED, second PLANNED
      expect(screen.getByTestId("first-pallet-status")).toHaveTextContent("RECEIVED");
      expect(screen.getByTestId("second-pallet-status")).toHaveTextContent("PLANNED");
    });
    expect(routerNavigate).toHaveBeenCalledWith("/captura-tarima", { replace: true });
  });

  it("resumes a DRAFT reception in the edit screen and replaces the URL", async () => {
    firestoreScenario.enabled = true;
    const reception = {
      id: "reception-draft",
      folio: "REC-RESUME-2",
      supplierName: "El Florido",
      warehouseId: "wh_tehuacan_1",
      status: "DRAFT",
      scheduledDate: "2026-09-19",
      plannedPallets: [
        {
          qrIdentifier: "TQR-2-001",
          palletNumber: 1,
          productName: "Agua",
          quantity: 10,
          unit: "cajas",
          status: "PLANNED",
          lineIndex: 0,
        },
      ],
    };
    firestoreScenario.receptions = [reception];
    firestoreScenario.reception = reception;

    renderRecepciones();
    fireEvent.click(await screen.findByRole("button", { name: "Reanudar recepción REC-RESUME-2" }));

    await waitFor(() => {
      expect(screen.getByTestId("current-screen")).toHaveTextContent("editar-recepcion");
      expect(screen.getByTestId("edit-reception-id")).toHaveTextContent("reception-draft");
    });
    expect(routerNavigate).toHaveBeenCalledWith("/editar-recepcion", { replace: true });
  });

  it("does not resume a non-resumable reception document", async () => {
    firestoreScenario.enabled = true;
    const listedReception = {
      id: "reception-confirmed",
      folio: "REC-RESUME-3",
      supplierName: "El Florido",
      warehouseId: "wh_tehuacan_1",
      status: "DRAFT",
      plannedPallets: [
        {
          qrIdentifier: "TQR-3-001",
          palletNumber: 1,
          productName: "Agua",
          quantity: 10,
          unit: "cajas",
          status: "PLANNED",
          lineIndex: 0,
        },
      ],
    };
    firestoreScenario.receptions = [listedReception];
    // Simulate a stale row: the authoritative document is already confirmed.
    firestoreScenario.reception = { ...listedReception, status: "CONFIRMED" };

    renderRecepciones();
    fireEvent.click(await screen.findByRole("button", { name: "Reanudar recepción REC-RESUME-3" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La recepción seleccionada no se puede reanudar.",
    );
    expect(screen.getByTestId("current-screen")).toHaveTextContent("recepciones");
    expect(routerNavigate).not.toHaveBeenCalled();
  });
});
