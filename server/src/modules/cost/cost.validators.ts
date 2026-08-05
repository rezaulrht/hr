import { z } from "zod"

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date")
const currency = z.enum(["BDT", "USD"])

/** Evaluated per-parse, not at module load, so a long-running server does not go stale across a year boundary. */
const periodYearSchema = z
  .coerce.number()
  .int()
  .min(2000)
  .refine((year) => year <= new Date().getUTCFullYear() + 1, {
    message: "periodYear cannot be more than one year ahead of the current year",
  })

export const createCostCategorySchema = z.object({
  code: z.string().trim().regex(/^[A-Z_]+$/, "Use upper-case letters and underscores").max(40),
  name: z.string().trim().min(1).max(100),
})

export const updateCostCategorySchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
})

export const createCommitmentSchema = z.object({
  categoryId: z.string().uuid(),
  label: z.string().trim().min(1, "A label is required").max(200),
  payee: z.string().trim().min(1, "A payee is required").max(200),
  amount: z.coerce.number().min(0).optional(),
  currency: currency.optional(),
  dueDay: z.coerce.number().int().min(1).max(31).optional(),
  startedOn: isoDate,
  notes: z.string().trim().max(2000).optional(),
})

export const updateCommitmentSchema = z.object({
  label: z.string().trim().min(1, "A label is required").max(200).optional(),
  payee: z.string().trim().min(1, "A payee is required").max(200).optional(),
  amount: z.coerce.number().min(0).nullable().optional(),
  currency: currency.optional(),
  dueDay: z.coerce.number().int().min(1).max(31).nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
  // Ends a commitment. Never a delete — the bills it explains still exist.
  endedOn: isoDate.nullable().optional(),
})

export const createCostSchema = z.object({
  categoryId: z.string().uuid(),
  commitmentId: z.string().uuid().optional(),
  label: z.string().trim().min(1, "A label is required").max(200),
  payee: z.string().trim().min(1, "A payee is required").max(200),
  periodMonth: z.coerce.number().int().min(1).max(12),
  periodYear: periodYearSchema,
  amount: z.coerce.number().min(0),
  currency: currency.optional(),
  dueDate: isoDate.optional(),
  notes: z.string().trim().max(2000).optional(),
})

// The period a bill is FOR and the commitment it is linked to are set once,
// at creation — changing either after the fact is a different bill, not an
// edit of this one.
export const updateCostSchema = z.object({
  categoryId: z.string().uuid().optional(),
  label: z.string().trim().min(1, "A label is required").max(200).optional(),
  payee: z.string().trim().min(1, "A payee is required").max(200).optional(),
  amount: z.coerce.number().min(0).optional(),
  currency: currency.optional(),
  dueDate: isoDate.nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
})

export const payCostSchema = z.object({
  paidAt: isoDate.optional(),
  paymentRef: z.string().trim().max(200).optional(),
})

export const listCostsQuery = z.object({
  year: z.coerce.number().int().min(2000).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  categoryId: z.string().uuid().optional(),
  status: z.enum(["PENDING", "PAID"]).optional(),
})

export const listCommitmentsQuery = z.object({
  active: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
})

export const summaryQuery = z.object({
  year: z.coerce.number().int().min(2000),
  month: z.coerce.number().int().min(1).max(12),
})

export type CreateCostCategoryInput = z.infer<typeof createCostCategorySchema>
export type UpdateCostCategoryInput = z.infer<typeof updateCostCategorySchema>
export type CreateCommitmentInput = z.infer<typeof createCommitmentSchema>
export type UpdateCommitmentInput = z.infer<typeof updateCommitmentSchema>
export type CreateCostInput = z.infer<typeof createCostSchema>
export type UpdateCostInput = z.infer<typeof updateCostSchema>
export type PayCostInput = z.infer<typeof payCostSchema>
export type ListCostsQuery = z.infer<typeof listCostsQuery>
export type ListCommitmentsQuery = z.infer<typeof listCommitmentsQuery>
export type SummaryQuery = z.infer<typeof summaryQuery>
