---
name: Quote source immutability
description: Why reviewed quote uploads use a one-time authenticated content upload and stay outside project-folder rescans.
---

An uploaded vendor quote's original must become immutable before AI extraction or confirmation. Do not replace the one-time authenticated upload with an ordinary reusable signed PUT URL without an equivalent sealing step.

**Why:** A still-valid signed PUT can replace bytes after verification, so the saved original could differ from what the user reviewed. Upload identity must also remain distinct from a retryable AI draft and a confirmed quote.

**How to apply:** Preserve the server-owned reservation lifecycle and serialize content upload, confirmation, and cancellation. Serve originals through current-workspace/project authorization, not owner-only generic storage access.

Reviewed uploads are not inputs to automatic project-folder quote rescans.

**Why:** The user explicitly requested reviewed quote details, not automatic replacement of their corrections during a later file scan.

**How to apply:** Keep source links and reviewed fields intact when adding new scan or organization features; any re-analysis should remain an explicit review action.
