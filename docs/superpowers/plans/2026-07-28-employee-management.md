# Employee Management (List + Create) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static mock employee directory on `/hr/employees` and `/admin/employees` with a real, database-backed list and a working "Add employee" creation flow, and wire the dashboard header/sidebar to the real logged-in user as a byproduct of being the first page to make authenticated API calls.

**Architecture:** Two new small Express endpoints (`GET /api/employees`, `GET /api/departments`) built on the existing `server/src/modules/employee/` module and a new `server/src/modules/department/` module. On the client, a new `lib/api/employees.ts` + `lib/api/departments.ts` fetch layer, React Query (already a dependency, newly wired up) for list/create state, a shared `EmployeesPage` client component rendered by both role routes, and a shared `DashboardShell` client component replacing the 5 layouts' hardcoded mock-user props with `useSession()`.

**Tech Stack:** Express 5, Prisma 7, Zod (existing conventions) on the backend; Next.js 16, React Query 5, shadcn `Dialog`/`Select`/`Calendar`/`Popover`/`Skeleton` on the frontend.

## Global Constraints

- `GET /api/employees` and `POST /api/employees/staff` (existing): `requireAuth` + `requireRole(SUPER_ADMIN, HR_ADMIN)` — same permission for list as create.
- `GET /api/departments`: `requireAuth` only (any authenticated role) — read access to a name list isn't sensitive.
- No pagination, search, edit, delete, or detail-view pages in this pass (explicitly out of scope per the design spec).
- No reporting-manager picker in the create form (backend field stays unset/omitted).
- Header/sidebar "real user" display is email-derived (no full-name endpoint) — `userName` = local part of email, title-cased; `userInitials` = first 1-2 letters of that, uppercased; `roleLabel` mapped from the `Role` enum.
- Design spec (full detail, read if anything here is ambiguous): `docs/superpowers/specs/2026-07-28-employee-management-design.md`

---

### Task 1: Backend — `GET /api/employees` (list)

**Files:**
- Modify: `server/src/modules/employee/employee.types.ts`
- Modify: `server/src/modules/employee/employee.service.ts`
- Modify: `server/src/modules/employee/employee.controller.ts`
- Modify: `server/src/modules/employee/employee.routes.ts`
- Test: `server/src/modules/employee/employee.service.test.ts` (add a `describe` block)
- Test: `server/src/modules/employee/employee.routes.test.ts` (add a `describe` block)

**Interfaces:**
- Consumes: `prisma` (`server/src/config/prisma.ts`), `requireAuth`, `requireRole` (existing middleware), `Role` enum
- Produces: `listEmployees(): Promise<EmployeeListItem[]>` (service), `GET /api/employees` route — consumed by Task 5 (frontend list)

- [ ] **Step 1: Write the failing service test**

Add to `server/src/modules/employee/employee.service.test.ts`, after the existing mock setup at the top of the file, extend the `vi.mock("../../config/prisma", ...)` factory:

```ts
vi.mock("../../config/prisma", () => ({
  default: {
    $transaction: vi.fn((fn: any) => fn(txMock)),
    employee: { findMany: vi.fn() },
  },
}))
```

Add this import near the top (alongside the existing `createStaffAccount` import):

```ts
import prisma from "../../config/prisma"
import { createStaffAccount, listEmployees } from "./employee.service"
```

(Replace the existing `import { createStaffAccount } from "./employee.service"` line with the combined one above.)

Append this `describe` block to the end of the file:

