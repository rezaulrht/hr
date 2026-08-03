-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('CONTRACT', 'NID', 'CERTIFICATE', 'OFFER_LETTER', 'RESIGNATION', 'OTHER');

-- AlterTable
ALTER TABLE "Document" DROP COLUMN "fileUrl",
ADD COLUMN     "bytes" INTEGER NOT NULL,
ADD COLUMN     "fileName" TEXT NOT NULL,
ADD COLUMN     "format" TEXT NOT NULL,
ADD COLUMN     "publicId" TEXT NOT NULL,
ADD COLUMN     "uploadedBy" TEXT,
DROP COLUMN "type",
ADD COLUMN     "type" "DocumentType" NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Document_publicId_key" ON "Document"("publicId");

-- CreateIndex
CREATE INDEX "Document_employeeId_uploadedAt_idx" ON "Document"("employeeId", "uploadedAt");
