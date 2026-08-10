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
 * The full lockup, in the variant that suits the surface.
 *
 * The artwork's wordmark is black, so a dark panel needs its own copy rather
 * than the light one on a white plate. A plate is the safe answer and it looks
 * like one: a bright slab in the middle of a near-black sidebar.
 *
 * `bytespate-logo-dark.png` is derived from the light file by inverting only
 * the *achromatic* pixels to the right of the mark. That leaves the red S and
 * the green bar untouched, because they are chromatic, and leaves the mark
 * itself completely alone, because the brain inside it is black on white and a
 * blanket inversion would erase it. The soft grey drop shadow is curved away
 * rather than inverted, which would have haloed every letter.
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
  return (
    <span className={cn("inline-flex", className)}>
      <Image
        src={tone === "dark" ? "/brand/bytespate-logo-dark.png" : "/brand/bytespate-logo.png"}
        alt={BRAND_NAME}
        width={720}
        height={168}
        style={{ width, height: "auto" }}
        className="block"
        priority
      />
    </span>
  )
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
