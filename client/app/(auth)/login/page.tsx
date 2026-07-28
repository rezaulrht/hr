import type { Metadata } from "next"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { AdminLoginForm } from "./admin-login-form"
import { StaffLoginForm } from "./staff-login-form"

export const metadata: Metadata = {
  title: "Sign in | PeopleCore",
}

const perks = [
  "Payslips & attendance in one place",
  "Approvals cleared in one click",
  "Payroll closed in days, not weeks",
]

export default function LoginPage() {
  return (
    <div className="flex min-h-screen w-full">
      <aside className="flex w-[44%] min-w-95 flex-col p-10 text-white" style={{ background: "#0E1012" }}>
        <div className="flex items-center gap-2.5">
          <div className="grid size-7.5 place-items-center rounded bg-white text-[15px] font-extrabold text-[#17191C]">
            <span className="font-heading">P</span>
          </div>
          <span className="font-heading text-[15px] font-bold">PeopleCore</span>
        </div>

        <div className="my-auto max-w-100">
          <div className="font-heading text-[32px] font-bold tracking-tighter text-balance">
            One login. Your whole working month.
          </div>
          <p className="mt-4.5 text-[14.5px] leading-[1.7] text-white/60">
            Check in, request leave, read payslips, approve claims — whatever your role, it&rsquo;s behind this door.
          </p>
          <div className="mt-7.5 flex flex-col gap-3">
            {perks.map((perk) => (
              <div key={perk} className="flex items-center gap-2.5 text-[13.5px] font-semibold">
                <span className="grid size-4 shrink-0 place-items-center rounded bg-white text-[10px] text-[#17191C]">
                  ✓
                </span>
                {perk}
              </div>
            ))}
          </div>
        </div>

        <div className="text-xs text-white/40">SOC 2 Type II · SSO · Two-factor enforced</div>
      </aside>

      <main className="flex flex-1 items-center justify-center px-7 py-10">
        <div className="w-full max-w-100">
          <h1 className="font-heading text-[26px] font-bold tracking-tight">Welcome back</h1>
          <p className="mt-2 mb-6.5 text-[13.5px] text-[#55657A]">Sign in to your PeopleCore workspace.</p>

          <Tabs defaultValue="staff" className="mb-6">
            <TabsList className="mb-6 w-full">
              <TabsTrigger value="staff" className="flex-1">
                Staff Login
              </TabsTrigger>
              <TabsTrigger value="admin" className="flex-1">
                Administrative Login
              </TabsTrigger>
            </TabsList>
            <TabsContent value="staff">
              <StaffLoginForm />
            </TabsContent>
            <TabsContent value="admin">
              <AdminLoginForm />
            </TabsContent>
          </Tabs>

          <p className="mt-5 text-center text-[11.5px] leading-[1.6] text-[#8B95A3]">
            No account? Access is provisioned by your HR admin —{" "}
            <a href="#" className="font-bold">
              contact them
            </a>{" "}
            to get set up.
          </p>
        </div>
      </main>
    </div>
  )
}
