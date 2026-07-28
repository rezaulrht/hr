# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

HR & Payroll management system: two independent projects (not a monorepo — no shared `packages/`), each with its own `package.json`, `node_modules`, and CLAUDE.md scope:

- `server/` — Express 5 + TypeScript API, Prisma 7 ORM, PostgreSQL (hosted on Supabase, DB connectivity only — no Supabase SDK/Auth).
- `client/` — Next.js 16 (App Router) + React 19 frontend, currently 5 role-based dashboards built against **mock data**, with a real auth/session layer being wired in (see Current state below).

Roles (defined once as the Prisma `Role` enum in `server`, hand-mirrored as a TS union in `client/lib/api/types.ts` — keep both in sync manually when it changes): `SUPER_ADMIN, HR_ADMIN, FINANCE_OFFICER, REPORTING_MANAGER, EMPLOYEE`, mapped 1:1 to the route groups `/admin`, `/hr`, `/finance`, `/manager`, `/employee`.

## Commands

### server/
```bash
npm run dev              # tsx watch src/index.ts
npm run build             # tsc -> dist/
npm start                 # node dist/index.js
npm test                  # vitest run (once added — see Current state)
npx vitest run <path>      # run a single test file
npm run prisma:generate    # prisma generate -> src/generated/prisma
npm run prisma:migrate     # prisma migrate dev
```

### client/
```bash
npm run dev     # next dev
npm run build   # next build
npm start       # next start
npm run lint    # eslint
```

There is no root-level package.json — always `cd server` or `cd client` first (or use `npm --prefix`).

## Architecture

### server/ (Express + Prisma)

Module-per-feature layout under `src/modules/<name>/`, each following this file convention (established by the auth module, the first one being built out):
- `<name>.types.ts` — shared TS interfaces for the module
- `<name>.validators.ts` — Zod request-body schemas + inferred types
- `<name>.utils.ts` — pure helper functions (hashing, token generation, etc.)
- `<name>.service.ts` — business logic, talks to Prisma directly
- `<name>.controller.ts` + `<name>.routes.ts` — Express handlers/routing, mounted in `src/app.ts`
- `<name>.*.test.ts` colocated next to the file it tests

Cross-cutting pieces live outside `modules/`:
- `src/config/env.ts` — Zod-validated `process.env`, the only place env vars should be read from
- `src/config/prisma.ts` — the single `PrismaClient` singleton; nothing should call `new PrismaClient()` elsewhere
- `src/middleware/errorHandler.ts` — `AppError` class + centralized error middleware; all thrown errors in services should be `AppError` instances so this middleware can produce a consistent `{ error: string }` JSON shape
- `src/middleware/requireAuth.ts` / `requireRole.ts` — the RBAC pattern is a single middleware pair reading the JWT role claim, checked against route-level `requireRole(...)` calls — deliberately not scattered per-route role checks
- `src/types/express.d.ts` — augments `Express.Request` with `user: AccessTokenPayload`
- `src/generated/prisma/` — generated Prisma client output, gitignored, regenerate with `prisma:generate`
- `src/templates/`, `src/validators/` (top-level, distinct from per-module validators), `src/jobs/`, `src/utils/` — currently empty scaffold directories (`.gitkeep` only), reserved for cross-module email/PDF templates, shared cron jobs (node-cron), and shared utils respectively

Auth design (the pattern to follow for anything else needing tokens/sessions):
- Access token: short-lived JWT (`JWT_ACCESS_EXPIRY=15m`), returned in the JSON body only, never stored server-side.
- Refresh token: opaque random token, **hashed** before storage in the `RefreshToken` table (rotation + revocation need a checkable record — a bare re-signed JWT can't detect reuse). Transported as an httpOnly, `sameSite=lax` cookie, never exposed to JS.
- Password reset follows the same opaque-token-hashed-in-DB pattern (`PasswordResetToken`), and never reveals whether an email exists in responses.
- If `SMTP_HOST` is unset, reset links are logged to the server console instead of emailed — this is intentional dev-mode fallback, not a bug.
- Frontend route protection (`client/proxy.ts`, Next.js 16's rename of `middleware.ts`) is UX-only (cookie-presence check, running in the Node.js runtime by default in Next.js 16 — not Edge); the real enforcement is server-side `requireAuth` + `requireRole` on every protected Express route.
- This cookie-presence check only works because dev has the API (`localhost:4000`) and client (`localhost:3000`) sharing the same host — cookies ignore port but do care about host/domain and `sameSite`. A genuinely cross-domain deployment (e.g. `api.example.com` / `app.example.com`) breaks this silently: the proxy would never see the `refreshToken` cookie (permanent redirect-to-login loop), and `sameSite: "lax"` would also block the cookie on cross-site fetches from the client to the API. That setup needs `sameSite: "none"` + `secure` + an explicit cookie `domain`, or a different route-protection mechanism entirely.

Testing: Vitest + Supertest. Service/unit tests mock the Prisma client (`vi.mock("../../config/prisma", ...)`) rather than hitting a real database — there is no automated integration-test DB in this phase; DB-backed testing is a manual smoke test against the real Supabase instance.

### client/ (Next.js App Router)

- Route groups: `app/(auth)/login` and `app/(dashboard)/{admin,hr,finance,manager,employee}`, each dashboard group with its own `layout.tsx` that renders the shared `Sidebar`/`Header` from `components/dashboard/` with role-specific `nav-config.ts` and `data.ts` (see `components/admin/` for the reference implementation other roles follow).
- `components/ui/` is shadcn/ui (`base-nova` style, `neutral` base color, remixicon icon set) — check `components.json` before hand-rolling a primitive that shadcn already provides.
- `lib/api/` is the fetch layer to the Express backend: `client.ts` (fetch wrapper + `ApiError`, sends `credentials: "include"` for the refresh cookie), `types.ts` (hand-mirrored server types), and one file per backend module (e.g. `auth.ts`).
- `lib/auth/session-context.tsx` — `SessionProvider`/`useSession()`, holds the access token in memory only (never localStorage), attempts a silent `/api/auth/refresh` on mount using the refresh cookie.
- Dashboard pages currently render **static mock data** (see `components/*/data.ts` per role) — this is deliberate scope for the current phase; wiring each module (Employee, Leave, Attendance, Payroll, Reporting) to live data is later, separate work from the auth/session plumbing.
- **`client/AGENTS.md` (imported by `client/CLAUDE.md`) is load-bearing**: this Next.js version has breaking changes vs. training data — read `node_modules/next/dist/docs/` for the relevant guide before writing Next.js-specific code (routing, server actions, config, etc.).

## Current state / in-progress work

An Auth & RBAC vertical slice is actively being implemented per `docs/superpowers/plans/2026-07-27-auth-rbac.md` (a 14-task TDD plan: DB schema → Express skeleton → auth utils/validators/service/controller → frontend API client → session context → login wiring). Check that plan file and its checkbox state before assuming the auth backend doesn't exist yet — `server/prisma/schema.prisma` and `server/src/**` may be empty scaffolding or partially built depending on how far execution has progressed. Key facts baked into that plan worth knowing regardless of progress:
- The Prisma schema is comprehensive (User, Employee, Department, Leave*, Attendance, Payroll*, ExpenseClaim, Settlement, Report, Announcement) even though only Auth is being wired to real logic first.
- `RefreshToken` and `PasswordResetToken` models are additive beyond the original spec, added because rotation/revocation and token-based reset are meaningless without a revocable DB record.
- No shared validation package between client/server (confirmed deliberate, not an oversight) — Zod schemas are duplicated by hand on each side.
