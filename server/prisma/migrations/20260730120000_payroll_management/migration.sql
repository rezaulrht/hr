-- CreateEnum
CREATE TYPE "ExitReason" AS ENUM ('RESIGNATION', 'RETIREMENT', 'TERMINATION', 'DISMISSAL', 'DISCHARGE', 'RETRENCHMENT', 'CONTRACT_END', 'DEATH');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('BDT', 'USD');

-- CreateEnum
CREATE TYPE "ComponentKind" AS ENUM ('EARNING', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "ComponentCalc" AS ENUM ('FIXED', 'PERCENT_OF_BASIC');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID');

-- DropForeignKey
ALTER TABLE "Payslip" DROP CONSTRAINT "Payslip_payrollRunId_fkey";

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "bankRoutingNumber" TEXT,
ADD COLUMN     "exitNote" TEXT,
ADD COLUMN     "exitReason" "ExitReason",
ADD COLUMN     "lastWorkingDay" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ExpenseClaim" ADD COLUMN     "currency" "Currency" NOT NULL DEFAULT 'BDT',
ADD COLUMN     "expenseDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "fxRateToBdt" DECIMAL(18,6),
ADD COLUMN     "payslipId" TEXT,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "settlementId" TEXT,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "PayrollRun" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedBy" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "disbursedAt" TIMESTAMP(3),
ADD COLUMN     "disbursedBy" TEXT,
ADD COLUMN     "disbursementFxRateToBdt" DECIMAL(18,6),
ADD COLUMN     "fxRateToBdt" DECIMAL(18,6),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "rejectionNote" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "submittedBy" TEXT;

-- AlterTable
ALTER TABLE "Payslip" ADD COLUMN     "basic" DECIMAL(14,2) NOT NULL,
ADD COLUMN     "calendarDays" INTEGER NOT NULL,
ADD COLUMN     "currency" "Currency" NOT NULL,
ADD COLUMN     "emailError" TEXT,
ADD COLUMN     "fxRateToBdt" DECIMAL(18,6) NOT NULL,
ADD COLUMN     "grossFull" DECIMAL(14,2) NOT NULL,
ADD COLUMN     "grossPayBdt" DECIMAL(14,2) NOT NULL,
ADD COLUMN     "lopDays" DECIMAL(5,2) NOT NULL,
ADD COLUMN     "netPayBdt" DECIMAL(14,2) NOT NULL,
ADD COLUMN     "netPayable" DECIMAL(14,2) NOT NULL,
ADD COLUMN     "netPayableBdt" DECIMAL(14,2) NOT NULL,
ADD COLUMN     "payableDays" DECIMAL(5,2) NOT NULL,
ADD COLUMN     "payslipNo" TEXT NOT NULL,
ADD COLUMN     "reimbursements" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalDeductionsBdt" DECIMAL(14,2) NOT NULL,
ALTER COLUMN "grossPay" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "totalDeductions" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "netPay" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "SalaryStructure" DROP COLUMN "allowances",
DROP COLUMN "deductions",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "currency" "Currency" NOT NULL DEFAULT 'BDT',
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "basic" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Settlement" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedBy" TEXT,
ADD COLUMN     "breakdown" JSONB NOT NULL,
ADD COLUMN     "calculatedAt" TIMESTAMP(3),
ADD COLUMN     "calculatedBy" TEXT,
ADD COLUMN     "currency" "Currency" NOT NULL,
ADD COLUMN     "emailedAt" TIMESTAMP(3),
ADD COLUMN     "exitReason" "ExitReason" NOT NULL,
ADD COLUMN     "expenseReimbursement" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "finalAmountBdt" DECIMAL(14,2) NOT NULL,
ADD COLUMN     "fxRateToBdt" DECIMAL(18,6) NOT NULL,
ADD COLUMN     "gratuity" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "lastWorkingDay" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "noticePay" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paidBy" TEXT,
ADD COLUMN     "pdfUrl" TEXT,
ADD COLUMN     "rejectionNote" TEXT,
ADD COLUMN     "serviceYears" DECIMAL(5,2) NOT NULL,
ADD COLUMN     "settlementNo" TEXT NOT NULL,
ADD COLUMN     "status" "SettlementStatus" NOT NULL DEFAULT 'DRAFT',
ALTER COLUMN "pendingSalary" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "leaveEncashment" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "outstandingDeductions" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "finalAmount" SET DATA TYPE DECIMAL(14,2);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "base" "Currency" NOT NULL,
    "quote" "Currency" NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryComponent" (
    "id" TEXT NOT NULL,
    "salaryStructureId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "ComponentKind" NOT NULL,
    "calc" "ComponentCalc" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "countsAsWages" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SalaryComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollAdjustment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "kind" "ComponentKind" NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'BDT',
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payslipId" TEXT,

    CONSTRAINT "PayrollAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollAudit" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changedBy" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "before" JSONB,
    "after" JSONB,
    "note" TEXT,

    CONSTRAINT "PayrollAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExchangeRate_base_quote_effectiveFrom_idx" ON "ExchangeRate"("base", "quote", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_base_quote_effectiveFrom_key" ON "ExchangeRate"("base", "quote", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "SalaryComponent_salaryStructureId_code_key" ON "SalaryComponent"("salaryStructureId", "code");

-- CreateIndex
CREATE INDEX "PayrollAdjustment_employeeId_year_month_idx" ON "PayrollAdjustment"("employeeId", "year", "month");

-- CreateIndex
CREATE INDEX "PayrollAdjustment_year_month_payslipId_idx" ON "PayrollAdjustment"("year", "month", "payslipId");

-- CreateIndex
CREATE INDEX "PayrollAudit_entity_entityId_changedAt_idx" ON "PayrollAudit"("entity", "entityId", "changedAt");

-- CreateIndex
CREATE INDEX "PayrollAudit_changedAt_idx" ON "PayrollAudit"("changedAt");

-- CreateIndex
CREATE INDEX "ExpenseClaim_status_idx" ON "ExpenseClaim"("status");

-- CreateIndex
CREATE INDEX "ExpenseClaim_employeeId_status_idx" ON "ExpenseClaim"("employeeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_month_year_key" ON "PayrollRun"("month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_payslipNo_key" ON "Payslip"("payslipNo");

-- CreateIndex
CREATE INDEX "Payslip_employeeId_idx" ON "Payslip"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_payrollRunId_employeeId_key" ON "Payslip"("payrollRunId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "SalaryStructure_name_key" ON "SalaryStructure"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_settlementNo_key" ON "Settlement"("settlementNo");

-- CreateIndex
CREATE INDEX "Settlement_employeeId_idx" ON "Settlement"("employeeId");

-- CreateIndex
CREATE INDEX "Settlement_status_idx" ON "Settlement"("status");

-- AddForeignKey
ALTER TABLE "SalaryComponent" ADD CONSTRAINT "SalaryComponent_salaryStructureId_fkey" FOREIGN KEY ("salaryStructureId") REFERENCES "SalaryStructure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "Payslip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "Payslip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
