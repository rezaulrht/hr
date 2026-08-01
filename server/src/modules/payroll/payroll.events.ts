/**
 * How the payroll lifecycle reads in a feed.
 *
 * **No figures in `title` or `meta` for a payslip or a settlement.** "Your
 * June payslip is ready", never the amount. A feed is on screen in an
 * open-plan office and over a shoulder on a train; the number stays behind
 * the authorisation the payslip endpoint already enforces. `payload` carries
 * ids and dates, so a later email template has the facts without the feed
 * having leaked them.
 *
 * Run-level events carry no amounts either, for a different reason: the
 * company's monthly wage bill is not a number that belongs on a dashboard
 * card that Finance shares in a standup.
 */

import type { EventInput } from "../event/event.types"

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

/** "June 2026". */
export const monthName = (month: number, year: number) =>
  `${MONTH_NAMES[month - 1] ?? month} ${year}`

type RunStage = "created" | "processed" | "submitted" | "approved" | "rejected" | "disbursed"

const RUN_COPY: Record<RunStage, { title: (label: string) => string; severity: EventInput["severity"] }> = {
  created: { title: (l) => `${l} payroll run created`, severity: "INFO" },
  processed: { title: (l) => `${l} payroll processed`, severity: "INFO" },
  // WARNING is the one that means *somebody now has to act*, and it is what
  // the Super Admin's "Awaiting your approval" card counts.
  submitted: { title: (l) => `${l} payroll submitted for approval`, severity: "WARNING" },
  approved: { title: (l) => `${l} payroll approved`, severity: "SUCCESS" },
  rejected: { title: (l) => `${l} payroll returned to draft`, severity: "WARNING" },
  disbursed: { title: (l) => `${l} payroll disbursed`, severity: "SUCCESS" },
}

interface RunArgs {
  stage: RunStage
  runId: string
  month: number
  year: number
  actorUserId: string
  meta?: string | null
}

export function payrollRunEvent(args: RunArgs): EventInput {
  const label = monthName(args.month, args.year)
  const copy = RUN_COPY[args.stage]
  return {
    type: `payroll.run.${args.stage}` as EventInput["type"],
    severity: copy.severity,
    actorUserId: args.actorUserId,
    entity: "PAYROLL_RUN",
    entityId: args.runId,
    // The two roles that act on a run. Nobody is the "subject" of a payroll
    // run, so there is no reporting line to resolve.
    targetRoles: ["FINANCE_OFFICER", "SUPER_ADMIN"],
    title: copy.title(label),
    meta: args.meta ?? null,
    href: "/payroll",
    payload: { month: args.month, year: args.year, stage: args.stage },
  }
}

interface PayslipArgs {
  payslipId: string
  employeeId: string
  month: number
  year: number
  actorUserId: string
}

/**
 * One event per employee, and that is **not** a violation of the bulk rule.
 *
 * The rule is one event per *recipient-meaningful action*: approving a run is
 * one thing Finance did, but "your payslip is ready" is N separate things
 * that happened to N people, each of whom needs to be told exactly once.
 */
export function payslipPublishedEvent(args: PayslipArgs): EventInput {
  return {
    type: "payslip.published",
    severity: "SUCCESS",
    actorUserId: args.actorUserId,
    entity: "PAYSLIP",
    entityId: args.payslipId,
    subjectEmployeeId: args.employeeId,
    // Explicitly null, not omitted. Payroll's own rule is that a manager may
    // not see their reports' payslips, so letting emitEvent resolve the
    // reporting line here would route pay information to someone the payslip
    // endpoint refuses.
    managerEmployeeId: null,
    title: `Your ${monthName(args.month, args.year)} payslip is ready`,
    href: "/payroll",
    payload: { payslipId: args.payslipId, month: args.month, year: args.year },
  }
}
