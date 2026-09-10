---
name: Workspace-scoped private media
description: Authorization rule for private objects shared by authenticated members of one workspace.
---

Private objects intended for workspace-wide display must carry the workspace scope in their ACL policy, and reads must require the caller's authenticated workspace to match it.

**Why:** Owner-only private-object checks make media uploaded by one administrator unreadable to other legitimate workspace members; removing the owner check globally would weaken unrelated private objects.

**How to apply:** Add workspace scope only to explicitly shared object classes, preserve owner-only behavior for existing private objects, and reject missing or mismatched workspace context before serving the object.