// Zod schemas generated from the OpenAPI spec. These are the runtime
// validators (and inferred types) that both the api client and the API
// server uses.
// The names also act as TS types when used with `z.infer<typeof X>` or directly
// (zod schemas have an inferred output type).
export * from "./generated/api";

// TypeScript-only type aliases generated alongside the zod schemas. They share
// names with the zod schemas above (e.g. `LoginBody`), so we re-export them as
// `types` instead of merging them into the value namespace.
export * as types from "./generated/types";
