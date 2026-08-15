import type { Prisma } from "../../generated/prisma/client"

export interface DepreciableAsset {
  id: string
  assetTag: string
  purchaseDate: Date
  purchaseCostBdt: Prisma.Decimal
  /** Null until Finance capitalises it. An uncapitalised asset is skipped. */
  capitalisedAt: Date | null
  /** Annual percentage from Account.depreciationRate, e.g. 20.00 for 20%. */
  rate: Prisma.Decimal
  /** The PPE cost account the category resolved to, e.g. "1114". */
  classAccountCode: string
  costNature: "DIRECT" | "ADMINISTRATIVE"
  /** retiredAt, or null while in service. Charged in full for the month it falls in. */
  stoppedAt: Date | null
}

export interface PriorCharge {
  assetId: string
  year: number
  month: number
  amount: Prisma.Decimal
}

export interface ComputedCharge {
  assetId: string
  amount: Prisma.Decimal
  openingBookValue: Prisma.Decimal
  rate: Prisma.Decimal
  months: number
  classAccountCode: string
  costNature: "DIRECT" | "ADMINISTRATIVE"
}
