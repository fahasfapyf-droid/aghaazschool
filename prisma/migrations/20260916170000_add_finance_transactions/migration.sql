CREATE TYPE "FinancePaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'OTHER');
CREATE TYPE "FinanceStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

CREATE TABLE "Donation" (
  "id" TEXT NOT NULL,
  "donorName" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "donationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "purpose" TEXT NOT NULL DEFAULT 'General School Fund',
  "paymentMethod" "FinancePaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
  "receiptNumber" TEXT,
  "notes" TEXT,
  "status" "FinanceStatus" NOT NULL DEFAULT 'PAID',
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Donation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Donation_receiptNumber_key" ON "Donation"("receiptNumber");
CREATE INDEX "Donation_donationDate_status_idx" ON "Donation"("donationDate", "status");
CREATE INDEX "Donation_purpose_donationDate_idx" ON "Donation"("purpose", "donationDate");

CREATE TABLE "Expense" (
  "id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "expenseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidTo" TEXT,
  "paymentMethod" "FinancePaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
  "fundingSource" TEXT NOT NULL DEFAULT 'School Funds',
  "description" TEXT NOT NULL,
  "receiptReference" TEXT,
  "status" "FinanceStatus" NOT NULL DEFAULT 'PAID',
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Expense_expenseDate_status_idx" ON "Expense"("expenseDate", "status");
CREATE INDEX "Expense_category_expenseDate_idx" ON "Expense"("category", "expenseDate");
CREATE INDEX "Expense_fundingSource_expenseDate_idx" ON "Expense"("fundingSource", "expenseDate");

CREATE TABLE "PayrollRecord" (
  "id" TEXT NOT NULL,
  "payrollMonth" TIMESTAMP(3) NOT NULL,
  "staffName" TEXT NOT NULL,
  "grossAmount" DECIMAL(12,2) NOT NULL,
  "adjustment" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "netAmount" DECIMAL(12,2) NOT NULL,
  "paymentStatus" "FinanceStatus" NOT NULL DEFAULT 'PENDING',
  "paymentDate" TIMESTAMP(3),
  "paymentMethod" "FinancePaymentMethod",
  "notes" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayrollRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PayrollRecord_payrollMonth_staffName_key" ON "PayrollRecord"("payrollMonth", "staffName");
CREATE INDEX "PayrollRecord_payrollMonth_paymentStatus_idx" ON "PayrollRecord"("payrollMonth", "paymentStatus");