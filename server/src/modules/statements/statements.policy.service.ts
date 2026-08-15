import type { StatementNote } from "../../generated/prisma/client"
import prisma from "../../config/prisma"
import { AppError } from "../../middleware/errorHandler"
import { writeAudit } from "../../utils/audit"
import type { AccessTokenPayload } from "../auth/auth.types"
import { compareRefs } from "./statements.refs"
import type { CreatePolicyNoteInput, UpdatePolicyNoteInput } from "./statements.validators"

export async function listPolicyNotes(): Promise<StatementNote[]> {
  const notes = await prisma.statementNote.findMany()
  // Numerically per segment, so 9.01 sorts before 10.00. `sortOrder` breaks a
  // genuine tie — "2", "2.0" and "2.00" all compare equal.
  return notes.sort((a, b) => compareRefs(a.ref, b.ref) || a.sortOrder - b.sortOrder)
}

export function createPolicyNote(input: CreatePolicyNoteInput, actor: AccessTokenPayload): Promise<StatementNote> {
  return prisma.$transaction(async (tx) => {
    const created = await tx.statementNote.create({ data: { ...input, sortOrder: input.sortOrder ?? 0, updatedBy: actor.sub } })
    await writeAudit(tx, { entity: "STATEMENT_NOTE", entityId: created.id, action: "CREATE", changedBy: actor.sub, after: { ref: created.ref, title: created.title } })
    return created
  })
}

export function updatePolicyNote(id: string, input: UpdatePolicyNoteInput, actor: AccessTokenPayload): Promise<StatementNote> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.statementNote.findUnique({ where: { id } })
    if (!existing) throw new AppError(404, "Note not found")
    const updated = await tx.statementNote.update({ where: { id }, data: { ...input, updatedBy: actor.sub } })
    await writeAudit(tx, { entity: "STATEMENT_NOTE", entityId: id, action: "UPDATE", changedBy: actor.sub, before: { ref: existing.ref, title: existing.title, body: existing.body }, after: { ref: updated.ref, title: updated.title, body: updated.body } })
    return updated
  })
}

export function deletePolicyNote(id: string, actor: AccessTokenPayload): Promise<void> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.statementNote.findUnique({ where: { id } })
    if (!existing) throw new AppError(404, "Note not found")
    await tx.statementNote.delete({ where: { id } })
    await writeAudit(tx, { entity: "STATEMENT_NOTE", entityId: id, action: "DELETE", changedBy: actor.sub, before: { ref: existing.ref, title: existing.title, body: existing.body } })
  })
}
