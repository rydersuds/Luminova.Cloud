---
name: Project import AI diagnostics
description: Safe provider error logging and failure classification for project-folder analysis.
---

Project-import AI failures must retain the specific sub-step and a normalized category/status, but must not log raw provider messages, response bodies, request payloads, or credentials. Keep document enrichment and internal-budget extraction best-effort; only project analysis should block project creation.

**Why:** Provider errors can be inconsistent across SDK and proxy layers, and raw details can echo private document content. Treating every unknown failure as an outage also sends users toward retries that cannot fix input or configuration problems.

**How to apply:** Normalize nested and SDK error shapes into safe status/code/type fields, classify temporary provider failures separately from configuration and content failures, and preserve the existing import session for any retry that remains valid.
