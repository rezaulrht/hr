"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { createUser, listUsers, setUserRole, setUserStatus } from "@/lib/api/users"
import { ApiError } from "@/lib/api/client"
import { useSession } from "@/lib/auth/session-context"
import type { CreateUserInput, Role, UserAccount } from "@/lib/api/types"
import { DataTable } from "@/components/dashboard/data-table"
import { MiniStat } from "@/components/dashboard/page-header"
import { Tag } from "@/components/dashboard/tag"
import type { TableCell } from "@/components/dashboard/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  HR_ADMIN: "HR Admin",
  FINANCE_OFFICER: "Finance Officer",
  REPORTING_MANAGER: "Reporting Manager",
  EMPLOYEE: "Employee",
}

/** Every role, for the role dialog. The server refuses the invalid moves. */
const ALL_ROLES: Role[] = [
  "SUPER_ADMIN",
  "HR_ADMIN",
  "FINANCE_OFFICER",
  "REPORTING_MANAGER",
  "EMPLOYEE",
]

/** Only the three with no Employee row — matches createUserSchema. */
const CREATABLE_ROLES: CreateUserInput["role"][] = ["HR_ADMIN", "FINANCE_OFFICER", "SUPER_ADMIN"]

function formatCreated(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function computeStats(users: UserAccount[]) {
  const deactivated = users.filter((u) => !u.isActive).length
  const admins = users.filter((u) => u.role === "SUPER_ADMIN" && u.isActive).length
  const staff = users.filter((u) => u.employee !== null).length

  return [
    {
      label: "Total accounts",
      value: String(users.length),
      sub: `${users.length - deactivated} active · ${deactivated} deactivated`,
    },
    {
      label: "Staff accounts",
      value: String(staff),
      sub: `${users.length - staff} administrative`,
    },
    // Promoted over anything else: this is the number that decides whether
    // the system can still be administered at all.
    {
      label: "Active super admins",
      value: String(admins),
      sub: admins <= 1 ? "The last one cannot be removed" : "Enough to avoid lockout",
    },
  ]
}

export function UsersPage() {
  const { accessToken, user, status: sessionStatus } = useSession()
  const queryClient = useQueryClient()

  const isAuthed = sessionStatus === "authenticated" && !!accessToken
  // Every endpoint is SUPER_ADMIN, so the controls render for nobody else.
  const canManage = user?.role === "SUPER_ADMIN"

  const [createOpen, setCreateOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [newRole, setNewRole] = useState<CreateUserInput["role"]>("HR_ADMIN")
  const [created, setCreated] = useState<{ email: string; temporaryPassword: string } | null>(null)
  const [roleTarget, setRoleTarget] = useState<UserAccount | null>(null)
  const [error, setError] = useState<string | null>(null)

  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: () => listUsers(accessToken!),
    enabled: isAuthed && canManage,
  })

  function handleError(err: unknown) {
    // Verbatim: the server's guards explain themselves ("This manager still
    // has 3 direct reports"), and a generic message would throw that away.
    setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
  }

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["users"] })
  }

  const createMutation = useMutation({
    mutationFn: () => createUser(accessToken!, { email: email.trim(), role: newRole }),
    onSuccess: (result) => {
      setError(null)
      setCreateOpen(false)
      setEmail("")
      setNewRole("HR_ADMIN")
      setCreated({ email: result.email, temporaryPassword: result.temporaryPassword })
      invalidate()
    },
    onError: handleError,
  })

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => setUserRole(accessToken!, id, role),
    onSuccess: () => {
      setError(null)
      setRoleTarget(null)
      invalidate()
    },
    onError: handleError,
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      setUserStatus(accessToken!, id, isActive),
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError: handleError,
  })

  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data])
  const stats = useMemo(() => computeStats(users), [users])

  const statusPending = statusMutation.isPending

  const rows: TableCell[][] = useMemo(
    () =>
      users.map((u) => [
        {
          node: (
            <div>
              <div className="font-semibold">{u.email}</div>
              <div className="text-[12px] text-[#7A8698]">
                {u.mustChangePassword
                  ? "Has not set a password yet"
                  : `Added ${formatCreated(u.createdAt)}`}
              </div>
            </div>
          ),
        },
        { text: ROLE_LABEL[u.role] },
        // The column that makes the page legible: which accounts are staff,
        // and which are pure administrative logins.
        u.employee ? { text: u.employee.fullName, sub: u.employee.employeeCode } : { text: "—" },
        {
          node: u.isActive ? (
            <Tag label="Active" tone="green" />
          ) : (
            <Tag label="Deactivated" tone="red" />
          ),
        },
        {
          node: (
            <div className="flex items-center justify-end gap-3 whitespace-nowrap">
              <Button
                variant="link"
                className="h-auto p-0 text-[12.5px] font-semibold underline"
                onClick={() => {
                  setError(null)
                  setRoleTarget(u)
                }}
              >
                Change role
              </Button>
              {/* No control on your own row: deactivating yourself revokes
                  your own session, and the server refuses it with a 409. */}
              {u.id === user?.id ? null : (
                <Button
                  variant="link"
                  className="h-auto p-0 text-[12.5px] font-semibold underline"
                  disabled={statusPending}
                  onClick={() => {
                    setError(null)
                    statusMutation.mutate({ id: u.id, isActive: !u.isActive })
                  }}
                >
                  {u.isActive ? "Deactivate" : "Reactivate"}
                </Button>
              )}
            </div>
          ),
        },
      ]),
    [users, user?.id, statusPending, statusMutation]
  )

  if (sessionStatus === "loading") {
    return (
      <div className="pt-7">
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!canManage) {
    return (
      <div className="mt-7 rounded-md border border-[#E4E9EF] bg-white p-5.5 text-[13px] text-[#7A8698]">
        Only a super admin can manage user accounts.
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 pt-7 pb-5.5">
        <div>
          <div className="mb-1.5 text-[11.5px] font-bold tracking-[1.1px] text-[#7A8698] uppercase">
            Administration
          </div>
          <h1 className="font-heading mb-1 text-[23px] font-bold tracking-tight">Users</h1>
          <div className="text-[13px] text-[#7A8698]">System accounts, roles and access</div>
        </div>
        <Button
          className="h-auto rounded-md bg-[#17191C] px-4 py-2.5 text-[13px] font-bold text-white hover:bg-[#0E1012]"
          onClick={() => {
            setError(null)
            setCreateOpen(true)
          }}
        >
          Create account
        </Button>
      </div>

      <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(215px,1fr))] gap-4">
        {stats.map((stat) => (
          <MiniStat key={stat.label} label={stat.label} value={stat.value} sub={stat.sub} />
        ))}
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-[#E4E9EF] bg-white px-5 py-3 text-[13px] text-[#B03A3A]">
          {error}
        </div>
      ) : null}

      {usersQuery.isPending ? (
        <div className="space-y-2 rounded-md border border-[#E4E9EF] bg-white p-5.5">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
        </div>
      ) : usersQuery.isError ? (
        <div className="rounded-md border border-[#E4E9EF] bg-white p-5.5 text-[13px] text-[#B03A3A]">
          Failed to load user accounts.{" "}
          <Button
            variant="link"
            className="h-auto p-0 font-semibold underline"
            onClick={() => usersQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : (
        <DataTable
          title="User accounts"
          cols="1.6fr 1fr 1.1fr 0.8fr 1fr"
          headers={["Account", "Role", "Employee", "Status", ""]}
          rows={rows}
          action={`${users.length} account${users.length === 1 ? "" : "s"}`}
        />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create an account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-[12.5px] text-[#7A8698]">
              For administrative logins only. An employee or manager account needs a
              department, designation and joining date — create those from Employees.
            </div>
            <div>
              <Label htmlFor="user-email" className="mb-1.5 text-xs font-bold">
                Email
              </Label>
              <Input
                id="user-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1.5 text-xs font-bold">Role</Label>
              <Select
                value={newRole}
                onValueChange={(v) => setNewRole(v as CreateUserInput["role"])}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: string | null) => (v ? ROLE_LABEL[v as Role] : "Select a role")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CREATABLE_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error ? <p className="text-[13px] font-semibold text-[#B03A3A]">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              disabled={!email.trim() || createMutation.isPending}
              className="bg-[#17191C] text-white hover:bg-[#0E1012]"
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? "Creating…" : "Create account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!created} onOpenChange={(open) => !open && setCreated(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Account created</DialogTitle>
          </DialogHeader>
          {created ? (
            <div className="space-y-3 text-[13.5px]">
              <p>
                <strong>{created.email}</strong> can now sign in with this temporary password.
              </p>
              <div className="rounded-md border border-[#E4E9EF] bg-[#F4F6F9] p-3 font-mono text-[13px]">
                {created.temporaryPassword}
              </div>
              <p className="text-[#7A8698]">
                Shown once and never retrievable again. They must change it on first sign-in.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigator.clipboard.writeText(created.temporaryPassword)}
              >
                Copy password
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!roleTarget} onOpenChange={(open) => !open && setRoleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change role — {roleTarget?.email}</DialogTitle>
          </DialogHeader>
          {roleTarget ? (
            <div className="space-y-4">
              <div className="text-[12.5px] text-[#7A8698]">
                An employee or manager role needs a linked employee record. Demoting a manager
                who still has direct reports is refused until they are reassigned.
              </div>
              <div>
                <Label className="mb-1.5 text-xs font-bold">Role</Label>
                <Select
                  value={roleTarget.role}
                  onValueChange={(v) =>
                    setRoleTarget({ ...roleTarget, role: (v as Role) ?? roleTarget.role })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v: string | null) => (v ? ROLE_LABEL[v as Role] : "Select a role")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {error ? <p className="text-[13px] font-semibold text-[#B03A3A]">{error}</p> : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRoleTarget(null)}
              disabled={roleMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              disabled={roleMutation.isPending}
              className="bg-[#17191C] text-white hover:bg-[#0E1012]"
              onClick={() =>
                roleTarget && roleMutation.mutate({ id: roleTarget.id, role: roleTarget.role })
              }
            >
              {roleMutation.isPending ? "Saving…" : "Save role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
