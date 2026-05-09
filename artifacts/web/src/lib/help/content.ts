import type { HelpCategory, HelpTopic } from "./types";

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: "getting-started",
    title: "Getting started",
    description: "What Healthtrix Expense is, how reports flow, and how to sign in.",
    topicIds: ["what-is", "lifecycle", "roles-overview", "signing-in"],
  },
  {
    id: "employees",
    title: "For employees",
    description: "Create reports, capture receipts, and submit for approval.",
    topicIds: [
      "dashboard",
      "create-report",
      "add-line-items",
      "upload-receipts",
      "attach-receipts",
      "report-tags",
      "submit-report",
      "changes-requested",
      "report-status-timeline",
    ],
  },
  {
    id: "managers",
    title: "For managers",
    description: "Approve, request changes, batch-approve, and act as a delegate.",
    topicIds: [
      "manager-queue",
      "manager-review",
      "batch-approve",
      "manager-delegate",
      "mobile-approval",
    ],
  },
  {
    id: "finance",
    title: "For finance & accounting admins",
    description: "Finance review, posting to QuickBooks, payroll batches, and reconciliation.",
    topicIds: [
      "finance-queue",
      "gl-preview",
      "post-qbo",
      "sync-errors",
      "payroll-batch",
      "mark-paid",
      "reconcile",
    ],
  },
  {
    id: "admin",
    title: "For system admins",
    description: "Users, roles, GL mappings, policy, QuickBooks, delegations, and audit log.",
    topicIds: [
      "admin-users",
      "admin-gl",
      "admin-gl-mapping-picker",
      "admin-policy",
      "admin-qbo",
      "admin-qbo-config",
      "admin-qbo-oauth",
      "admin-qbo-health",
      "admin-qbo-tags",
      "admin-qbo-posting-history",
      "admin-delegations",
      "admin-audit",
      "admin-backup-restore",
    ],
  },
  {
    id: "reports-analytics",
    title: "Reports & analytics",
    description: "Spend dashboards and how to filter them.",
    topicIds: ["reports-analytics"],
  },
  {
    id: "reference",
    title: "Reference",
    description: "Status glossary, role glossary, workflow diagram, and policy reference.",
    topicIds: ["status-glossary", "role-glossary", "workflow-diagram", "policy-reference"],
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    description: "Common issues and fixes per role.",
    topicIds: ["troubleshooting"],
  },
  {
    id: "faq",
    title: "FAQ",
    description: "Short answers to common cross-role questions.",
    topicIds: ["faq"],
  },
];

