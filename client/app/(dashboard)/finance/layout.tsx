import type { Metadata } from "next"
import { Public_Sans, Sora } from "next/font/google"

import { cn } from "@/lib/utils"
import { Header } from "@/components/dashboard/header"
import { Sidebar } from "@/components/dashboard/sidebar"
import { finance } from "@/components/finance/data"
import { navGroups } from "@/components/finance/nav-config"

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
})

const sora = Sora({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-heading",
})

export const metadata: Metadata = {
  title: "Finance Dashboard | PeopleCore",
}

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        publicSans.variable,
        sora.variable,
        "font-sans flex min-h-screen w-full bg-[#F4F6F9] text-[#1C2733]"
      )}
    >
      <Sidebar
        navGroups={navGroups}
        rootHref="/finance"
        userName={finance.name}
        userInitials={finance.initials}
        roleLabel={finance.roleLabel}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header userName={finance.name} userInitials={finance.initials} userEmail={finance.email} />
        <main className="mx-auto flex w-full max-w-[1220px] flex-1 flex-col px-7 pb-8">{children}</main>
      </div>
    </div>
  )
}
