/* eslint-disable no-console */
/**
 * Healthtrix Expense seed.
 *
 * Wipes the DB and creates a *clean* baseline:
 *   - 1 org, 6 departments, full GL mapping, policy rules, QBO stub
 *   - 1 sysadmin, 1 accounting admin, 1 finance approver, 1 manager,
 *     and 6 employees (manager is also an employee), all marked Active
 *
 * NO expense reports, line items, receipts, approval actions, audit
 * entries, QBO posting events, payroll batches, payroll items, or
 * reconciliation records are created. The wipe step still truncates
 * those tables so re-seeding leaves them empty.
 *
 * Single password for all users: see CRED_PASSWORD below.
 */
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  db,
  pool,
  approvalActionsTable,
  auditEntriesTable,
  departmentsTable,
  employeeProfilesTable,
  expenseReportsTable,
  glMappingsTable,
  lineItemsTable,
  loginAttemptsTable,
  managerDelegationsTable,
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
      ${auditEntriesTable},
      ${receiptsTable},
      ${lineItemsTable},
      ${expenseReportsTable},
      ${managerDelegationsTable},
      ${employeeProfilesTable},
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
  // Mirror what `POST /admin/qbo-connection/connect-stub` would do for this
  // org: random realm id + the org's own company name. This avoids hardcoded
  // "STUB-REALM-1234567890" / "Healthtrix Sandbox Co." appearing in fixtures.
  const seedRealm = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 10).toString(),
  ).join("");
  await db.insert(qboConnectionTable).values({
    orgId: org.id,
    status: "connected",
    realmId: seedRealm,
    companyName: org.name,
    connectedAt: new Date(),
  });

  console.log("Creating users…");
  const userByEmail = new Map<
    string,
    { id: string; roles: Role[]; fullName: string }
  >();
  // First pass: insert all users without a manager. Every seeded user is
  // explicitly Active so a fresh seed leaves login enabled for everyone.
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
        roles: [spec.role],
        isAlsoEmployee: spec.isAlsoEmployee,
        departmentId: dept?.id ?? null,
        isActive: true,
      })
      .returning();
    userByEmail.set(spec.email, {
      id: user.id,
      roles: user.roles,
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

  // Print + persist credentials so downstream agents (web/iOS) and humans
  // know exactly which fixture accounts exist after a seed.
  writeCredentialsFile();
  printCredentials();

  console.log("Done.");
}

function credentialsMarkdown(): string {
  const lines: string[] = [];
  lines.push("# Healthtrix Expense — backend credentials & demo data");
  lines.push("");
  lines.push(
    "> Regenerated by `pnpm --filter @workspace/scripts run seed`. Re-running the seed wipes and recreates everything below.",
  );
  lines.push("");
  lines.push("## API base");
  lines.push("");
  lines.push(
    "- Local dev: `http://localhost:8080/api` (proxied as `/api/...`). Health: `GET /api/health`.",
  );
  lines.push("");
  lines.push("## Login");
  lines.push("");
  lines.push(`- All seeded users share the password: **\`${CRED_PASSWORD}\`**`);
  lines.push(
    "- Web clients receive an `ht_session` HTTP-only cookie + an `ht_csrf` cookie; send the CSRF value back in the `x-csrf-token` header on mutating requests.",
  );
  lines.push(
    "- iOS / native clients send `x-healthtrix-client: ios`. CSRF is skipped and the login response includes a `sessionToken` to use as `Authorization: Bearer <token>`.",
  );
  lines.push("");
  lines.push("## Users");
  lines.push("");
  lines.push("| Role              | Email                          | Name              |");
  lines.push("|-------------------|--------------------------------|-------------------|");
  for (const u of USERS) {
    lines.push(
      `| ${u.role.padEnd(17)} | ${u.email.padEnd(30)} | ${u.fullName.padEnd(17)} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function writeCredentialsFile(): void {
  // Walk up from cwd to find the workspace root (the dir containing
  // pnpm-workspace.yaml). Falls back to cwd if not found.
  let cur = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(cur, "pnpm-workspace.yaml"))) break;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  const target = path.join(
    cur,
    ".local",
    "tasks",
    "healthtrix-backend-credentials.md",
  );
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, credentialsMarkdown(), "utf8");
  console.log(
    `Wrote credentials to .local/tasks/healthtrix-backend-credentials.md`,
  );
}

function printCredentials(): void {
  console.log("");
  console.log("=== Seeded credentials ===");
  console.log(`password: ${CRED_PASSWORD}`);
  for (const u of USERS) {
    console.log(`  ${u.role.padEnd(17)} ${u.email}`);
  }
  console.log("==========================");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
