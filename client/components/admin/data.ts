// Static presentation data for the Super Admin role, transcribed from the
// approved design (PeopleCore HR & Payroll — Employee Dashboard.dc.html,
// roles['Super Admin']). Shared subpages (Employees, Settlements, etc.) live
// in components/dashboard/shared-pages.ts.

import type { ChartBar, SubpageData, Stat, TableCell } from "@/components/dashboard/types"

export const admin = {
  name: "Noah Bennett",
  initials: "NB",
  email: "noah.b@peoplecore.io",
  roleLabel: "Super Admin",
}

export const dashboard = {
  kicker: "Organization overview",
  heading: "Good morning, Noah",
  sub: "2 system alerts need review",
  cta: "Run payroll",
}

export const stats: Stat[] = [
  {
    label: "Total employees",
    value: "1,248",
    sub: "+18 this month · 4 departments",
    tag: "Growing",
    tone: "green",
    bars: [60, 65, 70, 80, 92],
    hotBar: 4,
  },
  {
    label: "Monthly payroll",
    value: "$1.92M",
    sub: "July run · scheduled Aug 1",
    tag: "Scheduled",
    tone: "neutral",
    bars: [70, 72, 75, 80, 85],
    hotBar: 4,
  },
  {
    label: "Open positions",
    value: "23",
    sub: "9 in final interview stage",
    tag: "Hiring",
    tone: "yellow",
    bars: [40, 55, 50, 65, 58],
    hotBar: 4,
  },
  {
    label: "System alerts",
    value: "2",
    sub: "Tax table update · SSO cert expiry",
    tag: "Action",
    tone: "red",
    bars: [20, 10, 35, 15, 45],
    hotBar: 4,
  },
]

export const chart = {
  title: "Payroll cost, last 6 months",
  sub: "Gross monthly payroll, USD",
  bars: [
    { label: "Feb", display: "1.71", height: 89 },
    { label: "Mar", display: "1.74", height: 91 },
    { label: "Apr", display: "1.78", height: 93 },
    { label: "May", display: "1.81", height: 94 },
    { label: "Jun", display: "1.86", height: 97 },
    { label: "Jul", display: "1.92M", height: 100 },
  ] satisfies ChartBar[],
}

export const activityTable = {
  title: "Recent admin activity",
  cols: "1.4fr 1.6fr 0.9fr 0.7fr",
  headers: ["User", "Action", "Status", "When"],
  rows: [
    [{ text: "Priya Nair", sub: "HR Admin", weight: 600 }, { text: "Bulk-imported 14 new hires" }, { tag: "Completed", tone: "green" }, { text: "9:12 AM" }],
    [{ text: "Marcus Webb", sub: "Finance Officer", weight: 600 }, { text: "Initiated July payroll preview" }, { tag: "In progress", tone: "yellow" }, { text: "8:40 AM" }],
    [{ text: "System", sub: "Automated", weight: 600 }, { text: "Nightly compliance audit" }, { tag: "Passed", tone: "green" }, { text: "2:00 AM" }],
    [{ text: "Daniel Kim", sub: "Reporting Manager", weight: 600 }, { text: "Exported Q2 attendance report" }, { tag: "Completed", tone: "green" }, { text: "Yesterday" }],
    [{ text: "Priya Nair", sub: "HR Admin", weight: 600 }, { text: "Edited leave policy — carry-over cap" }, { tag: "Pending review", tone: "yellow" }, { text: "Yesterday" }],
  ] satisfies TableCell[][],
}

export const profile: SubpageData = {
  kicker: "Administration",
  title: "My Profile",
  sub: "Personal details, documents, and access",
  cta: "Edit profile",
  stats: [
    { label: "Employee ID", value: "ADM-0001", sub: "Administration · Super Admin" },
    { label: "Tenure", value: "5.2 yrs", sub: "Joined Jan 2021" },
    { label: "Manager", value: "Board of Directors", sub: "Executive oversight" },
  ],
  tableTitle: "Documents & records",
  cols: "1.6fr 1.1fr 0.9fr 0.9fr",
  headers: ["Document", "Category", "Updated", "Status"],
  rows: [
    [{ text: "Employment contract", sub: "PDF · signed", weight: 600 }, { text: "Contract" }, { text: "Jan 2021" }, { tag: "Current", tone: "green" }],
    [{ text: "Tax withholding form", sub: "W-4", weight: 600 }, { text: "Tax" }, { text: "Jan 2026" }, { tag: "Current", tone: "green" }],
    [{ text: "Direct deposit details", sub: "•••• 7742", weight: 600 }, { text: "Banking" }, { text: "Jan 2026" }, { tag: "Verified", tone: "green" }],
    [{ text: "Emergency contact", weight: 600 }, { text: "Personal" }, { text: "Jan 2021" }, { tag: "Review due", tone: "yellow" }],
    [{ text: "Benefits enrollment", sub: "Health + dental", weight: 600 }, { text: "Benefits" }, { text: "Nov 2025" }, { tag: "Enrolled", tone: "green" }],
  ],
}
