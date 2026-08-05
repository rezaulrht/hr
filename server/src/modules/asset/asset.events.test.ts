import { describe, expect, it } from "vitest"

import {
  assetAcknowledgedEvent,
  assetAssignedEvent,
  assetImportedEvent,
  assetLifecycleEvent,
  assetRequestEvent,
  assetReturnedEvent,
} from "./asset.events"

describe("assetAssignedEvent", () => {
  it("addresses the holder and lets emitEvent resolve their manager", () => {
    const event = assetAssignedEvent({
      assetId: "ast-1",
      assetTag: "BS-AST-00042",
      assetName: "ThinkPad X1",
      employeeId: "emp-1",
      actorUserId: "user-hr",
      requestId: null,
    })

    expect(event.type).toBe("asset.assigned")
    expect(event.entity).toBe("ASSET")
    expect(event.entityId).toBe("ast-1")
    expect(event.subjectEmployeeId).toBe("emp-1")
    // managerEmployeeId is left undefined so emitEvent looks it up. An
    // explicit null would suppress the manager audience entirely.
    expect(event.managerEmployeeId).toBeUndefined()
    expect(event.targetRoles).toContain("HR_ADMIN")
  })

  it("carries the request id in the payload when it came from a request", () => {
    const event = assetAssignedEvent({
      assetId: "ast-1",
      assetTag: "BS-AST-00042",
      assetName: "ThinkPad X1",
      employeeId: "emp-1",
      actorUserId: "user-hr",
      requestId: "req-9",
    })

    expect(event.payload).toMatchObject({ requestId: "req-9" })
  })
})

describe("assetRequestEvent", () => {
  it("addresses the approver on submit, not the requester", () => {
    const event = assetRequestEvent({
      stage: "submitted",
      requestId: "req-1",
      employeeId: "emp-1",
      approverEmployeeId: "emp-mgr",
      categoryName: "Monitor",
      actorUserId: "user-1",
      note: null,
    })

    expect(event.type).toBe("asset.request.submitted")
    expect(event.managerEmployeeId).toBe("emp-mgr")
  })

  it("carries the rejection note, because a rejection without one is unactionable", () => {
    const event = assetRequestEvent({
      stage: "rejected",
      requestId: "req-1",
      employeeId: "emp-1",
      approverEmployeeId: null,
      categoryName: "Monitor",
      actorUserId: "user-1",
      note: "Already has two",
    })

    expect(event.severity).toBe("WARNING")
    expect(event.meta).toContain("Already has two")
  })
})

describe("assetReturnedEvent", () => {
  it("reports WARNING when the asset comes back damaged", () => {
    const event = assetReturnedEvent({
      assetId: "ast-1",
      assetTag: "BS-AST-00042",
      employeeId: "emp-1",
      conditionIn: "DAMAGED",
      actorUserId: "user-hr",
    })

    expect(event.severity).toBe("WARNING")
    expect(event.subjectEmployeeId).toBe("emp-1")
  })

  it("reports SUCCESS when the asset comes back in good condition", () => {
    const event = assetReturnedEvent({
      assetId: "ast-1",
      assetTag: "BS-AST-00042",
      employeeId: "emp-1",
      conditionIn: "GOOD",
      actorUserId: "user-hr",
    })

    expect(event.severity).toBe("SUCCESS")
    expect(event.subjectEmployeeId).toBe("emp-1")
  })
})

describe("assetLifecycleEvent", () => {
  it("suppresses the manager audience when an asset is retired", () => {
    const event = assetLifecycleEvent({
      stage: "retired",
      assetId: "ast-1",
      assetTag: "BS-AST-00042",
      assetName: "ThinkPad X1",
      note: "End of life",
      actorUserId: "user-hr",
    })

    expect(event.type).toBe("asset.retired")
    expect(event.severity).toBe("INFO")
    // Explicit null, not undefined: retiring an asset is a decision about a
    // thing, not about a person, so emitEvent must not resolve a manager.
    expect(event.managerEmployeeId).toBeNull()
    expect(event.subjectEmployeeId).toBeUndefined()
    expect(event.targetRoles).toContain("HR_ADMIN")
    expect(event.targetRoles).toContain("FINANCE_OFFICER")
  })

  it("suppresses the manager audience when an asset is marked lost", () => {
    const event = assetLifecycleEvent({
      stage: "marked_lost",
      assetId: "ast-1",
      assetTag: "BS-AST-00042",
      assetName: "ThinkPad X1",
      note: "Not found after audit",
      actorUserId: "user-hr",
    })

    expect(event.type).toBe("asset.marked_lost")
    expect(event.severity).toBe("WARNING")
    expect(event.managerEmployeeId).toBeNull()
    expect(event.subjectEmployeeId).toBeUndefined()
    expect(event.targetRoles).toContain("HR_ADMIN")
    expect(event.targetRoles).toContain("FINANCE_OFFICER")
  })
})

describe("assetAcknowledgedEvent", () => {
  it("addresses the employee who acknowledged receipt", () => {
    const event = assetAcknowledgedEvent({
      assetId: "ast-1",
      assetTag: "BS-AST-00042",
      employeeId: "emp-1",
      actorUserId: "emp-1",
    })

    expect(event.type).toBe("asset.acknowledged")
    expect(event.entity).toBe("ASSET_ASSIGNMENT")
    expect(event.subjectEmployeeId).toBe("emp-1")
    expect(event.targetRoles).toContain("HR_ADMIN")
  })
})

describe("assetImportedEvent", () => {
  it("is one event carrying the counts, never one per row", () => {
    const event = assetImportedEvent({ assetCount: 142, assignmentCount: 96, actorUserId: "user-hr" })

    expect(event.type).toBe("asset.imported")
    expect(event.entity).toBe("ASSET")
    // No subject: an import is one thing one admin did, addressed to HR.
    expect(event.subjectEmployeeId).toBeUndefined()
    expect(event.managerEmployeeId).toBeNull()
    expect(event.meta).toBe("142 assets · 96 with open custody")
    expect(event.payload).toMatchObject({ assetCount: 142, assignmentCount: 96 })
  })
})
