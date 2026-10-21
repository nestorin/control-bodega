import { beforeEach, describe, expect, it, vi } from "vitest";

const { uploadString, getDownloadURL, deleteObject, ref } = vi.hoisted(() => ({
  uploadString: vi.fn(),
  getDownloadURL: vi.fn(async () => "https://storage.test/preview.jpg"),
  deleteObject: vi.fn(async () => undefined),
  ref: vi.fn((_storage: unknown, path: string) => ({ path })),
}));

vi.mock("firebase/storage", () => ({
  deleteObject,
  getDownloadURL,
  ref,
  uploadString,
}));

import { uploadInvoicePreviewWithMetadata } from "./invoiceEvidence";

describe("invoice evidence persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the uploaded object when Firestore metadata persistence fails", async () => {
    const error = new Error("Firestore unavailable");
    await expect(
      uploadInvoicePreviewWithMetadata(
        {} as never,
        "rec-1",
        "data:image/jpeg;base64,abc",
        async () => {
          throw error;
        },
      ),
    ).rejects.toBe(error);

    expect(uploadString).toHaveBeenCalledOnce();
    expect(deleteObject).toHaveBeenCalledWith({
      path: "receptions/rec-1/invoice-preview.jpg",
    });
  });

  it("keeps the object when metadata persistence succeeds", async () => {
    const result = await uploadInvoicePreviewWithMetadata(
      {} as never,
      "rec-2",
      "data:image/jpeg;base64,abc",
      async (metadata) => metadata,
    );
    expect(result).toEqual({
      path: "receptions/rec-2/invoice-preview.jpg",
      url: "https://storage.test/preview.jpg",
    });
    expect(deleteObject).not.toHaveBeenCalled();
  });
});
