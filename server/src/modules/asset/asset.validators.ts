import { z } from "zod"

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date")

export const createAssetSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  assetTag: z.string().trim().min(1).max(50).optional(),
  serialNumber: z.string().trim().min(1).max(100).optional(),
  model: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(2000).optional(),
  purchaseDate: isoDate.optional(),
  purchaseCost: z.coerce.number().min(0).optional(),
  currency: z.enum(["BDT", "USD"]).optional(),
  vendor: z.string().trim().max(200).optional(),
  warrantyExpiry: isoDate.optional(),
  departmentId: z.string().uuid().optional(),
  location: z.string().trim().max(200).optional(),
})

export const updateAssetSchema = createAssetSchema.partial()

// A note is required, not optional. Retiring an asset is a write-off and
// marking one lost is an accusation; neither should be possible without a
// sentence saying why.
export const lifecycleSchema = z.object({
  note: z.string().trim().min(1, "A note is required").max(1000),
})

export const createCategorySchema = z.object({
  code: z.string().trim().regex(/^[A-Z_]+$/, "Use upper-case letters and underscores").max(40),
  name: z.string().trim().min(1).max(100),
  requiresSerial: z.boolean().optional(),
  isConsumable: z.boolean().optional(),
  usefulLifeMonths: z.coerce.number().int().min(1).nullable().optional(),
})

export const updateCategorySchema = createCategorySchema.partial().omit({ code: true })

export type CreateAssetInput = z.infer<typeof createAssetSchema>
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>
