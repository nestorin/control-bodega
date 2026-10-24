import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/context/AuthContext";
import Login from "./Login";

const navigate = vi.fn();

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

describe("Login enrollment", () => {
  const register = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      profile: null,
      loading: false,
      accessStatus: "UNAUTHENTICATED",
      authError: null,
      login: vi.fn(),
      register,
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(() => false),
      canAccessWarehouse: vi.fn(() => false),
    });
  });

  async function completeSignupForm(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Regístrate" }));
    await user.type(screen.getByLabelText("Nombre completo"), "Nueva Persona");
    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "secure-password");
    await user.type(screen.getByLabelText("Confirmar contraseña"), "secure-password");
  }

  it("sends a completed signup into the app after server-side provisioning", async () => {
    const user = userEvent.setup();
    render(<Login />);

    await completeSignupForm(user);
    await user.click(screen.getByRole("button", { name: "Registrarse" }));

    await waitFor(() =>
      expect(register).toHaveBeenCalledWith("new@example.com", "secure-password", "Nueva Persona"),
    );
    expect(navigate).toHaveBeenCalledWith("/", { replace: true });
  });
});
