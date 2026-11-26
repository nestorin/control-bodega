import { describe, expect, it } from "vitest";
import { isTestDeepLinkEnabled } from "./testMode";

describe("isTestDeepLinkEnabled", () => {
  it("enables deep links in dev builds", () => {
    expect(isTestDeepLinkEnabled({ DEV: true, VITE_E2E_MODE: undefined })).toBe(true);
  });

  it("enables deep links when the e2e build flag is set", () => {
    expect(isTestDeepLinkEnabled({ DEV: false, VITE_E2E_MODE: "true" })).toBe(true);
  });

  it("disables deep links in production builds without the e2e flag", () => {
    expect(isTestDeepLinkEnabled({ DEV: false, VITE_E2E_MODE: undefined })).toBe(false);
    expect(isTestDeepLinkEnabled({ DEV: false, VITE_E2E_MODE: "false" })).toBe(false);
  });
});
