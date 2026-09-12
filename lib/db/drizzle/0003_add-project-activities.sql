CREATE TABLE IF NOT EXISTS "project_activities" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL,
  "owner_id" text NOT NULL,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "author" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);