```ts
describe("listEmployees", () => {
  it("returns employees mapped to the list shape, ordered by fullName", async () => {
    vi.mocked(prisma.employee.findMany).mockResolvedValue([
      {
        id: "e1",
        employeeCode: "BS-EMP-00002",
        fullName: "Bea Smith",
        designation: "Analyst",
        employmentType: "FULL_TIME",
        employmentStatus: "ACTIVE",
        joiningDate: new Date("2026-01-15T00:00:00.000Z"),
        department: { id: "d1", name: "Engineering" },
        user: { email: "bea@b.com" },
      },
      {
        id: "e2",
        employeeCode: "BS-EMP-00001",
        fullName: "Alice Doe",
        designation: "Lead",
        employmentType: "CONTRACT",
        employmentStatus: "ON_LEAVE",
        joiningDate: new Date("2025-11-01T00:00:00.000Z"),
        department: { id: "d2", name: "Sales" },
        user: { email: "alice@b.com" },
      },
    ] as any)

    const result = await listEmployees()

    expect(prisma.employee.findMany).toHaveBeenCalledWith({
      include: { department: true, user: true },
      orderBy: { fullName: "asc" },
    })
    expect(result).toEqual([
      {
        id: "e1",
        employeeCode: "BS-EMP-00002",
        fullName: "Bea Smith",
        email: "bea@b.com",
        designation: "Analyst",
        department: { id: "d1", name: "Engineering" },
        employmentType: "FULL_TIME",
        employmentStatus: "ACTIVE",
        joiningDate: "2026-01-15T00:00:00.000Z",
      },
      {
        id: "e2",
        employeeCode: "BS-EMP-00001",
        fullName: "Alice Doe",
        email: "alice@b.com",
        designation: "Lead",
        department: { id: "d2", name: "Sales" },
        employmentType: "CONTRACT",
        employmentStatus: "ON_LEAVE",
        joiningDate: "2025-11-01T00:00:00.000Z",
      },
    ])
  })

  it("returns an empty array when there are no employees", async () => {
    vi.mocked(prisma.employee.findMany).mockResolvedValue([])
    const result = await listEmployees()
    expect(result).toEqual([])
  })
})
```

- [ ] **Step 2: Run the service test to verify it fails**

```bash
cd server
npx vitest run src/modules/employee/employee.service.test.ts
```

Expected: FAIL — `listEmployees` is not exported

- [ ] **Step 3: Implement the service function and type**

Add to `server/src/modules/employee/employee.types.ts` (append):

```ts
export interface EmployeeListItem {
  id: string
  employeeCode: string
  fullName: string
  email: string
  designation: string
  department: { id: string; name: string }
  employmentType: CreateStaffAccountInput["employmentType"]
  employmentStatus: "ACTIVE" | "ON_LEAVE" | "RESIGNED" | "TERMINATED"
  joiningDate: string
}
```

Add to `server/src/modules/employee/employee.service.ts` (append to the end of the file):

```ts
import type { CreateStaffAccountInput, CreateStaffAccountResult, EmployeeListItem } from "./employee.types"
```

(Replace the existing `import type { CreateStaffAccountInput, CreateStaffAccountResult } from "./employee.types"` line with the one above.)

```ts
export async function listEmployees(): Promise<EmployeeListItem[]> {
  const employees = await prisma.employee.findMany({
    include: { department: true, user: true },
    orderBy: { fullName: "asc" },
  })
  return employees.map((e) => ({
    id: e.id,
    employeeCode: e.employeeCode,
    fullName: e.fullName,
    email: e.user.email,
    designation: e.designation,
    department: { id: e.department.id, name: e.department.name },
    employmentType: e.employmentType,
    employmentStatus: e.employmentStatus,
    joiningDate: e.joiningDate.toISOString(),
  }))
}
```

- [ ] **Step 4: Run the service test to verify it passes**

```bash
cd server
npx vitest run src/modules/employee/employee.service.test.ts
```

Expected: PASS (5 tests — 3 existing + 2 new)

- [ ] **Step 5: Write the failing route test**

Add to `server/src/modules/employee/employee.routes.test.ts`, extend the `vi.mock("./employee.service", ...)` factory:

```ts
vi.mock("./employee.service", () => ({
  createStaffAccount: vi.fn(),
  listEmployees: vi.fn(),
}))
```

Append this `describe` block to the end of the file:

