import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => ({
  default: {
    payrollRun: { findUnique: vi.fn() },
  },
}))

import prisma from "../../config/prisma"
import { bankFileSummary, buildBankFile, csvCell, toCsv } from "./payroll.bankfile"
import { dec } from "./payroll.money"

function payslipRow(over: Record<string, unknown> = {}) {
  return {
    payslipNo: "BS-PAY-000001",
    currency: "BDT",
    netPayable: dec("65958.06"),
    netPayableBdt: dec("65958.06"),
    employee: {
      fullName: "Ayesha Rahman",
      employeeCode: "BS-EMP-001",
      bankName: "Dutch-Bangla Bank",
      bankAccountNumber: "1234567890",
      bankRoutingNumber: "090261726",
    },
    ...over,
  }
}

const usdPayslip = payslipRow({
  payslipNo: "BS-PAY-000002",
  currency: "USD",
  netPayable: dec("2935.10"),
  netPayableBdt: dec("359549.75"),
  employee: {
    fullName: "Sam Lee",
    employeeCode: "BS-EMP-002",
    bankName: "Citibank NA",
    bankAccountNumber: "9876543210",
    bankRoutingNumber: "021000089",
  },
})

const runWith = (payslips: unknown[], status = "APPROVED") =>
  ({ id: "run-1", month: 7, year: 2026, status, payslips }) as never

