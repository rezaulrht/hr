import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { NotificationBell } from "@/components/dashboard/notification-bell"

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
      {/* The permanent sidebar takes over at lg, so the trigger retires there. */}
      <SidebarTrigger className="lg:hidden" />
      <div className="ml-auto flex items-center gap-3 sm:gap-4.5">
        <NotificationBell />
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
            <div className="text-[11px] text-[#7A8698]">{userEmail}</div>
          </div>
        </div>
      </div>
    </header>
  )
}
