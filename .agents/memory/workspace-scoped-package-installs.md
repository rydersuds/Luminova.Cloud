---
name: Workspace-scoped package installs
description: How to add dependencies to a child package when the managed installer only attempts workspace-root installation.
---

When a dependency belongs to one pnpm workspace package, keep it in that package's manifest rather than installing it at the root.

**Why:** The managed language-package installer may invoke `pnpm add` at the workspace root and reject the operation, while also rejecting pnpm flags as package tokens.

**How to apply:** Update the intended child package manifest incrementally, then run the workspace-root `pnpm install --no-frozen-lockfile` so the lockfile and links are generated consistently.