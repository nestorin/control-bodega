import { describe, expect, it } from "vitest";
import { WAREHOUSE_IDS } from "./warehouses";
import { getVisibleNavItems } from "./navigation";

describe("warehouse-scoped navigation", () => {
  it("shows Etiquetado for the enabled pilot warehouse", () => {
    expect(getVisibleNavItems(WAREHOUSE_IDS.LABELING_PILOT, true).map((item) => item.id)).toContain(
      "etiquetado",
    );
  });

  it("hides Etiquetado for non-pilot warehouses without removing other modules", () => {
    const itemIds = getVisibleNavItems(WAREHOUSE_IDS.NORTH, true).map((item) => item.id);

    expect(itemIds).not.toContain("etiquetado");
    expect(itemIds).toContain("recepciones");
  });
});
