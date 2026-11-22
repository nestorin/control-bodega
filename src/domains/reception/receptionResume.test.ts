import { describe, expect, it } from "vitest";
import { resolveResumeTarget } from "./receptionResume";

describe("resolveResumeTarget", () => {
  it("sends a draft to capture so it can become in progress", () => {
    expect(resolveResumeTarget("DRAFT")).toBe("captura-tarima");
  });

  it("keeps an in-progress reception in pallet capture", () => {
    expect(resolveResumeTarget("IN_PROGRESS")).toBe("captura-tarima");
  });

  it("does not resume terminal states", () => {
    expect(resolveResumeTarget("CONFIRMED")).toBeNull();
    expect(resolveResumeTarget("CANCELLED")).toBeNull();
  });
});
