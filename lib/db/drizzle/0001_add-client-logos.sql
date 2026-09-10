ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "logo_object_path" text,
  ADD COLUMN IF NOT EXISTS "pending_logo_object_path" text;

CREATE TABLE IF NOT EXISTS "client_access_cleanup" (
  "workspace_id" text NOT NULL,
  "user_id" text NOT NULL,
  "failed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "client_access_cleanup_workspace_user_unique"
  ON "client_access_cleanup" ("workspace_id", "user_id");
CREATE INDEX IF NOT EXISTS "client_access_cleanup_workspace_idx"
  ON "client_access_cleanup" ("workspace_id");