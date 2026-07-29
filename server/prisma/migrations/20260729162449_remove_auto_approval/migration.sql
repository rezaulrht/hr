-- AlterEnum
BEGIN;
CREATE TYPE "AttendanceApproval_new" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
ALTER TABLE "public"."Attendance" ALTER COLUMN "approval" DROP DEFAULT;
ALTER TABLE "Attendance" ALTER COLUMN "approval" TYPE "AttendanceApproval_new" USING ("approval"::text::"AttendanceApproval_new");
ALTER TYPE "AttendanceApproval" RENAME TO "AttendanceApproval_old";
ALTER TYPE "AttendanceApproval_new" RENAME TO "AttendanceApproval";
DROP TYPE "public"."AttendanceApproval_old";
ALTER TABLE "Attendance" ALTER COLUMN "approval" SET DEFAULT 'PENDING';
COMMIT;

