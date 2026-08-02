import "dotenv/config"
import { PrismaPg } from "@prisma/adapter-pg"
import {
  AnnouncementAudience,
  PrismaClient,
  Role,
  type ComponentCalc,
  type ComponentKind,
  type Currency,
  type HolidayType,
} from "../src/generated/prisma/client"
import { hashPassword } from "../src/modules/auth/auth.utils"
import { LEAVE_TYPE_CATALOGUE } from "../src/modules/leave/leave.policy"

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
 * Demo staff account with an Employee profile. Unlike the administrative
 * logins, these roles hold leave of their own, so leave can't be exercised
 * without them.
 *
 * Staff sign in with their employee code, never their email, so the code is
 * the credential that matters here — hence the readable `BS-EMP-DEMO` rather
 * than a serial. The IdCounter only ever emits zero-padded digits, so a
 * `DEMO` suffix can never collide with a real hire's generated code.
 */
async function seedStaffAccount(input: {
  email: string
  role: Extract<Role, "EMPLOYEE" | "REPORTING_MANAGER">
  employeeCode: string
  fullName: string
  designation: string
  departmentName: string
  reportingManagerId?: string
  salaryStructureId: string
}) {
  const passwordHash = await hashPassword(SEED_PASSWORD)
  const user = await prisma.user.upsert({
    where: { email: input.email },
    update: {},
    create: { email: input.email, passwordHash, role: input.role, mustChangePassword: false },
  })

  const department = await prisma.department.findUniqueOrThrow({
    where: { name: input.departmentName },
  })

  const employee = await prisma.employee.upsert({
    where: { userId: user.id },
    // Keep the sign-in code and the reporting line current. Without
    // employeeCode here, a demo account seeded under an older code would keep
    // it forever and the documented login would simply not work.
    update: {
      employeeCode: input.employeeCode,
      reportingManagerId: input.reportingManagerId ?? null,
      // Kept current on re-seed too. An unassigned structure is payroll
      // preflight blocker 3, so a demo account without one makes the very
      // first run unprocessable and reads as a bug rather than as the gate
      // working.
      salaryStructureId: input.salaryStructureId,
    },
    create: {
      userId: user.id,
      employeeCode: input.employeeCode,
      salaryStructureId: input.salaryStructureId,
      fullName: input.fullName,
      designation: input.designation,
      departmentId: department.id,
      employmentType: "FULL_TIME",
      // A prior-year joining date means a full, un-pro-rated entitlement.
      joiningDate: new Date(Date.UTC(new Date().getUTCFullYear() - 1, 0, 6)),
      reportingManagerId: input.reportingManagerId,
    },
  })

  return employee
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
 * Two structures, so the multi-currency payroll path is exercisable without
 * hand data entry. Percent-of-basic house rent is the Bangladeshi norm and is
 * exactly the case the old `allowances Json` blob could not express.
 *
 * `countsAsWages` is false for the deduction lines: §119 leave pay and the
 * §2(10) gratuity base are built from earnings, and a deduction has no
 * business in either.
 */
const SALARY_STRUCTURES = [
  {
    name: "Standard (BDT)",
    currency: "BDT",
    basic: 50000,
    components: [
      { code: "HOUSE_RENT", label: "House rent", kind: "EARNING", calc: "PERCENT_OF_BASIC", value: 50, sortOrder: 1, countsAsWages: true },
      { code: "MEDICAL", label: "Medical", kind: "EARNING", calc: "FIXED", value: 3000, sortOrder: 2, countsAsWages: true },
      { code: "CONVEYANCE", label: "Conveyance", kind: "EARNING", calc: "FIXED", value: 2000, sortOrder: 3, countsAsWages: true },
      { code: "PF", label: "Provident fund", kind: "DEDUCTION", calc: "PERCENT_OF_BASIC", value: 10, sortOrder: 1, countsAsWages: false },
      { code: "TAX", label: "Income tax", kind: "DEDUCTION", calc: "FIXED", value: 2500, sortOrder: 2, countsAsWages: false },
    ],
  },
  {
    name: "Standard (USD)",
    currency: "USD",
    basic: 2000,
    // FIXED values are in the structure's own currency, so these are dollars.
    // Entering the BDT figures here would overpay by roughly 122×, which is
    // the whole reason currency lives on the structure.
    components: [
      { code: "HOUSE_RENT", label: "House rent", kind: "EARNING", calc: "PERCENT_OF_BASIC", value: 50, sortOrder: 1, countsAsWages: true },
      { code: "MEDICAL", label: "Medical", kind: "EARNING", calc: "FIXED", value: 120, sortOrder: 2, countsAsWages: true },
      { code: "CONVEYANCE", label: "Conveyance", kind: "EARNING", calc: "FIXED", value: 80, sortOrder: 3, countsAsWages: true },
      { code: "PF", label: "Provident fund", kind: "DEDUCTION", calc: "PERCENT_OF_BASIC", value: 10, sortOrder: 1, countsAsWages: false },
      { code: "TAX", label: "Income tax", kind: "DEDUCTION", calc: "FIXED", value: 100, sortOrder: 2, countsAsWages: false },
    ],
  },
] as const satisfies ReadonlyArray<{
  name: string
  currency: Currency
  basic: number
  components: ReadonlyArray<{
    code: string
    label: string
    kind: ComponentKind
    calc: ComponentCalc
    value: number
    sortOrder: number
    countsAsWages: boolean
  }>
}>

async function seedSalaryStructures() {
  for (const structure of SALARY_STRUCTURES) {
    const { components, ...head } = structure

    const saved = await prisma.salaryStructure.upsert({
      where: { name: head.name },
      // Filled in, not `{}` — an empty update makes re-seeding silently skip
      // rows that already exist, so a corrected basic would never take
      // effect. `currency` is deliberately absent: it is immutable after
      // creation, because changing it re-denominates every figure at once.
      update: { basic: head.basic },
      create: head,
    })

    for (const component of components) {
      await prisma.salaryComponent.upsert({
        // By (structure, code), never by label — renaming a payslip line must
        // not create a second component alongside the original.
        where: { salaryStructureId_code: { salaryStructureId: saved.id, code: component.code } },
        update: component,
        create: { ...component, salaryStructureId: saved.id },
      })
    }
  }
}

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
async function seedAnnouncements(hrUserId: string, managerUserId: string) {
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
      publishedBy: managerUserId,
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

async function main() {
  const superAdmin = await seedAdminUser("admin@demo.com", Role.SUPER_ADMIN)
  const hrAdmin = await seedAdminUser("hr@demo.com", Role.HR_ADMIN)
  await seedAdminUser("finance@demo.com", Role.FINANCE_OFFICER)

  const departments = ["Engineering", "People Operations", "Finance", "Operations"]
  for (const name of departments) {
    await prisma.department.upsert({ where: { name }, update: {}, create: { name } })
  }

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

  await seedSalaryStructures()

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

  const bdtStructure = await prisma.salaryStructure.findUniqueOrThrow({
    where: { name: "Standard (BDT)" },
  })

  // The manager must exist first — the employee's reporting line points at it.
  const manager = await seedStaffAccount({
    email: "manager@demo.com",
    role: Role.REPORTING_MANAGER,
    employeeCode: "BS-MNG-DEMO",
    fullName: "Daniel Kim",
    designation: "Engineering Manager",
    departmentName: "Engineering",
    salaryStructureId: bdtStructure.id,
  })

  await seedStaffAccount({
    email: "employee@demo.com",
    role: Role.EMPLOYEE,
    employeeCode: "BS-EMP-DEMO",
    fullName: "Ayesha Rahman",
    designation: "Software Engineer",
    departmentName: "Engineering",
    reportingManagerId: manager.id,
    salaryStructureId: bdtStructure.id,
  })

  await seedAnnouncements(hrAdmin.id, manager.userId)

  console.log("Seed complete. All demo logins use the password: Demo@12345\n")
  console.log("Administrative roles sign in with an EMAIL:")
  console.log("  Super Admin:        admin@demo.com")
  console.log("  HR Admin:           hr@demo.com")
  console.log("  Finance Officer:    finance@demo.com\n")
  console.log("Staff roles sign in with an EMPLOYEE ID (email is not accepted):")
  console.log("  Reporting Manager:  BS-MNG-DEMO   Daniel Kim")
  console.log("  Employee:           BS-EMP-DEMO   Ayesha Rahman, reports to Daniel Kim\n")
  console.log("Additional staff accounts are created via POST /api/employees/staff.\n")
  console.log("Payroll: both staff accounts are on 'Standard (BDT)' (basic 50,000).")
  console.log("  'Standard (USD)' (basic 2,000) exists to exercise the currency path.")
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
