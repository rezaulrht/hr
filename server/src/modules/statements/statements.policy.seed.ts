import prisma from "../../config/prisma"

export interface PolicyNoteSeed { ref: string; title: string; body: string }

export const POLICY_NOTES: PolicyNoteSeed[] = [
  { ref: "1.00", title: "Corporate Information", body: "The Company was incorporated in Bangladesh as a private company limited by shares under the Companies Act 1994.\n\nThe registered office of the Company is located in Dhaka, Bangladesh.\n\nThe principal activities of the Company are software development and related information technology services." },
  { ref: "2.00", title: "Basis of Preparation and Significant Accounting Policies", body: "The financial statements have been prepared on a going concern basis under the historical cost convention." },
  { ref: "2.01", title: "Statement of Compliance", body: "The financial statements have been prepared in accordance with International Financial Reporting Standards (IFRS) as adopted in Bangladesh, and the requirements of the Companies Act 1994." },
  { ref: "2.02", title: "Reporting Period", body: "The financial period of the Company covers 1 July to 30 June each year." },
  { ref: "2.03", title: "Functional and Presentation Currency", body: "The financial statements are presented in Bangladesh Taka (BDT), which is the Company's functional currency. Figures have been rounded to the nearest Taka." },
  { ref: "2.04", title: "Use of Estimates and Judgements", body: "The preparation of financial statements requires management to make judgements, estimates and assumptions that affect the reported amounts of assets, liabilities, income and expenses. Actual results may differ from these estimates." },
  { ref: "2.05", title: "Statement of Financial Position", body: "Assets and liabilities are classified as current and non-current in accordance with IAS 1 Presentation of Financial Statements." },
  { ref: "2.06", title: "Statement of Profit or Loss and Other Comprehensive Income", body: "Revenue and expenses are recognised on an accrual basis in the period to which they relate." },
  { ref: "2.07", title: "Statement of Changes in Equity", body: "The Statement of Changes in Equity has been prepared in accordance with IAS 1 Presentation of Financial Statements." },
  { ref: "2.08", title: "Statement of Cash Flows", body: "The Statement of Cash Flows has been prepared under the indirect method in accordance with IAS 7 Statement of Cash Flows.\n\nCash and cash equivalents comprise cash in hand and balances with banks." },
  { ref: "2.09", title: "Revenue Recognition", body: "Revenue is recognised when control of the promised goods or services is transferred to the customer." },
  { ref: "2.10", title: "Inventories", body: "Inventories are stated at the lower of cost and net realisable value." },
  { ref: "2.11", title: "Property, Plant and Equipment", body: "Property, plant and equipment are stated at cost less accumulated depreciation.\n\nDepreciation is charged on the reducing balance method at the rates disclosed in Annexure-A, from the month of acquisition.\n\nThe rates applied are: Furniture & Fixture 10%, Office Equipments 10%, Software / Domain 25%, and Computer / Laptop 20%." },
  // Closes the narrative section. 3.00 puts it after the policies and before
  // the generated breakdowns, which start at 4.00.
  { ref: "3.00", title: "Notes to the Policy", body: "These financial statements have been prepared for the purposes of the Company and its shareholders.\n\nFigures relating to the previous year have been rearranged wherever necessary to conform to the current year's presentation.\n\nFigures have been rounded off to the nearest Taka." },
]

export async function seedPolicyNotes(): Promise<void> {
  for (const [index, note] of POLICY_NOTES.entries()) {
    await prisma.statementNote.upsert({ where: { ref: note.ref }, update: {}, create: { ...note, sortOrder: index } })
  }
}
