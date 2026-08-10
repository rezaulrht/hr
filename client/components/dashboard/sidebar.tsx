"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { RiLoader4Line, RiLogoutBoxRLine } from "@remixicon/react"

import { cn } from "@/lib/utils"
import { BrandLogo } from "@/components/brand/brand"
import { icons } from "@/components/dashboard/icons"
import { getDashboard } from "@/lib/api/dashboard"
import { useSession } from "@/lib/auth/session-context"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import {
  Sidebar as UiSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
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
  const { accessToken, clearSession, status } = useSession()
  const [signingOut, setSigningOut] = useState(false)
  // Closing the drawer on navigation is ours to do — the sidebar primitive has
  // no router awareness, so without this the overlay stays sitting over the
  // page you just navigated to.
  const { setOpenMobile } = useSidebar()

  // The same `["dashboard"]` query the landing page uses, so a badge and the
  // card it mirrors are always the same number. Two sources drift, and the
  // one that drifts is always the one nobody is looking at.
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => getDashboard(accessToken!),
    enabled: status === "authenticated" && !!accessToken,
  })
  const badges = data?.badges ?? {}

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
    <UiSidebar collapsible="offcanvas" className="border-r-0">
      <div className="flex h-full flex-col bg-linear-to-b from-[#17191C] to-[#0B0D0F] px-3 pt-[18px] pb-3.5 text-white">
        <SidebarHeader className="mb-1.5 gap-4 p-0 px-2.5 pt-1 pb-4">
          {/* The lockup already carries the tagline, so the only line worth
              adding here is which system you are in. */}
          <div className="grid gap-2">
            <BrandLogo tone="dark" width={172} />
            <div className="px-0.5 text-[10.5px] tracking-widest text-white/50">HR &amp; Payroll</div>
          </div>
          <Separator className="bg-white/10" />
        </SidebarHeader>

        <SidebarContent className="flex-1 gap-0 overflow-y-auto">
          {navGroups.map((group) => (
            <SidebarGroup key={group.label} className="p-0">
              <SidebarGroupLabel className="h-auto px-3 pt-3.5 pb-1.5 text-[10px] font-bold tracking-[1.2px] text-white/38 uppercase">
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {group.items.map((item) => {
                    const active =
                      item.href === rootHref ? pathname === item.href : pathname.startsWith(item.href)
                    const Icon = icons[item.icon]
                    const badge = badges[item.href]
                    return (
                      <SidebarMenuItem key={item.href}>
                        {/* base-nova is Base UI under the hood: composition is
                            the `render` prop, not `asChild`. */}
                        <SidebarMenuButton
                          render={<Link href={item.href} />}
                          isActive={active}
                          onClick={() => setOpenMobile(false)}
                          className={cn(
                            "h-auto rounded px-3 py-2 text-[13px] transition-colors hover:bg-white/10 hover:text-white active:bg-white/10 active:text-white",
                            active
                              ? "bg-white/15 font-bold text-white data-active:bg-white/15 data-active:font-bold data-active:text-white"
                              : "font-medium text-white/68"
                          )}
                        >
                          <Icon
                            className={cn("size-[17px] shrink-0", active ? "opacity-100" : "opacity-75")}
                          />
                          <span className="flex-1">{item.label}</span>
                          {badge ? (
                            <span className="grid h-[17px] min-w-[18px] place-items-center rounded bg-[#B6BDC6] px-1 text-[10px] font-extrabold text-[#101214]">
                              {badge}
                            </span>
                          ) : null}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter className="mt-3 flex-row items-center gap-2.5 rounded-md border border-white/[0.09] bg-white/[0.07] px-3 py-2.5">
          <Avatar className="shrink-0">
            <AvatarFallback className="bg-[#9AA3AD] text-xs font-bold text-[#101214]">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="overflow-hidden text-[12.5px] font-semibold text-ellipsis whitespace-nowrap">
              {userName}
            </div>
            <div className="text-[10.5px] text-white/55">{roleLabel}</div>
          </div>
          {/* Stays a raw button: a 28px icon-only control with bespoke dark
              styling gains nothing from ui/button and would fight it. */}
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
        </SidebarFooter>
      </div>
    </UiSidebar>
  )
}
