import prisma from "../../config/prisma"
import type { Prisma } from "../../generated/prisma/client"
import { AppError } from "../../middleware/errorHandler"
import { writeAudit } from "../../utils/audit"
import type { AccessTokenPayload } from "../auth/auth.types"

export const listExpenseCategories = () => prisma.expenseCategory.findMany({ orderBy: { name: "asc" } })

export async function createExpenseCategory(input: { code: string; name: string }, actor: AccessTokenPayload) {
  try {
    return await prisma.$transaction(async (tx) => {
      const category = await tx.expenseCategory.create({ data: input })
      await writeAudit(tx, { entity: "EXPENSE_CATEGORY", entityId: category.id, action: "CREATE", changedBy: actor.sub, after: input })
      return category
    })
  } catch (err) {
    if ((err as { code?: string })?.code === "P2002") throw new AppError(409, "A category with this code or name already exists")
    throw err
  }
}

export async function updateExpenseCategory(id: string, input: { name?: string }, actor: AccessTokenPayload) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.expenseCategory.findUnique({ where: { id } })
    if (!existing) throw new AppError(404, "Category not found")
    const updated = await tx.expenseCategory.update({ where: { id }, data: input })
    await writeAudit(tx, { entity: "EXPENSE_CATEGORY", entityId: id, action: "UPDATE", changedBy: actor.sub, before: { code: existing.code, name: existing.name }, after: { code: updated.code, name: updated.name } as Prisma.InputJsonValue })
    return updated
  })
}

export async function deleteExpenseCategory(id: string, actor: AccessTokenPayload): Promise<void> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.expenseCategory.findUnique({ where: { id } })
    if (!existing) throw new AppError(404, "Category not found")
    const claims = await tx.expenseClaim.count({ where: { categoryId: id } })
    if (claims > 0) throw new AppError(409, `${existing.name} is used by ${claims} claim(s) and cannot be deleted.`)
    await tx.expenseCategory.delete({ where: { id } })
    await writeAudit(tx, { entity: "EXPENSE_CATEGORY", entityId: id, action: "DELETE", changedBy: actor.sub, before: { code: existing.code, name: existing.name } })
  })
}
