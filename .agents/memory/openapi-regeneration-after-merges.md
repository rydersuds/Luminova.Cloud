---
name: OpenAPI regeneration after merges
description: How to keep generated API clients consistent when multiple branches change the OpenAPI contract.
---

When a rebase combines OpenAPI specification changes from multiple branches, rerun the API spec code generator instead of hand-merging generated clients.

**Why:** Generated outputs can have missing public exports or invalid initialization order even when each branch validates separately.

**How to apply:** After merging OpenAPI schema changes, regenerate all client and Zod artifacts and rebuild workspace libraries before typechecking dependent services.
