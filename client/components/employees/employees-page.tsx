"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { createStaffAccount, listEmployees } from "@/lib/api/employees"
import { listDepartments } from "@/lib/api/departments"
import { ApiError } from "@/lib/api/client"
import { useSession } from "@/lib/auth/session-context"
import { parseDateString, toDateString } from "@/lib/utils"
import type { CreateStaffAccountInput, CreateStaffAccountResult, Department, Employee } from "@/lib/api/types"
import { DataTable } from "@/components/dashboard/data-table"
import { MiniStat } from "@/components/dashboard/page-header"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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

const EMPLOYMENT_TYPES: { value: CreateStaffAccountInput["employmentType"]; label: string }[] = [
  { value: "FULL_TIME", label: "Full-time" },
  { value: "PART_TIME", label: "Part-time" },
  { value: "CONTRACT", label: "Contract" },
  { value: "INTERN", label: "Intern" },
]

const STAFF_ROLES: { value: CreateStaffAccountInput["role"]; label: string }[] = [
  { value: "EMPLOYEE", label: "Employee" },
  { value: "REPORTING_MANAGER", label: "Reporting Manager" },
]

function todayIso(): string {
  return toDateString(new Date())
}

export function EmployeesPage() {
  const { accessToken, status: sessionStatus } = useSession()
  const queryClient = useQueryClient()

  const [createOpen, setCreateOpen] = useState(false)
  const [result, setResult] = useState<CreateStaffAccountResult | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<CreateStaffAccountInput["role"]>("EMPLOYEE")
  const [designation, setDesignation] = useState("")
  const [departmentId, setDepartmentId] = useState("")
  const [employmentType, setEmploymentType] = useState<CreateStaffAccountInput["employmentType"]>("FULL_TIME")
  const [joiningDate, setJoiningDate] = useState(todayIso())

  const employeesQuery = useQuery({
    queryKey: ["employees"],
    queryFn: () => listEmployees(accessToken!),
    enabled: sessionStatus === "authenticated" && !!accessToken,
  })

  const departmentsQuery = useQuery({
    queryKey: ["departments"],
    queryFn: () => listDepartments(accessToken!),
    enabled: sessionStatus === "authenticated" && !!accessToken,
  })

  const createMutation = useMutation({
    mutationFn: (input: CreateStaffAccountInput) => createStaffAccount(accessToken!, input),
    onSuccess: (created) => {
      setResult(created)
      setCreateOpen(false)
      queryClient.invalidateQueries({ queryKey: ["employees"] })
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
    },
  })

  function resetForm() {
    setFullName("")
    setEmail("")
    setRole("EMPLOYEE")
    setDesignation("")
    setDepartmentId("")
    setEmploymentType("FULL_TIME")
    setJoiningDate(todayIso())
    setFormError(null)
  }

  function handleOpenCreate() {
    resetForm()
    setCreateOpen(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!fullName || !email || !designation || !departmentId || !joiningDate) {
      setFormError("All fields are required.")
      return
    }
    createMutation.mutate({ fullName, email, role, designation, departmentId, employmentType, joiningDate })
  }

  const stats = useMemo(() => computeStats(employeesQuery.data ?? []), [employeesQuery.data])
  const rows = useMemo(() => toRows(employeesQuery.data ?? []), [employeesQuery.data])
  const departments: Department[] = departmentsQuery.data ?? []

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 pt-7 pb-5.5">
        <div>
          <div className="mb-1.5 text-[11.5px] font-bold tracking-[1.1px] text-[#7A8698] uppercase">Management</div>
          <h1 className="font-heading mb-1 text-[23px] font-bold tracking-tight">Employees</h1>
          <div className="text-[13px] text-[#7A8698]">Directory of all active employees</div>
        </div>
        <Button
          className="h-auto rounded-md bg-[#17191C] px-4 py-2.5 text-[13px] font-bold text-white hover:bg-[#0E1012]"
          onClick={handleOpenCreate}
        >
          Add employee
        </Button>
      </div>
      <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(215px,1fr))] gap-4">
        {stats.map((stat) => (
          <MiniStat key={stat.label} label={stat.label} value={stat.value} sub={stat.sub} />
        ))}
      </div>
      {sessionStatus === "loading" || employeesQuery.isPending ? (
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add employee</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="fullName" className="mb-1.5 text-xs font-bold">Full name</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="email" className="mb-1.5 text-xs font-bold">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label className="mb-1.5 text-xs font-bold">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as CreateStaffAccountInput["role"])}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(v: string | null) => STAFF_ROLES.find((r) => r.value === v)?.label ?? v}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {STAFF_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="designation" className="mb-1.5 text-xs font-bold">Designation</Label>
              <Input id="designation" value={designation} onChange={(e) => setDesignation(e.target.value)} required />
            </div>
            <div>
              <Label className="mb-1.5 text-xs font-bold">Department</Label>
              <Select value={departmentId} onValueChange={(v) => setDepartmentId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: string | null) => departments.find((d) => d.id === v)?.name ?? "Select a department"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 text-xs font-bold">Employment type</Label>
              <Select
                value={employmentType}
                onValueChange={(v) => setEmploymentType(v as CreateStaffAccountInput["employmentType"])}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: string | null) => EMPLOYMENT_TYPES.find((t) => t.value === v)?.label ?? v}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 text-xs font-bold">Joining date</Label>
              <Popover>
                <PopoverTrigger
                  render={<Button type="button" variant="outline" className="w-full justify-start font-normal" />}
                >
                  {joiningDate}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={parseDateString(joiningDate)}
                    onSelect={(d) => d && setJoiningDate(toDateString(d))}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {formError ? <p className="text-[13px] font-semibold text-[#B03A3A]">{formError}</p> : null}

            <DialogFooter>
              <Button type="submit" disabled={createMutation.isPending} className="bg-[#17191C] text-white hover:bg-[#0E1012]">
                {createMutation.isPending ? "Creating…" : "Create employee"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!result} onOpenChange={(open) => !open && setResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Employee created</DialogTitle>
          </DialogHeader>
          {result ? (
            <div className="space-y-3 text-[13.5px]">
              <p>
                <strong>{result.fullName}</strong> ({result.email}) has been created as <strong>{result.employeeCode}</strong>.
              </p>
              <div className="rounded-md border border-[#E4E9EF] bg-[#F4F6F9] p-3 font-mono text-[13px]">
                {result.temporaryPassword}
              </div>
              <p className="text-[#7A8698]">
                This temporary password is shown once. It has also been emailed (or logged to the server console in
                dev mode) to the new hire.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigator.clipboard.writeText(result.temporaryPassword)}
              >
                Copy password
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
