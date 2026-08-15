import type { DepreciationRunStatus } from "@/lib/api/types"

export const RUN_STATUS_LABEL: Record<DepreciationRunStatus, string> = {
  DRAFT: "Draft",
  POSTED: "Posted",
  REVERSED: "Reversed",
}

export const RUN_STATUS_TONE: Record<DepreciationRunStatus, "neutral" | "green" | "yellow"> = {
  DRAFT: "yellow",
  POSTED: "green",
  REVERSED: "neutral",
}
