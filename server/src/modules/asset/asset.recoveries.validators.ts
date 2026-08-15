import { z } from "zod"

const money = z.string().regex(/^\d+(\.\d{1,2})?$/, "Expected a non-negative amount")

export const createRecoverySchema = z.object({
  assetId: z.string().uuid(),
  employeeId: z.string().uuid(),
  assignmentId: z.string().uuid().optional(),
  kind: z.enum(["NOT_RETURNED", "DAMAGED", "LOST"]).optional(),
  amount: money,
  currency: z.enum(["BDT", "USD"]).optional(),
  reason: z.string().trim().min(1, "A reason is required").max(1000),
})
export type CreateRecoveryBody = z.infer<typeof createRecoverySchema>

export const updateRecoverySchema = z
  .object({
    amount: money.optional(),
    currency: z.enum(["BDT", "USD"]).optional(),
    reason: z.string().trim().min(1, "A reason is required").max(1000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update")
export type UpdateRecoveryBody = z.infer<typeof updateRecoverySchema>

export const waiveRecoverySchema = z.object({
  waiverReason: z.string().trim().min(1, "A waiver reason is required").max(1000),
})
export type WaiveRecoveryBody = z.infer<typeof waiveRecoverySchema>

export const recoveryQuerySchema = z.object({
  employeeId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  status: z.enum(["PENDING", "RECOVERED", "WAIVED"]).optional(),
})
export type RecoveryQuery = z.infer<typeof recoveryQuerySchema>
