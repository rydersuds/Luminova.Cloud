---
name: Shell query resilience
description: Keep optional server queries from crashing shared workspace navigation.
---

Treat optional query data consumed by the shared shell as untrusted at runtime, even when its generated TypeScript type is an array. Guard before computing navigation badges or other shell-level summaries. The page that owns the query should distinguish an invalid payload from a valid empty list and show an explicit error instead of an empty-state success.

**Why:** An unexpected approvals payload once crashed the app-wide shell, making unrelated project and financial pages unusable.

**How to apply:** For cross-route badges and summaries, use runtime shape checks; keep detailed validation and retry messaging on the feature page.
