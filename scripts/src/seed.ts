/* eslint-disable no-console */
/**
 * Healthtrix Expense seed.
 *
 * Wipes the DB and creates a coherent demo dataset:
 *   - 1 org, 6 departments, full GL mapping, policy rules
 *   - 1 sysadmin, 1 accounting admin, 1 finance approver, 1 manager,
 *     and 6 employees (manager is also an employee)
 *   - Reports across every forward + side workflow status, with
 *     line items, audit-log entries, payroll batch + reconciliation
 *
 * Single password for all users: see CRED_PASSWORD below.
 */
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import {
  db,
  pool,
  approvalActionsTable,
  departmentsTable,
  expenseReportsTable,
  glMappingsTable,
  lineItemsTable,
  loginAttemptsTable,
  orgsTable,
  payrollBatchItemsTable,
  payrollBatchesTable,
  policyRulesTable,
  qboConnectionTable,
  qboPostingEventsTable,
  receiptsTable,
  reconciliationRecordsTable,
  sessionsTable,
  usersTable,
  type Role,
  type WorkflowStatus,
  type PaymentMethod,
} from "@workspace/db";

const CRED_PASSWORD = "Healthtrix!2026";

const QB_CATEGORIES = [
  "Travel:Airfare",
  "Travel:Lodging",
  "Travel:Ground Transportation",
  "Travel:Mileage",
  "Meals & Entertainment",
  "Office Supplies",
  "Software Subscriptions",
  "Continuing Education",
  "Conferences & Trade Shows",
  "Marketing & Advertising",
  "Telecommunications",
  "Professional Services",
] as const;

const DEPARTMENTS = [
  "Clinical Operations",
  "Revenue Cycle",
  "IT & Security",
  "Compliance",
  "Sales",
  "Executive",
];

type SeedReport = {
  displayCode: string;
  title: string;
  description: string;
  employeeEmail: string;
  departmentName: string;
  policy: string;
  periodStart: string;
  periodEnd: string;
  status: WorkflowStatus;
  submittedDaysAgo: number | null;
  lines: SeedLine[];
};

type SeedLine = {
  occurredOn: string;
  merchant: string;
  description: string;
  category: string;
  amount: string;
  paymentMethod: PaymentMethod;
  receipts: number; // count of receipt rows to create
};

const HIMSS_LINES: SeedLine[] = [
  L("2026-04-14", "Delta Air Lines", "SFO → LAS round-trip, main cabin", "Travel:Airfare", "612.40", "Personal Card", 1),
  L("2026-04-14", "Caesars Palace", "Lodging · 4 nights · conference rate", "Travel:Lodging", "1042.00", "Personal Card", 2),
  L("2026-04-14", "Lyft", "LAS airport → hotel", "Travel:Ground Transportation", "38.20", "Personal Card", 1),
  L("2026-04-15", "HIMSS Registration", "Full conference badge · early bird", "Conferences & Trade Shows", "425.00", "Company Card", 1),
  L("2026-04-15", "Jaleo Las Vegas", "Dinner with 3 prospective customers", "Meals & Entertainment", "184.62", "Personal Card", 1),
  L("2026-04-16", "Starbucks", "Breakfast · client meeting", "Meals & Entertainment", "22.85", "Personal Card", 0),
  L("2026-04-16", "Wynn Business Center", "Print of clinical workflow handouts", "Office Supplies", "41.25", "Personal Card", 1),
  L("2026-04-17", "Uber", "Hotel → Venetian session · evening return", "Travel:Ground Transportation", "24.40", "Personal Card", 1),
  L("2026-04-18", "Lyft", "Hotel → LAS airport", "Travel:Ground Transportation", "28.00", "Personal Card", 1),
];

function L(
  occurredOn: string,
  merchant: string,
  description: string,
  category: string,
  amount: string,
  paymentMethod: PaymentMethod,
  receipts: number,
): SeedLine {
  return { occurredOn, merchant, description, category, amount, paymentMethod, receipts };
}

