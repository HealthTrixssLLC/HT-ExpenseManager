# Healthtrix Expense

A pnpm-workspace monorepo containing the four artifacts that make up the
Healthtrix Expense product:

| Artifact                   | Path                          | Kind    | Description                                                  |
| -------------------------- | ----------------------------- | ------- | ------------------------------------------------------------ |
| **API Server**             | `artifacts/api-server`        | api     | Express 5 + Drizzle backend; mounted at `/api`.              |
| **Healthtrix Expense Web** | `artifacts/web`               | web     | React + Vite SPA for managers, finance, and admins.          |
| **Healthtrix Expense Mobile** | `artifacts/mobile`         | mobile  | Expo / React Native app for employees.                       |
| **Canvas (mockup sandbox)**| `artifacts/mockup-sandbox`    | design  | React preview surface for design-only components / mockups.  |

Shared packages (`lib/*`) provide the database schema (`@workspace/db`),
generated OpenAPI artefacts (`@workspace/api-spec`), Zod schemas
(`@workspace/api-zod`), and the React-Query API client
(`@workspace/api-client-react`).

## First-time setup

```sh
# 1. Install all workspace dependencies.
pnpm install

# 2. Push the database schema (dev only — wipes nothing, additive).
pnpm --filter @workspace/db run push

# 3. Seed demo data (orgs, users, reports). Prints credentials to stdout
#    and rewrites .local/tasks/healthtrix-backend-credentials.md.
pnpm --filter @workspace/scripts run seed
```

The Replit workspace then runs every artifact through its registered
workflow. From the shell you can restart any of them individually:

| Workflow                                        | Command                                            |
| ----------------------------------------------- | -------------------------------------------------- |
| `artifacts/api-server: API Server`              | `pnpm --filter @workspace/api-server run dev`      |
| `artifacts/web: web`                            | `pnpm --filter @workspace/web run dev`             |
| `artifacts/mobile: expo`                        | `pnpm --filter @workspace/mobile run dev`          |
| `artifacts/mockup-sandbox: Component Preview Server` | `pnpm --filter @workspace/mockup-sandbox run dev` |
| `API Spec Codegen`                              | `pnpm --filter @workspace/api-spec run codegen`    |

## Day-to-day commands

```sh
# Typecheck the whole workspace.
pnpm -w run typecheck

# Build every package that has a build script (web, api-server, libs).
# NOTE: artifacts/mobile's build is a heavyweight Expo bundle (Metro server +
# multi-platform downloads); it can take many minutes and is intended to run
# during deployment, not on every workspace build.
pnpm -w run build

# Regenerate the OpenAPI client + Zod schemas after editing the spec.
pnpm --filter @workspace/api-spec run codegen

# Smoke-test the running API server (auth, /me, basic flows).
pnpm --filter @workspace/api-server run smoke
```

## Repository layout

```
artifacts/
  api-server/    # Express + Drizzle backend (single runtime entrypoint at /api)
  web/           # React + Vite SPA
  mobile/        # Expo / React Native app
  mockup-sandbox/ # Design-only mockups and component previews
lib/
  db/            # Drizzle schema, migrations, and pooled client
  api-spec/      # OpenAPI source spec
  api-client-react/  # Generated React-Query client + customFetch
  api-zod/       # Generated Zod schemas
  scripts/       # Seed + maintenance scripts
```

## Authentication

The API server issues opaque base64url session tokens hashed in
`sessions.tokenHash`. Browsers receive them in an HttpOnly cookie plus a
paired CSRF cookie; the mobile app receives the same secret via
`Authorization: Bearer …` and identifies itself with the `X-Healthtrix-Client`
header. See `artifacts/api-server/src/lib/auth.ts` and
`artifacts/api-server/src/middlewares/session.ts` for the full design.

## Workflow state machine

Expense reports move through a finite set of statuses
(`Draft → Submitted → Manager Review → … → Reconciled / Voided`) defined in
`artifacts/api-server/src/services/workflow.ts`. Routes never mutate
`expense_reports.status` directly — they call `applyTransition(...)`, which
validates the actor's role and writes the audit row.

## Conventions

- **No floats for money.** Amounts use `numeric(14,2)` in Postgres and round-
  trip through `string` in TypeScript.
- **Generated code is checked in.** Re-run codegen after editing
  `lib/api-spec/openapi.yaml`; never hand-edit the files under
  `lib/api-client-react/src/generated` or `lib/api-zod/src/generated`.
- **Workflows over `node …`.** Use the registered Replit workflows; they
  inject the right `PORT`/`BASE_PATH` for each artifact.
