import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
import { getRedirectResult } from "firebase/auth";
import { useAuth, type UserProfile } from "@/context/AuthContext";
import Login from "./Login";

const navigate = vi.fn();

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("firebase/auth", async () => {
  const actual = await vi.importActual<typeof import("firebase/auth")>("firebase/auth");
  return { ...actual, getRedirectResult: vi.fn() };
});

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

const activeUser = { uid: "new-user" } as User;
const activeProfile: UserProfile = {
  userId: "new-user",
  organizationId: "org_exepa_001",
  role: "GERENTE_ALMACEN",
  warehouseId: null,
  warehouseIds: ["wh_tehuacan_1", "wh_tehuacan_2"],
  status: "ACTIVE",
};

describe("Login enrollment", () => {
  const login = vi.fn().mockResolvedValue(undefined);
  const register = vi.fn().mockResolvedValue(undefined);
  let authState: ReturnType<typeof useAuth>;

  function setAuthState(nextState: ReturnType<typeof useAuth>) {
    authState = nextState;
    vi.mocked(useAuth).mockReturnValue(nextState);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRedirectResult).mockResolvedValue(null);
    authState = {
      user: null,
      profile: null,
      loading: false,
      accessStatus: "UNAUTHENTICATED",
      authError: null,
      login,
      register,
      loginWithGoogle: vi.fn().mockResolvedValue(undefined),
      logout: vi.fn(),
      hasRole: vi.fn(() => false),
      canAccessWarehouse: vi.fn(() => false),
    };
    vi.mocked(useAuth).mockReturnValue(authState);
  });

  async function completeSignupForm(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Regístrate" }));
    await user.type(screen.getByLabelText("Nombre completo"), "Nueva Persona");
    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "secure-password");
    await user.type(screen.getByLabelText("Confirmar contraseña"), "secure-password");
  }

  it("waits for an active membership before routing after login", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Login />);

    await user.type(screen.getByLabelText("Email"), "user@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "secure-password");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(login).toHaveBeenCalledWith("user@example.com", "secure-password"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Procesando..." })).toBeDisabled(),
    );
    expect(navigate).not.toHaveBeenCalled();

    setAuthState({
      ...authState,
      user: activeUser,
      profile: activeProfile,
      accessStatus: "ACTIVE",
      loading: true,
    });
    rerender(<Login />);
    expect(navigate).not.toHaveBeenCalled();

    setAuthState({ ...authState, loading: false });
    rerender(<Login />);

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/", { replace: true }));
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("waits for server-provisioned manager access before routing after signup", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Login />);

    await completeSignupForm(user);
    await user.click(screen.getByRole("button", { name: "Registrarse" }));

    await waitFor(() =>
      expect(register).toHaveBeenCalledWith("new@example.com", "secure-password", "Nueva Persona"),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Procesando..." })).toBeDisabled(),
    );
    expect(navigate).not.toHaveBeenCalled();

    setAuthState({
      ...authState,
      user: activeUser,
      profile: activeProfile,
      accessStatus: "ACTIVE",
      loading: false,
    });
    rerender(<Login />);

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/", { replace: true }));
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("routes an active user home after returning from a Google redirect", async () => {
    setAuthState({
      ...authState,
      user: activeUser,
      profile: activeProfile,
      accessStatus: "ACTIVE",
    });

    render(<Login />);

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/", { replace: true }));
    expect(getRedirectResult).toHaveBeenCalledOnce();
  });

  it("shows a redirect error without exposing the raw Firebase message", async () => {
    vi.mocked(getRedirectResult).mockRejectedValue({
      code: "auth/unauthorized-domain",
      message: "private Firebase diagnostic",
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<Login />);

    expect(await screen.findByText(/Este dominio no está autorizado/)).toBeInTheDocument();
    expect(screen.queryByText("private Firebase diagnostic")).not.toBeInTheDocument();
    expect(log).toHaveBeenCalledWith(
      "[Auth] Google redirect sign-in failed",
      expect.objectContaining({ code: "auth/unauthorized-domain" }),
    );
    log.mockRestore();
  });

  it("maps a Google infrastructure error to actionable copy without exposing diagnostics", async () => {
    setAuthState({
      ...authState,
      loginWithGoogle: vi.fn().mockRejectedValue({
        code: "auth/internal-error",
        message: "private Firebase diagnostic",
      }),
    });

    render(<Login />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Google" }));

    expect(
      await screen.findByText(/Inténtalo de nuevo o usa email y contraseña/),
    ).toBeInTheDocument();
    expect(screen.queryByText("private Firebase diagnostic")).not.toBeInTheDocument();
  });
});
