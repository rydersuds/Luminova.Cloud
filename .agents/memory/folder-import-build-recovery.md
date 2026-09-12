---
name: Folder import build recovery
description: Durable rules for safely recovering a folder build after a disconnected request or server interruption.
---

Treat a disconnected build request as an unknown outcome, not an immediate failure. Reconcile the exact durable session first; never infer its result from an owner-wide active-session lookup. Only rebuild when the server explicitly reports that the preserved session is retryable.

**Why:** A gateway can return an error after the server has already created the project. Blind retries can duplicate work, while fail-fast behavior strands uploads that are still usable.

**How to apply:** Keep completed imports protected, serialize builders with a database lease that has a unique owner token and heartbeat, mark only stale leases retryable, tolerate bounded status outages, and reuse attached documents when retrying an interrupted session. Every persistence and failure transition must verify the lease token so an old worker cannot overwrite a newer retry.