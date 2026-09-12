---
name: Post-merge contract generation
description: Post-merge setup must regenerate shared API contracts before building services that consume them.
---

Run API specification generation and shared-library typechecking before database migration and API compilation in post-merge setup.

**Why:** Independent merges can update OpenAPI schemas, database exports, and API consumers together. Building the API against stale generated packages produces missing-export and missing-property errors even when the merged source is correct.

**How to apply:** Keep contract generation ahead of the API build, normalize generated-file endings for clean diffs, then run migrations and compile the API.