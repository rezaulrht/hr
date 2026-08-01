/**
 * How a final settlement reads in a feed.
 *
 * **No amounts**, same rule as payslips. A settlement figure is the most
 * sensitive number this system holds — it is somebody's exit, often a
 * contested one — and a feed line is the wrong place for it.
 */

import type { EventInput } from "../event/event.types"

type SettlementStage = "calculated" | "approved" | "paid"

const COPY: Record<SettlementStage, { title: string; severity: EventInput["severity"] }> = {
  calculated: { title: "Final settlement calculated", severity: "INFO" },
  // The one that means somebody now has to pay it.
  approved: { title: "Final settlement approved", severity: "WARNING" },
  paid: { title: "Final settlement paid", severity: "SUCCESS" },
}

interface SettlementArgs {
  stage: SettlementStage
  settlementId: string
  settlementNo: string
  employeeId: string
  employeeName: string
  actorUserId: string
}

export function settlementEvent(args: SettlementArgs): EventInput {
  const copy = COPY[args.stage]
  return {
    type: `settlement.${args.stage}` as EventInput["type"],
    severity: copy.severity,
    actorUserId: args.actorUserId,
    entity: "SETTLEMENT",
    entityId: args.settlementId,
    subjectEmployeeId: args.employeeId,
    // Explicitly null: the leaver's manager has no part in the settlement
    // workflow, and their exit terms are not the manager's business.
    managerEmployeeId: null,
    targetRoles: ["FINANCE_OFFICER", "SUPER_ADMIN"],
    title: copy.title,
    meta: `${args.employeeName} · ${args.settlementNo}`,
    href: "/settlements",
    payload: { stage: args.stage, settlementNo: args.settlementNo },
  }
}
