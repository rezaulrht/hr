-- Marks a check-out the nightly job wrote, rather than one somebody punched.
--
-- Nullable, so there is nothing to backfill: every existing row was either
-- punched or corrected by a person, and none of them were guessed.
ALTER TABLE "Attendance" ADD COLUMN     "autoCheckOutAt" TIMESTAMP(3);

-- Drift correction, not a new decision.
--
-- The sessions migration added `DEFAULT gen_random_uuid()::text` on
-- RefreshToken.sessionId as a safety net for a writer that forgot one. The
-- Prisma schema declares `@default(uuid())`, which is generated client-side,
-- so the two disagree and every `migrate diff` from here on would keep
-- proposing this drop. Since `issueRefreshToken` always passes an explicit
-- value, the database default was redundant — and a permanently dirty diff is
-- a real hazard when the migrate recipe depends on `migrate status` being
-- clean.
ALTER TABLE "RefreshToken" ALTER COLUMN "sessionId" DROP DEFAULT;
