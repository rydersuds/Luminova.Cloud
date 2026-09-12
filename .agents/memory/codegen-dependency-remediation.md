---
name: Codegen dependency remediation
description: How to fix vulnerabilities beneath code generators without introducing unrelated generated-code changes.
---

When a vulnerability is confined to a code generator's transitive dependencies, prefer compatible safe transitive resolutions while keeping the generator's resolved version stable.

**Why:** A newer generator within an existing semver range can rewrite generated clients and schemas or introduce new type requirements, turning a dependency-only security fix into an unrelated API-contract change.

**How to apply:** Confirm the safe transitive versions satisfy the generator's dependency ranges, audit the resulting lockfile, and verify code generation with the previously resolved generator before accepting any parent upgrade.