export const HELP_TOPICS: HelpTopic[] = [
  // ---------------- Getting started ----------------
  {
    id: "what-is",
    category: "getting-started",
    title: "What is Healthtrix Expense?",
    summary:
      "An end-to-end expense workflow: capture, approve, post to QuickBooks, reimburse via payroll, and reconcile.",
    blocks: [
      {
        type: "p",
        text:
          "Healthtrix Expense is the company's internal tool for submitting and processing employee expenses. Employees draft reports on web or mobile, attach receipts, and submit them for approval. Reports move through manager and finance approval, get posted to QuickBooks, are reimbursed through payroll, and are finally reconciled — all in one auditable workflow.",
      },
      {
        type: "h",
        text: "Two surfaces, one system",
      },
      {
        type: "ul",
        items: [
          "Web app — full feature set: drafting, approvals, finance, payroll, reconciliation, reports, and admin.",
          "Mobile app — capture receipts on the go, draft and submit reports, and approve as a manager from your phone.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        title: "Single source of truth",
        text:
          "Both apps talk to the same backend. Anything you do on web is reflected on mobile and vice versa.",
      },
    ],
    related: ["lifecycle", "roles-overview", "signing-in"],
    keywords: ["overview", "introduction", "about"],
  },
  {
    id: "lifecycle",
    category: "getting-started",
    title: "End-to-end lifecycle of a report",
    summary: "From Draft to Reconciled — the full path a report can travel.",
    blocks: [
      {
        type: "p",
        text:
          "Every expense report progresses through a defined set of statuses. The chart below shows the happy path; rejection, recall, and void can short-circuit it from many states.",
      },
      {
        type: "ol",
        items: [
          "Draft — the employee adds line items and receipts.",
          "Submitted — the report is sent to the assigned manager.",
          "Manager Review — the manager has the report open.",
          "Manager Approved — the manager has approved; the finance queue picks it up.",
          "Finance Review — finance is looking at the report.",
          "Finance Approved — finance has approved; ready to post to QuickBooks.",
          "Posted to QuickBooks — the GL entry has been written.",
          "Ready for Payroll Reimbursement — added to a payroll batch.",
          "Paid Through Payroll — the batch has been paid.",
          "Reconciled — actuals have been entered and the report is closed.",
        ],
      },
      {
        type: "h",
        text: "Off-ramps",
      },
      {
        type: "ul",
        items: [
          "Changes Requested — manager sends the report back to the employee for edits.",
          "Rejected — manager or finance rejects the report; it ends here.",
          "Sync Error — the QuickBooks post failed and finance can retry.",
          "Voided — the report is cancelled and removed from active workflow.",
        ],
      },
    ],
    related: ["status-glossary", "workflow-diagram"],
  },
  {
    id: "roles-overview",
    category: "getting-started",
    title: "Roles at a glance",
    summary:
      "Five roles cover the entire workflow. A user can hold more than one role at the same time.",
    blocks: [
      {
        type: "kv",
        rows: [
          { k: "Employee", v: "Drafts, submits, recalls, and views their own reports." },
          { k: "Manager Approver", v: "Reviews their team's reports — approve, request changes, or reject." },
          { k: "Finance Approver", v: "Finance review, post to QuickBooks, build payroll batches, mark paid, reconcile." },
          { k: "Accounting Admin", v: "Everything Finance Approver does, plus voiding non-paid reports and managing delegations." },
          { k: "System Admin", v: "Full control: users, roles, GL mappings, policy, QuickBooks connection, audit log." },
        ],
      },
      {
        type: "callout",
        tone: "info",
        title: "Multi-role users",
        text:
          "Many people wear more than one hat. A finance approver can also submit their own reports. A system admin who is also marked as employee will see the employee experience too.",
      },
    ],
    related: ["role-glossary", "admin-users"],
  },
  {
    id: "signing-in",
    category: "getting-started",
    title: "How to sign in",
    summary: "Use your Healthtrix work email and password on web or mobile.",
    blocks: [
      {
        type: "h",
        text: "Web",
      },
      {
        type: "ol",
        items: [
          "Open the Healthtrix Expense web app.",
          "Enter your work email and password.",
          "Click Sign in. You'll land on your dashboard.",
        ],
      },
      {
        type: "h",
        text: "Mobile",
      },
      {
        type: "ol",
        items: [
          "Open the Healthtrix Expense app on your phone.",
          "Enter your work email and password.",
          "Tap Sign in. You'll land on the Reports tab (Approvals tab if you're a manager).",
        ],
      },
      {
        type: "callout",
        tone: "info",
        title: "First-time setup",
        text:
          "On a brand-new install, the very first sign-in screen shows 'Create the System Admin'. That bootstraps the organization and the first system admin account.",
      },
    ],
    related: ["dashboard"],
  },

  // ---------------- Employees ----------------
  {
    id: "dashboard",
    category: "employees",
    title: "Your dashboard",
    summary: "A snapshot of your open work, pending approvals, and reimbursements year-to-date.",
    roles: ["Employee"],
    whoCanDo: "Anyone signed in",
    blocks: [
      {
        type: "p",
        text:
          "The dashboard is your home screen on web. It shows three counters and a list of recent reports.",
      },
      {
        type: "kv",
        rows: [
          { k: "Open Reports", v: "Reports in Draft or Changes Requested — these need your action." },
          { k: "Pending Approvals", v: "Reports in any approval or processing state, waiting on someone else." },
          { k: "Reimbursed YTD", v: "Total of reports Paid Through Payroll or Reconciled in the current year." },
        ],
      },
      {
        type: "h",
        text: "Quick actions",
      },
      {
        type: "ul",
        items: [
          "New Report — jump straight to the create form.",
          "Review Approvals Queue — appears if you're also a Manager Approver or Finance Approver.",
        ],
      },
    ],
    related: ["create-report", "submit-report"],
  },
  {
    id: "create-report",
    category: "employees",
    title: "Creating a report",
    summary: "Start a new draft to group related expenses, then add line items and receipts.",
    roles: ["Employee"],
    whoCanDo: "Anyone marked as an employee",
    blocks: [
      {
        type: "ol",
        items: [
          "From the sidebar, click My reports → New Report (or use the dashboard quick action).",
          "Give the report a clear Title (e.g. 'Q3 Sales Trip — Chicago').",
          "Optionally add a Description and the Period start/end dates.",
          "Pick a Department. This drives GL coding and is required.",
          "Click Create Report. You'll land on the new report's detail page in Draft status.",
        ],
      },
      {
        type: "callout",
        tone: "tip",
        title: "Mobile",
        text:
          "On mobile, tap New report from the Reports tab. Same fields, same outcome.",
      },
      {
        type: "callout",
        tone: "warning",
        title: "Unsaved changes",
        text:
          "If you start typing and try to leave the page, you'll be prompted to confirm — your draft form fields will be lost if you leave without creating.",
      },
    ],
    related: ["add-line-items", "upload-receipts", "submit-report"],
  },
  {
    id: "add-line-items",
    category: "employees",
    title: "Adding line items",
    summary: "One line per expense: date, merchant, category, payment method, and amount.",
    roles: ["Employee"],
    whoCanDo: "The report owner, while the report is Draft or Changes Requested",
    blocks: [
      {
        type: "ol",
        items: [
          "Open the report and click Add Line Item (top right of the Line Items card).",
          "Pick the date the expense occurred. It can't be in the future.",
          "Enter the Merchant — who you paid.",
          "Pick a Category. The category determines the QuickBooks GL account.",
          "Enter the Amount in dollars (up to 2 decimals).",
          "Choose a Payment Method: Personal Card (reimbursable), Company Card, or Cash.",
          "Optionally add a Business Purpose to help reviewers.",
          "Click Save Line Item. You'll return to the report.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        title: "Receipts policy",
        text:
          "Receipts are required for any line item over $75. You can attach the receipt now or upload it later from the Receipts page.",
      },
    ],
    related: ["upload-receipts", "attach-receipts", "policy-reference"],
  },
  {
    id: "upload-receipts",
    category: "employees",
    title: "Capturing and uploading receipts",
    summary: "Upload images and PDFs from the web, or snap photos in the mobile app.",
    roles: ["Employee"],
    whoCanDo: "The report owner, while the report is Draft or Changes Requested",
    blocks: [
      {
        type: "h",
        text: "Web — upload from your computer",
      },
      {
        type: "ol",
        items: [
          "Open the report and click Manage Receipts.",
          "Drop files onto the upload card, click to browse, or paste a screenshot anywhere on the page (Cmd/Ctrl+V).",
          "Each file uploads with a progress indicator. JPG, PNG, WEBP, or PDF up to 10MB.",
          "Uploaded files appear under Unattached receipts until you assign them to a line.",
        ],
      },
      {
        type: "h",
        text: "Mobile — capture in the app",
      },
      {
        type: "ol",
        items: [
          "From a report, tap Capture receipt (or use the camera icon while adding a line).",
          "Take a photo, pick from your library, or attach a PDF.",
          "Decide whether each receipt belongs in the report inbox or to a specific line item.",
          "Tap Upload. You can leave the screen — failed uploads will retry when you return.",
        ],
      },
      {
        type: "callout",
        tone: "warning",
        title: "Camera permission denied?",
        text:
          "If you blocked camera access by accident, open your phone's Settings → Healthtrix Expense → Camera and turn it back on.",
      },
    ],
    related: ["attach-receipts", "policy-reference"],
  },
  {
    id: "attach-receipts",
    category: "employees",
    title: "Attaching receipts to lines",
    summary: "Tie each receipt to a specific line item, or leave it in the report inbox.",
    roles: ["Employee"],
    whoCanDo: "The report owner, while the report is editable",
    blocks: [
      {
        type: "p",
        text:
          "Receipts can live in two places: pinned to a specific line item, or in the report's general inbox (the 'Unattached receipts' section).",
      },
      {
        type: "ol",
        items: [
          "On the Receipts page, find a receipt in Unattached receipts.",
          "Open the 'Attach to line item' dropdown and pick the matching line.",
          "It moves to the Attached by line item section. A green check confirms.",
          "You can attach multiple receipts to the same line item if you have several pieces of paper for one expense.",
        ],
      },
      {
        type: "callout",
        tone: "tip",
        title: "Mobile shortcut",
        text:
          "When you capture receipts from a line's Add Line screen, they're attached to that line automatically.",
      },
    ],
    related: ["upload-receipts", "policy-reference"],
  },
  {
    id: "submit-report",
    category: "employees",
    title: "Submitting, recalling, and voiding",
    summary: "Send a Draft for approval, pull it back if you spot an error, or void if it's no longer needed.",
    roles: ["Employee"],
    whoCanDo: "The report owner",
    blocks: [
      {
        type: "h",
        text: "Submit for approval",
      },
      {
        type: "ol",
        items: [
          "Make sure you have at least one line item. The Submit button is disabled on an empty report.",
          "Click Submit for Approval at the bottom of the report.",
          "The status moves from Draft to Submitted. The next stop is Manager Review.",
        ],
      },
      {
        type: "h",
        text: "Recall to draft",
      },
      {
        type: "p",
        text:
          "If your manager hasn't started the review yet (status is Submitted or Manager Review), you can pull the report back. Click Recall to Draft. You'll be able to edit and resubmit.",
      },
      {
        type: "h",
        text: "Delete or void",
      },
      {
        type: "ul",
        items: [
          "Delete — only available while the report is in Draft and has no approval history. This permanently removes the report.",
          "Void — cancels the report at most pre-payment statuses. The report stays in the system marked as Voided so the audit trail is preserved.",
        ],
      },
    ],
    related: ["changes-requested", "report-status-timeline"],
  },
  {
    id: "changes-requested",
    category: "employees",
    title: "Handling 'Changes Requested'",
    summary: "Your manager wants edits before approval. Update and resubmit.",
    roles: ["Employee"],
    blocks: [
      {
        type: "p",
        text:
          "When a manager sends a report back, its status becomes Changes Requested. The report becomes editable again, and the manager's comment appears in the activity timeline.",
      },
      {
        type: "ol",
        items: [
          "Open the report from My reports.",
          "Read the latest entry in the audit log to see what the manager asked for.",
          "Make the changes — edit lines, swap receipts, fix categories.",
          "Click Submit for Approval again. The status returns to Submitted.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        title: "Same approver",
        text:
          "By default the report goes back to the same manager. Delegations may route it differently if your manager is out.",
      },
    ],
    related: ["submit-report", "manager-review"],
  },
  {
    id: "report-status-timeline",
    category: "employees",
    title: "Reading status and the activity timeline",
    summary: "Status pills, the workflow tracker, and the audit log all tell you where a report stands.",
    blocks: [
      {
        type: "ul",
        items: [
          "Status pill — the colored badge next to the report code shows the current state in one word.",
          "Workflow Status — the tracker on the report's right sidebar lights up the stage you're at.",
          "Audit Log — chronological list of every status change, with the actor, timestamp, and any comment.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        title: "Always check the audit log",
        text:
          "Reasons for rejection, change requests, and sync errors are all stored as comments on transitions. The audit log is the source of truth.",
      },
    ],
    related: ["status-glossary"],
  },

  // ---------------- Managers ----------------
  {
    id: "manager-queue",
    category: "managers",
    title: "The manager queue",
    summary: "Reports from your team waiting on your review.",
    roles: ["Manager Approver"],
    whoCanDo: "Manager Approvers (and any active delegate covering for one)",
    blocks: [
      {
        type: "ol",
        items: [
          "Open Manager → Approval queue from the sidebar.",
          "Reports from your direct reports appear here, sorted by aging.",
          "Use the search box to filter by employee, title, or report code.",
          "Use the Age dropdown to focus on stale reports (>7 days).",
        ],
      },
      {
        type: "h",
        text: "What the columns mean",
      },
      {
        type: "kv",
        rows: [
          { k: "Code", v: "The short ID for the report (e.g. ER-1023)." },
          { k: "Aging", v: "How long the report has sat in the queue. Red after 7 days." },
          { k: "Status", v: "Submitted or Manager Review — both are actionable." },
          { k: "Total", v: "Sum of all line items on the report." },
        ],
      },
    ],
    related: ["manager-review", "batch-approve", "manager-delegate"],
  },
  {
    id: "manager-review",
    category: "managers",
    title: "Approve, request changes, or reject",
    summary: "Open a report and decide its next move.",
    roles: ["Manager Approver"],
    whoCanDo: "Manager Approver, Accounting Admin, System Admin (or active delegate)",
    blocks: [
      {
        type: "ol",
        items: [
          "From the queue, click a report title to open it.",
          "Review the line items, categories, and attached receipts.",
          "Pick one of three actions at the bottom of the page:",
        ],
      },
      {
        type: "kv",
        rows: [
          { k: "Approve Report", v: "Sends to Finance Review. No comment required." },
          { k: "Request Changes", v: "Returns to the employee as Changes Requested. A comment is required." },
          { k: "Reject", v: "Ends the workflow. The report is closed as Rejected. A reason is required." },
        ],
      },
      {
        type: "callout",
        tone: "warning",
        title: "Reject is final",
        text:
          "Once a report is Rejected, it can't be re-opened. Use Request Changes if you just need edits.",
      },
    ],
    related: ["manager-queue", "batch-approve", "changes-requested"],
  },
  {
    id: "batch-approve",
    category: "managers",
    title: "Batch approving",
    summary: "Approve several reports at once when they're all clean.",
    roles: ["Manager Approver"],
    blocks: [
      {
        type: "ol",
        items: [
          "On the manager queue, tick the checkbox on each report you want to approve.",
          "A bar appears at the top showing the count and total dollar value selected.",
          "Click Approve N. Each report is approved one at a time and the queue refreshes.",
        ],
      },
      {
        type: "callout",
        tone: "tip",
        title: "Use the header checkbox",
        text:
          "The checkbox in the header row toggles all currently filtered rows on or off — combine it with search and aging filters to scope your batch.",
      },
      {
        type: "callout",
        tone: "warning",
        title: "Inspect first",
        text:
          "Batch approve trusts your judgment. Open any report you're not 100% sure about before ticking it.",
      },
    ],
    related: ["manager-queue", "manager-review"],
  },
  {
    id: "manager-delegate",
    category: "managers",
    title: "Working as a delegate",
    summary: "Cover for another manager while they're out.",
    roles: ["Manager Approver"],
    blocks: [
      {
        type: "p",
        text:
          "When a system or accounting admin sets up a delegation, the delegate sees the original manager's queue mixed into their own for the date range of the delegation.",
      },
      {
        type: "ul",
        items: [
          "Active delegations route incoming reports to you, the delegate.",
          "You can approve, request changes, or reject just like any other manager.",
          "Audit log entries record both your name and the role you acted under.",
        ],
      },
    ],
    related: ["admin-delegations"],
  },
  {
    id: "mobile-approval",
    category: "managers",
    title: "Approving on mobile",
    summary: "Open the Approvals tab and act from your phone.",
    roles: ["Manager Approver"],
    blocks: [
      {
        type: "ol",
        items: [
          "Open the mobile app and tap the Approvals tab (visible to managers).",
          "Reports awaiting your review are listed with status, total, and aging.",
          "Use the sort chips to order by Oldest, Newest, or Amount.",
          "Tap a report to see line items and receipts.",
          "Tap Approve, Request Changes, or Reject. Comments are required for the last two.",
        ],
      },
      {
        type: "callout",
        tone: "tip",
        title: "Pull to refresh",
        text: "Drag the list down to refresh — useful when you've just received a notification.",
      },
    ],
    related: ["manager-queue", "manager-review"],
  },

  // ---------------- Finance ----------------
  {
    id: "finance-queue",
    category: "finance",
    title: "The finance queue",
    summary: "Manager-approved reports waiting on finance review.",
    roles: ["Finance Approver", "Accounting Admin"],
    blocks: [
      {
        type: "ol",
        items: [
          "Open Finance → Finance queue from the sidebar.",
          "Reports in Manager Approved, Finance Review, Finance Approved, Posted to QuickBooks, and Sync Error all appear here.",
          "Use the Status filter to focus, and the Age filter to find stale work.",
          "Click a report title to open the finance review screen.",
        ],
      },
    ],
    related: ["gl-preview", "post-qbo", "sync-errors"],
  },
  {
    id: "gl-preview",
    category: "finance",
    title: "GL preview, finance approve, finance reject",
    summary: "Inspect the GL coding before approving and posting.",
    roles: ["Finance Approver", "Accounting Admin"],
    blocks: [
      {
        type: "p",
        text:
          "On the finance review screen, the GL preview panel shows how each line will hit the general ledger — debits, credits, and which QuickBooks account they'll land in based on the category and department.",
      },
      {
        type: "ol",
        items: [
          "Open the report from the finance queue.",
          "Confirm the line items, receipts, and the GL preview look correct.",
          "Click Finance Approve to advance to Finance Approved (next stop: post to QuickBooks).",
          "Click Reject if something is wrong with the report itself; a reason is required.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        title: "If GL coding looks wrong",
        text:
          "The GL account is derived from the category + department mapping in Admin → Departments & GL. Fix the mapping there if a lot of reports keep arriving with the wrong account.",
      },
    ],
    related: ["finance-queue", "post-qbo", "admin-gl"],
  },
  {
    id: "post-qbo",
    category: "finance",
    title: "Posting to QuickBooks",
    summary: "Push a Finance Approved report into QuickBooks Online.",
    roles: ["Finance Approver", "Accounting Admin"],
    blocks: [
      {
        type: "ol",
        items: [
          "Open a Finance Approved report.",
          "Click Post to QuickBooks. A confirmation dialog summarises the GL entry.",
          "Click Confirm & Post. We make the API call to QuickBooks.",
          "On success the status moves to Posted to QuickBooks. On failure it moves to Sync Error.",
        ],
      },
      {
        type: "callout",
        tone: "warning",
        title: "Posting is one-way",
        text:
          "Once posted, you can't 'unpost' from this app. Reversing the entry has to happen in QuickBooks.",
      },
    ],
    related: ["sync-errors", "gl-preview", "admin-qbo"],
  },
  {
    id: "sync-errors",
    category: "finance",
    title: "Handling sync errors and retrying",
    summary: "When QuickBooks posting fails, fix the cause and retry.",
    roles: ["Finance Approver", "Accounting Admin"],
    blocks: [
      {
        type: "p",
        text:
          "A Sync Error means we sent the report to QuickBooks but QuickBooks rejected it. The error message is stored in the audit log on the failing transition.",
      },
      {
        type: "ol",
        items: [
          "Open the report from the finance queue (or filter by Sync Error).",
          "Read the error message in the audit log.",
          "Common causes: stale QuickBooks token (reconnect under Admin → QuickBooks), missing GL account, period closed in QBO.",
          "Once the underlying issue is resolved, click Retry QBO Sync. On success the status moves to Posted to QuickBooks.",
        ],
      },
    ],
    related: ["post-qbo", "admin-qbo"],
  },
  {
    id: "payroll-batch",
    category: "finance",
    title: "Building payroll batches",
    summary: "Group reimbursable reports into a batch for payroll.",
    roles: ["Finance Approver", "Accounting Admin"],
    blocks: [
      {
        type: "ol",
        items: [
          "Open Finance → Payroll batches.",
          "On the Queue tab, you'll see reports in Ready for Payroll Reimbursement.",
          "Click Create Payroll Batch. The current queue is swept into a new batch.",
          "Switch to the Batches tab to see the new batch listed as Pending Payment.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        title: "What gets included",
        text:
          "Only reports that are Ready for Payroll Reimbursement are eligible. Reports paid via company card never enter this queue.",
      },
    ],
    related: ["mark-paid", "reconcile"],
  },
  {
    id: "mark-paid",
    category: "finance",
    title: "Marking a batch paid",
    summary: "Once payroll has actually paid out, record it.",
    roles: ["Finance Approver", "Accounting Admin"],
    blocks: [
      {
        type: "ol",
        items: [
          "On the Batches tab, find the batch you want to close.",
          "Click Mark Paid.",
          "The batch moves from Pending Payment to Paid {date}, and each report inside moves to Paid Through Payroll.",
          "Click Reconcile on the batch row to start reconciliation.",
        ],
      },
    ],
    related: ["payroll-batch", "reconcile"],
  },
  {
    id: "reconcile",
    category: "finance",
    title: "Reconciliation",
    summary: "Confirm actuals match approved amounts and close out reports.",
    roles: ["Finance Approver", "Accounting Admin"],
    blocks: [
      {
        type: "ol",
        items: [
          "Open Finance → Reconciliation.",
          "Pick a paid batch from the dropdown. Only batches with Mark Paid set are reconcilable.",
          "For each report row, enter Paid On (date) and Actual amount.",
          "Click Submit Reconciliation. Each report moves to Reconciled.",
        ],
      },
      {
        type: "callout",
        tone: "warning",
        title: "Mark Paid first",
        text:
          "If you see 'Mark this batch as Paid before reconciling', go back to Payroll batches and click Mark Paid on the batch first.",
      },
    ],
    related: ["mark-paid", "payroll-batch"],
  },

  // ---------------- Admin ----------------
  {
    id: "admin-users",
    category: "admin",
    title: "Managing users (multi-role)",
    summary: "Add, edit, activate, and deactivate users. Roles can be combined per user.",
    roles: ["System Admin"],
    blocks: [
      {
        type: "ol",
        items: [
          "Open Admin → Users.",
          "Click Add User. Provide full name, email, password, one or more roles, department, and an optional manager.",
          "To edit, click the edit icon on a row. You can change roles, department, manager, and active status.",
          "To deactivate, click the red person-with-X icon. An in-app confirmation appears — confirm to disable sign-in for that user.",
          "To re-activate someone you turned off earlier, click the green person-with-check icon on their (greyed-out) row and confirm.",
        ],
      },
      {
        type: "p",
        text:
          "Active vs inactive: only active users can sign in. Inactive users still appear in the Users list (rendered greyed-out with an Inactive badge) so you can audit them or reactivate them later. Their existing roles, manager, and department assignments are preserved across the toggle. You cannot deactivate yourself — the deactivate button is disabled on your own row to prevent locking the org out of admin access.",
      },
      {
        type: "callout",
        tone: "info",
        title: "Multi-role rules",
        text:
          "A user must have at least one role. Some role combinations are blocked to prevent invalid setups (for example, certain pure-employee combinations).",
      },
      {
        type: "callout",
        tone: "tip",
        title: "Also employee",
        text:
          "Mark managers, finance, and admins as 'also employee' if they need to submit their own expense reports.",
      },
    ],
    related: ["role-glossary"],
  },
  {
    id: "admin-gl",
    category: "admin",
    title: "GL mappings",
    summary: "Decide which QuickBooks account each category/department combination posts to.",
    roles: ["System Admin", "Accounting Admin"],
    blocks: [
      {
        type: "ol",
        items: [
          "Open Admin → Departments & GL.",
          "Each row pairs a category and a department with a QuickBooks account ref.",
          "Click the edit icon, then type to search the live QBO Chart of Accounts (when a real connection is configured). Pick an account from the dropdown and click the check icon to save.",
          "If you're in stub mode, the picker falls back to a free-text input — type the account ref by hand.",
          "Use the X icon to cancel an edit without saving.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        title: "Account list refresh",
        text:
          "The QBO account list is cached for 10 minutes. Click Refresh accounts on the GL page to fetch the latest from Intuit if you've added new accounts in QuickBooks.",
      },
      {
        type: "callout",
        tone: "warning",
        title: "Verify in QuickBooks",
        text:
          "The account ref you enter must exist in QuickBooks Online. Wrong refs cause Sync Errors when finance posts.",
      },
    ],
    related: ["sync-errors", "admin-qbo"],
  },
  {
    id: "admin-policy",
    category: "admin",
    title: "Policy rules",
    summary: "Receipt thresholds, max amounts, and category-level rules.",
    roles: ["System Admin", "Accounting Admin"],
    blocks: [
      {
        type: "ol",
        items: [
          "Open Admin → Policy rules.",
          "Each row shows a category, the maximum allowed amount, whether a receipt is required, and whether pre-approval is needed.",
          "Click the edit icon to change the rule's value JSON and description.",
          "Click the check icon to save.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        title: "Why $75?",
        text:
          "The default 'receipts required above $75' rule is the company-wide minimum. You can tighten it per category here.",
      },
    ],
    related: ["policy-reference"],
  },
  {
    id: "admin-qbo",
    category: "admin",
    title: "QuickBooks connection",
    summary: "Configure Intuit credentials, connect via OAuth, and tune posting defaults.",
    roles: ["System Admin", "Accounting Admin"],
    blocks: [
      {
        type: "p",
        text:
          "Healthtrix Expense supports two QuickBooks Online modes: a built-in demo stub (no Intuit account required) for screenshots and walkthroughs, and a real Intuit integration that posts live JournalEntry records and uploads receipt files as Attachables. Real mode requires an Intuit Developer app — you provide the Client ID and Client Secret, choose Sandbox or Production, then complete a one-time OAuth handshake.",
      },
      {
        type: "ol",
        items: [
          "Open Admin → QuickBooks.",
          "Under Configuration, paste your Intuit Client ID + Client Secret and choose Sandbox or Production. Save. The plaintext is encrypted at rest and never echoed back.",
          "Under Connection, click Connect to QuickBooks. A new tab opens for Intuit's OAuth flow; sign in and authorize Healthtrix Expense.",
          "After authorization the browser returns to this page with a green Connected banner and the company name + realm ID.",
          "Open Posting Preferences to set the default payable account, memo template, and whether finance approval should auto-post.",
        ],
      },
      {
        type: "callout",
        tone: "warning",
        title: "Don't disconnect mid-batch",
        text:
          "Disconnecting while reports are mid-post will leave them in Sync Error. Reconnect, then retry from the finance queue.",
      },
      {
        type: "callout",
        tone: "info",
        title: "Demo mode fallback",
        text:
          "If you click Connect demo stub instead of providing Intuit credentials, posting runs entirely in-process — no live QBO calls. The stub is useful for trial accounts and product demos.",
      },
    ],
    related: ["admin-qbo-oauth", "admin-qbo-tags", "admin-qbo-posting-history", "admin-gl", "post-qbo", "sync-errors"],
  },
  {
    id: "admin-qbo-oauth",
    category: "admin",
    title: "Intuit OAuth setup (real mode)",
    summary: "Register your Intuit Developer app and configure the redirect URI Healthtrix Expense expects.",
    roles: ["System Admin", "Accounting Admin"],
    blocks: [
      {
        type: "ol",
        items: [
          "Sign in to developer.intuit.com and create or open your app.",
          "Under Keys & OAuth, copy the Client ID and Client Secret for the environment you plan to use (Sandbox or Production).",
          "Add the Healthtrix Expense callback URL to the Redirect URIs list. The exact URL is shown on the QuickBooks admin page once you've saved credentials; it ends in /api/admin/qbo-connection/oauth/callback.",
          "Back in Healthtrix Expense, paste Client ID, Client Secret, choose the matching environment, and Save.",
          "Click Connect to QuickBooks. After Intuit authorization, the browser redirects back with a Connected banner.",
        ],
      },
      {
        type: "callout",
        tone: "warning",
        title: "Sandbox vs Production",
        text:
          "Sandbox credentials only work with Intuit's sandbox companies. Production credentials require Intuit app review. The Environment field on the credentials card must match the credentials you paste in.",
      },
      {
        type: "p",
        text:
          "Healthtrix Expense automatically refreshes Intuit access tokens in the background every 15 minutes. You can also force a refresh from the Connection card. If the refresh token expires (after 100 days of inactivity, or if you revoke it on the Intuit side), the connection enters Reconnect Required and you'll need to repeat the Connect step.",
      },
    ],
    related: ["admin-qbo", "admin-qbo-posting-history"],
  },
  {
    id: "admin-qbo-tags",
    category: "admin",
    title: "QBO tags",
    summary: "Org-wide labels that ride along with each posted JournalEntry.",
    roles: ["System Admin", "Accounting Admin"],
    blocks: [
      {
        type: "p",
        text:
          "QBO tags let you classify expense reports beyond category and department. Tag values are sent in the JournalEntry's TxnTagList field when posting, so they show up in QuickBooks reports and filters.",
      },
      {
        type: "ol",
        items: [
          "Open Admin → QBO tags to create, rename, recolor, archive, or delete tags.",
          "Open any expense report and use the Tags picker (under the report header) to apply or remove tags.",
          "When the report posts, the active tag names are sent to Intuit. Inactive tags are skipped.",
        ],
      },
    ],
    related: ["admin-qbo", "post-qbo"],
  },
  {
    id: "admin-qbo-posting-history",
    category: "admin",
    title: "QBO posting history",
    summary: "Audit every JournalEntry attempt — successes, failures, and the reason.",
    roles: ["System Admin", "Accounting Admin"],
    blocks: [
      {
        type: "p",
        text:
          "The QuickBooks admin page includes a Posting History panel listing the most recent posting attempts across the org. Each row shows the report, status (Posted or Error), the QBO Journal ID (when posted), the number of receipt attachments uploaded, the tags sent, and the error message (when it failed).",
      },
      {
        type: "ul",
        items: [
          "Successful rows let you click through to the report and into QuickBooks to verify the entry.",
          "Error rows surface Intuit's full error text so you can identify schema, permission, or mapping issues.",
          "Use the Audit Log (Admin → Audit log, filter by category=qbo) to see who triggered each post and connection change.",
        ],
      },
    ],
    related: ["admin-qbo", "post-qbo", "sync-errors"],
  },
  {
    id: "admin-qbo-config",
    category: "admin",
    title: "QBO Configuration card",
    summary: "Where you paste Intuit Client ID/Secret, choose Sandbox vs Production, and rotate credentials.",
    roles: ["System Admin", "Accounting Admin"],
    blocks: [
      {
        type: "p",
        text:
          "The Configuration card on the QuickBooks admin page is the single place where Intuit OAuth credentials live for your org. Both the Client ID and Client Secret are encrypted at rest with AES-256-GCM the moment you click Save — the plaintext is never written to logs and is never echoed back to the browser. Subsequent loads only show a masked preview (last 4 characters of the secret).",
      },
      {
        type: "ol",
        items: [
          "Paste Client ID + Client Secret from your Intuit Developer app.",
          "Choose Sandbox or Production. The environment must match the credentials you pasted — Sandbox secrets only work against Intuit's sandbox companies.",
          "Click Save. The card refreshes with the masked secret preview and shows the canonical OAuth callback URL to copy into the Intuit app config.",
          "To rotate the secret, click Edit, paste the new value, and Save again. Existing OAuth tokens stay valid — you only need to reconnect if Intuit revoked them.",
          "To remove credentials entirely, click Disconnect on the Connection card. That clears the encrypted credentials and forces the org back into stub mode.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        title: "Audit trail",
        text:
          "Every save, environment change, and disconnect writes a 'qbo_config' entry to the Audit Log with diffed fields. Secret values themselves never appear in the audit — only that they changed.",
      },
      {
        type: "h",
        text: "Production redirect URI (QBO_OAUTH_REDIRECT_URI)",
      },
      {
        type: "p",
        text:
          "In a production deployment, the OAuth redirect URI sent to Intuit is NOT auto-derived from the request — it must be set explicitly via the QBO_OAUTH_REDIRECT_URI environment variable. This guarantees the value matches your Intuit app's keys tab byte-for-byte; without it, Intuit rejects the connect flow with 'The redirect_uri query parameter value is invalid'.",
      },
      {
        type: "ol",
        items: [
          "On developer.intuit.com, open your app and go to Keys & OAuth.",
          "Pick the Production keys tab if your org's QBO environment is Production, or the Development keys tab for Sandbox. Intuit checks redirect URIs separately per tab.",
          "Copy the exact URL shown in the 'OAuth redirect URI to register on Intuit' box on this page (it ends in /api/admin/qbo-connection/oauth/callback) into Intuit's Redirect URIs list and save.",
          "On Replit, open your deployment's Secrets and add QBO_OAUTH_REDIRECT_URI with that same exact URL. Redeploy.",
          "Click 'Test configuration' on this page — the 'OAuth redirect URI is resolved' row should pass and show the same string. If it fails, the deployment is missing the env var or the URI doesn't look like a valid public https host.",
        ],
      },
      {
        type: "callout",
        tone: "warning",
        title: "Sandbox vs Production tabs on Intuit",
        text:
          "The Sandbox tab and Production tab on developer.intuit.com each have their own redirect URI list. If you flip the Environment selector above from Sandbox to Production, you must also register the URI on the matching tab — registering it on the wrong tab will still produce the 'invalid redirect_uri' error.",
      },
    ],
    related: ["admin-qbo", "admin-qbo-oauth", "admin-qbo-health", "admin-audit"],
  },
  {
    id: "admin-qbo-health",
    category: "admin",
    title: "QBO Connection health panel",
    summary: "Read connection status, last token refresh, and recover from refresh failures.",
    roles: ["System Admin", "Accounting Admin"],
    blocks: [
      {
        type: "p",
        text:
          "The Health panel surfaces the live state of your Intuit connection so you can spot problems before finance hits Sync Errors. It refreshes every minute and after every manual action.",
      },
      {
        type: "ul",
        items: [
          "Status badge — Connected (green), Refresh Failed (amber), Reconnect Required (red), or Disconnected (gray).",
          "Last successful token refresh timestamp + expiry of the current access token.",
          "Last refresh error (if any), with Intuit's exact error text.",
          "Recent refresh attempts — the last few automatic refresh sweeps and their outcome.",
          "Refresh now button to force a token refresh out of band; useful right before a large posting batch.",
          "Reconnect button (only shown when status is Reconnect Required) that restarts the OAuth flow without wiping your credentials.",
        ],
      },
      {
        type: "callout",
        tone: "warning",
        title: "Reconnect Required",
        text:
          "If Intuit's refresh token expires (100 days of inactivity, or you revoked the app on Intuit's side), the panel switches to Reconnect Required. Click Reconnect and complete OAuth again — credentials are preserved, only the tokens are re-issued.",
      },
    ],
    related: ["admin-qbo", "admin-qbo-config", "admin-qbo-oauth", "admin-qbo-posting-history"],
  },
  {
    id: "admin-gl-mapping-picker",
    category: "admin",
    title: "GL mapping account picker",
    summary: "How the typeahead picker works against the live QBO Chart of Accounts and what the Inactive warning means.",
    roles: ["System Admin", "Accounting Admin"],
    blocks: [
      {
        type: "p",
        text:
          "When the org is real-connected to QuickBooks, the GL mapping page replaces the free-text account field with a typeahead picker backed by the live Chart of Accounts. Pasting an arbitrary string is no longer possible — the only way to set an account is to pick one from the dropdown, which guarantees the AccountRef.value sent at posting time is a real QBO account ID.",
      },
      {
        type: "ol",
        items: [
          "Click the pencil icon on a mapping row to enter edit mode.",
          "Start typing in the QuickBooks account field. Matches from the org's COA (cached for ~10 minutes) appear below the input.",
          "Inactive accounts in the dropdown show an amber 'Inactive' badge and are dimmed. You can still pick one, but JournalEntry posting will fail until the account is re-activated in QBO.",
          "Pick a row. The mapping captures the account name, account ID, and account type so finance previews and the JournalEntry payload stay consistent.",
          "Click the check icon to save, or the X icon to cancel.",
        ],
      },
      {
        type: "callout",
        tone: "warning",
        title: "Inactive mapping warning",
        text:
          "If a saved mapping points at an account that has since been deactivated (or deleted) in QuickBooks, the row shows an amber 'Inactive' badge in display mode. Re-edit the row and pick a replacement before finance tries to post against this category/department.",
      },
      {
        type: "callout",
        tone: "info",
        title: "Stub mode fallback",
        text:
          "In demo/stub mode the typeahead is replaced by a free-text input. Type any account ref string — the stub will accept it. Once you flip to real mode, you'll need to re-pick mappings from the live picker.",
      },
    ],
    related: ["admin-gl", "admin-qbo", "admin-qbo-config", "sync-errors"],
  },
  {
    id: "report-tags",
    category: "employees",
    title: "Tagging an expense report",
    summary: "Apply org-wide QBO tags to your reports so finance can group them in QuickBooks.",
    roles: ["Employee", "Manager Approver", "Finance Approver", "Accounting Admin", "System Admin"],
    blocks: [
      {
        type: "p",
        text:
          "QBO tags are org-wide labels (configured by your admin) that travel with each report when it posts to QuickBooks. Tagging is optional, but useful when finance wants to group spend by project, client, or initiative inside QBO reports.",
      },
      {
        type: "ol",
        items: [
          "Open any of your expense reports.",
          "Find the Tags row near the top of the report.",
          "Click Add tag to pick from the active tag list. Click an applied tag's X to remove it.",
          "Tag changes save instantly and don't require re-submitting the report. They're allowed up until the report is posted to QuickBooks.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        title: "Who can edit tags",
        text:
          "Owners can tag their own reports during the edit window (Draft / Changes Requested). Managers can tag any report assigned to them. Finance and admins can tag any report. After a report posts to QBO, tags become read-only.",
      },
    ],
    related: ["admin-qbo-tags", "submit-report"],
  },
  {
    id: "admin-delegations",
    category: "admin",
    title: "Approver delegations",
    summary: "Cover for managers who are out, with explicit start and end dates.",
    roles: ["System Admin", "Accounting Admin"],
    blocks: [
      {
        type: "ol",
        items: [
          "Open Manager → Delegation (or, on mobile, Profile → Approval delegation if you're a system admin).",
          "Pick the manager you're delegating from and the manager you're delegating to.",
          "Set a start and end date.",
          "Click Create. The delegation is Active during the date range.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        title: "Revoking",
        text:
          "Click the trash icon on a delegation row to revoke it early. Confirm in the prompt.",
      },
    ],
    related: ["manager-delegate"],
  },
  {
    id: "admin-audit",
    category: "admin",
    title: "Audit log",
    summary: "Every status change in the system, with who did what and when.",
    roles: ["System Admin"],
    blocks: [
      {
        type: "ul",
        items: [
          "Open Admin → Audit log.",
          "Each row shows timestamp, actor, from-status, to-status, and the report ID.",
          "Click a row to expand the JSON metadata for that transition.",
          "Use this to trace any approval, rejection, posting, or void.",
        ],
      },
    ],
  },
  {
    id: "admin-backup-restore",
    category: "admin",
    title: "Backup & restore",
    summary:
      "Export every record in your org to a single ZIP, or restore a previously-exported backup.",
    roles: ["System Admin"],
    blocks: [
      {
        type: "p",
        text:
          "Backup & restore is a System-Admin-only tool. It lets you take a complete, point-in-time snapshot of everything in your org — departments, GL mappings, policy rules, the QuickBooks connection record, users, expense reports and their line items, audit entries, and payroll batches — and download it as a single .zip file. You can later restore that snapshot back into the same org, replacing whatever is currently there.",
      },
      {
        type: "ol",
        items: [
          "Open Admin → Backup & restore.",
          "Under Export backup, optionally tick 'Also include uploaded receipt image files' (this makes the ZIP much larger).",
          "Click Download backup. The browser will save a file like healthtrix-backup-<timestamp>.zip.",
          "Store the file somewhere safe — anyone who gets it can replicate your org's data.",
        ],
      },
      {
        type: "callout",
        tone: "warning",
        title: "Restore is destructive",
        text:
          "Restoring will permanently delete every record currently in this org and replace it with the contents of the backup. There is no undo from inside the app. Backups can only be restored into the org they were exported from — uploading a backup from a different org is rejected.",
      },
      {
        type: "ol",
        items: [
          "Under Restore from backup, click the file picker and select your .zip file.",
          "Click 'Restore from this file'.",
          "In the confirmation dialog, type RESTORE (in capital letters) into the text field, then click Restore.",
          "After a few seconds you'll see a summary of what was restored, including row counts per table and how many receipt files were re-uploaded.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        title: "Older backup versions",
        text:
          "Backups carry a schema version. If you restore an older backup, the app will run a chain of small upgrade steps in memory to bring it up to the current schema before writing it to the database. You don't need to do anything manually.",
      },
    ],
    related: ["admin-users", "admin-audit"],
  },

  // ---------------- Reports & analytics ----------------
  {
    id: "reports-analytics",
    category: "reports-analytics",
    title: "Reports & analytics",
    summary: "Spend by month and by department, plus high-level totals.",
    blocks: [
      {
        type: "p",
        text:
          "The Reports & analytics view changes depending on your role. Finance, accounting admins, and system admins see company-wide spend; everyone else sees only their own.",
      },
      {
        type: "kv",
        rows: [
          { k: "Total Tracked", v: "Sum of every report you can see, regardless of status." },
          { k: "Pending Processing", v: "Reports between Submitted and Ready for Payroll Reimbursement." },
          { k: "Reimbursed", v: "Reports in Paid Through Payroll or Reconciled." },
          { k: "Spend by Month", v: "Bar chart of totals month over month." },
          { k: "Spend by Department", v: "Pie chart of totals broken out by department." },
        ],
      },
    ],
  },

  // ---------------- Reference ----------------
  {
    id: "status-glossary",
    category: "reference",
    title: "Status glossary",
    summary: "Every status a report can be in, and who can move it.",
    blocks: [
      {
        type: "kv",
        rows: [
          { k: "Draft", v: "Owner is still editing. Owner can submit, void, or delete." },
          { k: "Submitted", v: "Awaiting first manager action. Owner can recall." },
          { k: "Manager Review", v: "Manager has the report open. Owner can still recall." },
          { k: "Manager Approved", v: "Manager has approved; finance queue picks it up." },
          { k: "Changes Requested", v: "Manager sent it back. Owner edits and resubmits." },
          { k: "Finance Review", v: "Finance is reviewing." },
          { k: "Finance Approved", v: "Finance has approved; ready to post to QuickBooks." },
          { k: "Sync Error", v: "QuickBooks rejected the post. Finance can retry." },
          { k: "Posted to QuickBooks", v: "GL entry has been written. Next: ready for payroll." },
          { k: "Ready for Payroll Reimbursement", v: "Eligible to be batched for payroll." },
          { k: "Paid Through Payroll", v: "Payroll has paid the batch out." },
          { k: "Reconciled", v: "Actuals entered and report is closed." },
          { k: "Voided", v: "Cancelled before payment." },
          { k: "Rejected", v: "Closed by manager or finance with a reason." },
        ],
      },
    ],
    related: ["workflow-diagram", "role-glossary"],
  },
  {
    id: "role-glossary",
    category: "reference",
    title: "Role glossary",
    summary: "What each role can do, in one place.",
    blocks: [
      {
        type: "kv",
        rows: [
          { k: "Employee", v: "Create, edit, submit, recall, and void their own reports." },
          { k: "Manager Approver", v: "Approve, request changes, or reject reports from their team." },
          { k: "Finance Approver", v: "Finance approve/reject, post to QuickBooks, retry sync, build payroll batches, mark paid, reconcile." },
          { k: "Accounting Admin", v: "Everything Finance Approver does plus voiding non-paid reports and managing GL/Policy/Delegations." },
          { k: "System Admin", v: "Manage users and roles, all admin pages, view audit log, plus all of the above." },
        ],
      },
    ],
    related: ["status-glossary", "admin-users"],
  },
  {
    id: "workflow-diagram",
    category: "reference",
    title: "Workflow diagram",
    summary: "Status transitions and who triggers each.",
    blocks: [
      {
        type: "diagram",
        nodes: [
          "Draft",
          "Submitted",
          "Manager Review",
          "Changes Requested",
          "Manager Approved",
          "Finance Review",
          "Finance Approved",
          "Sync Error",
          "Posted to QuickBooks",
          "Ready for Payroll Reimbursement",
          "Paid Through Payroll",
          "Reconciled",
          "Rejected",
          "Voided",
        ],
        edges: [
          { from: "Draft", to: "Submitted", label: "submit (owner)" },
          { from: "Submitted", to: "Draft", label: "recall (owner)" },
          { from: "Submitted", to: "Manager Review", label: "open (manager)" },
          { from: "Manager Review", to: "Manager Approved", label: "approve (manager)" },
          { from: "Manager Review", to: "Changes Requested", label: "request changes" },
          { from: "Manager Review", to: "Rejected", label: "reject" },
          { from: "Changes Requested", to: "Submitted", label: "resubmit (owner)" },
          { from: "Manager Approved", to: "Finance Review", label: "open (finance)" },
          { from: "Finance Review", to: "Finance Approved", label: "approve (finance)" },
          { from: "Finance Review", to: "Rejected", label: "reject" },
          { from: "Finance Approved", to: "Posted to QuickBooks", label: "post to QBO" },
          { from: "Finance Approved", to: "Sync Error", label: "QBO rejected" },
          { from: "Sync Error", to: "Posted to QuickBooks", label: "retry" },
          { from: "Posted to QuickBooks", to: "Ready for Payroll Reimbursement", label: "ready" },
          { from: "Ready for Payroll Reimbursement", to: "Paid Through Payroll", label: "mark paid" },
          { from: "Paid Through Payroll", to: "Reconciled", label: "reconcile" },
        ],
      },
      {
        type: "callout",
        tone: "info",
        title: "Voids",
        text:
          "Most pre-payment statuses can transition to Voided. Once a report is Paid or Reconciled, voiding is no longer available.",
      },
    ],
    related: ["status-glossary"],
  },
  {
    id: "policy-reference",
    category: "reference",
    title: "Policy reference",
    summary: "The default rules of the road.",
    blocks: [
      {
        type: "kv",
        rows: [
          { k: "Receipts required", v: "Any line item over $75 must have a receipt attached." },
          { k: "Editable statuses", v: "Draft and Changes Requested. All other statuses are read-only for the owner." },
          { k: "Recall window", v: "While the report is Submitted or Manager Review (manager hasn't acted yet)." },
          { k: "Future-dated lines", v: "Not allowed — line item dates can't be in the future." },
          { k: "Amount precision", v: "Up to 2 decimal places, and not more than $100,000 per line." },
        ],
      },
      {
        type: "callout",
        tone: "info",
        title: "Per-category overrides",
        text:
          "System and accounting admins can tighten these limits per category in Admin → Policy rules.",
      },
    ],
    related: ["admin-policy"],
  },

  // ---------------- Troubleshooting ----------------
  {
    id: "troubleshooting",
    category: "troubleshooting",
    title: "Troubleshooting",
    summary: "Common problems and how to fix them.",
    blocks: [
      {
        type: "h",
        text: "Employees",
      },
      {
        type: "kv",
        rows: [
          {
            k: "I can't edit my report",
            v: "Editing only works in Draft or Changes Requested. If your report is Submitted or further along, recall it (if your manager hasn't acted) or wait for your manager.",
          },
          {
            k: "Submit button is disabled",
            v: "You need at least one line item before you can submit. Add a line on the report detail page.",
          },
          {
            k: "Receipt upload stuck",
            v: "Check the file type (JPG/PNG/WEBP/PDF) and size (≤10MB). Try a smaller file or a different network.",
          },
          {
            k: "Mobile camera permission denied",
            v: "Open your phone's Settings → Healthtrix Expense → Camera and turn it on.",
          },
        ],
      },
      {
        type: "h",
        text: "Managers",
      },
      {
        type: "kv",
        rows: [
          {
            k: "I'm not seeing reports in my manager queue",
            v: "Confirm your direct reports are correctly set up in Admin → Users. If you're a delegate, make sure the delegation is active for today's date.",
          },
          {
            k: "Delegation isn't working",
            v: "Check Admin → Users → Delegations: the date range must include today, and the delegate must have the Manager Approver role.",
          },
        ],
      },
      {
        type: "h",
        text: "Finance & admins",
      },
      {
        type: "kv",
        rows: [
          {
            k: "QuickBooks posting failed (Sync Error)",
            v: "Read the error in the audit log. Common fixes: reconnect QBO under Admin → QuickBooks, fix a missing GL account in Admin → Departments & GL, then click Retry QBO Sync.",
          },
          {
            k: "I can't mark a batch paid",
            v: "Only batches that are still Pending Payment can be marked paid. Check the Batches tab for status.",
          },
          {
            k: "Reconciliation form is read-only",
            v: "The batch must be marked paid first. Go to Payroll batches → Mark Paid, then return.",
          },
        ],
      },
      {
        type: "h",
        text: "Mobile",
      },
      {
        type: "kv",
        rows: [
          {
            k: "Offline behavior",
            v: "Capture and drafts work offline. Submission and approval require a network connection — actions will fail with a clear error if you're offline.",
          },
        ],
      },
    ],
  },

  // ---------------- FAQ ----------------
  {
    id: "faq",
    category: "faq",
    title: "Frequently asked questions",
    summary: "Quick answers to common questions.",
    blocks: [
      {
        type: "kv",
        rows: [
          {
            k: "Do I need a receipt for every expense?",
            v: "Only for line items over $75 by default. Some categories may require receipts at lower thresholds — check the policy reference.",
          },
          {
            k: "Can I split one receipt across multiple line items?",
            v: "Yes — attach the same receipt image to each line item that needs it.",
          },
          {
            k: "What if my manager is out of office?",
            v: "An admin can set up an Approver Delegation to route your reports to a covering manager.",
          },
          {
            k: "How long until I get reimbursed?",
            v: "Once a report is Paid Through Payroll, it's been disbursed in the next payroll cycle. Reconciled means accounting has confirmed actuals.",
          },
          {
            k: "Can I edit a posted report?",
            v: "No. Once a report is Posted to QuickBooks, the GL entry is in QBO. Any correction has to happen in QuickBooks.",
          },
          {
            k: "Can I have more than one role?",
            v: "Yes. Most managers and finance approvers are also marked as employees so they can submit their own reports.",
          },
          {
            k: "Can I delete a report I don't want?",
            v: "Only while it's still in Draft and has no approval history. After that, use Void to cancel — the audit trail is preserved.",
          },
          {
            k: "Where do I see why my report was rejected?",
            v: "Open the report — the latest comment in the audit log on the right shows the rejection reason.",
          },
        ],
      },
    ],
  },
];

export const HELP_TOPIC_INDEX: Record<string, HelpTopic> = HELP_TOPICS.reduce(
  (acc, topic) => {
    acc[topic.id] = topic;
    return acc;
  },
  {} as Record<string, HelpTopic>,
);

export function getTopic(id: string): HelpTopic | undefined {
  return HELP_TOPIC_INDEX[id];
}

export function getCategoryTitle(id: string): string {
  return HELP_CATEGORIES.find((c) => c.id === id)?.title ?? id;
}

/** Lightweight client-side fuzzy-ish search across all topics. */
export function searchTopics(query: string): HelpTopic[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const tokens = q.split(/\s+/);
  const scored: { topic: HelpTopic; score: number }[] = [];
  for (const topic of HELP_TOPICS) {
    const haystack = [
      topic.title,
      topic.summary,
      ...(topic.keywords ?? []),
      ...topic.blocks.flatMap((b) => {
        if ("text" in b && typeof b.text === "string") return [b.text];
        if ("items" in b) return b.items;
        if (b.type === "kv") return b.rows.flatMap((r) => [r.k, r.v]);
        return [];
      }),
    ]
      .join(" ")
      .toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (!haystack.includes(t)) {
        score = 0;
        break;
      }
      // weight matches in title/summary higher
      if (topic.title.toLowerCase().includes(t)) score += 5;
      if (topic.summary.toLowerCase().includes(t)) score += 3;
      score += 1;
    }
    if (score > 0) scored.push({ topic, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.topic);
}
