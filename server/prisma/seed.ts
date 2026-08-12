import "dotenv/config"
import { PrismaPg } from "@prisma/adapter-pg"
import {
  AnnouncementAudience,
  PrismaClient,
  Role,
  type HolidayType,
} from "../src/generated/prisma/client"
import { hashPassword } from "../src/modules/auth/auth.utils"
import { LEAVE_TYPE_CATALOGUE } from "../src/modules/leave/leave.policy"
import { seedChartOfAccounts } from "../src/modules/accounting/accounting.seed"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const SEED_PASSWORD = "Demo@12345"

async function seedAdminUser(email: string, role: Role) {
  const passwordHash = await hashPassword(SEED_PASSWORD)
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, role, mustChangePassword: false },
  })
}

/**
 * Bangladesh government holidays for 2026, compiled from the gazette as
 * reported by The Daily Star and CalendarLabs, with the May cabinet
 * amendment applied.
 *
 * The Islamic dates depend on moon sighting and are expected to shift by a
 * day either way — and the government amends its own list mid-year, as the
 * Eid-ul-Azha rows below show. This is a starting point, not an authority:
 * HR owns the calendar from here via the holiday endpoints.
 */
const HOLIDAYS_2026 = [
  ["2026-02-04", "Shab-e-Barat", "GENERAL"],
  ["2026-02-21", "Shaheed Day / International Mother Language Day", "GENERAL"],
  ["2026-03-18", "Laylatul Qadr", "GENERAL"],
  ["2026-03-19", "Eid-ul-Fitr holiday", "EXECUTIVE_ORDER"],
  ["2026-03-20", "Jumatul Bidah", "GENERAL"],
  ["2026-03-21", "Eid-ul-Fitr", "GENERAL"],
  ["2026-03-22", "Eid-ul-Fitr holiday", "EXECUTIVE_ORDER"],
  ["2026-03-23", "Eid-ul-Fitr holiday", "EXECUTIVE_ORDER"],
  ["2026-03-26", "Independence Day", "GENERAL"],
  ["2026-04-14", "Pahela Baishakh", "GENERAL"],
  ["2026-05-01", "May Day", "GENERAL"],
  // Shares a date with May Day. This pair is why Holiday is unique on
  // (date, name) rather than on date alone.
  ["2026-05-01", "Buddha Purnima", "GENERAL"],
  // The cabinet cancelled this weekly holiday when it extended Eid-ul-Azha
  // to seven days. This row is the reason HolidayType.WORKING_DAY exists —
  // a calendar that can only take days away could not express it.
  ["2026-05-23", "Weekly holiday cancelled (Eid-ul-Azha adjustment)", "WORKING_DAY"],
  ["2026-05-25", "Eid-ul-Azha holiday", "EXECUTIVE_ORDER"],
  ["2026-05-26", "Eid-ul-Azha holiday", "EXECUTIVE_ORDER"],
  ["2026-05-27", "Eid-ul-Azha", "GENERAL"],
  ["2026-05-28", "Eid-ul-Azha holiday", "EXECUTIVE_ORDER"],
  ["2026-05-29", "Eid-ul-Azha holiday", "EXECUTIVE_ORDER"],
  ["2026-05-30", "Eid-ul-Azha holiday", "EXECUTIVE_ORDER"],
  ["2026-05-31", "Eid-ul-Azha holiday", "EXECUTIVE_ORDER"],
  ["2026-06-26", "Ashura", "GENERAL"],
  ["2026-08-05", "July Uprising Day", "GENERAL"],
  ["2026-08-25", "Eid-e-Milad-un-Nabi", "GENERAL"],
  ["2026-09-04", "Shuba Janmashtami", "GENERAL"],
  ["2026-10-20", "Durga Puja (Maha Navami)", "EXECUTIVE_ORDER"],
  ["2026-10-21", "Vijaya Dashami", "GENERAL"],
  ["2026-12-16", "Victory Day", "GENERAL"],
  ["2026-12-25", "Christmas Day", "GENERAL"],
] as const satisfies ReadonlyArray<readonly [string, string, HolidayType]>

/**
 * Three announcements covering the three states the read filter produces:
 * live and company-wide, live and department-scoped, and scheduled.
 *
 * The scheduled one is dated a day ahead of the seed run rather than a fixed
 * date, so it is genuinely in the future whenever the seed happens to be run
 * — otherwise the behaviour it exists to demonstrate would have expired.
 *
 * Matched by title rather than upserted: `Announcement` has no natural key,
 * and inventing a unique constraint on `title` to make the seed convenient
 * would forbid HR from ever reusing a subject line.
 */
