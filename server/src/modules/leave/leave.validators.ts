import { z } from "zod"

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date")

export const applyLeaveSchema = z.object({
  leaveTypeId: z.string().min(1),
  startDate: dateOnly,
  endDate: dateOnly,
  reason: z.string().max(500).optional(),
})
export type ApplyLeaveBody = z.infer<typeof applyLeaveSchema>

export const decisionNoteSchema = z.object({
  note: z.string().min(1, "A note is required").max(500),
})
export type DecisionNoteBody = z.infer<typeof decisionNoteSchema>
