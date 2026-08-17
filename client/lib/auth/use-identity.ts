"use client"

import { useQuery } from "@tanstack/react-query"

import { getMyProfile } from "@/lib/api/employees"
import { useSession } from "@/lib/auth/session-context"
import type { Role } from "@/lib/api/types"

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  HR_ADMIN: "HR Admin",
  FINANCE_OFFICER: "Finance Officer",
  REPORTING_MANAGER: "Reporting Manager",
  EMPLOYEE: "Employee",
}

export interface Identity {
  /** The person's real name once the profile lands; before that, and for the
      administrative roles that have no Employee row, a name derived from the
      email local part. */
  name: string
  initials: string
  email: string
  avatarUrl: string | null
  /** Designation for staff, role label for administrative accounts. The line
      under the name in the sidebar and the account menu. */
  subtitle: string
  roleLabel: string
  /** True only while the session itself is resolving. The profile query
      settling later is not a loading state — the header already has a name to
      show by then, and blanking it out would be a step backwards. */
  loading: boolean
}

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email
  // `rezaul.karim` and `rezaul_karim` are both a first and last name wearing a
  // separator. Splitting them is what makes the initials read as initials.
  const words = local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  return words.length > 0 ? words.join(" ") : email
}

export function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Who is signed in, for the chrome that has to say so — the header menu and
 * the sidebar footer.
 *
 * Until this existed both of those showed a name invented from the email local
 * part, so someone signing in as `md.rezaul@…` was greeted as "Md.rezaul" and
 * had no avatar anywhere. The real name and photo live on the Employee record,
 * one fetch away.
 *
 * Shares the `["my-profile"]` query key with the profile page on purpose: the
 * chrome renders on every route, so by the time anyone opens My Profile the
 * data is already cached, and the two can never disagree about a name.
 */
export function useIdentity(): Identity {
  const { accessToken, user, status } = useSession()
  const authed = status === "authenticated" && !!accessToken

  const { data } = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => getMyProfile(accessToken!),
    enabled: authed,
  })

  const email = authed && user ? user.email : ""
  const roleLabel = authed && user ? ROLE_LABELS[user.role] : ""
  const work = data?.employee?.work

  const name = work?.fullName ?? (email ? nameFromEmail(email) : "")

  return {
    name,
    initials: name ? initialsFrom(name) : "",
    email,
    avatarUrl: work?.avatarUrl ?? null,
    subtitle: work?.designation ?? roleLabel,
    roleLabel,
    loading: status === "loading",
  }
}
