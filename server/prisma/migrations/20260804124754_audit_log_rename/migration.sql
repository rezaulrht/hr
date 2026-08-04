-- Rename only. Indexes and constraints follow the table automatically.
--
-- This file is hand-written on purpose. `prisma migrate diff` compares end
-- states and cannot see intent: it emits DROP TABLE "PayrollAudit" followed
-- by CREATE TABLE "AuditLog", which silently destroys every audit row.
ALTER TABLE "PayrollAudit" RENAME TO "AuditLog";
