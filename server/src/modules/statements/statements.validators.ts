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
