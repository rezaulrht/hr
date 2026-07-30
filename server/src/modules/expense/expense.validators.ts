import { z } from "zod"

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date")

export const createClaimBody = z.object({
  amount: z.coerce.number().positive("amount must be greater than 0"),
  category: z.string().min(1).max(100),
  currency: z.enum(["BDT", "USD"]).default("BDT"),
  // When the money was spent — distinct from when it was claimed. You submit
  // a July taxi fare in August, and it must be judged on the July date.
  expenseDate: dateOnly,
  description: z.string().max(1000).optional(),
  receiptUrl: z.string().max(2000).optional(),
})
export type CreateClaimBody = z.infer<typeof createClaimBody>

/** A note is required on reject, matching leave and attendance. */
export const rejectClaimBody = z.object({
  note: z.string().min(1, "A note is required").max(1000),
})
export type RejectClaimBody = z.infer<typeof rejectClaimBody>

export const approveClaimBody = z.object({
  note: z.string().max(1000).optional(),
})
export type ApproveClaimBody = z.infer<typeof approveClaimBody>

export const claimQuery = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "REIMBURSED"]).optional(),
  employeeId: z.string().optional(),
})
export type ClaimQuery = z.infer<typeof claimQuery>