const REPORTS: SeedReport[] = [
  {
    displayCode: "EXP-2604-100",
    title: "Q2 office supplies",
    description: "Pens, sticky notes, monitor stands.",
    employeeEmail: "wesley@healthtrix.test",
    departmentName: "Sales",
    policy: "Standard Travel",
    periodStart: "2026-04-26",
    periodEnd: "2026-04-29",
    status: "Draft",
    submittedDaysAgo: null,
    lines: [
      L("2026-04-26", "Staples", "Sticky notes, pens", "Office Supplies", "42.18", "Personal Card", 0),
      L("2026-04-27", "Best Buy", "USB-C dock", "Office Supplies", "189.00", "Company Card", 1),
    ],
  },
  {
    displayCode: "EXP-2604-117",
    title: "Site visit — Sacramento Memorial",
    description: "EHR rollout site visit.",
    employeeEmail: "marcus@healthtrix.test",
    departmentName: "Revenue Cycle",
    policy: "Standard Travel",
    periodStart: "2026-04-21",
    periodEnd: "2026-04-23",
    status: "Submitted",
    submittedDaysAgo: 5,
    lines: [
      L("2026-04-21", "Hyatt Place", "Lodging · 2 nights", "Travel:Lodging", "412.00", "Personal Card", 1),
      L("2026-04-21", "United Airlines", "SFO → SMF", "Travel:Airfare", "138.40", "Personal Card", 1),
      L("2026-04-22", "Mileage", "Hospital ↔ hotel · 32 mi", "Travel:Mileage", "21.00", "Cash", 0),
      L("2026-04-22", "Fixins Soul Kitchen", "Working lunch · 4 attendees", "Meals & Entertainment", "23.50", "Personal Card", 1),
      L("2026-04-23", "United Airlines", "SMF → SFO", "Travel:Airfare", "17.50", "Personal Card", 1),
    ],
  },
  {
    displayCode: "EXP-2604-118",
    title: "HIMSS 2026 Conference — Las Vegas",
    description: "Conference attendance + customer meetings.",
    employeeEmail: "priya@healthtrix.test",
    departmentName: "Clinical Operations",
    policy: "Conference Travel",
    periodStart: "2026-04-14",
    periodEnd: "2026-04-18",
    status: "Manager Review",
    submittedDaysAgo: 10,
    lines: HIMSS_LINES,
  },
  {
    displayCode: "EXP-2604-115",
    title: "Compliance audit prep — supplies",
    description: "Materials for SOC 2 audit prep.",
    employeeEmail: "hannah@healthtrix.test",
    departmentName: "Compliance",
    policy: "Standard Travel",
    periodStart: "2026-04-12",
    periodEnd: "2026-04-16",
    status: "Changes Requested",
    submittedDaysAgo: 12,
    lines: [
      L("2026-04-12", "Office Depot", "Audit binders & dividers", "Office Supplies", "63.41", "Personal Card", 0),
      L("2026-04-13", "Amazon", "External hard drive (encrypted)", "Office Supplies", "129.00", "Personal Card", 1),
      L("2026-04-14", "Notarize.com", "Notarization fees", "Professional Services", "45.00", "Personal Card", 1),
      L("2026-04-15", "FedEx Office", "Audit packet printing", "Office Supplies", "27.50", "Personal Card", 0),
      L("2026-04-16", "Lyft", "Courier run to auditor's office", "Travel:Ground Transportation", "12.25", "Personal Card", 0),
      L("2026-04-16", "Sweetgreen", "Working lunch · solo", "Meals & Entertainment", "10.00", "Personal Card", 0),
    ],
  },
  {
    displayCode: "EXP-2604-119",
    title: "Withdrawn vendor visit",
    description: "Cancelled trip; resubmit later.",
    employeeEmail: "marcus@healthtrix.test",
    departmentName: "Revenue Cycle",
    policy: "Standard Travel",
    periodStart: "2026-04-25",
    periodEnd: "2026-04-26",
    status: "Rejected",
    submittedDaysAgo: 4,
    lines: [
      L("2026-04-25", "United Airlines", "Cancelled airfare", "Travel:Airfare", "89.00", "Personal Card", 0),
    ],
  },
  {
    displayCode: "EXP-2604-116",
    title: "Epic certification training",
    description: "EHR certification curriculum.",
    employeeEmail: "marcus@healthtrix.test",
    departmentName: "IT & Security",
    policy: "Continuing Education",
    periodStart: "2026-04-06",
    periodEnd: "2026-04-10",
    status: "Manager Approved",
    submittedDaysAgo: 18,
    lines: [
      L("2026-04-06", "Epic Systems", "Tuition — Inpatient track", "Continuing Education", "1500.00", "Company Card", 1),
      L("2026-04-07", "Marriott", "Lodging · 3 nights · Verona, WI", "Travel:Lodging", "298.00", "Personal Card", 1),
      L("2026-04-09", "Delta Air Lines", "MSN → SFO return", "Travel:Airfare", "32.00", "Personal Card", 1),
      L("2026-04-10", "Olive Garden", "Group dinner · cohort", "Meals & Entertainment", "15.00", "Personal Card", 1),
    ],
  },
  {
    displayCode: "EXP-2604-114",
    title: "Q2 sales kickoff — Austin",
    description: "All-team kickoff and customer dinners.",
    employeeEmail: "jordan@healthtrix.test",
    departmentName: "Sales",
    policy: "Standard Travel",
    periodStart: "2026-03-30",
    periodEnd: "2026-04-02",
    status: "Finance Review",
    submittedDaysAgo: 26,
    lines: makeSalesLines(),
  },
  {
    displayCode: "EXP-2604-113b",
    title: "Patient intake kickoff Sync Error",
    description: "QBO sync failure to retry.",
    employeeEmail: "anika@healthtrix.test",
    departmentName: "Clinical Operations",
    policy: "Standard Travel",
    periodStart: "2026-04-19",
    periodEnd: "2026-04-22",
    status: "Sync Error",
    submittedDaysAgo: 7,
    lines: [
      L("2026-04-19", "American Airlines", "SFO → BOS", "Travel:Airfare", "488.00", "Personal Card", 1),
      L("2026-04-20", "Hilton Garden Inn", "Lodging · 3 nights", "Travel:Lodging", "612.00", "Personal Card", 1),
      L("2026-04-21", "Yard House", "Working dinner", "Meals & Entertainment", "92.30", "Personal Card", 1),
    ],
  },
  {
    displayCode: "EXP-2604-113",
    title: "Patient intake software pilot travel",
    description: "Pilot rollout in Boston.",
    employeeEmail: "anika@healthtrix.test",
    departmentName: "Clinical Operations",
    policy: "Standard Travel",
    periodStart: "2026-03-23",
    periodEnd: "2026-03-27",
    status: "Posted to QuickBooks",
    submittedDaysAgo: 32,
    lines: [
      L("2026-03-23", "American Airlines", "SFO → BOS", "Travel:Airfare", "488.00", "Personal Card", 1),
      L("2026-03-23", "Hilton Garden Inn", "Lodging · 4 nights", "Travel:Lodging", "612.00", "Personal Card", 1),
      L("2026-03-24", "Eataly Boston", "Working dinner with pilot team", "Meals & Entertainment", "92.30", "Personal Card", 1),
      L("2026-03-25", "Lyft", "Office ↔ hotel", "Travel:Ground Transportation", "32.50", "Personal Card", 1),
      L("2026-03-26", "Eataly Boston", "Wrap dinner", "Meals & Entertainment", "118.00", "Personal Card", 1),
      L("2026-03-26", "FedEx Office", "Pilot deployment forms", "Office Supplies", "12.40", "Personal Card", 1),
      L("2026-03-27", "American Airlines", "BOS → SFO", "Travel:Airfare", "-214.32", "Personal Card", 1),
    ],
  },
  {
    displayCode: "EXP-2604-112",
    title: "March client dinners",
    description: "Client entertainment, March cycle.",
    employeeEmail: "wesley@healthtrix.test",
    departmentName: "Sales",
    policy: "Standard Travel",
    periodStart: "2026-03-04",
    periodEnd: "2026-03-27",
    status: "Ready for Payroll Reimbursement",
    submittedDaysAgo: 32,
    lines: [
      L("2026-03-05", "Quince", "Customer dinner · 2", "Meals & Entertainment", "248.10", "Personal Card", 1),
      L("2026-03-12", "Nopa", "Customer dinner · 3", "Meals & Entertainment", "186.00", "Personal Card", 1),
      L("2026-03-19", "State Bird Provisions", "Customer dinner · 4", "Meals & Entertainment", "212.00", "Personal Card", 1),
      L("2026-03-25", "Foreign Cinema", "Customer dinner · 2", "Meals & Entertainment", "129.00", "Personal Card", 1),
      L("2026-03-27", "Lyft", "Driver home after dinner", "Travel:Ground Transportation", "49.00", "Personal Card", 1),
    ],
  },
  {
    displayCode: "EXP-2604-111",
    title: "Healthcare CIO Summit — Boston",
    description: "Executive presence at CIO Summit.",
    employeeEmail: "manager@healthtrix.test",
    departmentName: "Executive",
    policy: "Conference Travel",
    periodStart: "2026-03-16",
    periodEnd: "2026-03-19",
    status: "Paid Through Payroll",
    submittedDaysAgo: 40,
    lines: [
      L("2026-03-16", "JetBlue", "SFO → BOS first class", "Travel:Airfare", "1488.00", "Personal Card", 1),
      L("2026-03-16", "Four Seasons Boston", "Lodging · 3 nights", "Travel:Lodging", "1248.00", "Personal Card", 1),
      L("2026-03-17", "CIO Summit Registration", "Executive pass", "Conferences & Trade Shows", "295.00", "Company Card", 1),
      L("2026-03-17", "Mooo Restaurant", "Customer dinner · 4", "Meals & Entertainment", "118.00", "Personal Card", 1),
      L("2026-03-18", "Uber", "Conference ↔ hotel", "Travel:Ground Transportation", "62.40", "Personal Card", 1),
      L("2026-03-19", "JetBlue", "BOS → SFO main cabin", "Travel:Airfare", "36.00", "Personal Card", 1),
    ],
  },
  {
    displayCode: "EXP-2604-110",
    title: "Telehealth equipment for triage line",
    description: "Replacement headsets and webcams.",
    employeeEmail: "marcus@healthtrix.test",
    departmentName: "Revenue Cycle",
    policy: "Standard Travel",
    periodStart: "2026-03-09",
    periodEnd: "2026-03-13",
    status: "Reconciled",
    submittedDaysAgo: 46,
    lines: [
      L("2026-03-09", "B&H Photo", "Logitech webcams · 6 ct", "Office Supplies", "294.00", "Company Card", 1),
      L("2026-03-10", "Best Buy", "Plantronics headsets · 4 ct", "Office Supplies", "165.62", "Personal Card", 1),
      L("2026-03-13", "FedEx Office", "Asset labels", "Office Supplies", "30.00", "Personal Card", 1),
    ],
  },
];

