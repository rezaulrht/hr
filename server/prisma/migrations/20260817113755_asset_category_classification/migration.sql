-- CreateEnum
CREATE TYPE "AssetClassification" AS ENUM ('IT', 'NON_IT');

-- Add nullable, backfill, then enforce. A NOT NULL add on a populated table
-- fails outright, and a DEFAULT would leave future rows silently classified.
ALTER TABLE "AssetCategory" ADD COLUMN "classification" "AssetClassification";

UPDATE "AssetCategory" SET "classification" = 'IT'
  WHERE "code" IN ('LAPTOP', 'MONITOR', 'PHONE', 'LICENCE');
UPDATE "AssetCategory" SET "classification" = 'NON_IT'
  WHERE "classification" IS NULL;

ALTER TABLE "AssetCategory" ALTER COLUMN "classification" SET NOT NULL;

-- AlterTable
ALTER TABLE "AssetCategory" ADD COLUMN "tracksIndividually" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ExpenseClaim" ALTER COLUMN "legacyCategoryText" DROP NOT NULL;
