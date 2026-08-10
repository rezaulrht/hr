import type { Metadata } from "next"

import { BrandLogo } from "@/components/brand/brand"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { AdminLoginForm } from "./admin-login-form"
import { StaffLoginForm } from "./staff-login-form"

export const metadata: Metadata = {
  title: "Sign in | byteSpate",
}

export default function LoginPage() {
  return (
    <div className="flex min-h-[100dvh] w-full flex-col md:flex-row">
      {/*
        Below md this collapses to a strip carrying the brand alone. The panel
        is not decoration: on a shared office machine it is the only thing that
        says which system is being signed into.
      */}
      <aside className="relative isolate flex w-full min-w-0 flex-col overflow-hidden bg-[#0E1012] px-6 py-5 text-white md:w-[42%] md:min-w-95 md:p-10">
        {/*
          The source logo is a glow on black. Echoing it here in the brand's own
          red and green keeps the panel from being a flat rectangle without
          reaching for a stock photograph, which on an internal sign-in screen
          would be decoration rather than information.
        */}
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-24 -z-10 size-[26rem] rounded-full opacity-45 blur-3xl"
          style={{ background: "radial-gradient(circle, #FE0101 0%, transparent 68%)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-28 left-1/3 -z-10 size-72 rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(circle, #028805 0%, transparent 70%)" }}
        />

        <BrandLogo tone="dark" width={186} className="self-start" />

        <div className="my-auto hidden max-w-105 md:block">
          <h2 className="font-heading text-[34px] leading-[1.12] font-bold tracking-tighter text-balance">
            One login. Your whole working month.
          </h2>
          <p className="mt-4.5 max-w-[46ch] text-[14.5px] leading-[1.7] text-white/60">
            Check in, request leave, read payslips, approve claims. Whatever your role, it is behind
            this door.
          </p>
        </div>

        {/* No tagline line here: the lockup above already carries it, and
            printing it twice on one panel reads as a mistake. */}
      </aside>

      <main className="flex flex-1 items-start justify-center px-5 pt-10 pb-12 md:items-center md:px-7 md:py-10">
        <div className="w-full max-w-100">
          <h1 className="font-heading text-[26px] font-bold tracking-tight">Welcome back</h1>
          <p className="mt-2 mb-7 text-[13.5px] text-[#55657A]">
            Sign in to your byteSpate workspace.
          </p>

          {/* A segmented control, not the page-level underline tabs used inside
              the app: this picks which credential you are signing in with, so
              it should read as a switch rather than as navigation. */}
          <Tabs defaultValue="staff">
            <TabsList className="mb-6 h-auto! w-full gap-1 rounded-lg bg-[#EFF2F6] p-1">
              <TabsTrigger
                value="staff"
                className="h-9 flex-1 rounded-md text-[13px] font-semibold text-[#5F6B7C] after:hidden data-active:bg-white data-active:text-[#17191C] data-active:shadow-[0_1px_2px_rgba(28,39,51,0.10)]"
              >
                Staff
              </TabsTrigger>
              <TabsTrigger
                value="admin"
                className="h-9 flex-1 rounded-md text-[13px] font-semibold text-[#5F6B7C] after:hidden data-active:bg-white data-active:text-[#17191C] data-active:shadow-[0_1px_2px_rgba(28,39,51,0.10)]"
              >
                Administrator
              </TabsTrigger>
            </TabsList>
            <TabsContent value="staff">
              <StaffLoginForm />
            </TabsContent>
            <TabsContent value="admin">
              <AdminLoginForm />
            </TabsContent>
          </Tabs>

          <p className="mt-6 border-t border-[#E4E9EF] pt-5 text-center text-[11.5px] leading-[1.6] text-[#6B7789]">
            Access is provisioned by your HR admin.{" "}
            <a
              href="#"
              className="font-bold text-[#17191C] underline underline-offset-2 hover:text-[#0E1012]"
            >
              Contact them
            </a>{" "}
            to get set up.
          </p>
        </div>
      </main>
    </div>
  )
}
