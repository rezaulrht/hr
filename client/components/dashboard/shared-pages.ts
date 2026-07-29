// Subpages whose content is identical across every role in the design's
// flat `pages` dict (Attendance/Leave/Payroll/Expenses/Announcements never
// varied by roleKey there). Kept here once instead of duplicated per role.

import type { SubpageData } from "@/components/dashboard/types"

export const attendance: SubpageData = {
  kicker: "Workspace",
  title: "Attendance",
  sub: "Daily check-ins, hours, and exceptions",
  cta: "Log correction",
  stats: [
    { label: "This month", value: "96.4%", sub: "21 of 22 working days" },
    { label: "Late check-ins", value: "2", sub: "Both under 15 minutes" },
    { label: "Avg hours / day", value: "8h 12m", sub: "Shift 9:00 AM – 6:00 PM" },
  ],
  tableTitle: "Attendance log — July",
  cols: "1.2fr 1fr 1fr 0.8fr 0.9fr",
  headers: ["Date", "Check in", "Check out", "Hours", "Status"],
  rows: [
    [{ text: "Fri, Jul 25", weight: 600 }, { text: "8:58 AM" }, { text: "6:04 PM" }, { text: "9h 06m" }, { tag: "Present", tone: "green" }],
    [{ text: "Thu, Jul 24", weight: 600 }, { text: "9:14 AM" }, { text: "6:22 PM" }, { text: "9h 08m" }, { tag: "Late", tone: "yellow" }],
    [{ text: "Wed, Jul 23", weight: 600 }, { text: "8:55 AM" }, { text: "5:58 PM" }, { text: "9h 03m" }, { tag: "Present", tone: "green" }],
    [{ text: "Tue, Jul 22", weight: 600 }, { text: "—" }, { text: "—" }, { text: "—" }, { tag: "Sick leave", tone: "red" }],
    [{ text: "Mon, Jul 21", weight: 600 }, { text: "9:01 AM" }, { text: "6:10 PM" }, { text: "9h 09m" }, { tag: "Present", tone: "green" }],
    [{ text: "Fri, Jul 18", weight: 600 }, { text: "8:47 AM" }, { text: "5:50 PM" }, { text: "9h 03m" }, { tag: "Present", tone: "green" }],
  ],
}

export const payroll: SubpageData = {
  kicker: "Workspace",
  title: "Payroll",
  sub: "Payslips, earnings, and deductions",
  cta: "Download payslip",
  stats: [
    { label: "Latest net pay", value: "$4,820.00", sub: "June 2026 · paid Jul 1" },
    { label: "YTD gross", value: "$38,400", sub: "Jan – Jun 2026" },
    { label: "Next pay date", value: "Aug 1", sub: "July run in preview" },
  ],
  tableTitle: "Payslip history",
  cols: "1.1fr 1fr 1fr 1fr 0.9fr",
  headers: ["Month", "Gross", "Deductions", "Net pay", "Status"],
  rows: [
    [{ text: "June 2026", weight: 600 }, { text: "$6,400.00" }, { text: "−$1,580.00" }, { text: "$4,820.00", weight: 600 }, { tag: "Paid", tone: "green" }],
    [{ text: "May 2026", weight: 600 }, { text: "$6,400.00" }, { text: "−$1,580.00" }, { text: "$4,820.00", weight: 600 }, { tag: "Paid", tone: "green" }],
    [{ text: "April 2026", weight: 600 }, { text: "$6,400.00" }, { text: "−$1,592.00" }, { text: "$4,808.00", weight: 600 }, { tag: "Paid", tone: "green" }],
    [{ text: "March 2026", weight: 600 }, { text: "$6,650.00", sub: "Incl. Q1 bonus" }, { text: "−$1,640.00" }, { text: "$5,010.00", weight: 600 }, { tag: "Paid", tone: "green" }],
    [{ text: "February 2026", weight: 600 }, { text: "$6,400.00" }, { text: "−$1,580.00" }, { text: "$4,820.00", weight: 600 }, { tag: "Paid", tone: "green" }],
  ],
}

export const expenses: SubpageData = {
  kicker: "Workspace",
  title: "Expenses",
  sub: "Claims, reimbursements, and receipts",
  cta: "New claim",
  stats: [
    { label: "Pending", value: "$312.40", sub: "2 claims awaiting approval" },
    { label: "Reimbursed YTD", value: "$1,842", sub: "11 approved claims" },
    { label: "Rejected", value: "1", sub: "Duplicate mileage claim" },
  ],
  tableTitle: "My claims",
  cols: "1.5fr 0.9fr 0.8fr 0.9fr",
  headers: ["Claim", "Date", "Amount", "Status"],
  rows: [
    [{ text: "Client dinner", sub: "Receipt attached", weight: 600 }, { text: "Jul 24" }, { text: "$148.90", weight: 600 }, { tag: "Pending", tone: "yellow" }],
    [{ text: "Taxi — airport transfer", sub: "Receipt attached", weight: 600 }, { text: "Jul 19" }, { text: "$163.50", weight: 600 }, { tag: "Pending", tone: "yellow" }],
    [{ text: "Conference ticket", sub: "Pre-approved", weight: 600 }, { text: "Jun 30" }, { text: "$420.00", weight: 600 }, { tag: "Approved", tone: "green" }],
    [{ text: "Team lunch", weight: 600 }, { text: "Jun 12" }, { text: "$96.20", weight: 600 }, { tag: "Approved", tone: "green" }],
    [{ text: "Mileage — client visit", sub: "Flagged by audit", weight: 600 }, { text: "May 28" }, { text: "$62.40", weight: 600 }, { tag: "Rejected", tone: "red" }],
  ],
}

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

