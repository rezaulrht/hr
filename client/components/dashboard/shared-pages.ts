// Subpages whose content is identical across every role in the design's
// flat `pages` dict (Attendance/Leave/Payroll/Expenses/Announcements never
// varied by roleKey there). Kept here once instead of duplicated per role.

import type { SubpageData } from "@/components/dashboard/types"

export const employees: SubpageData = {
  kicker: "Management",
  title: "Employees",
  sub: "Directory of all active employees",
  cta: "Add employee",
  stats: [
    { label: "Headcount", value: "1,248", sub: "1,190 active · 58 on leave" },
    { label: "New this month", value: "18", sub: "14 imported today" },
    { label: "Departments", value: "4", sub: "Eng, Sales, Ops, G&A" },
  ],
  tableTitle: "Directory",
  cols: "1.5fr 1fr 0.9fr 0.9fr",
  headers: ["Employee", "Department", "Joined", "Status"],
  rows: [
    [{ text: "Aisha Rahman", sub: "aisha.r@peoplecore.io", weight: 600 }, { text: "Product" }, { text: "Mar 2023" }, { tag: "Active", tone: "green" }],
    [{ text: "Tomás Silva", sub: "tomas.s@peoplecore.io", weight: 600 }, { text: "Engineering" }, { text: "Aug 2021" }, { tag: "Active", tone: "green" }],
    [{ text: "Grace Osei", sub: "grace.o@peoplecore.io", weight: 600 }, { text: "Sales" }, { text: "Jan 2024" }, { tag: "Active", tone: "green" }],
    [{ text: "Yuki Tanaka", sub: "yuki.t@peoplecore.io", weight: 600 }, { text: "Engineering" }, { text: "Jul 2026" }, { tag: "Onboarding", tone: "yellow" }],
    [{ text: "Mei Chen", sub: "mei.c@peoplecore.io", weight: 600 }, { text: "CX" }, { text: "Nov 2022" }, { tag: "On leave", tone: "yellow" }],
  ],
}

// `users` used to live here. It is now a real page reading the User table —
// components/admin/users-page.tsx.

export const reports: SubpageData = {
  kicker: "Management",
  title: "Reports",
  sub: "Scheduled and on-demand reporting",
  cta: "New report",
  stats: [
    { label: "Scheduled", value: "4", sub: "Weekly + monthly cadences" },
    { label: "Generated this month", value: "12", sub: "3 shared externally" },
    { label: "Data freshness", value: "Live", sub: "Synced 4 min ago" },
  ],
  tableTitle: "Recent reports",
  cols: "1.6fr 1.1fr 0.9fr 0.9fr",
  headers: ["Report", "Owner", "Last run", "Status"],
  rows: [
    [{ text: "Q2 attendance summary", sub: "PDF · 14 pages", weight: 600 }, { text: "Daniel Kim" }, { text: "Yesterday" }, { tag: "Ready", tone: "green" }],
    [{ text: "July payroll preview", sub: "XLSX", weight: 600 }, { text: "Marcus Webb" }, { text: "8:40 AM" }, { tag: "Generating", tone: "yellow" }],
    [{ text: "Attrition by department", sub: "Dashboard", weight: 600 }, { text: "Priya Nair" }, { text: "Jul 21" }, { tag: "Ready", tone: "green" }],
    [{ text: "Expense policy exceptions", sub: "CSV", weight: 600 }, { text: "Marcus Webb" }, { text: "Jul 18" }, { tag: "Ready", tone: "green" }],
    [{ text: "Headcount forecast FY27", sub: "Draft", weight: 600 }, { text: "Noah Bennett" }, { text: "Jul 12" }, { tag: "Draft", tone: "yellow" }],
  ],
}

// `settings` used to be a SubpageData mock here. The Settings screens are real
// now — see components/settings/settings-page.tsx. The mock described payroll
// schedules, SSO, two-factor authentication and a nightly ERP sync, none of
// which exist anywhere in this system.
