/**
 * Enabling and disabling an employee's login.
 *
 * A sibling of `PATCH /api/users/:id/status` rather than a replacement for
 * it. That route keys on the **user** id, which no employee projection
 * exposes — and putting `userId` on `EmployeeView` to power one button would
 * hand every tier that sees an employment group a foreign key it has no use
 * for. This resolves the user id server-side from the employee id instead.
 *
 * `User.isActive` stays independent of `Employee.employmentStatus`; see the
 * comment on `EmploymentDetails.accountActive`.
 */

import prisma from "../../config/prisma"
import { AppError } from "../../middleware/errorHandler"
import { revokeAllUserTokens } from "../auth/auth.service"

export async function setAccountActive(
  employeeId: string,
  isActive: boolean
): Promise<{ id: string; accountActive: boolean }> {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, userId: true },
  })
  if (!employee) throw new AppError(404, "Employee not found")

  const updated = await prisma.user.update({
    where: { id: employee.userId },
    data: { isActive },
    select: { id: true, isActive: true },
  })

  // Without this the access token keeps working until it expires and the
  // refresh cookie keeps minting new ones — the lockout would not take
  // effect for the length of a session. Matches updateUserStatusHandler.
  if (!isActive) await revokeAllUserTokens(employee.userId)

  return { id: employeeId, accountActive: updated.isActive }
}
