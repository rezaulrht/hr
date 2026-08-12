import { describe, expect, it } from "vitest"

import {
  createAccountSchema,
  createJournalSchema,
  ledgerQuerySchema,
  reopenPeriodSchema,
  reverseJournalSchema,
} from "./accounting.validators"

describe("createAccountSchema", () => {
  it("accepts a leaf account", () => {
    const parsed = createAccountSchema.parse({
      code: "5201",
      name: "Salary and Allowances",
      type: "EXPENSE",
      parentId: "11111111-1111-4111-8111-111111111111",
    })

    expect(parsed).toMatchObject({ code: "5201", isGroup: false, cashKind: "NONE" })
  })

  it("trims a padded name rather than storing the padding", () => {
    expect(createAccountSchema.parse({ code: "5201", name: "  Rent  ", type: "EXPENSE" }).name).toBe(
      "Rent"
    )
  })

  it("rejects an empty name", () => {
    expect(() => createAccountSchema.parse({ code: "5201", name: "  ", type: "EXPENSE" })).toThrow()
  })

  it("rejects an unknown account type", () => {
    expect(() =>
      createAccountSchema.parse({ code: "5201", name: "Rent", type: "CONTRA" })
    ).toThrow()
  })
})

describe("createJournalSchema", () => {
  it("parses a four-leg journal and coerces the date", () => {
    const parsed = createJournalSchema.parse({
      date: "2026-07-31",
      narration: "Salary accrual for July 2026",
      lines: [
        { accountId: "11111111-1111-4111-8111-111111111111", debit: "500000.00", credit: "0" },
        { accountId: "22222222-2222-4222-8222-222222222222", debit: "20000.00", credit: "0" },
        { accountId: "33333333-3333-4333-8333-333333333333", debit: "0", credit: "30000.00" },
        { accountId: "44444444-4444-4444-8444-444444444444", debit: "0", credit: "490000.00" },
      ],
    })

    expect(parsed.date.toISOString()).toBe("2026-07-31T00:00:00.000Z")
    expect(parsed.lines).toHaveLength(4)
    expect(parsed.type).toBe("MANUAL")
  })

  it("defaults a missing debit or credit to zero so the client need not send both", () => {
    const parsed = createJournalSchema.parse({
      date: "2026-07-31",
      narration: "Rent",
      lines: [
        { accountId: "11111111-1111-4111-8111-111111111111", debit: "70500.00" },
        { accountId: "22222222-2222-4222-8222-222222222222", credit: "70500.00" },
      ],
    })

    expect(parsed.lines[0].credit).toBe("0")
    expect(parsed.lines[1].debit).toBe("0")
  })

  it("rejects a journal with fewer than two lines", () => {
    expect(() =>
      createJournalSchema.parse({
        date: "2026-07-31",
        narration: "Rent",
        lines: [{ accountId: "a", debit: "100" }],
      })
    ).toThrow()
  })

  it("rejects an empty narration — an unreadable journal is an unauditable one", () => {
    expect(() =>
      createJournalSchema.parse({
        date: "2026-07-31",
        narration: "   ",
        lines: [
          { accountId: "a", debit: "100" },
          { accountId: "b", credit: "100" },
        ],
      })
    ).toThrow()
  })

  it("rejects an amount that is not a decimal string", () => {
    expect(() =>
      createJournalSchema.parse({
        date: "2026-07-31",
        narration: "Rent",
        lines: [
          { accountId: "a", debit: "1e5" },
          { accountId: "b", credit: "100" },
        ],
      })
    ).toThrow()
  })

  it("rejects SYSTEM as a hand-created type — only postSystemJournal may write those", () => {
    expect(() =>
      createJournalSchema.parse({
        date: "2026-07-31",
        type: "SYSTEM",
        narration: "Payroll",
        lines: [
          { accountId: "a", debit: "100" },
          { accountId: "b", credit: "100" },
        ],
      })
    ).toThrow()
  })

  it("rejects CLOSING as a hand-created type — only year-end may draft one", () => {
    expect(() =>
      createJournalSchema.parse({
        date: "2027-06-30",
        type: "CLOSING",
        narration: "Year end",
        lines: [
          { accountId: "a", debit: "100" },
          { accountId: "b", credit: "100" },
        ],
      })
    ).toThrow()
  })
})

describe("reason fields", () => {
  it("requires a non-empty reopen reason", () => {
    expect(() => reopenPeriodSchema.parse({ reason: "" })).toThrow()
    expect(reopenPeriodSchema.parse({ reason: "Late vendor invoice" }).reason).toBe(
      "Late vendor invoice"
    )
  })

  it("requires a non-empty reversal reason", () => {
    expect(() => reverseJournalSchema.parse({ reason: "  " })).toThrow()
  })
})

describe("ledgerQuerySchema", () => {
  it("coerces from and to out of query strings", () => {
    const parsed = ledgerQuerySchema.parse({
      accountId: "11111111-1111-4111-8111-111111111111",
      from: "2026-07-01",
      to: "2026-07-31",
    })

    expect(parsed.from.toISOString()).toBe("2026-07-01T00:00:00.000Z")
    expect(parsed.to.toISOString()).toBe("2026-07-31T00:00:00.000Z")
  })

  it("rejects a range that ends before it starts", () => {
    expect(() =>
      ledgerQuerySchema.parse({
        accountId: "11111111-1111-4111-8111-111111111111",
        from: "2026-07-31",
        to: "2026-07-01",
      })
    ).toThrow()
  })
})

describe("date coercion", () => {
  it("truncates a timestamp to its UTC day", () => {
    const parsed = createJournalSchema.parse({
      date: "2026-07-31T10:34:56.789Z",
      narration: "Office rent",
      lines: [
        { accountId: "11111111-1111-4111-8111-111111111111", debit: "100.00" },
        { accountId: "22222222-2222-4222-8222-222222222222", credit: "100.00" },
      ],
    })

    // Untruncated, this date is past the July period's endDate of 31 July at
    // midnight and resolves to no period at all.
    expect(parsed.date.toISOString()).toBe("2026-07-31T00:00:00.000Z")
  })

  it("truncates on the ledger range too, so from and to stay date-only", () => {
    const parsed = ledgerQuerySchema.parse({
      accountId: "11111111-1111-4111-8111-111111111111",
      from: "2026-07-01T06:00:00.000Z",
      to: "2026-07-31T23:59:59.999Z",
    })

    expect(parsed.from.toISOString()).toBe("2026-07-01T00:00:00.000Z")
    expect(parsed.to.toISOString()).toBe("2026-07-31T00:00:00.000Z")
  })
})
