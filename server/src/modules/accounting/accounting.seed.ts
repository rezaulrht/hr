/**
 * The starter chart of accounts.
 *
 * This is a transcription of the company's audited FY 2024-25 financial
 * statements (G. Nabi & Co., Chartered Accountants, 22 January 2026), not a
 * generic textbook chart. Every group below is a line in the filed accounts
 * and every leaf is a row in one of their notes — the `note` field records
 * which. That is what will let slice 2 produce a document the auditor can
 * tie to their own working papers instead of one they have to re-key.
 *
 * Four things here a generic chart would not have:
 *
 * - `1120 Accumulated Depreciation` is a contra-asset group: type ASSET, but
 *   it normally carries a *credit*, and the Balance Sheet's single
 *   "Property, Plant & Equipment 126,350" line is PPE_COST − PPE_ACCUM_DEP.
 * - The P&L splits expenses four ways, not two, which is what makes a Gross
 *   Profit line derivable at all.
 * - Salary appears twice, 5122 under Direct Expenses and 5201 under
 *   Administrative. Which one a given salary lands in is a slice 3 mapping
 *   question, and it is why JournalLine.departmentId exists.
 * - `3200 Share Money Deposit` is a distinct equity account from Share
 *   Capital; it is a named column in their Statement of Changes in Equity.
 *
 * Reference data, not demo data — the same posture as the seed-slimming
 * work. Idempotent on `code`, so re-running never duplicates and never
 * overwrites a name somebody has since edited.
 */

import prisma from "../../config/prisma"
import type { AccountCashKind, AccountType } from "../../generated/prisma/client"

export interface ChartEntry {
  code: string
  name: string
  type: AccountType
  parent?: string
  isGroup?: boolean
  cashKind?: AccountCashKind
  systemRole?: string
  /** The note number in the audited FY 2024-25 statements, where it has one. */
  note?: string
}

const g = (
  code: string,
  name: string,
  type: AccountType,
  extra: Partial<ChartEntry> = {}
): ChartEntry => ({ code, name, type, isGroup: true, ...extra })

const a = (
  code: string,
  name: string,
  type: AccountType,
  parent: string,
  extra: Partial<ChartEntry> = {}
): ChartEntry => ({ code, name, type, parent, isGroup: false, ...extra })

