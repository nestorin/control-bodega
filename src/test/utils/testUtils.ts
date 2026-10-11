/**
 * Test Utilities - Helpers for consistent testing across the project
 */

import { vi } from "vitest"
import type { User } from "firebase/auth"
import { createElement, type ReactElement } from "react"
import type { Firestore } from "firebase/firestore"
import { WAREHOUSE_IDS } from "@/config/warehouses"
import { AuthProvider, useAuth } from "@/context/AuthContext"
import type { Producto, Proveedor } from "@/screens/Configuracion"
import type { OcrProduct } from "@/types/domain"

/**
 * Creates a mock Firebase User
 */
export function createMockUser(overrides: Partial<User> = {}): User {
  return {
    uid: "test-user-1",
    email: "test@example.com",
    emailVerified: true,
    isAnonymous: false,
    metadata: {
      creationTime: "2024-01-01T00:00:00.000Z",
      lastSignInTime: "2024-01-01T00:00:00.000Z",
    },
    providerData: [],
    refreshToken: "mock-refresh-token",
    tenantId: null,
    delete: vi.fn(),
    getIdToken: vi.fn().mockResolvedValue("mock-id-token"),
    getIdTokenResult: vi.fn().mockResolvedValue({ token: "mock-id-token" }),
    reload: vi.fn(),
    toJSON: vi.fn(),
    ...overrides,
  } as User
}

/**
 * Creates a mock active UserProfile
 */
export function createMockProfile(
  overrides: Partial<import("@/context/AuthContext").UserProfile> = {},
) {
  return {
    userId: "test-user-1",
    organizationId: "org_exepa_001",
    role: "OPERATOR",
    warehouseId: WAREHOUSE_IDS.NORTH,
    status: "ACTIVE",
    ...overrides,
  }
}

/**
 * Creates a mock auth state for useAuth hook
 */
export function createMockAuthState(overrides: Record<string, unknown> = {}) {
  const profile = createMockProfile()
  const user = createMockUser()

  return {
    user,
    profile,
    loading: false,
    accessStatus: "ACTIVE",
    authError: null,
    login: vi.fn(),
    register: vi.fn(),
    loginWithGoogle: vi.fn(),
    logout: vi.fn(),
    hasRole: vi.fn((roles: string[]) => roles.includes(profile.role)),
    canAccessWarehouse: vi.fn(
      (warehouseId: string) => warehouseId === profile.warehouseId,
    ),
    ...overrides,
  }
}

/**
 * Creates mock Firestore for testing
 */
export function createMockFirestore() {
  return {
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    get: vi
      .fn()
      .mockResolvedValue({ exists: true, data: () => ({}), id: "doc-1" }),
    getDocs: vi.fn().mockResolvedValue({ docs: [], empty: true, size: 0 }),
    add: vi.fn().mockResolvedValue({ id: "new-doc-1" }),
    set: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    startAfter: vi.fn().mockReturnThis(),
    onSnapshot: vi.fn(),
  } as unknown as Firestore
}

/**
 * Creates mock Producto for testing
 */
export function createMockProducto(
  overrides: Partial<Producto> = {},
): Producto {
  return {
    id: "prod-1",
    nombre: "Producto Test",
    sku: "SKU-TEST",
    unidad: "cajas",
    codigosProveedor: ["COD-1", "COD-2"],
    tipo: "materia_prima",
    status: "ACTIVE",
    ...overrides,
  }
}

/**
 * Creates mock Proveedor for testing
 */
export function createMockProveedor(
  overrides: Partial<Proveedor> = {},
): Proveedor {
  return {
    id: "prov-1",
    nombre: "Proveedor Test",
    codigo: "PROV-001",
    tipo: "mercancia",
    rfc: "TEST123456",
    direccion: "Calle Test 123",
    telefono: "555-1234",
    email: "test@proveedor.com",
    contacto: "Juan Test",
    status: "ACTIVE",
    ...overrides,
  }
}

/**
 * Creates mock OcrProduct for testing
 */
export function createMockOcrProduct(
  overrides: Partial<OcrProduct> = {},
): OcrProduct {
  return {
    linea: 1,
    codigo: "ABC-123",
    nombre: "Producto OCR",
    unidad: "cajas",
    cantidad: 10,
    precio: 100,
    importe: 1000,
    confianza: 0.95,
    ...overrides,
  }
}

/**
 * Creates mock catalog for testing
 */
