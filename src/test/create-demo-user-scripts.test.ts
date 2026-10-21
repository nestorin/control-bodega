import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("demo-user script identity", () => {
  it("uses the canonical warehouse field and ID in both scripts", () => {
    for (const file of ["scripts/create-demo-user.py", "scripts/create-demo-user.js"]) {
      const source = readFileSync(file, "utf8");
      expect(source).toContain("warehouseId");
      expect(source).toContain("userId");
      expect(source).toContain("wh_tehuacan_1");
      expect(source).toContain("exepabodega@gmail.com");
      expect(source).not.toContain("bodegaexepa@gmail.com");
      expect(source).not.toContain("warehouse_001");
      expect(source).not.toContain("almacenId");
    }
  });
});
