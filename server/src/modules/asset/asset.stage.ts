/**
 * What stage a request has reached, derived on read and never stored.
 *
 * The same rule `asset.status.ts` applies to asset status and `cost.derive.ts`
 * applies to overdue bills: a stored stage needs a job to keep it true and
 * drifts the moment nobody runs it. Deriving makes that class of stale data
 * unreachable.
 *
 * Pure — no Prisma, no Express — so its tests need no mocks.
 */

import type { AssetRequestKind, AssetRequestStatus } from "../../generated/prisma/client"

export type RequestStage =
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "ORDERED"
  | "IN_REPAIR"
  | "AWAITING_COLLECTION"
  | "DONE"
  | "REJECTED"
  | "CANCELLED"

export interface StageInput {
  kind: AssetRequestKind
  status: AssetRequestStatus
  /** Null while the repair is still open. Ignored for other kinds. */
  repairReturnedAt: Date | null
}

export function computeRequestStage(request: StageInput): RequestStage {
  switch (request.status) {
    case "PENDING":
      return "AWAITING_APPROVAL"
    case "REJECTED":
      return "REJECTED"
    case "CANCELLED":
      return "CANCELLED"
    case "FULFILLED":
      return "DONE"
    case "ORDERED":
      return "ORDERED"
    case "APPROVED":
      // Approval is not completion for any kind, and what happens next
      // differs: a repair has gone to the vendor, a return is waiting for
      // somebody to catch it, a new item is waiting to be sourced.
      if (request.kind === "REPAIR" && request.repairReturnedAt === null) return "IN_REPAIR"
      if (request.kind === "RETURN") return "AWAITING_COLLECTION"
      return "APPROVED"
  }
}