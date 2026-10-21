import { z } from "zod";
import { normalizeWarehouseId, WAREHOUSE_IDS } from "@/config/warehouses";

export const ROLE_VALUES = [
  "SUPER_ADMIN",
  "ADMIN",
  "GERENTE_ALMACEN",
  "AUXILIAR_ALMACENISTA",
  "AUDITOR",
  // Legacy values remain readable during migration.
  "OPERATOR",
  "SUPERVISOR",
] as const;

export const membershipRoleSchema = z.enum(ROLE_VALUES);
export type MembershipRole = z.infer<typeof membershipRoleSchema>;

export const membershipStatusSchema = z.enum(["ACTIVE", "INACTIVE", "PENDING"]);
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;

export const membershipSchema = z
  .object({
    userId: z.string().min(1).max(128),
    organizationId: z.string().min(1).max(128),
    role: membershipRoleSchema,
    status: membershipStatusSchema,
    warehouseId: z.string().min(1).max(128).nullable().optional(),
    warehouseIds: z.array(z.string().min(1).max(128)).max(20).optional(),
  })
  .passthrough();

const LEGACY_ROLE_MAP: Record<MembershipRole, MembershipRole> = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  GERENTE_ALMACEN: "GERENTE_ALMACEN",
  AUXILIAR_ALMACENISTA: "AUXILIAR_ALMACENISTA",
  AUDITOR: "AUDITOR",
  OPERATOR: "AUXILIAR_ALMACENISTA",
  SUPERVISOR: "GERENTE_ALMACEN",
};

export function normalizeMembershipRole(role: MembershipRole): MembershipRole {
  return LEGACY_ROLE_MAP[role];
}

export function rolesMatch(actual: MembershipRole, expected: string): boolean {
  return normalizeMembershipRole(actual) === normalizeMembershipRole(expected as MembershipRole);
}

export function isGlobalMembershipRole(role: MembershipRole): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

export function normalizeMembershipWarehouses(value: {
  warehouseId?: string | null;
  warehouseIds?: string[];
}): string[] | null {
  const raw = value.warehouseIds?.length
    ? value.warehouseIds
    : value.warehouseId
      ? [value.warehouseId]
      : [];
  const normalized = [
    ...new Set(
      raw
        .map((id) => normalizeWarehouseId(id))
        .filter((id): id is NonNullable<ReturnType<typeof normalizeWarehouseId>> => id != null),
    ),
  ];
  return normalized.length ? normalized : null;
}

export function isCanonicalMembershipWarehouse(value: unknown): boolean {
  return typeof value === "string" && normalizeWarehouseId(value) != null;
}

export const CANONICAL_WAREHOUSE_IDS = Object.values(WAREHOUSE_IDS);
