import { z } from "zod"

export const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})
export type AdminLoginInput = z.infer<typeof adminLoginSchema>

export const staffLoginSchema = z.object({
  employeeId: z.string().min(1),
  password: z.string().min(1),
})
export type StaffLoginInput = z.infer<typeof staffLoginSchema>

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
})
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
})
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
})
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

export const updateUserStatusSchema = z.object({
  isActive: z.boolean(),
})
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>

/**
 * Narrower than the Role enum on purpose. An EMPLOYEE or REPORTING_MANAGER
 * account needs an Employee row — department, designation, employment type,
 * joining date — which is POST /api/employees/staff, not this. Creating one
 * here would produce exactly the state setUserRole's guard refuses.
 */
export const createUserSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  role: z.enum(["SUPER_ADMIN", "HR_ADMIN", "FINANCE_OFFICER"]),
})
export type CreateUserInput = z.infer<typeof createUserSchema>

export const setUserRoleSchema = z.object({
  role: z.enum([
    "SUPER_ADMIN",
    "HR_ADMIN",
    "FINANCE_OFFICER",
    "REPORTING_MANAGER",
    "EMPLOYEE",
  ]),
})
export type SetUserRoleInput = z.infer<typeof setUserRoleSchema>
