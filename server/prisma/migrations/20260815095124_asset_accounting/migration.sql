-- CreateEnum
CREATE TYPE "DepreciationRunStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "capitalisedAt" TIMESTAMP(3),
ADD COLUMN     "capitalisedBy" TEXT,
ADD COLUMN     "fxRateToBdt" DECIMAL(18,6),
ADD COLUMN     "purchaseCostBdt" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "DepreciationRun" (
    "id" TEXT NOT NULL,
    "runNo" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "DepreciationRunStatus" NOT NULL DEFAULT 'DRAFT',
    "journalId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedBy" TEXT,
    "postedAt" TIMESTAMP(3),
    "reversedBy" TEXT,
    "reversedAt" TIMESTAMP(3),

    CONSTRAINT "DepreciationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetDepreciation" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "openingBookValue" DECIMAL(14,2) NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "months" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "AssetDepreciation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DepreciationRun_runNo_key" ON "DepreciationRun"("runNo");

-- CreateIndex
CREATE INDEX "DepreciationRun_status_idx" ON "DepreciationRun"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DepreciationRun_year_month_key" ON "DepreciationRun"("year", "month");

-- CreateIndex
CREATE INDEX "AssetDepreciation_assetId_idx" ON "AssetDepreciation"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetDepreciation_runId_assetId_key" ON "AssetDepreciation"("runId", "assetId");

-- AddForeignKey
ALTER TABLE "DepreciationRun" ADD CONSTRAINT "DepreciationRun_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetDepreciation" ADD CONSTRAINT "AssetDepreciation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DepreciationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetDepreciation" ADD CONSTRAINT "AssetDepreciation_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