beforeEach(() => {
  vi.mocked(prisma.payrollRun.findUnique).mockResolvedValue(runWith([payslipRow()]))
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("csvCell", () => {
  it("quotes a value containing a comma", () => {
    // Without this every later column shifts by one.
    expect(csvCell("Rahman, Ayesha")).toBe('"Rahman, Ayesha"')
  })

  it("escapes an embedded quote by doubling it", () => {
    expect(csvCell('Ayesha "Ayesh" Rahman')).toBe('"Ayesha ""Ayesh"" Rahman"')
  })

  it("quotes a value containing a newline", () => {
    expect(csvCell("Line1\nLine2")).toBe('"Line1\nLine2"')
  })

  it("leaves an ordinary value unquoted", () => {
    expect(csvCell("Ayesha Rahman")).toBe("Ayesha Rahman")
  })
})

describe("toCsv", () => {
  it("emits a header row and one row per beneficiary", () => {
    const csv = toCsv([
      {
        employeeCode: "BS-EMP-001",
        beneficiaryName: "Ayesha Rahman",
        bankName: "DBBL",
        bankAccountNumber: "123",
        bankRoutingNumber: "090",
        amount: "100.00",
        currency: "BDT",
        amountBdt: "100.00",
        payslipNo: "BS-PAY-000001",
      },
    ])
    const lines = csv.split("\r\n")
    expect(lines[0]).toContain("EmployeeCode")
    expect(lines[1]).toBe("BS-EMP-001,Ayesha Rahman,DBBL,123,090,100.00,BDT,100.00,BS-PAY-000001")
  })
})

describe("buildBankFile", () => {
  it("409s a DRAFT run — a draft bank file is one somebody pays from by accident", async () => {
    vi.mocked(prisma.payrollRun.findUnique).mockResolvedValue(runWith([payslipRow()], "DRAFT"))
    await expect(buildBankFile("run-1", "BDT")).rejects.toMatchObject({ statusCode: 409 })
  })

  it("409s a SUBMITTED run", async () => {
    vi.mocked(prisma.payrollRun.findUnique).mockResolvedValue(runWith([payslipRow()], "SUBMITTED"))
    await expect(buildBankFile("run-1", "BDT")).rejects.toMatchObject({ statusCode: 409 })
  })

  it("allows a DISBURSED run, so the file can be re-downloaded", async () => {
    vi.mocked(prisma.payrollRun.findUnique).mockResolvedValue(runWith([payslipRow()], "DISBURSED"))
    await expect(buildBankFile("run-1", "BDT")).resolves.toBeTruthy()
  })

  it("409s and names the employee when a routing number is missing", async () => {
    // The bank rejects a batch as a whole, so emitting a partial file is
    // worse than useless: it looks like success.
    vi.mocked(prisma.payrollRun.findUnique).mockResolvedValue(
      runWith([
        payslipRow({
          employee: { ...payslipRow().employee, bankRoutingNumber: null },
        }),
      ])
    )
    const failure = buildBankFile("run-1", "BDT")
    await expect(failure).rejects.toMatchObject({ statusCode: 409 })
    await expect(failure).rejects.toMatchObject({
      details: {
        missingBankDetails: [
          expect.objectContaining({
            employeeCode: "BS-EMP-001",
            missing: ["bankRoutingNumber"],
          }),
        ],
      },
    })
  })

  it("treats a blank routing number as missing, not as present", async () => {
    vi.mocked(prisma.payrollRun.findUnique).mockResolvedValue(
      runWith([payslipRow({ employee: { ...payslipRow().employee, bankRoutingNumber: "   " } })])
    )
    await expect(buildBankFile("run-1", "BDT")).rejects.toMatchObject({ statusCode: 409 })
  })

  it("emits nothing at all when one beneficiary is malformed", async () => {
    vi.mocked(prisma.payrollRun.findUnique).mockResolvedValue(
      runWith([
        payslipRow(),
        payslipRow({
          payslipNo: "BS-PAY-000003",
          employee: { ...payslipRow().employee, employeeCode: "BS-EMP-003", bankName: null },
        }),
      ])
    )
    await expect(buildBankFile("run-1", "BDT")).rejects.toMatchObject({ statusCode: 409 })
  })

  it("totals match the payslip sums for the requested currency", async () => {
    vi.mocked(prisma.payrollRun.findUnique).mockResolvedValue(
      runWith([payslipRow(), payslipRow({ payslipNo: "BS-PAY-000004" })])
    )
    const result = await buildBankFile("run-1", "BDT")
    expect(result.manifest.rows).toBe(2)
    expect(result.manifest.totalNative).toBe("131916.12")
    expect(result.manifest.totalBdt).toBe("131916.12")
  })

  it("names what it excluded, so a filtered file cannot look complete", async () => {
    // The dangerous failure is silence: a BDT-only file that omits every
    // USD-paid employee looks entirely successful.
    vi.mocked(prisma.payrollRun.findUnique).mockResolvedValue(runWith([payslipRow(), usdPayslip]))
    const result = await buildBankFile("run-1", "BDT")
    expect(result.manifest.rows).toBe(1)
    expect(result.manifest.excluded).toEqual([{ currency: "USD", rows: 1 }])
  })

  it("puts the USD employee in the USD file and out of the BDT one", async () => {
    vi.mocked(prisma.payrollRun.findUnique).mockResolvedValue(runWith([payslipRow(), usdPayslip]))
    const bdt = await buildBankFile("run-1", "BDT")
    const usd = await buildBankFile("run-1", "USD")
    expect(bdt.rows.map((r) => r.employeeCode)).toEqual(["BS-EMP-001"])
    expect(usd.rows.map((r) => r.employeeCode)).toEqual(["BS-EMP-002"])
    expect(usd.manifest.totalNative).toBe("2935.10")
    expect(usd.manifest.totalBdt).toBe("359549.75")
  })

  it("quotes a beneficiary name containing a comma in the emitted CSV", async () => {
    vi.mocked(prisma.payrollRun.findUnique).mockResolvedValue(
      runWith([payslipRow({ employee: { ...payslipRow().employee, fullName: "Rahman, Ayesha" } })])
    )
    const result = await buildBankFile("run-1", "BDT")
    expect(result.csv).toContain('"Rahman, Ayesha"')
  })
})

describe("bankFileSummary", () => {
  it("asserts row counts across all currencies equal the payslip count", async () => {
    // The identity this whole design exists for. If it fails, some payslip
    // belongs to no file and that person does not get paid.
    vi.mocked(prisma.payrollRun.findUnique).mockResolvedValue(runWith([payslipRow(), usdPayslip]))
    const summary = await bankFileSummary("run-1")
    expect(summary.payslipCount).toBe(2)
    expect(summary.totalRows).toBe(2)
    expect(summary.complete).toBe(true)
  })

  it("breaks totals down per currency", async () => {
    vi.mocked(prisma.payrollRun.findUnique).mockResolvedValue(runWith([payslipRow(), usdPayslip]))
    const summary = await bankFileSummary("run-1")
    expect(summary.currencies).toEqual(
      expect.arrayContaining([
        { currency: "BDT", rows: 1, totalNative: "65958.06", totalBdt: "65958.06" },
        { currency: "USD", rows: 1, totalNative: "2935.10", totalBdt: "359549.75" },
      ])
    )
  })

  it("reports complete for an empty run rather than crashing", async () => {
    vi.mocked(prisma.payrollRun.findUnique).mockResolvedValue(runWith([]))
    const summary = await bankFileSummary("run-1")
    expect(summary).toMatchObject({ payslipCount: 0, totalRows: 0, complete: true, currencies: [] })
  })
})
