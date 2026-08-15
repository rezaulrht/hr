-- CreateEnum
CREATE TYPE "AssetRecoveryKind" AS ENUM ('NOT_RETURNED', 'DAMAGED', 'LOST');

-- CreateEnum
CREATE TYPE "AssetRecoveryStatus" AS ENUM ('PENDING', 'RECOVERED', 'WAIVED');

-- AlterTable
ALTER TABLE "Settlement" ADD COLUMN     "assetRecoveries" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AssetRecovery" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "kind" "AssetRecoveryKind" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'BDT',
    "reason" TEXT NOT NULL,
    "status" "AssetRecoveryStatus" NOT NULL DEFAULT 'PENDING',
    "waivedBy" TEXT,
    "waivedAt" TIMESTAMP(3),
    "waiverReason" TEXT,
    "adjustmentId" TEXT,
    "settlementId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetRecovery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssetRecovery_adjustmentId_key" ON "AssetRecovery"("adjustmentId");

-- CreateIndex
CREATE INDEX "AssetRecovery_employeeId_status_idx" ON "AssetRecovery"("employeeId", "status");

-- CreateIndex
CREATE INDEX "AssetRecovery_assetId_idx" ON "AssetRecovery"("assetId");

-- AddForeignKey
ALTER TABLE "AssetRecovery" ADD CONSTRAINT "AssetRecovery_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRecovery" ADD CONSTRAINT "AssetRecovery_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRecovery" ADD CONSTRAINT "AssetRecovery_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "AssetAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRecovery" ADD CONSTRAINT "AssetRecovery_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "PayrollAdjustment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRecovery" ADD CONSTRAINT "AssetRecovery_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
