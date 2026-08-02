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
