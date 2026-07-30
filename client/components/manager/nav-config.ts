import type { NavGroup } from "@/components/dashboard/types"

export const navGroups: NavGroup[] = [
  {
    label: "My team",
    items: [
      { label: "Dashboard", href: "/manager", icon: "RiDashboardLine" },
      { label: "Team", href: "/manager/team", icon: "RiTeamLine" },
      { label: "Attendance", href: "/manager/attendance", icon: "RiTimeLine" },
      { label: "Leave", href: "/manager/leave", icon: "RiCalendarEventLine" },
    ],
  },
  {
    label: "Reporting",
    items: [
      { label: "Reports", href: "/manager/reports", icon: "RiBarChartLine", badge: 2 },
      { label: "Announcements", href: "/manager/announcements", icon: "RiMegaphoneLine" },
    ],
  },
  {
    // A Reporting Manager is a paid employee who may travel, so they hold a
    // payslip and expenses of their own. The matrix's ❌ for Manager on
    // Payroll means "cannot administer payroll", not "has no payslip".
    label: "Account",
    items: [
      { label: "My Profile", href: "/manager/profile", icon: "RiUser3Line" },
      { label: "Payroll", href: "/manager/payroll", icon: "RiWallet3Line" },
      { label: "Expenses", href: "/manager/expenses", icon: "RiReceiptLine" },
    ],
  },
]
