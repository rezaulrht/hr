import { readFile } from "node:fs/promises"
import path from "node:path"
import type { Browser } from "puppeteer"
import { env } from "../../config/env"
import { buildPnl } from "./statements.pnl"
import { buildPosition } from "./statements.position"
import { buildEquity } from "./statements.equity"
import { cashFlowStatement } from "./statements.cashflow"
import { statementNotes } from "./statements.notes"
import { annexureA } from "./statements.annexure"
import type { DateRange } from "./statements.period"

let browserPromise: Promise<Browser> | null = null
async function browser(): Promise<Browser> {
  if (!browserPromise) browserPromise = import("puppeteer").then((p) => p.default.launch({ executablePath: process.env.CHROME_PATH, args: ["--no-sandbox", "--disable-dev-shm-usage"] }))
  return browserPromise
}
export async function closeStatementsBrowser(): Promise<void> { const b = await browserPromise?.catch(() => null); browserPromise = null; await b?.close().catch(() => undefined) }
function escape(value: string): string { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") }
function rows(title: string, data: Array<{ label: string; current: string; comparative?: string }>): string { return `<h2>${escape(title)}</h2><table><tr><th>Particulars</th><th>Current</th><th>Comparative</th></tr>${data.map((r) => `<tr><td>${escape(r.label)}</td><td>${escape(r.current)}</td><td>${escape(r.comparative ?? "")}</td></tr>`).join("")}</table>` }
export async function renderStatementsPdf(range: DateRange): Promise<Buffer> {
  const [pnl, position, equity, cash, notes, annexure] = await Promise.all([buildPnl(range), buildPosition(range), buildEquity(range), cashFlowStatement(range), statementNotes(range), annexureA(range)])
  const template = await readFile(path.join(process.cwd(), "src", "templates", "statements.html"), "utf8")
  const html = template.replace("{{COMPANY_NAME}}", escape(env.COMPANY_NAME)).replace("{{PERIOD}}", escape(pnl.period.label)).replace("{{CONTENT}}", [rows("Profit or Loss", pnl.lines), rows("Cash Flow", [...cash.operating, ...cash.investing, ...cash.financing, ...cash.summary]), rows("Financial Position", [...position.assets.flatMap((s) => s.lines), ...position.equityAndLiabilities.flatMap((s) => s.lines)]), rows("Changes in Equity", equity.rows.map((r) => ({ label: r.label, current: r.total }))), rows("Notes", notes.notes.map((n) => ({ label: `${n.ref} ${n.title}`, current: n.total ?? "" }))), rows("Annexure-A", annexure.rows.map((r) => ({ label: r.particulars, current: r.writtenDownValue })))].join(""))
  const page = await (await browser()).newPage()
  try { await page.setContent(html, { waitUntil: "load" }); return Buffer.from(await page.pdf({ format: "A4", printBackground: true })) } finally { await page.close() }
}
