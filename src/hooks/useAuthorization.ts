import { useAuth, type UserProfile } from "@/context/AuthContext";

/**
 * Central frontend authorization state. Firestore reads/writes must remain
 * disabled until membership resolution has completed with an ACTIVE profile.
 */
export function useAuthorization() {
  const authState = useAuth();
  const canQuery = !authState.loading && authState.accessStatus === "ACTIVE" && !!authState.profile;

  // Get user's accessible warehouse IDs from profile
  const warehouseIds = authState.profile?.warehouseIds ?? [];

  return {
    ...authState,
    canQuery,
    warehouseIds,
    hasAnyRole: (roles: UserProfile["role"][]) =>
      canQuery && roles.some((role) => authState.hasRole([role])),
    canAccessWarehouse: (warehouseId: string) =>
      canQuery && authState.profile ? warehouseIds.includes(warehouseId) : false,
  };
}

export function isPermissionDenied(error: unknown): boolean {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  return code === "permission-denied" || code.endsWith("/permission-denied");
}
