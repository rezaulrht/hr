import prisma from "../../config/prisma"
import { AppError } from "../../middleware/errorHandler"
import { writeAudit } from "../../utils/audit"
import type { AccessTokenPayload } from "../auth/auth.types"
import { POSTING_EVENTS, type PostingEvent } from "./posting.types"
import type { Prisma } from "../../generated/prisma/client"
import { REQUIRED_KEYS } from "./posting.rules.seed"
import { resolveAccountCode } from "./posting.rules"

export async function listRules() { return prisma.postingRule.findMany({ include: { account: { select: { code: true, name: true } } }, orderBy: [{ event: "asc" }, { key: "asc" }] }) }
export async function unresolvedKeys() {
  const rows = await prisma.postingRule.findMany({ select: { event: true, key: true, account: { select: { code: true } } } })
  const missing: Array<{ event: PostingEvent; key: string }> = []
  for (const event of POSTING_EVENTS) { const rules = { event, byKey: new Map(rows.filter((r) => r.event === event).map((r) => [r.key, r.account.code])) }; for (const key of REQUIRED_KEYS[event] ?? []) { try { resolveAccountCode(rules, key) } catch { missing.push({ event, key }) } } }
  return missing
}
async function assertLeaf(tx: Prisma.TransactionClient, accountId: string) {
  const account = await tx.account.findUnique({ where: { id: accountId } }); if (!account) throw new AppError(400, "Account not found"); if (account.isGroup) throw new AppError(400, `${account.code} ${account.name} is a group and cannot be used for posting rules`); return account
}
export async function createRule(input: { event: string; key: string; accountId: string; note?: string | null }, actor: AccessTokenPayload) { return prisma.$transaction(async (tx) => { const account = await assertLeaf(tx, input.accountId); const rule = await tx.postingRule.create({ data: { ...input, accountId: account.id, note: input.note ?? null, updatedBy: actor.sub } }); await writeAudit(tx, { entity: "POSTING_RULE", entityId: rule.id, action: "CREATE", changedBy: actor.sub, after: { event: rule.event, key: rule.key, accountCode: account.code } }); return rule }) }
export async function updateRule(id: string, input: { accountId: string; note?: string | null }, actor: AccessTokenPayload) { return prisma.$transaction(async (tx) => { const existing = await tx.postingRule.findUnique({ where: { id }, include: { account: true } }); if (!existing) throw new AppError(404, "Posting rule not found"); const account = await assertLeaf(tx, input.accountId); const updated = await tx.postingRule.update({ where: { id }, data: { accountId: account.id, note: input.note ?? null, updatedBy: actor.sub } }); await writeAudit(tx, { entity: "POSTING_RULE", entityId: id, action: "UPDATE", changedBy: actor.sub, before: { event: existing.event, key: existing.key, accountCode: existing.account.code }, after: { event: updated.event, key: updated.key, accountCode: account.code } }); return updated }) }
export async function deleteRule(id: string, actor: AccessTokenPayload) { return prisma.$transaction(async (tx) => { const existing = await tx.postingRule.findUnique({ where: { id }, include: { account: true } }); if (!existing) throw new AppError(404, "Posting rule not found"); await tx.postingRule.delete({ where: { id } }); await writeAudit(tx, { entity: "POSTING_RULE", entityId: id, action: "DELETE", changedBy: actor.sub, before: { event: existing.event, key: existing.key, accountCode: existing.account.code } }) }) }
