#!/usr/bin/env node
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import snapshot from "../data/catalog/tehuacan-1-inventory-2026-10-04.json";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "exepa-almacen-safe";
const ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const RESOURCE_ROOT = `projects/${PROJECT_ID}/databases/(default)/documents`;
const TOKEN_FILE = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");
type Value = {
  stringValue?: string;
  integerValue?: string;
  booleanValue?: boolean;
};

function readToken(): string {
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

function encode(fields: Record<string, string | number | boolean>): Record<string, Value> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      typeof value === "number"
        ? { integerValue: String(value) }
        : typeof value === "boolean"
          ? { booleanValue: value }
          : { stringValue: value },
    ]),
  );
}

function decode(fields: Record<string, Value> = {}): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      value.stringValue ??
        (value.integerValue == null ? value.booleanValue : Number(value.integerValue)),
    ]),
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
  const access = readToken();
  const base = `/organizations/${snapshot.organizationId}/conversions`;
  const docs = await Promise.all(
    snapshot.conversions.map((conversion) =>
      request(`${base}/conv_${conversion.productId}`, access),
    ),
  );
  const conflicts = snapshot.conversions.flatMap((conversion, index) => {
    const existing = docs[index];
    if (!existing) return [];
    const fields = decode(existing.fields);
    return [
      ["organizationId", snapshot.organizationId],
      ["productId", conversion.productId],
      ["piecesPerBox", conversion.piezasPorCaja],
      ["boxesPerPallet", conversion.cajasPorTarima],
    ].flatMap(([field, expected]) =>
      fields[field] === expected
        ? []
        : [
            `conv_${conversion.productId}: ${field} expected ${String(expected)}, found ${String(fields[field])}`,
          ],
    );
  });
  if (conflicts.length)
    throw new Error(`Refusing to overwrite conflicting data:\n${conflicts.join("\n")}`);
  const writes = snapshot.conversions.flatMap((conversion, index) =>
    docs[index]
      ? []
      : [
          {
            update: {
              name: `${RESOURCE_ROOT}${base}/conv_${conversion.productId}`,
              fields: encode({
                organizationId: snapshot.organizationId,
                productId: conversion.productId,
                productCode: conversion.productId,
                productName:
                  snapshot.products.find((product) => product.id === conversion.productId)?.name ??
                  conversion.productId,
                piecesPerBox: conversion.piezasPorCaja,
                boxesPerPallet: conversion.cajasPorTarima,
              }),
            },
          },
        ],
  );
  if (!writes.length)
    return console.log(`Canonical conversions already verified in ${PROJECT_ID}.`);
  await request(":commit", access, {
    method: "POST",
    body: JSON.stringify({ writes }),
  });
  console.log(`Created ${writes.length} conversion document(s) in ${PROJECT_ID}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
