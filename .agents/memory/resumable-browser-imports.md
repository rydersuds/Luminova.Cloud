---
name: Resumable browser imports
description: How interrupted direct-to-storage folder imports preserve local file access without duplicating completed uploads.
---

Persist selected file blobs in browser storage for the lifetime of an unfinished import, while using the durable server session's attached relative paths as the source of truth.

**Why:** A refreshed or reopened tab loses JavaScript `File` objects, but local blobs alone cannot reliably prove whether the server committed an attachment when a response was interrupted.

**How to apply:** On recovery, reload local blobs, reconcile them against server-attached paths, upload only missing paths, and remove local blobs after the server reports completion.

Browser harnesses that simulate an inaccessible localStorage object should install the failure immediately before the recovery response or dismissal check, not during document initialization.

**Why:** The app's startup/auth dependencies may read localStorage for unrelated session policy, so blocking the object too early can prevent the import provider from mounting and produce a false test failure.

**How to apply:** Keep method-level storage failures active during startup, then inject the object-access failure at the mocked recovery request before asserting session-scoped dismissal and full-refresh behavior.

Import-error dismissal must be durable on the server, not only recorded in browser storage. A new import also retires older failed or unfinished sessions so a historical failure cannot reappear after the newer import completes.

**Why:** Browser storage can be cleared, unavailable, or device-specific. If the server keeps returning the same failed session, a locally dismissed error resurfaces indefinitely.

**How to apply:** Exclude server-dismissed sessions from active and exact recovery lookups, migrate existing browser dismissal markers by persisting them during restore, and keep dismissal separate from destructive uploaded-file cleanup.