import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "@testing-library/jest-dom";

import ImpresionEtiquetas from "@/screens/ImpresionEtiquetas";
import { renderWithAppProviders } from "@/test/utils/renderWithAppProviders";
import type { PlannedReceptionPallet } from "@/services/firestore/types";
import type { ReceptionData } from "@/types";

/**
 * Regression coverage for the QR identifier printed on a label.
 *
 * The identifier belongs to the backend: `plannedPallets[].qrIdentifier` is
 * derived from the operation id (`TQR-{last 8 chars of the operation id}-{pallet
 * number}`). A folio-derived identifier such as `TQR-24891-001` resolves to
 * nothing, so it must never reach a printed label.
 */
const REAL_QR_IDENTIFIER = "TQR-a1b2c3d4-001";
const FABRICATED_QR_IDENTIFIER = "TQR-24891-001";

const plannedPallets: PlannedReceptionPallet[] = [
  {
    palletNumber: 1,
    lineIndex: 0,
    productId: "prod_coca_cola_235",
    productName: "Coca Cola regular 235ml",
    quantity: 40,
    unit: "cajas",
    qrIdentifier: REAL_QR_IDENTIFIER,
    status: "PLANNED",
  },
];

const currentReception: ReceptionData = {
  hasOC: true,
  ocFolio: "OC-24891",
  tarimas: 1,
  proveedor: "SMART & FINAL",
  proveedorLogistico: "LOGÍSTICA VELOZ",
  fechaRecepcion: "19 Sep 2026 · 09:42",
  lote: "LT-0926-A",
  caducidad: "15 Mar 2027",
  codigosQR: [REAL_QR_IDENTIFIER],
  plannedPallets,
  productos: [
    {
      productId: "prod_coca_cola_235",
      codigo: null,
      nombre: "Coca Cola regular 235ml",
      unidad: "cajas",
      cantidad: 40,
      precio: 0,
      importe: 0,
      estadoMatch: "confirmado",
    },
  ],
  conversionesTabla: [
    {
      producto: "Coca Cola regular 235ml",
      productId: "prod_coca_cola_235",
      codigo: "CB235",
      unidades: 960,
      unidad: "piezas",
      piezasPorCaja: 24,
      cajasPorTarima: 40,
      cajas: 40,
      tarimas: 1,
      stickers: 4,
    },
  ],
};

describe("ImpresionEtiquetas", () => {
  it("prints the backend QR identifier of the planned pallet", () => {
    renderWithAppProviders(<ImpresionEtiquetas />, { currentReception });

    expect(screen.getAllByText(REAL_QR_IDENTIFIER).length).toBeGreaterThan(0);
  });

  it("never prints a folio-derived QR identifier", () => {
    const { container } = renderWithAppProviders(<ImpresionEtiquetas />, { currentReception });

    expect(container.textContent).not.toContain(FABRICATED_QR_IDENTIFIER);
  });

  it("prints the product name and the supplier of the reception", () => {
    renderWithAppProviders(<ImpresionEtiquetas />, { currentReception });

    expect(screen.getAllByText("Coca Cola regular 235ml").length).toBeGreaterThan(0);
    expect(screen.getAllByText("SMART & FINAL").length).toBeGreaterThan(0);
  });
});
