/**
 * Sandbox-side cleanup helper for the QBO test plan §10.3.
 * Deletes all JournalEntries posted to the sandbox today.
 * Run after a test run to leave the sandbox company tidy.
 *
 * Usage: pnpm exec tsx scripts/_qbo-sandbox-cleanup.ts --yes
 *
 * Safety:
 *   - Hard-aborts unless qbo_connection.environment === "sandbox".
 *   - Requires explicit `--yes` flag to confirm destructive intent.
 */
import { db, pool, qboConnectionTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { decryptString } from "../src/lib/encryption.js";

const ORG = "5571ee4c-6b8f-4a01-b78c-3daa7639b961";
const [c] = await db.select().from(qboConnectionTable).where(eq(qboConnectionTable.orgId, ORG));
if (!c?.accessTokenEncrypted) throw new Error("no QBO connection");

// Hard safety stop: never run destructive deletes against a non-sandbox
// connection. The test plan explicitly forbids it; a misconfigured
// connection could otherwise wipe production JEs.
if (c.environment !== "sandbox") {
  throw new Error(
    `ABORT: qbo_connection.environment is "${c.environment}", not "sandbox". ` +
      `This script will not run delete operations against a non-sandbox connection.`,
  );
}
if (!process.argv.includes("--yes")) {
  throw new Error(
    "ABORT: refusing to run destructive sandbox cleanup without explicit --yes flag.",
  );
}

const at = decryptString(c.accessTokenEncrypted);
const today = new Date().toISOString().slice(0, 10);
const baseUrl = `https://sandbox-quickbooks.api.intuit.com/v3/company/${c.realmId}`;

const q = `select Id, DocNumber, SyncToken, TxnDate from JournalEntry where TxnDate = '${today}'`;
const listRes = await fetch(`${baseUrl}/query?query=${encodeURIComponent(q)}&minorversion=70`,
  { headers: { Authorization: `Bearer ${at}`, Accept: "application/json" } });
const listJson = (await listRes.json()) as { QueryResponse?: { JournalEntry?: Array<{ Id: string; DocNumber?: string; SyncToken: string }> } };
const jes = listJson.QueryResponse?.JournalEntry ?? [];
console.log(`Found ${jes.length} JEs from today.`);
let deleted = 0;
for (const je of jes) {
  const r = await fetch(`${baseUrl}/journalentry?operation=delete&minorversion=70`,
    { method: "POST", headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ Id: je.Id, SyncToken: je.SyncToken }) });
  if (r.ok) { deleted++; console.log(`deleted JE ${je.Id} (DocNumber=${je.DocNumber ?? "—"})`); }
  else console.log(`FAILED JE ${je.Id}: HTTP ${r.status} ${(await r.text()).slice(0,200)}`);
}
console.log(`Done: deleted ${deleted}/${jes.length}.`);
await pool.end();
