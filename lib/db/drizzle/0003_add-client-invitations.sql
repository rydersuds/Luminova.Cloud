CREATE TABLE IF NOT EXISTS "client_invitations" (
  "id" text PRIMARY KEY NOT NULL,
  "invitation_id" text NOT NULL,
  "workspace_id" text NOT NULL,
  "client_id" text NOT NULL,
  "email" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "client_invitations_workspace_invitation_unique"
  ON "client_invitations" ("workspace_id", "invitation_id");
CREATE UNIQUE INDEX IF NOT EXISTS "client_invitations_workspace_client_email_unique"
  ON "client_invitations" ("workspace_id", "client_id", "email");
CREATE INDEX IF NOT EXISTS "client_invitations_workspace_idx"
  ON "client_invitations" ("workspace_id");
CREATE INDEX IF NOT EXISTS "client_invitations_client_idx"
  ON "client_invitations" ("client_id");