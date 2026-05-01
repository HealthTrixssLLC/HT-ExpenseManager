# Healthtrix Expense — Web

React + Vite SPA for managers, finance, and admin users. Runs at the
artifact's `BASE_PATH` (set by the Replit workflow) and talks to the API
server at `/api`.

## Run

```sh
pnpm --filter @workspace/web run dev
```

The dev server reads `PORT` and `BASE_PATH` from the workflow environment.
Production builds (`pnpm --filter @workspace/web run build`) read those at
build time only when actually serving a dev/preview server — `vite build`
itself does not require them.

## Auth

`src/lib/auth.tsx` exports the `<AuthProvider>` component. The matching
context value and consumer hooks (`useAuth`, `useAuthedUser`) live in
`src/lib/auth-context.ts`. They are kept in separate files so each module
exports either only React components or only values/hooks — required for
Vite Fast Refresh to hot-update the provider cleanly.

`src/lib/api.ts` configures the generated `@workspace/api-client-react`
once at boot:

- `same-origin` credentials so cookies travel automatically.
- Bootstraps the in-memory CSRF token from the `ht_csrf` cookie.
- Attaches `X-CSRF-Token` to every mutating request.
