-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "AccountCashKind" AS ENUM ('NONE', 'CASH', 'BANK');

-- CreateEnum
CREATE TYPE "FinancialYearStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSED', 'LOCKED');

-- CreateEnum
CREATE TYPE "JournalType" AS ENUM ('OPENING', 'MANUAL', 'SYSTEM', 'REVERSAL', 'CLOSING');

-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'POSTED', 'REVERSED');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "parentId" TEXT,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "cashKind" "AccountCashKind" NOT NULL DEFAULT 'NONE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "systemRole" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialYear" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "FinancialYearStatus" NOT NULL DEFAULT 'OPEN',
    "closedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingPeriod" (
    "id" TEXT NOT NULL,
    "financialYearId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "reopenedBy" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenReason" TEXT,

    CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Journal" (
    "id" TEXT NOT NULL,
    "journalNo" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "periodId" TEXT NOT NULL,
    "type" "JournalType" NOT NULL DEFAULT 'MANUAL',
    "status" "JournalStatus" NOT NULL DEFAULT 'DRAFT',
    "narration" TEXT NOT NULL,
    "reference" TEXT,
    "sourceModule" TEXT,
    "sourceRefId" TEXT,
    "sourceEvent" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedBy" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "rejectionNote" TEXT,
    "reversesId" TEXT,
    "reversalReason" TEXT,

    CONSTRAINT "Journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "narration" TEXT,
    "departmentId" TEXT,
    "employeeId" TEXT,
    "sourceCurrency" "Currency",
    "sourceAmount" DECIMAL(14,2),
    "fxRateToBdt" DECIMAL(18,6),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalAttachment" (
    "id" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "format" TEXT NOT NULL,
    "uploadedBy" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_code_key" ON "Account"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Account_systemRole_key" ON "Account"("systemRole");

-- CreateIndex
CREATE INDEX "Account_type_code_idx" ON "Account"("type", "code");

-- CreateIndex
CREATE INDEX "Account_parentId_idx" ON "Account"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialYear_name_key" ON "FinancialYear"("name");

-- CreateIndex
CREATE INDEX "FinancialYear_startDate_idx" ON "FinancialYear"("startDate");

-- CreateIndex
CREATE INDEX "AccountingPeriod_financialYearId_idx" ON "AccountingPeriod"("financialYearId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingPeriod_year_month_key" ON "AccountingPeriod"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "Journal_journalNo_key" ON "Journal"("journalNo");

-- CreateIndex
CREATE UNIQUE INDEX "Journal_reversesId_key" ON "Journal"("reversesId");

-- CreateIndex
CREATE INDEX "Journal_date_idx" ON "Journal"("date");

-- CreateIndex
CREATE INDEX "Journal_status_idx" ON "Journal"("status");

-- CreateIndex
CREATE INDEX "Journal_periodId_idx" ON "Journal"("periodId");

-- CreateIndex
CREATE INDEX "Journal_type_idx" ON "Journal"("type");

-- CreateIndex
CREATE UNIQUE INDEX "Journal_sourceModule_sourceRefId_sourceEvent_key" ON "Journal"("sourceModule", "sourceRefId", "sourceEvent");

-- CreateIndex
CREATE INDEX "JournalLine_accountId_idx" ON "JournalLine"("accountId");

-- CreateIndex
CREATE INDEX "JournalLine_journalId_idx" ON "JournalLine"("journalId");

-- CreateIndex
CREATE INDEX "JournalLine_employeeId_idx" ON "JournalLine"("employeeId");

-- CreateIndex
CREATE INDEX "JournalLine_departmentId_idx" ON "JournalLine"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalAttachment_publicId_key" ON "JournalAttachment"("publicId");

-- CreateIndex
CREATE INDEX "JournalAttachment_journalId_uploadedAt_idx" ON "JournalAttachment"("journalId", "uploadedAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_financialYearId_fkey" FOREIGN KEY ("financialYearId") REFERENCES "FinancialYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Journal" ADD CONSTRAINT "Journal_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Journal" ADD CONSTRAINT "Journal_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "Journal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalAttachment" ADD CONSTRAINT "JournalAttachment_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
