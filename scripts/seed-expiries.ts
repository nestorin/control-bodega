#!/usr/bin/env node
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import catalog from "../data/catalog/tehuacan-1-expiries-2026-10-04.json"

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "exepa-almacen-safe"
const ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`
const RESOURCE_ROOT = `projects/${PROJECT_ID}/databases/(default)/documents`
const STALE_IDS = ["cad_CL0201_nov-27", "cad_CL0201_dic-27"] as const
const TOKEN_FILE = path.join(
  os.homedir(),
  ".config",
  "configstore",
  "firebase-tools.json",
)
type Value = {
  stringValue?: string
  integerValue?: string
  booleanValue?: boolean
  timestampValue?: string
}

type Lot = typeof catalog.lots[number]

function readToken(): string {
  if (!fs.existsSync(TOKEN_FILE))
    throw new Error(
      "Firebase CLI credentials not found. Run 'firebase login' first.",
    )
  const config = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8")) as {
    tokens?: { access_token?: string expires_at?: number }
  }
  const access = config.tokens?.access_token
  const expires = config.tokens?.expires_at ?? 0
  const expiryMs = expires > 1_000_000_000_000 ? expires : expires * 1000
  if (!access)
    throw new Error(
      "Firebase CLI access token is missing. Run 'firebase login' first.",
    )
  if (expiryMs && expiryMs <= Date.now() + 30_000)
    throw new Error(
      "Firebase CLI credentials are expired. Run 'firebase login --reauth' and retry.",
    )
  return access
}

function encode(lot: Lot): Record<string, Value> {
  return {
    organizationId: { stringValue: catalog.organizationId },
    warehouseId: { stringValue: lot.warehouseId },
    productId: { stringValue: lot.productId },
    productName: { stringValue: lot.productName },
    lot: { stringValue: lot.lot },
    monthKey: { stringValue: lot.monthKey },
    expiryDate: { timestampValue: `${lot.expiryDate}T00:00:00Z` },
    cajas: { integerValue: String(lot.cajas) },
    sourceFile: { stringValue: catalog.sourceFile },
    sourceRow: { stringValue: lot.sourceRow },
    sourceQuantity: { integerValue: String(lot.sourceQuantity) },
    inventoryQuantity: { integerValue: String(lot.inventoryQuantity) },
    quantityMismatch: { booleanValue: lot.quantityMismatch },
    expiryPrecision: { stringValue: lot.expiryPrecision },
    sourceDate: { stringValue: catalog.sourceDate },
  }
}

function decode(fields: Record<string, Value> = {}): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      value.stringValue ??
        value.timestampValue ??
        (value.integerValue == null
          ? value.booleanValue
          : Number(value.integerValue)),
    ]),
  )
}

async function request(pathname: string, access: string, init?: RequestInit) {
  const response = await fetch(`${ROOT}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${access}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  })
  if (response.status === 404) return null
  if (!response.ok)
    throw new Error(
      `Firestore request failed (${response.status}): ${await response.text()}`,
    )
  return response.json() as Promise<{ fields?: Record<string, Value> }>
}

function conflicts(lot: Lot, existing: Record<string, unknown>): string[] {
  const expected = decode(encode(lot))
  const fields = [
    "warehouseId",
    "productId",
    "productName",
    "lot",
    "monthKey",
    "cajas",
    "sourceRow",
    "sourceQuantity",
    "inventoryQuantity",
    "quantityMismatch",
    "expiryPrecision",
  ]
  const mismatches = fields
    .filter((field) => existing[field] !== expected[field])
    .map(
      (field) =>
        `${lot.id}: ${field} expected ${String(expected[field])}, found ${String(existing[field])}`,
    )
  const existingExpiry = String(existing.expiryDate ?? "")
  if (!existingExpiry.startsWith(`${lot.expiryDate}T`))
    mismatches.push(
      `${lot.id}: expiryDate expected ${lot.expiryDate}T00:00:00Z, found ${existingExpiry}`,
    )
  return mismatches
}

async function main() {
  const access = readToken()
  const base = `/organizations/${catalog.organizationId}/lotes_caducidades`
  const existing = await Promise.all(
    catalog.lots.map((lot) => request(`${base}/${lot.id}`, access)),
  )
  const stale = await Promise.all(
    STALE_IDS.map((id) => request(`${base}/${id}`, access)),
  )
  const unsafeStale = stale.flatMap((doc, index) => {
    if (!doc) return []
    const fields = decode(doc.fields)
    const isSourceRecord =
      fields.productId === "CL0201" &&
      ["nov-27", "dic-27"].includes(String(fields.monthKey)) &&
      fields.sourceFile === catalog.sourceFile
    return isSourceRecord
      ? []
      : [
          `${STALE_IDS[index]} exists but is not an identifiable stale source record; refusing to delete it.`,
        ]
  })
  if (unsafeStale.length) throw new Error(unsafeStale.join("\n"))
  const unsafeExisting = catalog.lots.flatMap((lot, index) => {
    if (!existing[index]) return []
    const fields = decode(existing[index]?.fields)
    const isSourceRecord =
      fields.sourceFile === catalog.sourceFile &&
      fields.sourceDate === catalog.sourceDate
    return isSourceRecord ? [] : conflicts(lot, fields)
  })
  if (unsafeExisting.length)
    throw new Error(
      `Refusing to overwrite conflicting expiry data:\n${unsafeExisting.join("\n")}`,
    )

  const writes = [
    ...catalog.lots.flatMap((lot, index) =>
      existing[index]
        ? [
            {
              update: {
                name: `${RESOURCE_ROOT}${base}/${lot.id}`,
                fields: encode(lot),
              },
            },
          ]
        : [
            {
              update: {
                name: `${RESOURCE_ROOT}${base}/${lot.id}`,
                fields: encode(lot),
              },
            },
          ],
    ),
    ...stale.flatMap((doc, index) =>
      doc ? [{ delete: `${RESOURCE_ROOT}${base}/${STALE_IDS[index]}` }] : [],
    ),
  ]
  if (!writes.length)
    return console.log(
      `Canonical expiry lots already verified in ${PROJECT_ID}.`,
    )
  await request(":commit", access, {
    method: "POST",
    body: JSON.stringify({ writes }),
  })
  console.log(
    `Applied ${writes.length} expiry catalog write(s) in ${PROJECT_ID}.`,
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
