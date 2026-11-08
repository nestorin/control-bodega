import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import NuevaRecepcionStep1 from "@/screens/NuevaRecepcionStep1";

const { createReception } = vi.hoisted(() => ({
  createReception: vi.fn(async () => ({ id: "reception-1" })),
}));

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ user: { uid: "user-1" }, canQuery: true }),
}));

vi.mock("@/hooks/useOcr", () => ({
  useOcr: () => ({
    runOcr: vi.fn(),
    loading: false,
    result: null,
    error: null,
    clear: vi.fn(),
    previewDataUrl: null,
  }),
}));

vi.mock("@/config/featureFlags", () => ({
  isFeatureEnabled: (flag: string) => flag === "USE_FIRESTORE_RECEPCIONES",
}));

vi.mock("@/lib/firebase", () => ({ db: {}, storage: null }));

vi.mock("@/services/firestore", () => ({
  createFirestoreServices: () => ({
    receptions: { createReception, updateReception: vi.fn() },
  }),
}));

const catalogs = {
  proveedores: [
    {
      id: "supplier-1",
      nombre: "Proveedor Norte",
      contacto: "",
      telefono: "",
      email: "",
      tipo: "mercancia" as const,
    },
    {
      id: "carrier-1",
      nombre: "Transportes",
      contacto: "",
      telefono: "",
      email: "",
      tipo: "logistica" as const,
    },
  ],
  productos: [],
};

describe("NuevaRecepcionStep1 resume behavior", () => {
  it("reuses the created reception after remount instead of creating another", async () => {
    const onContinue = vi.fn();
    const firstMount = render(
      <NuevaRecepcionStep1
        onBack={vi.fn()}
        onContinue={onContinue}
        catalogos={catalogs}
        catalogosStatus={{ loading: false, error: null }}
      />,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(createReception).toHaveBeenCalledTimes(1));
    expect(onContinue).toHaveBeenCalledWith(
      expect.objectContaining({ receptionId: "reception-1" }),
    );
    firstMount.unmount();

    const resumed = render(
      <NuevaRecepcionStep1
        onBack={vi.fn()}
        onContinue={onContinue}
        initialData={{
          hasOC: true,
          ocFolio: "OC-1",
          tarimas: "2",
          proveedor: "Proveedor Norte",
          proveedorLogistico: "Transportes",
          receptionId: "reception-1",
          productos: [],
          conversionesTabla: [],
        }}
        catalogos={catalogs}
        catalogosStatus={{ loading: false, error: null }}
      />,
    );

    expect(screen.getByText("OC-1")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Proveedor logístico" })).toHaveValue(
      "Transportes",
    );
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(createReception).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenLastCalledWith(
      expect.objectContaining({
        receptionId: "reception-1",
        ocFolio: "OC-1",
        tarimas: "2",
      }),
    );
    resumed.unmount();
  });
});
