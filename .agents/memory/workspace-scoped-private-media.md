---
name: Workspace-scoped private media
description: Authorization rule for private objects shared by authenticated members of one workspace.
---

Private objects intended for workspace-wide display must carry the workspace scope in their ACL policy, and reads must require the caller's authenticated workspace to match it. Private document previews must also resolve the file through an authorized project and apply the same storage ACL check before parsing; never send private documents to an external viewer.

**Why:** Owner-only private-object checks make media uploaded by one administrator unreadable to other legitimate workspace members; removing the owner check globally would weaken unrelated private objects. External viewers can expose sensitive project documents outside the workspace.

**How to apply:** Add workspace scope only to explicitly shared object classes, preserve owner-only behavior for existing private objects, and reject missing or mismatched workspace context before serving the object. For previews, authorize project and document IDs first, then enforce the storage ACL before downloading or parsing bytes; keep parsing bounded and render text or structured cells safely.