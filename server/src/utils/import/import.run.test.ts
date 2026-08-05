import { describe, expect, it, vi } from "vitest"

import type { ImportSpec } from "./import.run"
import { runCommit, runPreview } from "./import.run"
import type { ParsedRow, RowIssue } from "./import.types"

interface Widget {
  serial: string
  name: string
}

const spec: ImportSpec<Widget> = {
  columns: [
    { header: "serial", required: true, uniqueInFile: true },
    { header: "name", required: true },
  ],
  validateRow(row: ParsedRow) {
    const issues: RowIssue[] = []
    if (row.values.name === "BAD") {
      issues.push({ rowNumber: row.rowNumber, column: "name", message: "name is BAD" })
    }
    if (issues.length > 0) return { ok: false, issues }
    return { ok: true, value: { serial: row.values.serial, name: row.values.name } }
  },
  summarise: (rows) => ({ widgets: rows.length }),
}

const csv = (body: string) => Buffer.from(body, "utf8")

describe("runPreview", () => {
  it("returns typed rows and no issues for a clean file", async () => {
    const result = await runPreview(csv("serial,name\nSN-1,Alpha\nSN-2,Beta\n"), "w.csv", spec)

    expect(result.issues).toEqual([])
    expect(result.rows).toEqual([
      { serial: "SN-1", name: "Alpha" },
      { serial: "SN-2", name: "Beta" },
    ])
    expect(result.summary).toEqual({ widgets: 2 })
  })

  it("names a missing required column once, not once per row", async () => {
    const result = await runPreview(csv("serial\nSN-1\nSN-2\n"), "w.csv", spec)

    expect(result.issues).toEqual([
      { rowNumber: 1, column: "name", message: "Required column \"name\" is missing" },
    ])
  })

  it("names a missing required value on the row it is missing from", async () => {
    const result = await runPreview(csv("serial,name\nSN-1,\n"), "w.csv", spec)

    expect(result.issues).toEqual([
      { rowNumber: 2, column: "name", message: "name is required" },
    ])
  })

  it("names BOTH rows when two share a uniqueInFile value", async () => {
    const result = await runPreview(csv("serial,name\nSN-1,Alpha\nSN-1,Beta\n"), "w.csv", spec)

    expect(result.issues).toHaveLength(2)
    expect(result.issues.map((i) => i.rowNumber).sort()).toEqual([2, 3])
    expect(result.issues[0].message).toMatch(/duplicate/i)
    // Naming only the second occurrence tells the user to fix the wrong row —
    // they cannot tell which of the two is the mistake without seeing both.
  })

  it("ignores a repeated empty value under uniqueInFile", async () => {
    const loose: ImportSpec<Widget> = {
      ...spec,
      columns: [
        { header: "serial", required: false, uniqueInFile: true },
        { header: "name", required: true },
      ],
    }

    const result = await runPreview(csv("serial,name\n,Alpha\n,Beta\n"), "w.csv", loose)

    expect(result.issues).toEqual([])
  })

  it("surfaces validateAll issues alongside row issues", async () => {
    const withDbCheck: ImportSpec<Widget> = {
      ...spec,
      validateAll: async (rows) =>
        rows
          .filter((r) => r.serial === "SN-TAKEN")
          .map((r) => ({ rowNumber: 0, column: "serial", message: `${r.serial} already exists` })),
    }

    const result = await runPreview(csv("serial,name\nSN-TAKEN,Alpha\n"), "w.csv", withDbCheck)

    expect(result.issues).toEqual([
      { rowNumber: 0, column: "serial", message: "SN-TAKEN already exists" },
    ])
  })
})

describe("runCommit", () => {
  it("calls the writer once with every row", async () => {
    const write = vi.fn(async (rows: Widget[]) => ({ created: rows.length }))

    const result = await runCommit(csv("serial,name\nSN-1,Alpha\nSN-2,Beta\n"), "w.csv", spec, write)

    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith([
      { serial: "SN-1", name: "Alpha" },
      { serial: "SN-2", name: "Beta" },
    ])
    expect(result).toEqual({ created: 2 })
  })

  it("writes NOTHING when a single row is bad", async () => {
    const write = vi.fn()

    await expect(
      runCommit(csv("serial,name\nSN-1,Alpha\nSN-2,BAD\n"), "w.csv", spec, write)
    ).rejects.toMatchObject({ statusCode: 400 })

    // A partially imported file is worse than none: you cannot tell which
    // rows landed, so re-running duplicates and not re-running leaves gaps.
    expect(write).not.toHaveBeenCalled()
  })

  it("reports every bad row in the 400, not just the first", async () => {
    const write = vi.fn()

    await expect(
      runCommit(csv("serial,name\nSN-1,BAD\nSN-2,BAD\n"), "w.csv", spec, write)
    ).rejects.toMatchObject({
      statusCode: 400,
      details: { issues: [expect.anything(), expect.anything()] },
    })
  })
})
