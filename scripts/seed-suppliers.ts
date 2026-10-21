#!/usr/bin/env node
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ALL_CANONICAL_SUPPLIER_SEED, ORGANIZATION_ID } from "../src/config/supplierCatalog";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "exepa-almacen-safe";
const ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const RESOURCE_ROOT = `projects/${PROJECT_ID}/databases/(default)/documents`;
const TOKEN_FILE = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");
type Value = { stringValue?: string; timestampValue?: string };

function token(): string {
  if (!fs.existsSync(TOKEN_FILE))
    throw new Error("Firebase CLI credentials not found. Run 'firebase login' first.");
  const config = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8")) as {
    tokens?: { access_token?: string; expires_at?: number };
  };
  const access = config.tokens?.access_token;
  const expires = config.tokens?.expires_at ?? 0;
  const expiryMs = expires > 1_000_000_000_000 ? expires : expires * 1000;
  if (!access) throw new Error("Firebase CLI access token is missing. Run 'firebase login' first.");
  if (expiryMs && expiryMs <= Date.now() + 30_000)
    throw new Error(
      "Firebase CLI credentials are expired. Run 'firebase login --reauth' and retry.",
    );
  return access;
}

function fields(data: Record<string, string>): Record<string, Value> {
  const now = new Date().toISOString();
  return {
    ...Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, { stringValue: value }]),
    ),
    createdAt: { timestampValue: now },
    updatedAt: { timestampValue: now },
  };
}

function decode(input: Record<string, Value> = {}): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, value.stringValue ?? value.timestampValue]),
  );
}

async function request(pathname: string, access: string, init?: RequestInit) {
  const response = await fetch(`${ROOT}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${access}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore request failed (${response.status})`);
  return response.json() as Promise<{ fields?: Record<string, Value> }>;
}

async function main() {
  const access = token();
  const base = `/organizations/${ORGANIZATION_ID}/suppliers`;
  const docs = await Promise.all(
    ALL_CANONICAL_SUPPLIER_SEED.map(([id]) => request(`${base}/${id}`, access)),
  );
  const conflicts = ALL_CANONICAL_SUPPLIER_SEED.flatMap((seed, index) => {
    const existing = docs[index] ? decode(docs[index]?.fields) : null;
    if (!existing) return [];
    const [, code, name, tipo] = seed;
    return [
      existing.organizationId !== ORGANIZATION_ID ? `${seed[0]}: organizationId mismatch` : null,
      existing.code !== code ? `${seed[0]}: code mismatch` : null,
      existing.name !== name ? `${seed[0]}: name mismatch` : null,
      existing.tipo !== tipo ? `${seed[0]}: tipo mismatch` : null,
    ].filter((error): error is string => error != null);
  });
  if (conflicts.length)
    throw new Error(`Refusing to overwrite conflicting data:\n${conflicts.join("\n")}`);
  const writes = ALL_CANONICAL_SUPPLIER_SEED.flatMap(([id, code, name, tipo], index) =>
    docs[index]
      ? []
      : [
          {
            update: {
              name: `${RESOURCE_ROOT}${base}/${id}`,
              fields: fields({
                organizationId: ORGANIZATION_ID,
                code,
                name,
                tipo,
              }),
            },
          },
        ],
  );
  if (!writes.length) return console.log(`Canonical suppliers already verified in ${PROJECT_ID}.`);
  await request(":commit", access, {
    method: "POST",
    body: JSON.stringify({ writes }),
  });
  console.log(`Created ${writes.length} supplier document(s) in ${PROJECT_ID}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
