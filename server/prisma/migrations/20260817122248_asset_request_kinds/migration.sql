-- CreateEnum
CREATE TYPE "AssetRequestKind" AS ENUM ('NEW_ITEM', 'REPAIR', 'RETURN');

-- AlterEnum
ALTER TYPE "AssetRequestStatus" ADD VALUE 'ORDERED';

-- DropForeignKey
ALTER TABLE "AssetRequest" DROP CONSTRAINT "AssetRequest_categoryId_fkey";

-- AlterTable
ALTER TABLE "AssetRequest" ADD COLUMN     "assetId" TEXT,
ADD COLUMN     "expectedBy" TIMESTAMP(3),
ADD COLUMN     "fulfilledNote" TEXT,
ADD COLUMN     "kind" "AssetRequestKind" NOT NULL DEFAULT 'NEW_ITEM',
ADD COLUMN     "orderNote" TEXT,
ADD COLUMN     "orderedAt" TIMESTAMP(3),
ADD COLUMN     "orderedBy" TEXT,
ADD COLUMN     "quantity" INTEGER,
ADD COLUMN     "repairId" TEXT,
ALTER COLUMN "categoryId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "AssetRequest_repairId_key" ON "AssetRequest"("repairId");

-- CreateIndex
CREATE INDEX "AssetRequest_kind_status_idx" ON "AssetRequest"("kind", "status");

-- AddForeignKey
ALTER TABLE "AssetRequest" ADD CONSTRAINT "AssetRequest_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AssetCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRequest" ADD CONSTRAINT "AssetRequest_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRequest" ADD CONSTRAINT "AssetRequest_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "AssetRepair"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- NEW_ITEM names a category and no asset; REPAIR and RETURN name an asset and
-- no category. The service validates the same rule first so the user sees a
-- sentence; this is the guarantee behind it.
ALTER TABLE "AssetRequest" ADD CONSTRAINT "AssetRequest_kind_target"
  CHECK (
    ("kind" = 'NEW_ITEM' AND "categoryId" IS NOT NULL AND "assetId" IS NULL)
    OR ("kind" IN ('REPAIR', 'RETURN') AND "assetId" IS NOT NULL AND "categoryId" IS NULL)
  );

-- Quantity is a supply concept and belongs to nothing else.
ALTER TABLE "AssetRequest" ADD CONSTRAINT "AssetRequest_quantity_kind"
  CHECK ("quantity" IS NULL OR ("kind" = 'NEW_ITEM' AND "quantity" > 0));

-- One live REPAIR or RETURN per asset. A second request to fix the same
-- laptop while the first is open is a duplicate, not a new fact.
CREATE UNIQUE INDEX "AssetRequest_one_live_per_asset"
  ON "AssetRequest" ("assetId", "kind")
  WHERE "status" IN ('PENDING', 'APPROVED', 'ORDERED');
