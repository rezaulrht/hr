import { describe, expect, it } from "vitest"

import { computeBlockers } from "./employee.blockers"

const complete = {
  salaryStructureId: "ss-1",
  bankAccountNumber: "0011223344",
  bankRoutingNumber: "060270425",
  nationalId: "1234567890",
  emergencyContact: "Mother +8801711111111",
} as any

describe("computeBlockers", () => {
  it("returns nothing for a complete record", () => {
    expect(computeBlockers(complete, ["CONTRACT", "NID"])).toEqual([])
  })

  it("names what a missing salary structure blocks, not what is empty", () => {
    // "72% complete" is acted on by nobody. "Payroll will refuse to process
    // this person" gets fixed the same day.
    const result = computeBlockers({ ...complete, salaryStructureId: null }, ["CONTRACT", "NID"])
    expect(result).toEqual([
      { field: "salaryStructureId", blocks: "Payroll runs cannot process this employee" },
    ])
  })

  it("reports a missing routing number as a bank-file blocker", () => {
    const result = computeBlockers({ ...complete, bankRoutingNumber: null }, ["CONTRACT", "NID"])
    expect(result).toContainEqual({
      field: "bankRoutingNumber",
      blocks: "The BEFTN bank file will skip this employee",
    })
  })

  it("reports a missing account number separately from the routing number", () => {
    const result = computeBlockers(
      { ...complete, bankAccountNumber: null, bankRoutingNumber: null },
      ["CONTRACT", "NID"]
    )
    expect(result).toHaveLength(2)
  })

  it("reports a missing contract document", () => {
    expect(computeBlockers(complete, ["NID"])).toContainEqual({
      field: "CONTRACT",
      blocks: "No signed contract is on file",
    })
  })

  it("reports no national ID on record when both the field and the scan are missing", () => {
    expect(computeBlockers({ ...complete, nationalId: null }, ["CONTRACT"])).toContainEqual({
      field: "nationalId",
      blocks: "No national ID on record",
    })
  })

  it("accepts an NID scan in place of the nationalId field", () => {
    expect(computeBlockers({ ...complete, nationalId: null }, ["CONTRACT", "NID"])).toEqual([])
  })

  it("reports a missing emergency contact", () => {
    expect(computeBlockers({ ...complete, emergencyContact: null }, ["CONTRACT", "NID"])).toEqual([
      { field: "emergencyContact", blocks: "No emergency contact on record" },
    ])
  })

  it("does not report a missing blood group", () => {
    // Only fields whose absence stops a named operation appear. An empty blood
    // group stops nothing.
    expect(computeBlockers({ ...complete, bloodGroup: null }, ["CONTRACT", "NID"])).toEqual([])
  })
})
