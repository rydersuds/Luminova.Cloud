ALTER TABLE "project_import_batches"
  ADD COLUMN IF NOT EXISTS "build_lease_id" text;