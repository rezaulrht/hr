import { describe, expect, it, vi } from "vitest"
import { AppError, errorHandler } from "./errorHandler"

function mockRes() {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

describe("errorHandler", () => {
  it("responds with the AppError's status code and message", () => {
    const res = mockRes()
    errorHandler(new AppError(404, "Not found"), {} as any, res, vi.fn())
    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith({ error: "Not found" })
  })

  it("responds 500 with a generic message for unknown errors", () => {
    const res = mockRes()
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    errorHandler(new Error("boom"), {} as any, res, vi.fn())
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" })
    consoleSpy.mockRestore()
  })
})
