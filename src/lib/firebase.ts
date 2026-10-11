import { getApp, getApps, initializeApp } from "firebase/app"
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth"
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore"
import { getStorage, type FirebaseStorage } from "firebase/storage"

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
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

export const auth: Auth | null = app ? getAuth(app) : null
// Use the current Firestore cache API. The previous
// enableIndexedDbPersistence() path is deprecated in Firebase JS SDK 12 and
// can race with other modules that initialize Firestore during app startup.
export const db: Firestore | null = app
  ? initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    })
  : null
export const storage: FirebaseStorage | null = app ? getStorage(app) : null
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
