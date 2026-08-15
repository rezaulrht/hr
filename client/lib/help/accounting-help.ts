/**
 * Plain-language help for the accounting section.
 *
 * Two things are on screen at once, deliberately: the flow the whole section
 * follows, with the reader's current page marked on it, and then what this
 * particular page does. Somebody who opens this on the trial balance does not
 * only want to know what a trial balance is — they want to know why they are
 * looking at one and what comes next.
 *
 * The language is the product's own. No "debit the nominal ledger"; the people
 * using this run payroll for one company and half of them have never taken an
 * accounting class.
 */

export type FlowStepId = "setup" | "record" | "post" | "read" | "report" | "close"

export interface FlowStep {
  id: FlowStepId
  title: string
  body: string
  /** The pages that belong to this step, named as the sidebar labels them.
   *  Text, never links — the panel must not become a second navigation. */
  pages: string[]
}

/**
 * Six steps, numbered, because the order is the information — you cannot read
 * a ledger before something has posted into it, and you cannot close a month
 * you have not read.
 */
export const FLOW: FlowStep[] = [
  {
    id: "setup",
    title: "Set up",
    body: "Done once. The chart of accounts lists every account money can sit in. A financial year is created and split into twelve months. Opening balances carry in what the company already owned and owed on day one.",
    pages: ["Chart of accounts", "Years & periods", "Opening balances"],
  },
  {
    id: "record",
    title: "Record",
    body: "The daily work, and mostly not done in this section at all. A payroll run is approved, an expense claim is reimbursed, a supplier bill is entered, someone leaves and is settled. Anything those modules do not cover is typed as a journal by hand.",
    pages: ["Payroll", "Expenses", "Settlements", "Operating costs"],
  },
  {
    id: "post",
    title: "Post",
    body: "Each of those events becomes one balanced entry in the ledger. The posting rules decide which account every figure lands in, so nobody types an account number while approving a payroll run.",
    pages: ["Posting rules", "Journals"],
  },
  {
    id: "read",
    title: "Read",
    body: "The same entries, sliced different ways. The general ledger shows one account over time. The cash and bank books show money moving. The trial balance shows every account at once, and proves the books are square.",
    pages: ["General ledger", "Cash book", "Bank book", "Trial balance"],
  },
  {
    id: "report",
    title: "Report",
    body: "The five statements the company files, plus the notes that break them down, the schedule of fixed assets, and a PDF of the whole set. All of it is computed from the ledger — nothing here is typed twice.",
    pages: ["Financial statements", "Cash flow", "Notes", "Annexure-A", "Policy notes"],
  },
  {
    id: "close",
    title: "Close",
    body: "A month is closed so nothing can change behind a report that has already been read. At the end of the year, the profit or loss is swept into retained earnings and the year is locked.",
    pages: ["Years & periods"],
  },
]

export type HelpRole = "SUPER_ADMIN" | "HR_ADMIN" | "FINANCE_OFFICER" | "REPORTING_MANAGER" | "EMPLOYEE"

export interface HelpFunction {
  name: string
  body: string
  /** Suggestion 4: the roles who can do this. Omitted when anyone who can
   *  reach the page can do it — a false "you cannot do this" is worse than a
   *  missing note. */
  roles?: HelpRole[]
}

export interface HelpEntry {
  /** The page's own name, as the sidebar calls it. */
  title: string
  /** One sentence: what this page is for. */
  lede: string
  step: FlowStepId
  /** Every action available here. */
  does: HelpFunction[]
  scenario: { title: string; steps: string[] }
  /** Things that surprise people. Optional, and only where something really does. */
  watchFor?: string[]
}

