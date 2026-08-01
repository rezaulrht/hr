/**
 * Reading the event log.
 *
 * Audience is stored as *rules* on the row and resolved here by a four-clause
 * indexed `OR`. The alternative — fanning an event out to one row per
 * recipient at emit — turns a company-wide announcement into 1,248 inserts
 * and makes "who was on the list" a question about a job that ran, rather
 * than about the rule that was true.
 *
 * **There is no unfiltered list function**, not even an internal one. The
 * filter is not a parameter that can be omitted, because a read that forgets
 * it leaks a leave rejection to the whole company and looks exactly like a
 * read that remembered.
 */

import prisma from "../../config/prisma"
import type { Prisma } from "../../generated/prisma/client"
import type { AccessTokenPayload } from "../auth/auth.types"
import type { EventItem, EventPage, EventType, ListEventsOptions } from "./event.types"

/** Beyond this a feed is not being read, it is being scraped. */
const MAX_LIMIT = 50
const DEFAULT_LIMIT = 20

/**
 * Who may see an event, as a `where` clause.
 *
 * `employeeId` is the *actor's* employee id, or null for an account with no
 * employee profile — a bare SUPER_ADMIN login, which is a normal state and
 * must not be a crash. Those two clauses are dropped entirely rather than
 * compared against null, since `subjectEmployeeId = null` would match every
 * event that has no subject.
 *
 * Note the absence of a blanket admin clause: HR and Super Admin see what
 * emitting code targets at them through `targetRoles`, not everything. An
 * employee's leave rejection is between them and their manager.
 */
export function visibleToFilter(
  actor: AccessTokenPayload,
  employeeId: string | null
): Prisma.EventWhereInput {
  const clauses: Prisma.EventWhereInput[] = [
    { companyWide: true },
    { targetRoles: { has: actor.role } },
  ]
  if (employeeId) {
    clauses.push({ subjectEmployeeId: employeeId }, { managerEmployeeId: employeeId })
  }
  return { OR: clauses }
}

/** The actor's employee id, or null. Never throws — see `visibleToFilter`. */
export async function employeeIdForActor(actor: AccessTokenPayload): Promise<string | null> {
  const employee = await prisma.employee.findUnique({
    where: { userId: actor.sub },
    select: { id: true },
  })
  return employee?.id ?? null
}

export async function listEvents(
  actor: AccessTokenPayload,
  opts: ListEventsOptions = {}
): Promise<EventPage> {
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT)
  const employeeId = await employeeIdForActor(actor)

  const where: Prisma.EventWhereInput = {
    AND: [
      visibleToFilter(actor, employeeId),
      ...(opts.entity ? [{ entity: opts.entity }] : []),
      ...(opts.entityId ? [{ entityId: opts.entityId }] : []),
    ],
  }

  const rows = await prisma.event.findMany({
    where,
    // `createdAt` alone duplicates rows across cursor pages when two events
    // share a timestamp — which they routinely do, since a single request
    // can emit two events inside one transaction.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    // One extra row, purely to learn whether another page exists without a
    // second count query.
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  })

  const page = rows.slice(0, limit)
  return {
    items: page.map(toItem),
    nextCursor: rows.length > limit ? (page[page.length - 1]?.id ?? null) : null,
  }
}

function toItem(row: {
  id: string
  type: string
  severity: EventItem["severity"]
  entity: string
  entityId: string
  title: string
  meta: string | null
  href: string | null
  createdAt: Date
}): EventItem {
  return {
    id: row.id,
    type: row.type as EventType,
    severity: row.severity,
    entity: row.entity,
    entityId: row.entityId,
    title: row.title,
    meta: row.meta,
    href: row.href,
    createdAt: row.createdAt.toISOString(),
  }
}
