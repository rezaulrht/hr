import { z } from "zod"

export const eventQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
  entity: z.string().max(64).optional(),
  entityId: z.string().max(64).optional(),
  severity: z.enum(["INFO", "SUCCESS", "WARNING", "ERROR"]).optional(),
})
export type EventQuery = z.infer<typeof eventQuery>
