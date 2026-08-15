/**
 * The exit checklist — open assignments plus pending recoveries for one
 * employee.
 *
 * **It warns and never blocks** (spec Decision 6). An unreturned laptop does
 * not block a settlement: the salary figure is right and the asset is a
 * separate debt. Hard-blocking would leave someone unpayable over a mislaid
 * charger, and withholding a statutory settlement as leverage over company
 * property is contentious in Bangladesh besides. Name the debt, price it,
 * deduct it, pay them.
 *
 * `isConsumable` categories are excluded — a mouse is issued and never
 * expected back.
 */

import prisma from "../../config/prisma"
import type { AssetRecovery } from "../../generated/prisma/client"
import { openAssignmentsFor, type OpenAssignment } from "./asset.assignments"
import { pendingRecoveriesFor } from "./asset.recoveries"

export interface ExitChecklist {
  employeeId: string
  openAssignments: OpenAssignment[]
  pendingRecoveries: AssetRecovery[]
  /** Informational. Never gates anything. */
  hasOutstanding: boolean
}

export async function exitChecklistFor(employeeId: string): Promise<ExitChecklist> {
  const [openAssignments, pendingRecoveries] = await Promise.all([
    openAssignmentsFor(employeeId),
    pendingRecoveriesFor(employeeId),
  ])

  return {
    employeeId,
    openAssignments,
    pendingRecoveries,
    hasOutstanding: openAssignments.length > 0 || pendingRecoveries.length > 0,
  }
}
