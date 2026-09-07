---
name: Merged route reloads
description: Why post-merge API builds must also wake the managed development watcher.
---

After a merge updates API routes, force a filesystem event on the API entrypoint after the build completes.

**Why:** Git can replace watched files in a way that does not reliably wake the long-running development watcher. The shared preview proxy can then be configured correctly while the active API process still serves an old route table.

**How to apply:** Keep this lifecycle nudge in the post-merge setup whenever API route changes are expected to become visible without manually restarting the managed artifact workflow.