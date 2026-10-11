export type TarimaQRCode = `TQR-${string}-${string}`

export interface ParsedQR {
  ocNumber: string
  tarimaIndex: number
}

export function parseTarimaQR(qr: string): ParsedQR | null {
  const match = qr.match(/^TQR-(.+)-(\d{3})$/)
  if (!match) return null
  return { ocNumber: match[1], tarimaIndex: parseInt(match[2], 10) }
}

export function isValidTarimaQR(qr: string): qr is TarimaQRCode {
  return /^TQR-[A-Z0-9]+-\d{3}$/.test(qr)
}

export function buildTarimaQR(
  ocNumber: string,
  tarimaIndex: number,
): TarimaQRCode {
  return `TQR-${ocNumber}-${String(tarimaIndex).padStart(3, "0")}`
}
