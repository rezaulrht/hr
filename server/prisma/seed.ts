import "dotenv/config"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient, Role, type EmploymentType } from "../src/generated/prisma/client"
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
 * Codes use a `D`-prefixed sequence (`BS-EMP-D0001`) that the IdCounter — which
 * only ever emits zero-padded digits — cannot collide with, so seeding stays
 * idempotent and never steals a code from a real hire.
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
    // Keep the reporting line current — that link is what the manager's team
    // board reads, and it is the one field likely to change between seeds.
    update: { reportingManagerId: input.reportingManagerId ?? null },
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

async function main() {
  await seedAdminUser("admin@demo.com", Role.SUPER_ADMIN)
  await seedAdminUser("hr@demo.com", Role.HR_ADMIN)
  await seedAdminUser("finance@demo.com", Role.FINANCE_OFFICER)

  const departments = ["Engineering", "People Operations", "Finance", "Operations"]
  for (const name of departments) {
    await prisma.department.upsert({ where: { name }, update: {}, create: { name } })
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
    employeeCode: "BS-MNG-D0001",
    fullName: "Daniel Kim",
    designation: "Engineering Manager",
    departmentName: "Engineering",
  })

  await seedStaffAccount({
    email: "employee@demo.com",
    role: Role.EMPLOYEE,
    employeeCode: "BS-EMP-D0001",
    fullName: "Ayesha Rahman",
    designation: "Software Engineer",
    departmentName: "Engineering",
    reportingManagerId: manager.id,
  })

  console.log("Seed complete. Demo logins (all password: Demo@12345):")
  console.log("  Super Admin:       admin@demo.com")
  console.log("  HR Admin:          hr@demo.com")
  console.log("  Finance Officer:   finance@demo.com")
  console.log("  Reporting Manager: manager@demo.com   (BS-MNG-D0001, Daniel Kim)")
  console.log("  Employee:          employee@demo.com  (BS-EMP-D0001, Ayesha Rahman, reports to Daniel Kim)")
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
