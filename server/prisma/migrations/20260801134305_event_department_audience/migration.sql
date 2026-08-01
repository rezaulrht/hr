-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "audienceDepartmentId" TEXT;

-- CreateIndex
CREATE INDEX "Event_audienceDepartmentId_createdAt_idx" ON "Event"("audienceDepartmentId", "createdAt");
