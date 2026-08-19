import type {
  Asset,
  AssetComputedStatus,
  AssetCondition,
  AssetRecoveryKind,
  AssetRecoveryStatus,
  AssetRequestStage,
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
  ORDERED: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  CANCELLED: "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300",
  FULFILLED: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
}

export const REQUEST_STATUS_LABEL: Record<AssetRequestStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  ORDERED: "Ordered",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  FULFILLED: "Fulfilled",
}

/**
 * The stage a request has reached, which is what a reader actually wants.
 *
 * Preferred over `REQUEST_STATUS_LABEL` everywhere a person reads a row:
 * `status` is the stored column and says "Approved" for a laptop nobody has
 * bought, a machine at the repairer, and a monitor waiting to be collected.
 * `stage` is derived server-side (`asset.stage.ts`) and tells those apart.
 */
export const REQUEST_STAGE_LABEL: Record<AssetRequestStage, string> = {
  AWAITING_APPROVAL: "Awaiting approval",
  APPROVED: "Approved",
  ORDERED: "Ordered",
  IN_REPAIR: "At the repairer",
  AWAITING_COLLECTION: "Awaiting collection",
  DONE: "Done",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
}

export const REQUEST_STAGE_TONE: Record<AssetRequestStage, string> = {
  AWAITING_APPROVAL: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  APPROVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  ORDERED: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
  IN_REPAIR: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  AWAITING_COLLECTION: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
  DONE: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  CANCELLED: "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300",
}

/**
 * Still waiting on somebody. Drives the tab counts and the employee list's
 * split, so a count means "needs attention" rather than "rows in this tab" —
 * a number that includes closed rows only ever grows, and then nobody reads it.
 */
export function isRequestOpen(stage: AssetRequestStage): boolean {
  return stage !== "DONE" && stage !== "REJECTED" && stage !== "CANCELLED"
}

/** How many units of a category are free to hand over right now. */
export function availableOf(assets: Asset[], categoryId: string | null | undefined): number {
  if (!categoryId) return 0
  return assets.filter((a) => a.status === "AVAILABLE" && a.category?.id === categoryId).length
}

/**
 * Where an asset has got to on the ledger: on the balance sheet yet, and paid
 * for yet. Three states, because those are the only three a person acts on —
 * Capitalise, then Pay, then nothing.
 *
 * A function rather than two booleans at the call site, because the two facts
 * were read wrong once and nothing caught it: `capitalisedAt !== undefined` is
 * true of the null the server actually sends, so every asset read as
 * capitalised, the Capitalise button was never rendered and Pay 409'd. Neither
 * `tsc` nor this project's ESLint config flags that comparison — no type-aware
 * rules are enabled — and there is no client test runner. Reading the field in
 * exactly one place is the guard.
 *
 * `capitalisedAt` is nullable-and-present; `paid` is genuinely absent for roles
 * that cannot see costs. Two different shapes, hence two different tests.
 */
export type LedgerState = "NOT_CAPITALISED" | "CAPITALISED_UNPAID" | "PAID"

export function ledgerStateOf(asset: Asset): LedgerState {
  if (asset.capitalisedAt == null) return "NOT_CAPITALISED"
  return asset.paid === true ? "PAID" : "CAPITALISED_UNPAID"
}

export const LEDGER_STATE_LABEL: Record<LedgerState, string> = {
  NOT_CAPITALISED: "Not capitalised",
  CAPITALISED_UNPAID: "Capitalised, unpaid",
  PAID: "Paid",
}

export const LEDGER_STATE_TONE: Record<LedgerState, string> = {
  NOT_CAPITALISED: "bg-[#F1F4F8] text-[#5F6B7C]",
  CAPITALISED_UNPAID: "bg-amber-50 text-amber-700",
  PAID: "bg-emerald-50 text-emerald-700",
}

export const canManageAssets = (role: Role) => role === "HR_ADMIN" || role === "SUPER_ADMIN"
export const canDispose = (role: Role) =>
  role === "HR_ADMIN" || role === "SUPER_ADMIN" || role === "FINANCE_OFFICER"
export const isStaff = (role: Role) => role === "EMPLOYEE" || role === "REPORTING_MANAGER"

export const RECOVERY_KIND_LABEL: Record<AssetRecoveryKind, string> = {
  NOT_RETURNED: "Not returned",
  DAMAGED: "Damaged",
  LOST: "Lost",
}

export const RECOVERY_STATUS_LABEL: Record<AssetRecoveryStatus, string> = {
  PENDING: "Pending",
  RECOVERED: "Recovered",
  WAIVED: "Waived",
}

export const RECOVERY_STATUS_TONE: Record<AssetRecoveryStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  RECOVERED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  WAIVED: "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300",
}

/** "Aug 10, 2026". A table cell needs the year; leave's SHORT_DATE does not. */
export function formatAssetDate(iso: string | null): string {
  // "Not set" rather than a dash. This lands in a warranty-expiry field and
  // an expected-back column, where the absence is itself the answer: no
  // warranty on record, no date promised by the vendor.
  if (!iso) return "Not set"
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}