export const settlements: SubpageData = {
  kicker: "Payroll & finance",
  title: "Settlements",
  sub: "Full & final settlements on resignation",
  cta: "New settlement",
  stats: [
    { label: "In progress", value: "3", sub: "1 awaiting approval" },
    { label: "Paid out YTD", value: "$84,200", sub: "9 completed settlements" },
    { label: "Avg processing", value: "6 days", sub: "From resignation to payout" },
  ],
  tableTitle: "Settlement statements",
  cols: "1.4fr 1.3fr 1fr 0.9fr",
  headers: ["Employee", "Components", "Final amount", "Status"],
  rows: [
    [{ text: "Robert Ellis", sub: "Ops · resigned Jun 30", weight: 600 }, { text: "Pending salary + leave encashment", sub: "−$120 outstanding deductions" }, { text: "$6,840.00", weight: 600 }, { tag: "Approved", tone: "green" }],
    [{ text: "Hana Yusuf", sub: "Sales · resigned Jul 15", weight: 600 }, { text: "Pending salary", sub: "No encashment" }, { text: "$3,120.00", weight: 600 }, { tag: "Pending", tone: "yellow" }],
    [{ text: "Victor Osei", sub: "Engineering · contract end", weight: 600 }, { text: "Pending salary + leave encashment" }, { text: "$5,410.00", weight: 600 }, { tag: "Draft", tone: "yellow" }],
    [{ text: "Lena Fischer", sub: "CX · resigned May 31", weight: 600 }, { text: "Pending salary" }, { text: "$2,980.00", weight: 600 }, { tag: "Paid", tone: "green" }],
  ],
}

export const users: SubpageData = {
  kicker: "Administration",
  title: "Users",
  sub: "System accounts, roles, and activation",
  cta: "Create user",
  stats: [
    { label: "Total users", value: "1,254", sub: "1,238 active · 16 deactivated" },
    { label: "By role", value: "5 roles", sub: "2 super admins · 3 HR · 2 finance" },
    { label: "Pending invites", value: "6", sub: "Sent with July onboarding" },
  ],
  tableTitle: "User accounts",
  cols: "1.5fr 1.1fr 0.9fr 0.9fr",
  headers: ["User", "Role", "Last login", "Status"],
  rows: [
    [{ text: "Priya Nair", sub: "priya.n@peoplecore.io", weight: 600 }, { text: "HR Admin" }, { text: "9:12 AM" }, { tag: "Active", tone: "green" }],
    [{ text: "Marcus Webb", sub: "marcus.w@peoplecore.io", weight: 600 }, { text: "Finance Officer" }, { text: "8:40 AM" }, { tag: "Active", tone: "green" }],
    [{ text: "Daniel Kim", sub: "daniel.k@peoplecore.io", weight: 600 }, { text: "Reporting Manager" }, { text: "Yesterday" }, { tag: "Active", tone: "green" }],
    [{ text: "Yuki Tanaka", sub: "yuki.t@peoplecore.io", weight: 600 }, { text: "Employee" }, { text: "Never" }, { tag: "Invited", tone: "yellow" }],
    [{ text: "Robert Ellis", sub: "Left company Jun 30", weight: 600 }, { text: "Employee" }, { text: "Jun 28" }, { tag: "Deactivated", tone: "red" }],
  ],
}

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

export const announcements: SubpageData = {
  kicker: "Communication",
  title: "Announcements",
  sub: "Top-down company and team communication",
  cta: "New announcement",
  stats: [
    { label: "This month", value: "4", sub: "3 company-wide · 1 team" },
    { label: "Read rate", value: "87%", sub: "Last 30 days" },
    { label: "Scheduled", value: "1", sub: "Aug 1 · payday notice" },
  ],
  tableTitle: "Recent announcements",
  cols: "1.7fr 1fr 1fr 0.8fr",
  headers: ["Title", "Audience", "Published by", "Date"],
  rows: [
    [{ text: "Office closed Aug 3", sub: "Public holiday", weight: 600 }, { text: "All employees" }, { text: "Priya Nair", sub: "HR Admin" }, { text: "Yesterday" }],
    [{ text: "July payroll timeline", sub: "Payslips land Aug 1", weight: 600 }, { text: "All employees" }, { text: "Marcus Webb", sub: "Finance" }, { text: "Jul 22" }],
    [{ text: "Sprint 32 demo day", sub: "Friday 3 PM", weight: 600 }, { text: "Product team" }, { text: "Daniel Kim", sub: "Manager" }, { text: "Jul 21" }],
    [{ text: "New expense policy thresholds", weight: 600 }, { text: "All employees" }, { text: "Noah Bennett", sub: "Super Admin" }, { text: "Jul 10" }],
  ],
}
