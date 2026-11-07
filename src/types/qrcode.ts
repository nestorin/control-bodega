export type TarimaQRCode = `TQR-${string}-${string}`;

export interface ParsedQR {
  ocNumber: string;
  tarimaIndex: number;
}

export function parseTarimaQR(qr: string): ParsedQR | null {
  // Accept both old format (TQR-{anything}-{3digits}) and new format (TQR-{8chars}-{3digits})
  const match = qr.match(/^TQR-([A-Za-z0-9_-]+)-(\d{3})$/i);
  if (!match) return null;
  return { ocNumber: match[1], tarimaIndex: parseInt(match[2], 10) };
}

export function isValidTarimaQR(qr: string): qr is TarimaQRCode {
  return parseTarimaQR(qr) !== null;
}

export function buildTarimaQR(ocNumber: string, tarimaIndex: number): TarimaQRCode {
  return `TQR-${ocNumber}-${String(tarimaIndex).padStart(3, "0")}`;
}
