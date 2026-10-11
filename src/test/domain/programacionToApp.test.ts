/**
 * Tests for programacionToApp mapper
 */

import { describe, it, expect } from "vitest"
import {
  programacionToAppReception,
  appReceptionToProgramacion,
} from "@/services/domain/programacionToApp"
import type {
  ProgramacionRecepcionOutput,
  AppReceptionState,
} from "@/types/domain"

describe("programacionToApp - ProgramacionRecepcion → AppReceptionState mapper", () => {
  const mockProgramacionOutput = {
    hasOC: true,
    ocFolio: "OC-2024-001",
    tarimas: "10",
    proveedor: "Proveedor Test",
    proveedorLogistico: "Logistica Test",
    receptionId: "rec-123",
    productos: [
      {
        productId: "prod-1",
        codigo: "AZU001",
        nombre: "AZUCAR",
        unidad: "CAJA",
        cantidad: 50,
        cajasPorTarima: 50,
        tarimas: 1,
      },
      {
        productId: "prod-2",
        codigo: "CAF002",
        nombre: "CAFE",
        unidad: "CAJA",
        cantidad: 12,
        cajasPorTarima: 12,
        tarimas: 1,
      },
    ],
    conversionesTabla: [
      {
        producto: "AZUCAR",
        codigo: "AZU001",
        unidades: 50,
        cajas: 50,
        cajasPorTarima: 50,
        tarimas: 1,
        stickers: 4,
        conversionMatch: true,
      },
      {
        producto: "CAFE",
        codigo: "CAF002",
        unidades: 12,
        cajas: 12,
        cajasPorTarima: 12,
        tarimas: 1,
        stickers: 4,
        conversionMatch: true,
      },
    ],
  }

  it("converts ProgramacionRecepcionOutput to AppReceptionState correctly", () => {
    const result = programacionToAppReception(mockProgramacionOutput)

    expect(result).toEqual({
      folio: "OC-2024-001",
      fecha: expect.any(String), // today's date
      proveedor: "Proveedor Test",
      proveedorLogistico: "Logistica Test",
      total: null,
      lineas: [
        {
          productId: "prod-1",
          codigo: "AZU001",
          nombre: "AZUCAR",
          unidad: "CAJA",
          cantidad: 50,
          precio: 0,
          importe: 0,
          estadoMatch: "confirmado",
        },
        {
          productId: "prod-2",
          codigo: "CAF002",
          nombre: "CAFE",
          unidad: "CAJA",
          cantidad: 12,
          precio: 0,
          importe: 0,
          estadoMatch: "confirmado",
        },
      ],
      warehouseId: null,
      supplierId: null,
      tarimasTotal: 2,
      conversiones: mockProgramacionOutput.conversionesTabla,
    })
  })

  it("handles empty productos array", () => {
    const emptyOutput = {
      ...mockProgramacionOutput,
      productos: [],
      conversionesTabla: [],
    }
    const result = programacionToAppReception(emptyOutput)

    expect(result.lineas).toHaveLength(0)
    expect(result.tarimasTotal).toBe(0)
    expect(result.conversiones).toHaveLength(0)
  })

  it("converts AppReceptionState back to ProgramacionRecepcionOutput", () => {
    const appState = {
      folio: "OC-2024-001",
      fecha: "2024-01-15",
      proveedor: "Proveedor Test",
      proveedorLogistico: "Logistica Test",
      total: "1000.00",
      lineas: [
        {
          productId: "prod-1",
          codigo: "AZU001",
          nombre: "AZUCAR",
          unidad: "CAJA",
          cantidad: 50,
          precio: 120,
          importe: 6000,
          estadoMatch: "confirmado" as const,
        },
        {
          productId: "prod-2",
          codigo: "CAF002",
          nombre: "CAFE",
          unidad: "CAJA",
          cantidad: 12,
          precio: 450,
          importe: 5400,
          estadoMatch: "confirmado" as const,
        },
      ],
      warehouseId: "wh-1",
      supplierId: "sup-1",
      tarimasTotal: 2,
      conversiones: [
        {
          producto: "AZUCAR",
          codigo: "AZU001",
          unidades: 50,
          cajas: 50,
          cajasPorTarima: 50,
          tarimas: 1,
          stickers: 4,
          conversionMatch: true,
        },
        {
          producto: "CAFE",
          codigo: "CAF002",
          unidades: 12,
          cajas: 12,
          cajasPorTarima: 12,
          tarimas: 1,
          stickers: 4,
          conversionMatch: true,
        },
      ],
    }

    const result = appReceptionToProgramacion(appState)

    expect(result).toEqual({
      hasOC: true,
      ocFolio: "OC-2024-001",
      tarimas: "2",
      proveedor: "Proveedor Test",
      proveedorLogistico: "Logistica Test",
      receptionId: undefined,
      productos: [
        {
          productId: "prod-1",
          codigo: "AZU001",
          nombre: "AZUCAR",
          unidad: "CAJA",
          cantidad: 50,
          cajasPorTarima: 0,
          tarimas: 0,
        },
        {
          productId: "prod-2",
          codigo: "CAF002",
          nombre: "CAFE",
          unidad: "CAJA",
          cantidad: 12,
          cajasPorTarima: 0,
          tarimas: 0,
        },
      ],
      conversionesTabla: appState.conversiones,
    })
  })
})
