import { describe, expect, it } from "vitest"
import {
  adminLoginSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  staffLoginSchema,
  updateUserStatusSchema,
} from "./auth.validators"

describe("adminLoginSchema", () => {
  it("accepts a valid email + password", () => {
    expect(adminLoginSchema.safeParse({ email: "a@b.com", password: "secret123" }).success).toBe(true)
  })

  it("rejects an invalid email", () => {
    expect(adminLoginSchema.safeParse({ email: "not-an-email", password: "secret123" }).success).toBe(false)
  })
})

describe("staffLoginSchema", () => {
  it("accepts a valid employeeId + password", () => {
    expect(staffLoginSchema.safeParse({ employeeId: "BS-EMP-00001", password: "secret123" }).success).toBe(true)
  })

  it("rejects a missing employeeId", () => {
    expect(staffLoginSchema.safeParse({ password: "secret123" }).success).toBe(false)
  })
})

describe("changePasswordSchema", () => {
  it("accepts a current password and an 8+ char new password", () => {
    expect(
      changePasswordSchema.safeParse({ currentPassword: "old", newPassword: "longenough" }).success
    ).toBe(true)
  })

  it("rejects a too-short new password", () => {
    expect(changePasswordSchema.safeParse({ currentPassword: "old", newPassword: "short" }).success).toBe(false)
  })
})

describe("forgotPasswordSchema", () => {
  it("accepts a valid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "a@b.com" }).success).toBe(true)
  })
})

describe("resetPasswordSchema", () => {
  it("accepts a token and an 8+ char password", () => {
    expect(resetPasswordSchema.safeParse({ token: "abc123", newPassword: "longenough" }).success).toBe(true)
  })

  it("rejects a too-short password", () => {
    expect(resetPasswordSchema.safeParse({ token: "abc123", newPassword: "short" }).success).toBe(false)
  })
})

describe("updateUserStatusSchema", () => {
  it("accepts a boolean isActive", () => {
    expect(updateUserStatusSchema.safeParse({ isActive: false }).success).toBe(true)
  })

  it("rejects a non-boolean isActive", () => {
    expect(updateUserStatusSchema.safeParse({ isActive: "yes" }).success).toBe(false)
  })
})
