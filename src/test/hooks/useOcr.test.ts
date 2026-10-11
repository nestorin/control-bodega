/**
 * Tests for useOcr hook
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useOcr } from "@/hooks/useOcr"
import { normalizeOcrResponse } from "@/services/domain/ocrMapper"
import { RawOcrResponseDto } from "@/services/paddleOcr"
import { getApp } from "firebase/app"
import { getFunctions, httpsCallable } from "firebase/functions"

// Mock de Firebase Functions
vi.mock("firebase/functions", () => ({
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(),
}))

// Mock de Firebase App
vi.mock("firebase/app", () => ({
  getApp: vi.fn(),
}))

// Mock del servicio de OCR
vi.mock("@/services/domain/ocrMapper", () => ({
  normalizeOcrResponse: vi.fn(),
}))

describe("useOcr hook", () => {
  const mockFunctions = {
    extract_ocr_secure: vi.fn(),
  }

  const mockApp = {
    name: "test-app",
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock de Firebase
    vi.mocked(getApp).mockReturnValue(mockApp as never)
    vi.mocked(getFunctions).mockReturnValue(mockFunctions as never)
    vi.mocked(httpsCallable).mockImplementation(
      () => mockFunctions.extract_ocr_secure as never,
    )

    // Mock de normalizeOcrResponse
    vi.mocked(normalizeOcrResponse).mockReturnValue({
      success: true,
      parsed: {
        folio: "OC-2024-001",
        fecha: "2024-01-15",
        proveedor: "Proveedor S.A. de C.V.",
        productos: [
          {
            linea: 1,
            codigo: "AZU001",
            nombre: "AZUCAR",
            unidad: "cajas",
            cantidad: 50,
            precio: 120,
            importe: 6000,
            confianza: 0.95,
          },
        ],
      },
      ocr: {
        blocks: [],
        full_text: "OCR TEXT",
      },
    } as RawOcrResponseDto)
  })

  it("should initialize with correct default state", () => {
    const { result } = renderHook(() => useOcr())

    expect(result.current.loading).toBe(false)
    expect(result.current.result).toBeNull()
    expect(result.current.error).toBeNull()
    expect(typeof result.current.clear).toBe("function")
    expect(typeof result.current.runOcr).toBe("function")
  })

  it("should run OCR successfully", async () => {
    const mockFile = new File([""], "test.pdf", { type: "application/pdf" })
    const { result } = renderHook(() => useOcr())

    // Mock de la función callable
    mockFunctions.extract_ocr_secure.mockResolvedValue({
      data: {
        success: true,
        parsed: {
          folio: "OC-2024-001",
          fecha: "2024-01-15",
          proveedor: "Proveedor S.A. de C.V.",
          productos: [
            {
              linea: 1,
              codigo: "AZU001",
              nombre: "AZUCAR",
              unidad: "cajas",
              cantidad: 50,
              precio: 120,
              importe: 6000,
              confianza: 0.95,
            },
          ],
        },
        ocr: {
          blocks: [],
          full_text: "OCR TEXT",
        },
      },
    })

    let resultData: RawOcrResponseDto | null = null

    await act(async () => {
      resultData = await result.current.runOcr(mockFile, "cfdi")
    })

    expect(resultData).toEqual({
      success: true,
      parsed: {
        folio: "OC-2024-001",
        fecha: "2024-01-15",
        proveedor: "Proveedor S.A. de C.V.",
        productos: [
          {
            linea: 1,
            codigo: "AZU001",
            nombre: "AZUCAR",
            unidad: "cajas",
            cantidad: 50,
            precio: 120,
            importe: 6000,
            confianza: 0.95,
          },
        ],
      },
      ocr: {
        blocks: [],
        full_text: "OCR TEXT",
      },
    })
  })

  it("should handle OCR error gracefully", async () => {
    const mockFile = new File([""], "test.pdf", { type: "application/pdf" })
    const { result } = renderHook(() => useOcr())

    // Mock de error en la función callable
    mockFunctions.extract_ocr_secure.mockRejectedValue(new Error("OCR Error"))

    await expect(
      act(async () => {
        await result.current.runOcr(mockFile, "cfdi")
      }),
    ).rejects.toThrow("OCR Error")
  })

  it("should clear state correctly", () => {
    const { result } = renderHook(() => useOcr())

    // Set some state first by running OCR
    mockFunctions.extract_ocr_secure.mockResolvedValue({
      data: {
        success: true,
        parsed: {
          folio: "OC-2024-001",
          fecha: "2024-01-15",
          proveedor: "Proveedor S.A. de C.V.",
          productos: [
            {
              linea: 1,
              codigo: "AZU001",
              nombre: "AZUCAR",
              unidad: "cajas",
              cantidad: 50,
              precio: 120,
              importe: 6000,
              confianza: 0.95,
            },
          ],
        },
        ocr: {
          blocks: [],
          full_text: "OCR TEXT",
        },
      },
    })

    act(() => {
      result.current.clear()
    })

    expect(result.current.result).toBeNull()
    expect(result.current.error).toBeNull()
  })
})
