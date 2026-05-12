ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "auth_method" text NOT NULL DEFAULT 'password';
