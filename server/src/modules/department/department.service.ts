/**
 * Department reference data.
 *
 * Delete is refused with a count rather than allowed, because the schema
 * cannot be trusted to refuse it: `Employee.departmentId` is required and so
 * restricts, but `Announcement.departmentId` and `Asset.departmentId` are
 * both nullable, and Prisma's default for a nullable relation is SetNull.
 * A delete would therefore succeed and quietly widen a department-scoped
 * announcement to the whole company.
 */

import prisma from "../../config/prisma"
import { AppError } from "../../middleware/errorHandler"
import { writeAudit } from "../../utils/audit"
import { describeUsage } from "../../utils/referenceUsage"
import type { AccessTokenPayload } from "../auth/auth.types"
import type { CreateDepartmentInput, UpdateDepartmentInput } from "./department.validators"

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002"
}

export async function listDepartments() {
  return prisma.department.findMany({
    select: { id: true, name: true, costNature: true },
    orderBy: { name: "asc" },
  })
}

export async function createDepartment(input: CreateDepartmentInput, actor: AccessTokenPayload) {
  try {
    return await prisma.$transaction(async (tx) => {
      const department = await tx.department.create({ data: { name: input.name, costNature: input.costNature ?? "ADMINISTRATIVE" } })

      await writeAudit(tx, {
        entity: "DEPARTMENT",
        entityId: department.id,
        action: "CREATE",
        changedBy: actor.sub,
        after: { name: department.name, costNature: department.costNature },
      })

      return department
    })
  } catch (err) {
    // Caught around the transaction, not inside it, matching createCategory.
    if (isUniqueViolation(err)) {
      throw new AppError(409, "A department with this name already exists")
    }
    throw err
  }
}

export async function updateDepartment(
  id: string,
  input: UpdateDepartmentInput,
  actor: AccessTokenPayload
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.department.findUnique({ where: { id } })
      if (!existing) throw new AppError(404, "Department not found")

      const department = await tx.department.update({
        where: { id },
        data: { name: input.name, ...(input.costNature ? { costNature: input.costNature } : {}) },
      })

      await writeAudit(tx, {
        entity: "DEPARTMENT",
        entityId: id,
        action: "UPDATE",
        changedBy: actor.sub,
        before: { name: existing.name, costNature: existing.costNature },
        after: { name: department.name, costNature: department.costNature },
      })

      return department
    })
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, "A department with this name already exists")
    }
    throw err
  }
}

export async function deleteDepartment(id: string, actor: AccessTokenPayload): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.department.findUnique({ where: { id } })
    if (!existing) throw new AppError(404, "Department not found")

    const [employees, announcements, assets] = await Promise.all([
      tx.employee.count({ where: { departmentId: id } }),
      tx.announcement.count({ where: { departmentId: id } }),
      tx.asset.count({ where: { departmentId: id } }),
    ])

    const usage = describeUsage([
      { noun: "employee", count: employees },
      { noun: "announcement", count: announcements },
      { noun: "asset", count: assets },
    ])
    if (usage !== null) {
      throw new AppError(409, `This department is still in use by ${usage}. Reassign them first.`)
    }

    await tx.department.delete({ where: { id } })

    await writeAudit(tx, {
      entity: "DEPARTMENT",
      entityId: id,
      action: "DELETE",
      changedBy: actor.sub,
      before: { name: existing.name },
    })
  })
}
