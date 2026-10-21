import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadString,
  type FirebaseStorage,
} from "firebase/storage";

export async function uploadInvoicePreview(
  storage: FirebaseStorage,
  receptionId: string,
  dataUrl: string,
) {
  const path = `receptions/${receptionId}/invoice-preview.jpg`;
  const fileRef = ref(storage, path);
  await uploadString(fileRef, dataUrl, "data_url", {
    contentType: "image/jpeg",
  });
  return { path, url: await getDownloadURL(fileRef) };
}

/** Uploads evidence and rolls it back when Firestore metadata persistence fails. */
export async function uploadInvoicePreviewWithMetadata<T>(
  storage: FirebaseStorage,
  receptionId: string,
  dataUrl: string,
  persistMetadata: (metadata: { path: string; url: string }) => Promise<T>,
): Promise<T> {
  const evidence = await uploadInvoicePreview(storage, receptionId, dataUrl);
  try {
    return await persistMetadata(evidence);
  } catch (error) {
    try {
      await deleteObject(ref(storage, evidence.path));
    } catch (cleanupError) {
      console.error("Failed to clean up orphaned invoice preview:", cleanupError);
    }
    throw error;
  }
}
