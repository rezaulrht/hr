"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"

import { listEmployees } from "@/lib/api/employees"
import { useSession } from "@/lib/auth/session-context"
import type { Employee } from "@/lib/api/types"
import { DataTable } from "@/components/dashboard/data-table"
import { MiniStat, PageHeader } from "@/components/dashboard/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import type { TableCell, Tone } from "@/components/dashboard/types"

const STATUS_TONE: Record<Employee["employmentStatus"], Tone> = {
  ACTIVE: "green",
  ON_LEAVE: "yellow",
  RESIGNED: "red",
  TERMINATED: "red",
}

const STATUS_LABEL: Record<Employee["employmentStatus"], string> = {
  ACTIVE: "Active",
  ON_LEAVE: "On leave",
  RESIGNED: "Resigned",
  TERMINATED: "Terminated",
}

function formatJoiningDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" })
}

function toRows(employees: Employee[]): TableCell[][] {
  return employees.map((e) => [
    { text: e.fullName, sub: e.email, weight: 600 },
    { text: e.department.name },
    { text: formatJoiningDate(e.joiningDate) },
    { tag: STATUS_LABEL[e.employmentStatus], tone: STATUS_TONE[e.employmentStatus] },
  ])
}

function computeStats(employees: Employee[]) {
  const now = new Date()
  const newThisMonth = employees.filter((e) => {
    const joined = new Date(e.joiningDate)
    return joined.getFullYear() === now.getFullYear() && joined.getMonth() === now.getMonth()
  }).length
  const departmentCount = new Set(employees.map((e) => e.department.id)).size

  return [
    { label: "Headcount", value: String(employees.length), sub: `${employees.length} total employees` },
    { label: "New this month", value: String(newThisMonth), sub: "Joined this calendar month" },
    { label: "Departments", value: String(departmentCount), sub: "Represented in the list below" },
  ]
}

export function EmployeesPage() {
  const { accessToken, status: sessionStatus } = useSession()

  const employeesQuery = useQuery({
    queryKey: ["employees"],
    queryFn: () => listEmployees(accessToken!),
    enabled: sessionStatus === "authenticated" && !!accessToken,
  })

  const stats = useMemo(() => computeStats(employeesQuery.data ?? []), [employeesQuery.data])
  const rows = useMemo(() => toRows(employeesQuery.data ?? []), [employeesQuery.data])

  return (
    <>
      <PageHeader kicker="Management" title="Employees" sub="Directory of all active employees" cta="Add employee" />
      <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(215px,1fr))] gap-4">
        {stats.map((stat) => (
          <MiniStat key={stat.label} label={stat.label} value={stat.value} sub={stat.sub} />
        ))}
      </div>
      {employeesQuery.isLoading ? (
        <div className="space-y-2 rounded-md border border-[#E4E9EF] bg-white p-5.5">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
        </div>
      ) : employeesQuery.isError ? (
        <div className="rounded-md border border-[#E4E9EF] bg-white p-5.5 text-[13px] text-[#B03A3A]">
          Failed to load employees.{" "}
          <button className="font-semibold underline" onClick={() => employeesQuery.refetch()}>
            Retry
          </button>
        </div>
      ) : (
        <DataTable title="Directory" cols="1.5fr 1fr 0.9fr 0.9fr" headers={["Employee", "Department", "Joined", "Status"]} rows={rows} />
      )}
    </>
  )
}
