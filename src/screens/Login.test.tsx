import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
import { useAuth, type UserProfile } from "@/context/AuthContext";
import Login from "./Login";

const navigate = vi.fn();

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

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
});
