import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, type Firestore } from "firebase/firestore";
import { ORGANIZATION_ID } from "@/config/organization";
import { normalizeWarehouseId, WAREHOUSE_IDS } from "@/config/warehouses";
import { auth, db, googleProvider, isFirebaseConfigured } from "@/lib/firebase";
import {
  isGlobalMembershipRole,
  membershipRoleSchema,
  normalizeMembershipRole,
  normalizeMembershipWarehouses,
  rolesMatch,
  type MembershipRole,
  type MembershipStatus,
} from "@/schemas/membership";

// Mock authentication is intentionally opt-in, including in local development.
// SAFETY: Force real auth on production domain regardless of env var.
// This is evaluated at build time via Vite's import.meta.env replacement.
const IS_MOCK_MODE = import.meta.env.VITE_USE_MOCK_AUTH === "true";

// Runtime check for production domain - evaluated inside component
const isProdDomain = () =>
  typeof window !== "undefined" && window.location.hostname === "exepa-almacen-safe.web.app";

// Warn if mock mode is accidentally enabled on production
if (IS_MOCK_MODE && isProdDomain() && typeof console !== "undefined") {
  console.warn(
    "[Auth] ⚠️ MOCK MODE ACTIVO en producción. Desactiva VITE_USE_MOCK_AUTH para auth real.",
  );
}

export interface UserProfile {
  userId: string;
  organizationId: string;
  role: MembershipRole;
  /** Legacy single-warehouse field. New records should use warehouseIds. */
  warehouseId?: string | null;
  warehouseIds?: string[];
  status: MembershipStatus;
}

export type AccessStatus = "UNAUTHENTICATED" | "ACTIVE" | "INACTIVE" | "ERROR";

// Open sign-up: every authenticated account gets an immediately usable
// profile. The writer cannot pick role, status or warehouse scope - they are
// fixed here and independently enforced by firestore.rules, so a self-serve
// signup can never become ADMIN.
const PROVISIONED_ROLE: MembershipRole = "GERENTE_ALMACEN";
const PROVISIONED_WAREHOUSES = [...Object.values(WAREHOUSE_IDS)];

export function isValidMembership(value: unknown, uid: string): value is UserProfile {
  if (!value || typeof value !== "object") return false;
  const membership = value as Partial<UserProfile>;
  return (
    membership.userId === uid &&
    membership.organizationId === ORGANIZATION_ID &&
    membershipRoleSchema.safeParse(membership.role).success &&
    ["ACTIVE", "INACTIVE"].includes(membership.status ?? "") &&
    (membership.warehouseId == null ||
      (typeof membership.warehouseId === "string" &&
        normalizeWarehouseId(membership.warehouseId) != null)) &&
    (membership.warehouseIds == null ||
      (Array.isArray(membership.warehouseIds) &&
        membership.warehouseIds.length <= 20 &&
        membership.warehouseIds.every((id) => normalizeWarehouseId(id) != null)))
  );
}

export function canAccessWarehouseForProfile(
  accessStatus: AccessStatus,
  profile: UserProfile | null,
  warehouseId: string,
): boolean {
  if (accessStatus !== "ACTIVE" || !profile) return false;
  if (isGlobalMembershipRole(profile.role)) return true;
  const requestedWarehouseId = normalizeWarehouseId(warehouseId);
  const memberWarehouseIds = normalizeMembershipWarehouses(profile);
  return (
    requestedWarehouseId != null &&
    (memberWarehouseIds == null || memberWarehouseIds.includes(requestedWarehouseId))
  );
}

export function normalizeMembership(profile: UserProfile): UserProfile {
  const warehouseIds = normalizeMembershipWarehouses(profile);
  return {
    ...profile,
    role: profile.role,
    warehouseId: warehouseIds?.[0] ?? null,
    warehouseIds: warehouseIds ?? undefined,
  };
}

function requireMembership(value: unknown, uid: string): UserProfile {
  if (!isValidMembership(value, uid)) {
    throw new Error("The membership record is invalid or does not match the signed-in user.");
  }
  return normalizeMembership(value);
}

/**
 * Resolve the membership for a signed-in user, creating it on first login.
 *
 * Provisioning happens here instead of in a sign-up handler so that every
 * auth provider (password, Google, any future one) follows the same path.
 * `setDoc` on an existing profile is an update, which the rules reserve for
 * admins, so an existing membership can never be overwritten or self-elevated.
 */
