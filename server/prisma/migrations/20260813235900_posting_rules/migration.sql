CREATE TYPE "CostNature" AS ENUM ('DIRECT', 'ADMINISTRATIVE');

ALTER TABLE "Department" ADD COLUMN "costNature" "CostNature" NOT NULL DEFAULT 'ADMINISTRATIVE';

CREATE TABLE "ExpenseCategory" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ExpenseCategory_code_key" ON "ExpenseCategory"("code");
CREATE UNIQUE INDEX "ExpenseCategory_name_key" ON "ExpenseCategory"("name");

INSERT INTO "ExpenseCategory" ("id", "code", "name") VALUES
  (gen_random_uuid(), 'TRAVEL', 'Travel and conveyance'),
  (gen_random_uuid(), 'ENTERTAINMENT', 'Entertainment'),
  (gen_random_uuid(), 'STATIONERY', 'Stationery'),
  (gen_random_uuid(), 'IT', 'IT accessories'),
  (gen_random_uuid(), 'TRAINING', 'Training'),
  (gen_random_uuid(), 'MEDICAL', 'Medical'),
  (gen_random_uuid(), 'OTHER', 'Other');

ALTER TABLE "ExpenseClaim" ADD COLUMN "categoryId" TEXT;
UPDATE "ExpenseClaim" c SET "categoryId" = ec."id"
FROM "ExpenseCategory" ec
WHERE lower(trim(c."category")) = lower(ec."name")
   OR lower(trim(c."category")) = lower(ec."code");
UPDATE "ExpenseClaim" SET "categoryId" = (SELECT "id" FROM "ExpenseCategory" WHERE "code" = 'OTHER') WHERE "categoryId" IS NULL;
ALTER TABLE "ExpenseClaim" ALTER COLUMN "categoryId" SET NOT NULL;
ALTER TABLE "ExpenseClaim" RENAME COLUMN "category" TO "legacyCategoryText";

CREATE TABLE "PostingRule" (
  "id" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "note" TEXT,
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostingRule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PostingRule_event_idx" ON "PostingRule"("event");
CREATE UNIQUE INDEX "PostingRule_event_key_key" ON "PostingRule"("event", "key");

ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PostingRule" ADD CONSTRAINT "PostingRule_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
