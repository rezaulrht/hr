import "dotenv/config"
import { z } from "zod"

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(4000),
  CLIENT_ORIGIN: z.string().default("http://localhost:3000"),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRY: z.string().default("15m"),
  JWT_REFRESH_EXPIRY: z.string().default("7d"),
  // The office timezone. Every attendance business-date derivation goes
  // through this, never through the server's locale — a UTC host at 20:00Z
  // is already tomorrow in Dhaka, and a US-region host would file every
  // morning check-in under the previous day.
  APP_TIMEZONE: z.string().default("Asia/Dhaka"),
  // The date attendance became the record of truth. Required with no default
  // on purpose: without a floor, every working day before the system existed
  // derives as ABSENT for every employee who joined earlier, and the first
  // monthly summary payroll sees is wrong for the whole company. A fixed
  // default would be wrong for later deployments, and a computed one would
  // silently move on every restart — so the only safe value is a decision.
  ATTENDANCE_GO_LIVE: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "ATTENDANCE_GO_LIVE must be a YYYY-MM-DD date"),
  // Company identity for the payslip and settlement documents. A payslip
  // without an employer name on it is not a document. All three have
  // defaults, unlike ATTENDANCE_GO_LIVE — a wrong company address is
  // cosmetic; a wrong go-live date corrupts the entire dataset. Only the
  // second justifies refusing to boot.
  COMPANY_NAME: z.string().default("Byte Spate"),
  COMPANY_ADDRESS: z.string().default(""),
  // Local disk, a deliberate prototype choice with a known ceiling: it does
  // not survive a restart on an ephemeral filesystem and does not work across
  // replicas. Isolated to payroll.storage.ts so swapping in S3 is one file.
  PAYSLIP_STORAGE_DIR: z.string().default("./storage/payslips"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
})

export const env = envSchema.parse(process.env)
