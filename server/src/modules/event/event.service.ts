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
 * Hides a scheduled announcement's event until its publish time arrives.
 *
 * A scheduled announcement has no moment at which anything is written — its
 * visibility falls out of a time comparison — so the event is emitted when
 * the *schedule is set*, carrying `payload.publishAt`, and held back here.
 * The alternative is a cron job that emits on a tick, which is exactly the
 * job the announcements design avoided and which fails silently on the one
 * morning it matters.
 *
 * The first clause is load-bearing: only announcement events carry
 * `publishAt`, so without it every other event type would vanish from the
 * feed the moment this filter was applied.
 */
function notYetPublished(now: Date): Prisma.EventWhereInput {
  return {
    OR: [
      { type: { not: "announcement.published" } },
      { payload: { path: ["publishAt"], lte: now.toISOString() } },
    ],
  }
}

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
  who: ActorScope
): Prisma.EventWhereInput {
  const clauses: Prisma.EventWhereInput[] = [
    { companyWide: true },
    { targetRoles: { has: actor.role } },
  ]
  if (who.employeeId) {
    clauses.push({ subjectEmployeeId: who.employeeId }, { managerEmployeeId: who.employeeId })
  }
  if (who.departmentId) {
    clauses.push({ audienceDepartmentId: who.departmentId })
  }
  return { OR: clauses }
}

/** Where the actor sits, or nulls. Never throws — see `visibleToFilter`. */
export interface ActorScope {
  employeeId: string | null
  departmentId: string | null
}

export async function scopeForActor(actor: AccessTokenPayload): Promise<ActorScope> {
  const employee = await prisma.employee.findUnique({
    where: { userId: actor.sub },
    select: { id: true, departmentId: true },
  })
  return { employeeId: employee?.id ?? null, departmentId: employee?.departmentId ?? null }
}

export async function listEvents(
  actor: AccessTokenPayload,
  opts: ListEventsOptions = {}
): Promise<EventPage> {
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT)
  const scope = await scopeForActor(actor)

  const where: Prisma.EventWhereInput = {
    AND: [
      visibleToFilter(actor, scope),
      // An instant comparison, not a calendar date — `officeToday()` would
      // turn a notice scheduled for 14:00 into one that went live at
      // midnight.
      notYetPublished(opts.now ?? new Date()),
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
