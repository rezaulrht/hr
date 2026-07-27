import cookieParser from "cookie-parser"
import cors from "cors"
import express from "express"
import helmet from "helmet"
import morgan from "morgan"

import { env } from "./config/env"
import { errorHandler } from "./middleware/errorHandler"

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

app.use(errorHandler)

export default app
