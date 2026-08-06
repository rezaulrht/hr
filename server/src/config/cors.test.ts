import { describe, expect, it } from "vitest"

import { parseOrigins } from "./cors"

describe("parseOrigins", () => {
  it("falls back to the single client origin when CORS_ORIGINS is unset", () => {
    expect(parseOrigins(undefined, "https://app.example.com")).toEqual(["https://app.example.com"])
  })

  it("splits a comma-separated list", () => {
    expect(parseOrigins("https://a.com,https://b.com", "https://app.example.com")).toEqual([
      "https://a.com",
      "https://b.com",
    ])
  })

  it("trims surrounding whitespace", () => {
    expect(parseOrigins(" https://a.com , https://b.com ", "https://x.com")).toEqual([
      "https://a.com",
      "https://b.com",
    ])
  })

  it("drops empty entries from a trailing comma", () => {
    expect(parseOrigins("https://a.com,,", "https://x.com")).toEqual(["https://a.com"])
  })

  // An all-empty CORS_ORIGINS must not produce [], which cors() treats as
  // "reject everything" — a typo in a config var would take the API offline.
  it("falls back to the client origin when the list is entirely empty", () => {
    expect(parseOrigins("  , ", "https://app.example.com")).toEqual(["https://app.example.com"])
  })
})
