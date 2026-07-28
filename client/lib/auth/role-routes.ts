import type { Role } from "@/lib/api/types"

export const ROLE_ROUTES: Record<Role, string> = {
  SUPER_ADMIN: "/admin",
  HR_ADMIN: "/hr",
  FINANCE_OFFICER: "/finance",
  REPORTING_MANAGER: "/manager",
  EMPLOYEE: "/employee",
}
