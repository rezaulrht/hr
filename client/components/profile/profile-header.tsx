"use client"

import type { ReactNode } from "react"

import type { EmployeeView, EmploymentStatus } from "@/lib/api/types"
import { AvatarUpload } from "@/components/profile/avatar-upload"
import { formatDateValue } from "@/components/profile/profile-card"
import { Tag } from "@/components/dashboard/tag"
import type { Tone } from "@/components/dashboard/types"

const STATUS_TONE: Record<EmploymentStatus, Tone> = {
  ACTIVE: "green",
  ON_LEAVE: "yellow",
  RESIGNED: "red",
  TERMINATED: "red",
}

const STATUS_LABEL: Record<EmploymentStatus, string> = {
  ACTIVE: "Active",
  ON_LEAVE: "On leave",
  RESIGNED: "Resigned",
  TERMINATED: "Terminated",
}

/**
 * Reads only the payload. The `employment` group is optional because a
 * COLLEAGUE-tier view genuinely does not have one — the code and status lines
 * are omitted rather than faked.
 */
export function ProfileHeader({
  employee,
  avatarEditable,
  onAvatarChanged,
  action,
}: {
  employee: EmployeeView
  avatarEditable: boolean
  onAvatarChanged: () => void
  action?: ReactNode
}) {
  const employment = employee.employment
  return (
    <div className="mb-5 flex flex-wrap items-start gap-4 rounded-md border border-[#E4E9EF] bg-white px-5.5 py-5">
      <AvatarUpload
        employeeId={employee.id}
        avatarUrl={employee.work.avatarUrl}
        fullName={employee.work.fullName}
        editable={avatarEditable}
        onChanged={onAvatarChanged}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="font-heading text-[21px] font-bold tracking-tight">
            {employee.work.fullName}
          </h1>
          {employment ? (
            <Tag tone={STATUS_TONE[employment.employmentStatus]} label={STATUS_LABEL[employment.employmentStatus]} />
          ) : null}
          {/* Independent of employmentStatus — see EmploymentDetails.accountActive. */}
          {employment && !employment.accountActive ? <Tag tone="red" label="No access" /> : null}
        </div>
        <div className="mt-0.5 text-[13px] text-[#7A8698]">
          {employee.work.designation} · {employee.work.department.name}
        </div>
        {employment ? (
          <div className="mt-1 text-[12.5px] text-[#A5AFBE]">
            {employment.employeeCode} · Joined {formatDateValue(employment.joiningDate)}
          </div>
        ) : null}
      </div>
      {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
    </div>
  )
}
