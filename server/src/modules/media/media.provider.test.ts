import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/env", () => ({
  env: {
    CLOUDINARY_CLOUD_NAME: undefined,
    CLOUDINARY_API_KEY: undefined,
    CLOUDINARY_API_SECRET: undefined,
  },
}))

import { env } from "../../config/env"
import { assertMediaConfigured, isMediaConfigured } from "./media.provider"

const mutableEnv = env as unknown as Record<string, string | undefined>

beforeEach(() => {
  mutableEnv.CLOUDINARY_CLOUD_NAME = undefined
  mutableEnv.CLOUDINARY_API_KEY = undefined
  mutableEnv.CLOUDINARY_API_SECRET = undefined
})

describe("isMediaConfigured", () => {
  it("is false when no Cloudinary variables are set", () => {
    expect(isMediaConfigured()).toBe(false)
  })

  it("is false when only some variables are set", () => {
    mutableEnv.CLOUDINARY_CLOUD_NAME = "demo"
    mutableEnv.CLOUDINARY_API_KEY = "key"
    expect(isMediaConfigured()).toBe(false)
  })

  it("is true when all three are set", () => {
    mutableEnv.CLOUDINARY_CLOUD_NAME = "demo"
    mutableEnv.CLOUDINARY_API_KEY = "key"
    mutableEnv.CLOUDINARY_API_SECRET = "secret"
    expect(isMediaConfigured()).toBe(true)
  })
})

describe("assertMediaConfigured", () => {
  it("throws a 503 with a diagnosable message when unconfigured", () => {
    expect(() => assertMediaConfigured()).toThrowError(
      "File storage is not configured on this server"
    )
  })

  it("does not throw when configured", () => {
    mutableEnv.CLOUDINARY_CLOUD_NAME = "demo"
    mutableEnv.CLOUDINARY_API_KEY = "key"
    mutableEnv.CLOUDINARY_API_SECRET = "secret"
    expect(() => assertMediaConfigured()).not.toThrow()
  })
})