/** Ordered parents-before-children, so one pass can create the whole tree. */
export const CHART: ChartEntry[] = [
  // ── 1000 ASSETS ──
  g("1000", "Assets", "ASSET"),
  g("1100", "Non-Current Assets", "ASSET", { parent: "1000", systemRole: "NON_CURRENT_ASSETS" }),
  g("1110", "Property, Plant & Equipment", "ASSET", { parent: "1100", systemRole: "PPE_COST", note: "4.00" }),
  a("1111", "Furniture & Fixture", "ASSET", "1110"),
  a("1112", "Office Equipments", "ASSET", "1110"),
  a("1113", "Software / Domain", "ASSET", "1110"),
  a("1114", "Computer / Laptop", "ASSET", "1110"),
  g("1120", "Accumulated Depreciation", "ASSET", { parent: "1100", systemRole: "PPE_ACCUM_DEP" }),
  a("1121", "Acc. Dep. — Furniture & Fixture", "ASSET", "1120"),
  a("1122", "Acc. Dep. — Office Equipments", "ASSET", "1120"),
  a("1123", "Acc. Dep. — Software / Domain", "ASSET", "1120"),
  a("1124", "Acc. Dep. — Computer / Laptop", "ASSET", "1120"),
  g("1130", "Preliminary Expenses", "ASSET", { parent: "1100", note: "5.00" }),
  a("1131", "Registration Cost", "ASSET", "1130"),
  a("1132", "Trade Licence", "ASSET", "1130"),

  g("1200", "Current Assets", "ASSET", { parent: "1000", systemRole: "CURRENT_ASSETS" }),
  g("1210", "Inventories", "ASSET", { parent: "1200", note: "6.00" }),
  a("1211", "Developed Software (Completed)", "ASSET", "1210"),
  a("1212", "Raw Materials", "ASSET", "1210"),
  a("1213", "Software Work in Process", "ASSET", "1210"),
  a("1220", "Trade and other Receivables", "ASSET", "1200", { note: "7.00" }),
  g("1230", "Advance, Deposit & Prepayments", "ASSET", { parent: "1200", note: "8.00" }),
  a("1231", "Advance against Office Rent", "ASSET", "1230"),
  g("1240", "Cash & Cash Equivalents", "ASSET", { parent: "1200", note: "9.00" }),
  a("1241", "Cash in Hand", "ASSET", "1240", { cashKind: "CASH" }),
  a("1242", "City Bank — A/C 1104400708001", "ASSET", "1240", { cashKind: "BANK", note: "9.01" }),
  // Seeded so the chart is complete; nothing posts to these until slice 4.
  a("1250", "Employee Advances", "ASSET", "1200"),
  a("1260", "Employee Loans", "ASSET", "1200"),

  // ── 2000 LIABILITIES ──
  g("2000", "Liabilities", "LIABILITY"),
  g("2100", "Current Liabilities", "LIABILITY", { parent: "2000", systemRole: "CURRENT_LIABILITIES" }),
  a("2110", "Trade and other Payables", "LIABILITY", "2100", { note: "12.00" }),
  a("2120", "Provision for Income Tax", "LIABILITY", "2100", { note: "13.00" }),
  g("2130", "Liabilities for Expenses", "LIABILITY", { parent: "2100", note: "14.00" }),
  a("2131", "Audit Fee Payable", "LIABILITY", "2130"),
  a("2132", "Salary Payable", "LIABILITY", "2130"),
  a("2133", "Bonus Payable", "LIABILITY", "2130"),
  a("2134", "Overtime Payable", "LIABILITY", "2130"),
  a("2140", "Tax Deducted at Source Payable", "LIABILITY", "2100"),
  a("2150", "VAT Payable", "LIABILITY", "2100"),
  g("2200", "Non-Current Liabilities", "LIABILITY", { parent: "2000", systemRole: "NON_CURRENT_LIABILITIES" }),
  a("2210", "Loan Payable", "LIABILITY", "2200"),

  // ── 3000 EQUITY ──
  // No systemRole on the section: `type: EQUITY` already identifies it.
  g("3000", "Equity", "EQUITY"),
  a("3100", "Share Capital", "EQUITY", "3000", { note: "10.00" }),
  a("3200", "Share Money Deposit", "EQUITY", "3000"),
  a("3300", "Retained Earnings", "EQUITY", "3000", { systemRole: "RETAINED_EARNINGS", note: "11.00" }),

  // ── 4000 INCOME ──
  g("4000", "Income", "INCOME"),
  g("4100", "Revenue", "INCOME", { parent: "4000", systemRole: "REVENUE", note: "15.00" }),
  a("4110", "Service Revenue — Export", "INCOME", "4100"),
  a("4120", "Service Revenue — Local", "INCOME", "4100"),
  a("4130", "Product Sales", "INCOME", "4100"),
  g("4200", "Other Income", "INCOME", { parent: "4000", systemRole: "OTHER_INCOME" }),
  a("4210", "Interest Income", "INCOME", "4200"),
  a("4290", "Miscellaneous Income", "INCOME", "4200"),

  // ── 5000 EXPENSES ──
  g("5000", "Expenses", "EXPENSE"),
  g("5100", "Cost of Goods Sold", "EXPENSE", { parent: "5000", systemRole: "COST_OF_SALES", note: "16.00" }),
  a("5110", "Materials Consumed", "EXPENSE", "5100"),
  g("5120", "Direct Expenses", "EXPENSE", { parent: "5100", note: "16.01" }),
  a("5121", "Hardware Purchase", "EXPENSE", "5120"),
  a("5122", "Salary, Wages & Allowances", "EXPENSE", "5120"),
  a("5123", "Festival Bonus", "EXPENSE", "5120"),
  a("5124", "Electricity Charges", "EXPENSE", "5120"),
  a("5125", "Customs Duty", "EXPENSE", "5120"),
  a("5126", "C & F Expenses", "EXPENSE", "5120"),
  a("5127", "Suit & Domain Fee", "EXPENSE", "5120"),
  a("5128", "Depreciation — Direct", "EXPENSE", "5120"),

  g("5200", "Administrative & Selling Expenses", "EXPENSE", { parent: "5000", systemRole: "ADMIN_SELLING", note: "17.00" }),
  a("5201", "Salary and Allowances", "EXPENSE", "5200"),
  a("5202", "Festival Bonus", "EXPENSE", "5200"),
  a("5203", "Stationary", "EXPENSE", "5200"),
  a("5204", "Software Licence", "EXPENSE", "5200"),
  a("5205", "Entertainment", "EXPENSE", "5200"),
  a("5206", "Office Rent", "EXPENSE", "5200"),
  a("5207", "Office Expense", "EXPENSE", "5200"),
  a("5208", "Travel and Conveyance", "EXPENSE", "5200"),
  a("5209", "Electricity", "EXPENSE", "5200"),
  a("5210", "WASA Bill", "EXPENSE", "5200"),
  a("5211", "Internet Bill", "EXPENSE", "5200"),
  a("5212", "IT Accessories", "EXPENSE", "5200"),
  a("5213", "Repair & Maintenance", "EXPENSE", "5200"),
  a("5214", "Audit Fee", "EXPENSE", "5200"),
  a("5215", "Depreciation — Admin", "EXPENSE", "5200"),
  a("5216", "Training Expense", "EXPENSE", "5200"),
  a("5217", "Miscellaneous Expenses", "EXPENSE", "5200"),

  g("5300", "Financial Expenses", "EXPENSE", { parent: "5000", systemRole: "FINANCIAL_EXPENSE", note: "18.00" }),
  a("5310", "Bank Interest & Charges", "EXPENSE", "5300"),

  g("5400", "Income Tax Expense", "EXPENSE", { parent: "5000", systemRole: "TAX_EXPENSE", note: "19.00" }),
  a("5410", "Current Tax", "EXPENSE", "5400"),
]

export async function seedChartOfAccounts(): Promise<void> {
  // Sequential, not Promise.all: a child's parentId comes from the row its
  // parent just created, and CHART is ordered parents-first for exactly
  // this reason.
  const idByCode = new Map<string, string>()

  for (const entry of CHART) {
    const parentId = entry.parent ? idByCode.get(entry.parent) : undefined

    const account = await prisma.account.upsert({
      where: { code: entry.code },
      // Nothing is overwritten on re-run. A name somebody edited in the UI
      // must survive the next seed; only the structural fields are worth
      // repairing, and even those are left alone rather than fighting a
      // deliberate change.
      update: {},
      create: {
        code: entry.code,
        name: entry.name,
        type: entry.type,
        parentId: parentId ?? null,
        isGroup: entry.isGroup ?? false,
        cashKind: entry.cashKind ?? "NONE",
        systemRole: entry.systemRole ?? null,
        description: entry.note ? `Note ${entry.note} in the audited statements` : null,
      },
    })

    idByCode.set(entry.code, account.id)
  }
}
