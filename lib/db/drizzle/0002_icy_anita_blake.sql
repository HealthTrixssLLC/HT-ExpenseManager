-- Migration: collapse single-role columns into role[] arrays.
--
-- Strategy (idempotent and safe for both empty and populated tables):
--   1. ADD the new array column with a temporary DEFAULT of '{}' so existing
--      rows are NOT NULL-compliant during the ALTER.
--   2. Backfill from the legacy single-role column when present
--      (`role` -> ARRAY[role], `actor_role` -> ARRAY[actor_role]).
--   3. DROP the temporary DEFAULT so application inserts must specify roles.
--   4. DROP the legacy single-role column.
--   5. Add the >=1 cardinality CHECK constraint AFTER backfill so the
--      backfill can populate values without tripping the constraint.

ALTER TABLE "users" ADD COLUMN "roles" "role"[] NOT NULL DEFAULT '{}'::"role"[];--> statement-breakpoint
UPDATE "users" SET "roles" = ARRAY["role"]::"role"[] WHERE "role" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "roles" DROP DEFAULT;--> statement-breakpoint

ALTER TABLE "approval_actions" ADD COLUMN "actor_roles" "role"[] NOT NULL DEFAULT '{}'::"role"[];--> statement-breakpoint
UPDATE "approval_actions" SET "actor_roles" = ARRAY["actor_role"]::"role"[] WHERE "actor_role" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "approval_actions" ALTER COLUMN "actor_roles" DROP DEFAULT;--> statement-breakpoint

ALTER TABLE "users" DROP COLUMN "role";--> statement-breakpoint
ALTER TABLE "approval_actions" DROP COLUMN "actor_role";--> statement-breakpoint

ALTER TABLE "users" ADD CONSTRAINT "users_roles_non_empty" CHECK (cardinality("users"."roles") > 0);--> statement-breakpoint
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_actor_roles_non_empty" CHECK (cardinality("approval_actions"."actor_roles") > 0);
