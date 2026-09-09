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