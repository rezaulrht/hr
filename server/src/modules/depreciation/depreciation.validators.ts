import { z } from "zod"

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date")
const money = z.string().regex(/^\d+(\.\d{1,2})?$/, "Expected a non-negative amount")

export const draftRunSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
})
export type DraftRunInput = z.infer<typeof draftRunSchema>

export const runQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  status: z.enum(["DRAFT", "POSTED", "REVERSED"]).optional(),
})

export const preflightQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
})

export const reverseRunSchema = z.object({
  reason: z.string().trim().min(1, "Give a reason for the reversal").max(1000),
})
export type ReverseRunInput = z.infer<typeof reverseRunSchema>

export const disposeSchema = z.object({
  proceeds: money.optional(),
  note: z.string().trim().max(1000).optional(),
})
export type DisposeInput = z.infer<typeof disposeSchema>

export const payAssetSchema = z.object({
  paidAt: isoDate.optional(),
})
export type PayAssetInput = z.infer<typeof payAssetSchema>

export const valueReportQuerySchema = z.object({
  asOf: isoDate.optional(),
  categoryId: z.string().uuid().optional(),
})
