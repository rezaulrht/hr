import { describe, expect, it } from "vitest"

import { visibilityTierFor, writableFieldsFor } from "./employee.access"
import type { AccessTokenPayload } from "../auth/auth.types"

function viewer(role: AccessTokenPayload["role"], sub = "u-viewer"): AccessTokenPayload {
  return { sub, role, email: "v@b.com", mustChangePassword: false }
}

const subject = { userId: "u-subject", reportingManagerId: "emp-manager" }

describe("visibilityTierFor", () => {
  it("returns SELF when the viewer is the subject", () => {
    expect(visibilityTierFor(viewer("EMPLOYEE", "u-subject"), subject, "emp-subject")).toBe("SELF")
  })

  it("returns SELF for a reporting manager viewing THEMSELVES, not MANAGER", () => {
    // Order matters: SELF is checked first, so a manager looking at their own
    // record gets the full self view rather than the narrower manager one.
    const own = { userId: "u-mgr", reportingManagerId: null }
    expect(visibilityTierFor(viewer("REPORTING_MANAGER", "u-mgr"), own, "emp-manager")).toBe("SELF")
  })

  it("returns FULL for SUPER_ADMIN and HR_ADMIN", () => {
    expect(visibilityTierFor(viewer("SUPER_ADMIN"), subject, null)).toBe("FULL")
    expect(visibilityTierFor(viewer("HR_ADMIN"), subject, null)).toBe("FULL")
  })

  it("returns FINANCE for a finance officer", () => {
    expect(visibilityTierFor(viewer("FINANCE_OFFICER"), subject, null)).toBe("FINANCE")
  })

  it("returns MANAGER for the subject's own reporting manager", () => {
    expect(visibilityTierFor(viewer("REPORTING_MANAGER"), subject, "emp-manager")).toBe("MANAGER")
  })

  it("returns COLLEAGUE for a DIFFERENT manager", () => {
    // The case a client-side rule gets wrong: a manager is not a manager of
    // everybody.
    expect(visibilityTierFor(viewer("REPORTING_MANAGER"), subject, "emp-other")).toBe("COLLEAGUE")
  })

  it("returns COLLEAGUE for an unrelated employee", () => {
    expect(visibilityTierFor(viewer("EMPLOYEE"), subject, "emp-other")).toBe("COLLEAGUE")
  })

  it("returns COLLEAGUE for a manager when the subject reports to nobody", () => {
    const orphan = { userId: "u-x", reportingManagerId: null }
    expect(visibilityTierFor(viewer("REPORTING_MANAGER"), orphan, "emp-manager")).toBe("COLLEAGUE")
  })
})

describe("writableFieldsFor", () => {
  it("gives SELF exactly the five self-editable text fields", () => {
    // profilePicture is NOT here: it goes through PATCH /:id/avatar, because
    // it takes a Cloudinary publicId that must be verified first.
    expect([...writableFieldsFor("SELF")].sort()).toEqual([
      "bloodGroup",
      "emergencyContact",
      "maritalStatus",
      "phone",
      "presentAddress",
    ])
  })

  it("gives FULL the self fields plus the HR-only ones", () => {
    const full = writableFieldsFor("FULL")
    expect(full.has("phone")).toBe(true)
    expect(full.has("nationalId")).toBe(true)
    expect(full.has("bankRoutingNumber")).toBe(true)
    expect(full.has("permanentAddress")).toBe(true)
    expect(full.has("shiftId")).toBe(true)
    expect(full.has("deviceUserId")).toBe(true)
  })

  it("never lets anyone write an immutable or separately-owned field", () => {
    for (const tier of ["SELF", "FULL", "FINANCE", "MANAGER", "COLLEAGUE"] as const) {
      const fields = writableFieldsFor(tier)
      for (const forbidden of [
        "id",
        "userId",
        "employeeCode",
        "role",
        "email",
        "salaryStructureId",
        "lastWorkingDay",
        "exitReason",
        "exitNote",
        "employmentStatus",
        "profilePicture",
      ]) {
        expect(fields.has(forbidden)).toBe(false)
      }
    }
  })

  it("gives FINANCE, MANAGER and COLLEAGUE empty write sets", () => {
    // Finance reads bank details to chase them; it does not author them, for
    // the same separation-of-duty reason setSalaryStructure documents.
    expect(writableFieldsFor("FINANCE").size).toBe(0)
    expect(writableFieldsFor("MANAGER").size).toBe(0)
    expect(writableFieldsFor("COLLEAGUE").size).toBe(0)
  })
})
