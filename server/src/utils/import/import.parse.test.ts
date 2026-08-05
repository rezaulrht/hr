import ExcelJS from "exceljs"
import { describe, expect, it } from "vitest"

import { parseSheet } from "./import.parse"

async function xlsxBuffer(sheets: Record<string, string[][]>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = wb.addWorksheet(name)
    rows.forEach((r) => ws.addRow(r))
  }
  return Buffer.from(await wb.xlsx.writeBuffer())
}

describe("parseSheet", () => {
  it("keys cells by the lower-cased trimmed header", async () => {
    const buf = await xlsxBuffer({
      Sheet1: [
        ["  Asset Tag ", "Name"],
        ["BS-AST-00001", "ThinkPad X1"],
      ],
    })

    const rows = await parseSheet(buf, "register.xlsx")

    expect(rows).toEqual([
      { rowNumber: 2, values: { "asset tag": "BS-AST-00001", name: "ThinkPad X1" } },
    ])
  })

  it("reads only the first worksheet", async () => {
    const buf = await xlsxBuffer({
      Register: [["name"], ["ThinkPad"]],
      Notes: [["name"], ["DO NOT IMPORT"]],
    })

    const rows = await parseSheet(buf, "register.xlsx")

    expect(rows).toHaveLength(1)
    expect(rows[0].values.name).toBe("ThinkPad")
  })

  it("parses .csv identically to .xlsx of the same content", async () => {
    const csv = Buffer.from("name,serial\nThinkPad X1,SN-1\n", "utf8")
    const xlsx = await xlsxBuffer({
      Sheet1: [
        ["name", "serial"],
        ["ThinkPad X1", "SN-1"],
      ],
    })

    expect(await parseSheet(csv, "register.csv")).toEqual(await parseSheet(xlsx, "register.xlsx"))
  })

  it("represents a missing cell as an empty string, not undefined", async () => {
    const buf = await xlsxBuffer({
      Sheet1: [
        ["name", "serial"],
        ["Desk", ""],
      ],
    })

    const rows = await parseSheet(buf, "register.xlsx")

    expect(rows[0].values.serial).toBe("")
  })

  it("rejects a file with no header row", async () => {
    const buf = await xlsxBuffer({ Sheet1: [] })

    await expect(parseSheet(buf, "empty.xlsx")).rejects.toThrow(/header row/i)
  })
})
