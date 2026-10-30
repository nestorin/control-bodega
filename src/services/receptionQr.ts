import QRCode from "qrcode";

const QR_OPTIONS = {
  width: 512,
  margin: 2,
  errorCorrectionLevel: "H" as const,
};

/** Build scannable PNGs for the exact server-issued pallet identifiers. */
export async function generateReceptionQrPngs(codes: string[]): Promise<string[]> {
  if (codes.length === 0) return [];

  const images = await Promise.all(codes.map((code) => QRCode.toDataURL(code, QR_OPTIONS)));
  if (images.some((image) => !image.startsWith("data:image/png;base64,"))) {
    throw new Error("La biblioteca QR no devolvió imágenes PNG válidas.");
  }
  return images;
}
