import { z } from "zod"

/**
 * The whole API surface: a date range.
 *
 * Presets — Month, Quarter, Half-year, Year — are resolved client-side and
 * arrive here as from/to. A quarter is relative to the financial year's start
 * month, and the client already holds the financial-year list to render the
 * picker; putting a preset vocabulary here would mean the server had to look
 * the year up again to resolve the word "Q2".
 *
 * The five-year ceiling and the from ≤ to rule live in
 * `assertValidRange`, so the builders enforce them whether they are called
 * over HTTP or not.
 */
export const rangeQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
})

export type RangeQuery = z.infer<typeof rangeQuerySchema>

const noteRef = z.string().regex(/^\d{1,2}(\.\d{1,2}){1,2}$/, 'A note number looks like "2.08" or "2.11.3"')
const trimmed = (min: number, message: string) => z.string().transform((s) => s.trim()).pipe(z.string().min(min, message))
export const createPolicyNoteSchema = z.object({ ref: noteRef, title: trimmed(1, "Give the note a title"), body: z.string(), sortOrder: z.coerce.number().int().min(0).optional() })
export type CreatePolicyNoteInput = z.infer<typeof createPolicyNoteSchema>
export const updatePolicyNoteSchema = z.object({ ref: noteRef.optional(), title: trimmed(1, "Give the note a title").optional(), body: z.string().optional(), sortOrder: z.coerce.number().int().min(0).optional() })
export type UpdatePolicyNoteInput = z.infer<typeof updatePolicyNoteSchema>
