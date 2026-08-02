import { beforeEach, describe, expect, it, vi } from "vitest"

import prisma from "../../config/prisma"
import { emitEvent } from "./event.emit"
import type { EventInput, EventTx } from "./event.types"

function fakeTx() {
  return {
    event: { create: vi.fn(async ({ data }: { data: unknown }) => ({ id: "evt-1", ...(data as object) })) },
    employee: { findUnique: vi.fn(async () => null) },
  } as unknown as EventTx & {
    event: { create: ReturnType<typeof vi.fn> }
    employee: { findUnique: ReturnType<typeof vi.fn> }
  }
}

let tx: ReturnType<typeof fakeTx>

beforeEach(() => {
  tx = fakeTx()
})

describe("emitEvent", () => {
  it("maps every field through to the row", async () => {
    await emitEvent(tx, {
      type: "leave.approved",
      severity: "SUCCESS",
      actorUserId: "user-mgr",
      entity: "LEAVE_REQUEST",
      entityId: "lr-1",
      subjectEmployeeId: "emp-1",
      managerEmployeeId: "emp-9",
      targetRoles: ["HR_ADMIN"],
      title: "Your annual leave was approved",
      meta: "12–14 August",
      href: "/employee/leave",
      payload: { days: 3 },
    })

    expect(tx.event.create).toHaveBeenCalledWith({
      data: {
        type: "leave.approved",
        severity: "SUCCESS",
        actorUserId: "user-mgr",
        entity: "LEAVE_REQUEST",
        entityId: "lr-1",
        subjectEmployeeId: "emp-1",
        managerEmployeeId: "emp-9",
        targetRoles: ["HR_ADMIN"],
        companyWide: false,
        audienceDepartmentId: null,
        title: "Your annual leave was approved",
        meta: "12–14 August",
        href: "/employee/leave",
        payload: { days: 3 },
      },
    })
  })

  it("defaults severity to INFO and the audience columns to empty", async () => {
    await emitEvent(tx, {
      type: "announcement.published",
      entity: "ANNOUNCEMENT",
      entityId: "ann-1",
      companyWide: true,
      title: "Office closed on Sunday",
    })

    expect(tx.event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        severity: "INFO",
        targetRoles: [],
        companyWide: true,
        subjectEmployeeId: null,
        managerEmployeeId: null,
        meta: null,
        href: null,
      }),
    })
  })

  it("resolves the manager from the subject inside the same transaction", async () => {
    tx.employee.findUnique.mockResolvedValue({ reportingManagerId: "emp-9" })

    await emitEvent(tx, {
      type: "leave.requested",
      entity: "LEAVE_REQUEST",
      entityId: "lr-2",
      subjectEmployeeId: "emp-1",
      title: "Ayesha requested annual leave",
    })

    // The same `tx`, not the global client: a manager resolved outside the
    // transaction could read a reporting line the transaction is changing.
    expect(tx.employee.findUnique).toHaveBeenCalledWith({
      where: { id: "emp-1" },
      select: { reportingManagerId: true },
    })
    expect(tx.event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ managerEmployeeId: "emp-9" }),
    })
  })

  it("writes a null manager rather than throwing when the subject has none", async () => {
    // The CEO filing leave is not an error.
    tx.employee.findUnique.mockResolvedValue({ reportingManagerId: null })

    await emitEvent(tx, {
      type: "leave.requested",
      entity: "LEAVE_REQUEST",
      entityId: "lr-3",
      subjectEmployeeId: "emp-ceo",
      title: "Karim requested annual leave",
    })

    expect(tx.event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ managerEmployeeId: null }),
    })
  })

  it("treats an explicit null manager as 'no manager audience', not as 'work it out'", async () => {
    // Payroll's own rule is that a manager may not see their reports'
    // payslips. A payslip event that silently resolved a reporting line
    // would route pay information to someone the payslip endpoint refuses.
    await emitEvent(tx, {
      type: "payslip.published",
      entity: "PAYSLIP",
      entityId: "slip-1",
      subjectEmployeeId: "emp-1",
      managerEmployeeId: null,
      title: "Your June payslip is ready",
    })

    expect(tx.employee.findUnique).not.toHaveBeenCalled()
    expect(tx.event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ managerEmployeeId: null }),
    })
  })

  it("does not look the manager up when one was passed explicitly", async () => {
    await emitEvent(tx, {
      type: "attendance.decided",
      entity: "ATTENDANCE",
      entityId: "att-1",
      subjectEmployeeId: "emp-1",
      managerEmployeeId: "emp-7",
      title: "Your 12 August attendance was approved",
    })

    expect(tx.employee.findUnique).not.toHaveBeenCalled()
  })

  it("accepts a null actor, which means the system did it", async () => {
    await emitEvent(tx, {
      type: "employee.exited",
      entity: "EMPLOYEE",
      entityId: "emp-4",
      targetRoles: ["HR_ADMIN"],
      actorUserId: null,
      title: "Tanvir Hasan left the company",
    })

    expect(tx.event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorUserId: null }),
    })
  })
})

describe("the signature", () => {
  it("rejects the global prisma client at compile time", async () => {
    // The constraint most likely to be violated by a later hand, and the
    // only one whose failure is silent: an event that survives a rolled-back
    // transaction announces something that did not happen.
    const input: EventInput = {
      type: "leave.requested",
      entity: "LEAVE_REQUEST",
      entityId: "lr-4",
      companyWide: true,
      title: "x",
    }
    // @ts-expect-error — emitEvent takes a transaction client, never PrismaClient
    void (() => emitEvent(prisma, input))
    expect(true).toBe(true)
  })

  it("rejects an event with no audience at compile time", async () => {
    // A row written, a notification never sent, and nothing anywhere saying so.
    // @ts-expect-error — at least one of subjectEmployeeId, targetRoles, companyWide
    const input: EventInput = {
      type: "leave.requested",
      entity: "LEAVE_REQUEST",
      entityId: "lr-5",
      title: "x",
    }
    void input
    expect(true).toBe(true)
  })
})
