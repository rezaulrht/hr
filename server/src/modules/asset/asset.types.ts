import type { AssetCondition, AssetLifecycle } from "../../generated/prisma/client"

/**
 * What a read endpoint reports, as distinct from what is stored.
 *
 * `AssetLifecycle` has three values because those are the only states a
 * *person* decides. The other two are facts about whether an open row exists.
 */
// Spelled out rather than `AssetLifecycle | …`, because IN_SERVICE is a
// stored value that is never *presented* — an in-service asset reads as
// ASSIGNED or AVAILABLE. Widening to the enum would let a caller return a
// status computeAssetStatus can never produce.
export type AssetComputedStatus =
  | "RETIRED"
  | "LOST"
  | "IN_REPAIR"
  | "ASSIGNED"
  | "AVAILABLE"

/** The name `AssetListFilters` uses for the status query filter. */
export type AssetStatus = AssetComputedStatus

export interface HeldBy {
  assignmentId: string
  employeeId: string
  employeeCode: string
  fullName: string
  assignedAt: Date
  conditionOut: AssetCondition
  acknowledgedAt: Date | null
}

export interface StatusInput {
  lifecycle: AssetLifecycle
  /** The open assignment, if any. Null when nobody is holding it. */
  openAssignment: HeldBy | null
  hasOpenRepair: boolean
}
