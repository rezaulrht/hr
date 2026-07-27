import type { Metadata } from "next"
import Link from "next/link"

import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"

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

          <div className="mb-4">
            <Label htmlFor="email" className="mb-1.5 text-xs font-bold">
              Work email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              className="h-auto w-full rounded border-[#D8DCE1] bg-white px-3.5 py-2.75 text-[13.5px] focus-visible:border-[#17191C] focus-visible:ring-0"
            />
          </div>
          <div className="mb-4">
            <div className="mb-1.5 flex items-baseline justify-between">
              <Label htmlFor="password" className="text-xs font-bold">
                Password
              </Label>
              <a href="#" className="text-xs font-semibold text-[#55657A]">
                Forgot password?
              </a>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              className="h-auto w-full rounded border-[#D8DCE1] bg-white px-3.5 py-2.75 text-[13.5px] focus-visible:border-[#17191C] focus-visible:ring-0"
            />
          </div>

          <Label htmlFor="keep-signed-in" className="mb-5.5 cursor-pointer text-[13px] font-normal text-[#55657A]">
            <Checkbox
              id="keep-signed-in"
              className="rounded-[3px] border-[#D8DCE1] data-checked:border-[#17191C] data-checked:bg-[#17191C]"
            />
            Keep me signed in on this device
          </Label>

          <Link
            href="/employee"
            className="block rounded bg-[#17191C] py-3.5 text-center text-sm font-bold text-white hover:bg-[#33373D]"
          >
            Sign in
          </Link>

          <div className="my-5.5 flex items-center gap-3">
            <Separator className="flex-1 bg-[#E7E9EC]" />
            <span className="text-[11.5px] font-bold text-[#A8B0BA]">OR</span>
            <Separator className="flex-1 bg-[#E7E9EC]" />
          </div>

          <Link
            href="/employee"
            className="block rounded border border-[#D8DCE1] bg-white py-3 text-center text-[13.5px] font-bold text-[#17191C] hover:bg-[#F0F1F3]"
          >
            Continue with company SSO
          </Link>

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
