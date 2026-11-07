import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const getByWarehouse = vi.hoisted(() => vi.fn());

vi.mock("@/config/featureFlags", () => ({ isFeatureEnabled: () => true }));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ user: { uid: "user-1" }, canQuery: true }),
  isPermissionDenied: () => false,
}));
vi.mock("@/services/firestore", () => ({
  createFirestoreServices: () => ({ lotesCaducidades: { getByWarehouse } }),
}));

import LotesCaducidades from "@/screens/LotesCaducidades";

describe("monthly inventory view", () => {
  it("renders monthly boxes and total without replacing the existing lot view", async () => {
    getByWarehouse.mockResolvedValue([
      {
        id: "lot-1",
        productId: "product-1",
        productName: "Agua",
        lot: "A1",
        cajas: 8,
        expiryDate: { toDate: () => new Date("2027-01-15T00:00:00Z") },
        monthKey: "Ene-27",
      },
      {
        id: "lot-2",
        productId: "product-1",
        productName: "Agua",
        lot: "A2",
        cajas: 4,
        expiryDate: { toDate: () => new Date("2027-03-15T00:00:00Z") },
        monthKey: "Mar-27",
      },
    ]);
    render(<LotesCaducidades />);
    expect(await screen.findByText("A1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Por mes" }));
    const table = within(
      screen.getByRole("region", { name: "Caducidades mensuales 2027" }),
    ).getByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual([
      "Producto",
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
      "TOTAL",
    ]);
    const row = within(table).getByRole("row", { name: /Agua/ });
    expect(
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual(["8", "—", "4", "—", "—", "—", "—", "—", "—", "—", "—", "—", "12"]);
    const totals = within(table).getByRole("row", { name: /TOTAL 8 0 4/ });
    expect(within(totals).getAllByRole("cell").at(-1)).toHaveTextContent("12");
    fireEvent.click(screen.getByRole("button", { name: "Por lote" }));
    await waitFor(() => expect(screen.getByText("A1")).toBeInTheDocument());
  });
});
