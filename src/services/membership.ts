import { getFunctions, httpsCallable } from "firebase/functions"
import type { MembershipRole, MembershipStatus } from "@/schemas/membership"

export interface UpdateMembershipInput {
  targetUid: string
  role: MembershipRole
  status: MembershipStatus
  warehouseId?: string | null
  operationId?: string
}

/** Membership mutations are backend-only; this wrapper never writes Firestore directly. */
export async function updateMembership(
  input: UpdateMembershipInput,
): Promise<void> {
  const operationId = input.operationId || crypto.randomUUID()
  const update = httpsCallable(getFunctions(), "update_membership")
  try {
    await update({ ...input, operationId })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Membership update failed"
    throw new Error(`Authorized membership update failed: ${message}`)
  }
}
