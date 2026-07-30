import { z } from "zod"

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date")

export const exitDetailsBody = z.object({
  lastWorkingDay: dateOnly,
  exitReason: z.enum([
    "RESIGNATION",
    "RETIREMENT",
    "TERMINATION",
    "DISMISSAL",
    "DISCHARGE",
    "RETRENCHMENT",
    "CONTRACT_END",
    "DEATH",
  ]),
  exitNote: z.string().max(1000).optional(),
})
export type ExitDetailsBody = z.infer<typeof exitDetailsBody>

/**
 * Every head is optional; a reason never is. An unexplained override on a
 * settlement is the one figure a dispute turns on.
 */
export const overrideSettlementBody = z
  .object({
    pendingSalary: z.coerce.number().min(0).optional(),
    gratuity: z.coerce.number().min(0).optional(),
    noticePay: z.coerce.number().min(0).optional(),
    expenseReimbursement: z.coerce.number().min(0).optional(),
    outstandingDeductions: z.coerce.number().min(0).optional(),
    reason: z.string().min(1, "A reason is required").max(500),
  })
  .refine(
    (b) =>
      b.pendingSalary !== undefined ||
      b.gratuity !== undefined ||
      b.noticePay !== undefined ||
      b.expenseReimbursement !== undefined ||
      b.outstandingDeductions !== undefined,
    { message: "Provide at least one head to override" }
  )
export type OverrideSettlementBody = z.infer<typeof overrideSettlementBody>

export const settlementRejectBody = z.object({
  note: z.string().min(1, "A note is required").max(1000),
})
export type SettlementRejectBody = z.infer<typeof settlementRejectBody>
