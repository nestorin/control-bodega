import { getApp, getApps, initializeApp } from "firebase/app"
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check"
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  type Auth,
} from "firebase/auth"
import {
  connectFunctionsEmulator,
  getFunctions,
} from "firebase/functions"
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore"
import {
  connectStorageEmulator,
  getStorage,
  type FirebaseStorage,
} from "firebase/storage"
const E2E_FIREBASE_PROJECT_ID = "demo-exepa-e2e"
const useFirebaseEmulators =
  import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true"
const useMockAuth = import.meta.env.VITE_USE_MOCK_AUTH === "true"
const useE2EEmulatorPorts = import.meta.env.VITE_E2E_MODE === "true"

function resolveEmulatorPort(
  value: string | undefined,
  fallback: number,
  service: string,
): number {
  // En modo MOCK auth, no necesitamos puerto de auth emulator
  // En modo MOCK, Firestore/Functions/Storage sí usan emuladores
  if (service === "Auth" && useMockAuth) return fallback
  if (!useE2EEmulatorPorts) return fallback
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`E2E ${service} emulator port is invalid.`)
  }
  return port
}

const authEmulatorPort = resolveEmulatorPort(
  import.meta.env.VITE_E2E_AUTH_EMULATOR_PORT,
  9099,
  "Auth",
)
const firestoreEmulatorPort = resolveEmulatorPort(
  import.meta.env.VITE_E2E_FIRESTORE_EMULATOR_PORT,
  8083,
  "Firestore",
)
const functionsEmulatorPort = resolveEmulatorPort(
  import.meta.env.VITE_E2E_FUNCTIONS_EMULATOR_PORT,
  5001,
  "Functions",
)
const storageEmulatorPort = resolveEmulatorPort(
  import.meta.env.VITE_E2E_STORAGE_EMULATOR_PORT,
  9199,
  "Storage",
)
const e2eOcrUrl = import.meta.env.VITE_OCR_URL

if (useFirebaseEmulators) {
  let endpoint: URL
  try {
    endpoint = new URL(e2eOcrUrl)
  } catch {
    throw new Error("E2E OCR endpoint must be a local emulator URL.")
  }

  if (
    endpoint.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(endpoint.hostname) ||
    endpoint.username ||
    endpoint.password
  ) {
    throw new Error("E2E OCR endpoint must be a local emulator URL.")
  }
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

if (
  useFirebaseEmulators &&
  firebaseConfig.projectId !== E2E_FIREBASE_PROJECT_ID
) {
  throw new Error(
    `Firebase emulator mode requires project ${E2E_FIREBASE_PROJECT_ID}; refusing ${firebaseConfig.projectId || "an unset project"}.`,
  )
}

const requiredConfig = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.appId,
]

export const isFirebaseConfigured = requiredConfig.every(Boolean)

const app = isFirebaseConfigured
  ? getApps().length > 0
    ? getApp()
    : initializeApp(firebaseConfig)
  : null

// The site key is public and restricted to this app's Firebase Hosting domains.
// App Check is enabled only in production; local development needs its own
// registered key or a Firebase App Check debug token.
export const appCheck =
  app && import.meta.env.PROD && !useFirebaseEmulators
    ? initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(
          "6Le5Y-otAAAAACdTTc9C4uQa2A2mQJZp8OBDPUb_",
        ),
        isTokenAutoRefreshEnabled: true,
      })
    : null

export const auth: Auth | null = app ? getAuth(app) : null

// En modo E2E, usar localStorage persistence para que Playwright pueda capturar el auth state
if (auth && useE2EEmulatorPorts) {
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn('[E2E] No se pudo establecer localStorage persistence:', err)
  })
}
const functions = app ? getFunctions(app, "us-central1") : null
// Use the current Firestore cache API. The previous
// enableIndexedDbPersistence() path is deprecated in Firebase JS SDK 12 and
// can race with other modules that initialize Firestore during app startup.
export const db: Firestore | null = app
  ? initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
      experimentalForceLongPolling: true,
    })
  : null
export const storage: FirebaseStorage | null = app ? getStorage(app) : null

// Connect before exporting these clients to modules that may issue requests.
if (useFirebaseEmulators && !useMockAuth && auth && db && storage && functions) {
  connectAuthEmulator(auth, `http://127.0.0.1:${authEmulatorPort}`, {
    disableWarnings: true,
  })
  connectFirestoreEmulator(db, "127.0.0.1", firestoreEmulatorPort)
  connectFunctionsEmulator(functions, "127.0.0.1", functionsEmulatorPort)
  connectStorageEmulator(storage, "127.0.0.1", storageEmulatorPort)
} else if (useFirebaseEmulators && useMockAuth && db && storage && functions) {
  // Mock auth mode: connect Firestore, Functions, Storage emulators but NOT Auth
  connectFirestoreEmulator(db, "127.0.0.1", firestoreEmulatorPort)
  connectFunctionsEmulator(functions, "127.0.0.1", functionsEmulatorPort)
  connectStorageEmulator(storage, "127.0.0.1", storageEmulatorPort)
}

export const googleProvider = new GoogleAuthProvider()

// Network detection for offline queue
if (db && typeof window !== "undefined") {
  // Network detection for offline queue
  window.addEventListener("online", () => {
    console.log("🌐 Back online - Firestore will auto-sync")
  })
  window.addEventListener("offline", () => {
    console.log("📴 Offline mode - writes queued locally")
  })
}
