---
name: Workspace invitation lifecycle
description: Safety rules for linking provider-owned invitations to workspace-scoped local access.
---

Provider identities are global even when access is workspace-scoped. Preserve every workspace an identity already belongs to when adding or removing organization access.

**Why:** Losing implicit default membership or confusing organization removal with identity deletion can revoke access outside the administering workspace.

**How to apply:** Materialize implicit default membership before adding the first organization. Scope roles and local access to the active workspace, block workspace admins from changing global identity fields for shared users, and delete the provider identity only when no default or organization membership remains.