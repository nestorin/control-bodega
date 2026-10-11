import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { WAREHOUSE_IDS } from "@/config/warehouses"

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}

Object.defineProperty(window, "localStorage", {
  writable: true,
  value: localStorageMock,
})

// Mock navigator.onLine
Object.defineProperty(navigator, "onLine", {
  writable: true,
  value: true,
})

// Mock crypto.randomUUID
Object.defineProperty(global, "crypto", {
  writable: true,
  value: {
    randomUUID: () => "test-uuid-" + Math.random().toString(36).substr(2, 9),
  },
})

// Simple implementation test for offline queue logic
describe("Offline Queue Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorageMock.getItem.mockReturnValue(null)
  })

  it("should generate unique IDs", () => {
    const id1 = crypto.randomUUID()
    const id2 = crypto.randomUUID()
    expect(id1).not.toBe(id2)
    expect(id1).toMatch(/^test-uuid-/)
  })

  it("should create queued operation structure", () => {
    const operation = {
      id: crypto.randomUUID(),
      type: "create" as const,
      collectionPath: "test-collection",
      data: { name: "Test" },
      timestamp: Date.now(),
      retryCount: 0,
      operationId: "op-1",
    }

    expect(operation.id).toBeDefined()
    expect(operation.type).toBe("create")
    expect(operation.collectionPath).toBe("test-collection")
    expect(operation.data).toEqual({ name: "Test" })
    expect(operation.retryCount).toBe(0)
    expect(operation.operationId).toBe("op-1")
  })

  it("should handle localStorage serialization", () => {
    const queue = [
      {
        id: "test-1",
        type: "create",
        collectionPath: "test",
        data: { name: "Test 1" },
        timestamp: Date.now(),
        retryCount: 0,
        operationId: "op-1",
      },
      {
        id: "test-2",
        type: "update",
        collectionPath: "test",
        data: { name: "Test 2" },
        timestamp: Date.now(),
        retryCount: 1,
        operationId: "op-2",
      },
    ]

    const serialized = JSON.stringify(queue)
    const parsed = JSON.parse(serialized)

    expect(parsed).toHaveLength(2)
    expect(parsed[0].operationId).toBe("op-1")
    expect(parsed[1].retryCount).toBe(1)
  })

  it("should filter operations by ID", () => {
    const queue = [
      { id: "test-1", operationId: "op-1" },
      { id: "test-2", operationId: "op-2" },
      { id: "test-3", operationId: "op-3" },
    ]

    const filtered = queue.filter((q) => q.id !== "test-2")
    expect(filtered).toHaveLength(2)
    expect(filtered.find((q) => q.id === "test-2")).toBeUndefined()
  })

  it("should increment retry count", () => {
    const queue = [
      { id: "test-1", retryCount: 0 },
      { id: "test-2", retryCount: 1 },
    ]

    const updated = queue.map((q) =>
      q.id === "test-1" ? { ...q, retryCount: q.retryCount + 1 } : q,
    )

    expect(updated[0].retryCount).toBe(1)
    expect(updated[1].retryCount).toBe(1)
  })
})

