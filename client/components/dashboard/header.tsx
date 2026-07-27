import { RiNotification3Line } from "@remixicon/react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"

export function Header({
  userName,
  userInitials,
  userEmail,
  notifCount = 3,
}: {
  userName: string
  userInitials: string
  userEmail: string
  notifCount?: number
}) {
  return (
    <header className="flex h-15 items-center gap-4 border-b border-[#E4E9EF] bg-white px-7">
      <div className="ml-auto flex items-center gap-4.5">
        <div className="relative grid size-8.5 place-items-center rounded border border-[#E4E9EF] text-[#55657A] hover:bg-[#F4F6F9]">
          <RiNotification3Line className="size-4" />
          <span className="absolute -top-1 -right-1 grid h-[15px] min-w-[15px] place-items-center rounded bg-[#D64545] px-0.5 text-[9.5px] font-bold text-white">
            {notifCount}
          </span>
        </div>
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
