import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "@/App";

vi.mock("@/context/AuthContext", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({
    user: null,
    profile: null,
    logout: vi.fn(),
    canQuery: false,
  }),
}));

vi.mock("@/components/ProtectedRoute", () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/screens/Home", () => ({
  default: ({ onNewReception }: { onNewReception: () => void }) => (
    <button onClick={onNewReception}>Start reception</button>
  ),
}));

vi.mock("@/screens/NuevaRecepcionStep1", async () => {
  const { useReceptionFlow } = await import("@/hooks/useReceptionFlow");
  return {
    // App renders this screen with NO props: the mock mirrors the real
    // contract (optional props with hook fallbacks) via useReceptionFlow.
    default: function NuevaRecepcionStep1Mock() {
      const { currentReception, setCurrentReception, navigate } = useReceptionFlow();
      return (
        <div>
          {currentReception?.receptionId && (
            <p role="status">
              Restored {currentReception.receptionId} / {currentReception.ocFolio}
            </p>
          )}
          <button
            onClick={() => {
              setCurrentReception(null);
              navigate("home");
            }}
          >
            Abandon reception
          </button>
          <button
            onClick={() => {
              setCurrentReception(
                currentReception ?? {
                  hasOC: true,
                  ocFolio: "OC-LEGACY-1",
                  tarimas: 1,
                  proveedor: "Supplier",
                  proveedorLogistico: "Carrier",
                  receptionId: "reception-legacy-1",
                  productos: [],
                  conversionesTabla: [],
                },
              );
              navigate("nueva-step2");
            }}
          >
            Continue legacy reception
          </button>
        </div>
      );
    },
  };
});

vi.mock("@/screens/NuevaRecepcionStep2", async () => {
  const { useReceptionFlow } = await import("@/hooks/useReceptionFlow");
  return {
    default: function NuevaRecepcionStep2Mock() {
      const { navigate } = useReceptionFlow();
      return (
        <div>
          <button onClick={() => navigate("nueva-step1")}>Back to reception details</button>
          <button onClick={() => navigate("captura-tarima")}>Continue to pallet capture</button>
        </div>
      );
    },
  };
});

vi.mock("@/screens/CapturaTarima", async () => {
  const { useReceptionFlow } = await import("@/hooks/useReceptionFlow");
  return {
    // Optional prop with hook fallback, exactly like the real screen.
    default: function CapturaTarimaMock({ onFinish }: { onFinish?: () => void }) {
      const { navigate } = useReceptionFlow();
      const handleFinish = onFinish ?? (() => navigate("completada"));
      return (
        <div>
          <p>Legacy pallet capture</p>
          <button onClick={handleFinish}>Finish pallet capture</button>
        </div>
      );
    },
  };
});

vi.mock("@/screens/RecepcionCompletada", () => ({
  default: () => <p>Reception completed</p>,
}));

describe("legacy reception flow", () => {
  it("reaches pallet capture and completes without a reception session", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start reception" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue legacy reception" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to pallet capture" }));

    expect(screen.getByText("Legacy pallet capture")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Finish pallet capture" }));

    expect(screen.getByText("Reception completed")).toBeInTheDocument();
  });

  it("restores the created reception on Back and clears it when abandoned", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start reception" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue legacy reception" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to reception details" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Restored reception-legacy-1 / OC-LEGACY-1",
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue legacy reception" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to reception details" }));
    fireEvent.click(screen.getByRole("button", { name: "Abandon reception" }));
    fireEvent.click(screen.getByRole("button", { name: "Start reception" }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
