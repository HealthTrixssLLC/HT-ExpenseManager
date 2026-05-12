ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "microsoft_subject" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "auth_provider" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_microsoft_subject_unique" ON "users" ("microsoft_subject") WHERE "microsoft_subject" IS NOT NULL;--> statement-breakpoint
-- Self-provisioned SSO users land with an empty roles array until a System
-- Admin grants them a role; the requireRole middleware still gates every
-- protected endpoint so this is safe.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_roles_non_empty";
