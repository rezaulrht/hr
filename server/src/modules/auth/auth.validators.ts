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
