import { officeTimeOf } from "../attendance/attendance.time"

/**
 * "Good morning" against **office** time.
 *
 * Not the server's clock and not the browser's: a server in UTC greets Dhaka
 * with "Good evening" at 9am, and a browser clock is whatever the user's
 * laptop says. `officeTimeOf` is the same helper attendance uses to decide
 * which business day a punch belongs to.
 */
export function timeOfDayGreeting(now: Date = new Date()): string {
  const hour = Number(officeTimeOf(now).slice(0, 2))
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}