export const HELP: Record<string, HelpEntry> = {
  // ── Set up ────────────────────────────────────────────────────────────────
  "accounting/accounts": {
    title: "Chart of accounts",
    lede: "The list of every account money can sit in, arranged as a tree.",
    step: "setup",
    does: [
      {
        name: "Browse the tree",
        body: "Groups are headings — Non-Current Assets, Administrative & Selling Expenses — and the accounts underneath them are where figures actually land. A group holds no money of its own; its total is whatever its children add up to.",
      },
      {
        name: "Search by code or name",
        body: "Four-digit codes are grouped by type: 1000s are assets, 2000s liabilities, 3000s equity, 4000s income, 5000s expenses. Typing \"52\" finds the administrative expenses.",
      },
      {
        name: "Add an account",
        body: "Give it a code, a name, a type, and the group it sits under. New expense categories and new asset classes are added here rather than in code.",
      },
      {
        name: "Edit an account",
        body: "Rename it, move it under a different group, or mark it inactive. Inactive accounts stop appearing when someone writes a journal but keep their history.",
      },
      {
        name: "Delete an account",
        body: "Only possible while nothing has ever posted to it. Once an account has a single entry against it, deleting would break the history, so it is refused — mark it inactive instead.",
      },
    ],
    scenario: {
      title: "The company starts paying for a software subscription",
      steps: [
        "Search the 52xx range and find nothing that fits.",
        "Add \"Software subscriptions\" under Administrative & Selling Expenses.",
        "Go to Posting rules and point the relevant expense category at the new account.",
        "The next bill entered lands there automatically, and it appears as its own line in the statements.",
      ],
    },
    watchFor: [
      "An account cannot be moved underneath one of its own children. The system refuses it, because a loop would quietly drop that whole branch out of every statement total.",
      "Groups cannot be posted to. If a journal refuses an account for being a group, pick one of the accounts underneath it.",
    ],
  },

  "accounting/periods": {
    title: "Financial years & periods",
    lede: "The calendar the whole ledger runs on — one year, split into twelve months.",
    step: "setup",
    does: [
      {
        name: "Create a financial year",
        body: "Pick a start date, always the first of a month. The company's year runs 1 July to 30 June. Creating the year creates its twelve months at the same time.",
      },
      {
        name: "Close a month",
        body: "Closes the door. Nothing can post into a closed month — not a hand-typed journal, and not a payroll run either. This is what stops a report being read on Monday and quietly changing by Wednesday.",
        roles: ["SUPER_ADMIN"],
      },
      {
        name: "Reopen a month",
        body: "Possible, and it asks why. An unexplained reopen of a closed month is the first thing an auditor asks about, so the reason is required and recorded.",
        roles: ["SUPER_ADMIN"],
      },
      {
        name: "Draft the year-end entry",
        body: "At the end of the year, this sweeps every income and expense account to zero and moves the difference — the profit or loss — into retained earnings. It arrives as a draft you review before posting.",
        roles: ["FINANCE_OFFICER", "SUPER_ADMIN"],
      },
      {
        name: "Lock the year",
        body: "The final step. After locking, nothing in that year can be touched again.",
        roles: ["SUPER_ADMIN"],
      },
    ],
    scenario: {
      title: "Closing June and finishing the year",
      steps: [
        "Check the trial balance for June and confirm it agrees.",
        "Leave June open for now — the year-end entry has to post into it.",
        "Draft the year-end entry, read the figure it moves to retained earnings, and post it.",
        "Close June, then lock the year.",
      ],
    },
    watchFor: [
      "The last month has to stay open until the year-end entry is posted, which is exactly the window in which someone else can still post something. The system re-checks the figure at lock time and refuses if it has moved.",
      "Closing a month while a payroll run is waiting to be disbursed will stop that disbursement. Close after payday, not before.",
    ],
  },

  "accounting/opening-balances": {
    title: "Opening balances",
    lede: "What the company already owned and owed on the day it started using this system.",
    step: "setup",
    does: [
      {
        name: "Enter a balance per account",
        body: "Cash in the bank, equipment already bought, money owed to suppliers, share capital paid in. One figure per account, as at the first day of the first financial year.",
      },
      {
        name: "Watch the difference",
        body: "The running difference at the bottom must reach zero. If it does not, something has been missed — the two sides of a company's books always add up, and a gap is a fact you have not entered yet.",
      },
      {
        name: "Post them",
        body: "Posting turns the whole set into a single opening journal dated the first day of the year. From then on, every report includes it.",
      },
    ],
    scenario: {
      title: "Starting mid-life, not from scratch",
      steps: [
        "Take the closing balance sheet from whatever was used before — a spreadsheet, or last year's audited accounts.",
        "Enter each line against the matching account here.",
        "The difference reads zero when the whole balance sheet is in.",
        "Post. The first trial balance now starts from reality rather than from nothing.",
      ],
    },
    watchFor: [
      "This is done once. Correcting it later means a reversing journal, not an edit, because reports have already been produced from it.",
    ],
  },

  // ── Record and post ───────────────────────────────────────────────────────
  "posting-rules": {
    title: "Posting rules",
    lede: "The map that decides which account each figure lands in, so nobody types an account number while approving payroll.",
    step: "post",
    does: [
      {
        name: "See every rule",
        body: "Grouped by event — payroll accrual, payroll payment, expense, operating cost, settlement. Each row maps a key to an account: basic salary for an administrative department goes to 5201, tax deducted goes to 2140.",
      },
      {
        name: "Re-point a rule",
        body: "Change the account a key resolves to. It takes effect on the next thing that posts; already-posted entries are history and do not move.",
      },
      {
        name: "Read the unresolved list",
        body: "Keys the system has seen and has no rule for. This is the early warning: a new allowance or a new expense category shows up here before it stops a payroll run.",
      },
      {
        name: "Leave a note on a rule",
        body: "For the ones that need explaining later — a rule pointing somewhere temporary, or one that was deliberately shared with another key.",
      },
    ],
    scenario: {
      title: "HR adds a transport allowance",
      steps: [
        "The new allowance appears in the unresolved list the first time a run is previewed.",
        "Add a rule pointing it at the right salary account.",
        "The run processes. Nobody edited any code, and nothing was deployed.",
      ],
    },
    watchFor: [
      "A key that matches no rule stops the posting with an error naming the key. That is deliberate — a figure that lands on a plausible-but-wrong account is invisible until someone reads the statements months later.",
      "Some events have a catch-all rule as a safety net. Others deliberately do not, so an unmapped case is caught rather than absorbed.",
    ],
  },

  "accounting/journals": {
    title: "Journal register",
    lede: "Every entry in the ledger, whether a person typed it or the system generated it.",
    step: "post",
    does: [
      {
        name: "Search and filter",
        body: "By number, narration or reference, and by status, type, date range or account. Entries generated by payroll and the other modules are marked as system entries.",
      },
      {
        name: "Open an entry",
        body: "Shows its lines, what it was for, who created it, who approved it, when it posted, and anything attached.",
      },
      {
        name: "Follow a status",
        body: "A typed journal goes draft, submitted, then posted once someone else approves it. Entries generated by payroll and the other modules post directly — the human approved the payroll run itself, and approving the arithmetic that follows would be a rubber stamp.",
      },
      {
        name: "Approve or send back",
        body: "Approving posts the entry. Sending it back asks for a note saying what is wrong, and returns it to the author.",
        roles: ["SUPER_ADMIN"],
      },
      {
        name: "Reverse a posted entry",
        body: "Posted entries are never edited or deleted. A reversal is a second entry that undoes the first, and both stay visible. It asks for a reason.",
      },
      {
        name: "Attach a document",
        body: "The receipt, the invoice, the bank advice. Attachments can still be added after posting, because paperwork often arrives later than the entry — but not removed.",
      },
    ],
    scenario: {
      title: "A supplier invoice was booked to the wrong account",
      steps: [
        "Find the entry in the register and open it.",
        "Reverse it, with a reason saying which account it should have been.",
        "Write a fresh entry with the right account.",
        "All three are on the record. Nothing was erased, and the reason it changed is answerable.",
      ],
    },
    watchFor: [
      "You cannot approve your own journal. Two people, always — that is the whole point of the queue.",
      "Reversal and year-end entries cannot have their lines retyped, only their narration. Retyping the lines of a reversal would leave the original marked as reversed by something that no longer reverses it.",
    ],
  },

  "accounting/journals/new": {
    title: "Writing a journal",
    lede: "A hand-typed entry, for anything the payroll, expense, cost and settlement modules do not already post for you.",
    step: "post",
    does: [
      {
        name: "Set the date and narration",
        body: "The date decides which month it lands in, so it has to fall inside an open month. The narration is what a reader sees first — write it for somebody opening this in a year's time.",
      },
      {
        name: "Add lines",
        body: "Each line names an account and an amount on one side, debit or credit. Add as many as the entry needs; two is common, and a payroll entry has dozens.",
      },
      {
        name: "Watch the balance",
        body: "The two sides must match exactly. The running difference is shown as you type, and submitting is refused while it is not zero.",
      },
      {
        name: "Note a line",
        body: "Optional per-line text, for when one line inside a larger entry needs explaining on its own.",
      },
      {
        name: "Attach supporting documents",
        body: "The paperwork the entry came from.",
      },
      {
        name: "Save as draft or submit",
        body: "A draft is yours to keep working on. Submitting sends it to somebody else to approve — you cannot approve your own.",
      },
    ],
    scenario: {
      title: "The bank charged a fee nobody billed",
      steps: [
        "Date it the day the bank took it, and narrate it \"Bank charges — August\".",
        "One line debiting bank charges, one crediting the bank account, same amount.",
        "The difference reads zero. Attach the statement page and submit.",
        "A colleague approves it and it posts.",
      ],
    },
    watchFor: [
      "A group heading cannot be used on a line. Pick one of the accounts underneath it.",
      "If the date falls in a closed month the entry is refused. Either reopen the month with a reason, or date it into the current one.",
    ],
  },

  // ── Read ──────────────────────────────────────────────────────────────────
  "accounting/ledger": {
    title: "General ledger",
    lede: "One account, every movement, in date order, with a running balance.",
    step: "read",
    does: [
      {
        name: "Pick an account and a date range",
        body: "Any account in the chart. The range decides the opening balance and what appears below it.",
      },
      {
        name: "Read the running balance",
        body: "Opening balance, then every entry, with the balance after each one. This answers \"how did this account get to this figure\" line by line.",
      },
      {
        name: "Jump to the entry",
        body: "Every row links to the journal it came from, so you can see the other side of it and who approved it.",
      },
      {
        name: "See where it came from",
        body: "Rows generated by payroll, expenses, costs or settlements say so, so you can tell a typed correction from a monthly run at a glance.",
      },
    ],
    scenario: {
      title: "Salary payable is not zero and it should be",
      steps: [
        "Open the ledger on the salary payable account for the month.",
        "The accrual is there, the payment is there, and one small amount is left over.",
        "Click through to that entry and find an adjustment that was accrued and never paid.",
        "Now you know whether it is owed or was booked twice.",
      ],
    },
    watchFor: [
      "Reversed entries are shown, not hidden, and so are their reversals. An account that was moved and then moved back reads as two rows netting to nothing — which is the truth, and hiding one of them would leave the balance looking wrong.",
    ],
  },

  "accounting/cash-book": {
    title: "Cash book",
    lede: "Cash in and out, in date order — the general ledger narrowed to accounts that hold physical cash.",
    step: "read",
    does: [
      {
        name: "Pick a cash account and a range",
        body: "Only accounts marked as cash appear here. If none do, none have been set up in the chart yet.",
      },
      {
        name: "Read receipts and payments",
        body: "Money in on one side, money out on the other, with the balance after each. The closing balance is what should physically be in the box.",
      },
    ],
    scenario: {
      title: "Counting the petty cash tin on the last day of the month",
      steps: [
        "Open the cash book for the month.",
        "Read the closing balance.",
        "Count the tin. If they differ, the difference is either a payment nobody recorded or a receipt nobody banked.",
      ],
    },
  },

  "accounting/bank-book": {
    title: "Bank book",
    lede: "The same view as the cash book, for bank accounts — what to hold next to a bank statement.",
    step: "read",
    does: [
      {
        name: "Pick a bank account and a range",
        body: "Only accounts marked as bank accounts appear here.",
      },
      {
        name: "Compare against the statement",
        body: "Every deposit and withdrawal with a running balance, so the closing figure can be read against the bank's own.",
      },
    ],
    scenario: {
      title: "The bank says one figure and the books say another",
      steps: [
        "Open the bank book for the month and read the closing balance.",
        "Work down against the bank statement.",
        "What is in the books and not on the statement has not cleared yet. What is on the statement and not in the books has not been recorded — usually a charge or an interest credit.",
      ],
    },
  },

  "accounting/trial-balance": {
    title: "Trial balance",
    lede: "Every account, side by side, proving the books are square before anybody reads a statement.",
    step: "read",
    does: [
      {
        name: "Read every account at once",
        body: "Opening, movement for the period, and closing, split into debits and credits.",
      },
      {
        name: "Check that it agrees",
        body: "The two totals must be identical. When they are, the page says so; when they are not, it says that instead and the statements will refuse to generate.",
      },
      {
        name: "Change the date range",
        body: "A month, a quarter, a full year, or anything custom.",
      },
    ],
    scenario: {
      title: "The month-end check, done first",
      steps: [
        "Open the trial balance for the month.",
        "Confirm it agrees.",
        "Scan for anything obviously in the wrong place — a large balance on an account that is normally empty.",
        "Then, and only then, go and read the statements.",
      ],
    },
    watchFor: [
      "A trial balance that does not agree is not a display problem. Statements are blocked until it does, deliberately — a balance sheet that does not balance is worse than no balance sheet.",
    ],
  },

  // ── Report ────────────────────────────────────────────────────────────────
  "accounting/statements": {
    title: "Financial statements",
    lede: "The three core statements, computed from the ledger, with last year beside this year.",
    step: "report",
    does: [
      {
        name: "Statement of Profit or Loss",
        body: "Revenue less cost of sales gives gross profit; less administrative and selling expenses gives operating profit; less financial expenses and tax gives the profit or loss for the year.",
      },
      {
        name: "Statement of Financial Position",
        body: "What the company owns and owes on one date. Fixed assets are shown net — cost less depreciation to date — and the two halves must agree.",
      },
      {
        name: "Statement of Changes in Equity",
        body: "How share capital, share money and retained earnings moved across the year.",
      },
      {
        name: "Choose the period",
        body: "A month, a quarter, a half year, the full year, or a custom range. The comparative column follows automatically.",
      },
      {
        name: "Download the PDF",
        body: "The whole set — statements, cash flow, notes, Annexure-A and the policy notes — as one document, with a generation date on every page.",
      },
    ],
    scenario: {
      title: "The auditor asks for the year",
      steps: [
        "Confirm the trial balance agrees for the full year.",
        "Set the period to the financial year.",
        "Read the three statements on screen and check the profit figure against what you expected.",
        "Download the PDF and send that, rather than a screenshot of a screen.",
      ],
    },
    watchFor: [
      "Every figure here is computed. There is nothing to type and nothing to correct on this page — if a number is wrong, the entry behind it is wrong, and the ledger is where to fix it.",
      "Once a year has been closed, its profit and loss accounts read zero, because the year-end entry swept them. That is correct, not a fault.",
    ],
  },

  "statements/cash-flow": {
    title: "Cash flow",
    lede: "Where cash actually came from and went, which is not the same question as whether the company made a profit.",
    step: "report",
    does: [
      {
        name: "Read the three sections",
        body: "Operating — cash from running the business. Investing — buying and selling long-term assets. Financing — share capital and loans.",
      },
      {
        name: "Follow the add-backs",
        body: "It starts from the profit or loss and adds back things that cost no cash, depreciation chiefly, then adjusts for money owed to and by the company.",
      },
      {
        name: "Check the reconciliation",
        body: "The bottom of the statement must land on the cash and bank balance the balance sheet shows. The page checks this itself and says so if it does not.",
      },
    ],
    scenario: {
      title: "A profitable month with less money in the bank",
      steps: [
        "Read the operating section: profit is positive.",
        "Look at the working-capital lines — a large amount owed by customers, unpaid.",
        "Look at investing: equipment was bought.",
        "The profit was real. The cash went into invoices nobody has paid yet and a laptop purchase.",
      ],
    },
  },

  "statements/notes": {
    title: "Notes",
    lede: "The breakdowns behind the single lines on the statements, generated from the ledger.",
    step: "report",
    does: [
      {
        name: "Read a note",
        body: "Each note takes one line from the statements — administrative expenses, say — and lists what it is made of, with last year beside it.",
      },
      {
        name: "Trace a figure",
        body: "The total on every note equals the line it explains. If a note and its statement line disagree, one of them is being computed wrongly and it is worth reporting.",
      },
      {
        name: "Set the period",
        body: "The same period control as the statements, so the notes always match whatever is on screen there.",
      },
    ],
    scenario: {
      title: "Administrative expenses jumped and nobody knows why",
      steps: [
        "Open the note for administrative expenses.",
        "Compare each row against last year.",
        "One row has trebled.",
        "Take that account to the general ledger and read the entries behind it.",
      ],
    },
  },

  "statements/annexure-a": {
    title: "Annexure-A",
    lede: "The fixed asset schedule: what the company owns, what it cost, how much has been written off, and what it is worth now.",
    step: "report",
    does: [
      {
        name: "Read a class per row",
        body: "Furniture, office equipment, software, computers. Each shows cost at the start, anything added, cost at the end, then the same three columns for depreciation, and the written-down value.",
      },
      {
        name: "Check the rate",
        body: "Each class depreciates at its own annual rate, shown on the row.",
      },
      {
        name: "Tie it to the balance sheet",
        body: "The written-down value total must equal the fixed asset figure on the Statement of Financial Position. The page refuses to produce a schedule that does not.",
      },
    ],
    scenario: {
      title: "Confirming the balance sheet's equipment figure",
      steps: [
        "Read the written-down value total at the bottom of the schedule.",
        "Open the Statement of Financial Position for the same period.",
        "The two figures are the same one, shown two ways.",
      ],
    },
    watchFor: [
      "Depreciation postings are not built yet. Until they are, the depreciation columns show only what has been entered by hand, and the schedule will look emptier than the asset register suggests.",
    ],
  },

  "statements/policy-notes": {
    title: "Policy notes",
    lede: "The written notes at the front of the accounts — how the company reports, not what it earned.",
    step: "report",
    does: [
      {
        name: "Read and edit the notes",
        body: "Basis of preparation, how revenue is recognised, how assets are depreciated, and so on. These are typed once and changed rarely.",
      },
      {
        name: "Add a note",
        body: "Give it a reference number, a title and its text. The reference decides where it appears in the sequence.",
      },
      {
        name: "Reorder them",
        body: "The sort order controls the printed sequence when two notes share a reference.",
      },
      {
        name: "Delete a note",
        body: "For a policy that no longer applies.",
      },
    ],
    scenario: {
      title: "The depreciation policy changes",
      steps: [
        "Open the note describing how fixed assets are depreciated.",
        "Edit the text to describe the new method and rates.",
        "It appears in the next PDF, in the same position, without anybody re-typing the whole set.",
      ],
    },
    watchFor: [
      "These are the only figures-free part of the accounts, and the only part somebody writes rather than computes. Nothing here is checked against the ledger, so what it says is your responsibility.",
    ],
  },

  // ── Where money enters the ledger ─────────────────────────────────────────
  payroll: {
    title: "Payroll",
    lede: "Where the largest number in the accounts comes from — and it posts to the ledger twice.",
    step: "record",
    does: [
      {
        name: "Process a run",
        body: "Builds a payslip per employee from their salary structure and the month's attendance. Nothing has posted yet and nothing has been paid.",
        roles: ["FINANCE_OFFICER", "SUPER_ADMIN"],
      },
      {
        name: "Approve it",
        body: "A named person signs it off, and at that moment the cost hits the books: every salary head is charged to an expense account, deductions and net pay are recorded as owed.",
        roles: ["SUPER_ADMIN"],
      },
      {
        name: "Disburse it",
        body: "The money actually leaves. A second entry clears what was owed against the bank.",
        roles: ["FINANCE_OFFICER", "SUPER_ADMIN"],
      },
    ],
    scenario: {
      title: "July payroll, from processing to the ledger",
      steps: [
        "Process the run on the 28th. Read the preview.",
        "Approve on the 29th — the July accounts now carry the cost, whether or not anybody has been paid.",
        "Disburse on the 1st. The bank balance drops and salary payable clears to zero.",
        "Check the salary payable account in the general ledger: it should end at zero.",
      ],
    },
    watchFor: [
      "Approval is a one-way door. After it, corrections are a fresh adjustment, not an edit — because the ledger has already been told.",
      "If the accounting month is closed, disbursement is refused and the run stays approved. Nothing is half-done.",
    ],
  },

  expenses: {
    title: "Expenses",
    lede: "Employee claims — approved, posted as a cost, then cleared when the money is paid.",
    step: "record",
    does: [
      {
        name: "Review and approve a claim",
        body: "Approving records the cost against the account its category maps to, and records that the company owes the employee.",
        roles: ["FINANCE_OFFICER", "SUPER_ADMIN"],
      },
      {
        name: "Reimburse",
        body: "Claims are cleared through a payroll run or a final settlement, which is when the debt to the employee is settled.",
      },
      {
        name: "Reject a claim",
        body: "Nothing posts. A rejected claim never touches the ledger.",
        roles: ["FINANCE_OFFICER", "SUPER_ADMIN"],
      },
    ],
    scenario: {
      title: "A travel claim in August, paid in September",
      steps: [
        "The claim is approved on 20 August. August's accounts carry the travel cost from that day.",
        "It is swept into the August payroll run and paid on 1 September.",
        "August shows the cost. September shows the cash leaving. Both are true.",
      ],
    },
  },

  settlements: {
    title: "Settlements",
    lede: "What someone is owed when they leave, and how it reaches the books.",
    step: "record",
    does: [
      {
        name: "Build the settlement",
        body: "Pending salary, gratuity, notice pay, leave encashment and any expense claims still outstanding, less anything being recovered.",
      },
      {
        name: "Approve it",
        body: "Approval posts each head to its own account, so gratuity and notice pay are separable in the accounts rather than hidden inside salaries.",
        roles: ["SUPER_ADMIN"],
      },
      {
        name: "Pay it",
        body: "Payment clears what was owed against the bank.",
        roles: ["FINANCE_OFFICER", "SUPER_ADMIN"],
      },
    ],
    scenario: {
      title: "An employee leaves owing for a laptop",
      steps: [
        "Build the settlement. Each head is listed separately.",
        "Enter the recovery so the final figure is net of it.",
        "Approve. The accounts show the full cost of each head and the recovery against it.",
        "Pay. The bank moves by the net figure.",
      ],
    },
  },

  costs: {
    title: "Operating costs",
    lede: "Rent, electricity, internet, cleaning — the running bills, entered here and posted to the ledger.",
    step: "record",
    does: [
      {
        name: "Record a bill",
        body: "Which category, who it is payable to, the amount, and the month it relates to. Entering it records the cost and records that the supplier is owed.",
        roles: ["FINANCE_OFFICER", "SUPER_ADMIN"],
      },
      {
        name: "Pay it",
        body: "A second entry clears the supplier and moves the bank.",
        roles: ["FINANCE_OFFICER", "SUPER_ADMIN"],
      },
      {
        name: "Track a commitment",
        body: "A recurring bill — monthly rent, say — so the system can tell you when one has not arrived.",
        roles: ["FINANCE_OFFICER", "SUPER_ADMIN"],
      },
      {
        name: "Import in bulk",
        body: "A spreadsheet of bills, with a preview that writes nothing until you accept it.",
        roles: ["FINANCE_OFFICER", "SUPER_ADMIN"],
      },
    ],
    scenario: {
      title: "July's electricity bill arrives on 5 August",
      steps: [
        "Record it against July as the period it relates to.",
        "The ledger entry is dated when you entered it, not July — otherwise a closed July would refuse it every month.",
        "The period on the bill still reports it as a July cost.",
        "Pay it, and the supplier balance clears.",
      ],
    },
    watchFor: [
      "Bills in foreign currency are refused. Operating costs do not freeze an exchange rate, and converting the bill and the payment at different rates would leave a residue on the supplier account that never clears. Record it in taka.",
    ],
  },
}

const ROLE_SEGMENTS = new Set(["admin", "finance", "hr", "manager", "employee"])

/**
 * The same page exists under several role prefixes, so the first segment is
 * dropped and the rest matched longest-first. A journal detail page has no
 * entry of its own and falls back to the register's, which is the right answer
 * rather than a missing one.
 *
 * Returns null for every page outside the accounting section, and the trigger
 * hides itself when it does — a help button that opens an apology is worse
 * than no help button.
 */
export function helpKeyFor(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean)
  if (parts.length > 0 && ROLE_SEGMENTS.has(parts[0])) parts.shift()

  for (let i = parts.length; i > 0; i--) {
    const key = parts.slice(0, i).join("/")
    if (key in HELP) return key
  }
  return null
}