function makeSalesLines(): SeedLine[] {
  return [
    L("2026-03-30", "American Airlines", "SFO → AUS round-trip", "Travel:Airfare", "488.00", "Personal Card", 1),
    L("2026-03-30", "Hyatt Regency Austin", "Lodging · 3 nights", "Travel:Lodging", "612.00", "Personal Card", 1),
    L("2026-03-30", "Lyft", "AUS → hotel", "Travel:Ground Transportation", "28.40", "Personal Card", 1),
    L("2026-03-31", "Franklin Barbecue", "Team dinner · 12", "Meals & Entertainment", "418.00", "Personal Card", 1),
    L("2026-03-31", "Salesforce", "Trial seat for kickoff", "Software Subscriptions", "75.00", "Company Card", 1),
    L("2026-04-01", "Stubb's Bar-B-Q", "Customer entertainment dinner", "Meals & Entertainment", "212.00", "Personal Card", 1),
    L("2026-04-01", "Lyft", "Hotel → venue", "Travel:Ground Transportation", "14.20", "Personal Card", 1),
    L("2026-04-01", "Print Shop ATX", "Booth handouts", "Marketing & Advertising", "40.95", "Personal Card", 1),
    L("2026-04-02", "American Airlines", "AUS → SFO", "Travel:Airfare", "32.00", "Personal Card", 1),
    L("2026-04-02", "Lyft", "Airport → home", "Travel:Ground Transportation", "21.00", "Personal Card", 1),
    L("2026-04-02", "Square POS Fees", "Pop-up booth processing", "Marketing & Advertising", "21.00", "Personal Card", 1),
  ];
}