export function createMockCatalog(
  productos: Producto[] = [createMockProducto()],
  proveedores: Proveedor[] = [createMockProveedor()],
) {
  return { productos, proveedores }
}

/**
 * Creates mock OCR response
 */
export function createMockOcrResponse(
  overrides: Partial<{
    success: boolean
    parsed: {
      folio: string | null
      fecha: string | null
      proveedor: string | null
      total: string | null
      productos: OcrProduct[]
    }
  }> = {},
) {
  return {
    success: true,
    ocr: {
      blocks: [],
      full_text: "OCR text",
    },
    parsed: {
      folio: "OC-2024-001",
      fecha: "2024-01-15",
      proveedor: "Proveedor Test",
      total: "1000.00",
      productos: [
        createMockOcrProduct({ linea: 1, nombre: "Producto 1", cantidad: 10 }),
        createMockOcrProduct({ linea: 2, nombre: "Producto 2", cantidad: 5 }),
      ],
    },
    tipo: "oc",
    ...overrides,
  }
}

/**
 * Render utilities for component testing
 */
import {
  render,
  type RenderOptions,
  type RenderResult,
} from "@testing-library/react"
import { MemoryRouter, Routes, Route } from "react-router-dom"

interface RenderWithProvidersOptions extends Omit<RenderOptions, "wrapper"> {
  authState?: ReturnType<typeof createMockAuthState>
  routes?: ReactElement[]
}

export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {},
): RenderResult {
  const { authState, routes = [], ...renderOptions } = options

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(
      AuthProvider,
      null,
      createElement(
        MemoryRouter,
        { initialEntries: ["/"] },
        createElement(
          Routes,
          null,
          ...routes.map((route, i) =>
            createElement(Route, { key: i, ...route.props }),
          ),
          createElement(Route, { path: "/*", element: children }),
        ),
      ),
    )

  if (authState) {
    vi.mocked(useAuth).mockReturnValue(authState)
  }

  return render(ui, { wrapper, ...renderOptions })
}

/**
 * Wait for async operations to complete
 */
export async function waitForAsync() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await vi.runAllTimersAsync()
}

/**
 * Mock timers for async operations
 */
export function setupFakeTimers() {
  vi.useFakeTimers()
  return () => vi.useRealTimers()
}

/**
 * Creates a complete test scenario for reception programming
 */
export function createReceptionTestScenario() {
  const catalog = {
    productos: [
      {
        id: "prod-1",
        nombre: "AZUCAR",
        codigosProveedor: ["AZU001"],
        unidad: "CAJA",
        tipo: "materia_prima",
        status: "ACTIVE",
      },
      {
        id: "prod-2",
        nombre: "CAFE",
        codigosProveedor: ["CAF002"],
        unidad: "CAJA",
        tipo: "materia_prima",
        status: "ACTIVE",
      },
      {
        id: "prod-3",
        nombre: "CHILE",
        codigosProveedor: ["CHI003"],
        unidad: "PIEZA",
        tipo: "materia_prima",
        status: "ACTIVE",
      },
    ],
    proveedores: [
      {
        id: "prov-1",
        nombre: "Proveedor Norte",
        codigo: "PROV-1",
        tipo: "mercancia",
        rfc: "RFC1",
        direccion: "",
        telefono: "",
        email: "",
        contacto: "",
        status: "ACTIVE",
      },
      {
        id: "prov-2",
        nombre: "Logistica Express",
        codigo: "LOG-1",
        tipo: "logistica",
        rfc: "RFC2",
        direccion: "",
        telefono: "",
        email: "",
        contacto: "",
        status: "ACTIVE",
      },
    ],
  }

  const ocrProducts = [
    {
      linea: 1,
      codigo: "AZU001",
      nombre: "AZUCAR",
      unidad: "CAJA",
      cantidad: 50,
      precio: 120,
      importe: 6000,
      confianza: 0.95,
    },
    {
      linea: 2,
      codigo: "CAF002",
      nombre: "CAFE",
      unidad: "CAJA",
      cantidad: 12,
      precio: 450,
      importe: 5400,
      confianza: 0.92,
    },
    {
      linea: 3,
      codigo: "CHI003",
      nombre: "CHILE",
      unidad: "PIEZA",
      cantidad: 100,
      precio: 25,
      importe: 2500,
      confianza: 0.88,
    },
  ]

  return { catalog, ocrProducts }
}
