# QuickBooks Online Sandbox — Journal Entry Posting Test Plan

**Status:** Draft v1 (May 2026)
**Owner:** Finance integrations
**Audience:** QA engineers and executor agents validating the
real-mode QBO posting path against an Intuit Sandbox company.

---

## 1. Purpose & Scope

This plan verifies that an approved expense report in Healthtrix Expense
can be posted as a Journal Entry (JE) to a real QuickBooks Online (QBO)
*sandbox* company end-to-end, including the full OAuth handshake, token
refresh lifecycle, JE creation, receipt attachment upload, idempotent
retries, and error/recovery paths.

We already have:
- Unit coverage of payload construction (`scripts/test-qbo-services.ts`,
  `scripts/test-intuit-client.ts`).
- Stub-mode coverage of the posting workflow.
- OAuth start-route coverage with a mocked Intuit
  (`scripts/test-qbo-oauth-start.ts`).
- Redirect URI resolver coverage (`scripts/test-qbo-redirect.ts`).

What we do **not** yet have, and what this plan covers, is a written
walkthrough that lets a non-author drive a real Intuit Sandbox company
through the full `Finance Approved → Posted to QuickBooks → Ready for
Payroll Reimbursement` lifecycle and verify the resulting state both in
our app and in the sandbox.

### Out of scope
- Implementing new automated tests or CI wiring (this task is the plan
  only — automation candidates are tagged in the matrix at the end).
- Changes to the QBO posting code itself. If the plan uncovers gaps,
  those become follow-up tasks.
- Production QBO connectivity — sandbox only.
- Payroll/reimbursement steps that happen after `Posted to QuickBooks`.

### Done looks like
- Every scenario in §5 has been executed against the sandbox.
- For each scenario the result is recorded as Pass / Fail / Blocked,
  with the JE id (or absence thereof) noted from the sandbox UI.
- Any failures have an associated bug ticket referencing the scenario
  number.

---

## 2. Environment & Credentials Checklist

