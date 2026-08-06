"use client"

import { useState } from "react"
import { RiCloseLine } from "@remixicon/react"

import { deleteAvatar, uploadAvatar } from "@/lib/api/employees"
import { useSession } from "@/lib/auth/session-context"
import { Button } from "@/components/ui/button"
import { AVATAR_ACCEPT, AVATAR_MAX_BYTES, FileUpload } from "@/components/ui/file-upload"

export function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function AvatarUpload({
  employeeId,
  avatarUrl,
  fullName,
  editable,
  onChanged,
}: {
  employeeId: string
  avatarUrl: string | null
  fullName: string
  editable: boolean
  onChanged: () => void
}) {
  const { accessToken } = useSession()
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const image = avatarUrl ? (
    // A signed Cloudinary URL is not a static asset and cannot be optimised
    // by next/image without whitelisting the host and leaking the cloud
    // name into client config.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatarUrl} alt="" className="h-full w-full rounded-md object-cover" />
  ) : (
    <span className="text-[20px] font-bold text-[#55657A]">{initialsFrom(fullName)}</span>
  )

  if (!editable) {
    return (
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-[#EFF2F6]">
        {image}
      </div>
    )
  }

  async function handleRemove() {
    if (!accessToken) return
    setRemoveError(null)
    setRemoving(true)
    try {
      await deleteAvatar(accessToken, employeeId)
      onChanged()
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <FileUpload
          accept={AVATAR_ACCEPT}
          maxBytes={AVATAR_MAX_BYTES}
          label="Change photo"
          onSelect={async (file) => {
            if (!accessToken) return
            await uploadAvatar(accessToken, employeeId, file)
            onChanged()
          }}
          render={({ open, pending }) => (
            <Button
              type="button"
              onClick={open}
              disabled={pending || removing}
              className="group relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-md bg-[#EFF2F6]"
              aria-label="Change profile photo"
            >
              {image}
              <span className="absolute inset-0 hidden items-center justify-center bg-black/55 text-[11px] font-bold text-white group-hover:flex">
                {pending ? "…" : "Change"}
              </span>
            </Button>
          )}
        />
        {avatarUrl ? (
          <Button
            type="button"
            onClick={handleRemove}
            disabled={removing}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#7A8698] hover:text-[#B03A3A] disabled:opacity-50"
          >
            <RiCloseLine className="size-3.5" />
            {removing ? "Removing…" : "Remove"}
          </Button>
        ) : null}
      </div>
      {removeError ? (
        <p className="text-[13px] font-semibold text-[#B03A3A]">{removeError}</p>
      ) : null}
    </div>
  )
}
