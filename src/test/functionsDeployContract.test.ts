import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoFile = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Cloud Functions deployment contract", () => {
  it("derives every HTTP callable target from functions/main.py", () => {
    const targets = execFileSync("python3", ["scripts/functions_deploy_targets.py"], {
      cwd: process.cwd(),
      encoding: "utf8",
    })
      .trim()
      .split("\n");

    expect(targets).toEqual([
      "health",
      "extract_ocr_secure",
      "confirm_shipment",
      "adjust_inventory",
      "import_inventory",
      "update_membership",
      "confirm_reception",
      "create_reception",
      "edit_reception",
      "register_reception_pallet",
      "save_evidence",
      "save_reception_pallet_capture",
      "validate_reception_pallet_scan",
      "reception_mutation_options",
      "mutate_reception",
    ]);
  });

  it("uses generated targets in the production workflow", () => {
    const workflow = repoFile(".github/workflows/ci-cd.yml");

    expect(workflow).toContain("python3 scripts/functions_deploy_targets.py --format firebase");
    expect(workflow).toContain('firebase deploy --only "$FUNCTION_TARGETS"');
  });

  it("uses mock-auth-only Storage rules for the mock-auth E2E emulator", () => {
    const e2eConfig = JSON.parse(repoFile("firebase.e2e.json"));

    expect(e2eConfig.storage.rules).toBe("storage.e2e.rules");
    expect(repoFile("storage.e2e.rules")).toContain("allow read, write: if true;");
  });
});
