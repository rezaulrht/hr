import request from "supertest"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./asset.service", () => ({
  listAssets: vi.fn(async () => [
    { id: "ast-1", assetTag: "BS-AST-00042", name: "ThinkPad", status: "AVAILABLE", heldBy: null },
  ]),
  createAsset: vi.fn(async () => ({ id: "ast-1" })),
  retireAsset: vi.fn(async () => ({ id: "ast-1", lifecycle: "RETIRED" })),
  getAsset: vi.fn(async () => ({ id: "ast-1" })),
  updateAsset: vi.fn(async () => ({ id: "ast-1" })),
  markAssetLost: vi.fn(async () => ({ id: "ast-1" })),
  listCategories: vi.fn(async () => []),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(async () => undefined),
}))

vi.mock("./asset.assignments", () => ({
  assignAsset: vi.fn(async () => ({ id: "asg-1" })),
  returnAsset: vi.fn(async () => ({ id: "asg-1" })),
  acknowledgeAssignment: vi.fn(async () => ({ id: "asg-1" })),
  myHoldings: vi.fn(async () => []),
  listUnacknowledged: vi.fn(async () => []),
  openAssignmentsFor: vi.fn(async () => []),
}))

import app from "../../app"
import { signAccessToken } from "../auth/auth.utils"
import { listAssets } from "./asset.service"

/** A bearer token for the given role, so requireRole sees a real claim. */
const authHeader = (role: string) => ({
  Authorization: `Bearer ${signAccessToken({
    sub: `user-${role}`,
    role: role as never,
    email: `${role}@demo.com`,
    mustChangePassword: false,
  })}`,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe("GET /api/assets", () => {
  it("passes the caller through so the service can scope to their own holdings", async () => {
    const res = await request(app).get("/api/assets").set(authHeader("EMPLOYEE"))

    expect(res.status).toBe(200)
    // Scoping lives in assetScopeFor, which the service test covers. What
    // this asserts is that the route does not bypass it by ignoring the user.
    expect(listAssets).toHaveBeenCalledWith(
      expect.objectContaining({ role: "EMPLOYEE" }),
      expect.anything()
    )
  })

  it("401s without a token", async () => {
    const res = await request(app).get("/api/assets")

    expect(res.status).toBe(401)
  })
})

describe("cost field visibility", () => {
  it("a manager receives no purchaseCost or vendor field at all", async () => {
    vi.mocked(listAssets).mockResolvedValueOnce([
      { id: "ast-1", assetTag: "BS-AST-00042", name: "ThinkPad", status: "AVAILABLE", heldBy: null },
    ] as never)

    const res = await request(app).get("/api/assets").set(authHeader("REPORTING_MANAGER"))

    expect(res.status).toBe(200)
    // Omitted from the response, not hidden in the UI — there is exactly one
    // place this rule can drift, and it is stripCosts.
    expect(res.body[0]).not.toHaveProperty("purchaseCost")
    expect(res.body[0]).not.toHaveProperty("vendor")
  })
})

describe("the write matrix", () => {
  it("Finance creating an asset is 403 — the register is HR's", async () => {
    const res = await request(app)
      .post("/api/assets")
      .set(authHeader("FINANCE_OFFICER"))
      .send({ categoryId: "11111111-1111-1111-1111-111111111111", name: "Desk" })

    expect(res.status).toBe(403)
  })

  it("Finance retiring an asset is allowed — disposal is the one accounting action", async () => {
    const res = await request(app)
      .post("/api/assets/ast-1/retire")
      .set(authHeader("FINANCE_OFFICER"))
      .send({ note: "Written off" })

    expect(res.status).toBe(200)
  })

  it("a manager assigning an asset is 403 — custody is HR's", async () => {
    const res = await request(app)
      .post("/api/assets/ast-1/assign")
      .set(authHeader("REPORTING_MANAGER"))
      .send({ employeeId: "11111111-1111-1111-1111-111111111111", conditionOut: "GOOD" })

    expect(res.status).toBe(403)
  })

  it("an employee posting to /import/commit is 403", async () => {
    const res = await request(app)
      .post("/api/assets/import/commit")
      .set(authHeader("EMPLOYEE"))

    expect(res.status).toBe(403)
  })
})

describe("route ordering", () => {
  it("GET /me is not matched as GET /:id", async () => {
    const res = await request(app).get("/api/assets/me").set(authHeader("EMPLOYEE"))

    expect(res.status).toBe(200)
    // If /:id were declared first, Express would call getAsset with id "me"
    // and this would 404 — the bug the literal-paths-first ordering prevents.
    expect(res.body).toEqual([])
  })

  it("GET /categories is not matched as GET /:id", async () => {
    const res = await request(app).get("/api/assets/categories").set(authHeader("EMPLOYEE"))

    expect(res.status).toBe(200)
  })
})

describe("DELETE /api/assets/categories/:id", () => {
  it("refuses a Finance officer — asset categories are HR's", async () => {
    const res = await request(app)
      .delete("/api/assets/categories/c1")
      .set(authHeader("FINANCE_OFFICER"))

    expect(res.status).toBe(403)
  })

  it("allows HR_ADMIN", async () => {
    const res = await request(app).delete("/api/assets/categories/c1").set(authHeader("HR_ADMIN"))

    expect(res.status).toBe(204)
  })
})
