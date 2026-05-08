# Web Regression Tests

This file documents end-to-end regression tests for the web app. Each test
plan is run via the project's testing skill (`runTest`), which drives a real
Playwright browser against the running web + api-server workflows.

To execute a plan, an agent calls `runTest({ testPlan: "...", ... })` with
the plan body below.

---

## RT-042: Report detail page must not show spurious 404 toast

**Origin:** Task #42

**Symptom:** Opening `/web/reports/{id}` would briefly flash a red destructive
toast titled `HTTP 404 / Not Found`, even though the report rendered correctly.
Root cause: an auxiliary background read (or a transient state on a
sub-resource) returned 404, and `queryClient.ts`'s default error handler
toasted every 4xx.

**Fix:** Two-layer.

1. `queryClient.ts` exports `SILENT_404_META = { silent404: true }`.
   `shouldSurfaceQueryError` only suppresses 404 toasts when
   `query.meta.silent404 === true`. Mutations and the primary `useGetReport`
   still toast.
2. Auxiliary on-mount reads in the report detail tree carry `SILENT_404_META`:
   `useListLineItems`, `useListReceipts`, `useGetReportTimeline`,
   `useListReportTags`, `useListActiveQboTags`, `useGetReceiptDownloadUrl`,
   `useListDepartments`, `useListCategories`.
3. `artifacts/api-server/src/app.ts` adds an `/api/*` catch-all that returns
   `application/problem+json` so any future 404 surfaces as a self-describing
   toast (`Not Found / No handler for METHOD /path`) instead of generic HTML.

### Setup

Test users (dev DB, password reset to bcrypt of `Healthtrix!2026`):
- `jaybaker@healthtrixss.com` — owns `32dd752b-ff4a-43ea-9765-0ff33308c86c`
  (PDF receipts) and is manager for `5491537e-761a-451f-a02f-1df5ef1f681c`
  (image receipts).

### Test Plan

1. New browser context.
2. Navigate to `/web/login`.
3. Fill `input-email` `jaybaker@healthtrixss.com`, `input-password`
   `Healthtrix!2026`, click `button-login`.
4. Navigate to `/web/reports/32dd752b-ff4a-43ea-9765-0ff33308c86c`.
   Observe for 6 seconds.
5. **Assert:** report title visible; NO element with `class*="destructive"`
   visible at any point in the window; no toast contains "404" or "Not Found".
   Capture every `/api/*` request that returned 404 (expected: none).
6. Navigate to `/web/reports/5491537e-761a-451f-a02f-1df5ef1f681c`. Observe
   6 seconds. Same assertion. Image receipts should attempt thumbnail
   downloads — any incidental 404 must NOT surface as a toast.
7. **Positive control:** navigate to
   `/web/reports/00000000-0000-0000-0000-000000000000`. The primary
   `useGetReport` carries no silence meta, so a destructive toast SHOULD
   appear and / or an error state should render. This proves the suppression
   is opt-in only and real "report not found" errors remain visible.

### Pass Criteria

- Real reports (steps 5–6): zero destructive toasts during the observation
  window.
- Positive control (step 7): exactly one destructive toast OR explicit error
  state for the bogus ID.

### Last Run

2026-05-01 — PASSED. Real reports observed clean for 6s each; positive
control produced exactly one expected "Not Found" toast.
