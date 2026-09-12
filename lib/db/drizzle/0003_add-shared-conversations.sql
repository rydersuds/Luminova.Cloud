ALTER TABLE "project_conversations" ADD COLUMN IF NOT EXISTS "type" text DEFAULT 'project' NOT NULL;
ALTER TABLE "project_conversations" ALTER COLUMN "project_id" DROP NOT NULL;
ALTER TABLE "project_messages" ALTER COLUMN "project_id" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "conversation_participants" (
  "conversation_id" text NOT NULL,
  "workspace_id" text NOT NULL,
  "user_id" text NOT NULL,
  "added_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "conversation_participants_conversation_user_unique"
  ON "conversation_participants" ("conversation_id", "user_id");
CREATE INDEX IF NOT EXISTS "conversation_participants_workspace_user_idx"
  ON "conversation_participants" ("workspace_id", "user_id");

INSERT INTO "conversation_participants" ("conversation_id", "workspace_id", "user_id", "added_by")
SELECT "id", "workspace_id", "owner_id", "owner_id"
FROM "project_conversations"
ON CONFLICT ("conversation_id", "user_id") DO NOTHING;