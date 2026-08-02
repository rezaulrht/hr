import { z } from "zod"

/**
 * The cross-field rule is what makes the enum worth having. A schema that
 * accepts `{ audience: "ALL", departmentId: "..." }` leaves a field nothing
 * reads and everything half-trusts — and the first reader to trust it scopes
 * a company-wide notice to one department by accident.
 */
function requireMatchingTarget(
  value: { audience: "ALL" | "DEPARTMENT" | "ROLE"; departmentId?: string; targetRole?: string },
  ctx: z.RefinementCtx
) {
  if (value.audience === "DEPARTMENT") {
    if (!value.departmentId) {
      ctx.addIssue({
        code: "custom",
        path: ["departmentId"],
        message: "A department announcement needs a departmentId",
      })
    }
    if (value.targetRole) {
      ctx.addIssue({
        code: "custom",
        path: ["targetRole"],
        message: "A department announcement cannot also target a role",
      })
    }
    return
  }

  if (value.audience === "ROLE") {
    if (!value.targetRole) {
      ctx.addIssue({
        code: "custom",
        path: ["targetRole"],
        message: "A role announcement needs a targetRole",
      })
    }
    if (value.departmentId) {
      ctx.addIssue({
        code: "custom",
        path: ["departmentId"],
        message: "A role announcement cannot also target a department",
      })
    }
    return
  }

  if (value.departmentId) {
    ctx.addIssue({
      code: "custom",
      path: ["departmentId"],
      message: "A company-wide announcement cannot target a department",
    })
  }
  if (value.targetRole) {
    ctx.addIssue({
      code: "custom",
      path: ["targetRole"],
      message: "A company-wide announcement cannot target a role",
    })
  }
}

const audience = z.enum(["ALL", "DEPARTMENT", "ROLE"])
const role = z.enum([
  "SUPER_ADMIN",
  "HR_ADMIN",
  "FINANCE_OFFICER",
  "REPORTING_MANAGER",
  "EMPLOYEE",
])

export const createAnnouncementBody = z
  .object({
    title: z.string().min(1, "A title is required").max(200),
    body: z.string().min(1, "A body is required").max(10_000),
    audience: audience.default("ALL"),
    departmentId: z.string().optional(),
    targetRole: role.optional(),
    /**
     * Omitted means "publish now". Explicit null means "keep it a draft" — a
     * distinction the client needs, since a draft and an immediate post are
     * both a POST with no date otherwise.
     */
    publishedAt: z.iso.datetime().nullish(),
  })
  .superRefine(requireMatchingTarget)
export type CreateAnnouncementBody = z.infer<typeof createAnnouncementBody>

export const updateAnnouncementBody = z
  .object({
    title: z.string().min(1).max(200).optional(),
    body: z.string().min(1).max(10_000).optional(),
    audience: audience.optional(),
    departmentId: z.string().nullish(),
    targetRole: role.nullish(),
    publishedAt: z.iso.datetime().nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update")
export type UpdateAnnouncementBody = z.infer<typeof updateAnnouncementBody>

export const announcementQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
})
export type AnnouncementQuery = z.infer<typeof announcementQuery>
