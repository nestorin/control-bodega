import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ProgramacionRecepcion from "@/screens/ProgramacionRecepcion";

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ user: null, profile: null, canQuery: false }),
}));

vi.mock("@/hooks/useOcr", () => ({
  useOcr: () => ({
    runOcr: vi.fn(),
    loading: false,
    result: null,
    error: null,
    clear: vi.fn(),
  }),
}));

const catalogs = {
  proveedores: [
    {
      id: "sup-1",
      nombre: "Proveedor Norte",
      contacto: "",
      telefono: "",
      email: "",
      tipo: "mercancia" as const,
    },
    {
      id: "log-1",
      nombre: "Logística Remota",
      contacto: "",
      telefono: "",
      email: "",
      tipo: "logistica" as const,
    },
  ],
  productos: [
    {
      id: "prod-1",
      nombre: "Producto Seleccionable",
      sku: "SKU-1",
      unidad: "cajas",
      activo: true,
    },
  ],
};
const catalogsWithoutLogistics = {
  ...catalogs,
  proveedores: catalogs.proveedores.filter((supplier) => supplier.tipo === "mercancia"),
};

describe("ProgramacionRecepcion controlled inputs", () => {
  it("uses the manually entered purchase order number as the reception folio", () => {
    render(<ProgramacionRecepcion onBack={vi.fn()} onFinish={vi.fn()} catalogos={catalogs} />);

    const folio = screen.getByLabelText("Número de orden de compra o folio de recepción");
    fireEvent.change(folio, { target: { value: "OC-2026-001" } });

    expect(folio).toHaveValue("OC-2026-001");
  });

  it("persists logistics selection when entering no-OC mode and advancing", () => {
    render(<ProgramacionRecepcion onBack={vi.fn()} onFinish={vi.fn()} catalogos={catalogs} />);

    fireEvent.click(screen.getByRole("button", { name: /No tengo Orden de Compra/ }));
    expect(screen.getByLabelText("Proveedor logístico")).toHaveAttribute(
      "name",
      "logisticsSupplier",
    );
    const selects = screen.getAllByRole("combobox");
    expect(screen.getByRole("option", { name: "Logística Remota" })).toBeInTheDocument();
    fireEvent.change(selects[1], { target: { value: "Logística Remota" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(screen.getAllByRole("combobox")[1]).toHaveValue("Logística Remota");
  });

  it("does not invent logistics providers when the remote catalog has none", () => {
    render(
      <ProgramacionRecepcion
        onBack={vi.fn()}
        onFinish={vi.fn()}
        catalogos={catalogsWithoutLogistics}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /No tengo Orden de Compra/ }));
    const logistics = screen.getByLabelText("Proveedor logístico");

    expect(logistics).toHaveValue("");
    expect(screen.queryByRole("option", { name: "LOGÍSTICA VELOZ" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Proveedor de mercancía"), {
      target: { value: "Proveedor Norte" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(screen.getByLabelText("Proveedor logístico")).toHaveValue("");
  });

  it("keeps manually typed product text in state for line validation", () => {
    render(<ProgramacionRecepcion onBack={vi.fn()} onFinish={vi.fn()} catalogos={catalogs} />);

    fireEvent.click(screen.getByRole("button", { name: /No tengo Orden de Compra/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Agregar primer producto" }));
    const productInputs = screen.getAllByPlaceholderText("Escribe para buscar...");
    expect(productInputs[0]).toHaveAttribute("name", expect.stringContaining("[name]"));
    fireEvent.change(productInputs[0], { target: { value: "Producto manual" } });
    expect(productInputs[0]).toHaveValue("Producto manual");

    const quantities = screen.getAllByRole("spinbutton");
    fireEvent.change(quantities[0], { target: { value: "2" } });
    fireEvent.change(quantities[1], { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Generar Códigos" }));
    expect(screen.queryByText("Nombre del producto es requerido")).not.toBeInTheDocument();
  });

  it("keeps the catalog product ID when selecting a product before continuing", () => {
    render(<ProgramacionRecepcion onBack={vi.fn()} onFinish={vi.fn()} catalogos={catalogs} />);

    fireEvent.click(screen.getByRole("button", { name: /No tengo Orden de Compra/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Agregar primer producto" }));

    const productInput = screen.getAllByPlaceholderText("Escribe para buscar...")[0];
    fireEvent.change(productInput, {
      target: { value: "Producto Seleccionable" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Producto Seleccionable/ }));

    expect(productInput).toHaveValue("Producto Seleccionable");
    expect(screen.queryByText("✗ Manual")).not.toBeInTheDocument();
    expect(screen.getAllByText("✓ Match").length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Confirmar producto" })[0]);
    expect(screen.getAllByText("Producto confirmado").length).toBeGreaterThan(0);
    fireEvent.change(screen.getAllByRole("spinbutton")[0], {
      target: { value: "1" },
    });
    expect(
      screen.queryByText("Relaciona al menos un producto antes de guardar"),
    ).not.toBeInTheDocument();
  });

  it("keeps product cards spacious and product actions touch-friendly on mobile", () => {
    render(<ProgramacionRecepcion onBack={vi.fn()} onFinish={vi.fn()} catalogos={catalogs} />);
    fireEvent.click(screen.getByRole("button", { name: /No tengo Orden de Compra/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Agregar primer producto" }));

    const productInput = screen.getAllByPlaceholderText("Escribe para buscar...")[0];
    fireEvent.change(productInput, { target: { value: "Producto Seleccionable" } });
    fireEvent.click(screen.getByRole("button", { name: /Producto Seleccionable/ }));

    const card = screen.getByTestId("reception-product-card");
    expect(card.className).toContain("rounded-2xl");
    expect(card.className).toContain("p-4");
    expect(card.className).toContain("shadow-sm");
    const confirm = screen.getAllByRole("button", { name: /Confirmar producto/ })[0];
    expect(confirm.className).toContain("min-h-11");
    expect(confirm.className).toContain("w-full");
  });
});