type UserSpec = {
  email: string;
  fullName: string;
  title: string;
  role: Role;
  isAlsoEmployee: boolean;
  departmentName: string;
  managerEmail?: string;
};

const USERS: UserSpec[] = [
  { email: "admin@healthtrix.test", fullName: "Alex Brennan", title: "VP Operations", role: "System Admin", isAlsoEmployee: true, departmentName: "Executive" },
  { email: "accounting@healthtrix.test", fullName: "Diane Okafor", title: "Controller", role: "Accounting Admin", isAlsoEmployee: true, departmentName: "Executive" },
  { email: "finance@healthtrix.test", fullName: "Lila Chen", title: "Finance Manager", role: "Finance Approver", isAlsoEmployee: true, departmentName: "Executive" },
  { email: "manager@healthtrix.test", fullName: "Rosa Delacruz", title: "Director, Clinical Ops", role: "Manager Approver", isAlsoEmployee: true, departmentName: "Clinical Operations" },
  { email: "priya@healthtrix.test", fullName: "Priya Raghavan", title: "Clinical Program Lead", role: "Employee", isAlsoEmployee: true, departmentName: "Clinical Operations", managerEmail: "manager@healthtrix.test" },
  { email: "marcus@healthtrix.test", fullName: "Marcus Chen", title: "Revenue Cycle Analyst", role: "Employee", isAlsoEmployee: true, departmentName: "Revenue Cycle", managerEmail: "manager@healthtrix.test" },
  { email: "hannah@healthtrix.test", fullName: "Hannah Sørensen", title: "Compliance Officer", role: "Employee", isAlsoEmployee: true, departmentName: "Compliance", managerEmail: "manager@healthtrix.test" },
  { email: "jordan@healthtrix.test", fullName: "Jordan Whitfield", title: "Sales Director", role: "Employee", isAlsoEmployee: true, departmentName: "Sales", managerEmail: "manager@healthtrix.test" },
  { email: "anika@healthtrix.test", fullName: "Anika Bhatt", title: "Clinical Implementations", role: "Employee", isAlsoEmployee: true, departmentName: "Clinical Operations", managerEmail: "manager@healthtrix.test" },
  { email: "wesley@healthtrix.test", fullName: "Wesley Park", title: "Account Executive", role: "Employee", isAlsoEmployee: true, departmentName: "Sales", managerEmail: "manager@healthtrix.test" },
];

