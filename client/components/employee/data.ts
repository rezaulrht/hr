// Static presentation data for the Employee role, transcribed from the
// approved design (PeopleCore HR & Payroll — Employee Dashboard).

import type { ActivityItem, Stat, SubpageData } from "@/components/dashboard/types"

export const employee = {
  name: "Aisha Rahman",
  initials: "AR",
  email: "aisha.r@peoplecore.io",
  employeeId: "EMP-0412",
  department: "Product",
  title: "Senior PM",
  manager: "Daniel Kim",
  tenure: "3.4 yrs",
  joined: "Mar 2023",
}

export const dashboard = {
  kicker: "Employee portal",
  heading: "Good morning, Aisha",
  sub: "Payroll cycle closes in 4 days",
  cta: "Request leave",
}

export const stats: Stat[] = [
  {
    label: "Leave balance",
    value: "14 days",
    sub: "9 annual · 5 sick remaining",
    tag: "Accruing",
    tone: "green",
    bars: [40, 55, 45, 70, 60],
    hotBar: 3,
  },
  {
    label: "Attendance",
    value: "96.4%",
    sub: "21 of 22 working days in July",
    tag: "On track",
    tone: "green",
    bars: [80, 90, 85, 95, 96],
    hotBar: 4,
  },
  {
    label: "Latest payslip",
    value: "$4,820.00",
    sub: "June 2026 · paid Jul 1",
    tag: "Paid",
    tone: "neutral",
    bars: [70, 70, 75, 75, 80],
    hotBar: 4,
  },
  {
    label: "Expense claims",
    value: "2 pending",
    sub: "$312.40 awaiting approval",
    tag: "Pending",
    tone: "yellow",
    bars: [30, 60, 20, 45, 35],
    hotBar: 4,
  },
]

export const timeClock = {
  checkedIn: false,
  displayTime: "9:02:00 AM",
  shift: "Shift 9:00 AM – 6:00 PM",
  hoursToday: "0h 00m",
}

export const activity: ActivityItem[] = [
  {
    initial: "L",
    tone: "green",
    title: "Annual leave approved",
    meta: "Aug 10 – Aug 14 · approved by Daniel Kim",
    status: "Approved",
    statusTone: "green",
    time: "2h ago",
  },
  {
    initial: "E",
    tone: "yellow",
    title: "Expense claim submitted",
    meta: "Client dinner · $148.90",
    status: "Pending",
    statusTone: "yellow",
    time: "5h ago",
  },
  {
    initial: "A",
    tone: "neutral",
    title: "Announcement: Office closed Aug 3",
    meta: "HR Admin · company-wide",
    time: "Yesterday",
  },
  {
    initial: "L",
    tone: "red",
    title: "Sick leave request rejected",
    meta: "Jul 30 · overlapping team leave — see note",
    status: "Rejected",
    statusTone: "red",
    time: "Jul 22",
  },
  {
    initial: "P",
    tone: "neutral",
    title: "June payslip available",
    meta: "Net pay $4,820.00 · view in Payroll",
    time: "Jul 1",
  },
]

export const profile: SubpageData = {
  kicker: "Administration",
  title: "My Profile",
  sub: "Personal details, documents, and access",
  cta: "Edit profile",
  stats: [
    { label: "Employee ID", value: "EMP-0412", sub: "Product · Senior PM" },
    { label: "Tenure", value: "3.4 yrs", sub: "Joined Mar 2023" },
    { label: "Manager", value: "Daniel Kim", sub: "Reporting Manager" },
  ],
  tableTitle: "Documents & records",
  cols: "1.6fr 1.1fr 0.9fr 0.9fr",
  headers: ["Document", "Category", "Updated", "Status"],
  rows: [
    [{ text: "Employment contract", sub: "PDF · signed", weight: 600 }, { text: "Contract" }, { text: "Mar 2023" }, { tag: "Current", tone: "green" }],
    [{ text: "Tax withholding form", sub: "W-4", weight: 600 }, { text: "Tax" }, { text: "Jan 2026" }, { tag: "Current", tone: "green" }],
    [{ text: "Direct deposit details", sub: "•••• 4821", weight: 600 }, { text: "Banking" }, { text: "Jan 2026" }, { tag: "Verified", tone: "green" }],
    [{ text: "Emergency contact", weight: 600 }, { text: "Personal" }, { text: "Mar 2023" }, { tag: "Review due", tone: "yellow" }],
    [{ text: "Benefits enrollment", sub: "Health + dental", weight: 600 }, { text: "Benefits" }, { text: "Nov 2025" }, { tag: "Enrolled", tone: "green" }],
  ],
}
