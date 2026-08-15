import type { Prisma } from "../../generated/prisma/client"
import { AppError } from "../../middleware/errorHandler"
import type { PostingEvent, ResolvedRules } from "./posting.types"
export async function loadRules(tx: Prisma.TransactionClient, event: PostingEvent): Promise<ResolvedRules> {
  const rows = await tx.postingRule.findMany({ where: { event }, select: { key: true, account: { select: { code: true } } } })
  return { event, byKey: new Map(rows.map((r) => [r.key, r.account.code])) }
}
export function resolveAccountCode(rules: ResolvedRules, key: string): string {
  const exact = rules.byKey.get(key); if (exact) return exact
  const colon = key.indexOf(":")
  if (colon > 0) { const prefixed = rules.byKey.get(`${key.slice(0, colon)}:*`); if (prefixed) return prefixed }
  const fallback = rules.byKey.get("*"); if (fallback) return fallback
  throw new AppError(409, `No posting rule for ${rules.event} / ${key}. Add one on the posting rules screen, or add a fallback rule for this event.`, { event: rules.event, key })
}
