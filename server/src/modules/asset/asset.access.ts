/**
 * Who may see which assets, and which fields.
 *
 * The cost rule is enforced by **omitting the field from the response**, not
 * by hiding it in the UI, so there is exactly one place it can drift out of
 * sync with itself.
 */

import prisma from "../../config/prisma"
import type { Prisma, Role } from "../../generated/prisma/client"
import type { AccessTokenPayload } from "../auth/auth.types"

const COST_ROLES: Role[] = ["HR_ADMIN", "FINANCE_OFFICER", "SUPER_ADMIN"]

export function canSeeCosts(role: Role): boolean {
  return COST_ROLES.includes(role)
}

/**
 * Employee → own holdings only. Manager → own plus their reports'.
 * HR / Finance / Super Admin → everything.
 */
export async function assetScopeFor(viewer: AccessTokenPayload): Promise<Prisma.AssetWhereInput> {
  if (COST_ROLES.includes(viewer.role)) return {}

  const me = await prisma.employee.findUnique({
    where: { userId: viewer.sub },
    select: { id: true },
  })
  // An administrative account with no Employee row sees nothing rather than
  // everything — failing closed is the only safe default here.
  if (!me) return { id: { in: [] } }

  const employeeIds = [me.id]
  if (viewer.role === "REPORTING_MANAGER") {
    const reports = await prisma.employee.findMany({
      where: { reportingManagerId: me.id },
      select: { id: true },
    })
    employeeIds.push(...reports.map((r) => r.id))
  }

  // Scoped by *open* custody: a manager sees what their team is holding now,
  // not everything the team has ever touched.
  return { assignments: { some: { employeeId: { in: employeeIds }, returnedAt: null } } }
}

/** Drops `purchaseCost` and `vendor` for roles not entitled to them. */
export function stripCosts<T extends { purchaseCost?: unknown; vendor?: unknown }>(
  asset: T,
  role: Role
): T {
  if (canSeeCosts(role)) return asset
  const { purchaseCost: _cost, vendor: _vendor, ...rest } = asset
  return rest as T
}
