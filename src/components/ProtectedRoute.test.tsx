import { render, screen } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ComponentProps } from "react"
import type { User } from "firebase/auth"
import { WAREHOUSE_IDS } from "@/config/warehouses"
import { ProtectedRoute } from "./ProtectedRoute"
import { useAuth, type UserProfile } from "@/context/AuthContext"

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(),
}))

const activeProfile: UserProfile = {
  userId: "user-1",
  organizationId: "org_exepa_001",
  role: "OPERATOR",
  warehouseId: WAREHOUSE_IDS.NORTH,
  status: "ACTIVE",
}

function authState(overrides: Record<string, unknown> = {}) {
  return {
    user: { uid: "user-1" } as User,
    profile: activeProfile,
    loading: false,
    accessStatus: "ACTIVE",
    authError: null,
    login: vi.fn(),
    register: vi.fn(),
    loginWithGoogle: vi.fn(),
    logout: vi.fn(),
    hasRole: vi.fn((roles: string[]) => roles.includes(activeProfile.role)),
    canAccessWarehouse: vi.fn(
      (warehouseId: string) => warehouseId === activeProfile.warehouseId,
    ),
    ...overrides,
  } as ReturnType<typeof useAuth>
}

function renderRoute(
  props: Partial<ComponentProps<typeof ProtectedRoute>> = {},
) {
  render(
    <MemoryRouter initialEntries={["/recepciones"]}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/unauthorized" element={<div>Unauthorized page</div>} />
        <Route
          path="/recepciones"
          element={
            <ProtectedRoute {...props}>
              <div>Protected content</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue(authState())
  })

  it("shows a loading state while authentication is resolving", () => {
    vi.mocked(useAuth).mockReturnValue(authState({ loading: true }))

    renderRoute()

    expect(screen.getByRole("status")).toHaveTextContent("Verificando acceso")
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument()
  })

  it("redirects unauthenticated users to login", () => {
    vi.mocked(useAuth).mockReturnValue(
      authState({ user: null, profile: null, accessStatus: "UNAUTHENTICATED" }),
    )

    renderRoute()

    expect(screen.getByText("Login page")).toBeInTheDocument()
  })

  it.each(["PENDING", "INACTIVE"] as const)(
    "redirects %s memberships to unauthorized",
    (accessStatus) => {
      vi.mocked(useAuth).mockReturnValue(
        authState({
          profile: { ...activeProfile, status: accessStatus },
          accessStatus,
        }),
      )

      renderRoute()

      expect(screen.getByText("Unauthorized page")).toBeInTheDocument()
    },
  )

  it("renders protected content for an active authorized membership", () => {
    renderRoute({
      allowedRoles: ["OPERATOR"],
      requiredWarehouseId: WAREHOUSE_IDS.NORTH,
    })

    expect(screen.getByText("Protected content")).toBeInTheDocument()
  })

  it("redirects an active membership without the required role", () => {
    renderRoute({ allowedRoles: ["ADMIN"] })

    expect(screen.getByText("Unauthorized page")).toBeInTheDocument()
  })

  it("redirects an active membership without warehouse access", () => {
    renderRoute({ requiredWarehouseId: "warehouse-2" })

    expect(screen.getByText("Unauthorized page")).toBeInTheDocument()
  })
})
