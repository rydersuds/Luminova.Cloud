---
name: Date-only OpenAPI fields
description: How to preserve HTML date-input compatibility through this workspace's OpenAPI code generation.
---

Use string fields with a YYYY-MM-DD pattern for date-only API values that are edited in native calendar inputs; avoid the OpenAPI `format: date` annotation in this workspace.

**Why:** The generated Zod validators coerce `format: date` values into JavaScript `Date` objects. Express then serializes them as full timestamps, which native date inputs reject even though the documented API value is date-only.

**How to apply:** For calendar dates without a time component, use a string pattern in the contract. Reserve date/time coercion for values whose consumers intentionally handle timestamps.