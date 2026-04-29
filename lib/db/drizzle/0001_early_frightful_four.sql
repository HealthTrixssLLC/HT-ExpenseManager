CREATE TABLE "manager_delegations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"from_manager_id" uuid NOT NULL,
	"to_manager_id" uuid NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"reason" text,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "manager_delegations" ADD CONSTRAINT "manager_delegations_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_delegations" ADD CONSTRAINT "manager_delegations_from_manager_id_users_id_fk" FOREIGN KEY ("from_manager_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_delegations" ADD CONSTRAINT "manager_delegations_to_manager_id_users_id_fk" FOREIGN KEY ("to_manager_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_delegations" ADD CONSTRAINT "manager_delegations_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "manager_delegations_from_idx" ON "manager_delegations" USING btree ("org_id","from_manager_id");--> statement-breakpoint
CREATE INDEX "manager_delegations_to_idx" ON "manager_delegations" USING btree ("org_id","to_manager_id");