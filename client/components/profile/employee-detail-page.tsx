"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { getEmployee } from "@/lib/api/employees"
import { useSession } from "@/lib/auth/session-context"
import type { EmployeeView } from "@/lib/api/types"
import { DocumentsCard } from "@/components/profile/documents-card"
import { LeaveBalanceCard } from "@/components/profile/leave-balance-card"
import { ProfileCard, formatDateValue } from "@/components/profile/profile-card"
import { ProfileHeader } from "@/components/profile/profile-header"
import { ProfileInsights } from "@/components/profile/profile-insights"
import { Skeleton } from "@/components/ui/skeleton"

const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  INTERN: "Intern",
}

/**
 * Renders whichever groups are present in the payload.
 *
 * There is no role check anywhere in this file. The server projects by tier,
 * so a group the caller cannot see is a key that is absent — and because every
 * group key on `EmployeeView` is optional, reading one without a guard fails
 * `tsc` rather than crashing at runtime.
 *
 * The alternative — the client deciding what to show from the viewer's role —
 * means the same matrix is written twice, and when the two drift the laxer one
 * promises data the server will not return.
 */
export function EmployeeDetailPage({
  employeeId,
  backHref,
}: {
  employeeId: string
  backHref: string
}) {
  const { accessToken, status: sessionStatus } = useSession()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<string | null>(null)

  const employeeQuery = useQuery({
    queryKey: ["employee", employeeId],
    queryFn: () => getEmployee(accessToken!, employeeId),
    enabled: sessionStatus === "authenticated" && !!accessToken,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["employee", employeeId] })
    queryClient.invalidateQueries({ queryKey: ["employees"] })
  }

  if (sessionStatus === "loading" || employeeQuery.isPending) {
    return (
      <div className="space-y-3 pt-7">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (employeeQuery.isError) {
    return (
      <div className="mt-7 rounded-md border border-[#E4E9EF] bg-white p-5.5 text-[13px] text-[#B03A3A]">
        Could not load this employee.{" "}
        <button className="font-semibold underline" onClick={() => employeeQuery.refetch()}>
          Retry
        </button>
      </div>
    )
  }

  const employee: EmployeeView = employeeQuery.data
  const canEdit = employee.editableFields.length > 0

  return (
    <>
      <div className="pt-7 pb-4">
        <Link href={backHref} className="text-[12.5px] font-semibold text-[#7A8698] hover:underline">
          ← Back
        </Link>
      </div>

      <ProfileHeader
        employee={employee}
        avatarEditable={canEdit}
        onAvatarChanged={refresh}
      />

      {/* FULL only — blockers arrive for SELF and FULL, and this page is never
          SELF. Every blocker here is actionable, because the person reading
          the page is the person who resolves them. */}
      {(employee.blockers ?? []).length > 0 ? (
        <div className="mb-5 space-y-1.5">
          {employee.blockers!.map((b) => (
            <div
              key={`${b.field}-${b.blocks}`}
              className="rounded-md border border-[#F0DCC0] bg-[#FDF7EE] px-4 py-2.5 text-[13px] text-[#8A5A1E]"
            >
              {b.blocks}
            </div>
          ))}
        </div>
      ) : null}

      <ProfileInsights employeeId={employeeId} />

      <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(310px,1fr))] gap-4">
        {employee.personal ? (
          <ProfileCard
            title="Personal"
            rows={[
              { label: "Date of birth", value: formatDateValue(employee.personal.dateOfBirth) },
              { label: "Gender", value: employee.personal.gender },
              { label: "National ID", value: employee.personal.nationalId },
              { label: "Blood group", value: employee.personal.bloodGroup },
              { label: "Marital status", value: employee.personal.maritalStatus },
            ]}
          />
        ) : null}

        {employee.contact ? (
          <ProfileCard
            title="Contact"
            rows={[
              { label: "Phone", value: employee.work.phone },
              { label: "Present address", value: employee.contact.presentAddress },
              { label: "Permanent address", value: employee.contact.permanentAddress },
              { label: "Emergency contact", value: employee.contact.emergencyContact },
            ]}
          />
        ) : null}

        {employee.employment ? (
          <ProfileCard
            title="Employment"
            rows={[
              { label: "Employee code", value: employee.employment.employeeCode },
              {
                label: "Employment type",
                value: EMPLOYMENT_TYPE_LABEL[employee.employment.employmentType] ?? null,
              },
              { label: "Joining date", value: formatDateValue(employee.employment.joiningDate) },
              { label: "Office location", value: employee.employment.officeLocation },
              { label: "Shift", value: employee.employment.shift?.name ?? null },
              {
                label: "Reporting manager",
                value: employee.work.reportingManager?.fullName ?? null,
              },
            ]}
          />
        ) : null}

        {employee.payroll ? (
          <ProfileCard
            title="Payroll"
            rows={[
              { label: "Salary structure", value: employee.payroll.salaryStructure?.name ?? null },
              { label: "Bank", value: employee.payroll.bankName },
              { label: "Account number", value: employee.payroll.bankAccountNumber },
              { label: "Routing number", value: employee.payroll.bankRoutingNumber },
            ]}
          />
        ) : null}

        {employee.exit ? (
          <ProfileCard
            title="Exit"
            rows={[
              { label: "Last working day", value: formatDateValue(employee.exit.lastWorkingDay) },
              { label: "Reason", value: employee.exit.exitReason },
              { label: "Note", value: employee.exit.exitNote },
            ]}
          />
        ) : null}

        {/* Fetched separately: it comes from the leave module, not the employee
            payload, and a slow leave query should not delay the field cards. */}
        <LeaveBalanceCard employeeId={employeeId} />

        {employee.documents ? (
          <DocumentsCard employeeId={employee.id} documents={employee.documents} />
        ) : null}
      </div>
    </>
  )
}
