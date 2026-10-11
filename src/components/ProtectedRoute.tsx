import { Navigate, useLocation } from "react-router-dom"
import { useAuth, type UserProfile } from "@/context/AuthContext"
import type { ReactNode } from "react"

interface ProtectedRouteProps {
  children: ReactNode
  allowedRoles?: UserProfile["role"][]
  requiredWarehouseId?: string
}

export function ProtectedRoute({
  children,
  allowedRoles,
  requiredWarehouseId,
}: ProtectedRouteProps) {
  const location = useLocation()
  const { user, profile, loading, accessStatus, hasRole, canAccessWarehouse } =
    useAuth()

  if (loading) {
    return (
      <div role="status" aria-live="polite">
        Verificando acceso…
      </div>
    )
  }

  if (!user || accessStatus === "UNAUTHENTICATED") {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: `${location.pathname}${location.search}${location.hash}`,
        }}
      />
    )
  }

  if (accessStatus !== "ACTIVE" || !profile) {
    return <Navigate to="/unauthorized" replace />
  }

  if (allowedRoles?.length && !hasRole(allowedRoles)) {
    return <Navigate to="/unauthorized" replace />
  }

  if (requiredWarehouseId && !canAccessWarehouse(requiredWarehouseId)) {
    return <Navigate to="/unauthorized" replace />
  }

  return <>{children}</>
}
