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

  console.log("Seed complete. Administrative logins (all password: Demo@12345):")
  console.log("  Super Admin:     admin@demo.com")
  console.log("  HR Admin:        hr@demo.com")
  console.log("  Finance Officer: finance@demo.com")
  console.log("Staff accounts are created via POST /api/employees/staff, not seeded.")
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
