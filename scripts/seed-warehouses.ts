#!/usr/bin/env node
/**
 * Idempotently provisions the canonical organization and warehouse catalog.
 * Uses the already-authenticated Firebase CLI session; no service-account key
 * is required. Missing documents are created, conflicting data is rejected.
 */
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import {
  CANONICAL_WAREHOUSE_SEED,
  ORGANIZATION_ID,
  validateExistingWarehouse,
} from "../src/config/warehouseSeed"

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "exepa-almacen-safe"
const FIRESTORE_ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`
const FIRESTORE_RESOURCE_ROOT = `projects/${PROJECT_ID}/databases/(default)/documents`
const TOKEN_FILE = path.join(
  os.homedir(),
  ".config",
  "configstore",
  "firebase-tools.json",
)
type FirestoreDocument = {
  name?: string
  fields?: Record<string, FirestoreValue>
}
type FirestoreValue = {
  stringValue?: string
  booleanValue?: boolean
  timestampValue?: string
}

function readCliToken(): string {
  if (!fs.existsSync(TOKEN_FILE))
    throw new Error(
      `Firebase CLI credentials not found at ${TOKEN_FILE}. Run 'firebase login' first.`,
    )
  const config = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8")) as {
    tokens?: { access_token?: string expires_at?: number }
  }
  const token = config.tokens?.access_token
  const expiresAt = config.tokens?.expires_at
  const expiryMillis =
    expiresAt == null
      ? 0
      : expiresAt > 1_000_000_000_000
        ? expiresAt
        : expiresAt * 1000
  if (!token)
    throw new Error(
      "Firebase CLI access token is missing. Run 'firebase login' first.",
    )
  if (expiryMillis && expiryMillis <= Date.now() + 30_000)
    throw new Error(
      "Firebase CLI credentials are expired. Run 'firebase login --reauth' and retry.",
    )
  return token
}

function encodeFields(
  fields: Record<string, string | boolean>,
): Record<string, FirestoreValue> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      typeof value === "boolean"
        ? { booleanValue: value }
        : { stringValue: value },
    ]),
  )
}

function decodeFields(
  fields: Record<string, FirestoreValue> = {},
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      value.stringValue ?? value.booleanValue ?? value.timestampValue,
    ]),
  )
}

async function firestoreRequest(
  pathname: string,
  token: string,
  init?: RequestInit,
) {
  const response = await fetch(`${FIRESTORE_ROOT}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  })
  if (response.status === 404) return null
  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      throw new Error(
        "Firebase CLI credentials were rejected or expired. Run 'firebase login --reauth' and retry.",
      )
    throw new Error(
      `Firestore request failed (${response.status}): ${(await response.text()).slice(0, 300)}`,
    )
  }
  return (await response.json()) as FirestoreDocument
}

async function main() {
  const token = readCliToken()
  const orgPath = `/organizations/${ORGANIZATION_ID}`
  const org = await firestoreRequest(orgPath, token)
  const warehouseDocs = await Promise.all(
    CANONICAL_WAREHOUSE_SEED.map((warehouse) =>
      firestoreRequest(`${orgPath}/warehouses/${warehouse.id}`, token),
    ),
  )
  if (org) {
    const fields = decodeFields(org.fields)
    const organizationConflicts = ["organizationId", "status"].flatMap(
      (field) => {
        const expected = field === "organizationId" ? ORGANIZATION_ID : "ACTIVE"
        return fields[field] === expected
          ? []
          : [
              `organization ${field} expected ${expected}, found ${String(fields[field])}`,
            ]
      },
    )
    if (organizationConflicts.length)
      throw new Error(
        `Refusing to overwrite conflicting data:\n${organizationConflicts.join("\n")}`,
      )
  }
  const conflicts = CANONICAL_WAREHOUSE_SEED.flatMap((warehouse, index) => {
    const document = warehouseDocs[index]
    return document
      ? validateExistingWarehouse(decodeFields(document.fields), warehouse).map(
          (error) => `${warehouse.id}: ${error}`,
        )
      : []
  })
  if (conflicts.length)
    throw new Error(
      `Refusing to overwrite conflicting data:\n${conflicts.join("\n")}`,
    )

  const writes: Array<Record<string, unknown>> = []
  if (!org)
    writes.push({
      update: {
        name: `${FIRESTORE_RESOURCE_ROOT}${orgPath}`,
        fields: encodeFields({
          organizationId: ORGANIZATION_ID,
          name: "EXEPA - Exportadora de Abarrotes del Pacífico",
          status: "ACTIVE",
        }),
      },
    })
  CANONICAL_WAREHOUSE_SEED.forEach((warehouse, index) => {
    if (!warehouseDocs[index])
      writes.push({
        update: {
          name: `${FIRESTORE_RESOURCE_ROOT}${orgPath}/warehouses/${warehouse.id}`,
          fields: encodeFields({
            ...warehouse,
            organizationId: ORGANIZATION_ID,
            active: true,
          }),
        },
      })
  })
  if (!writes.length)
    return console.log(`Canonical catalog already verified in ${PROJECT_ID}.`)
  await firestoreRequest(":commit", token, {
    method: "POST",
    body: JSON.stringify({ writes }),
  })
  console.log(`Created ${writes.length} missing document(s) in ${PROJECT_ID}.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
