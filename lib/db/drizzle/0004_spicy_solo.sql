DO $$ BEGIN CREATE TYPE "public"."qbo_connection_health" AS ENUM('healthy', 'refresh_failed', 'reconnect_required', 'disconnected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."qbo_connection_mode" AS ENUM('stub', 'real'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."qbo_environment" AS ENUM('sandbox', 'production'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."audit_category" AS ENUM('report', 'qbo'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
ALTER TYPE "public"."qbo_posting_status" ADD VALUE IF NOT EXISTS 'retried' BEFORE 'error';--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE IF NOT EXISTS 'qbo_config';--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE IF NOT EXISTS 'qbo_tag';--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE IF NOT EXISTS 'qbo_mapping';--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE IF NOT EXISTS 'qbo_posting';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "qbo_accounts_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"qbo_account_id" text NOT NULL,
	"name" text NOT NULL,
	"fully_qualified_name" text NOT NULL,
	"account_type" text NOT NULL,
	"account_sub_type" text,
	"classification" text,
	"active" boolean DEFAULT true NOT NULL,
	"sync_token" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "qbo_oauth_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"state" text NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "qbo_tag_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "qbo_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "qbo_token_refresh_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"success" boolean NOT NULL,
	"error_message" text,
	"expires_in_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "qbo_vendor_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"qbo_vendor_id" text NOT NULL,
	"display_name" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_entries" ALTER COLUMN "report_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "gl_mappings" ADD COLUMN IF NOT EXISTS "qbo_account_type" text;--> statement-breakpoint
ALTER TABLE "audit_entries" ADD COLUMN IF NOT EXISTS "category" "audit_category" DEFAULT 'report' NOT NULL;--> statement-breakpoint
ALTER TABLE "qbo_connection" ADD COLUMN IF NOT EXISTS "mode" "qbo_connection_mode" DEFAULT 'stub' NOT NULL;--> statement-breakpoint
ALTER TABLE "qbo_connection" ADD COLUMN IF NOT EXISTS "environment" "qbo_environment" DEFAULT 'sandbox' NOT NULL;--> statement-breakpoint
ALTER TABLE "qbo_connection" ADD COLUMN IF NOT EXISTS "client_id_encrypted" text;--> statement-breakpoint
ALTER TABLE "qbo_connection" ADD COLUMN IF NOT EXISTS "client_secret_encrypted" text;--> statement-breakpoint
ALTER TABLE "qbo_connection" ADD COLUMN IF NOT EXISTS "access_token_encrypted" text;--> statement-breakpoint
ALTER TABLE "qbo_connection" ADD COLUMN IF NOT EXISTS "refresh_token_encrypted" text;--> statement-breakpoint
ALTER TABLE "qbo_connection" ADD COLUMN IF NOT EXISTS "token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "qbo_connection" ADD COLUMN IF NOT EXISTS "refresh_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "qbo_connection" ADD COLUMN IF NOT EXISTS "last_token_refresh_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "qbo_connection" ADD COLUMN IF NOT EXISTS "last_token_refresh_error" text;--> statement-breakpoint
ALTER TABLE "qbo_connection" ADD COLUMN IF NOT EXISTS "connection_health" "qbo_connection_health" DEFAULT 'disconnected' NOT NULL;--> statement-breakpoint
ALTER TABLE "qbo_connection" ADD COLUMN IF NOT EXISTS "auto_post_on_approval" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "qbo_connection" ADD COLUMN IF NOT EXISTS "default_memo_template" text;--> statement-breakpoint
ALTER TABLE "qbo_connection" ADD COLUMN IF NOT EXISTS "default_payable_account_id" text;--> statement-breakpoint
ALTER TABLE "qbo_connection" ADD COLUMN IF NOT EXISTS "default_payable_account_name" text;--> statement-breakpoint
ALTER TABLE "qbo_connection" ADD COLUMN IF NOT EXISTS "last_successful_post_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "qbo_connection" ADD COLUMN IF NOT EXISTS "last_failed_post_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "qbo_posting_events" ADD COLUMN IF NOT EXISTS "qbo_journal_id" text;--> statement-breakpoint
ALTER TABLE "qbo_posting_events" ADD COLUMN IF NOT EXISTS "qbo_sync_token" text;--> statement-breakpoint
ALTER TABLE "qbo_posting_events" ADD COLUMN IF NOT EXISTS "environment" "qbo_environment" DEFAULT 'sandbox' NOT NULL;--> statement-breakpoint
ALTER TABLE "qbo_posting_events" ADD COLUMN IF NOT EXISTS "realm_id" text;--> statement-breakpoint
ALTER TABLE "qbo_posting_events" ADD COLUMN IF NOT EXISTS "attachable_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "qbo_posting_events" ADD COLUMN IF NOT EXISTS "tags_sent" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "qbo_accounts_cache" ADD CONSTRAINT "qbo_accounts_cache_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "qbo_oauth_states" ADD CONSTRAINT "qbo_oauth_states_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "qbo_tag_assignments" ADD CONSTRAINT "qbo_tag_assignments_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "qbo_tag_assignments" ADD CONSTRAINT "qbo_tag_assignments_report_id_expense_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."expense_reports"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "qbo_tag_assignments" ADD CONSTRAINT "qbo_tag_assignments_tag_id_qbo_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."qbo_tags"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "qbo_tags" ADD CONSTRAINT "qbo_tags_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "qbo_token_refresh_log" ADD CONSTRAINT "qbo_token_refresh_log_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "qbo_vendor_cache" ADD CONSTRAINT "qbo_vendor_cache_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "qbo_vendor_cache" ADD CONSTRAINT "qbo_vendor_cache_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "qbo_accounts_cache_org_account_unique" ON "qbo_accounts_cache" USING btree ("org_id","qbo_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qbo_accounts_cache_org_idx" ON "qbo_accounts_cache" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "qbo_oauth_states_state_unique" ON "qbo_oauth_states" USING btree ("state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qbo_oauth_states_org_idx" ON "qbo_oauth_states" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "qbo_tag_assignments_report_tag_unique" ON "qbo_tag_assignments" USING btree ("report_id","tag_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qbo_tag_assignments_report_idx" ON "qbo_tag_assignments" USING btree ("report_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "qbo_tags_org_name_unique" ON "qbo_tags" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qbo_token_refresh_log_org_idx" ON "qbo_token_refresh_log" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "qbo_vendor_cache_org_user_unique" ON "qbo_vendor_cache" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qbo_vendor_cache_org_idx" ON "qbo_vendor_cache" USING btree ("org_id");