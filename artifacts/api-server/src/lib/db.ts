// Re-export the shared db client so route modules import from a single place.
export { db, pool } from "@workspace/db";
export * from "@workspace/db";