async function seedAnnouncements(hrUserId: string) {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)

  const announcements = [
    {
      title: "Eid-ul-Azha holiday schedule",
      body: "The office will be closed from 26 to 29 May. Payroll for May is unaffected and will be disbursed on the usual date.",
      publishedBy: hrUserId,
      audience: AnnouncementAudience.ALL,
      publishedAt: new Date(),
    },
    {
      title: "Engineering: sprint demo moved to Thursday",
      body: "This week's demo moves to Thursday 15:00 to avoid the release window.",
      // Published by HR rather than by an Engineering manager: the seed creates
      // no staff accounts. The row is kept because it is the only one with a
      // DEPARTMENT audience, and the three rows exist to cover the three states
      // the read filter produces. The author is incidental to that; the
      // audience is not.
      publishedBy: hrUserId,
      audience: AnnouncementAudience.DEPARTMENT,
      departmentName: "Engineering",
      publishedAt: new Date(),
    },
    {
      title: "Annual appraisal window opens",
      body: "Self-assessments open tomorrow and close at the end of the month.",
      publishedBy: hrUserId,
      audience: AnnouncementAudience.ALL,
      // Invisible to everyone but its publisher until the clock passes it,
      // with no job running and no second write.
      publishedAt: tomorrow,
    },
  ]

  for (const { departmentName, ...announcement } of announcements) {
    const existing = await prisma.announcement.findFirst({
      where: { title: announcement.title },
      select: { id: true },
    })
    if (existing) continue

    const departmentId = departmentName
      ? (await prisma.department.findUniqueOrThrow({ where: { name: departmentName } })).id
      : null

    await prisma.announcement.create({ data: { ...announcement, departmentId } })
  }
}

// Asset categories. A table rather than an enum because HR will add
// "docking station" and no code branches on the name — the same rule
// Department and LeaveType follow.
const ASSET_CATEGORIES = [
  { code: "LAPTOP", name: "Laptop", requiresSerial: true, isConsumable: false, usefulLifeMonths: 36 },
  { code: "DESKTOP", name: "Desktop", requiresSerial: true, isConsumable: false, usefulLifeMonths: 48 },
  { code: "MONITOR", name: "Monitor", requiresSerial: true, isConsumable: false, usefulLifeMonths: 60 },
  { code: "PHONE", name: "Mobile phone", requiresSerial: true, isConsumable: false, usefulLifeMonths: 24 },
  // A chair has no serial and a headset is never chased. Both still get a
  // row and a tag, because knowing you issued 40 headsets last year is
  // exactly what this register is for.
  { code: "FURNITURE", name: "Furniture", requiresSerial: false, isConsumable: false, usefulLifeMonths: 120 },
  { code: "PERIPHERAL", name: "Peripheral", requiresSerial: false, isConsumable: true, usefulLifeMonths: null },
  { code: "VEHICLE", name: "Vehicle", requiresSerial: true, isConsumable: false, usefulLifeMonths: 120 },
  // A licence cannot be physically returned and has no serial. One register
  // row is all it gets this phase.
  { code: "LICENCE", name: "Software licence", requiresSerial: false, isConsumable: false, usefulLifeMonths: 12 },
]

async function seedAssetCategories() {
  for (const category of ASSET_CATEGORIES) {
    await prisma.assetCategory.upsert({
      where: { code: category.code },
      update: {},
      create: category,
    })
  }
}

// Cost categories. A table rather than an enum because Finance will add
// "gas bill" and no code branches on the name.
const costCategories = [
  { code: "RENT", name: "Office rent" },
  { code: "ELECTRICITY", name: "Electricity" },
  { code: "WATER", name: "Water" },
  { code: "INTERNET", name: "Internet" },
  { code: "CLEANING", name: "Cleaning" },
  { code: "SECURITY", name: "Security" },
  { code: "MAINTENANCE", name: "Maintenance" },
  { code: "OTHER", name: "Other" },
]

async function seedCostCategories() {
  for (const category of costCategories) {
    await prisma.costCategory.upsert({
      where: { code: category.code },
      update: {},
      create: category,
    })
  }
}

