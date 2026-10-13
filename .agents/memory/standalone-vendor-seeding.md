---
name: Workspace-scoped standalone vendor seeding
description: Durable rules for seeded directory records that coexist with imported vendor records.
---

Standalone directory seed records should use a stable identifier that includes the workspace scope, and bulk conflict-safe insertion must tolerate concurrent first reads. Keep these records out of imported-project vendor deduplication, while allowing workspace-scoped directory and quote lookups to resolve them.

**Why:** A globally unique primary key makes the same seed catalog collide across workspaces, and including seeded records in import deduplication changes the existing imported-vendor flow.

**How to apply:** When adding a shared seed catalog, key rows by workspace plus stable source key, insert with a conflict handler that covers the primary key and unique seed index, and merge seed rows only in workspace-authorized directory paths.

Do not hard-delete a seeded profile when administrators remove it. Persist a workspace-scoped tombstone and exclude it from reads so the next directory seed pass cannot recreate the record.

**Why:** Seed insertion runs during directory reads, so deleting the row itself makes an intentionally removed profile appear again on the next load.

**How to apply:** Keep the stable seed key and row, mark it deleted, and make directory and profile lookup helpers ignore tombstones while seed upserts remain conflict-safe.