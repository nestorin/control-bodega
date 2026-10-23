#!/usr/bin/env node
// Open sign-up migration: activate every legacy PENDING membership so nobody is
// left behind an approval queue that no longer exists.
//
// For each PENDING profile it sets status=ACTIVE and, when the profile has no
// warehouse scope, grants both canonical warehouses. Without that scope an
// ACTIVE non-admin is still rejected by functions/rbac.py ("Active membership
// requires warehouse scope"), so activation alone would leave the account
// unable to work.
//
// Profiles missing status or role are reported but never rewritten; repairing
// them needs a human decision.
//
// Talks to the Firestore REST API with an access token from gcloud, so it runs
// on any machine where gcloud is authenticated and does not require ADC.
//
// Run (dry-run, default):
//   node scripts/migrate-pending-to-active.mjs
// Run (write):
//   node scripts/migrate-pending-to-active.mjs --apply

import { execFileSync } from "node:child_process";

const ORG_ID = "org_exepa_001";
const PROJECT_ID =
  process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? "exepa-almacen-safe";
const WAREHOUSE_IDS = ["wh_tehuacan_1", "wh_tehuacan_2"];
const APPLY = process.argv.includes("--apply");

const DOCUMENTS_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const USERS_PARENT = `${DOCUMENTS_URL}/organizations/${ORG_ID}`;
const USERS_COLLECTION = "users";

const token = execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim();
if (!token) {
  console.error("FAIL: gcloud auth print-access-token returned an empty token.");
  process.exit(1);
}

async function api(url, { method = "GET", body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${method} ${url} → HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

const toValue = (value) => {
  if (value === null || value === undefined) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number")
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  return {
    mapValue: {
      fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toValue(v)])),
    },
  };
};

const fromValue = (value) => {
  if (!value) return undefined;
  if ("stringValue" in value) return value.stringValue;
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(fromValue);
  if ("mapValue" in value) return fromFields(value.mapValue.fields);
  return undefined;
};

const fromFields = (fields = {}) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromValue(value)]));

const rows = await api(`${USERS_PARENT}:runQuery`, {
  method: "POST",
  body: { structuredQuery: { from: [{ collectionId: USERS_COLLECTION }], limit: 500 } },
});

let activated = 0;
let alreadyActive = 0;
const damaged = [];

for (const row of rows) {
  const document = row.document;
  if (!document) continue;

  const uid = document.name.split("/").pop();
  const data = fromFields(document.fields);
  const missing = [];
  if (data.status === undefined) missing.push("status");
  if (data.role === undefined) missing.push("role");

  if (missing.length > 0) {
    damaged.push({ uid, email: data.email ?? null, missing });
    continue;
  }

  if (data.status !== "PENDING") {
    if (data.status === "ACTIVE") alreadyActive += 1;
    continue;
  }

  const patch = { status: "ACTIVE" };
  const hasScope =
    (Array.isArray(data.warehouseIds) &&
      data.warehouseIds.some((id) => WAREHOUSE_IDS.includes(id))) ||
    WAREHOUSE_IDS.includes(data.warehouseId);
  if (!hasScope) patch.warehouseIds = [...WAREHOUSE_IDS];

  activated += 1;
  console.log(
    `  → ${uid} role=${data.role}${data.email ? ` email=${data.email}` : ""}` +
      `${hasScope ? "" : " (+warehouse scope)"}`,
  );

  if (APPLY) {
    const fields = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, toValue(v)]));
    const mask = Object.keys(patch)
      .map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`)
      .join("&");
    await api(`${document.name}?${mask}`, { method: "PATCH", body: { fields } });
  }
}

console.log(
  `migrate-pending-to-active [${APPLY ? "APPLY" : "DRY-RUN"}] — ${rows.filter((r) => r.document).length} profile(s) scanned`,
);
console.log(`  active already : ${alreadyActive}`);
console.log(`  to activate    : ${activated}`);
console.log(`  unrepairable   : ${damaged.length}`);
for (const entry of damaged) {
  console.log(
    `    ! ${entry.uid} missing ${entry.missing.join(", ")}${entry.email ? ` email=${entry.email}` : ""}`,
  );
}
if (!APPLY && activated > 0) console.log("  (no writes performed — re-run with --apply)");