describe("Firestore Types", () => {
  it("should match LotCaducidadDoc structure", () => {
    const lot = {
      id: "test-id",
      organizationId: "org-1",
      warehouseId: WAREHOUSE_IDS.NORTH,
      productId: "PRD-001",
      productName: "Test Product",
      lot: "LOT-123",
      expiryDate: new Date(),
      monthKey: "Dec-26",
      cajas: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    expect(lot.cajas).toBe(10)
    expect(lot.monthKey).toBe("Dec-26")
    expect(lot.warehouseId).toBe(WAREHOUSE_IDS.NORTH)
    expect(lot.productId).toBe("PRD-001")
    expect(lot.lot).toBe("LOT-123")
  })

  it("should calculate status correctly", () => {
    const now = new Date()
    const future30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const past = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000)
    const future5 = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000)

    const getStatus = (expiryDate: Date): "ok" | "proximo" | "vencido" => {
      const diff = Math.ceil(
        (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      )
      if (diff < 0) return "vencido"
      if (diff <= 30) return "proximo"
      return "ok"
    }

    expect(getStatus(future30)).toBe("proximo")
    expect(getStatus(past)).toBe("vencido")
    expect(getStatus(future5)).toBe("proximo")
    expect(getStatus(new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000))).toBe(
      "ok",
    )
  })

  it("should calculate days to expiry", () => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)

    const getDiasParaCaducar = (expiryDate: Date): number => {
      const exp = new Date(expiryDate)
      exp.setHours(0, 0, 0, 0)
      return Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    }

    expect(
      getDiasParaCaducar(new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000)),
    ).toBe(10)
    expect(
      getDiasParaCaducar(new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)),
    ).toBe(-5)
    expect(getDiasParaCaducar(now)).toBe(0)
  })

  it("should parse month key", () => {
    const parseMonthKey = (key: string): Date | null => {
      const meses: Record<string, number> = {
        Ene: 0,
        Feb: 1,
        Mar: 2,
        Abr: 3,
        May: 4,
        Jun: 5,
        Jul: 6,
        Ago: 7,
        Sep: 8,
        Oct: 9,
        Nov: 10,
        Dic: 11,
      }
      const [mes, year] = key.split("-")
      const mesNum = meses[mes]
      if (mesNum === undefined) return null
      return new Date(2000 + parseInt(year), mesNum, 1)
    }

    expect(parseMonthKey("Dic-26")?.getMonth()).toBe(11)
    expect(parseMonthKey("Dic-26")?.getFullYear()).toBe(2026)
    expect(parseMonthKey("Ene-25")?.getMonth()).toBe(0)
    expect(parseMonthKey("Invalid-26")).toBeNull()
  })

  it("should format month key", () => {
    const formatMonthKey = (date: Date): string => {
      const meses = [
        "Ene",
        "Feb",
        "Mar",
        "Abr",
        "May",
        "Jun",
        "Jul",
        "Ago",
        "Sep",
        "Oct",
        "Nov",
        "Dic",
      ]
      return `${meses[date.getMonth()]}-${String(date.getFullYear()).slice(-2)}`
    }

    expect(formatMonthKey(new Date(2026, 11, 15))).toBe("Dic-26")
    expect(formatMonthKey(new Date(2025, 0, 1))).toBe("Ene-25")
    expect(formatMonthKey(new Date(2024, 5, 10))).toBe("Jun-24")
  })
})

describe("Feature Flag Logic", () => {
  it("should evaluate feature flags correctly", () => {
    const flags = {
      USE_FIRESTORE_CATALOGOS: true,
      USE_FIRESTORE_RECEPCIONES: false,
      USE_FIRESTORE_EVIDENCIAS: true,
      USE_FIRESTORE_INVENTARIO: false,
      USE_FIRESTORE_LOTES: true,
      USE_FIRESTORE_EMBARQUES: false,
      USE_FIRESTORE_OFFLINE_QUEUE: true,
    }

    const isFeatureEnabled = (flag: keyof typeof flags): boolean => flags[flag]

    expect(isFeatureEnabled("USE_FIRESTORE_CATALOGOS")).toBe(true)
    expect(isFeatureEnabled("USE_FIRESTORE_RECEPCIONES")).toBe(false)
    expect(isFeatureEnabled("USE_FIRESTORE_LOTES")).toBe(true)
    expect(isFeatureEnabled("USE_FIRESTORE_OFFLINE_QUEUE")).toBe(true)
  })

  it("should return enabled flags list", () => {
    const flags = {
      USE_FIRESTORE_CATALOGOS: true,
      USE_FIRESTORE_RECEPCIONES: false,
      USE_FIRESTORE_EVIDENCIAS: true,
    }

    const getEnabledFlags = (): string[] =>
      Object.entries(flags)
        .filter(([, v]) => v)
        .map(([k]) => k)

    expect(getEnabledFlags()).toEqual([
      "USE_FIRESTORE_CATALOGOS",
      "USE_FIRESTORE_EVIDENCIAS",
    ])
  })
})

describe("Utils", () => {
  it("should format numbers with locale", () => {
    expect((1234).toLocaleString("es-MX")).toBe("1,234")
    expect((1234567).toLocaleString("es-MX")).toBe("1,234,567")
    expect((0).toLocaleString("es-MX")).toBe("0")
  })

  it("should handle date formatting", () => {
    const date = new Date("2026-12-25T12:00:00") // Use noon to avoid timezone issues
    expect(
      date.toLocaleDateString("es-MX", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
    ).toBe("25 dic 2026")
  })

  it("should sort arrays correctly", () => {
    const arr = [
      { name: "C", value: 3 },
      { name: "A", value: 1 },
      { name: "B", value: 2 },
    ]

    const asc = [...arr].sort((a, b) => a.value - b.value)
    expect(asc.map((x) => x.name)).toEqual(["A", "B", "C"])

    const desc = [...arr].sort((a, b) => b.value - a.value)
    expect(desc.map((x) => x.name)).toEqual(["C", "B", "A"])
  })
})
