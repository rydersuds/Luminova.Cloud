ALTER TABLE "project_import_batches"
  ADD COLUMN IF NOT EXISTS "failure_stage" text,
  ADD COLUMN IF NOT EXISTS "retryable" boolean NOT NULL DEFAULT true;
