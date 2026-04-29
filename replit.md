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
