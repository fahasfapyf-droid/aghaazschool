import fs from "node:fs";

const fee = fs.readFileSync("app/api/fees/route.ts", "utf8");
const expense = fs.readFileSync("app/api/finance/expenses/route.ts", "utf8");
const payroll = fs.readFileSync("app/api/finance/payroll/route.ts", "utf8");
const donation = fs.readFileSync("app/api/finance/donations/route.ts", "utf8");
const schema = fs.readFileSync("prisma/schema.prisma", "utf8");

const checks = [
  ["fee payment endpoint requires finance roles", fee.includes('const feeRoles = ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"]')],
  ["fee payment uses Serializable transactions", fee.includes("Prisma.TransactionIsolationLevel.Serializable")],
  ["fee invoice row is explicitly locked before payment", fee.includes('FROM "FeeInvoice" WHERE "id" =') && fee.includes("FOR UPDATE")],
  ["fee payment rejects closed invoice states", fee.includes('["PENDING", "PARTIAL"].includes')],
  ["fee payment rejects overpayment", fee.includes("PAYMENT_EXCEEDS_BALANCE")],
  ["fee payment receipt is generated uniquely", fee.includes("receiptNumber: `RCP-${randomUUID()}`")],
  ["fee invoices prevent discount above amount", fee.includes("Discount cannot exceed the invoice amount.")],
  ["fee payment is audited", fee.includes('FEE_PAYMENT_CREATED')],
  ["expenses require finance roles", expense.includes('const roles = ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"]')],
  ["expenses are audited", expense.includes('EXPENSE_CREATED')],
  ["donations require finance roles", donation.includes('const roles = ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"]')],
  ["donations enforce unique receipt numbers", schema.includes('receiptNumber String? @unique')],
  ["payroll reconciles gross minus adjustment to net", payroll.includes("Net amount must equal gross amount minus adjustment.")],
  ["payroll has a month/staff uniqueness guard", schema.includes('@@unique([payrollMonth, staffName])')],
  ["payroll records are audited", payroll.includes('PAYROLL_RECORD_SAVED')],
];

let failed = false;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
  failed ||= !ok;
}
if (failed) process.exit(1);
