# Healthtrix Expense — Mobile

Expo / React Native app for employees: capture receipts, file expense
reports, view approval status. Runs against the same API server as the web
app (`/api`), authenticated with bearer tokens stored in Expo SecureStore.

## Run

```sh
pnpm --filter @workspace/mobile run dev
```

The dev workflow uses `CI=1` so Expo never blocks waiting for an
interactive prompt.

## Build

```sh
pnpm --filter @workspace/mobile run build
```

This bundles the JS for both platforms via `scripts/build.js`, which:

1. Boots a one-shot Metro server (`METRO_PORT`, default `19006`).
2. Downloads each platform bundle + asset manifest.
3. Writes the static deployment under `dist/`.

The build is heavyweight (multi-minute) and is intended to run as part of
the deployment pipeline rather than on every workspace build. Override
`METRO_PORT` if `19006` is busy on the machine.

## Auth

`src/lib/auth.ts` configures `@workspace/api-client-react` for mobile use:

- `setAuthTokenGetter(...)` reads the bearer token from SecureStore.
- `setBaseUrl(...)` points at the API host (defaults to the workspace
  domain in dev; configurable for production).
- The `X-Healthtrix-Client: ios` header opts the request out of CSRF
  enforcement on the server.
