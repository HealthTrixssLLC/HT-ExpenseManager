# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Healthtrix Expense backend

The Healthtrix Expense REST API lives at `artifacts/api-server` and is the
canonical backend for the Healthtrix Expense product (mockups under
`artifacts/mockup-sandbox/src/components/mockups/healthtrix-expense/`).

- **Runtime workflow**: `artifacts/api-server: API Server` (artifact-managed
  via `artifacts/api-server/.replit-artifact/artifact.toml`, kind=api,
  port 8080, mounted at `/api`). This artifact-provided workflow is the
  single runtime entrypoint — there is no separate plain-`.replit` "API
  Server" workflow because both would bind 8080.
- **Codegen**: regenerate the OpenAPI client + Zod schemas with
  `pnpm --filter @workspace/api-spec run codegen` (also exposed via the
  `API Spec Codegen` workflow).
- **DB schema push**: `pnpm --filter @workspace/db run push`.
- **Seed**: `pnpm --filter @workspace/scripts run seed` wipes the DB,
  recreates the demo dataset, **prints all credentials to stdout**, and
  rewrites `.local/tasks/healthtrix-backend-credentials.md`. That
  markdown file is the **single source of truth** for the seeded
  fixture identities (org name, user emails, shared password). Web and
  iOS agents must read credentials from that file rather than hard-coding
  email domains, since the seed contract may evolve.
- **Smoke**: `pnpm --filter @workspace/api-server run smoke` runs all
  24 end-to-end checks against a live server.
- **Encryption test**: `pnpm --filter @workspace/api-server run test:encryption`
  runs the standalone unit suite for `src/lib/encryption.ts` (AES-256-GCM
  round-trip, tamper rejection, wrong-key rejection, masking).

## QuickBooks Online integration

The QBO integration runs in two modes per org, selected automatically:
- **Stub mode**: simulated connection used in demos and dev. No external
  network traffic; posting fakes a `qboJournalId`.
- **Real mode**: per-org Intuit OAuth (Sandbox or Production). Activates as
  soon as the admin saves a Client ID + Client Secret.

Key pieces:
- **Encryption**: `artifacts/api-server/src/lib/encryption.ts` — AES-256-GCM
  keyed by the `QBO_CREDENTIAL_ENCRYPTION_KEY` env var (any string; SHA-256
  is used to derive the 32-byte key). All Intuit Client IDs/Secrets, access
  tokens and refresh tokens are encrypted at rest.
- **Intuit client**: `artifacts/api-server/src/services/intuitClient.ts` —
  raw HTTP client for Intuit OAuth (`/oauth2/v1/tokens`, revoke) and the
  Accounting API (JournalEntry, Attachable, Account query) with retries.
- **QBO service**: `artifacts/api-server/src/services/qbo.ts` — encryption
  helpers, mode detection, OAuth start/callback/disconnect, real
  JournalEntry posting, receipts uploaded as Attachables, tag assignments,
  COA cache, token refresh job, audit logging under category `qbo`.
- **OAuth callback**: public route at
  `/api/admin/qbo-connection/oauth/callback` (registered in
  `routes/qboOauth.ts` before `requireAuth`). Redirects back to
  `/admin/qbo?qboStatus=connected|error&qboMessage=...`.
- **Token refresh**: `index.ts` schedules a sweep 30 s after boot and every
  15 min thereafter (gated by `NODE_ENV !== "test"`).
- **Admin UI**: `artifacts/web/src/pages/admin/QboPage.tsx` (Configuration,
  Connection, Health, Posting Preferences, Posting History, Reconnect
  banner) + `QboTagsPage.tsx` (CRUD for org tags) +
  `GlMappingPage.tsx` (typeahead account picker for real-mode, free text
  for stub) + `AuditLogPage.tsx` (category filter, QBO event labels).
- **Report tags**: `ReportTagPicker` on the report detail page lets admins
  toggle org-wide tags onto a report; tags are sent on the JournalEntry.

## Healthtrix Expense Help Center

A data-driven, in-app Help Center is available on both the web and mobile apps.
Content is duplicated (not shared via package, to avoid metro bundler complexity)
between:
- `artifacts/web/src/lib/help/{types.ts,content.ts}`
- `artifacts/mobile/lib/help/{types.ts,content.ts}`

Categories cover Getting started, Employees, Managers, Finance, Admin, Reports,
Reference (status/role glossaries, workflow diagram, policy), Troubleshooting,
and FAQ. Each topic is a typed `HelpTopic` rendered through `HelpBlocks`
(paragraphs, lists, steps, callouts, tables, ascii diagrams).

- Web routes: `/help`, `/help/:id` (wouter), sidebar entry "Help center" in
  `AppShell.tsx` Account section, contextual `<HelpLink topicId="..."/>`
  components on key pages (employee/manager/finance/admin).
- Mobile screens: `app/help/index.tsx` (browse + search) and
  `app/help/[id].tsx` (topic). Profile tab links to Help center / policy /
  troubleshooting; tab headers show a `HelpHeaderButton`; the Add line item
  modal and report detail expose contextual `HelpLink`s.
- Search uses an in-memory `searchTopics(query)` that scores against title /
  summary / keywords / role tags. No backend, no CMS, English only.

## Backup, Restore & System Reset (System Admin)

- **Per-org backup / restore** (`GET /api/admin/backup`, `POST /api/admin/restore`):
  exports/imports a single org as a ZIP with `manifest.json` plus per-table
  JSON payloads, optionally including receipt blobs. Restore verifies the
  backup belongs to the same org. Implemented in
  `artifacts/api-server/src/services/backup/index.ts`.

- **Full-system factory reset** (`GET /api/admin/system-backup`,
  `POST /api/admin/system-reset`, body `{ confirm: "RESET" }`): wipes every
  org's operational data, deletes receipt blobs (best-effort), preserves
  the orgs row + the acting admin's user/session, re-seeds factory
  defaults, and writes one `qbo_config`/`deleted` audit entry per org the
  admin belongs to. Service: `artifacts/api-server/src/services/systemReset.ts`.
  UI lives in the third card of `BackupRestorePage.tsx`; the destructive
  button is disabled until the safety-net backup is downloaded, and a
  successful reset auto-logs out after ~2.5s.

- **Factory defaults** (12 GL categories + 3 policy rules) live in
  `lib/db/src/orgDefaults.ts` and are imported by both
  `scripts/src/seed.ts` (new-org seed) and `services/systemReset.ts`
  (post-wipe re-seed) so a freshly-created org and a freshly-reset org
  have identical starting state.

- Tests: `pnpm --filter @workspace/api-server run test:system-reset`
  exercises backup zipping, multi-org wipe, admin preservation,
  factory re-seed, audit shape, and missing-actor error against the
  real DB.
