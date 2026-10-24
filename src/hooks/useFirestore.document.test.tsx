import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useDocument } from "./useFirestore";

describe("useDocument disabled state", () => {
  it("settles loading when there is no Firestore observation to wait for", () => {
    const { result } = renderHook(() => useDocument(null, "", { enabled: false }));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
