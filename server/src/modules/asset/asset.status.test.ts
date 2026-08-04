import { describe, expect, it } from "vitest"

import { computeAssetStatus } from "./asset.status"
import type { HeldBy } from "./asset.types"

const holder: HeldBy = {
  assignmentId: "asg-1",
  employeeId: "emp-1",
  employeeCode: "BS-EMP-00001",
  fullName: "Ayesha Rahman",
  assignedAt: new Date("2026-07-01T00:00:00.000Z"),
  conditionOut: "GOOD",
  acknowledgedAt: null,
}

describe("computeAssetStatus", () => {
  it("reports AVAILABLE when nothing is open", () => {
    expect(
      computeAssetStatus({ lifecycle: "IN_SERVICE", openAssignment: null, hasOpenRepair: false })
    ).toEqual({ status: "AVAILABLE", heldBy: null })
  })

  it("reports ASSIGNED with the holder when an assignment is open", () => {
    expect(
      computeAssetStatus({ lifecycle: "IN_SERVICE", openAssignment: holder, hasOpenRepair: false })
    ).toEqual({ status: "ASSIGNED", heldBy: holder })
  })

  it("reports IN_REPAIR over ASSIGNED but KEEPS the holder", () => {
    // A repair may overlap an assignment: the employee still has the machine
    // on their record, it goes to the vendor for a week, it comes back to
    // them. Collapsing that to one word loses the fact that a named person is
    // still responsible, which is the question the register exists to answer.
    expect(
      computeAssetStatus({ lifecycle: "IN_SERVICE", openAssignment: holder, hasOpenRepair: true })
    ).toEqual({ status: "IN_REPAIR", heldBy: holder })
  })

  it("reports IN_REPAIR with no holder when nobody has it", () => {
    expect(
      computeAssetStatus({ lifecycle: "IN_SERVICE", openAssignment: null, hasOpenRepair: true })
    ).toEqual({ status: "IN_REPAIR", heldBy: null })
  })

  it("reports LOST over IN_REPAIR and ASSIGNED", () => {
    expect(
      computeAssetStatus({ lifecycle: "LOST", openAssignment: holder, hasOpenRepair: true })
    ).toEqual({ status: "LOST", heldBy: holder })
  })

  it("reports RETIRED over everything", () => {
    expect(
      computeAssetStatus({ lifecycle: "RETIRED", openAssignment: holder, hasOpenRepair: true })
    ).toEqual({ status: "RETIRED", heldBy: holder })
  })

  it("does not treat a closed assignment as custody", () => {
    // The caller passes null for a closed assignment; this asserts the
    // contract rather than re-deriving it, so a caller that starts passing
    // closed rows fails here rather than silently reporting a stale holder.
    expect(
      computeAssetStatus({ lifecycle: "IN_SERVICE", openAssignment: null, hasOpenRepair: false })
        .heldBy
    ).toBeNull()
  })
})
