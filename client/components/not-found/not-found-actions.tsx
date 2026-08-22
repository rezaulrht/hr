"use client"

import { useSyncExternalStore } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { RiArrowLeftLine, RiLayoutGridLine, RiLoginBoxLine } from "@remixicon/react"

import { ROLE_ROUTES } from "@/lib/auth/role-routes"
import { useSession } from "@/lib/auth/session-context"
import { Button, buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/** history.length emits no events, so there is nothing to subscribe to. */
const subscribeToNothing = () => () => {}
const readHistoryDepth = () => window.history.length > 1

/**
 * The way out of a 404, resolved from who is reading it.
 *
 * A single "Return home" link would be wrong here: `/` is the marketing page,
 * and this app's home depends on your role — five route groups, one per role.
 * Sending a signed-in Finance Officer to the landing page is a second wrong
 * address in a row.
 *
 * Client, and unavoidably so: `not-found.tsx` is a Server Component and the
 * session lives in React context. The session is also *restored* on the
 * client — `SessionProvider` attempts a silent refresh on mount — so the
 * answer genuinely is not knowable during the server render.
 *
 * The destinations are anchors carrying `buttonVariants`, not `<Button>`:
 * this project's Button is Base UI's, which composes through `render` rather
 * than `asChild`, and a navigation control should be a real link regardless —
 * middle-click and "open in new tab" work, and it needs no JavaScript.
 */
export function NotFoundActions() {
  const { user, status } = useSession()
  const router = useRouter()

  // `history.length > 1` is only meaningful in the browser, and only after
  // hydration. A 404 opened from a pasted link or a bookmark has nothing
  // behind it, and a Back button that cannot go back is a control that does
  // nothing.
  //
  // useSyncExternalStore rather than an effect writing state: the server
  // snapshot is `false`, so the button is simply absent from the HTML and
  // appears on hydration where it works. Reading it in an effect would set
  // state during the first commit and cascade a second render for a value
  // that never changes afterwards.
  const canGoBack = useSyncExternalStore(subscribeToNothing, readHistoryDepth, () => false)

  // The silent refresh is still in flight. Showing "Sign in" now and swapping
  // it for "dashboard" a moment later would move the button under the cursor
  // of anyone who reached for it.
  if (status === "loading") {
    return (
      <div className="flex flex-col items-center gap-2.5 sm:flex-row">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>
    )
  }

  const home = user ? ROLE_ROUTES[user.role] : null

  return (
    <div className="flex w-full flex-col items-center gap-2.5 sm:w-auto sm:flex-row sm:justify-center">
      {home ? (
        <Link
          href={home}
          className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}
        >
          <RiLayoutGridLine aria-hidden />
          Back to your dashboard
        </Link>
      ) : (
        <Link
          href="/login"
          className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}
        >
          <RiLoginBoxLine aria-hidden />
          Sign in
        </Link>
      )}

      {canGoBack ? (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full sm:w-auto"
          onClick={() => router.back()}
        >
          <RiArrowLeftLine aria-hidden />
          Go back
        </Button>
      ) : null}
    </div>
  )
}
