import prisma from "../config/prisma"

/**
 * Who did something, in a form a person can read.
 *
 * Several tables record an actor as a bare `String` user id rather than a
 * relation — `Journal.createdBy`, `AuditLog.changedBy` — deliberately, so a
 * user row can never be blocked from deletion by a five-year-old ledger
 * entry. The cost is that Prisma cannot join them, so a screen that wants a
 * name has to ask for it separately. This is that ask.
 */
export interface ActorName {
  id: string
  email: string
  /** Null for an account with no employee record — a service or setup login. */
  fullName: string | null
}

/**
 * Resolve user ids to names in one query.
 *
 * Nulls and duplicates in `ids` are expected: a journal has three actor
 * columns, two of them nullable, and they are frequently the same person.
 * Ids with no surviving user row are simply absent from the result — a
 * deleted account is not an error, and the caller falls back to the id.
 */
export async function resolveActors(
  ids: (string | null | undefined)[]
): Promise<Record<string, ActorName>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (wanted.length === 0) return {}

  const users = await prisma.user.findMany({
    where: { id: { in: wanted } },
    select: { id: true, email: true, employee: { select: { fullName: true } } },
  })

  return Object.fromEntries(
    users.map((u) => [u.id, { id: u.id, email: u.email, fullName: u.employee?.fullName ?? null }])
  )
}

/** The single best label for an actor: their name, else their login. */
export function actorLabel(actor: ActorName | null | undefined, fallback: string): string {
  if (!actor) return fallback
  return actor.fullName ?? actor.email
}
