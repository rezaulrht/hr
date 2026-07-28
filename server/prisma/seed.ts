import "dotenv/config"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient, Role } from "../src/generated/prisma"
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
    { name: "Annual", isPaid: true, annualQuota: 18, carryForwardPct: 50 },
    { name: "Sick", isPaid: true, annualQuota: 10, carryForwardPct: 0 },
    { name: "Personal", isPaid: true, annualQuota: 5, carryForwardPct: 0 },
  ] as const

  for (const leaveType of leaveTypes) {
    await prisma.leaveType.upsert({
      where: { name: leaveType.name },
      update: {},
      create: { ...leaveType, eligibleFor: ["FULL_TIME", "PART_TIME", "CONTRACT"] },
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
