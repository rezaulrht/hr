import { env } from "./config/env"
import app from "./app"
import { startJobs } from "./jobs"

app.listen(env.PORT, () => {
  console.log(`Server listening on port ${env.PORT}`)
})

// Only in the long-lived server process. A scheduler started during a test
// run or a one-off script leaks a timer handle and hangs the process.
if (process.env.NODE_ENV !== "test") {
  startJobs()
}
