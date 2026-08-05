/**
 * The presented status of an asset.
 *
 * Only `AssetLifecycle` is stored, because only those three are decisions a
 * person makes. "Assigned" and "in repair" are facts about whether an open
 * row exists, and a stored `status: ASSIGNED` means somebody hands out a
 * laptop, forgets to flip the field, and the register lies with nothing able
 * to detect it. Deriving makes that class of bug unreachable.
 *
 * The precedence is:
 *
 *   RETIRED > LOST > IN_REPAIR > ASSIGNED > AVAILABLE
 *
 * and it deliberately does **not** collapse custody into one string.
 * `heldBy` is returned independently, so `{ status: "IN_REPAIR", heldBy: {…} }`
 * is a normal response rather than a contradiction.
 */

import type { StatusInput, AssetComputedStatus, HeldBy } from "./asset.types"

export function computeAssetStatus(input: StatusInput): {
  status: AssetComputedStatus
  heldBy: HeldBy | null
} {
  const heldBy = input.openAssignment

  if (input.lifecycle === "RETIRED") return { status: "RETIRED", heldBy }
  if (input.lifecycle === "LOST") return { status: "LOST", heldBy }
  if (input.hasOpenRepair) return { status: "IN_REPAIR", heldBy }
  if (heldBy) return { status: "ASSIGNED", heldBy }
  return { status: "AVAILABLE", heldBy: null }
}
