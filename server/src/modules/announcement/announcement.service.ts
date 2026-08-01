/**
 * Audience-targeted announcements.
 *
 * Scheduling falls out of the read filter rather than a cron job: every read
 * requires `publishedAt <= now`, so a notice dated next Sunday is simply
 * invisible until it is not. A job would have to run, could miss a tick, and
 * would fail silently on the one morning it mattered.
 *
 * There are no read receipts and no unread counts anywhere in this module.
 * A "read" here would mean a row was rendered in a list; HR reading that back
 * as "87% of staff know" is wrong in the direction that harms the employee
 * who turns up on the day the office was closed.
 */

import prisma from "../../config/prisma"
import type { Prisma, Role } from "../../generated/prisma/client"
import { AppError } from "../../middleware/errorHandler"
import type { AccessTokenPayload } from "../auth/auth.types"
import type { AnnouncementItem } from "./announcement.types"
import type { CreateAnnouncementBody, UpdateAnnouncementBody } from "./announcement.validators"

/** Roles that may publish at all. The route repeats this; the service decides *what*. */
export const PUBLISHER_ROLES: Role[] = [
  "SUPER_ADMIN",
  "HR_ADMIN",
  "FINANCE_OFFICER",
  "REPORTING_MANAGER",
]

/** Roles that may publish to any audience, and moderate anyone's post. */
const MODERATOR_ROLES: Role[] = ["SUPER_ADMIN", "HR_ADMIN"]
const UNRESTRICTED_PUBLISHERS: Role[] = ["SUPER_ADMIN", "HR_ADMIN", "FINANCE_OFFICER"]

const isModerator = (actor: AccessTokenPayload) => MODERATOR_ROLES.includes(actor.role)

const SELECT = {
  id: true,
  title: true,
  body: true,
  audience: true,
  departmentId: true,
  department: { select: { name: true } },
  targetRole: true,
  publishedBy: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
} as const

type Row = Prisma.AnnouncementGetPayload<{ select: typeof SELECT }>

