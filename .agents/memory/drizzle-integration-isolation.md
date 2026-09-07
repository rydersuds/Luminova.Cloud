---
name: Drizzle integration isolation
description: Why cloud-backed integration tests must use temporary PostgreSQL databases instead of search_path-only schemas.
---

Run database-mutating integration tests in a uniquely named temporary database rather than relying on a connection-level `search_path` to isolate a schema.

**Why:** `drizzle-kit push` introspection can ignore or bypass the intended `search_path`, report no changes, and leave the test connected to an empty or shared namespace. A separate database makes accidental shared-data access structurally impossible.

**How to apply:** Create the temporary database from an administrative connection, point both schema setup and the application at its URL, close all test pools, then drop the database with forced connection cleanup in a `finally` path.