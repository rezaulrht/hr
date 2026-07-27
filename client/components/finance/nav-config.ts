import type { NavGroup } from "@/components/dashboard/types"

export const navGroups: NavGroup[] = [
  {
    label: "Finance",
    items: [
      { label: "Dashboard", href: "/finance", icon: "RiDashboardLine" },
      { label: "Payroll", href: "/finance/payroll", icon: "RiWallet3Line" },
      { label: "Expenses", href: "/finance/expenses", icon: "RiReceiptLine", badge: 31 },
      { label: "Settlements", href: "/finance/settlements", icon: "RiReceiptLine" },
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
