import "dotenv/config"
import { PrismaPg } from "@prisma/adapter-pg"
import {
  PrismaClient,
  Role,
  type EmploymentType,
  type HolidayType,
} from "../src/generated/prisma/client"
import { hashPassword } from "../src/modules/auth/auth.utils"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const SEED_PASSWORD = "Demo@12345"

async function seedAdminUser(email: string, role: Role) {
  const passwordHash = await hashPassword(SEED_PASSWORD)
  await prisma.user.upsert({
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
    },
    create: {
      userId: user.id,
      employeeCode: input.employeeCode,
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

async function main() {
  await seedAdminUser("admin@demo.com", Role.SUPER_ADMIN)
  await seedAdminUser("hr@demo.com", Role.HR_ADMIN)
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

  const leaveTypes = [
    { name: "Annual", isPaid: true, annualQuota: 18, carryForwardPct: 50, allowsBackdating: false },
    { name: "Sick", isPaid: true, annualQuota: 10, carryForwardPct: 0, allowsBackdating: true },
    { name: "Personal", isPaid: true, annualQuota: 5, carryForwardPct: 0, allowsBackdating: false },
    // Zero-quota unpaid type: the fallback when an annual allowance is spent.
    { name: "Leave Without Pay", isPaid: false, annualQuota: 0, carryForwardPct: 0, allowsBackdating: false },
  ] as const

  for (const leaveType of leaveTypes) {
    const eligibleFor: EmploymentType[] =
      leaveType.name === "Leave Without Pay"
        ? ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"]
        : ["FULL_TIME", "PART_TIME", "CONTRACT"]

    await prisma.leaveType.upsert({
      where: { name: leaveType.name },
      // Not `{}` — an empty update makes re-seeding silently skip rows that
      // already exist, so new fields would never reach them.
      update: {
        isPaid: leaveType.isPaid,
        annualQuota: leaveType.annualQuota,
        carryForwardPct: leaveType.carryForwardPct,
        allowsBackdating: leaveType.allowsBackdating,
      },
      create: { ...leaveType, eligibleFor },
    })
  }

  // The manager must exist first — the employee's reporting line points at it.
  const manager = await seedStaffAccount({
    email: "manager@demo.com",
    role: Role.REPORTING_MANAGER,
    employeeCode: "BS-MNG-DEMO",
    fullName: "Daniel Kim",
    designation: "Engineering Manager",
    departmentName: "Engineering",
  })

  await seedStaffAccount({
    email: "employee@demo.com",
    role: Role.EMPLOYEE,
    employeeCode: "BS-EMP-DEMO",
    fullName: "Ayesha Rahman",
    designation: "Software Engineer",
    departmentName: "Engineering",
    reportingManagerId: manager.id,
  })

  console.log("Seed complete. All demo logins use the password: Demo@12345\n")
  console.log("Administrative roles sign in with an EMAIL:")
  console.log("  Super Admin:        admin@demo.com")
  console.log("  HR Admin:           hr@demo.com")
  console.log("  Finance Officer:    finance@demo.com\n")
  console.log("Staff roles sign in with an EMPLOYEE ID (email is not accepted):")
  console.log("  Reporting Manager:  BS-MNG-DEMO   Daniel Kim")
  console.log("  Employee:           BS-EMP-DEMO   Ayesha Rahman, reports to Daniel Kim\n")
  console.log("Additional staff accounts are created via POST /api/employees/staff.")
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
