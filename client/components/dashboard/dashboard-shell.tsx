"use client"

import { Header } from "@/components/dashboard/header"
import { Sidebar } from "@/components/dashboard/sidebar"
import type { NavGroup } from "@/components/dashboard/types"
import { useSession } from "@/lib/auth/session-context"
import type { Role } from "@/lib/api/types"

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  HR_ADMIN: "HR Admin",
  FINANCE_OFFICER: "Finance Officer",
  REPORTING_MANAGER: "Reporting Manager",
  EMPLOYEE: "Employee",
}

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email
  return local.charAt(0).toUpperCase() + local.slice(1)
}

function initialsFromName(name: string): string {
  return name.slice(0, 2).toUpperCase()
}

export function DashboardShell({
  navGroups,
  rootHref,
  children,
}: {
  navGroups: NavGroup[]
  rootHref: string
  children: React.ReactNode
}) {
  const { user, status } = useSession()

  const email = status === "authenticated" && user ? user.email : ""
  const userName = email ? displayNameFromEmail(email) : "…"
  const userInitials = email ? initialsFromName(userName) : "…"
  const roleLabel = status === "authenticated" && user ? ROLE_LABELS[user.role] : "…"

  return (
    <>
      <Sidebar navGroups={navGroups} rootHref={rootHref} userName={userName} userInitials={userInitials} roleLabel={roleLabel} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header userName={userName} userInitials={userInitials} userEmail={email || "…"} />
        <main className="mx-auto flex w-full max-w-[1220px] flex-1 flex-col px-7 pb-8">{children}</main>
      </div>
    </>
  )
}
