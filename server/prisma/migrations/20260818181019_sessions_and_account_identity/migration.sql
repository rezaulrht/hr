-- Sessions you can see and sign out of, and an identity for accounts that
-- have no employee record.
--
-- Hand-edited from `prisma migrate diff`, which generated
--   ADD COLUMN "sessionId" TEXT NOT NULL
-- with no default. That fails outright on a non-empty table, and every live
-- login is a row in this one. The three-step add/backfill/constrain below is
-- the same change, applied in an order the existing rows survive.
--
-- The generated timestamps defaulted to CURRENT_TIMESTAMP, which would have
-- recorded every session in the system as having started at migration time.
-- They are backfilled from createdAt instead, which is the truth for a token
-- that has not rotated yet.

-- AlterTable: RefreshToken
ALTER TABLE "RefreshToken" ADD COLUMN     "userAgent" TEXT,
ADD COLUMN     "ipAddress" TEXT;

-- Nullable first, backfilled, then constrained. `gen_random_uuid()` is
-- built in from PostgreSQL 13; Supabase is well past that.
ALTER TABLE "RefreshToken" ADD COLUMN "sessionId" TEXT;
UPDATE "RefreshToken" SET "sessionId" = gen_random_uuid()::text WHERE "sessionId" IS NULL;
ALTER TABLE "RefreshToken" ALTER COLUMN "sessionId" SET NOT NULL;

-- A default is kept on the column as a safety net for any writer that
-- forgets one. `issueRefreshToken` always passes an explicit value.
ALTER TABLE "RefreshToken" ALTER COLUMN "sessionId" SET DEFAULT gen_random_uuid()::text;

ALTER TABLE "RefreshToken" ADD COLUMN "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "RefreshToken" ADD COLUMN "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- An existing token has never rotated, so when it was written IS when its
-- session began and when it was last used.
UPDATE "RefreshToken" SET "startedAt" = "createdAt", "lastUsedAt" = "createdAt";

-- AlterTable: User
ALTER TABLE "User" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "displayName" TEXT;

-- CreateIndex
CREATE INDEX "RefreshToken_userId_sessionId_idx" ON "RefreshToken"("userId", "sessionId");
