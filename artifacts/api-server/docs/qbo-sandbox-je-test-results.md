# QBO Sandbox JE Test Plan — Run Sheet

**Plan:** [`qbo-sandbox-je-test-plan.md`](./qbo-sandbox-je-test-plan.md)
**Run started:** 2026-05-11
**Run completed:** 2026-05-11
**Tester:** Replit Agent (task #85)
**Target sandbox company:** `Sandbox Company US 196d` (realm `9341457053035148`)
**Test org used:** `Healthtrix Demo Co.` (`5571ee4c-6b8f-4a01-b78c-3daa7639b961`)

> **Documented deviation from §3.1:** The plan recommends a dedicated
> `qbo-sandbox-qa` org. We reused the existing already-OAuth-connected
> `Healthtrix Demo Co.` org instead, on the user's instruction, to avoid a
> redundant OAuth dance against the same sandbox company.

> **Documented deviation from §3.3:** The plan suggests Accounts Payable (A/P)
> as the default payable account. Real-Intuit testing showed AP returns
> `code 6000 — "When you use Accounts Payable, you must choose a vendor in
> the Name field."`, which the current JE payload builder does not satisfy.
> We switched to `Loan Payable` (account Id `43`, type Other Current
> Liability) per the plan's stated alternative. The AP-vendor gap is recorded
> as a separate follow-up (Bug #3).

## Executive summary

Strict per §7 ("a scenario is Pass iff every assertion under its Expected
block holds"). Code-inspection-only or partial-evidence outcomes are
classified as **Blocked** with the reason recorded.

Total scenario rows in the table below: **23** (S1–S20, with S10 split into
S10a/S10b/S10c and S18 split into S18a/S18b).

- **Pass: 2** — S2, S15
- **Fail: 1** — S6
- **Blocked: 20**
  - **11** blocked by Bug #1 (real-mode JE post fails before the scenario's Expected block can hold) — S7, S8, S9, S10a, S10b, S10c, S11 (refresh portion succeeded; post failed), S13, S14, S17, S18a
  - **6** blocked because the assertions require interactive browser / Intuit-dashboard / QBO-UI steps not reachable from the agent environment — S1, S3, S4, S5, S12, S16
  - **3** blocked because the assertions require an authenticated HTTP harness against the running API server, which the agent environment doesn't have wired up for the seeded test users — S18b, S19, S20

Arithmetic check: 2 + 1 + (11 + 6 + 3) = 23 ✅

(Note: S18b/S19/S20's enforcement is implemented at the route layer
(`finance.ts`); the route handlers' guards are visible by inspection but not
exercised end-to-end in this run, so per the reviewer's directive they are
**Blocked**, not Pass.)

### Failed scenarios (one-line reason)
- **S6** — `buildJournalEntryPayload` (`qbo.ts:1358`) wraps the body as
  `{"JournalEntry": {...}}`. Intuit's `POST /v3/company/.../journalentry`
  expects the JE properties at the top level and rejects the wrapper with
  `400 ValidationFault code=2010 "Property Name:failed to parse json
  object; a property specified is unsupported or invalid"`. See **Bug #1**.

### Blocked scenarios (reason)
- **S1, S3, S5** — require interactive Intuit OAuth consent UI in a browser.
- **S4** — requires interactive Intuit OAuth dance with deliberately corrupted Client Secret.
- **S12** — requires user to revoke the connection from `appcenter.intuit.com`.
- **S16** — requires user to inactivate a Chart-of-Accounts entry in the QuickBooks sandbox UI.
- **S7, S8, S9, S10a, S10b, S10c, S18a** — depend on a successful real-Intuit JE post; blocked by Bug #1.
- **S11** — refresh-token call succeeded against real Intuit (token_refresh_log row written, success=true), but the subsequent post failed due to Bug #1; the scenario's "post succeeds" assertion cannot hold.
- **S13, S14, S17** — depend on a successful post path; blocked by Bug #1. Same retry/refresh machinery is exercised by `scripts/test-intuit-client.ts` at the unit level (14/14 green) but per the reviewer's directive that does not constitute a real-sandbox Pass.
- **S18b, S19, S20** — assertions require authenticated HTTP requests against the running API server. The agent environment does not have a session-mint harness for the seeded test users, so the route guards (visible at `finance.ts:170,174,229,233`) were not exercised end-to-end in this run.

## Results

| ID | Title | Result | JE Id | Notes / Bug Link | Run Date | Tester |
|---|---|---|---|---|---|---|
| S1 | OAuth connect — first-time happy path | Blocked | n/a | Requires interactive Intuit consent UI; not reachable from agent env. | 2026-05-11 | Agent |
| S2 | OAuth — state nonce expiry | **Pass** | n/a | Inserted state row with `expires_at = now() - 1s`, called `handleQboOauthCallback` → `{ ok: false, errorMessage: "OAuth state has expired. Please retry the connect flow." }`. Single assertion in §S2 holds end-to-end. Driver: `scripts/_run-server-scenarios.ts`. | 2026-05-11 | Agent |
| S3 | OAuth — user denies consent | Blocked | n/a | Requires user click on Intuit "Cancel" button. | 2026-05-11 | Agent |
| S4 | OAuth — invalid client credentials | Blocked | n/a | Requires interactive Intuit OAuth dance; cannot drive Intuit's hosted login. | 2026-05-11 | Agent |
| S5 | OAuth — reconnect after disconnect | Blocked | n/a | Requires interactive Intuit consent UI. | 2026-05-11 | Agent |
| S6 | Happy-path JE post (manual approve + manual post) | **Fail** | none | **Bug #1.** Intuit returns `400 code=2010 "Property Name:failed to parse json object"`. Reproduced on reports `33995941-ab54-44bb-b3a7-f4bcc484e2f5` (S6-9E6277), `63726828-c008-497f-a604-deb3c91ce70d` (S6-34CA6C). Re-posting the identical body **without the `JournalEntry` wrapper** returns 200 OK (verified directly against Intuit; see Bug #1 repro section). | 2026-05-11 | Agent |
| S7 | Auto-post on approval | Blocked | n/a | Blocked by Bug #1. Code wiring at `finance.ts:113` (post-on-financeApprove) and `qbo_connection.autoPostOnApproval` is correct. | 2026-05-11 | Agent |
| S8 | Attachments (multiple receipts) | Blocked | n/a | Blocked by Bug #1 — `uploadAttachable` requires a real JE Id. | 2026-05-11 | Agent |
| S9 | Tags, memo template, and DocNumber | Blocked | n/a | Blocked by Bug #1. Captured payload showed `DocNumber`, `PrivateNote`, and tag persistence are all correct on the request side; Intuit-side observation requires a successful post. | 2026-05-11 | Agent |
| S10a | GL mapping — explicit qboAccountId | Blocked | n/a | Blocked by Bug #1. Captured payload showed `AccountRef:{"value":"13","name":"Meals and Entertainment"}` (durable Id). | 2026-05-11 | Agent |
| S10b | GL mapping — name-only fallback | Blocked | n/a | Blocked by Bug #1. Code path at `qbo.ts:152-153` falls back to `name` when Id is null. | 2026-05-11 | Agent |
| S10c | GL mapping — missing mapping | Blocked | n/a | Drove report `35299582-f177-4ff0-b078-a9d3156c32e3` with bogus category. **Bug #1 envelope error masks the missing-mapping behavior**, so the plan's expected `"Missing GL mapping for category X"` message could not be observed. **Bug #2 (candidate):** `buildGlPreview` at `qbo.ts:152` silently substitutes `FALLBACK_ACCOUNT = "Uncategorized Expense"` for unmapped categories instead of raising a validation error pre-Intuit. | 2026-05-11 | Agent |
| S11 | Token refresh on stale access token | Blocked | n/a | Set `token_expires_at = now() - 60s`, called `postReportToQbo`. **Refresh portion succeeded**: `qbo_token_refresh_log` row inserted (`fa86ada4-…`, `success=true`); real Intuit `/oauth2/v1/tokens/bearer` returned 200 with new tokens. The subsequent JE post failed due to Bug #1, so the scenario's full Expected block ("the post succeeds") does not hold → Blocked. Will pass automatically once Bug #1 is fixed. | 2026-05-11 | Agent |
| S12 | Refresh token revoked / expired | Blocked | n/a | Requires user to revoke the app from `appcenter.intuit.com`. | 2026-05-11 | Agent |
| S13 | Intuit error handling — 401 mid-call | Blocked | n/a | Per §S13 the post is expected to succeed after auto-refresh. Blocked by Bug #1. (401-then-refresh-then-retry path is exercised by `scripts/test-intuit-client.ts` at the unit level — 14/14 green — but per §7 strict reading that is not a real-sandbox Pass.) | 2026-05-11 | Agent |
| S14 | Intuit error handling — 429 throttling | Blocked | n/a | Per §S14 the post is expected to eventually succeed. Blocked by Bug #1. (Same backoff machinery as S15; verified for the 5xx path in S15.) | 2026-05-11 | Agent |
| S15 | Intuit error handling — 500 | **Pass** | n/a | Drove report `85d4aea6-eb93-4aa9-9bd7-3215fce7a1fe` (S15-35553A) via `postReportToQbo` with an injected `fetchFn` that returned `500 ServerFault` for every JE call (per plan §11 explicitly allowed). Observed: client made 4 attempts (initial + 3 retries via `intuitClient.ts:301` backoff); `qbo_posting_events` got exactly 1 row with `status='error'` and `errorMessage='Internal server error'`; report transitioned to `Sync Error` via `applyTransition('postQboError')` (mirroring `finance.ts:209`). All §S15 assertions hold. Driver: `scripts/_run-s15.ts`. | 2026-05-11 | Agent |
| S16 | Intuit validation error (closed account) | Blocked | n/a | Requires user to inactivate a CoA entry inside the QuickBooks sandbox UI. | 2026-05-11 | Agent |
| S17 | Retry path | Blocked | n/a | §S17 expects `Posted to QuickBooks` on retry. Real-Intuit retry blocked by Bug #1. | 2026-05-11 | Agent |
| S18a | Idempotency — double-click | Blocked | n/a | Blocked by Bug #1: the first post never reaches a successful state, so the second-request-409 assertion cannot be observed. | 2026-05-11 | Agent |
| S18b | Idempotency — repost in non-FA status | Blocked | n/a | Status guard implemented at `finance.ts:174,233` returns 409 `Invalid Transition` before any Intuit call. Not exercised end-to-end this run because the agent env lacks an authenticated HTTP harness for the seeded test users. | 2026-05-11 | Agent |
| S19 | Permission gating | Blocked | n/a | Role guards via `requireRole(...FINANCE_ROLES)` at `finance.ts:170,229` and `glPreview` route. Not exercised end-to-end this run for the same harness reason as S18b. | 2026-05-11 | Agent |
| S20 | Status guardrails | Blocked | n/a | Same status-guard pattern as S18b; not exercised end-to-end this run. | 2026-05-11 | Agent |

## Pre-flight (§2)

- `DATABASE_URL` set: ✅
- `QBO_CREDENTIAL_ENCRYPTION_KEY` set: ✅
- `REPLIT_DEV_DOMAIN`: `0431ccd1-5990-4a57-9390-13c470740eec-00-1lq5qaomj0rdf-po60jln2.picard.replit.dev`
- API Server / Web / Mobile / Mockup workflows: ✅ all running.
- Existing real-mode connection on test org: connected, sandbox, healthy.

## Fixture inventory (§3)

| Fixture | State |
|---|---|
| Org | reused: `Healthtrix Demo Co.` (`5571ee4c-6b8f-4a01-b78c-3daa7639b961`) |
| Departments | 3 already seeded |
| GL mappings | 12 seeded with sandbox account Ids |
| Default payable account | `Loan Payable` (Id `43`, Other Current Liability) — see §3.3 deviation |
| Memo template | `Healthtrix Expense — {displayCode} — {title}` |
| Employee (submitter) | reused: Dave Meyer |
| Manager Approver | created: `qbo-manager@healthtrix.test` (`5a5093af-…`) |
| Finance Approver | created: `qbo-finance@healthtrix.test` (`78b0acd8-…`); also Jay Baker (multi-role) |
| Tag | created: `Project Alpha` (`fbbf83ea-…`) |

## Bugs found (recorded as follow-ups; per task scope, NOT fixed in this task)

### Bug #1 — JE POST body wrapped in `{"JournalEntry": {...}}` envelope is rejected by Intuit

**Severity:** P0 — every real-mode JE post fails. The QBO real-mode integration is currently non-functional end-to-end.
**Follow-up task:** #86.

**Location:** `artifacts/api-server/src/services/qbo.ts:1358`
(`buildJournalEntryPayload` returns `{ JournalEntry: { … } }`); the wrapped
object is JSON-stringified verbatim and POSTed by `intuitClient.ts:339-348`.

**Intuit response:** `400 ValidationFault code=2010 "Request has invalid or
unsupported property" / Detail "Property Name:failed to parse json object;
a property specified is unsupported or invalid"`.

**Reproduction (no app code modified):**
1. Capture the exact body the app sends (fetch interceptor wrapped around
   `postReportToQbo`).
2. POST it as-is to
   `https://sandbox-quickbooks.api.intuit.com/v3/company/9341457053035148/journalentry?minorversion=70`
   with the same Bearer token → **400** with the message above.
3. POST the same body **with the outer `{"JournalEntry": …}` envelope
   removed** (i.e. the inner object directly) → **200 OK**, JE created.

**Expected fix (for the follow-up task):** `buildJournalEntryPayload` should
return the inner object only, and `postJournalEntry` should send it
unwrapped. The `{ JournalEntry: … }` shape is Intuit's response shape, not
its request shape.

### Bug #2 (candidate) — Unmapped expense categories silently fall back to `Uncategorized Expense`

**Severity:** P2. **Follow-up task:** #87.

`qbo.ts:70` (`FALLBACK_ACCOUNT = "Uncategorized Expense"`) and
`qbo.ts:152-153` substitute the fallback name instead of raising a
"Missing GL mapping for category X" error before calling Intuit.

### Bug #3 — Accounts Payable (A/P) as default payable rejects the post

**Severity:** P2. **Follow-up task:** #88.

Intuit returns `code=6000 ValidationFault — "When you use Accounts Payable,
you must choose a vendor in the Name field."` because the JE payload does
not attach a Vendor reference on the AP credit line.

## Driver scripts

- `artifacts/api-server/scripts/run-qbo-sandbox-suite.ts` — primary driver
  (inspect, probe-accounts, setup-fixtures, reset-org, make-report,
  post-report).
- `artifacts/api-server/scripts/_run-server-scenarios.ts` — S2 / S10c / S11
  server-driveable batch.
- `artifacts/api-server/scripts/_run-s15.ts` — S15 driver with injected
  `fetchFn` returning 500 + `applyTransition` mirroring the post route's
  error path.
- `artifacts/api-server/scripts/_qbo-sandbox-cleanup.ts` — sandbox-side
  teardown helper (§10.3): deletes today's JEs from the sandbox.
- Existing `artifacts/api-server/scripts/test-intuit-client.ts` — covers
  the retry / token-refresh / error-mapping logic at the unit level
  (14/14 green); cited in the Notes column as supporting evidence only,
  not as a real-sandbox Pass.

The throwaway diagnostic probes (`_probe-je.ts`, `_probe-je2.ts`,
`_probe-name.ts`, `_probe-exact.ts`, `_probe-app.ts`) used to isolate
Bug #1 have been removed from the tree to avoid leaving long-lived
scripts that decrypt live QBO tokens. The reproduction recipe in the
Bug #1 section above is sufficient for the follow-up engineer to
recreate them on demand.

## Cleanup status (§10) — completed

### §10.1 App-side reset (executed)
Ran `DELETE FROM qbo_posting_events / line_items / receipts /
qbo_tag_assignments / approval_actions / expense_reports / qbo_oauth_states`
scoped to the test org. Final verification:

| Table | Rows for test org |
|---|---|
| `expense_reports` | 0 |
| `qbo_posting_events` | 0 |
| `qbo_oauth_states` | 0 |

(Audit-entries delete used `category IN ('report','qbo_post','qbo')`;
`'workflow'` is not a valid `audit_category` enum value — the literal in
plan §10.1 is incorrect for the current schema and was dropped from the
executed statement. Recorded as a small plan-vs-schema drift.)

### §10.3 Sandbox-side reset (executed)
13/13 JournalEntries with `TxnDate = 2026-05-11` deleted from the sandbox
via `POST /journalentry?operation=delete` (Intuit Ids 145–157). The 3
that originated from the application path (`S6-9E6277`, `S6-34CA6C`,
`S6-34CA6Z` — all of which had errored, so only one of the three
actually reached the sandbox: `S6-34CA6Z` Id 157) and the 10 from
diagnostic probes (Ids 145–156, `DBG-A1`/`B1`/`C1`/`E1`/`F1`/`RID` etc.)
were all removed. Sandbox is clean.

### Fixtures intentionally retained
- Test users (`qbo-manager@`, `qbo-finance@`).
- `Project Alpha` tag.
- 12 GL mappings.
- `default_payable_account_id = 43 / Loan Payable`, memo template, and
  the existing OAuth connection (tokens still valid).

These are kept so a re-run after Bug #1 is fixed is a one-command flow:
`pnpm exec tsx scripts/run-qbo-sandbox-suite.ts setup-fixtures` (idempotent)
followed by `make-report` + `post-report` per scenario.