const APPROVAL_PATH: Record<
  WorkflowStatus,
  ReadonlyArray<{ from: WorkflowStatus; to: WorkflowStatus; actor: "self" | "manager" | "finance" }>
> = {
  Draft: [],
  Submitted: [{ from: "Draft", to: "Submitted", actor: "self" }],
  "Manager Review": [
    { from: "Draft", to: "Submitted", actor: "self" },
    { from: "Submitted", to: "Manager Review", actor: "manager" },
  ],
  "Changes Requested": [
    { from: "Draft", to: "Submitted", actor: "self" },
    { from: "Submitted", to: "Changes Requested", actor: "manager" },
  ],
  "Manager Approved": [
    { from: "Draft", to: "Submitted", actor: "self" },
    { from: "Submitted", to: "Manager Approved", actor: "manager" },
  ],
  "Finance Review": [
    { from: "Draft", to: "Submitted", actor: "self" },
    { from: "Submitted", to: "Manager Approved", actor: "manager" },
    { from: "Manager Approved", to: "Finance Review", actor: "finance" },
  ],
  "Finance Approved": [
    { from: "Draft", to: "Submitted", actor: "self" },
    { from: "Submitted", to: "Manager Approved", actor: "manager" },
    { from: "Manager Approved", to: "Finance Approved", actor: "finance" },
  ],
  "Posted to QuickBooks": [
    { from: "Draft", to: "Submitted", actor: "self" },
    { from: "Submitted", to: "Manager Approved", actor: "manager" },
    { from: "Manager Approved", to: "Finance Approved", actor: "finance" },
    { from: "Finance Approved", to: "Posted to QuickBooks", actor: "finance" },
  ],
  "Sync Error": [
    { from: "Draft", to: "Submitted", actor: "self" },
    { from: "Submitted", to: "Manager Approved", actor: "manager" },
    { from: "Manager Approved", to: "Finance Approved", actor: "finance" },
    { from: "Finance Approved", to: "Sync Error", actor: "finance" },
  ],
  "Ready for Payroll Reimbursement": [
    { from: "Draft", to: "Submitted", actor: "self" },
    { from: "Submitted", to: "Manager Approved", actor: "manager" },
    { from: "Manager Approved", to: "Finance Approved", actor: "finance" },
    { from: "Finance Approved", to: "Posted to QuickBooks", actor: "finance" },
    { from: "Posted to QuickBooks", to: "Ready for Payroll Reimbursement", actor: "finance" },
  ],
  "Paid Through Payroll": [
    { from: "Draft", to: "Submitted", actor: "self" },
    { from: "Submitted", to: "Manager Approved", actor: "manager" },
    { from: "Manager Approved", to: "Finance Approved", actor: "finance" },
    { from: "Finance Approved", to: "Posted to QuickBooks", actor: "finance" },
    { from: "Posted to QuickBooks", to: "Ready for Payroll Reimbursement", actor: "finance" },
    { from: "Ready for Payroll Reimbursement", to: "Paid Through Payroll", actor: "finance" },
  ],
  Reconciled: [
    { from: "Draft", to: "Submitted", actor: "self" },
    { from: "Submitted", to: "Manager Approved", actor: "manager" },
    { from: "Manager Approved", to: "Finance Approved", actor: "finance" },
    { from: "Finance Approved", to: "Posted to QuickBooks", actor: "finance" },
    { from: "Posted to QuickBooks", to: "Ready for Payroll Reimbursement", actor: "finance" },
    { from: "Ready for Payroll Reimbursement", to: "Paid Through Payroll", actor: "finance" },
    { from: "Paid Through Payroll", to: "Reconciled", actor: "finance" },
  ],
  Rejected: [
    { from: "Draft", to: "Submitted", actor: "self" },
    { from: "Submitted", to: "Rejected", actor: "manager" },
  ],
  Voided: [],
};