```ts
describe("GET /api/employees", () => {
  it("returns 401 with no Authorization header", async () => {
    const res = await request(app).get("/api/employees")
    expect(res.status).toBe(401)
  })

  it("returns 403 for a non-HR/Admin caller", async () => {
    const res = await request(app).get("/api/employees").set("Authorization", `Bearer ${tokenFor("EMPLOYEE")}`)
    expect(res.status).toBe(403)
  })

  it("returns 200 with the employee list for an HR Admin caller", async () => {
    vi.mocked(employeeService.listEmployees).mockResolvedValue([
      {
        id: "e1",
        employeeCode: "BS-EMP-00001",
        fullName: "New Hire",
        email: "new@b.com",
        designation: "Analyst",
        department: { id: "dept-1", name: "Engineering" },
        employmentType: "FULL_TIME",
        employmentStatus: "ACTIVE",
        joiningDate: "2026-07-27T00:00:00.000Z",
      },
    ])
    const res = await request(app).get("/api/employees").set("Authorization", `Bearer ${tokenFor("HR_ADMIN")}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].employeeCode).toBe("BS-EMP-00001")
  })
})
```

- [ ] **Step 6: Run the route test to verify it fails**

```bash
cd server
npx vitest run src/modules/employee/employee.routes.test.ts
```

Expected: FAIL — module doesn't export a handler for `GET /api/employees` (404, not 401)

- [ ] **Step 7: Implement the controller and route**

Add to `server/src/modules/employee/employee.controller.ts` (append):

```ts
import { listEmployees } from "./employee.service"
```

(Replace the existing `import { createStaffAccount } from "./employee.service"` line with the combined import above.)

```ts
export async function listEmployeesHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const employees = await listEmployees()
    return res.status(200).json(employees)
  } catch (err) {
    return next(err)
  }
}
```

Modify `server/src/modules/employee/employee.routes.ts` — add the import and route:

```ts
import { createStaffAccountHandler, listEmployeesHandler } from "./employee.controller"
```

(Replace the existing `import { createStaffAccountHandler } from "./employee.controller"` line.)

```ts
router.get("/", requireAuth, requireRole(Role.SUPER_ADMIN, Role.HR_ADMIN), listEmployeesHandler)
```

(Add this line before the existing `router.post("/staff", ...)` line.)

- [ ] **Step 8: Run tests to verify they pass, then run the full suite**

```bash
cd server
npx vitest run src/modules/employee/employee.routes.test.ts
npm test
```

Expected: route test PASSES (7 tests — 4 existing + 3 new); full suite PASSES with no regressions

- [ ] **Step 9: Commit**

```bash
git add server/src/modules/employee
git commit -m "feat(server): GET /api/employees list endpoint"
```

---

### Task 2: Backend — `GET /api/departments` (new module)

**Files:**
- Create: `server/src/modules/department/department.controller.ts`
- Create: `server/src/modules/department/department.routes.ts`
- Create: `server/src/modules/department/department.routes.test.ts`
- Modify: `server/src/app.ts` (mount `/api/departments`)

**Interfaces:**
- Consumes: `prisma`, `requireAuth`
- Produces: `GET /api/departments` — consumed by Task 3/6 (frontend department picker and list display)

- [ ] **Step 1: Write the failing test**

Create `server/src/modules/department/department.routes.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"
import request from "supertest"

vi.mock("../../config/prisma", () => ({
  default: { department: { findMany: vi.fn() } },
}))

import app from "../../app"
import prisma from "../../config/prisma"
import { signAccessToken } from "../auth/auth.utils"

function tokenFor(role: "EMPLOYEE") {
  return signAccessToken({ sub: "actor-1", role: role as any, email: "actor@b.com", mustChangePassword: false })
}