const toItem = (row: Row): AnnouncementItem => ({
  id: row.id,
  title: row.title,
  body: row.body,
  audience: row.audience,
  departmentId: row.departmentId,
  departmentName: row.department?.name ?? null,
  targetRole: row.targetRole,
  publishedBy: row.publishedBy,
  publishedAt: row.publishedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

/** The actor's department, or null for an account with no employee profile. */
async function departmentIdForActor(actor: AccessTokenPayload): Promise<string | null> {
  const employee = await prisma.employee.findUnique({
    where: { userId: actor.sub },
    select: { departmentId: true },
  })
  return employee?.departmentId ?? null
}

/**
 * What the caller may see.
 *
 * A moderator sees everything, drafts included — that is what moderation
 * means. Everyone else sees live announcements addressed to them, plus their
 * own drafts and scheduled posts, which they need in order to edit them.
 *
 * `now` is a genuine instant comparison, not a calendar date, so `new Date()`
 * is the right clock here — `officeToday()` would truncate a notice scheduled
 * for 14:00 into one that went live at midnight.
 */
export function visibleTo(
  actor: AccessTokenPayload,
  departmentId: string | null,
  now: Date = new Date()
): Prisma.AnnouncementWhereInput {
  if (isModerator(actor)) return {}

  const addressedToMe: Prisma.AnnouncementWhereInput[] = [
    { audience: "ALL" },
    { audience: "ROLE", targetRole: actor.role },
  ]
  // Omitted rather than compared against null: `departmentId = null` would
  // match every department announcement whose department was cleared.
  if (departmentId) {
    addressedToMe.push({ audience: "DEPARTMENT", departmentId })
  }

  return {
    OR: [
      { AND: [{ publishedAt: { not: null, lte: now } }, { OR: addressedToMe }] },
      { publishedBy: actor.sub },
    ],
  }
}

export async function listAnnouncements(
  actor: AccessTokenPayload,
  limit = 20
): Promise<AnnouncementItem[]> {
  const departmentId = await departmentIdForActor(actor)
  const rows = await prisma.announcement.findMany({
    where: visibleTo(actor, departmentId),
    select: SELECT,
    // Drafts have no `publishedAt`, so they would sort last on that column
    // alone — and a draft the author is still writing is the one they most
    // want at the top.
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: Math.min(Math.max(Math.trunc(limit), 1), 50),
  })
  return rows.map(toItem)
}

export async function getAnnouncement(
  actor: AccessTokenPayload,
  id: string
): Promise<AnnouncementItem> {
  const departmentId = await departmentIdForActor(actor)
  const row = await prisma.announcement.findFirst({
    where: { AND: [{ id }, visibleTo(actor, departmentId)] },
    select: SELECT,
  })
  // 404 rather than 403: telling someone an announcement exists but is not
  // for them is itself a disclosure.
  if (!row) throw new AppError(404, "Announcement not found")
  return toItem(row)
}

/**
 * Resolves the audience a publisher is actually allowed to write.
 *
 * A manager's department comes from their `Employee` record and never from
 * the request body. This is the one place a request field could escalate
 * scope, so the body is checked against the record rather than merged into it.
 */
async function resolveTarget(
  actor: AccessTokenPayload,
  input: { audience: "ALL" | "DEPARTMENT" | "ROLE"; departmentId?: string | null; targetRole?: Role | null }
): Promise<{ audience: "ALL" | "DEPARTMENT" | "ROLE"; departmentId: string | null; targetRole: Role | null }> {
  if (UNRESTRICTED_PUBLISHERS.includes(actor.role)) {
    return {
      audience: input.audience,
      departmentId: input.audience === "DEPARTMENT" ? (input.departmentId ?? null) : null,
      targetRole: input.audience === "ROLE" ? (input.targetRole ?? null) : null,
    }
  }

  if (actor.role !== "REPORTING_MANAGER") {
    throw new AppError(403, "You do not have permission to publish announcements")
  }

  if (input.audience !== "DEPARTMENT") {
    throw new AppError(403, "A manager may only announce to their own department")
  }

  const own = await departmentIdForActor(actor)
  if (!own) {
    throw new AppError(403, "You are not assigned to a department, so you have no audience")
  }
  if (input.departmentId && input.departmentId !== own) {
    throw new AppError(403, "A manager may only announce to their own department")
  }

  return { audience: "DEPARTMENT", departmentId: own, targetRole: null }
}

export async function createAnnouncement(
  actor: AccessTokenPayload,
  body: CreateAnnouncementBody
): Promise<AnnouncementItem> {
  const target = await resolveTarget(actor, body)

  // Omitted means "publish now"; an explicit null means "keep it a draft".
  // Collapsing the two would make every save-for-later post go live.
  const publishedAt =
    body.publishedAt === undefined ? new Date() : body.publishedAt ? new Date(body.publishedAt) : null

  const row = await prisma.announcement.create({
    data: {
      title: body.title,
      body: body.body,
      publishedBy: actor.sub,
      audience: target.audience,
      departmentId: target.departmentId,
      targetRole: target.targetRole,
      publishedAt,
    },
    select: SELECT,
  })
  return toItem(row)
}

/** Publisher-only, plus the moderator roles. */
async function requireEditable(actor: AccessTokenPayload, id: string) {
  const existing = await prisma.announcement.findUnique({
    where: { id },
    select: { id: true, publishedBy: true, audience: true, departmentId: true, targetRole: true },
  })
  if (!existing) throw new AppError(404, "Announcement not found")
  if (existing.publishedBy !== actor.sub && !isModerator(actor)) {
    throw new AppError(403, "Only the publisher can change this announcement")
  }
  return existing
}

export async function updateAnnouncement(
  actor: AccessTokenPayload,
  id: string,
  body: UpdateAnnouncementBody
): Promise<AnnouncementItem> {
  const existing = await requireEditable(actor, id)

  const data: Prisma.AnnouncementUpdateInput = {}
  if (body.title !== undefined) data.title = body.title
  if (body.body !== undefined) data.body = body.body
  if (body.publishedAt !== undefined) {
    data.publishedAt = body.publishedAt ? new Date(body.publishedAt) : null
  }

  // Any touch of the audience re-resolves the whole triple, so a partial
  // update cannot leave `audience: ROLE` sitting next to a stale
  // `departmentId` that a later reader would half-trust.
  if (
    body.audience !== undefined ||
    body.departmentId !== undefined ||
    body.targetRole !== undefined
  ) {
    const target = await resolveTarget(actor, {
      audience: body.audience ?? existing.audience,
      departmentId: body.departmentId ?? existing.departmentId,
      targetRole: body.targetRole ?? existing.targetRole,
    })
    if (target.audience === "DEPARTMENT" && !target.departmentId) {
      throw new AppError(400, "A department announcement needs a departmentId")
    }
    if (target.audience === "ROLE" && !target.targetRole) {
      throw new AppError(400, "A role announcement needs a targetRole")
    }
    data.audience = target.audience
    data.targetRole = target.targetRole
    data.department = target.departmentId
      ? { connect: { id: target.departmentId } }
      : { disconnect: true }
  }

  const row = await prisma.announcement.update({ where: { id }, data, select: SELECT })
  return toItem(row)
}

export async function deleteAnnouncement(actor: AccessTokenPayload, id: string): Promise<void> {
  await requireEditable(actor, id)
  await prisma.announcement.delete({ where: { id } })
}
