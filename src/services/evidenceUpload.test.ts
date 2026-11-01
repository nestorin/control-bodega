import { describe, expect, it, vi } from "vitest";
import { uploadEvidencePair } from "./evidenceUpload";

describe("paired evidence uploads", () => {
  it("removes the object whose upload succeeded when its partner fails", async () => {
    const uploadTrailer = vi.fn().mockResolvedValue(undefined);
    const uploadProduct = vi.fn().mockRejectedValue(new Error("storage unavailable"));
    const deleteTrailer = vi.fn().mockResolvedValue(undefined);
    const deleteProduct = vi.fn().mockResolvedValue(undefined);

    await expect(
      uploadEvidencePair([uploadTrailer, uploadProduct], [deleteTrailer, deleteProduct]),
    ).rejects.toThrow("storage unavailable");

    expect(deleteTrailer).toHaveBeenCalledOnce();
    expect(deleteProduct).not.toHaveBeenCalled();
  });

  it("keeps both objects when both uploads succeed", async () => {
    const cleanup = [vi.fn(), vi.fn()] as const;
    await uploadEvidencePair(
      [vi.fn().mockResolvedValue(undefined), vi.fn().mockResolvedValue(undefined)],
      cleanup,
    );
    expect(cleanup[0]).not.toHaveBeenCalled();
    expect(cleanup[1]).not.toHaveBeenCalled();
  });
});
