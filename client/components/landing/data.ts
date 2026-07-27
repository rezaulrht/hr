// Static presentation data for the marketing Landing Page, transcribed from
// the approved design (PeopleCore HR & Payroll — Landing Page). This page is
// intentionally not wired to any route yet — the component is kept in the
// codebase for when it's ready to ship.

export type HeroAction = { dot: string; text: string; hint: string }
export type HeroRole = { label: string; stat: string; statLabel: string; actions: HeroAction[] }

const green = "#7BC894"
const yellow = "#E5C170"
const grey = "rgba(255,255,255,0.45)"

export const heroRoles: HeroRole[] = [
  {
    label: "Employee",
    stat: "$4,820.00",
    statLabel: "June net pay · landed Jul 1",
    actions: [
      { dot: green, text: "Checked in at 9:02 AM", hint: "today" },
      { dot: yellow, text: "Annual leave Aug 10–14", hint: "pending" },
      { dot: grey, text: "Expense claim $148.90 filed", hint: "5h ago" },
    ],
  },
  {
    label: "Manager",
    stat: "5",
    statLabel: "Approvals waiting on you",
    actions: [
      { dot: yellow, text: "Aisha's leave — conflicts checked", hint: "review" },
      { dot: green, text: "Team attendance at 94.8%", hint: "on track" },
      { dot: grey, text: "3 people out next week", hint: "planned" },
    ],
  },
  {
    label: "HR",
    stat: "14",
    statLabel: "New hires onboarding this month",
    actions: [
      { dot: yellow, text: "8 leave requests in queue", hint: "oldest 3d" },
      { dot: green, text: "Attrition down to 2.1%", hint: "Q3" },
      { dot: grey, text: "Leave policy edit awaiting review", hint: "policy" },
    ],
  },
  {
    label: "Finance",
    stat: "$1.92M",
    statLabel: "July payroll · in preview",
    actions: [
      { dot: green, text: "Deductions reconciled automatically", hint: "done" },
      { dot: yellow, text: "31 reimbursements ride this run", hint: "queued" },
      { dot: grey, text: "Q3 tax tables already applied", hint: "auto" },
    ],
  },
  {
    label: "Admin",
    stat: "1,248",
    statLabel: "Employees across 4 departments",
    actions: [
      { dot: green, text: "Nightly compliance audit passed", hint: "2:00 AM" },
      { dot: yellow, text: "SSO certificate renews Aug 9", hint: "action" },
      { dot: grey, text: "Payroll cost +3.2% vs June", hint: "trend" },
    ],
  },
]

export type Feature = { title: string; kicker: string; body: string; points: string[] }

export const features: Feature[] = [
  {
    title: "Time & attendance",
    kicker: "Workspace",
    body: "One-tap check-in with shift tracking and late flags. Hours roll straight into the payroll run — no timesheet exports, no reconciliation meetings.",
    points: ["Live time clock with shift rules", "Late & absence exception flags", "Monthly rollups feed payroll"],
  },
  {
    title: "Leave management",
    kicker: "Workspace",
    body: "Balances and accruals stay current on their own. Requests carry team-calendar conflict warnings so approvers never double-book a team.",
    points: ["Auto-accruing balances", "Conflict warnings before approval", "Carry-over policy enforcement"],
  },
  {
    title: "Payroll runs",
    kicker: "Finance",
    body: "Preview the full run before a dollar moves. Deductions, tax tables, and bonuses apply automatically, with an audit trail on every line.",
    points: ["Full-run preview & diff", "Automatic deductions and tax", "Line-level audit trail"],
  },
  {
    title: "Expense claims",
    kicker: "Workspace",
    body: "Receipt capture with policy checks at submission. Claims under threshold auto-approve; the rest queue for one-click manager sign-off.",
    points: ["Policy checks on submit", "Threshold auto-approval", "Reimbursed in the next run"],
  },
  {
    title: "Reports",
    kicker: "Insights",
    body: "Attendance, attrition, and payroll-cost reports on a schedule, exportable to PDF, CSV, and your ERP — always from live data.",
    points: ["Scheduled weekly & monthly", "PDF, CSV, ERP export", "Live-synced, never stale"],
  },
  {
    title: "Compliance",
    kicker: "Administration",
    body: "Nightly automated audits, document-expiry alerts, and enforced two-factor with SSO. Problems surface before your auditor finds them.",
    points: ["Nightly automated audits", "Document-expiry alerts", "SSO + enforced 2FA"],
  },
]

export type Quote = { text: string; who: string; org: string }

export const quotes: Quote[] = [
  {
    text: "We closed July payroll in two days. Before PeopleCore it took our finance team the better part of two weeks.",
    who: "Head of Finance",
    org: "1,200-person logistics company",
  },
  {
    text: "Managers actually approve leave now, because it takes one click and the calendar conflicts are already checked.",
    who: "HR Director",
    org: "480-person software company",
  },
  {
    text: "Five roles, one system. Our employees stopped emailing HR for payslips on day one.",
    who: "COO",
    org: "310-person retail group",
  },
]

export const bandStats = [
  { value: "$12.6M", label: "Disbursed through PeopleCore this year" },
  { value: "2 days", label: "Median payroll close, down from 11" },
  { value: "99.98%", label: "Payslip accuracy across audited runs" },
  { value: "SOC 2", label: "Type II certified · SSO + 2FA enforced" },
]

export const navLinks = [
  { label: "Product", href: "#features" },
  { label: "Customers", href: "#voices" },
  { label: "Security", href: "#numbers" },
  { label: "Pricing", href: "#" },
]

export const footerLinks = [
  { label: "Product", href: "#features" },
  { label: "Customers", href: "#voices" },
  { label: "Security", href: "#numbers" },
  { label: "Privacy", href: "#" },
]
