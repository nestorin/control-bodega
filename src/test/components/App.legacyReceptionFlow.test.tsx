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

vi.mock("@/screens/NuevaRecepcionStep1", () => ({
  default: ({
    onContinue,
    initialData,
    onBack,
  }: {
    onContinue: (data: unknown) => void;
    initialData?: Record<string, unknown>;
    onBack: () => void;
  }) => (
    <div>
      {initialData?.receptionId && (
        <p role="status">
          Restored {String(initialData.receptionId)} / {String(initialData.ocFolio)}
        </p>
      )}
      <button onClick={onBack}>Abandon reception</button>
      <button
        onClick={() =>
          onContinue(
            initialData?.receptionId
              ? initialData
              : {
                  hasOC: true,
                  ocFolio: "OC-LEGACY-1",
                  tarimas: "1",
                  proveedor: "Supplier",
                  proveedorLogistico: "Carrier",
                  receptionId: "reception-legacy-1",
                  productos: [],
                  conversionesTabla: [],
                },
          )
        }
      >
        Continue legacy reception
      </button>
    </div>
  ),
}));

vi.mock("@/screens/NuevaRecepcionStep2", () => ({
  default: ({ onContinue, onBack }: { onContinue: () => void; onBack: () => void }) => (
    <div>
      <button onClick={onBack}>Back to reception details</button>
      <button onClick={onContinue}>Continue to pallet capture</button>
    </div>
  ),
}));

vi.mock("@/screens/CapturaTarima", () => ({
  default: ({ onFinish }: { onFinish: () => void }) => (
    <div>
      <p>Legacy pallet capture</p>
      <button onClick={onFinish}>Finish pallet capture</button>
    </div>
  ),
}));

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