### 2.1 Intuit-side prerequisites
1. An Intuit Developer account (https://developer.intuit.com/).
2. A **sandbox company** created from the developer dashboard. The
   default sandbox already includes a usable Chart of Accounts.
3. An app created on the developer dashboard with scope
   `com.intuit.quickbooks.accounting`.
4. The **Sandbox keys** tab on that app must contain:
   - Client ID
   - Client Secret
   - At least one **Redirect URI** matching what our app will send
     byte-for-byte (see §2.3).

### 2.2 Server-side prerequisites
| Requirement | Where it lives | How to verify |
|---|---|---|
| `DATABASE_URL` | env | `pnpm --filter @workspace/api-server run db:push` runs without error. |
| `QBO_CREDENTIAL_ENCRYPTION_KEY` | env (≥32 chars or base64 32-byte key) | Preflight check `encryption_key` returns `pass`. |
| `QBO_OAUTH_REDIRECT_URI` | env in production builds; optional in dev (falls back to `REPLIT_DEV_DOMAIN`) | Preflight `redirect_uri` echoes the expected URL. |
| Intuit Client ID / Secret | Admin UI → QBO connection panel (encrypted at rest in `qbo_connection`) | Preflight `stored_credentials` returns `pass`. |

### 2.3 Redirect URI rules
The redirect URI sent to Intuit is resolved by `resolveQboRedirectUri`
(see `src/services/qboRedirect.ts`). For sandbox testing, register
**both** of the following on the app's Sandbox keys tab so reviewers can
test from either environment:
- `https://<your-replit-dev-domain>/api/admin/qbo-connection/oauth/callback`
- `https://<your-deployed-domain>/api/admin/qbo-connection/oauth/callback`

The exact value resolved at runtime is shown in the preflight panel and
is what gets sent in `redirect_uri`.

### 2.4 Healthcheck before testing
Before running any scenario:
1. Open Admin → QBO Connection.
2. Click **Test configuration** (runs `runQboPreflight`). All checks
   should be `pass` (or `warn` only on `stored_credentials` if
   credentials are not yet saved).
3. Confirm the panel shows
   `mode = real`, `environment = sandbox`, `status = connected`,
   `connectionHealth = healthy` after the OAuth dance in §5.1.

---

## 3. Fixture / Seed Plan

Each test run starts from a **clean sandbox** and a **clean app org**.
We support two reset paths:

### 3.1 Recommended: dedicated test org
Create one long-lived org (e.g. `qbo-sandbox-qa`) that nothing else
uses, and reset it between runs with the steps in §10.

### 3.2 Per-run org (CI-friendly)
Mirror the pattern used in `scripts/test-qbo-services.ts`: insert an
`__test_qbo_<nanoid>` org with one System Admin user, then tear it
down with a CASCADE delete on `orgs` at the end of the run.

### 3.3 Required fixtures
| Fixture | Quantity | Notes |
|---|---|---|
| Org | 1 | `qboConnection.mode = real`, `environment = sandbox`. |
| Departments | 1+ | Any name; only used as FK on reports. |
| GL mappings | ≥3 categories | Each must point at a *real* sandbox account. See §3.4. |
| Default payable account | 1 | Set on `qboConnection.defaultPayableAccountId/Name`. Must be a real "Other Current Liability" or similar sandbox account — typical choice: `Accounts Payable (A/P)` or a custom `Employee Reimbursement Payable` you create in the sandbox first. |
| Memo template | 1 | Default `Healthtrix Expense — {displayCode} — {title}`. |
| Employee | 1 | Submitter of the test reports. |
| Manager Approver | 1 | Has role `Manager Approver`. |
| Finance Approver | 1 | Has role `Finance Approver` (also covers `Accounting Admin` / `System Admin` cases). |
| Tag | 1 | A `Project` or similar tag, assigned to the report (used by §5.7). |

### 3.4 Picking sandbox account IDs for GL mappings
1. After connecting (see §5.1), call:
   `GET /v3/company/<realmId>/query?query=select Id, Name, AccountType, Active from Account where Active = true`
2. Pick at least three Expense-type accounts (e.g. `Travel`,
   `Meals and Entertainment`, `Office Supplies`).
3. Save each `Id` and `Name` in `gl_mappings` rows for the test org's
   categories. The posting payload prefers `Id`; the `Name` is the
   human-readable fallback.
4. For the **payable** credit line, pick one Accounts Payable / Other
   Current Liability account and save it in
   `qboConnection.defaultPayableAccountId / defaultPayableAccountName`.

### 3.5 Reset between runs
- App-side: see §10. `qbo_posting_events`, `expense_reports`, and
  `audit_entries` get truncated for the test org, but credentials and
  GL mappings stay so we don't have to re-OAuth every time.
- Sandbox-side: see §10. We void/delete the JEs and Attachables created
  by the previous run via the Intuit API.

---

## 4. Test Identifiers & Conventions

- Each scenario has an id `S<n>` matching the section number below.
- "Verify in app" = check via Admin/Finance UI **and** the underlying
  DB row(s) listed.
- "Verify in sandbox" = check both the QB sandbox UI *and* an Intuit
  API query (provided per scenario) so the result is reproducible.
- Pass/Fail criteria are explicit per scenario; no scenario is "Pass"
  unless **every** bullet under "Expected" is satisfied.

---

## 5. Scenarios

### S1. OAuth connect — first-time happy path
**Preconditions:** §2 complete; org has Client ID + Secret saved; no
prior tokens stored (`accessTokenEncrypted` and
`refreshTokenEncrypted` are NULL).

**Steps:**
1. Admin UI → QBO Connection → click **Connect to QuickBooks**.
2. Browser is redirected to Intuit; sign in with the Intuit Developer
   account; pick the sandbox company; click **Connect**.
3. Intuit redirects back to
   `/api/admin/qbo-connection/oauth/callback?code=…&state=…&realmId=…`.

**Expected — in app:**
- Browser lands on `/admin/qbo?qboStatus=connected`.
- `qbo_connection` row for the org has:
  - `status = connected`, `mode = real`, `environment = sandbox`,
    `connectionHealth = healthy`.
  - `realmId`, `accessTokenEncrypted`, `refreshTokenEncrypted`,
    `tokenExpiresAt` populated.
  - `companyName` matches the sandbox company name shown by Intuit.
- An `audit_entries` row with `category = qbo_config` and a `connected`
  action exists.

**Expected — in sandbox:** (no JE yet) Just confirm the company in
`Apps → My apps → Connected apps` shows your test app as connected.

### S2. OAuth — state nonce expiry
**Preconditions:** Same as S1 plus the ability to wait ≥15 minutes
between starting and completing the dance (or manually `UPDATE
qbo_oauth_states SET expires_at = now() - interval '1 minute'`).

**Steps:** Start the dance; before completing it, expire the state row;
complete it.

**Expected:** Browser lands on `/admin/qbo?qboStatus=error&qboMessage=…`
with a message containing `expired`. No `qbo_connection` token fields
are written. `qbo_oauth_states.consumedAt` remains NULL.

### S3. OAuth — user denies consent
**Steps:** Start the dance; on Intuit's consent screen, click
**Cancel** / **Deny**.

**Expected:** Intuit returns
`?error=access_denied&error_description=…`; the callback redirects to
`/admin/qbo?qboStatus=error&qboMessage=access_denied: …`. No tokens
stored.

### S4. OAuth — invalid client credentials
**Steps:** In the admin UI, enter a bogus Client Secret; **Save**;
click **Connect**.

**Expected:** Intuit redirects with
`?error=invalid_client`; callback surfaces an error banner with
`invalid_client`. `qbo_connection` is unchanged.

### S5. OAuth — reconnect after disconnect
**Steps:** From a connected state, click **Disconnect**; immediately
click **Connect** again and complete the dance.

**Expected:**
- After Disconnect: the `qbo_connection` row has `accessTokenEncrypted = NULL`, `refreshTokenEncrypted = NULL`, `realmId = NULL`, `companyName = NULL`, `mode = stub`, `status = disconnected`, `connectionHealth = disconnected`. An `audit_entries` row with `category = qbo_config` and a disconnected action exists. In the Intuit Developer dashboard (Apps then My apps then Connected apps), the test app no longer appears connected to the sandbox company.
- After Reconnect: `accessTokenEncrypted` and `refreshTokenEncrypted` are populated and are not byte-equal to the values captured before disconnect. `status = connected`, `connectionHealth = healthy`, and a new qbo_config / connected audit row exists.

### S6. Happy-path JE post (manual approve + manual post)
**Preconditions:** S1 complete; fixtures from §3 in place;
`qboConnection.autoPostOnApproval = false`.

**Steps:**
1. As Employee, submit a multi-line report (≥3 line items spanning at
   least two of the mapped categories; total e.g. `$425.50`). Title
   `"S6 Happy Path"`.
2. As Manager Approver, approve.
3. As Finance Approver, finance-approve. Report status is
   `Finance Approved`.
4. `POST /reports/:id/post-to-qbo` (via the **Post to QuickBooks**
   button in the finance queue).

**Expected — in app:**
- Report status transitions
  `Finance Approved → Posted to QuickBooks → Ready for Payroll
  Reimbursement` (auto-advance per `finance.ts`).
- A new `qbo_posting_events` row with `status = posted`,
  `journalId` populated, `environment = sandbox`,
  `realmId` matching the connection.
- Response body is
  `{ status: "posted", journalId: "<id>", errorMessage: null, report: …}`.

**Expected — in sandbox:**
- New JE visible at `Accounting → Chart of accounts → Journal Entries`
  filtered by today's date.
- API verification:
  `GET /v3/company/<realmId>/journalentry/<journalId>?minorversion=70`
  returns:
  - `DocNumber` == report's `displayCode` (e.g. `EXP-000123`).
  - `TxnDate` == today (UTC slice).
  - `PrivateNote` == rendered memo template.
  - `Line[]` contains one `JournalEntryLineDetail` per category, each
    with `PostingType = "Debit"` and the right `AccountRef.value`
    (matches the `qboAccountId` in `gl_mappings`).
  - One trailing line with `PostingType = "Credit"`,
    `Amount = total`, `AccountRef.value = defaultPayableAccountId`.
  - Sum of debits == sum of credits == report total.

### S7. Auto-post on approval
**Preconditions:** Same as S6 except set
`qboConnection.autoPostOnApproval = true` (Admin UI → Posting
Preferences).

**Steps:** Submit a report, manager approves, finance approves. **Do
not** click Post.

**Expected — in app:** Report transitions all the way to
`Ready for Payroll Reimbursement` from a single finance-approve action.
Audit log includes a posting comment containing
`Auto-posted via Posting Preferences`.

**Expected — in sandbox:** Exactly one JE created (verify via API
query as in S6).

### S8. Attachments (multiple receipts)
**Preconditions:** S6 fixtures.

**Steps:** Create a report with 3 receipts:
- One JPG image (~1 MB).
- One PNG image (~500 KB).
- One PDF (~4 MB; below Intuit's 100 MB cap but above typical photo
  size).
Approve, finance approve, post.

**Expected — in sandbox:**
- Three `Attachable` records linked to the JE.
- API verification:
  `GET /v3/company/<realmId>/query?query=select * from Attachable
  where AttachableRef.EntityRef.value = '<journalId>'` returns
  three rows whose `FileName` and `ContentType` match what was
  uploaded.
- The QB UI shows three paperclip attachments on the JE detail screen
  and each one downloads cleanly.

### S9. Tags, memo template, and DocNumber
**Steps:**
1. Submit a report titled `"S9 Tag Test"` and assign it two tags
   (e.g. `Project Alpha` and `Q2`).
2. In Admin → Posting Preferences, override the memo template to
   `"HTI EXP {displayCode}: {title}"`.
3. Approve, finance approve, post.

**Expected — in sandbox JE:**
- `DocNumber` == report's `displayCode`.
- `PrivateNote` matches the **overridden** template
  (`HTI EXP EXP-000XXX: S9 Tag Test`).
- The JE's `Tag` field is a comma-joined string whose set of
  values equals `{ "Project Alpha", "Q2" }`. Compare as a **set** —
  the current implementation does not guarantee any particular order
  (tags are joined directly from the DB query result with no
  `ORDER BY`). If deterministic order becomes a product requirement,
  file a follow-up to sort before joining and tighten this assertion.

### S10. GL mapping fallbacks
Three sub-cases, run on three separate reports:

| Sub-case | GL mapping for category | Expected line `AccountRef.value` | Expected status |
|---|---|---|---|
| 10a | `qboAccountId = "33"` | `"33"` | `Posted to QuickBooks` |
| 10b | `qboAccountId` NULL, `qboAccount = "Travel"` | line is sent as `AccountRef = { name: "Travel" }` only (no `value`); Intuit resolves the account by name. The `gl_mappings` row is **not** auto-backfilled with the resolved Id today. Verify by inspecting the JE's `Line[].JournalEntryLineDetail.AccountRef` in the Intuit API response — `value` will be the Id Intuit chose for the "Travel" account. | `Posted to QuickBooks` |
| 10c | No mapping for the category at all | (no Intuit call made) | Stays at `Finance Approved`; UI shows error `Missing GL mapping for category "X"`; `qbo_posting_events` shows `status = error`. |

### S11. Token refresh on stale access token
**Preconditions:** S1 complete with fresh tokens.

**Steps:**
1. Force expiry: `UPDATE qbo_connection SET token_expires_at = now() -
   interval '1 minute' WHERE org_id = '<org>'`.
2. Post a report.

**Expected:** A `qbo_token_refresh_log` row with `success = true` is
written immediately before (or as part of) the post. The post succeeds.
`tokenExpiresAt` advances to ~1 hour out.

### S12. Refresh token revoked / expired
**Preconditions:** S1 complete.

**Steps:** From the Intuit dashboard, **Revoke** the connection (or
manually delete the connected app). Trigger a post.

**Expected:**
- The refresh attempt returns `400 invalid_grant`; our code maps it to
  `IntuitApiError.code = "refresh_token_revoked"`.
- `qbo_connection` flips to
  `status = error`, `connectionHealth = reconnect_required`,
  `lastTokenRefreshError = invalid_grant`.
- Report lands in `Sync Error`.
- UI banner says "QuickBooks refresh token was revoked or expired.
  Reconnect required." (verbatim from `describeIntuitError`).
- A subsequent post attempt is rejected immediately with the same
  message (no Intuit call made — confirm by inspecting outbound HTTP
  logs or by running with the dev server's verbose logger).

### S13. Intuit error handling — 401 mid-call
**Steps:** Use a debug toggle (or temporarily change the cached access
token to garbage in `qbo_connection`) and post.

**Expected:** First call returns 401; the client auto-refreshes via
`refreshIfPossible`; the retried call succeeds. `qbo_token_refresh_log`
gains a row. Net result: post succeeds, no `Sync Error`.

### S14. Intuit error handling — 429 throttling
**Steps:** Either use a real burst (≥100 reqs/sec to the sandbox query
endpoint until it 429s), or run with an injected `fetchFn` that
returns 429 with `Retry-After: 1` for the first two attempts and 200
on the third. Trigger a post.

**Expected:** The client retries with backoff (see `backoffMs`) up to
`MAX_RETRIES = 3`. Post eventually succeeds. No `Sync Error`. Console
log shows ≥2 retries.

### S15. Intuit error handling — 500
**Steps:** Inject a 500 for all attempts.

**Expected:** Client retries up to 3 times then surfaces an
`IntuitApiError(500, …)`. Report transitions to `Sync Error`; UI shows
the underlying message; `qbo_posting_events.status = error` with the
500 message persisted.

### S16. Intuit validation error (e.g. closed account)
**Steps:** In the sandbox, mark one of the mapped accounts inactive,
then post a report that uses it.

**Expected:** Intuit returns `Fault.Error[0].code = "6000"` /
`"Validation Exception"`. Report → `Sync Error`. UI message includes
"Account is not active." or the equivalent Intuit `Detail` text.
**No** retries against Intuit (validation errors are not retryable).

### S17. Retry path
**Preconditions:** A report sitting in `Sync Error` from S15 or S16.

**Steps:**
1. Fix the underlying problem (e.g. reactivate the account in §S16).
2. Click **Retry** in the finance queue (`POST
   /reports/:id/retry-qbo`).

**Expected:**
- Retry succeeds; report → `Posted to QuickBooks → Ready for Payroll
  Reimbursement`.
- **Exactly one** JE in the sandbox for this report (run the dedup
  query in §11.4).
- A new `qbo_posting_events` row with `retry = true` and
  `status = posted`.

### S18. Idempotency / duplicate prevention
**Steps:**
- Sub-case 18a: Double-click the **Post** button (open browser dev
  tools to confirm two requests fire within 100 ms).
- Sub-case 18b: With a report in `Posted to QuickBooks` (or `Ready for
  Payroll Reimbursement`), call `POST /reports/:id/post-to-qbo`
  directly.

**Expected:**
- Sub-case 18a: Exactly one JE in the sandbox; the second request gets
  a 409 `Invalid Transition` (because the report has left
  `Finance Approved`). Verify with the dedup query in §11.4.
- Sub-case 18b: 409 `Invalid Transition` with a message naming the
  current status. No JE created; no Intuit call.

### S19. Permission gating
**Steps:** As an Employee (no finance role), attempt:
- `POST /reports/:id/post-to-qbo`
- `POST /reports/:id/retry-qbo`
- `GET /reports/:id/gl-preview`

**Expected:** All return 403 `Forbidden`. The **Post to QuickBooks**
and **Retry** buttons are not rendered in the UI for the same user.

### S20. Status guardrails
For each of the following report statuses, attempt
`POST /reports/:id/post-to-qbo`:

| Status | Expected response | JE in sandbox? |
|---|---|---|
| Draft | 409, message includes "Finance Approved" | No |
| Submitted | 409 | No |
| Manager Approved | 409 | No |
| Finance Review | 409 | No |
| Posted to QuickBooks | 409 | No |
| Ready for Payroll Reimbursement | 409 | No |
| Sync Error | 409 (must use `retry-qbo`) | No |

---

## 6. Per-Scenario Sandbox Verification Recipes

### 6.1 Find the JE in the QB sandbox UI
1. Switch to the sandbox company.
2. **Reports → Journal**: filter by today's date and the user that
   posted (the connected Intuit user, not our app's user).
3. Open the JE; copy its number into the test record.

### 6.2 Find the JE via the Intuit API
```
GET https://sandbox-quickbooks.api.intuit.com/v3/company/<realmId>/journalentry/<journalId>?minorversion=70
Authorization: Bearer <accessToken>
Accept: application/json
```

### 6.3 List all JEs created today
```
GET …/query?query=select Id, DocNumber, TxnDate, TotalAmt, PrivateNote
                  from JournalEntry
                  where TxnDate = '<YYYY-MM-DD>' order by MetaData.CreateTime desc
```

### 6.4 List Attachables linked to a JE
```
GET …/query?query=select Id, FileName, ContentType, Size
                  from Attachable
                  where AttachableRef.EntityRef.type = 'JournalEntry'
                  and AttachableRef.EntityRef.value = '<journalId>'
```

### 6.5 Confirm only one JE per report
```
SELECT report_id, COUNT(*) FILTER (WHERE status = 'posted') AS posted_events
FROM qbo_posting_events WHERE report_id = '<id>' GROUP BY report_id;
-- Expect exactly 1.
```

---

## 7. Pass / Fail Criteria

A scenario is **Pass** iff:
1. Every assertion under the scenario's "Expected" block holds.
2. No unexpected rows are written to `qbo_posting_events`,
   `qbo_token_refresh_log`, or `audit_entries`.
3. No unexpected JEs or Attachables exist in the sandbox at the end of
   the scenario.

A scenario is **Fail** if any assertion fails. File a bug citing the
scenario id, the actual vs. expected values, and the JE id (if any).

A scenario is **Blocked** if it cannot be exercised because of an
environmental issue (e.g. sandbox down, missing env var). Note the
blocker; do not mark Pass.

---

## 8. Execution Tracking Template

Use a spreadsheet (one row per scenario) with columns:

| ID | Title | Result | JE Id | Notes / Bug Link | Run Date | Tester |
|---|---|---|---|---|---|---|

The plan author keeps a copy of the latest run sheet alongside this
document.

---

## 9. Environment Variables Quick Reference

| Var | Required? | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres URL for the API server. |
| `QBO_CREDENTIAL_ENCRYPTION_KEY` | Yes | AES-256-GCM key for encrypted credential blobs. ≥32 chars or base64 32-byte key. |
| `QBO_OAUTH_REDIRECT_URI` | Yes in production; optional in dev (falls back to `https://${REPLIT_DEV_DOMAIN}/api/admin/qbo-connection/oauth/callback`) | Exact redirect URI registered with Intuit. |
| `REPLIT_DEV_DOMAIN` | Auto-set in dev | Source for the dev redirect fallback. |
| `NODE_ENV` | n/a | When `production`, the redirect resolver requires `QBO_OAUTH_REDIRECT_URI`. |

---

## 10. Teardown & Reset

### 10.1 App-side reset (keeps connection + GL mappings)
```sql
-- For the test org only.
DELETE FROM qbo_posting_events
  WHERE report_id IN (SELECT id FROM expense_reports WHERE org_id = '<org>');
DELETE FROM line_items
  WHERE report_id IN (SELECT id FROM expense_reports WHERE org_id = '<org>');
DELETE FROM receipts
  WHERE report_id IN (SELECT id FROM expense_reports WHERE org_id = '<org>');
DELETE FROM expense_reports WHERE org_id = '<org>';
DELETE FROM audit_entries
  WHERE org_id = '<org>' AND category IN ('report','workflow','qbo_post');
DELETE FROM qbo_oauth_states WHERE org_id = '<org>';
```

### 10.2 App-side reset (full)
Use the existing `scripts/test-system-reset.ts` pattern, scoped to the
test org. Drops everything except the org row and its System Admin
user.

### 10.3 Sandbox-side reset
Per scenario or at the end of a run, void/delete the JEs and
Attachables we created. JEs in QBO can be deleted via:
```
POST …/journalentry?operation=delete&minorversion=70
{ "Id": "<journalId>", "SyncToken": "<currentSyncToken>" }
```
Attachables:
```
POST …/attachable?operation=delete&minorversion=70
{ "Id": "<attachableId>", "SyncToken": "<currentSyncToken>" }
```
Alternatively, the developer dashboard offers **"Reset sandbox
company data"**, which restores the sandbox to its default state. This
is the simplest option for a full reset, but it invalidates any
`gl_mappings.qboAccountId`s that pointed at custom accounts; re-run
§3.4 afterwards.

### 10.4 Resetting a connection without losing fixtures
If you need to force a fresh OAuth without disturbing GL mappings:
```sql
UPDATE qbo_connection
   SET access_token_encrypted = NULL,
       refresh_token_encrypted = NULL,
       token_expires_at = NULL,
       refresh_token_expires_at = NULL,
       realm_id = NULL,
       company_name = NULL,
       status = 'disconnected',
       connection_health = 'disconnected',
       last_token_refresh_error = NULL,
       last_sync_error = NULL
 WHERE org_id = '<org>';
```
Then click **Connect** again.

---

## 11. Manual vs. Automatable Matrix

Tag each scenario by who/what runs it.

| ID | Scenario | Manual only | Scriptable against sandbox | Already covered by stub/unit tests |
|---|---|---|---|---|
| S1 | OAuth happy path | ✅ (browser-driven) | partial (via headless browser) | — |
| S2 | OAuth state expiry | partial | ✅ (DB-only, no browser) | partial (`test-qbo-services.ts: rejects expired state`) |
| S3 | OAuth user denies | ✅ | — | — |
| S4 | OAuth invalid client | ✅ | partial | partial (preflight `client_id_recognized` covers detection) |
| S5 | Reconnect after disconnect | partial | ✅ (mockable) | partial (`disconnectQboReal wipes credentials` covers DB side) |
| S6 | Happy-path JE | partial | ✅ | — *(stub posting only)* |
| S7 | Auto-post on approval | partial | ✅ | — |
| S8 | Attachments | partial | ✅ | partial (`uploadAttachable sends multipart`) |
| S9 | Tags / memo / DocNumber | partial | ✅ | — |
| S10a-c | GL mapping fallbacks | — | ✅ | partial (10c — missing-mapping validation lives in `qbo.ts`) |
| S11 | Stale access token refresh | — | ✅ | ✅ (`createIntuitAccountingClient retries on 401 with auto-refresh`) |
| S12 | Refresh-token revoked | partial (need real Intuit revocation) | partial | ✅ for the error mapping (`refreshAccessToken maps invalid_grant`) |
| S13 | 401 mid-call | — | ✅ | ✅ |
| S14 | 429 throttling | — | ✅ (mockable) | ✅ (`retries on 5xx with backoff` — same code path) |
| S15 | 500 errors | — | ✅ | ✅ |
| S16 | Validation exception | partial (deactivate account in sandbox) | ✅ | ✅ (`postJournalEntry surfaces Intuit Fault errors`) |
| S17 | Retry path | partial | ✅ | partial |
| S18 | Idempotency | — | ✅ | partial (status guardrails covered server-side) |
| S19 | Permission gating | — | ✅ | partial |
| S20 | Status guardrails | — | ✅ | partial |

**Recommended automation order** (highest ROI first):
1. S6, S7, S10, S18, S20 — pure server-side, deterministic, give us
   the most confidence per line of code.
2. S11, S13, S14, S15 — already mockable, just wire into a
   sandbox-targeted CI job.
3. S8 — needs sandbox cleanup of Attachables; medium complexity.
4. S2, S5, S12, S16 — partial automation; some require a real
   Intuit-side action that is awkward to script.
5. S1, S3, S4 — keep manual; browser-driven OAuth flows have low
   regression risk and high test maintenance cost.
