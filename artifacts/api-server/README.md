# Healthtrix Expense — API Server

Express 5 + Drizzle backend for the Healthtrix Expense product. Mounted at
`/api` by the workspace proxy and consumed by `artifacts/web`,
`artifacts/mobile`, and the OpenAPI smoke tests.

## Run

```sh
# Dev server (the registered workflow runs this).
pnpm --filter @workspace/api-server run dev

# Smoke-test the running server (auth + /me + basic flows).
pnpm --filter @workspace/api-server run smoke
```

The server requires a Postgres `DATABASE_URL`. Apply schema with
`pnpm --filter @workspace/db run push` and seed demo data with
`pnpm --filter @workspace/scripts run seed`.

## Layout

```
src/
  app.ts               # Express setup: CORS, pino-http, session + CSRF middleware
  index.ts             # Reads PORT and starts the listener
  routes/              # Route modules (auth, finance, manager, payroll, …)
  middlewares/
    session.ts         # attachSession + requireAuth/requireRole + csrfGuard
  lib/
    auth.ts            # Password hashing + opaque session token lifecycle
    problem.ts         # HttpError + sendProblem (RFC 7807 problem+json)
    serializers.ts     # DB row → API DTO mappers
    db.ts              # Re-export of @workspace/db
  services/
    workflow.ts        # Expense-report state machine (TRANSITIONS table)
    qbo.ts             # QuickBooks posting + reconciliation helpers
```

## Authentication & CSRF

- Session tokens are opaque base64url secrets; only the SHA-256 hash is
  persisted (`sessions.tokenHash`).
- Browsers carry the secret in the HttpOnly `ht_session` cookie plus the
  readable `ht_csrf` cookie (double-submit). Mutating requests must echo
  the cookie value in the `X-CSRF-Token` header.
- Mobile clients send `Authorization: Bearer …` and the
  `X-Healthtrix-Client: ios` header; CSRF is skipped for them.
- Tokens rotate at most once per hour; rotated secrets are returned via
  `Set-Cookie` (web) or the `X-New-Session-Token` response header (mobile).

## Workflow state machine

Every status change goes through `services/workflow.ts → applyTransition()`,
which:

1. Validates the actor's role against the `TRANSITIONS` table.
2. Writes the new `expense_reports.status` (and `submittedAt` on first
   submit).
3. Inserts a sequence-numbered `approval_actions` audit row.

Pass an outer `tx` to participate in a multi-row transaction (used by the
payroll batch endpoints).
