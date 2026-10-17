---
name: Transaction query serialization
description: Avoid overlapping database queries on one Drizzle transaction connection.
---

Await queries sequentially when they use the same Drizzle transaction. Do not wrap transaction-client queries in `Promise.all`; the PostgreSQL driver can warn when a connection is still executing another query.

**Why:** A project-lifecycle test emitted a node-postgres deprecation warning when several reads were started concurrently on one transaction.

**How to apply:** Inside `db.transaction`, sequence dependent or independent `tx` calls with `await`. Use parallel queries only when they use independent connections and the operation is safe to run concurrently.
