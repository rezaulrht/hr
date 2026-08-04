"use client"

import type { EmployeeView } from "@/lib/api/types"
import { initialsFrom } from "@/components/profile/avatar-upload"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

/**
 * Seven fields of work identity. A dialog rather than a route: seven fields do
 * not warrant a page, a back button and a loading state.
 *
 * Email and phone are mailto:/tel: links because looking someone up in a
 * directory is almost always the step before contacting them.
 */
export function ColleagueDialog({
  employee,
  onOpenChange,
}: {
  employee: EmployeeView | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={!!employee} onOpenChange={onOpenChange}>
      <DialogContent>
        {employee ? (
          <>
            <DialogHeader>
              <DialogTitle>{employee.work.fullName}</DialogTitle>
            </DialogHeader>
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#EFF2F6]">
                {employee.work.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={employee.work.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[19px] font-bold text-[#55657A]">
                    {initialsFrom(employee.work.fullName)}
                  </span>
                )}
              </div>
              <dl className="min-w-0 flex-1 space-y-2.5 text-[13.5px]">
                <Row label="Designation" value={employee.work.designation} />
                <Row label="Department" value={employee.work.department.name} />
                <Row
                  label="Email"
                  value={employee.work.email}
                  href={`mailto:${employee.work.email}`}
                />
                <Row
                  label="Phone"
                  value={employee.work.phone}
                  href={employee.work.phone ? `tel:${employee.work.phone}` : undefined}
                />
                <Row
                  label="Reports to"
                  value={employee.work.reportingManager?.fullName ?? null}
                />
              </dl>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function Row({ label, value, href }: { label: string; value: string | null; href?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,110px)_1fr] gap-3">
      <dt className="text-[12.5px] font-semibold text-[#7A8698]">{label}</dt>
      <dd className="min-w-0 break-words">
        {value === null ? (
          "—"
        ) : href ? (
          <a href={href} className="underline">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  )
}
