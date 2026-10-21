#!/usr/bin/env node
// P2 auth verification: proves the exact AuthContext read path against local
// emulators with the REAL firestore.rules and project demo-exepa-e2e:
//   1. sign-in on the auth emulator
//   2. own get on a missing membership doc -> exists=false (app reports PENDING)
//   3. provision an ACTIVE membership (admin SDK bypasses rules)
//   4. same get -> resolves with status ACTIVE and matching userId
//
// Run:
//   sh scripts/e2e-preflight.sh && firebase emulators:exec \
//     --only auth,firestore --project demo-exepa-e2e \
//     "node scripts/verify-auth-membership.mjs"

import { readFileSync } from "node:fs";
import { initializeApp as initAdmin, getApps as adminApps } from "firebase-admin/app";
import { getAuth as adminGetAuth } from "firebase-admin/auth";
import { getFirestore as adminGetFirestore } from "firebase-admin/firestore";
import { initializeApp as initClient, getApps as clientApps } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, connectAuthEmulator } from "firebase/auth";
import { getFirestore, doc, getDoc, connectFirestoreEmulator } from "firebase/firestore";

const firebaseJson = JSON.parse(
  readFileSync(new URL("../firebase.json", import.meta.url), "utf8"),
);
const authPort = firebaseJson.emulators?.auth?.port ?? 9099;
const firestoreHostPort = firebaseJson.emulators?.firestore?.port ?? 8080;
const projectId = process.env.GCLOUD_PROJECT ?? "demo-exepa-e2e";
const ORG_ID = "org_exepa_001";
const email = `verify-auth-membership+${Date.now()}@example.test`;
const password = "VerifyPassw0rd!";

let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures += 1;
};

let createdUid = null;

try {
  const adminApp = adminApps().length > 0 ? adminApps()[0] : initAdmin({ projectId });
  const adminAuth = adminGetAuth(adminApp);
  const adminDb = adminGetFirestore(adminApp);

  const clientApp =
    clientApps().length > 0
      ? clientApps()[0]
      : initClient({
          projectId,
          apiKey: "verify-key",
          authDomain: `${projectId}.firebaseapp.com`,
        });
  const clientAuth = getAuth(clientApp);
  connectAuthEmulator(clientAuth, `http://127.0.0.1:${authPort}`, { disableWarnings: true });
  const clientDb = getFirestore(clientApp);
  connectFirestoreEmulator(clientDb, "127.0.0.1", firestoreHostPort);

  const user = await adminAuth.createUser({ email, password, emailVerified: true });
  createdUid = user.uid;
  const profilePath = `organizations/${ORG_ID}/users/${user.uid}`;

  const cred = await signInWithEmailAndPassword(clientAuth, email, password);
  check(
    "authenticated sign-in on the auth emulator returns the provisioned uid",
    cred.user.uid === user.uid,
    `uid=${user.uid}`,
  );

  const missing = await getDoc(doc(clientDb, profilePath));
  check(
    "own get on a missing membership resolves exists=false (app reports PENDING)",
    !missing.exists(),
  );

  await adminDb.doc(profilePath).set({
    userId: user.uid,
    organizationId: ORG_ID,
    role: "OPERATOR",
    status: "ACTIVE",
    warehouseId: null,
    displayName: "Verify Membership",
  });

  const active = await getDoc(doc(clientDb, profilePath));
  const data = active.exists() ? active.data() : null;
  check(
    "own get on a provisioned ACTIVE membership resolves with matching userId",
    active.exists() && data.status === "ACTIVE" && data.userId === user.uid,
    `status=${data?.status}`,
  );
} catch (error) {
  failures += 1;
  console.error("FAIL: unexpected error —", error);
} finally {
  try {
    if (createdUid) {
      const adminApp = adminApps()[0];
      if (adminApp) {
        await adminGetFirestore(adminApp)
          .doc(`organizations/${ORG_ID}/users/${createdUid}`)
          .delete()
          .catch(() => {});
        await adminGetAuth(adminApp).deleteUser(createdUid).catch(() => {});
      }
    }
  } catch {
    // cleanup is best-effort; emulators:exec wipes state anyway
  }
}

console.log(
  failures === 0
    ? "VERIFY-AUTH-MEMBERSHIP: ALL CHECKS PASSED"
    : `VERIFY-AUTH-MEMBERSHIP: ${failures} CHECK(S) FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
