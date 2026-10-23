import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
import { useAuth } from "@/context/AuthContext";
import Unauthorized from "./Unauthorized";

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("react-router-dom", async () => await vi.importActual("react-router-dom"));

const user = { uid: "uid-abc-123" } as User;

function authState(overrides: Record<string, unknown> = {}) {
  return {
    user,
    profile: null,
    loading: false,
    accessStatus: "INACTIVE",
    authError: null,
    login: vi.fn(),
    register: vi.fn(),
    loginWithGoogle: vi.fn(),
    logout: vi.fn(),
    hasRole: vi.fn(() => false),
    canAccessWarehouse: vi.fn(() => false),
    ...overrides,
  } as ReturnType<typeof useAuth>;
}

function renderPage(state: Record<string, unknown> | undefined) {
  render(
    <MemoryRouter initialEntries={["/start"]}>
      <Routes>
        <Route path="/start" element={<Navigate to="/unauthorized" replace state={state} />} />
        <Route path="/unauthorized" element={<Unauthorized />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Unauthorized", () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue(authState());
    writeText.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  });

  it("does not offer an access reference for inactive memberships", () => {
    vi.mocked(useAuth).mockReturnValue(authState({ accessStatus: "INACTIVE" }));

    renderPage({ reason: "INACTIVE" });

    expect(screen.getByText(/Tu cuenta está inactiva/)).toBeInTheDocument();
    expect(screen.queryByTestId("access-ref")).not.toBeInTheDocument();
  });

  it("copies the access reference to the clipboard", async () => {
    vi.mocked(useAuth).mockReturnValue(
      authState({ accessStatus: "ERROR", authError: new Error("boom") }),
    );

    renderPage({ reason: "ERROR" });

    await userEvent.click(screen.getByRole("button", { name: "Copiar referencia" }));

    expect(writeText).toHaveBeenCalledWith("organizations/org_exepa_001/users/uid-abc-123");
    expect(await screen.findByRole("button", { name: "Copiado ✓" })).toBeInTheDocument();
  });

  it("surfaces the technical error for ERROR redirects", () => {
    vi.mocked(useAuth).mockReturnValue(
      authState({
        accessStatus: "ERROR",
        authError: new Error("Missing or insufficient permissions."),
      }),
    );

    renderPage({ reason: "ERROR" });

    expect(screen.getByTestId("auth-error-detail")).toHaveTextContent(
      "Missing or insufficient permissions.",
    );
    expect(screen.getByTestId("access-ref")).toHaveTextContent("uid-abc-123");
  });

  it("explains role denials separately from membership status", () => {
    vi.mocked(useAuth).mockReturnValue(authState({ accessStatus: "ACTIVE" }));

    renderPage({ reason: "role" });

    expect(screen.getByText(/Tu rol no tiene permiso/)).toBeInTheDocument();
    expect(screen.queryByTestId("access-ref")).not.toBeInTheDocument();
  });

  it("explains warehouse denials separately from membership status", () => {
    vi.mocked(useAuth).mockReturnValue(authState({ accessStatus: "ACTIVE" }));

    renderPage({ reason: "warehouse" });

    expect(screen.getByText(/Tu almacén asignado no incluye/)).toBeInTheDocument();
  });

  it("falls back to the generic message without a reason", () => {
    vi.mocked(useAuth).mockReturnValue(authState({ accessStatus: "ACTIVE" }));

    renderPage(undefined);

    expect(screen.getByText(/No tienes permisos para acceder a esta sección/)).toBeInTheDocument();
  });
});
