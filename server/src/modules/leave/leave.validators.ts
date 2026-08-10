import { z } from "zod"

import { WHOLE_DAY } from "./leave.dates"

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date")

const session = z.enum(["FIRST_HALF", "SECOND_HALF"])

export const applyLeaveSchema = z
  .object({
    leaveTypeId: z.string().min(1),
    startDate: dateOnly,
    endDate: dateOnly,
    // Defaulted rather than optional so every downstream reader gets a
    // concrete pair and never has to re-derive "no sessions means whole day".
    startSession: session.default(WHOLE_DAY.startSession),
    endSession: session.default(WHOLE_DAY.endSession),
    reason: z.string().max(500).optional(),
  })
  .refine(
    (v) =>
      !(
        v.startDate === v.endDate &&
        v.startSession === "SECOND_HALF" &&
        v.endSession === "FIRST_HALF"
      ),
    {
      message:
        "A leave running from the second half of a day to the first half of the same day is not a duration",
      path: ["endSession"],
    }
  )
  .refine(
    (v) =>
      v.startDate === v.endDate ||
      (v.startSession === WHOLE_DAY.startSession && v.endSession === WHOLE_DAY.endSession),
    {
      // The storage and countChargedDays both handle range boundaries; only
      // this guard is narrow, so relaxing it later is a deletion.
      message: "Half-day leave can only be applied to a single day",
      path: ["endSession"],
    }
  )

export type ApplyLeaveBody = z.infer<typeof applyLeaveSchema>

export const decisionNoteSchema = z.object({
  note: z.string().min(1, "A note is required").max(500),
})
export type DecisionNoteBody = z.infer<typeof decisionNoteSchema>

const employmentType = z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"])

/** The field shapes, without defaults, so the update schema can reuse them. */
const leaveTypeFields = {
  name: z.string().trim().min(1, "A name is required").max(100),
  isPaid: z.boolean(),
  annualQuota: z.coerce.number().int().min(0).max(365),
  carryForwardPct: z.coerce.number().int().min(0).max(100),
  maxConsecutive: z.coerce.number().int().min(1).max(365).nullable(),
  allowsBackdating: z.boolean(),
  eligibleFor: z.array(employmentType).min(1, "Pick at least one employment type"),
  countsHolidays: z.boolean(),
  accrualBasis: z.enum(["PRO_RATED", "PER_EVENT", "EARNED", "NONE"]),
  minServiceMonths: z.coerce.number().int().min(0).max(120),
  maxAccrual: z.coerce.number().int().min(1).max(365).nullable(),
  allowsHalfDay: z.boolean(),
}

export const createLeaveTypeSchema = z.object({
  code: z.string().trim().regex(/^[A-Z_]+$/, "Use upper-case letters and underscores").max(40),
  ...leaveTypeFields,
  isPaid: leaveTypeFields.isPaid.default(true),
  carryForwardPct: leaveTypeFields.carryForwardPct.default(0),
  maxConsecutive: leaveTypeFields.maxConsecutive.default(null),
  allowsBackdating: leaveTypeFields.allowsBackdating.default(false),
  countsHolidays: leaveTypeFields.countsHolidays.default(false),
  accrualBasis: leaveTypeFields.accrualBasis.default("PRO_RATED"),
  minServiceMonths: leaveTypeFields.minServiceMonths.default(0),
  maxAccrual: leaveTypeFields.maxAccrual.default(null),
  allowsHalfDay: leaveTypeFields.allowsHalfDay.default(true),
})
export type CreateLeaveTypeInput = z.infer<typeof createLeaveTypeSchema>

/**
 * Built from the defaults-free field set, NOT from
 * `createLeaveTypeSchema.partial()`.
 *
 * `.partial()` makes a field optional but keeps its `.default()`, so a PATCH
 * carrying only `annualQuota` would also write every other field back to its
 * default — wiping a company-policy type's whole configuration, and tripping
 * the statutory guard on an edit the caller never made.
 *
 * `code` is absent entirely: it is immutable, matching every other coded
 * reference table. So is `statutory` — HR must not be able to mint a row that
 * then refuses its own correction.
 */
export const updateLeaveTypeSchema = z
  .object(leaveTypeFields)
  .partial()
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "Provide at least one field to update",
  })
export type UpdateLeaveTypeInput = z.infer<typeof updateLeaveTypeSchema>
