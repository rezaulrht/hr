import Link from "next/link"

import type { MyProfileResponse, Role } from "@/lib/api/types"
import { Button } from "@/components/ui/button"

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  HR_ADMIN: "HR Admin",
  FINANCE_OFFICER: "Finance Officer",
  REPORTING_MANAGER: "Reporting Manager",
  EMPLOYEE: "Employee",
}

function initialsFromEmail(email: string): string {
  return (email.split("@")[0] ?? "?").slice(0, 2).toUpperCase()
}

/**
 * The shape for Super Admin, HR Admin and Finance Officer, who have a `User`
 * row and no `Employee`.
 *
 * This is a legitimate state — not an error, and not an empty state. It
 * renders as a small, *complete* card rather than a page-sized "no data"
 * illustration, because for these roles there genuinely is nothing more and
 * the page should look finished.
 *
 * The explanatory sentence is load-bearing. Without it the page reads as
 * broken.
 */
export function AccountOnlyCard({ account }: { account: MyProfileResponse["account"] }) {
  return (
    <div className="max-w-140 rounded-md border border-[#E4E9EF] bg-white px-5.5 py-5">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-[#EFF2F6] text-[17px] font-bold text-[#55657A]">
          {initialsFromEmail(account.email)}
        </div>
        <div className="min-w-0">
          <div className="font-heading text-[18px] font-bold tracking-tight break-words">
            {account.email}
          </div>
          <div className="mt-0.5 text-[13px] text-[#7A8698]">{ROLE_LABELS[account.role]}</div>
        </div>
      </div>
      <p className="mt-4 border-t border-[#EFF2F6] pt-4 text-[13px] text-[#55657A]">
        Administrative accounts don&apos;t have an employee record. Your personal and payroll
        details are managed separately.
      </p>
      <div className="mt-4">
        <Button
          type="button"
          variant="outline"
          nativeButton={false}
          render={<Link href="/change-password" />}
        >
          Change password
        </Button>
      </div>
    </div>
  )
}
