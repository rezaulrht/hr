-- CreateEnum
CREATE TYPE "AnnouncementAudience" AS ENUM ('ALL', 'DEPARTMENT', 'ROLE');

-- CreateEnum
CREATE TYPE "EventSeverity" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'ERROR');

-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "departmentId" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "targetRole" "Role",
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "audience",
ADD COLUMN     "audience" "AnnouncementAudience" NOT NULL DEFAULT 'ALL';

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" "EventSeverity" NOT NULL DEFAULT 'INFO',
    "actorUserId" TEXT,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "subjectEmployeeId" TEXT,
    "managerEmployeeId" TEXT,
    "targetRoles" "Role"[],
    "companyWide" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT NOT NULL,
    "meta" TEXT,
    "href" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Event_createdAt_idx" ON "Event"("createdAt");

-- CreateIndex
CREATE INDEX "Event_subjectEmployeeId_createdAt_idx" ON "Event"("subjectEmployeeId", "createdAt");

-- CreateIndex
CREATE INDEX "Event_managerEmployeeId_createdAt_idx" ON "Event"("managerEmployeeId", "createdAt");

-- CreateIndex
CREATE INDEX "Event_entity_entityId_createdAt_idx" ON "Event"("entity", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "Announcement_publishedAt_idx" ON "Announcement"("publishedAt");

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
