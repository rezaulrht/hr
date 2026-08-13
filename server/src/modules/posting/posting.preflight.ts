import type { Prisma } from "../../generated/prisma/client"

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
export interface PeriodCheck { date: string; label: string; status: "OPEN" | "CLOSED" | "LOCKED" | "MISSING"; ok: boolean }

export async function periodStatusFor(tx: Prisma.TransactionClient, date: Date): Promise<PeriodCheck> {
  const period = await tx.accountingPeriod.findFirst({ where: { startDate: { lte: date }, endDate: { gte: date } }, select: { status: true } })
  const status = period?.status ?? "MISSING"
  return { date: date.toISOString(), label: `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`, status, ok: status === "OPEN" }
}
