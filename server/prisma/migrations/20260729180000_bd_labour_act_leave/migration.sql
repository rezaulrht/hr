-- CreateEnum
CREATE TYPE "LeaveAccrualBasis" AS ENUM ('PRO_RATED', 'PER_EVENT', 'EARNED', 'NONE');

-- AlterTable
-- "code" arrives nullable so existing rows can be backfilled below, then is
-- tightened to NOT NULL. Adding it as NOT NULL outright would fail on any
-- database that already has leave types in it.
ALTER TABLE "LeaveType"
  ADD COLUMN "code" TEXT,
  ADD COLUMN "statutory" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "countsHolidays" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "accrualBasis" "LeaveAccrualBasis" NOT NULL DEFAULT 'PRO_RATED',
  ADD COLUMN "minServiceMonths" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "maxAccrual" INTEGER;

-- Backfill the pre-statutory catalogue.
--
-- "Annual" becomes EARNED rather than being dropped for a fresh row: it is
-- the earned-leave analogue, and re-pointing it keeps every LeaveRequest
-- already filed against it. The seed renames it to "Earned" and switches it
-- to accrual afterwards.
UPDATE "LeaveType" SET "code" = 'EARNED'   WHERE "name" = 'Annual';
UPDATE "LeaveType" SET "code" = 'SICK'     WHERE "name" = 'Sick';
UPDATE "LeaveType" SET "code" = 'PERSONAL' WHERE "name" = 'Personal';
UPDATE "LeaveType" SET "code" = 'LWP'      WHERE "name" = 'Leave Without Pay';

-- Anything created by hand outside the seed keeps a code derived from its
-- name and stays non-statutory, so the seed will never rewrite it.
UPDATE "LeaveType"
SET "code" = upper(regexp_replace("name", '[^a-zA-Z0-9]+', '_', 'g'))
WHERE "code" IS NULL;

ALTER TABLE "LeaveType" ALTER COLUMN "code" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "LeaveType_code_key" ON "LeaveType"("code");
