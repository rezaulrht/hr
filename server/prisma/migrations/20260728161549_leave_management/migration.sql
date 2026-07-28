-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decisionNote" TEXT;

-- AlterTable
ALTER TABLE "LeaveType" ADD COLUMN     "allowsBackdating" BOOLEAN NOT NULL DEFAULT false;
