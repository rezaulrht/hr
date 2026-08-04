"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { getMyProfile } from "@/lib/api/employees"
import { useSession } from "@/lib/auth/session-context"
import type { EmployeeView } from "@/lib/api/types"
import { AccountOnlyCard } from "@/components/profile/account-only-card"
import { EditMyDetailsDialog } from "@/components/profile/edit-my-details-dialog"
import { ProfileCard, formatDateValue } from "@/components/profile/profile-card"
import { ProfileHeader } from "@/components/profile/profile-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  INTERN: "Intern",
}

export function MyProfilePage() {
  const { accessToken, status: sessionStatus } = useSession()
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)

  const profileQuery = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => getMyProfile(accessToken!),
    enabled: sessionStatus === "authenticated" && !!accessToken,
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["my-profile"] })

  if (sessionStatus === "loading" || profileQuery.isPending) {
    return (
      <div className="space-y-3 pt-7">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (profileQuery.isError) {
    return (
      <div className="mt-7 rounded-md border border-[#E4E9EF] bg-white p-5.5 text-[13px] text-[#B03A3A]">
        Failed to load your profile.{" "}
        <button className="font-semibold underline" onClick={() => profileQuery.refetch()}>
          Retry
        </button>
      </div>
    )
  }

  const { account, employee } = profileQuery.data

  return (
    <>
      <div className="pt-7 pb-5.5">
        <div className="mb-1.5 text-[11.5px] font-bold tracking-[1.1px] text-[#7A8698] uppercase">
          Account
        </div>
        <h1 className="font-heading text-[23px] font-bold tracking-tight">My Profile</h1>
      </div>

      {employee === null ? (
        <AccountOnlyCard account={account} />
      ) : (
        <StaffProfile
          employee={employee}
          onRefresh={refresh}
          editOpen={editOpen}
          setEditOpen={setEditOpen}
        />
      )}
    </>
  )
}

function StaffProfile({
  employee,
  onRefresh,
  editOpen,
  setEditOpen,
}: {
  employee: EmployeeView
  onRefresh: () => void
  editOpen: boolean
  setEditOpen: (open: boolean) => void
}) {
  const canEdit = employee.editableFields.length > 0

  return (
    <>
      <ProfileHeader
        employee={employee}
        avatarEditable={employee.editableFields.length > 0}
        onAvatarChanged={onRefresh}
        action={
          canEdit ? (
            <Button
              type="button"
              className="bg-[#17191C] text-white hover:bg-[#0E1012]"
              onClick={() => setEditOpen(true)}
            >
              Edit my details
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(310px,1fr))] gap-4">
        {employee.personal ? (
          <ProfileCard
            title="Personal"
            lockedHint="Date of birth, gender and national ID are maintained by HR."
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
            lockedHint="Your permanent address is the legal address of record and is changed by HR."
            rows={[
              {
                label: "Phone",
                value: employee.work.phone,
                hint: "Visible to colleagues in the staff directory",
              },
              { label: "Present address", value: employee.contact.presentAddress },
              { label: "Permanent address", value: employee.contact.permanentAddress },
              { label: "Emergency contact", value: employee.contact.emergencyContact },
            ]}
          />
        ) : null}

        {employee.employment ? (
          <ProfileCard
            title="Employment"
            lockedHint="Employment details are maintained by HR."
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
            lockedHint="Contact HR to update your bank details."
            rows={[
              {
                label: "Salary structure",
                value: employee.payroll.salaryStructure?.name ?? null,
              },
              { label: "Bank", value: employee.payroll.bankName },
              { label: "Account number", value: employee.payroll.bankAccountNumber },
              { label: "Routing number", value: employee.payroll.bankRoutingNumber },
            ]}
          />
        ) : null}

        {/* Rendered only when the person has actually left. An active employee
            should not see an empty card asking a question nobody posed. */}
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
      </div>

      <EditMyDetailsDialog
        employee={employee}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={onRefresh}
      />
    </>
  )
}
