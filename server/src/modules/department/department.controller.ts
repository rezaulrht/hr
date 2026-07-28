import type { NextFunction, Request, Response } from "express"

import prisma from "../../config/prisma"

export async function listDepartmentsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const departments = await prisma.department.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    })
    return res.status(200).json(departments)
  } catch (err) {
    return next(err)
  }
}
