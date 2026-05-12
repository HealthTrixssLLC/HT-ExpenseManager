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

## Microsoft Entra (Azure AD) sign-in

The API supports an optional second sign-in path: OIDC Authorization Code
+ PKCE against Microsoft Entra ID. It activates automatically when **all
four** of the following env vars are present, and is hidden from the SPA
otherwise:

| Variable | Purpose |
| --- | --- |
| `MS_CLIENT_ID` | Application (client) ID from the Entra app registration |
| `MS_CLIENT_SECRET` | Client secret value (NOT the secret ID) |
| `MS_TENANT_ID` | Directory (tenant) ID |
| `PUBLIC_BASE_URL` | Origin the SPA is served from, e.g. `https://expense.example.com` |

### One-time Entra app registration

1. Azure portal → **Entra ID → App registrations → New registration**.
2. Set a name (e.g. "Healthtrix Expense"), pick **Single tenant** (or
   multi-tenant if you really need it), leave the redirect URI blank for
   now, and create.
3. **Authentication → Add a platform → Web** and paste **every** redirect
   URI the API server prints at startup under
   `Microsoft sign-in enabled. Register EVERY redirect URI above…`. There
   are typically two: the production `PUBLIC_BASE_URL` callback and the
   active Replit dev domain callback. Both end in
   `/api/auth/microsoft/callback`.
4. **Authentication → Implicit grant and hybrid flows**: tick **ID tokens
   (used for implicit and hybrid flows)** so the authorize endpoint will
   issue ID tokens to the Web platform. **Front-channel logout URL**:
   leave blank — we use the end-session endpoint via top-level
   navigation, not front-channel.
5. **Certificates & secrets → New client secret** → copy the *Value* (not
   the *Secret ID*) and set it as `MS_CLIENT_SECRET`.
6. **Token configuration → Add optional claim → ID → email**. (Microsoft
   may not include `email` by default for personal accounts.)
7. **API permissions** already include `User.Read` by default; that's
   enough — we only need `openid profile email offline_access`.

### Matching policy

On callback we look the user up by Microsoft `oid` first (stable across
email changes), then by lowercased `email`. If the email matches more
than one organization the sign-in is refused. New users are
self-provisioned with **no roles** — a System Admin must grant a role
before they can do anything in the app.

Sessions issued via Microsoft set `users.auth_provider = 'microsoft'`.
The sign-out endpoint detects this and returns a federated end-session
URL the SPA navigates to so the user is signed out at the IdP too.

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
