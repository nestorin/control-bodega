#!/usr/bin/env node
// Script para crear usuario demo en Firebase Auth
// Ejecutar: DEMO_USER_PASSWORD='...' node scripts/create-demo-user.js
// Credenciales: FIREBASE_SERVICE_ACCOUNT (JSON inline) o
// GOOGLE_APPLICATION_CREDENTIALS (ruta al archivo de cuenta de servicio).

const password = process.env.DEMO_USER_PASSWORD;
if (!password) {
  console.error(
    "❌ Missing DEMO_USER_PASSWORD. Provide it through the environment; it is never logged.",
  );
  process.exit(2);
}

const admin = require("firebase-admin");

const inlineServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
const credential = inlineServiceAccount
  ? admin.credential.cert(JSON.parse(inlineServiceAccount))
  : admin.credential.applicationDefault();

admin.initializeApp({
  credential,
  projectId: "exepa-almacen-safe",
});

const auth = admin.auth();

async function createDemoUser() {
  const email = "exepabodega@gmail.com";
  const displayName = "Usuario Demo Bodega EXEPA";

  try {
    // Verificar si el usuario ya existe
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(email);
      console.log("✅ Usuario ya existe:", userRecord.uid);
    } catch (error) {
      // Crear nuevo usuario
      userRecord = await auth.createUser({
        email: email,
        password: password,
        displayName: displayName,
        emailVerified: true,
      });
      console.log("✅ Usuario creado:", userRecord.uid);
    }

    // Establecer custom claims (rol)
    await auth.setCustomUserClaims(userRecord.uid, {
      role: "ADMIN",
      organizationId: "org_exepa_001",
      warehouseId: "wh_tehuacan_1",
    });
    console.log("✅ Custom claims establecidos (ADMIN)");

    // Crear documento de perfil en Firestore
    const db = admin.firestore();
    await db.doc(`organizations/org_exepa_001/users/${userRecord.uid}`).set({
      userId: userRecord.uid,
      organizationId: "org_exepa_001",
      email: email,
      displayName: displayName,
      photoURL: "",
      role: "ADMIN",
      warehouseId: "wh_tehuacan_1",
      status: "ACTIVE",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log("✅ Perfil creado en Firestore");

    console.log("\n🎉 Usuario demo listo:");
    console.log("   Email:", email);
    console.log("   Password: provided from DEMO_USER_PASSWORD (not displayed)");
    console.log("   Role: ADMIN");
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

createDemoUser();
