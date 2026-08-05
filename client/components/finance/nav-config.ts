import type { NavGroup } from "@/components/dashboard/types"

export const navGroups: NavGroup[] = [
  {
    label: "Finance",
    items: [
      { label: "Dashboard", href: "/finance", icon: "RiDashboardLine" },
      { label: "Payroll", href: "/finance/payroll", icon: "RiWallet3Line" },
      // Finance authors the pay bands; HR assigns people to them. Sits above
      // Expenses because no run can process until one exists.
      { label: "Salary structures", href: "/finance/salary-structures", icon: "RiSettingsLine" },
      { label: "Expenses", href: "/finance/expenses", icon: "RiReceiptLine" },
      { label: "Settlements", href: "/finance/settlements", icon: "RiReceiptLine" },
      { label: "Operating costs", href: "/finance/costs", icon: "RiBillLine" },
      { label: "Assets", href: "/finance/assets", icon: "RiComputerLine" },
      // Finance is a publisher server-side, so without this entry the
      // permission would exist and be unreachable from the UI.
      { label: "Announcements", href: "/finance/announcements", icon: "RiMegaphoneLine" },
    ],
  },
  {
    label: "Reference (read)",
    items: [
      { label: "Employees", href: "/finance/employees", icon: "RiTeamLine" },
      { label: "Attendance", href: "/finance/attendance", icon: "RiTimeLine" },
      { label: "Leave", href: "/finance/leave", icon: "RiCalendarEventLine" },
      { label: "Reports", href: "/finance/reports", icon: "RiBarChartLine" },
    ],
  },
  {
    label: "Account",
    items: [{ label: "My Profile", href: "/finance/profile", icon: "RiUser3Line" }],
  },
]
