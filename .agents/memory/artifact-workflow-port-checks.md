---
name: Artifact workflow port checks
description: Diagnosing stale or duplicate Replit artifact service processes during restarts.
---

After stopping or restarting an artifact workflow, verify the actual listening port as well as the managed workflow status and logs. A workflow can appear running while an earlier process still owns the port, or remain running without an active listener.

**Why:** A duplicate API service caused `EADDRINUSE` during restart even though the managed workflow status alone did not identify the stale process state.

**How to apply:** Use the existing artifact workflow controls, inspect the expected port before retrying, restart one service at a time, and avoid killing processes by guessed PID.

Stopping the managed workflow may leave earlier duplicate pnpm/tsx/Vite process trees alive after merge reconciliation. If ports still conflict, identify stale trees by their exact executable arguments and working directory before terminating them; substring matching can accidentally include the diagnostic shell itself.

**Why:** Reconciliation has left multiple development servers running while the currently managed server failed to bind, producing gateway errors instead of a working preview.

**How to apply:** Stop the managed services first, inspect the remaining process trees and listeners, remove only verified stale service trees, then restart each managed service once. When socket utilities are unavailable, inspect `/proc/net/tcp` and match socket inodes to `/proc/<pid>/fd`.