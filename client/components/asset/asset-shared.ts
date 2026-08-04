import type {
  AssetComputedStatus,
  AssetCondition,
  AssetRequestStatus,
  Role,
} from "@/lib/api/types"

/**
 * Status tone, labels and the role predicates every asset component branches
 * on — kept in one place so no component re-derives them.
 */
export const STATUS_TONE: Record<AssetComputedStatus, string> = {
  AVAILABLE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  ASSIGNED: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  IN_REPAIR: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  LOST: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  RETIRED: "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300",
}

export const STATUS_LABEL: Record<AssetComputedStatus, string> = {
  AVAILABLE: "Available",
  ASSIGNED: "Assigned",
  IN_REPAIR: "In repair",
  LOST: "Lost",
  RETIRED: "Retired",
}

export const CONDITION_LABEL: Record<AssetCondition, string> = {
  NEW: "New",
  GOOD: "Good",
  FAIR: "Fair",
  DAMAGED: "Damaged",
}

export const REQUEST_STATUS_TONE: Record<AssetRequestStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  APPROVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  CANCELLED: "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300",
  FULFILLED: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
}

export const REQUEST_STATUS_LABEL: Record<AssetRequestStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  FULFILLED: "Fulfilled",
}

export const canManageAssets = (role: Role) => role === "HR_ADMIN" || role === "SUPER_ADMIN"
export const canDispose = (role: Role) =>
  role === "HR_ADMIN" || role === "SUPER_ADMIN" || role === "FINANCE_OFFICER"
export const isStaff = (role: Role) => role === "EMPLOYEE" || role === "REPORTING_MANAGER"

/** "Aug 10, 2026" — a table cell needs the year; leave's SHORT_DATE does not. */
export function formatAssetDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}
