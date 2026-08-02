-- CreateEnum
CREATE TYPE "LeaveSession" AS ENUM ('FIRST_HALF', 'SECOND_HALF');

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "endSession" "LeaveSession" NOT NULL DEFAULT 'SECOND_HALF',
ADD COLUMN     "startSession" "LeaveSession" NOT NULL DEFAULT 'FIRST_HALF';

-- AlterTable
ALTER TABLE "LeaveType" ADD COLUMN     "allowsHalfDay" BOOLEAN NOT NULL DEFAULT true;
