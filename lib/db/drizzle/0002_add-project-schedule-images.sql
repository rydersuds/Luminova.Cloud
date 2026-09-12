CREATE TABLE IF NOT EXISTS "project_schedule_images" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL,
  "owner_id" text NOT NULL,
  "workspace_id" text NOT NULL,
  "object_path" text NOT NULL,
  "name" text NOT NULL,
  "relative_path" text NOT NULL,
  "content_type" text NOT NULL,
  "size" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "project_schedule_images_object_path_unique" UNIQUE("object_path")
);