import { describe, expect, it } from "vitest"
import { computeRequestStage } from "./asset.stage"

// Pure — no Prisma, no Express — so these need no mocks, following the
// asset.status.ts and cost.derive.ts precedent.
describe("computeRequestStage", () => {
  it("reads a pending request as awaiting approval", () => {
    expect(computeRequestStage({ kind: "NEW_ITEM", status: "PENDING", repairReturnedAt: null }))
      .toBe("AWAITING_APPROVAL")
  })

  it("reads an approved repair with an open repair as IN_REPAIR", () => {
    // The in-flight tracking for a repair lives in AssetRepair, which already
    // knows sentAt and returnedAt. The stage reads it rather than storing a
    // second copy.
    expect(computeRequestStage({ kind: "REPAIR", status: "APPROVED", repairReturnedAt: null }))
      .toBe("IN_REPAIR")
  })

  it("reads an approved return as awaiting collection", () => {
    expect(computeRequestStage({ kind: "RETURN", status: "APPROVED", repairReturnedAt: null }))
      .toBe("AWAITING_COLLECTION")
  })

  it("reads an ordered request as ORDERED", () => {
    expect(computeRequestStage({ kind: "NEW_ITEM", status: "ORDERED", repairReturnedAt: null }))
      .toBe("ORDERED")
  })

  it("reads every terminal status straight through", () => {
    expect(computeRequestStage({ kind: "NEW_ITEM", status: "FULFILLED", repairReturnedAt: null })).toBe("DONE")
    expect(computeRequestStage({ kind: "NEW_ITEM", status: "REJECTED", repairReturnedAt: null })).toBe("REJECTED")
    expect(computeRequestStage({ kind: "NEW_ITEM", status: "CANCELLED", repairReturnedAt: null })).toBe("CANCELLED")
  })
})