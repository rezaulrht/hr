import { Prisma } from "../../generated/prisma/client"
import type { AccountType } from "../../generated/prisma/client"
import type { BalanceMap } from "./statements.balances"

const ZERO = new Prisma.Decimal(0)

export function compareRefs(a: string, b: string): number {
  const left = a.split(".").map(Number)
  const right = b.split(".").map(Number)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function movementOf(balances: BalanceMap, accountId: string): Prisma.Decimal {
  return balances.get(accountId)?.signed ?? ZERO
}

export function cashFlowContribution(type: AccountType, movement: Prisma.Decimal): Prisma.Decimal {
  const creditNormal = type === "LIABILITY" || type === "EQUITY" || type === "INCOME"
  return creditNormal ? movement : movement.negated()
}
