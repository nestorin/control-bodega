import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Paso1 } from "@/screens/Embarques";

vi.mock("@/hooks/useOcr", () => ({
  useOcr: () => ({
    runOcr: vi.fn(),
    loading: false,
    result: null,
    error: null,
    clear: vi.fn(),
  }),
}));

const catalog = [
  {
    id: "prod-1",
    nombre: "Producto canónico",
    sku: "P-001",
    categoria: "General",
    unidad: "cajas" as const,
    activo: true,
  },
];

function state() {
  return {
    id: "p-1",
    nombre: "",
    productId: undefined,
    cantidad: 10,
    unidad: "cajas" as const,
    precioUnitario: 0,
    piezasPorCaja: "",
    cajasPorTarima: "",
    tarimasDeclaradas: 0,
  };
}

describe("Embarques product selection", () => {
  it("accepts a visible catalog selection and advances with the canonical product id", () => {
    let current = {
      id: "EMB-1",
      folio: "FAC-1",
      cliente: "Cliente",
      bodega: "Tehuacan-1",
      productos: [state()],
      tarimasEscaneadas: [],
      evidencia: {},
      status: "programado" as const,
      paso: 1 as const,
      fechaCreacion: "2026-01-01",
    };
    const onChange = vi.fn((next) => {
      current = next;
    });
    const onNext = vi.fn();
    const view = render(
      <Paso1
        embarque={current}
        onChange={onChange}
        onNext={onNext}
        catalogoProductos={catalog}
        catalogoConversiones={[]}
        conversionSource="fallback"
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Buscar producto del catálogo…"), {
      target: { value: "Producto" },
    });
    fireEvent.mouseDown(screen.getByText("Producto canónico"));
    view.rerender(
      <Paso1
        embarque={current}
        onChange={onChange}
        onNext={onNext}
        catalogoProductos={catalog}
        catalogoConversiones={[]}
        conversionSource="fallback"
      />,
    );

    expect(screen.getByPlaceholderText("Buscar producto del catálogo…")).toHaveValue(
      "Producto canónico",
    );
    expect(current.productos[0].productId).toBe("prod-1");
    expect(screen.getByRole("button", { name: /Continuar a carga/ })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Continuar a carga/ }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
