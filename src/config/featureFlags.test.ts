import { describe, expect, it, vi } from "vitest";
import { WAREHOUSE_IDS } from "./warehouses";

vi.unmock("@/config/featureFlags");

import { isLabelingUiEnabledForWarehouse } from "./featureFlags";

describe("Etiquetado feature gate", () => {
  it("enables the UI only for the pilot warehouse when the flag is enabled", () => {
    expect(isLabelingUiEnabledForWarehouse(WAREHOUSE_IDS.PILOTO, true)).toBe(true);
    expect(isLabelingUiEnabledForWarehouse(WAREHOUSE_IDS.NORTH, true)).toBe(false);
  });

  it("keeps the pilot warehouse hidden when the feature flag is disabled", () => {
    expect(isLabelingUiEnabledForWarehouse(WAREHOUSE_IDS.PILOTO, false)).toBe(false);
  });
});
