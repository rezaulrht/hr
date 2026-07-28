import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
    <header className="flex h-15 items-center gap-4 border-b border-[#E4E9EF] bg-white px-7">
      <div className="ml-auto flex items-center gap-4.5">
        <NotificationBell />
        <div className="flex items-center gap-2.5">
          <Avatar className="size-8.5">
            <AvatarFallback className="bg-[#17191C] text-[12.5px] font-bold text-white">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold">{userName}</div>
            <div className="text-[11px] text-[#7A8698]">{userEmail}</div>
          </div>
        </div>
      </div>
    </header>
  )
}
