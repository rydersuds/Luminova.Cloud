CREATE TABLE IF NOT EXISTS "standalone_vendor_profiles" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "seed_key" text NOT NULL,
  "data" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "standalone_vendor_profiles_workspace_seed_unique"
  ON "standalone_vendor_profiles" ("workspace_id", "seed_key");

CREATE INDEX IF NOT EXISTS "standalone_vendor_profiles_workspace_idx"
  ON "standalone_vendor_profiles" ("workspace_id");