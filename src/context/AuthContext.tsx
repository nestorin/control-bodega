import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth"
import { doc, getDoc } from "firebase/firestore"
import { ORGANIZATION_ID } from "@/config/organization"
import { normalizeWarehouseId, WAREHOUSE_IDS } from "@/config/warehouses"
import { auth, db, googleProvider } from "@/lib/firebase"
import {
  isGlobalMembershipRole,
  membershipRoleSchema,
  normalizeMembershipRole,
  normalizeMembershipWarehouses,
  rolesMatch,
  type MembershipRole,
  type MembershipStatus,
} from "@/schemas/membership"

// Mock authentication is intentionally opt-in, including in local development.
  // SAFETY: Force real auth on production domain regardless of env var.
  // This is evaluated at build time via Vite's import.meta.env replacement.
  const IS_MOCK_MODE = import.meta.env.VITE_USE_MOCK_AUTH === "true"

// Runtime check for production domain - evaluated inside component
const isProdDomain = () =>
  typeof window !== "undefined" &&
  window.location.hostname === "exepa-almacen-safe.web.app"

// Warn if mock mode is accidentally enabled on production
if (IS_MOCK_MODE && isProdDomain() && typeof console !== "undefined") {
  console.warn(
    "[Auth] ⚠️ MOCK MODE ACTIVO en producción. Desactiva VITE_USE_MOCK_AUTH para auth real.",
  )
}

export interface UserProfile {
  userId: string
  organizationId: string
  role: MembershipRole
  /** Legacy single-warehouse field. New records should use warehouseIds. */
  warehouseId?: string | null
  warehouseIds?: string[]
  status: MembershipStatus
}

export type AccessStatus = "UNAUTHENTICATED" | "PENDING" | "ACTIVE" | "INACTIVE" | "ERROR"

export function isValidMembership(
  value: unknown,
  uid: string,
): value is UserProfile {
  if (!value || typeof value !== "object") return false
  const membership = value as Partial<UserProfile>
  return (
    membership.userId === uid &&
    membership.organizationId === ORGANIZATION_ID &&
    membershipRoleSchema.safeParse(membership.role).success &&
    ["ACTIVE", "INACTIVE", "PENDING"].includes(membership.status ?? "") &&
    (membership.warehouseId == null ||
      (typeof membership.warehouseId === "string" &&
        normalizeWarehouseId(membership.warehouseId) != null)) &&
    (membership.warehouseIds == null ||
      (Array.isArray(membership.warehouseIds) &&
        membership.warehouseIds.length <= 20 &&
        membership.warehouseIds.every(
          (id) => normalizeWarehouseId(id) != null,
        )))
  )
}

export function canAccessWarehouseForProfile(
  accessStatus: AccessStatus,
  profile: UserProfile | null,
  warehouseId: string,
): boolean {
  if (accessStatus !== "ACTIVE" || !profile) return false
  if (isGlobalMembershipRole(profile.role)) return true
  const requestedWarehouseId = normalizeWarehouseId(warehouseId)
  const memberWarehouseIds = normalizeMembershipWarehouses(profile)
  return (
    requestedWarehouseId != null &&
    (memberWarehouseIds == null ||
      memberWarehouseIds.includes(requestedWarehouseId))
  )
}

