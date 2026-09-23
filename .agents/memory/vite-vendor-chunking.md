---
name: Vite vendor chunking
description: The manual chunking constraint that keeps the Luminova workspace build free of circular vendor imports.
---

Keep dependencies that do not match an explicit vendor category with the React/runtime vendor group when configuring `manualChunks`.

**Why:** CommonJS helpers and transitive runtime dependencies can import across category boundaries. Sending unmatched packages to a separate catch-all vendor chunk created a circular `vendor` ↔ `vendor-react` graph during production builds.

**How to apply:** When adding a vendor category in the Luminova Vite config, keep the explicit groups cacheable and below the warning threshold, preserve the runtime fallback grouping, and verify the production build has no circular-chunk warning.