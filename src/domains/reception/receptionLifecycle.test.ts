import { describe, expect, it } from "vitest";
import {
  getFirstIncompletePalletIndex,
  mapReceptionListItem,
  shouldReadLocalPalletCache,
} from "./receptionLifecycle";

describe("reception lifecycle recovery", () => {
  it("keeps Firestore document identity while presenting saved draft details", () => {
    const item = mapReceptionListItem({
      id: "reception-op-1",
      operationId: "op-1",
      folio: "REC-2026-0001",
      supplierName: "El Florido",
      status: "IN_PROGRESS",
      plannedPallets: [
        { productName: "Agua", status: "RECEIVED" },
        { productName: "Agua", status: "PLANNED" },
      ],
    });

    expect(item.id).toBe("reception-op-1");
    expect(item.displayId).toBe("REC-2026-0001");
    expect(item.supplier).toBe("El Florido");
    expect(item.product).toBe("Agua");
    expect(item.palletCount).toBe(2);
    expect(item.canResume).toBe(true);
  });

  it("resumes at the first pallet not yet active", () => {
    expect(
      getFirstIncompletePalletIndex([
        { status: "ACTIVE" },
        { status: "RECEIVED" },
        { status: "IN_CAPTURE" },
        { status: "PLANNED" },
        { status: "PLANNED" },
      ]),
    ).toBe(2);
    expect(getFirstIncompletePalletIndex([{ status: "ACTIVE" }])).toBe(0);
    expect(getFirstIncompletePalletIndex([{ status: "RECEIVED" }])).toBe(0);
  });

  it("does not let an older local snapshot replace a Firestore canonical pallet plan", () => {
    expect(shouldReadLocalPalletCache(true, true)).toBe(false);
    expect(shouldReadLocalPalletCache(false, true)).toBe(true);
  });
});
