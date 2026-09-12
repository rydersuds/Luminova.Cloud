ALTER TABLE "project_documents"
  ADD COLUMN IF NOT EXISTS "is_entry_agreement" boolean DEFAULT false NOT NULL;

CREATE TABLE IF NOT EXISTS "project_schedule_metadata" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL,
  "image_id" text NOT NULL,
  "workspace_id" text NOT NULL,
  "revision" text,
  "effective_date" date,
  "is_current" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "project_schedule_metadata_project_image_idx"
  ON "project_schedule_metadata" ("project_id", "image_id");

CREATE UNIQUE INDEX IF NOT EXISTS "project_schedule_metadata_current_idx"
  ON "project_schedule_metadata" ("project_id", "workspace_id")
  WHERE "is_current" = true;

CREATE TABLE IF NOT EXISTS "schedule_upload_reservations" (
  "object_path" text PRIMARY KEY NOT NULL,
  "owner_id" text NOT NULL,
  "project_id" text NOT NULL,
  "size" integer NOT NULL,
  "content_type" text NOT NULL,
  "status" text DEFAULT 'reserved' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);