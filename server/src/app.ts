import cookieParser from "cookie-parser"
import cors from "cors"
import express from "express"
import helmet from "helmet"
import morgan from "morgan"

import { env } from "./config/env"
import { errorHandler } from "./middleware/errorHandler"
import announcementRoutes from "./modules/announcement/announcement.routes"
import attendanceRoutes from "./modules/attendance/attendance.routes"
import authRoutes from "./modules/auth/auth.routes"
import userRoutes from "./modules/auth/user.routes"
import departmentRoutes from "./modules/department/department.routes"
import eventRoutes from "./modules/event/event.routes"
import expenseRoutes from "./modules/expense/expense.routes"
import employeeRoutes from "./modules/employee/employee.routes"
import leaveRoutes from "./modules/leave/leave.routes"
import settlementRoutes from "./modules/settlement/settlement.routes"
import payrollRoutes from "./modules/payroll/payroll.routes"

const app = express()

app.use(helmet())
app.use(
  cors({
    origin: env.CLIENT_ORIGIN,
    credentials: true,
  })
)
app.use(cookieParser())
app.use(express.json())
app.use(morgan("dev"))

app.get("/health", (_req, res) => {
  res.json({ status: "ok" })
})

app.use("/api/auth", authRoutes)
app.use("/api/users", userRoutes)
app.use("/api/employees", employeeRoutes)
app.use("/api/departments", departmentRoutes)
app.use("/api/leave", leaveRoutes)
app.use("/api/attendance", attendanceRoutes)
app.use("/api/payroll", payrollRoutes)
app.use("/api/expenses", expenseRoutes)
app.use("/api/settlements", settlementRoutes)
app.use("/api/announcements", announcementRoutes)
app.use("/api/events", eventRoutes)

app.use(errorHandler)

export default app
