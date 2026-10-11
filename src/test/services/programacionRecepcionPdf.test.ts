import { describe, expect, it } from "vitest"
import { buildWhatsAppMessage } from "@/services/programacionRecepcionPdf"

describe("programacionRecepcionPdf", () => {
  it("includes the selected logistics supplier in the generated summary", () => {
    const message = buildWhatsAppMessage({
      folio: "REC-2026-0001",
      fechaRecepcion: "09/10/2026",
      proveedor: "Proveedor Norte",
      proveedorLogistico: "LOGÍSTICA VELOZ",
      totalTarimas: 1,
      productos: [
        {
          nombre: "Producto demo",
          cantidad: 10,
          tarimas: 1,
          conversionMatch: true,
        },
      ],
    })

    expect(message).toContain("🚚 Proveedor Logístico: LOGÍSTICA VELOZ")
  })
})
