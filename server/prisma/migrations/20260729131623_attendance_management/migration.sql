-- CreateEnum
CREATE TYPE "HolidayType" AS ENUM ('GENERAL', 'EXECUTIVE_ORDER', 'OPTIONAL', 'WORKING_DAY');

-- CreateEnum
CREATE TYPE "AttendanceApproval" AS ENUM ('PENDING', 'APPROVED', 'AUTO_APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('WEB', 'MANUAL', 'RFID', 'FACE', 'FINGERPRINT');

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "approval" "AttendanceApproval" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "approvalNote" TEXT,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedBy" TEXT,
ADD COLUMN     "correctedAt" TIMESTAMP(3),
ADD COLUMN     "correctedBy" TEXT,
ADD COLUMN     "correctionNote" TEXT,
ADD COLUMN     "isEarlyOut" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "regularisedAt" TIMESTAMP(3),
ADD COLUMN     "regularisedNote" TEXT,
ADD COLUMN     "source" "AttendanceSource" NOT NULL DEFAULT 'WEB';

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "deviceUserId" TEXT;

-- AlterTable
ALTER TABLE "Holiday" ADD COLUMN     "type" "HolidayType" NOT NULL DEFAULT 'GENERAL';

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 60,
    "graceMinutes" INTEGER NOT NULL DEFAULT 15,
    "weeklyOffDays" INTEGER[],
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceAudit" (
    "id" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changedBy" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "before" JSONB,
    "after" JSONB,
    "note" TEXT,

    CONSTRAINT "AttendanceAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shift_name_key" ON "Shift"("name");

-- CreateIndex
CREATE INDEX "Shift_effectiveFrom_effectiveTo_idx" ON "Shift"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "AttendanceAudit_attendanceId_changedAt_idx" ON "AttendanceAudit"("attendanceId", "changedAt");

-- CreateIndex
CREATE INDEX "Attendance_date_idx" ON "Attendance"("date");

-- CreateIndex
CREATE INDEX "Attendance_approval_idx" ON "Attendance"("approval");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_employeeId_date_key" ON "Attendance"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_deviceUserId_key" ON "Employee"("deviceUserId");

-- CreateIndex
CREATE INDEX "Holiday_date_idx" ON "Holiday"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_name_key" ON "Holiday"("date", "name");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceAudit" ADD CONSTRAINT "AttendanceAudit_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
