"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { RiLoader4Line, RiLogoutBoxRLine } from "@remixicon/react"

import { cn } from "@/lib/utils"
import { icons } from "@/components/dashboard/icons"
import { useSession } from "@/lib/auth/session-context"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import type { NavGroup } from "@/components/dashboard/types"

export function Sidebar({
  navGroups,
  rootHref,
  userName,
  userInitials,
  roleLabel,
}: {
  navGroups: NavGroup[]
  rootHref: string
  userName: string
  userInitials: string
  roleLabel: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { clearSession } = useSession()
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    // clearSession revokes the refresh token and drops the in-memory access
    // token; it swallows network errors so a failed call still logs you out
    // locally rather than trapping you in the dashboard.
    await clearSession()
    // Wipe cached rows too. Query keys like ["leave-requests"] aren't
    // per-user, so without this the next person to sign in on this browser
    // would briefly see the previous user's data before the refetch lands.
    queryClient.clear()
    // replace, not push — the dashboard must not come back via the back button.
    router.replace("/login")
  }

  return (
    <aside className="flex w-[236px] shrink-0 flex-col bg-linear-to-b from-[#17191C] to-[#0B0D0F] px-3 pt-[18px] pb-3.5 text-white">
      <div className="mb-1.5 flex flex-col gap-4 px-2.5 pt-1 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="grid size-8.5 shrink-0 place-items-center rounded bg-linear-to-br from-white to-[#D4D9DE] font-heading text-base font-extrabold text-[#17191C]">
            P
          </div>
          <div className="leading-tight">
            <div className="font-heading text-[14.5px] font-bold tracking-wide">PeopleCore</div>
            <div className="text-[10.5px] tracking-widest text-white/50">HR &amp; Payroll</div>
          </div>
        </div>
        <Separator className="bg-white/10" />
      </div>

      <nav className="flex flex-1 flex-col overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.label}>
            <div className="px-3 pt-3.5 pb-1.5 text-[10px] font-bold tracking-[1.2px] text-white/38 uppercase">
              {group.label}
            </div>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = item.href === rootHref ? pathname === item.href : pathname.startsWith(item.href)
                const Icon = icons[item.icon]
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 rounded px-3 py-2 text-[13px] transition-colors hover:bg-white/10 hover:text-white",
                      active ? "bg-white/15 font-bold text-white" : "font-medium text-white/68"
                    )}
                  >
                    <Icon className={cn("size-[17px] shrink-0", active ? "opacity-100" : "opacity-75")} />
                    <span className="flex-1">{item.label}</span>
                    {item.badge ? (
                      <span className="grid h-[17px] min-w-[18px] place-items-center rounded bg-[#B6BDC6] px-1 text-[10px] font-extrabold text-[#101214]">
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-3 flex items-center gap-2.5 rounded-md border border-white/[0.09] bg-white/[0.07] px-3 py-2.5">
        <Avatar className="shrink-0">
          <AvatarFallback className="bg-[#9AA3AD] text-xs font-bold text-[#101214]">{userInitials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="overflow-hidden text-[12.5px] font-semibold text-ellipsis whitespace-nowrap">
            {userName}
          </div>
          <div className="text-[10.5px] text-white/55">{roleLabel}</div>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          title="Sign out"
          aria-label="Sign out"
          className="grid size-7 shrink-0 place-items-center rounded text-white/55 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
        >
          {signingOut ? (
            <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <RiLogoutBoxRLine className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </aside>
  )
}
