/**
 * Mapping an announcement's audience onto the event log's.
 *
 * Two audience models with one meaning, and this function is the single place
 * they meet — which is why it is a named function with its own tests rather
 * than three lines inlined in the service.
 *
 * | Announcement | Event                    |
 * | ------------ | ------------------------ |
 * | `ALL`        | `companyWide`            |
 * | `DEPARTMENT` | `audienceDepartmentId`   |
 * | `ROLE`       | `targetRoles`            |
 */

import type { AnnouncementAudience, Role } from "../../generated/prisma/client"
import type { EventInput } from "../event/event.types"

interface PublishedArgs {
  id: string
  title: string
  audience: AnnouncementAudience
  departmentId: string | null
  targetRole: Role | null
  publishedBy: string
  /**
   * When it goes live. **May be in the future**: a scheduled announcement has
   * no moment at which anything is written, so there is nothing for an
   * in-transaction emit to hook onto later. The event is written when the
   * schedule is *set*, carries the date, and the feed excludes rows whose
   * `publishAt` has not arrived. The alternative is a cron job that emits on
   * a tick — reintroducing exactly the job the announcements design avoided,
   * and which fails silently on the morning it matters.
   */
  publishAt: Date
}

export function announcementPublishedEvent(args: PublishedArgs): EventInput {
  return {
    type: "announcement.published",
    severity: "INFO",
    actorUserId: args.publishedBy,
    entity: "ANNOUNCEMENT",
    entityId: args.id,
    companyWide: args.audience === "ALL",
    audienceDepartmentId: args.audience === "DEPARTMENT" ? args.departmentId : null,
    targetRoles: args.audience === "ROLE" && args.targetRole ? [args.targetRole] : [],
    title: args.title,
    meta: "New announcement",
    href: "/announcements",
    payload: { publishAt: args.publishAt.toISOString() },
  } as EventInput
}
