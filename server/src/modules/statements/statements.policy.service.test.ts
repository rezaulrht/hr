import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => ({
  default: {
    statementNote: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock("../../utils/audit", () => ({ writeAudit: vi.fn() }))

import prisma from "../../config/prisma"
import { writeAudit } from "../../utils/audit"
import {
  createPolicyNote,
  deletePolicyNote,
  listPolicyNotes,
  updatePolicyNote,
} from "./statements.policy.service"

const actor = { sub: "user-1", role: "FINANCE_OFFICER", email: "f@demo.com", mustChangePassword: false } as never

const note = (over: Record<string, unknown> = {}) => ({
  id: "n1", ref: "2.08", title: "Statement of Cash Flows", body: "Indirect method.",
  sortOrder: 0, updatedBy: null, updatedAt: new Date(), createdAt: new Date(), ...over,
})

// The service opens a transaction so the write and its audit row land
// together; the mock runs the callback against the same client.
const tx = prisma as unknown as Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

beforeEach(() => {
  vi.clearAllMocks()
  ;(prisma.$transaction as any).mockImplementation(async (fn: any) => fn(tx))
})

describe("listPolicyNotes", () => {
  it("sorts numerically per segment, so 9.01 comes before 10.00", async () => {
    ;(prisma.statementNote.findMany as any).mockResolvedValue([
      note({ ref: "10.00" }), note({ ref: "2.08" }), note({ ref: "9.01" }),
    ])

    expect((await listPolicyNotes()).map((n) => n.ref)).toEqual(["2.08", "9.01", "10.00"])
  })

  it("breaks a genuine tie on sortOrder", async () => {
    ;(prisma.statementNote.findMany as any).mockResolvedValue([
      note({ ref: "2.0", title: "Second", sortOrder: 5 }),
      note({ ref: "2", title: "First", sortOrder: 1 }),
    ])

    expect((await listPolicyNotes()).map((n) => n.title)).toEqual(["First", "Second"])
  })
})

describe("createPolicyNote", () => {
  it("stamps the actor and audits under STATEMENT_NOTE", async () => {
    ;(prisma.statementNote.create as any).mockResolvedValue(note())

    await createPolicyNote({ ref: "2.08", title: "Statement of Cash Flows", body: "Indirect method." } as never, actor)

    expect((prisma.statementNote.create as any).mock.calls[0][0].data.updatedBy).toBe("user-1")
    expect(writeAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entity: "STATEMENT_NOTE", action: "CREATE", changedBy: "user-1" })
    )
  })

  it("defaults sortOrder to nought when none is given", async () => {
    ;(prisma.statementNote.create as any).mockResolvedValue(note())

    await createPolicyNote({ ref: "3.00", title: "Notes to the Policy", body: "x" } as never, actor)

    expect((prisma.statementNote.create as any).mock.calls[0][0].data.sortOrder).toBe(0)
  })
})

describe("updatePolicyNote", () => {
  it("records the body before and after, so an old wording stays answerable", async () => {
    // 2b Decision 13: policy notes are one live set rather than one per
    // financial year, and the audit trail is what makes "what did 2.08 say in
    // January?" answerable without a second copy of everything.
    ;(prisma.statementNote.findUnique as any).mockResolvedValue(note({ body: "Direct method." }))
    ;(prisma.statementNote.update as any).mockResolvedValue(note({ body: "Indirect method." }))

    await updatePolicyNote("n1", { body: "Indirect method." } as never, actor)

    const entry = (writeAudit as any).mock.calls[0][1]
    expect(entry.before.body).toBe("Direct method.")
    expect(entry.after.body).toBe("Indirect method.")
  })

  it("404s on an unknown id rather than creating one", async () => {
    ;(prisma.statementNote.findUnique as any).mockResolvedValue(null)

    await expect(updatePolicyNote("nope", { body: "x" } as never, actor)).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(prisma.statementNote.update).not.toHaveBeenCalled()
  })
})

describe("deletePolicyNote", () => {
  it("audits what was removed before removing it", async () => {
    ;(prisma.statementNote.findUnique as any).mockResolvedValue(note())

    await deletePolicyNote("n1", actor)

    expect(prisma.statementNote.delete).toHaveBeenCalledWith({ where: { id: "n1" } })
    const entry = (writeAudit as any).mock.calls[0][1]
    expect(entry.action).toBe("DELETE")
    expect(entry.before.body).toBe("Indirect method.")
  })

  it("404s on an unknown id", async () => {
    ;(prisma.statementNote.findUnique as any).mockResolvedValue(null)

    await expect(deletePolicyNote("nope", actor)).rejects.toMatchObject({ statusCode: 404 })
    expect(prisma.statementNote.delete).not.toHaveBeenCalled()
  })
})
