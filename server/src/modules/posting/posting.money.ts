import { Prisma } from "../../generated/prisma/client"

const ZERO = new Prisma.Decimal(0)

/**
 * Convert a set of lines to BDT and make them sum to exactly `target`.
 *
 * Every source document freezes its own rate and stores both the foreign
 * figure and a `*Bdt` total. Converting the lines one at a time and rounding
 * each to two decimals will not generally reproduce that total — five lines
 * can each round up a half-paisa — and a journal that misses by 0.01 is
 * refused outright by `assertBalanced`.
 *
 * So the remainder is put on the largest line, where it is proportionally
 * least visible, rather than spread or dropped. The alternative, recomputing
 * the total from the converted lines, would make the ledger disagree with the
 * payslip or settlement it came from, which is worse than a paisa.
 *
 * Shared rather than duplicated: payroll and settlements hit the identical
 * problem, and two implementations of "convert and reconcile" is how they
 * come to round differently.
 */
export function toBdtAllocated(
  lines: Array<{ key: string; amount: Prisma.Decimal }>,
  rate: Prisma.Decimal,
  target: Prisma.Decimal
): Array<{ key: string; amount: Prisma.Decimal }> {
  if (lines.length === 0) return []

  const converted = lines.map((line) => ({
    key: line.key,
    amount: new Prisma.Decimal(line.amount.times(rate).toFixed(2)),
  }))

  const remainder = target.minus(converted.reduce((sum, line) => sum.plus(line.amount), ZERO))
  if (!remainder.isZero()) {
    // By absolute size: a negative line (a loss-of-pay adjustment) must not
    // win by being the most negative.
    const largest = converted.reduce(
      (index, line, i, all) => (line.amount.abs().greaterThan(all[index].amount.abs()) ? i : index),
      0
    )
    converted[largest].amount = converted[largest].amount.plus(remainder)
  }

  return converted
}
