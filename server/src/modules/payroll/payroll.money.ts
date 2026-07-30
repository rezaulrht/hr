/**
 * The only file in the codebase that touches Prisma.Decimal directly.
 *
 * Money is exact decimal, never float. `0.1 + 0.2 !== 0.3` is not a curiosity
 * in payroll: sum 500 payslips with floats and the bank file total disagrees
 * with the run total by a few paisa, and somebody spends a day finding out
 * why.
 *
 * Everything here is pure — no Prisma, no Express — so its tests need no
 * mocks, following the `leave.dates.ts` and `attendance.time.ts` precedent.
 */

import { Prisma } from "../../generated/prisma/client"

/**
 * Not configurable, and deliberately not an env var. Making it settable would
 * imply the four `*Bdt` columns on Payslip could mean something else, and no
 * migration would fix rows already written under the old meaning.
 */
export const REPORTING_CURRENCY = "BDT" as const

export type Money = Prisma.Decimal

/**
 * Anything `dec` accepts. Spelled out rather than reached for as
 * `Prisma.Decimal.Value`: the generated client exports `Decimal` as a value
 * and a type but not as a namespace, so that path does not typecheck here.
 */
export type MoneyInput = string | number | Money

export const dec = (v: MoneyInput): Money => new Prisma.Decimal(v)

export const ZERO = dec(0)
export const ONE = dec(1)

/**
 * Half-up to 2dp — the rounding a payslip is read in.
 *
 * Half-up rounds away from zero on a negative, so -2.005 becomes -2.01. That
 * is the right behaviour for a deduction: it rounds in the same direction as
 * the equivalent earning, rather than quietly favouring whichever side of
 * zero the figure landed on.
 */
export const round2 = (v: Money): Money => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)

/** Sums an empty list to 0, never NaN — a month with no components is legal. */
export const sum = (values: Money[]): Money => values.reduce((a, b) => a.plus(b), ZERO)

/** basic × pct / 100, rounded. `pct` is percentage points, dimensionless. */
export const percentOf = (basic: Money, pct: Money): Money =>
  round2(basic.times(pct).dividedBy(100))

/** amount × payable / calendar, rounded. */
export const prorate = (amount: Money, payableDays: Money, calendarDays: Money): Money =>
  round2(amount.times(payableDays).dividedBy(calendarDays))

/**
 * Money leaves this process as a string. A JSON number is a float again, and
 * the client would be handed back the very error this module exists to avoid.
 */
export const toMoneyString = (v: Money): string => round2(v).toFixed(2)

/**
 * `rate` is always BDT per one unit of the foreign currency. Only that one
 * direction is stored, so both directions come from the same number and can
 * never disagree.
 *
 * **Neither function rounds.** A conversion is an intermediate step, and the
 * caller rounds once at the point it stores or displays the figure — the same
 * "round once per line and once per total" rule the payslip calculation
 * follows. Rounding here instead would break the round trip precisely for a
 * stored-inverse rate like 0.008163, which is the concrete failure the
 * single-direction rule exists to prevent.
 */
export const toBdt = (amount: Money, rateBdtPerUnit: Money): Money => amount.times(rateBdtPerUnit)

export const fromBdt = (amount: Money, rateBdtPerUnit: Money): Money =>
  amount.dividedBy(rateBdtPerUnit)

/**
 * One reporting-currency total, ready to store in a `*Bdt` column.
 *
 * **Every `*Bdt` total is converted from its own native figure — never derived
 * by arithmetic on the other BDT columns.** The design spec states the rule
 * ("the BDT column is a conversion of the total, not a sum of converted
 * lines") and pins it as an invariant: `netPayBdt === round2(netPay × rate)`,
 * and likewise for the other three.
 *
 * The consequence to know before "fixing" it: because each total rounds
 * independently, `grossPayBdt − totalDeductionsBdt` can differ from
 * `netPayBdt` by 0.01. That is reachable at the ordinary 122.5 rate, not just
 * at exotic ones — roughly one two-decimal gross/deduction pair in five.
 *
 * Deriving `netPayBdt` by subtraction would make that one column add up and
 * break the invariant for every other figure on the payslip, including the one
 * the bank file pays from. Convert each total; do not reconcile them.
 */
export const bdtTotal = (native: Money, rateBdtPerUnit: Money): Money =>
  round2(toBdt(native, rateBdtPerUnit))
