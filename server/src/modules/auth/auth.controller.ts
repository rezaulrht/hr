import type { NextFunction, Request, Response } from "express"

import * as authService from "./auth.service"
import {
  adminLoginSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  staffLoginSchema,
} from "./auth.validators"

const REFRESH_COOKIE_NAME = "refreshToken"

function refreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  }
}

export async function loginHandler(req: Request, res: Response, next: NextFunction) {
  const parsed = adminLoginSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body" })
  }
  try {
    const { accessToken, refreshToken, user } = await authService.loginAdmin(parsed.data.email, parsed.data.password)
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions())
    return res.status(200).json({ accessToken, user })
  } catch (err) {
    return next(err)
  }
}

export async function staffLoginHandler(req: Request, res: Response, next: NextFunction) {
  const parsed = staffLoginSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body" })
  }
  try {
    const { accessToken, refreshToken, user } = await authService.loginStaff(
      parsed.data.employeeId,
      parsed.data.password
    )
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions())
    return res.status(200).json({ accessToken, user })
  } catch (err) {
    return next(err)
  }
}

export async function refreshHandler(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[REFRESH_COOKIE_NAME]
  if (!token) {
    return res.status(401).json({ error: "No refresh token provided" })
  }
  try {
    const { accessToken, refreshToken, user } = await authService.refresh(token)
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions())
    return res.status(200).json({ accessToken, user })
  } catch (err) {
    return next(err)
  }
}

export async function logoutHandler(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[REFRESH_COOKIE_NAME]
  try {
    if (token) {
      await authService.logout(token)
    }
    res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions())
    return res.status(200).json({ success: true })
  } catch (err) {
    return next(err)
  }
}

export async function forgotPasswordHandler(req: Request, res: Response, next: NextFunction) {
  const parsed = forgotPasswordSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body" })
  }
  try {
    await authService.requestPasswordReset(parsed.data.email)
    return res.status(200).json({ success: true })
  } catch (err) {
    return next(err)
  }
}

export async function resetPasswordHandler(req: Request, res: Response, next: NextFunction) {
  const parsed = resetPasswordSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body" })
  }
  try {
    await authService.resetPassword(parsed.data.token, parsed.data.newPassword)
    return res.status(200).json({ success: true })
  } catch (err) {
    return next(err)
  }
}

export async function changePasswordHandler(req: Request, res: Response, next: NextFunction) {
  const parsed = changePasswordSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body" })
  }
  try {
    const result = await authService.changePassword(req.user!.sub, parsed.data.currentPassword, parsed.data.newPassword)
    return res.status(200).json(result)
  } catch (err) {
    return next(err)
  }
}
