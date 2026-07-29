"use client"

import { useQueryClient } from "@tanstack/react-query"
import { RiNotification3Line } from "@remixicon/react"

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useSession } from "@/lib/auth/session-context"
import type { LeaveRequestItem } from "@/lib/api/types"
import { formatRange, STATUS_LABEL } from "@/components/leave/leave-shared"

const DECIDER_ROLES = ["HR_ADMIN", "SUPER_ADMIN"]

/**
 * A preview of what leave notifications would say, derived entirely from leave
 * data already in the React Query cache. Nothing is fetched, stored, or sent.
 *
 * Deliberately has no unread badge: a count implies something was delivered,
 * and HR must never believe an employee was told when no email left the system.
 */
export function NotificationBell() {
  const { user } = useSession()
  const queryClient = useQueryClient()

  const requests = queryClient.getQueryData<LeaveRequestItem[]>(["leave-requests"]) ?? []
  const isDecider = !!user && DECIDER_ROLES.includes(user.role)

  const items = (
    isDecider
      ? requests.filter((r) => r.status === "PENDING")
      : requests.filter((r) => r.status === "APPROVED" || r.status === "REJECTED")
  ).slice(0, 5)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="Notification preview"
            className="relative grid size-8.5 place-items-center rounded border border-[#E4E9EF] text-[#55657A] hover:bg-[#F4F6F9]"
          />
        }
      >
        <RiNotification3Line className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 min-w-80 p-0">
        <div className="border-b border-[#EEF1F5] px-3.5 py-2.5 text-[13px] font-bold">
          {isDecider ? "Awaiting your decision" : "Your leave updates"}
        </div>
        {items.length === 0 ? (
          <div className="px-3.5 py-4 text-[12.5px] text-[#7A8698]">Nothing to show yet.</div>
        ) : (
          <ul>
            {items.map((r) => (
              <li key={r.id} className="border-b border-[#EEF1F5] px-3.5 py-2.5 last:border-b-0">
                <div className="text-[13px] font-semibold">
                  {isDecider ? r.employee.fullName : r.leaveType.name}
                </div>
                <div className="text-[11.5px] text-[#7A8698]">
                  {isDecider ? r.leaveType.name : STATUS_LABEL[r.status]} ·{" "}
                  {formatRange(r.startDate, r.endDate)}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-[#EEF1F5] bg-[#F4F6F9] px-3.5 py-2.5 text-[11.5px] text-[#7A8698]">
          Delivery isn&apos;t enabled yet — this list is a preview.
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
