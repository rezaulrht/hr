-- CreateEnum
CREATE TYPE "CostStatus" AS ENUM ('PENDING', 'PAID');

-- CreateTable
CREATE TABLE "CostCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "CostCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostCommitment" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "payee" TEXT NOT NULL,
    "amount" DECIMAL(14,2),
    "currency" "Currency" NOT NULL DEFAULT 'BDT',
    "dueDay" INTEGER,
    "startedOn" TIMESTAMP(3) NOT NULL,
    "endedOn" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostCommitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatingCost" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "commitmentId" TEXT,
    "label" TEXT NOT NULL,
    "payee" TEXT NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'BDT',
    "dueDate" TIMESTAMP(3),
    "status" "CostStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "paidBy" TEXT,
    "paymentRef" TEXT,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatingCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostAttachment" (
    "id" TEXT NOT NULL,
    "costId" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "format" TEXT NOT NULL,
    "uploadedBy" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CostCategory_code_key" ON "CostCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CostCategory_name_key" ON "CostCategory"("name");

-- CreateIndex
CREATE INDEX "CostCommitment_categoryId_idx" ON "CostCommitment"("categoryId");

-- CreateIndex
CREATE INDEX "OperatingCost_periodYear_periodMonth_idx" ON "OperatingCost"("periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "OperatingCost_status_idx" ON "OperatingCost"("status");

-- CreateIndex
CREATE INDEX "OperatingCost_categoryId_idx" ON "OperatingCost"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "OperatingCost_commitmentId_periodYear_periodMonth_key" ON "OperatingCost"("commitmentId", "periodYear", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "CostAttachment_publicId_key" ON "CostAttachment"("publicId");

-- CreateIndex
CREATE INDEX "CostAttachment_costId_uploadedAt_idx" ON "CostAttachment"("costId", "uploadedAt");

-- AddForeignKey
ALTER TABLE "CostCommitment" ADD CONSTRAINT "CostCommitment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CostCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatingCost" ADD CONSTRAINT "OperatingCost_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CostCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatingCost" ADD CONSTRAINT "OperatingCost_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "CostCommitment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostAttachment" ADD CONSTRAINT "CostAttachment_costId_fkey" FOREIGN KEY ("costId") REFERENCES "OperatingCost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