async function wipe(): Promise<void> {
  console.log("Wiping existing data…");
  await db.execute(sql`
    TRUNCATE TABLE
      ${reconciliationRecordsTable},
      ${payrollBatchItemsTable},
      ${payrollBatchesTable},
      ${qboPostingEventsTable},
      ${qboConnectionTable},
      ${approvalActionsTable},
      ${receiptsTable},
      ${lineItemsTable},
      ${expenseReportsTable},
      ${policyRulesTable},
      ${glMappingsTable},
      ${sessionsTable},
      ${loginAttemptsTable},
      ${usersTable},
      ${departmentsTable},
      ${orgsTable}
    RESTART IDENTITY CASCADE
  `);
}

async function main(): Promise<void> {
  await wipe();

  const passwordHash = await bcrypt.hash(CRED_PASSWORD, 10);

  console.log("Creating org and departments…");
  const [org] = await db
    .insert(orgsTable)
    .values({ name: "Healthtrix Demo Co." })
    .returning();

  const departments = await db
    .insert(departmentsTable)
    .values(DEPARTMENTS.map((name) => ({ orgId: org.id, name })))
    .returning();
  const deptByName = new Map(departments.map((d) => [d.name, d]));

  console.log("Creating GL mappings and policy rules…");
  await db.insert(glMappingsTable).values(
    QB_CATEGORIES.map((code) => ({
      orgId: org.id,
      code,
      qboAccount: `QBO:${code}`,
      qboAccountId: `acct-${code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      active: true,
    })),
  );
  await db.insert(policyRulesTable).values([
    {
      orgId: org.id,
      name: "receipt_required_threshold",
      value: { amount: 25 },
      description: "Receipt required for any single expense ≥ $25.",
    },
    {
      orgId: org.id,
      name: "meal_per_diem_max",
      value: { breakfast: 18, lunch: 22, dinner: 65 },
      description: "Per-diem ceilings for meals.",
    },
    {
      orgId: org.id,
      name: "auto_post_after_finance_approval",
      value: { enabled: false },
      description: "When true, automatically post to QBO without manual click.",
    },
  ]);
  await db.insert(qboConnectionTable).values({
    orgId: org.id,
    status: "connected",
    realmId: "STUB-REALM-1234567890",
    companyName: "Healthtrix Sandbox Co.",
    connectedAt: new Date(),
  });

  console.log("Creating users…");
  const userByEmail = new Map<
    string,
    { id: string; role: Role; fullName: string }
  >();
  // First pass: insert all users without a manager.
  for (const spec of USERS) {
    const dept = deptByName.get(spec.departmentName);
    const [user] = await db
      .insert(usersTable)
      .values({
        orgId: org.id,
        email: spec.email,
        passwordHash,
        fullName: spec.fullName,
        title: spec.title,
        role: spec.role,
        isAlsoEmployee: spec.isAlsoEmployee,
        departmentId: dept?.id ?? null,
      })
      .returning();
    userByEmail.set(spec.email, {
      id: user.id,
      role: user.role,
      fullName: user.fullName,
    });
  }
  // Second pass: set manager pointers.
  for (const spec of USERS) {
    if (!spec.managerEmail) continue;
    const user = userByEmail.get(spec.email)!;
    const manager = userByEmail.get(spec.managerEmail);
    if (!manager) continue;
    await db
      .update(usersTable)
      .set({ managerId: manager.id })
      .where(sql`id = ${user.id}`);
  }

  const managerUser = userByEmail.get("manager@healthtrix.test")!;
  const financeUser = userByEmail.get("finance@healthtrix.test")!;

  console.log("Creating reports + line items + audit log…");

  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();

  const reportRecords: { id: string; status: WorkflowStatus; spec: SeedReport }[] = [];

  for (const spec of REPORTS) {
    const employee = userByEmail.get(spec.employeeEmail);
    if (!employee) throw new Error(`Unknown employee ${spec.employeeEmail}`);
    const dept = deptByName.get(spec.departmentName);
    const submittedAt =
      spec.submittedDaysAgo === null
        ? null
        : new Date(now - spec.submittedDaysAgo * dayMs);
    const createdAt =
      submittedAt ?? new Date(now - 1 * dayMs);

    const [report] = await db
      .insert(expenseReportsTable)
      .values({
        orgId: org.id,
        displayCode: spec.displayCode,
        title: spec.title,
        description: spec.description,
        employeeId: employee.id,
        departmentId: dept?.id ?? null,
        policy: spec.policy,
        periodStart: spec.periodStart,
        periodEnd: spec.periodEnd,
        status: spec.status,
        submittedAt,
        createdAt,
        updatedAt: createdAt,
      })
      .returning();
    reportRecords.push({ id: report.id, status: spec.status, spec });

    const insertedLines = await db
      .insert(lineItemsTable)
      .values(
        spec.lines.map((l) => ({
          reportId: report.id,
          occurredOn: l.occurredOn,
          merchant: l.merchant,
          description: l.description,
          category: l.category,
          amount: l.amount,
          paymentMethod: l.paymentMethod,
          needsReview: parseFloat(l.amount) >= 500,
        })),
      )
      .returning();

    // Receipts: one per line that the seed says has receipts.
    const receiptRows: typeof receiptsTable.$inferInsert[] = [];
    for (let i = 0; i < spec.lines.length; i += 1) {
      const seed = spec.lines[i];
      const line = insertedLines[i];
      for (let r = 0; r < seed.receipts; r += 1) {
        receiptRows.push({
          orgId: org.id,
          reportId: report.id,
          lineItemId: line.id,
          objectPath: `/objects/seed/receipts/${report.displayCode}-${line.id}-${r}.jpg`,
          filename: `${seed.merchant.replace(/\W+/g, "_").toLowerCase()}_${r + 1}.jpg`,
          mimeType: "image/jpeg",
          sizeBytes: 95_000 + r * 1234,
          uploadedById: employee.id,
        });
      }
    }
    if (receiptRows.length > 0) {
      await db.insert(receiptsTable).values(receiptRows);
    }

    // Audit log walk to current status.
    const path = APPROVAL_PATH[spec.status];
    let seq = 0;
    const baseTs = submittedAt ? submittedAt.getTime() : createdAt.getTime();
    for (const step of path) {
      seq += 1;
      const actor =
        step.actor === "self"
          ? employee
          : step.actor === "manager"
            ? managerUser
            : financeUser;
      await db.insert(approvalActionsTable).values({
        reportId: report.id,
        actorId: actor.id,
        actorRole: actor.role,
        fromStatus: step.from,
        toStatus: step.to,
        comment:
          step.to === "Changes Requested"
            ? "Please attach receipts for items over $25."
            : step.to === "Rejected"
              ? "Trip cancelled — please void."
              : null,
        sequence: seq,
        createdAt: new Date(baseTs + seq * 60_000),
        metadata: null,
      });
    }

    // Posted/Sync Error/Ready/Paid/Reconciled: insert qbo posting event.
    if (
      [
        "Posted to QuickBooks",
        "Ready for Payroll Reimbursement",
        "Paid Through Payroll",
        "Reconciled",
      ].includes(spec.status)
    ) {
      await db.insert(qboPostingEventsTable).values({
        orgId: org.id,
        reportId: report.id,
        journalId: `QBO-J-${spec.displayCode.replace(/[^A-Z0-9]/g, "")}`,
        payload: { stub: true, displayCode: spec.displayCode },
        status: "posted",
      });
    } else if (spec.status === "Sync Error") {
      await db.insert(qboPostingEventsTable).values({
        orgId: org.id,
        reportId: report.id,
        journalId: `QBO-J-${spec.displayCode.replace(/[^A-Z0-9]/g, "")}`,
        payload: { stub: true, displayCode: spec.displayCode },
        status: "error",
        errorMessage:
          "QuickBooks: Account 'Employee Reimbursement Payable' is inactive (stub)",
      });
    }
  }

  console.log("Creating payroll batch + reconciliation…");
  const batchableReports = reportRecords.filter((r) =>
    ["Paid Through Payroll", "Reconciled"].includes(r.status),
  );
  if (batchableReports.length > 0) {
    const totalCents = batchableReports.reduce((acc, r) => {
      return (
        acc +
        r.spec.lines.reduce(
          (a, l) => a + Math.round(parseFloat(l.amount) * 100),
          0,
        )
      );
    }, 0);
    void totalCents;

    const [batch] = await db
      .insert(payrollBatchesTable)
      .values({
        orgId: org.id,
        label: "Payroll · Mar 28 — Apr 04, 2026",
        status: "Reconciled",
        paidAt: new Date(now - 12 * dayMs),
        reconciledAt: new Date(now - 5 * dayMs),
        createdById: financeUser.id,
      })
      .returning();
    for (const r of batchableReports) {
      const reportTotal = r.spec.lines
        .reduce((acc, l) => acc + Math.round(parseFloat(l.amount) * 100), 0);
      const expectedAmount = (reportTotal / 100).toFixed(2);
      await db.insert(payrollBatchItemsTable).values({
        batchId: batch.id,
        reportId: r.id,
        amount: expectedAmount,
      });
      if (r.status === "Reconciled") {
        await db.insert(reconciliationRecordsTable).values({
          batchId: batch.id,
          reportId: r.id,
          expectedAmount,
          paidAmount: expectedAmount,
          variance: "0.00",
          flag: "matched",
          note: "Matched in payroll reconciliation.",
        });
      }
    }
  }

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
