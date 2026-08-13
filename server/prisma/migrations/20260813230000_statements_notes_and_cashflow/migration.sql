-- CreateEnum
CREATE TYPE "CashFlowKind" AS ENUM ('NONE', 'CASH', 'OPERATING_WC', 'NON_CASH_ADDBACK', 'INVESTING', 'FINANCING');

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "cashFlowKind" "CashFlowKind" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "contraAccountId" TEXT,
ADD COLUMN     "depreciationRate" DECIMAL(5,2),
ADD COLUMN     "noteRef" TEXT;

-- CreateTable
CREATE TABLE "StatementNote" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatementNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StatementNote_ref_key" ON "StatementNote"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "Account_contraAccountId_key" ON "Account"("contraAccountId");

-- CreateIndex
CREATE INDEX "Account_noteRef_idx" ON "Account"("noteRef");

-- CreateIndex
CREATE INDEX "Account_cashFlowKind_idx" ON "Account"("cashFlowKind");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_contraAccountId_fkey" FOREIGN KEY ("contraAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