describe("GET /api/departments", () => {
  it("returns 401 with no Authorization header", async () => {
    const res = await request(app).get("/api/departments")
    expect(res.status).toBe(401)
  })

  it("returns 200 with the department list for any authenticated role", async () => {
    vi.mocked(prisma.department.findMany).mockResolvedValue([
      { id: "d1", name: "Engineering" },
      { id: "d2", name: "Sales" },
    ] as any)
    const res = await request(app).get("/api/departments").set("Authorization", `Bearer ${tokenFor("EMPLOYEE")}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      { id: "d1", name: "Engineering" },
      { id: "d2", name: "Sales" },
    ])
    expect(prisma.department.findMany).toHaveBeenCalledWith({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd server
npx vitest run src/modules/department/department.routes.test.ts
```

Expected: FAIL — module doesn't exist

- [ ] **Step 3: Implement**

Create `server/src/modules/department/department.controller.ts`:

```ts
import type { NextFunction, Request, Response } from "express"

import prisma from "../../config/prisma"

export async function listDepartmentsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const departments = await prisma.department.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    })
    return res.status(200).json(departments)
  } catch (err) {
    return next(err)
  }
}
```

Create `server/src/modules/department/department.routes.ts`:

```ts
import { Router } from "express"

import { requireAuth } from "../../middleware/requireAuth"
import { listDepartmentsHandler } from "./department.controller"

const router = Router()

router.get("/", requireAuth, listDepartmentsHandler)

export default router
```

Modify `server/src/app.ts` — add the import and mount line:

```ts
import departmentRoutes from "./modules/department/department.routes"
```

(Add after the existing `import employeeRoutes from "./modules/employee/employee.routes"` line.)

```ts
app.use("/api/departments", departmentRoutes)
```

(Add after the existing `app.use("/api/employees", employeeRoutes)` line, before `app.use(errorHandler)`.)

- [ ] **Step 4: Run tests to verify they pass, then run the full suite**

```bash
cd server
npx vitest run src/modules/department/department.routes.test.ts
npm test
```

Expected: PASS (2 tests); full suite PASSES with no regressions

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/department server/src/app.ts
git commit -m "feat(server): GET /api/departments endpoint"
```

---

### Task 3: Frontend — API client layer + React Query provider

**Files:**
- Modify: `client/lib/api/types.ts`
- Create: `client/lib/api/employees.ts`
- Create: `client/lib/api/departments.ts`
- Create: `client/lib/query/query-provider.tsx`
- Modify: `client/app/layout.tsx`

**Interfaces:**
- Consumes: `apiFetch` (`client/lib/api/client.ts`)
- Produces (used by Tasks 5, 6): `Employee`, `Department`, `CreateStaffAccountInput`, `CreateStaffAccountResult` types; `listEmployees(accessToken)`, `createStaffAccount(accessToken, input)`, `listDepartments(accessToken)`; `QueryProvider` wrapping the app so `useQuery`/`useMutation` work anywhere

- [ ] **Step 1: Add the new types**

Read `client/lib/api/types.ts` first to confirm its current exact content, then append:

```ts
export type EmploymentType = "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN"
export type EmploymentStatus = "ACTIVE" | "ON_LEAVE" | "RESIGNED" | "TERMINATED"

export interface Department {
  id: string
  name: string
}

export interface Employee {
  id: string
  employeeCode: string
  fullName: string
  email: string
  designation: string
  department: Department
  employmentType: EmploymentType
  employmentStatus: EmploymentStatus
  joiningDate: string
}

export interface CreateStaffAccountInput {
  fullName: string
  email: string
  role: "EMPLOYEE" | "REPORTING_MANAGER"
  designation: string
  departmentId: string
  employmentType: EmploymentType
  joiningDate: string
}

export interface CreateStaffAccountResult {
  employeeCode: string
  temporaryPassword: string
  fullName: string
  email: string
}
```

- [ ] **Step 2: Create the employees API functions**

Create `client/lib/api/employees.ts`:

```ts
import { apiFetch } from "./client"
import type { CreateStaffAccountInput, CreateStaffAccountResult, Employee } from "./types"

export function listEmployees(accessToken: string): Promise<Employee[]> {
  return apiFetch<Employee[]>("/api/employees", { accessToken })
}

export function createStaffAccount(
  accessToken: string,
  input: CreateStaffAccountInput
): Promise<CreateStaffAccountResult> {
  return apiFetch<CreateStaffAccountResult>("/api/employees/staff", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  })
}
```

- [ ] **Step 3: Create the departments API function**

Create `client/lib/api/departments.ts`:

```ts
import { apiFetch } from "./client"
import type { Department } from "./types"

export function listDepartments(accessToken: string): Promise<Department[]> {
  return apiFetch<Department[]>("/api/departments", { accessToken })
}
```

- [ ] **Step 4: Create the React Query provider**

Create `client/lib/query/query-provider.tsx`:

```tsx
"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
```

- [ ] **Step 5: Wrap the root layout**

Read `client/app/layout.tsx` first to confirm its current exact content (it wraps `<body>` with `<SessionProvider>{children}</SessionProvider>`). Add the import:

```ts
import { QueryProvider } from "@/lib/query/query-provider";
```

Change the body line from:

```tsx
<body className="min-h-full flex flex-col"><SessionProvider>{children}</SessionProvider></body>
```

to:

```tsx
<body className="min-h-full flex flex-col"><QueryProvider><SessionProvider>{children}</SessionProvider></QueryProvider></body>
```

- [ ] **Step 6: Type-check**

```bash
cd client
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add client/lib/api/types.ts client/lib/api/employees.ts client/lib/api/departments.ts client/lib/query client/app/layout.tsx
git commit -m "feat(client): employees/departments API client, React Query provider"
```

---

### Task 4: Frontend — `DashboardShell` with real session user

**Files:**
- Create: `client/components/dashboard/dashboard-shell.tsx`
- Modify: `client/app/(dashboard)/admin/layout.tsx`
- Modify: `client/app/(dashboard)/hr/layout.tsx`
- Modify: `client/app/(dashboard)/finance/layout.tsx`
- Modify: `client/app/(dashboard)/manager/layout.tsx`
- Modify: `client/app/(dashboard)/employee/layout.tsx`

**Interfaces:**
- Consumes: `useSession` (`client/lib/auth/session-context.tsx`), `Sidebar`, `Header` (`client/components/dashboard/{sidebar,header}.tsx`), `NavGroup` type
- Produces: `DashboardShell({ navGroups, rootHref, children }): JSX.Element` — used by all 5 role layouts, replacing their direct `Sidebar`/`Header` rendering

- [ ] **Step 1: Create the shell component**

Create `client/components/dashboard/dashboard-shell.tsx`:

```tsx
"use client"

import { Header } from "@/components/dashboard/header"
import { Sidebar } from "@/components/dashboard/sidebar"
import type { NavGroup } from "@/components/dashboard/types"
import { useSession } from "@/lib/auth/session-context"
import type { Role } from "@/lib/api/types"

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  HR_ADMIN: "HR Admin",
  FINANCE_OFFICER: "Finance Officer",
  REPORTING_MANAGER: "Reporting Manager",
  EMPLOYEE: "Employee",
}

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email
  return local.charAt(0).toUpperCase() + local.slice(1)
}

function initialsFromName(name: string): string {
  return name.slice(0, 2).toUpperCase()
}

export function DashboardShell({
  navGroups,
  rootHref,
  children,
}: {
  navGroups: NavGroup[]
  rootHref: string
  children: React.ReactNode
}) {
  const { user, status } = useSession()

  const email = status === "authenticated" && user ? user.email : ""
  const userName = email ? displayNameFromEmail(email) : "…"
  const userInitials = email ? initialsFromName(userName) : "…"
  const roleLabel = status === "authenticated" && user ? ROLE_LABELS[user.role] : "…"

  return (
    <>
      <Sidebar navGroups={navGroups} rootHref={rootHref} userName={userName} userInitials={userInitials} roleLabel={roleLabel} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header userName={userName} userInitials={userInitials} userEmail={email || "…"} />
        <main className="mx-auto flex w-full max-w-[1220px] flex-1 flex-col px-7 pb-8">{children}</main>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Confirm the `NavGroup` type location**

Read `client/components/dashboard/types.ts` and `client/components/admin/nav-config.ts` first to confirm `NavGroup` is exported from `@/components/dashboard/types` and that `navGroups` from each role's `nav-config.ts` matches that type — if the import path above is wrong, fix it to match what's actually exported before continuing.

- [ ] **Step 3: Update the admin layout**

Read `client/app/(dashboard)/admin/layout.tsx` first. Replace its body content — remove the `import { admin } from "@/components/admin/data"` line (keep `import { navGroups } from "@/components/admin/nav-config"`), remove `import { Header } from "@/components/dashboard/header"` and `import { Sidebar } from "@/components/dashboard/sidebar"`, add `import { DashboardShell } from "@/components/dashboard/dashboard-shell"`, and replace the `<Sidebar .../><div>...<Header .../><main>{children}</main></div>` block with:

```tsx
<DashboardShell navGroups={navGroups} rootHref="/admin">
  {children}
</DashboardShell>
```

(This goes inside the existing outer `<div className={cn(...)}>` wrapper — keep that wrapper and its font-variable classes unchanged, only replace what's inside it.)

- [ ] **Step 4: Update the hr layout**

Repeat Step 3's exact transformation on `client/app/(dashboard)/hr/layout.tsx`: remove the `Header`/`Sidebar`/`components/hr/data` imports, add the `DashboardShell` import, replace the inner markup with `<DashboardShell navGroups={navGroups} rootHref="/hr">{children}</DashboardShell>`.

- [ ] **Step 5: Update the finance layout**

Repeat on `client/app/(dashboard)/finance/layout.tsx`: same transformation, `rootHref="/finance"`.

- [ ] **Step 6: Update the manager layout**

Repeat on `client/app/(dashboard)/manager/layout.tsx`: same transformation, `rootHref="/manager"`.

- [ ] **Step 7: Update the employee layout**

Repeat on `client/app/(dashboard)/employee/layout.tsx`: same transformation, `rootHref="/employee"`.

- [ ] **Step 8: Type-check**

```bash
cd client
npx tsc --noEmit
```

Expected: no errors. If `<role>/data.ts` files' user-info exports (`.name`, `.initials`, `.email`, `.roleLabel`) are still imported elsewhere in that role's subpages (e.g. mock chart data in the same file), do NOT remove those exports from `data.ts` — only stop importing the user-identity fields in `layout.tsx`. Confirm with a search (`grep -rn "from \"@/components/admin/data\"" client/app`) that no other file broke from this change; if one did, leave `data.ts` itself untouched (this task only changes what `layout.tsx` reads from it).

- [ ] **Step 9: Manual verification**

Start both dev servers (`cd server && npm run dev`, `cd client && npx next dev --webpack` — use `--webpack` on this machine per the known Turbopack issue), log in as `hr@demo.com` / `Demo@12345` via the Administrative Login tab, and confirm the sidebar/header show "Hr" / "HR" initials / "hr@demo.com" / "HR Admin" instead of "Priya Nair". Stop both servers after confirming (`Get-NetTCPConnection -LocalPort 3000,4000 -State Listen` in PowerShell, kill any PIDs found).

- [ ] **Step 10: Commit**

```bash
git add client/components/dashboard/dashboard-shell.tsx "client/app/(dashboard)/admin/layout.tsx" "client/app/(dashboard)/hr/layout.tsx" "client/app/(dashboard)/finance/layout.tsx" "client/app/(dashboard)/manager/layout.tsx" "client/app/(dashboard)/employee/layout.tsx"
git commit -m "feat(client): DashboardShell shows the real logged-in user in header/sidebar"
```

---

### Task 5: Frontend — Employees list page (real data)

**Files:**
- Create: `client/components/employees/employees-page.tsx`
- Modify: `client/app/(dashboard)/hr/employees/page.tsx`
- Modify: `client/app/(dashboard)/admin/employees/page.tsx`

**Interfaces:**
- Consumes: `listEmployees`, `listDepartments` (Task 3), `useSession` (Task 13 of the Auth plan), `useQuery` (`@tanstack/react-query`), `DataTable`, `MiniStat`, `PageHeader` (existing `components/dashboard/*`), `Employee`/`Department` types (Task 3)
- Produces: `EmployeesPage(): JSX.Element` — rendered by both `hr/employees/page.tsx` and `admin/employees/page.tsx`. Exports nothing else consumed by later tasks (Task 6 modifies this same file directly).

- [ ] **Step 1: Read the existing pieces this reuses**

Read `client/components/dashboard/subpage.tsx`, `client/components/dashboard/data-table.tsx`, `client/components/dashboard/page-header.tsx`, and `client/components/dashboard/types.ts` (for `Tone`, `TableCell`, `tones`) — confirm their exact current exports before writing the new component, since it reuses `DataTable`, `MiniStat`, `PageHeader`, and the `TableCell`/`Tone` shapes directly rather than through `SubpagePage` (which expects fully-static `SubpageData`, not live data).

- [ ] **Step 2: Create the employees page component (list only, no create yet)**

Create `client/components/employees/employees-page.tsx`:

```tsx
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
```

- [ ] **Step 3: Wire both role pages to the new component**

Replace the full contents of `client/app/(dashboard)/hr/employees/page.tsx`:

```tsx
import { EmployeesPage } from "@/components/employees/employees-page"

export default function Page() {
  return <EmployeesPage />
}
```

Replace the full contents of `client/app/(dashboard)/admin/employees/page.tsx` with the identical code above.

- [ ] **Step 4: Type-check**

```bash
cd client
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Manual verification**

Start both dev servers (server: `npm run dev`; client: `npx next dev --webpack`), log in as `hr@demo.com` / `Demo@12345`, navigate to `/hr/employees`. Confirm: loading skeleton appears briefly, then the real employee list renders (from whatever's in the seeded/smoke-tested database — at minimum the `aisha.smoketest@example.com` / `BS-EMP-00001` row created during the Auth plan's Task 15 smoke test should appear, department "Engineering", status "Active"). Confirm `/admin/employees` (log in as `admin@demo.com` / `Demo@12345`) shows the same data. Stop both servers after confirming.

- [ ] **Step 6: Commit**

```bash
git add client/components/employees "client/app/(dashboard)/hr/employees/page.tsx" "client/app/(dashboard)/admin/employees/page.tsx"
git commit -m "feat(client): real employee list on /hr/employees and /admin/employees"
```

---

### Task 6: Frontend — Create-employee dialog

**Files:**
- Modify: `client/components/employees/employees-page.tsx`

**Interfaces:**
- Consumes: `createStaffAccount`, `listDepartments` (Task 3), `useMutation`, `useQueryClient` (`@tanstack/react-query`), `Dialog`/`Select`/`Calendar`/`Popover` (`components/ui/*`), `ApiError` (`client/lib/api/client.ts`)
- Produces: nothing new consumed by other tasks — this is the final task in the plan.

- [ ] **Step 1: Read the existing form patterns this reuses**

Read `client/app/(auth)/login/admin-login-form.tsx` and `client/app/(auth)/change-password/page.tsx` first — confirm the exact `ApiError` inline-error pattern (`err instanceof ApiError ? err.message : "Something went wrong. Please try again."`) used elsewhere in this codebase, so the create form matches it exactly rather than inventing a new error-handling style.

- [ ] **Step 2: Add the create dialog to `employees-page.tsx`**

Modify `client/components/employees/employees-page.tsx`. Replace the existing `import { useMemo } from "react"` line (from Task 5) with:

```tsx
import { useMemo, useState } from "react"
```

Add these new imports below it (alongside the existing `useQuery` import from `@tanstack/react-query`, which stays):

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { createStaffAccount } from "@/lib/api/employees"
import { listDepartments } from "@/lib/api/departments"
import { ApiError } from "@/lib/api/client"
import type { CreateStaffAccountInput, CreateStaffAccountResult, Department } from "@/lib/api/types"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
```

(Note: `useQuery` is already imported from `@tanstack/react-query` in Task 5's version of this file — add `useMutation, useQueryClient` as a separate `@tanstack/react-query` import line, or merge them into one `import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"` line; either is fine, just don't end up with two `@tanstack/react-query` import statements.)

Add this helper function above `export function EmployeesPage()`:

```tsx
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
  return new Date().toISOString().slice(0, 10)
}
```

Replace the body of `export function EmployeesPage() { ... }` with (this wraps the Step 2-of-Task-5 body, adding dialog state and the mutation — the `PageHeader`/stats/table JSX from Task 5 stays, only the surrounding function body and the final `return` change):

```tsx
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
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
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
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select a department" /></SelectTrigger>
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
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
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
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" className="w-full justify-start font-normal">
                    {joiningDate}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={new Date(joiningDate)}
                    onSelect={(d) => d && setJoiningDate(d.toISOString().slice(0, 10))}
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
```

Remove the now-unused `PageHeader` import if `PageHeader` is no longer referenced anywhere in the file after this replacement (the header markup above is now inlined so the `cta` button can carry an `onClick`) — check with a search inside the file before removing the import.

- [ ] **Step 3: Type-check**

```bash
cd client
npx tsc --noEmit
```

Expected: no errors. If the `Calendar` component's `onSelect`/`selected` prop types don't match what's used above (shadcn calendar APIs vary by version), read `client/components/ui/calendar.tsx` and adjust the props to match its actual exported type signature.

- [ ] **Step 4: Lint**

```bash
cd client
npm run lint
```

Expected: no errors

- [ ] **Step 5: Manual verification**

Start both dev servers (server: `npm run dev`; client: `npx next dev --webpack`), log in as `hr@demo.com` / `Demo@12345`, go to `/hr/employees`, click "Add employee", fill in the form (pick any department from the dropdown, leave joining date as today), submit. Confirm: a confirmation dialog appears showing a new `BS-EMP-XXXXX` code and a temporary password; closing it shows the new employee in the refreshed table without a page reload; the server terminal logs the dev-mode email fallback with the same credentials. Try submitting with a duplicate email to confirm the inline error banner shows the server's message. Stop both servers after confirming (check `Get-NetTCPConnection -LocalPort 3000,4000 -State Listen` and kill any leftover PIDs).

- [ ] **Step 6: Commit**

```bash
git add client/components/employees/employees-page.tsx
git commit -m "feat(client): working Add employee dialog with credential confirmation"
```
