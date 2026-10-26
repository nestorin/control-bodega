import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OcrOrderSelector } from "@/components/OcrOrderSelector";
import type { OcrOrder } from "@/services/domain/ocrMapper";

const orders: OcrOrder[] = [
  {
    folio: "OC1437",
    fecha: null,
    proveedor: "SMART & FINAL DEL NOROESTE",
    total: null,
    productos: [
      {
        linea: 1,
        codigo: "CB0401",
        nombre: "AGUA MINERAL 355 ML C/24 PZS S",
        unidad: "Caja",
        cantidad: 100,
        precio: 0,
        importe: 0,
        confianza: 1,
      },
    ],
    lineas_detectadas: [],
  },
  {
    folio: "OC1436",
    fecha: null,
    proveedor: "SMART & FINAL DEL NOROESTE",
    total: null,
    productos: [
      {
        linea: 1,
        codigo: "CB0301",
        nombre: "BEBIDA SABOR COLA 235ML C/24 PZS S",
        unidad: "Caja",
        cantidad: 100,
        precio: 0,
        importe: 0,
        confianza: 1,
      },
    ],
    lineas_detectadas: [],
  },
];

describe("OcrOrderSelector", () => {
  it("asks the operator to choose and reports the selected order", () => {
    const onSelect = vi.fn();
    render(<OcrOrderSelector orders={orders} selectedIndex={null} onSelect={onSelect} />);

    expect(screen.getByRole("status").textContent).toContain("Selecciona una orden");
    const secondOrder = screen.getByRole("button", { name: "Importar orden OC1436" });
    fireEvent.click(secondOrder);

    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("does not render when there is only one order", () => {
    const { container } = render(
      <OcrOrderSelector orders={orders.slice(0, 1)} selectedIndex={null} onSelect={vi.fn()} />,
    );

    expect(container.firstChild).toBeNull();
  });
});
