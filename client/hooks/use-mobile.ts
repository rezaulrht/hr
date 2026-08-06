import * as React from "react"

// Raised from the shadcn default of 768 to match the design reference, which
// keeps the dashboard sidebar off-canvas until 1024. `ui/sidebar` reads this
// through `useSidebar()` and exposes no prop to override it, so the constant is
// the only lever. NOTE: re-running `shadcn add sidebar` restores the original
// file — if the sidebar starts docking at tablet widths, check here first.
const MOBILE_BREAKPOINT = 1024

const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches
}

/**
 * There is no viewport on the server, so it renders the desktop branch and
 * hydration corrects it. Returning `true` instead would ship a mobile drawer
 * to every desktop user for one frame.
 */
function getServerSnapshot() {
  return false
}

/**
 * Deliberately `useSyncExternalStore` rather than the `useState` + `useEffect`
 * pairing shadcn ships: setting state from inside an effect fires a second
 * render pass on every mount, which `react-hooks/set-state-in-effect` flags as
 * an error. This is the API built for subscribing to an external source.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
