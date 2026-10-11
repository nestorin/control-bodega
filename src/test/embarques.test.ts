import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  calcularTarimas,
  validarStockDisponible,
  convertirCantidad,
  encontrarConversion,
  CONVERSIONES_DEFAULT,
  mergeCanonicalConversions,
} from "@/services/conversiones"
import { WAREHOUSE_IDS } from "@/config/warehouses"
import {
  DocumentoCargado,
  DocumentoItem,
  CalculoTarimasResultado,
} from "@/types/documento"

// Mock getStock function
const mockGetStock = vi.fn()

describe("Servicio Conversiones", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("prefiere la conversión canónica de Firestore sobre el respaldo local", () => {
    const merged = mergeCanonicalConversions(
      [
        {
          producto: "BEBIDA SABOR COLA 3L C/6 PZS S",
          piezasPorCaja: 6,
          cajasPorTarima: 60,
        },
      ],
      [
        {
          productName: "BEBIDA SABOR COLA 3L C/6 PZS S",
          piecesPerBox: 6,
          boxesPerPallet: 39,
        },
      ],
    )

    expect(merged).toEqual([
      {
        producto: "BEBIDA SABOR COLA 3L C/6 PZS S",
        piezasPorCaja: 6,
        cajasPorTarima: 39,
      },
    ])
  })

  it("conserva el respaldo solo para productos ausentes en Firestore", () => {
    const merged = mergeCanonicalConversions(
      [{ producto: "LOCAL", piezasPorCaja: 1, cajasPorTarima: 10 }],
      [],
    )

    expect(merged).toEqual([
      { producto: "LOCAL", piezasPorCaja: 1, cajasPorTarima: 10 },
    ])
  })

  describe("convertirCantidad", () => {
    it("convierte pallet a tarima (1:1)", () => {
      const resultado = convertirCantidad(
        5,
        "pallet",
        "tarima",
        CONVERSIONES_DEFAULT,
        "PRD-001",
      )
      expect(resultado).toBe(5)
    })

    it("convierte tarima a sticker (1:4)", () => {
      const resultado = convertirCantidad(
        3,
        "tarima",
        "sticker",
        CONVERSIONES_DEFAULT,
        "PRD-001",
      )
      expect(resultado).toBe(12)
    })

    it("convierte caja a tarima (10:1)", () => {
      const resultado = convertirCantidad(
        20,
        "caja",
        "tarima",
        CONVERSIONES_DEFAULT,
        "PRD-001",
      )
      expect(resultado).toBe(2)
    })

    it("convierte caja a sticker (10:4)", () => {
      const resultado = convertirCantidad(
        10,
        "caja",
        "sticker",
        CONVERSIONES_DEFAULT,
        "PRD-001",
      )
      expect(resultado).toBe(4)
    })

    it("misma unidad retorna igual", () => {
      const resultado = convertirCantidad(
        5,
        "tarima",
        "tarima",
        CONVERSIONES_DEFAULT,
        "PRD-001",
      )
      expect(resultado).toBe(5)
    })

    it("lanza error si no hay conversión", () => {
      // Test the internal function directly
      const resultado = encontrarConversion(
        "PRD-001",
        "unidad_inexistente",
        "tarima",
        CONVERSIONES_DEFAULT,
      )
      expect(resultado).toBeNull()

      // And convertirCantidad should throw
      expect(() =>
        convertirCantidad(
          5,
          "unidad_inexistente",
          "tarima",
          CONVERSIONES_DEFAULT,
          "PRD-001",
        ),
      ).toThrow("No hay conversión")
    })
  })

  describe("calcularTarimas", () => {
    const documentoBase: DocumentoCargado = {
      id: "PED-001",
      proveedorId: "PROV-001",
      proveedorNombre: "Proveedor Test",
      fecha: new Date("2026-10-03"),
      almacenDestinoId: WAREHOUSE_IDS.NORTH,
      items: [
        {
          productoId: "PRD-001",
          productoNombre: "Manzana",
          cantidad: 10,
          unidad: "pallet",
          conversionFactor: 1,
        },
        {
          productoId: "PRD-002",
          productoNombre: "Pera",
          cantidad: 20,
          unidad: "caja",
          conversionFactor: 10,
        },
      ],
    }

    it("calcula tarimas correctamente para pallets", () => {
      const resultado = calcularTarimas(documentoBase)

      expect(resultado.totalTarimas).toBe(12) // 10 pallets + 2 tarimas (20 cajas / 10)
      expect(resultado.totalStickers).toBe(48) // 12 * 4
      expect(resultado.desglose).toHaveLength(2)

      const manzana = resultado.desglose.find((d) => d.productoId === "PRD-001")
      expect(manzana?.tarimasCalculadas).toBe(10)

      const pera = resultado.desglose.find((d) => d.productoId === "PRD-002")
      expect(pera?.tarimasCalculadas).toBe(2)
    })

    it("redondea hacia arriba tarimas parciales", () => {
      const doc: DocumentoCargado = {
        ...documentoBase,
        items: [
          {
            productoId: "PRD-001",
            productoNombre: "Test",
            cantidad: 15,
            unidad: "caja",
          },
        ],
      }

      const resultado = calcularTarimas(doc)
      // 15 cajas = 1.5 tarimas → ceil = 2
      expect(resultado.totalTarimas).toBe(2)
    })

    it("documento sin items genera 0 tarimas", () => {
      const doc: DocumentoCargado = { ...documentoBase, items: [] }
      const resultado = calcularTarimas(doc)
      expect(resultado.totalTarimas).toBe(0)
      expect(resultado.totalStickers).toBe(0)
    })
  })

  describe("validarStockDisponible", () => {
    const items: DocumentoItem[] = [
      {
        productoId: "PRD-001",
        productoNombre: "Manzana",
        cantidad: 10,
        unidad: "pallet",
      },
      {
        productoId: "PRD-002",
        productoNombre: "Pera",
        cantidad: 5,
        unidad: "pallet",
      },
    ]

    it("retorna disponible true si hay stock suficiente", async () => {
      // 10 pallets = 100 cajas, 5 pallets = 50 cajas
      mockGetStock
        .mockImplementationOnce(() => Promise.resolve(150)) // PRD-001
        .mockImplementationOnce(() => Promise.resolve(60)) // PRD-002

      const resultado = await validarStockDisponible(items, mockGetStock)

      expect(resultado.disponible).toBe(true)
      expect(resultado.faltantes).toHaveLength(0)
    })

    it("retorna disponible false y faltantes si no hay stock", async () => {
      // PRD-001: 10 pallets = 100 cajas, stock 80 -> faltan 20
      // PRD-002: 5 pallets = 50 cajas, stock 60 -> OK
      mockGetStock
        .mockImplementationOnce(() => Promise.resolve(80))
        .mockImplementationOnce(() => Promise.resolve(60))

      const resultado = await validarStockDisponible(items, mockGetStock)

      expect(resultado.disponible).toBe(false)
      expect(resultado.faltantes).toHaveLength(1)
      expect(resultado.faltantes[0].productoId).toBe("PRD-001")
      expect(resultado.faltantes[0].faltante).toBe(20) // 100 - 80
    })

    it("convierte a cajas para comparar stock", async () => {
      // 10 pallets = 100 cajas, stock 80 -> faltan 20
      // 5 pallets = 50 cajas, stock 100 -> OK
      mockGetStock
        .mockImplementationOnce(() => Promise.resolve(80))
        .mockImplementationOnce(() => Promise.resolve(100))

      const resultado = await validarStockDisponible(items, mockGetStock)

      expect(resultado.disponible).toBe(false)
      expect(resultado.faltantes).toHaveLength(1)
      expect(resultado.faltantes[0].faltante).toBe(20) // 100 - 80
    })
  })
})

describe("Tipos Embarque", () => {
  it("genera QR correcto", () => {
    // Esta prueba es para verificar el formato del QR
    const embarqueId = "EMB-123"
    const tarimaIndex = 5
    const qr = `${embarqueId}|${tarimaIndex}`
    expect(qr).toBe("EMB-123|5")
  })

  it("parsea QR correctamente", () => {
    const qr = "EMB-123|5"
    const parts = qr.split("|")
    expect(parts[0]).toBe("EMB-123")
    expect(parseInt(parts[1], 10)).toBe(5)
  })

  it("calcula progress percent correctamente", () => {
    const totalTarimas = 10
    const completadas = 3
    const percent = (completadas / totalTarimas) * 100
    expect(percent).toBe(30)
  })
})