async function main() {
  const superAdmin = await seedAdminUser("admin@demo.com", Role.SUPER_ADMIN)
  const hrAdmin = await seedAdminUser("hr@demo.com", Role.HR_ADMIN)
  await seedAdminUser("finance@demo.com", Role.FINANCE_OFFICER)

  const departments = ["Engineering", "People Operations", "Finance", "Operations"]
  for (const name of departments) {
    await prisma.department.upsert({ where: { name }, update: {}, create: { name } })
  }

  await seedAssetCategories()
  await seedCostCategories()
  await seedChartOfAccounts()

  // The standing shift every employee falls back to when shiftId is null.
  // 09:00-18:00 with the 1h lunch/break inside the span, so a full day is
  // 9 elapsed hours and nothing subtracts the break downstream.
  const generalShift = {
    startTime: "09:00",
    endTime: "18:00",
    breakMinutes: 60,
    graceMinutes: 15,
    // Friday only, matching what the leave module already assumes. A
    // Friday+Saturday weekend would be [5, 6] — one value, but it moves
    // every workingDays count and therefore every payroll denominator.
    weeklyOffDays: [5],
  }

  await prisma.shift.upsert({
    where: { name: "General" },
    // Filled in, not `{}` — an empty update makes re-seeding silently skip
    // a row that already exists, so a changed shift would never take effect.
    update: generalShift,
    create: { name: "General", ...generalShift },
  })

  for (const [date, name, type] of HOLIDAYS_2026) {
    // Pinned to UTC midnight. A stray time component would make the row
    // silently never match a day-grid comparison — it would read as "the
    // holiday just doesn't work" rather than as an error.
    const at = new Date(`${date}T00:00:00.000Z`)
    await prisma.holiday.upsert({
      where: { date_name: { date: at, name } },
      update: { type },
      create: { date: at, name, type },
    })
  }

  // The Bangladesh Labour Act catalogue. Upserted by `code`, never by name —
  // the migration renamed the old "Annual" row to code EARNED, and matching
  // on name would create a duplicate instead of finding it.
  for (const leaveType of LEAVE_TYPE_CATALOGUE) {
    const existing = await prisma.leaveType.findUnique({ where: { code: leaveType.code } })

    // A benefit the company grants on top of the Act is left exactly as HR
    // tuned it. Only the statutory rows are rewritten, so correcting a
    // section number in leave.policy.ts can never quietly reduce someone's
    // company-policy allowance back to a default.
    if (existing && !leaveType.statutory) continue

    await prisma.leaveType.upsert({
      where: { code: leaveType.code },
      // Not `{}` — an empty update makes re-seeding silently skip rows that
      // already exist, so new fields would never reach them.
      update: {
        name: leaveType.name,
        isPaid: leaveType.isPaid,
        annualQuota: leaveType.annualQuota,
        carryForwardPct: leaveType.carryForwardPct,
        maxConsecutive: leaveType.maxConsecutive,
        allowsBackdating: leaveType.allowsBackdating,
        eligibleFor: leaveType.eligibleFor,
        statutory: leaveType.statutory,
        countsHolidays: leaveType.countsHolidays,
        accrualBasis: leaveType.accrualBasis,
        minServiceMonths: leaveType.minServiceMonths,
        maxAccrual: leaveType.maxAccrual,
        // PERSONAL and LWP are non-statutory, so the `continue` above skips
        // them once they exist and they keep the column default of `true`.
        // That is the intended value, but it is inherited rather than
        // asserted — do not "fix" that by dropping the statutory guard, which
        // exists so a section-number correction cannot quietly reduce a
        // company-policy allowance.
        allowsHalfDay: leaveType.allowsHalfDay,
      },
      create: leaveType,
    })
  }

  // One demo rate, so the USD path is walkable without data entry. Stored in
  // the single canonical direction (base USD, quote BDT); the inverse is
  // derived as 1/rate and never stored, so a round trip cannot lose money.
  const rate = {
    base: "USD",
    quote: "BDT",
    rate: 122.5,
    // UTC midnight, and early enough in the year that any 2026 payroll month
    // resolves it. A missing rate is a hard failure, never a default of 1.0.
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
  } as const

  await prisma.exchangeRate.upsert({
    where: {
      base_quote_effectiveFrom: {
        base: rate.base,
        quote: rate.quote,
        effectiveFrom: rate.effectiveFrom,
      },
    },
    // Filled in, so re-seeding a corrected rate actually lands. Editing a
    // rate row cannot corrupt history: every document freezes the rate value
    // it used, not a reference to this row.
    update: { rate: rate.rate },
    create: { ...rate, createdBy: superAdmin.id },
  })

  await seedAnnouncements(hrAdmin.id)

  console.log("Seed complete. All demo logins use the password: Demo@12345\n")
  console.log("Administrative roles sign in with an EMAIL:")
  console.log("  Super Admin:        admin@demo.com")
  console.log("  HR Admin:           hr@demo.com")
  console.log("  Finance Officer:    finance@demo.com\n")
  console.log("No staff accounts are seeded. Employees and reporting managers")
  console.log("are created through the app — POST /api/employees/staff — and sign")
  console.log("in with their employee code, never their email.\n")
  console.log("Payroll: no salary structure is seeded. Finance authors one and HR")
  console.log("  assigns it before a run can process anyone — an unassigned")
  console.log("  structure is payroll preflight blocker 3.")
  console.log("  Exchange rate: 1 USD = 122.500000 BDT, effective 2026-01-01.")
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
