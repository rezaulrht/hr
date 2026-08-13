import request from "supertest"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./statements.pnl", async () => {
  const { assertValidRange } = await import("./statements.period")
  return {
    // The real buildPnl enforces from ≤ to via assertValidRange; the mock
    // does the same so the route test exercises that 400 over HTTP.
    buildPnl: vi.fn(async (range: unknown) => {
      assertValidRange(range as { from: Date; to: Date })
      return { lines: [], netProfit: { current: "0.00", comparative: "0.00" } }
    }),
    pnlNetProfit: vi.fn(),
  }
})

vi.mock("./statements.position", () => ({
  buildPosition: vi.fn(async () => ({ assets: [], equityAndLiabilities: [], balances: true })),
}))

vi.mock("./statements.equity", () => ({
  buildEquity: vi.fn(async () => ({ columns: [], rows: [] })),
}))

import app from "../../app"
import { AppError } from "../../middleware/errorHandler"
import { signAccessToken } from "../auth/auth.utils"
import { buildEquity } from "./statements.equity"
import { buildPnl } from "./statements.pnl"
import { buildPosition } from "./statements.position"

const authHeader = (role: string) => ({
  Authorization: `Bearer ${signAccessToken({
    sub: `user-${role}`,
    role: role as never,
    email: `${role}@demo.com`,
    mustChangePassword: false,
  })}`,
})

const RANGE = "from=2024-07-01&to=2025-06-30"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("access", () => {
  it("lets a FINANCE_OFFICER read the profit or loss", async () => {
    const res = await request(app)
      .get(`/api/statements/profit-or-loss?${RANGE}`)
      .set(authHeader("FINANCE_OFFICER"))

    expect(res.status).toBe(200)
    expect(buildPnl).toHaveBeenCalled()
  })

  it("lets a SUPER_ADMIN read the financial position", async () => {
    const res = await request(app)
      .get(`/api/statements/financial-position?${RANGE}`)
      .set(authHeader("SUPER_ADMIN"))

    expect(res.status).toBe(200)
    expect(buildPosition).toHaveBeenCalled()
  })

  it("lets a FINANCE_OFFICER read the changes in equity", async () => {
    const res = await request(app)
      .get(`/api/statements/changes-in-equity?${RANGE}`)
      .set(authHeader("FINANCE_OFFICER"))

    expect(res.status).toBe(200)
    expect(buildEquity).toHaveBeenCalled()
  })

  it("403s an HR_ADMIN — the same rule as the ledger", async () => {
    const res = await request(app)
      .get(`/api/statements/profit-or-loss?${RANGE}`)
      .set(authHeader("HR_ADMIN"))

    expect(res.status).toBe(403)
    expect(buildPnl).not.toHaveBeenCalled()
  })

  it("403s a REPORTING_MANAGER", async () => {
    const res = await request(app)
      .get(`/api/statements/financial-position?${RANGE}`)
      .set(authHeader("REPORTING_MANAGER"))

    expect(res.status).toBe(403)
  })

  it("403s an EMPLOYEE", async () => {
    const res = await request(app)
      .get(`/api/statements/changes-in-equity?${RANGE}`)
      .set(authHeader("EMPLOYEE"))

    expect(res.status).toBe(403)
  })

  it("401s without a token", async () => {
    const res = await request(app).get(`/api/statements/profit-or-loss?${RANGE}`)

    expect(res.status).toBe(401)
  })
})

describe("validation", () => {
  it("coerces the dates to UTC midnight", async () => {
    await request(app)
      .get(`/api/statements/profit-or-loss?${RANGE}`)
      .set(authHeader("FINANCE_OFFICER"))

    const range = (buildPnl as any).mock.calls[0][0]
    expect(range.from.toISOString()).toBe("2024-07-01T00:00:00.000Z")
    expect(range.to.toISOString()).toBe("2025-06-30T00:00:00.000Z")
  })

  it("400s with no date range at all", async () => {
    const res = await request(app)
      .get("/api/statements/profit-or-loss")
      .set(authHeader("FINANCE_OFFICER"))

    expect(res.status).toBe(400)
  })

  it("400s when only one end of the range is given", async () => {
    const res = await request(app)
      .get("/api/statements/profit-or-loss?from=2024-07-01")
      .set(authHeader("FINANCE_OFFICER"))

    expect(res.status).toBe(400)
  })

  it("400s when the end date precedes the start", async () => {
    const res = await request(app)
      .get("/api/statements/profit-or-loss?from=2025-06-30&to=2024-07-01")
      .set(authHeader("FINANCE_OFFICER"))

    expect(res.status).toBe(400)
  })

  it("400s on an unparseable date", async () => {
    const res = await request(app)
      .get("/api/statements/profit-or-loss?from=last-tuesday&to=2025-06-30")
      .set(authHeader("FINANCE_OFFICER"))

    expect(res.status).toBe(400)
  })
})

describe("the unbalanced case", () => {
  it("passes the guard's 409 and its figures through to the client", async () => {
    ;(buildPnl as any).mockRejectedValue(
      new AppError(409, "The trial balance does not agree", {
        debitTotal: "808700.00",
        creditTotal: "800000.00",
        difference: "8700.00",
      })
    )

    const res = await request(app)
      .get(`/api/statements/profit-or-loss?${RANGE}`)
      .set(authHeader("FINANCE_OFFICER"))

    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({
      error: expect.stringContaining("does not agree"),
      debitTotal: "808700.00",
      difference: "8700.00",
    })
  })
})
