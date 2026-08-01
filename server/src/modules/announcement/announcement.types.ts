import type { AnnouncementAudience, Role } from "../../generated/prisma/client"

export interface AnnouncementItem {
  id: string
  title: string
  body: string
  audience: AnnouncementAudience
  departmentId: string | null
  departmentName: string | null
  targetRole: Role | null
  publishedBy: string
  /**
   * Null means it is still a draft. A future instant means it is scheduled —
   * the row exists and is invisible to its audience until the clock passes
   * it, with no write in between.
   */
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}
