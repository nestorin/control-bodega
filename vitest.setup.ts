import "@testing-library/jest-dom"
import { beforeAll, afterAll, afterEach, vi } from "vitest"
import { setupServer } from "msw/node"
import { handlers } from "./src/test/msw/handlers"

// Export test utilities globally
export * from "./src/test/utils/testUtils"

// Mock Firebase
vi.mock("@/lib/firebase", () => ({
  db: null,
  auth: null,
  app: null,
  functions: null,
}))

// Mock feature flags
vi.mock("@/config/featureFlags", () => ({
  FEATURE_FLAGS: {
    USE_FIRESTORE_CATALOGOS: false,
    USE_FIRESTORE_RECEPCIONES: false,
    USE_FIRESTORE_EVIDENCIAS: false,
    USE_FIRESTORE_INVENTARIO: false,
    USE_FIRESTORE_LOTES: false,
    USE_FIRESTORE_EMBARQUES: false,
    USE_FIRESTORE_OFFLINE_QUEUE: false,
  },
  isFeatureEnabled: () => false,
  getEnabledFlags: () => [],
}))

// Mock React Router
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useLocation: () => ({ pathname: "/" }),
    useParams: () => ({}),
  }
})

// MSW Server
export const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterAll(() => server.close())
afterEach(() => server.resetHandlers())

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

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

// Suppress console.error in tests (optional)
const originalError = console.error
beforeAll(() => {
  console.error = (...args) => {
    if (args[0]?.includes?.("Warning: ReactDOM.render is no longer supported"))
      return
    originalError.call(console, ...args)
  }
})
afterAll(() => {
  console.error = originalError
})
