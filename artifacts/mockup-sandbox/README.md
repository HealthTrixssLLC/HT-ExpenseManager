# Canvas (mockup sandbox)

Design-only React surface for previewing components, screens, and visual
mockups in isolation. It is not part of the production product — the real
web app lives in `artifacts/web`.

## Run

```sh
pnpm --filter @workspace/mockup-sandbox run dev
```

The dev server reads `PORT` and `BASE_PATH` from the workflow environment.
Production builds (`pnpm --filter @workspace/mockup-sandbox run build`) do
not require either.

## Layout

```
src/
  components/
    mockups/          # Product mockups, grouped by feature area
    ui/               # Shared shadcn-style primitives (Button, Card, …)
  pages/              # Routed mockup pages
```
