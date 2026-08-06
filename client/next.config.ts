import type { NextConfig } from "next";

/**
 * Auth endpoints are proxied through this app rather than called directly.
 *
 * The client is on vercel.app and the API on herokuapp.com — separate
 * registrable domains, so a refresh cookie set directly by the API would be a
 * third-party cookie: blocked by Safari today, deprecated in Chrome. Proxying
 * makes the browser see the Set-Cookie as coming from this origin, so the
 * cookie is first-party and `proxy.ts` can still see it.
 *
 * Only /api/auth/* is proxied. Uploads run to 15MB and Vercel caps proxied
 * request bodies well below that; every other route calls the API directly
 * with a Bearer token, which needs no cookie.
 */
const nextConfig: NextConfig = {
  async rewrites() {
    const apiOrigin = process.env.API_ORIGIN
    if (!apiOrigin) return []
    return [
      {
        source: "/api/auth/:path*",
        destination: `${apiOrigin}/api/auth/:path*`,
      },
    ]
  },
};

export default nextConfig;
