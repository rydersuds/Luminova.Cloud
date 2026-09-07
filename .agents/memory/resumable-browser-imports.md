---
name: Resumable browser imports
description: How interrupted direct-to-storage folder imports preserve local file access without duplicating completed uploads.
---

Persist selected file blobs in browser storage for the lifetime of an unfinished import, while using the durable server session's attached relative paths as the source of truth.

**Why:** A refreshed or reopened tab loses JavaScript `File` objects, but local blobs alone cannot reliably prove whether the server committed an attachment when a response was interrupted.

**How to apply:** On recovery, reload local blobs, reconcile them against server-attached paths, upload only missing paths, and remove local blobs after the server reports completion.