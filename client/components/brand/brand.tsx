import Image from "next/image"

import { cn } from "@/lib/utils"

/**
 * The byteSpate identity, in one place.
 *
 * Both files are derived from `assets/company_logo.png`, which ships on a solid
 * white field. The background is cleared by flood-filling inward from the frame
 * rather than by keying out white globally, because the mark contains white of
 * its own: the square behind the brain, and the gap between its red and green
 * rings. A global key would have punched holes through both.
 *
 * - `bytespate-logo.png`  the full lockup, wordmark and tagline. 720x168, 11KB.
 * - `bytespate-mark.png`  the square mark alone, for tight or square slots.
 */

export const BRAND_NAME = "byteSpate"
export const BRAND_TAGLINE = "Accelerating the future Byte by Byte"

/**
 * The full lockup.
 *
 * Its wordmark is black, so on a dark surface it needs something to sit on.
 * `tone="dark"` supplies a white plate rather than a recoloured copy of the
 * artwork: inverting it would mean recolouring the wordmark but not the brain
 * inside the mark, which is also black but sits on white and would vanish.
 */
export function BrandLogo({
  tone = "light",
  width = 168,
  className,
}: {
  /** The surface it sits on, not the colour of the logo. */
  tone?: "light" | "dark"
  width?: number
  className?: string
}) {
  const logo = (
    <Image
      src="/brand/bytespate-logo.png"
      alt={BRAND_NAME}
      width={720}
      height={168}
      style={{ width, height: "auto" }}
      className="block"
      priority
    />
  )

  if (tone === "dark") {
    return (
      <span className={cn("inline-flex rounded-md bg-white px-2.5 py-2", className)}>{logo}</span>
    )
  }

  return <span className={cn("inline-flex", className)}>{logo}</span>
}

/** The square mark on its own. Safe on any background: its red border runs to
 *  every edge of the frame, so nothing shows through behind it. */
export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/brand/bytespate-mark.png"
      alt=""
      width={size}
      height={size}
      className={cn("shrink-0 rounded", className)}
      priority
    />
  )
}
