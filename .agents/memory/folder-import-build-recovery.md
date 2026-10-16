---
name: Folder import build recovery
description: Durable rules for safely recovering a folder build after a disconnected request or server interruption.
---

Treat a disconnected build request as an unknown outcome, not an immediate failure. Reconcile the exact durable session first; never infer its result from an owner-wide active-session lookup. Only rebuild when the server explicitly reports that the preserved session is retryable.

**Why:** A gateway can return an error after the server has already created the project. Blind retries can duplicate work, while fail-fast behavior strands uploads that are still usable.

**How to apply:** Keep completed imports protected, serialize builders with a database lease that has a unique owner token and heartbeat, mark only stale leases retryable, tolerate bounded status outages, and reuse attached documents when retrying an interrupted session. Every persistence and failure transition must verify the lease token so an old worker cannot overwrite a newer retry.

When restoring with no identified session, gate the recovery attempt once per authenticated provider mount and check pending dismissal before each retry and before rendering the error.

**Why:** An unstable callback dependency or a still-failing gateway can restart the restore effect after dismissal and repeatedly show the same transient 502 even though the user already hid it.

**How to apply:** Reset the one-run guard when authentication is lost; clear it through a new provider mount or an explicit new import rather than allowing ordinary rerenders to start another restore loop.

Cancellation is supported while project files are uploading, but not after project building starts.

**Why:** Client uploads can be aborted and their exact session dismissed before the server starts creating a project; once building begins, the browser cannot guarantee that stopping a request will prevent completion.

**How to apply:** Abort active transfers, wait for session creation and local file persistence, then dismiss that exact unfinished session before clearing its browser draft. Keep the server's build lock as the boundary for rejecting late cancellation attempts.