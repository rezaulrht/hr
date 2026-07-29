import { z } from "zod"

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date")
const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Expected an HH:mm office-local time")

export const dateRangeQuerySchema = z.object({
  from: dateOnly.optional(),
  to: dateOnly.optional(),
})
export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>

export const dailyQuerySchema = z.object({
  date: dateOnly.optional(),
})
export type DailyQuery = z.infer<typeof dailyQuerySchema>

export const monthQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
})
export type MonthQuery = z.infer<typeof monthQuerySchema>

export const yearQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
})
export type YearQuery = z.infer<typeof yearQuerySchema>

export const approvalsQuerySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "AUTO_APPROVED", "REJECTED"]).optional(),
  minAgingDays: z.coerce.number().int().min(0).max(365).optional(),
})
export type ApprovalsQuery = z.infer<typeof approvalsQuerySchema>

/**
 * The three write paths that set times all share a shape. Times are
 * office-local HH:mm — the client never sends an instant, because a browser
 * clock is spoofable and wrong the moment someone opens the app abroad.
 */
const timeAmendment = z.object({
  checkIn: timeOfDay.optional(),
  checkOut: timeOfDay.optional(),
  note: z.string().min(1, "A note is required").max(500),
})

const hasATime = (body: { checkIn?: string; checkOut?: string }) =>
  body.checkIn !== undefined || body.checkOut !== undefined

const AT_LEAST_ONE_TIME = {
  message: "Provide a check-in or check-out time",
  path: ["checkOut"],
}

/** The employee amending their own record. */
export const regulariseSchema = timeAmendment
  .extend({ note: z.string().min(1, "A reason is required").max(500) })
  .refine(hasATime, AT_LEAST_ONE_TIME)
export type RegulariseBody = z.infer<typeof regulariseSchema>

/** HR editing someone else's record. */
export const correctionSchema = timeAmendment.refine(hasATime, AT_LEAST_ONE_TIME)
export type CorrectionBody = z.infer<typeof correctionSchema>

/** HR entering a day that has no record at all. */
export const manualAttendanceSchema = timeAmendment
  .extend({ employeeId: z.string().min(1), date: dateOnly })
  .refine(hasATime, AT_LEAST_ONE_TIME)
export type ManualAttendanceBody = z.infer<typeof manualAttendanceSchema>

/** Approving needs no explanation; rejecting always does. */
export const approveSchema = z.object({
  note: z.string().max(500).optional(),
})
export type ApproveBody = z.infer<typeof approveSchema>

export const rejectSchema = z.object({
  note: z.string().min(1, "A reason is required").max(500),
})
export type RejectBody = z.infer<typeof rejectSchema>

export const bulkDecisionSchema = z
  .object({
    ids: z.array(z.string().min(1)).min(1, "Select at least one record").max(500),
    decision: z.enum(["APPROVE", "REJECT"]),
    note: z.string().max(500).optional(),
  })
  .refine((body) => body.decision === "APPROVE" || (body.note?.trim().length ?? 0) > 0, {
    message: "A reason is required when rejecting",
    path: ["note"],
  })
export type BulkDecisionBody = z.infer<typeof bulkDecisionSchema>

export const holidaySchema = z.object({
  name: z.string().min(1, "A name is required").max(200),
  date: dateOnly,
  type: z.enum(["GENERAL", "EXECUTIVE_ORDER", "OPTIONAL", "WORKING_DAY"]).default("GENERAL"),
})
export type HolidayBody = z.infer<typeof holidaySchema>

export const holidayUpdateSchema = holidaySchema.partial().refine(
  (body) => Object.values(body).some((value) => value !== undefined),
  { message: "Provide at least one field to update" }
)
export type HolidayUpdateBody = z.infer<typeof holidayUpdateSchema>