async function provisionMembership(firestore: Firestore, user: User): Promise<UserProfile> {
  const profileRef = doc(firestore, "organizations", ORGANIZATION_ID, "users", user.uid);
  const existing = await getDoc(profileRef);

  if (!existing.exists()) {
    try {
      await setDoc(profileRef, {
        userId: user.uid,
        organizationId: ORGANIZATION_ID,
        role: PROVISIONED_ROLE,
        status: "ACTIVE",
        warehouseIds: PROVISIONED_WAREHOUSES,
        displayName: user.displayName ?? "",
        email: user.email ?? "",
      });
    } catch (error) {
      // A concurrent session may have provisioned the profile first; the rules
      // reject overwriting an existing membership, so re-read it instead.
      const concurrent = await getDoc(profileRef);
      if (!concurrent.exists()) throw error;
      return requireMembership(concurrent.data(), user.uid);
    }
    return normalizeMembership({
      userId: user.uid,
      organizationId: ORGANIZATION_ID,
      role: PROVISIONED_ROLE,
      status: "ACTIVE",
      warehouseIds: PROVISIONED_WAREHOUSES,
    });
  }

  const stored = existing.data();
  const membership = requireMembership(stored, user.uid);

  // Firebase Auth resolves displayName/email after the profile exists (register
  // calls updateProfile afterwards), so mirror them once they arrive.
  const displayName = user.displayName ?? "";
  const email = user.email ?? "";
  if ((displayName && stored.displayName !== displayName) || (email && stored.email !== email)) {
    await updateDoc(profileRef, { displayName, email });
  }

  return membership;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  accessStatus: AccessStatus;
  authError: Error | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (roles: string[]) => boolean;
  canAccessWarehouse: (warehouseId: string) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // MODO MOCK: para testing sin Firebase real
  if (IS_MOCK_MODE && !isProdDomain()) {
    const mockUser = Object.assign(Object.create(null), {
      uid: "test-user-123",
      email: "test@exepa.com",
    }) as User;
    const mockProfile: UserProfile = {
      userId: "test-user-123",
      organizationId: "org_exepa_001",
      role: "ADMIN",
      warehouseId: WAREHOUSE_IDS.NORTH,
      status: "ACTIVE",
    };

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
    };

    return <AuthContext.Provider value={mockValue}>{children}</AuthContext.Provider>;
  }

  // MODO REAL: Firebase Auth
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessStatus, setAccessStatus] = useState<AccessStatus>("UNAUTHENTICATED");
  const [authError, setAuthError] = useState<Error | null>(null);

  useEffect(() => {
    if (!auth || !db) {
      setAuthError(new Error("Firebase is not configured."));
      setUser(null);
      setProfile(null);
      setAccessStatus("ERROR");
      setLoading(false);
      return;
    }

    const firebaseAuth = auth;
    const firestore = db;

    let active = true;
    const unsubscribe = onAuthStateChanged(
      firebaseAuth,
      async (firebaseUser) => {
        if (!active) return;

        setLoading(true);
        setAuthError(null);
        setUser(firebaseUser);

        try {
          if (!firebaseUser) {
            setProfile(null);
            setAccessStatus("UNAUTHENTICATED");
            return;
          }

          const membership = await provisionMembership(firestore, firebaseUser);
          if (!active) return;

          setProfile(membership);
          setAccessStatus(membership.status);
        } catch (error) {
          if (!active) return;
          setProfile(null);
          setAccessStatus("ERROR");
          setAuthError(
            error instanceof Error ? error : new Error("Unable to load the membership profile."),
          );
        } finally {
          if (active) setLoading(false);
        }
      },
      (error) => {
        if (!active) return;
        setUser(null);
        setProfile(null);
        setAccessStatus("ERROR");
        setAuthError(error);
        setLoading(false);
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    console.debug("[Auth] login called, auth =", auth);
    if (!auth) {
      console.error("[Auth] Firebase auth is null — isFirebaseConfigured =", isFirebaseConfigured);
      throw new Error(
        "Firebase no configurado: faltan variables de entorno VITE_FIREBASE_* en el build.",
      );
    }
    await signInWithEmailAndPassword(auth, email, password);
  };

  const register = async (email: string, password: string, displayName: string) => {
    if (!auth || !db) throw new Error("Firebase is not configured.");
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(result.user, { displayName });
    // The auth listener provisions the ACTIVE membership in parallel; this
    // second pass mirrors the display name that updateProfile just resolved.
    await provisionMembership(db, result.user);
  };

  const loginWithGoogle = async () => {
    if (!auth) throw new Error("Firebase is not configured.");
    await signInWithPopup(auth, googleProvider);
  };

  const logout = async () => {
    if (!auth) return;
    await signOut(auth);
  };

  const hasRole = (roles: string[]) => {
    return accessStatus === "ACTIVE" && profile
      ? roles.some((role) => rolesMatch(profile.role, role))
      : false;
  };

  const canAccessWarehouse = (warehouseId: string) => {
    return canAccessWarehouseForProfile(accessStatus, profile, warehouseId);
  };

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
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