export function normalizeMembership(profile: UserProfile): UserProfile {
  const warehouseIds = normalizeMembershipWarehouses(profile)
  return {
    ...profile,
    role: profile.role,
    warehouseId: warehouseIds?.[0] ?? null,
    warehouseIds: warehouseIds ?? undefined,
  }
}

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  accessStatus: AccessStatus
  authError: Error | null
  login: (email: string, password: string) => Promise<void>
  register: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<void>
  loginWithGoogle: () => Promise<void>
  logout: () => Promise<void>
  hasRole: (roles: string[]) => boolean
  canAccessWarehouse: (warehouseId: string) => boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  // MODO MOCK: para testing sin Firebase real
  if (IS_MOCK_MODE && !isProdDomain()) {
    const mockUser = Object.assign(Object.create(null), {
      uid: "test-user-123",
      email: "test@exepa.com",
    }) as User
    const mockProfile: UserProfile = {
      userId: "test-user-123",
      organizationId: "org_exepa_001",
      role: "ADMIN",
      warehouseId: WAREHOUSE_IDS.NORTH,
      status: "ACTIVE",
    }

    const mockValue: AuthContextType = {
      user: mockUser,
      profile: mockProfile,
      loading: false,
      accessStatus: "ACTIVE",
      authError: null,
      login: async () => {},
      register: async () => {},
      loginWithGoogle: async () => {},
      logout: async () => {},
      hasRole: (roles) => roles.some((role) => rolesMatch("ADMIN", role)),
      canAccessWarehouse: () => true,
    }

    return (
      <AuthContext.Provider value={mockValue}>{children}</AuthContext.Provider>
    )
  }

  // MODO REAL: Firebase Auth
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [accessStatus, setAccessStatus] =
    useState<AccessStatus>("UNAUTHENTICATED")
  const [authError, setAuthError] = useState<Error | null>(null)

  useEffect(() => {
    if (!auth || !db) {
      setAuthError(new Error("Firebase is not configured."))
      setUser(null)
      setProfile(null)
      setAccessStatus("ERROR")
      setLoading(false)
      return
    }

    const firebaseAuth = auth
    const firestore = db

    let active = true
    const unsubscribe = onAuthStateChanged(
      firebaseAuth,
      async (firebaseUser) => {
        if (!active) return

        setLoading(true)
        setAuthError(null)
        setUser(firebaseUser)

        try {
          if (!firebaseUser) {
            setProfile(null)
            setAccessStatus("UNAUTHENTICATED")
            return
          }

          const profileRef = doc(
            firestore,
            "organizations",
            ORGANIZATION_ID,
            "users",
            firebaseUser.uid,
          )
          const profileSnap = await getDoc(profileRef)
          if (!active) return

          if (!profileSnap.exists()) {
            // Memberships are provisioned by an administrator/backend only.
            setProfile(null)
            setAccessStatus("PENDING")
            return
          }

          const membership = profileSnap.data()
          if (!isValidMembership(membership, firebaseUser.uid)) {
            throw new Error(
              "The membership record is invalid or does not match the signed-in user.",
            )
          }

          const normalizedMembership = normalizeMembership(membership)
          setProfile(normalizedMembership)
          setAccessStatus(normalizedMembership.status)
        } catch (error) {
          if (!active) return
          setProfile(null)
          setAccessStatus("ERROR")
          setAuthError(
            error instanceof Error
              ? error
              : new Error("Unable to load the membership profile."),
          )
        } finally {
          if (active) setLoading(false)
        }
      },
      (error) => {
        if (!active) return
        setUser(null)
        setProfile(null)
        setAccessStatus("ERROR")
        setAuthError(error)
        setLoading(false)
      },
    )

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const login = async (email: string, password: string) => {
    if (!auth) throw new Error("Firebase is not configured.")
    await signInWithEmailAndPassword(auth, email, password)
  }

  const register = async (
    email: string,
    password: string,
    displayName: string,
  ) => {
    if (!auth) throw new Error("Firebase is not configured.")
    const result = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(result.user, { displayName })
    // An administrator/backend must create organizations/{orgId}/users/{uid}.
  }

  const loginWithGoogle = async () => {
    if (!auth) throw new Error("Firebase is not configured.")
    await signInWithPopup(auth, googleProvider)
  }

  const logout = async () => {
    if (!auth) return
    await signOut(auth)
  }

  const hasRole = (roles: string[]) => {
    return accessStatus === "ACTIVE" && profile
      ? roles.some((role) => rolesMatch(profile.role, role))
      : false
  }

  const canAccessWarehouse = (warehouseId: string) => {
    return canAccessWarehouseForProfile(accessStatus, profile, warehouseId)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        accessStatus,
        authError,
        login,
        register,
        loginWithGoogle,
        logout,
        hasRole,
        canAccessWarehouse,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
