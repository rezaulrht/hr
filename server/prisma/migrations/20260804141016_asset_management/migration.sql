-- CreateEnum
CREATE TYPE "AssetLifecycle" AS ENUM ('IN_SERVICE', 'LOST', 'RETIRED');

-- CreateEnum
CREATE TYPE "AssetCondition" AS ENUM ('NEW', 'GOOD', 'FAIR', 'DAMAGED');

-- CreateEnum
CREATE TYPE "AssetAttachmentKind" AS ENUM ('PHOTO', 'INVOICE', 'WARRANTY', 'CONDITION_OUT', 'CONDITION_IN');

-- CreateEnum
CREATE TYPE "AssetRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'FULFILLED');

-- AlterTable
ALTER TABLE "AuditLog" RENAME CONSTRAINT "PayrollAudit_pkey" TO "AuditLog_pkey";

-- CreateTable
CREATE TABLE "AssetCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requiresSerial" BOOLEAN NOT NULL DEFAULT true,
    "isConsumable" BOOLEAN NOT NULL DEFAULT false,
    "usefulLifeMonths" INTEGER,

    CONSTRAINT "AssetCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "assetTag" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serialNumber" TEXT,
    "model" TEXT,
    "notes" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "purchaseCost" DECIMAL(14,2),
    "currency" "Currency" NOT NULL DEFAULT 'BDT',
    "vendor" TEXT,
    "warrantyExpiry" TIMESTAMP(3),
    "departmentId" TEXT,
    "location" TEXT,
    "lifecycle" "AssetLifecycle" NOT NULL DEFAULT 'IN_SERVICE',
    "retiredAt" TIMESTAMP(3),
    "retiredBy" TEXT,
    "retirementNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetAssignment" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL,
    "assignedBy" TEXT NOT NULL,
    "conditionOut" "AssetCondition" NOT NULL,
    "issueNote" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "returnedTo" TEXT,
    "conditionIn" "AssetCondition",
    "returnNote" TEXT,

    CONSTRAINT "AssetAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetAttachment" (
    "id" TEXT NOT NULL,
    "assetId" TEXT,
    "assignmentId" TEXT,
    "kind" "AssetAttachmentKind" NOT NULL,
    "publicId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "format" TEXT NOT NULL,
    "uploadedBy" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetRequest" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AssetRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "fulfilledAt" TIMESTAMP(3),
    "fulfilledBy" TEXT,
    "fulfilledAssetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetRepair" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "sentBy" TEXT NOT NULL,
    "vendor" TEXT,
    "fault" TEXT NOT NULL,
    "expectedBack" TIMESTAMP(3),
    "isWarranty" BOOLEAN NOT NULL DEFAULT false,
    "returnedAt" TIMESTAMP(3),
    "cost" DECIMAL(14,2),
    "currency" "Currency" NOT NULL DEFAULT 'BDT',
    "outcome" TEXT,
    "conditionAfter" "AssetCondition",

    CONSTRAINT "AssetRepair_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssetCategory_code_key" ON "AssetCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AssetCategory_name_key" ON "AssetCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_assetTag_key" ON "Asset"("assetTag");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_serialNumber_key" ON "Asset"("serialNumber");

-- CreateIndex
CREATE INDEX "Asset_categoryId_idx" ON "Asset"("categoryId");

-- CreateIndex
CREATE INDEX "Asset_lifecycle_idx" ON "Asset"("lifecycle");

-- CreateIndex
CREATE INDEX "AssetAssignment_assetId_assignedAt_idx" ON "AssetAssignment"("assetId", "assignedAt");

-- CreateIndex
CREATE INDEX "AssetAssignment_employeeId_returnedAt_idx" ON "AssetAssignment"("employeeId", "returnedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssetAttachment_publicId_key" ON "AssetAttachment"("publicId");

-- CreateIndex
CREATE INDEX "AssetAttachment_assetId_uploadedAt_idx" ON "AssetAttachment"("assetId", "uploadedAt");

-- CreateIndex
CREATE INDEX "AssetAttachment_assignmentId_uploadedAt_idx" ON "AssetAttachment"("assignmentId", "uploadedAt");

-- CreateIndex
CREATE INDEX "AssetRequest_status_idx" ON "AssetRequest"("status");

-- CreateIndex
CREATE INDEX "AssetRequest_employeeId_createdAt_idx" ON "AssetRequest"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "AssetRepair_assetId_sentAt_idx" ON "AssetRepair"("assetId", "sentAt");

-- CreateIndex
CREATE INDEX "AssetRepair_returnedAt_idx" ON "AssetRepair"("returnedAt");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AssetCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetAssignment" ADD CONSTRAINT "AssetAssignment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetAssignment" ADD CONSTRAINT "AssetAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetAttachment" ADD CONSTRAINT "AssetAttachment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetAttachment" ADD CONSTRAINT "AssetAttachment_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "AssetAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRequest" ADD CONSTRAINT "AssetRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRequest" ADD CONSTRAINT "AssetRequest_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AssetCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRequest" ADD CONSTRAINT "AssetRequest_fulfilledAssetId_fkey" FOREIGN KEY ("fulfilledAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRepair" ADD CONSTRAINT "AssetRepair_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "PayrollAudit_changedAt_idx" RENAME TO "AuditLog_changedAt_idx";

-- RenameIndex
ALTER INDEX "PayrollAudit_entity_entityId_changedAt_idx" RENAME TO "AuditLog_entity_entityId_changedAt_idx";

-- An asset cannot be in two people's hands at once. Prisma cannot express a
-- partial unique index. Without this, a double-submitted handover form puts
-- one laptop on two open records and the register reports it as held by
-- whichever row a query happens to return first.
CREATE UNIQUE INDEX "AssetAssignment_open_per_asset"
  ON "AssetAssignment" ("assetId")
  WHERE "returnedAt" IS NULL;

-- An attachment hangs off an asset or off a handover, never both and never
-- neither. A service guard alone would hold only for as long as every future
-- caller remembers it.
ALTER TABLE "AssetAttachment"
  ADD CONSTRAINT "AssetAttachment_one_owner"
  CHECK (("assetId" IS NULL) <> ("assignmentId" IS NULL));
