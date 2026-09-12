ALTER TABLE "project_import_batches"
  ADD COLUMN IF NOT EXISTS "workspace_id" text NOT NULL DEFAULT 'default';

ALTER TABLE "imported_projects"
  ADD COLUMN IF NOT EXISTS "workspace_id" text NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS "imported_projects_workspace_idx"
  ON "imported_projects" ("workspace_id");