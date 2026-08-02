import { describe, expect, it } from "vitest"

import { applyLeaveSchema } from "./leave.validators"

const base = { leaveTypeId: "lt-1", startDate: "2026-09-07", endDate: "2026-09-07" }

describe("applyLeaveSchema sessions", () => {
  it("defaults to a whole day when sessions are omitted", () => {
    const parsed = applyLeaveSchema.parse(base)
    expect(parsed.startSession).toBe("FIRST_HALF")
    expect(parsed.endSession).toBe("SECOND_HALF")
  })

  it("accepts a morning half on a single day", () => {
    const parsed = applyLeaveSchema.parse({
      ...base,
      startSession: "FIRST_HALF",
      endSession: "FIRST_HALF",
    })
    expect(parsed.endSession).toBe("FIRST_HALF")
  })

  it("accepts an afternoon half on a single day", () => {
    const parsed = applyLeaveSchema.parse({
      ...base,
      startSession: "SECOND_HALF",
      endSession: "SECOND_HALF",
    })
    expect(parsed.startSession).toBe("SECOND_HALF")
  })

  it("rejects an inverted pair, which describes no duration", () => {
    const result = applyLeaveSchema.safeParse({
      ...base,
      startSession: "SECOND_HALF",
      endSession: "FIRST_HALF",
    })
    expect(result.success).toBe(false)
    expect(JSON.stringify(result.error?.issues)).toContain("second half")
  })

  it("rejects a half on a multi-day range in this phase", () => {
    const result = applyLeaveSchema.safeParse({
      ...base,
      endDate: "2026-09-09",
      startSession: "SECOND_HALF",
      endSession: "SECOND_HALF",
    })
    expect(result.success).toBe(false)
    expect(JSON.stringify(result.error?.issues)).toContain("single day")
  })

  it("still accepts a multi-day whole-day range", () => {
    const parsed = applyLeaveSchema.parse({ ...base, endDate: "2026-09-09" })
    expect(parsed.endDate).toBe("2026-09-09")
  })

  it("rejects an unknown session value", () => {
    expect(applyLeaveSchema.safeParse({ ...base, startSession: "MORNING" }).success).toBe(false)
  })
})
