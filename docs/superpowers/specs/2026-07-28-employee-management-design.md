# Employee Management (List + Create) — Design

## Goal

Replace the static, mocked employee directory on `/hr/employees` and `/admin/employees` with a real one backed by the database, and make the existing "Add employee" button actually create staff accounts (reusing the `POST /api/employees/staff` endpoint built in the Auth & RBAC phase). As a byproduct of being the first page to make authenticated API calls, also wire the dashboard sidebar/header to the real logged-in user instead of hardcoded mock names.

**Explicitly out of scope** (per the Auth plan's own note and this design's scoping): employee detail/profile pages, edit, deactivate/delete, document upload, CSV import, pagination/search (dataset is small in this phase), reporting-manager assignment in the create form.

## Backend

### `GET /api/employees` (new)

- File: `server/src/modules/employee/employee.service.ts` (add `listEmployees`), `employee.controller.ts`, `employee.routes.ts`.
- Auth: `requireAuth` + `requireRole(Role.SUPER_ADMIN, Role.HR_ADMIN)` — same permission as create.
- No query params (no pagination/filtering in this pass).
- Response: `200` with an array of:
  ```ts
  {
    id: string
    employeeCode: string
    fullName: string
    email: string
    designation: string
    department: { id: string; name: string }
    employmentType: EmploymentType
    employmentStatus: EmploymentStatus
    joiningDate: string // ISO date
  }
  ```
  (Prisma `include: { department: true }`, `orderBy: { fullName: "asc" }`.)

### `GET /api/departments` (new module)

- New module `server/src/modules/department/` — `department.controller.ts`, `department.routes.ts` only (no service file; the query is a one-liner, doesn't warrant the extra indirection).
- Auth: `requireAuth` only — any logged-in role can read the department list (needed for the create form's picker; read access to a name list isn't sensitive).
- Response: `200` with `{ id: string; name: string }[]`, `orderBy: { name: "asc" }`.
- Mounted at `/api/departments` in `app.ts`.

### Tests

Both endpoints get the same test treatment as the rest of the Auth phase: a Prisma-mocked service/route test (`employee.service.test.ts` gets a `listEmployees` describe block; `department.routes.test.ts` is new) covering 401 (no auth), 403 (wrong role, employees only), 200 (success), and empty-list.

## Frontend

### Data fetching: React Query

- Add `QueryClientProvider` to `client/app/layout.tsx`, alongside the existing `SessionProvider` (inside it, since queries need the access token from session context).
- `client/lib/api/employees.ts`: `listEmployees(accessToken)`, `createStaffAccount(accessToken, input)` — thin wrappers over `apiFetch`, following `lib/api/auth.ts`'s existing pattern.
- `client/lib/api/departments.ts`: `listDepartments(accessToken)`.
- `client/lib/api/types.ts`: add `Employee`, `Department`, `CreateStaffAccountInput`, `CreateStaffAccountResult` types (hand-mirrored from the server, same convention as `PublicUser`).

### Shared employee page component

- New `client/components/employees/employees-page.tsx` (client component), rendered by both:
  - `client/app/(dashboard)/hr/employees/page.tsx`
  - `client/app/(dashboard)/admin/employees/page.tsx`
  
  (both become one-line wrappers, same pattern as today's `<SubpagePage data={employees} />`).
- Uses `useQuery` for the employee list and department list (parallel), `useMutation` for create (invalidates the employee-list query on success so the table refreshes automatically).
- Stat tiles (Headcount / New this month / Departments) computed client-side from the fetched list: `list.length`, count where `joiningDate` falls in the current calendar month, `new Set(list.map(e => e.department.id)).size`.
- Table: keeps the existing `DataTable`/`Cell` component and its `TableCell[][]` shape for visual consistency with the rest of the still-mocked dashboard — the live rows are mapped into that shape (name+email as the two-line first cell, department name, formatted joining date, an employment-status tag colored via the existing `Tone` system: ACTIVE→green, ON_LEAVE→yellow, RESIGNED/TERMINATED→red).
- Loading state: skeleton rows (shadcn `Skeleton`, already installed) while the list query is pending. Error state: inline message + retry button if the query fails.

### Create form

- shadcn `Dialog`, opened by the existing `PageHeader`'s `cta` button (currently inert — needs an `onOpen` callback threaded through `PageHeader`/`SubpagePage`'s replacement).
- Fields: Full name, Email, Role (`Select`: Employee / Reporting Manager), Designation, Department (`Select`, populated from the departments query), Employment type (`Select`: Full-time / Part-time / Contract / Intern), Joining date (shadcn `Calendar` in a `Popover`, defaulting to today).
- Client-side validation mirrors the server's Zod schema (required fields, valid email) — reuse the same field-level error pattern already established in `admin-login-form.tsx`/`staff-login-form.tsx` (inline error text, disabled submit while pending).
- On success: close the create dialog, open a second confirmation `Dialog` showing the returned `employeeCode` and `temporaryPassword` with a copy-to-clipboard button and a note that it's also been emailed/logged server-side. Closing that dialog returns to the (now auto-refreshed) list.
- On failure: inline error banner in the create dialog (same `ApiError` handling pattern as the login forms), dialog stays open so the user doesn't lose their input.

### Header/sidebar real user data

- New `client/components/dashboard/dashboard-shell.tsx` (client component) wrapping `Sidebar` + `Header` + `<main>`, used by all 5 role layouts in place of each duplicating that JSX directly. Takes `navGroups`, `rootHref`, and a `roleLabelFallback` as props (still per-role, from each role's existing `nav-config.ts`).
- Derives `userName`/`userInitials`/`userEmail`/`roleLabel` from `useSession().user`:
  - `userEmail` = `user.email` directly.
  - `userName` = the local part of the email (before `@`), title-cased — e.g. `hr@demo.com` → `"Hr"`. (Accepted limitation per design discussion: no full name is available from the session for staff accounts either, since `PublicUser` doesn't carry `Employee.fullName`.)
  - `userInitials` = first 1–2 letters of that derived name, uppercased.
  - `roleLabel` = mapped from `user.role` (`SUPER_ADMIN` → "Super Admin", `HR_ADMIN` → "HR Admin", `FINANCE_OFFICER` → "Finance Officer", `REPORTING_MANAGER` → "Reporting Manager", `EMPLOYEE` → "Employee").
  - While `status === "loading"`, render the same shell with placeholder/skeleton text rather than flashing mock data.
- Each of the 5 `layout.tsx` files (`admin`, `hr`, `finance`, `manager`, `employee`) is updated to use `DashboardShell` instead of directly rendering `Sidebar`/`Header`, dropping their `import { <role> } from "@/components/<role>/data"` user-info usage (the rest of each role's `data.ts` — subpage mock data, chart data, etc. — is untouched; only the user-identity fields stop being sourced from there).

## Error handling

- List/department queries: React Query's built-in retry (default 3x) is fine as-is; surface a manual retry button on persistent failure.
- Create mutation: server validation errors (400) and permission errors surface as inline messages via the existing `ApiError` class; unexpected errors get the same generic "Something went wrong" fallback used elsewhere.

## Testing

- Backend: Vitest + Supertest, same conventions as the rest of the server (401/403/200 per new route, service-level tests for `listEmployees`/departments query).
- Frontend: `npx tsc --noEmit` + `npm run lint` as the existing bar (no frontend test framework in this repo yet, consistent with current project state) — manual verification via the running dev server (list renders, create flow works end-to-end, header shows real user) as the acceptance check, same as the Auth phase's Task 15 smoke test.
