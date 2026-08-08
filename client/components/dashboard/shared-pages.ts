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

export const settings: SubpageData = {
  kicker: "Administration",
  title: "Settings",
  sub: "Workspace configuration and access",
  cta: "Invite admin",
  stats: [
    { label: "Integrations", value: "6", sub: "All connected" },
    { label: "Admin users", value: "4", sub: "2 super admins" },
    { label: "SSO", value: "Enabled", sub: "SAML · cert expires Aug 9" },
  ],
  tableTitle: "Configuration",
  cols: "1.4fr 1.4fr 0.9fr",
  headers: ["Setting", "Value", "Status"],
  rows: [
    [{ text: "Payroll schedule", sub: "Company-wide", weight: 600 }, { text: "Monthly · 1st of month" }, { tag: "Active", tone: "green" }],
    [{ text: "Leave carry-over cap", sub: "Policy · edited yesterday", weight: 600 }, { text: "10 days / year" }, { tag: "Pending review", tone: "yellow" }],
    [{ text: "Expense auto-approval", sub: "Under threshold", weight: 600 }, { text: "Claims below $50" }, { tag: "Active", tone: "green" }],
    [{ text: "Two-factor authentication", sub: "All users", weight: 600 }, { text: "Required" }, { tag: "Enforced", tone: "green" }],
    [{ text: "Accounting sync", sub: "ERP integration", weight: 600 }, { text: "Nightly at 1:00 AM" }, { tag: "Connected", tone: "green" }],
  ],
}
