"use client"

import { RiMenuLine } from "@remixicon/react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useSidebar } from "@/components/ui/sidebar"
import { NotificationBell } from "@/components/dashboard/notification-bell"
import { HelpTrigger } from "@/components/help/help-sheet"

/**
 * Deliberately not `SidebarTrigger`: that primitive hard-codes a panel-toggle
 * glyph as its JSX children, which a caller cannot override. The design
 * reference calls for a hamburger, so this drives `toggleSidebar` itself.
 */
function MenuButton() {
  const { toggleSidebar } = useSidebar()

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label="Open menu"
      // The permanent sidebar takes over at lg, so the trigger retires there.
      className="size-9 shrink-0 rounded border-[#E4E9EF] text-[#17191C] hover:bg-[#F4F6F9] lg:hidden"
      onClick={toggleSidebar}
    >
      <RiMenuLine className="size-4" />
    </Button>
  )
}

export function Header({
  userName,
  userInitials,
  userEmail,
}: {
  userName: string
  userInitials: string
  userEmail: string
}) {
  return (
    <header className="flex h-15 items-center gap-4 border-b border-[#E4E9EF] bg-white px-4 sm:px-7">
      <MenuButton />
      {/* Do not change the outer gap — the grouping div below is what keeps
          the avatar block from moving when the help control is absent. The
          `?` sits left of the bell: the bell is the older, more frequently
          used control and should not move. HelpTrigger renders nothing outside
          the accounting section, so the header keeps its current shape
          everywhere else. */}
      <div className="ml-auto flex items-center gap-3 sm:gap-4.5">
        <div className="flex items-center gap-2">
          <HelpTrigger />
          <NotificationBell />
        </div>
        <div className="flex items-center gap-2.5">
          <Avatar className="size-8.5">
            <AvatarFallback className="bg-[#17191C] text-[12.5px] font-bold text-white">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          {/* Per the design reference, the name/email block drops on narrow
              screens and the avatar carries the identity on its own. */}
          <div className="hidden leading-tight lg:block">
            <div className="text-[13px] font-semibold">{userName}</div>
            <div className="text-[11px] text-[#5F6B7C]">{userEmail}</div>
          </div>
        </div>
      </div>
    </header>
  )
}
