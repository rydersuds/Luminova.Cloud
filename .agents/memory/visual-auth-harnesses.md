---
name: Visual auth harnesses
description: Authentication state behavior for isolated browser visual harnesses.
---

Provider-owned UI in isolated visual harnesses should receive and use the provider's injected authentication state rather than depending on Clerk session hydration.

**Why:** The visual harness mounts Clerk without a real signed-in session, so a child component that independently reads Clerk auth can disappear even when the provider is intentionally configured as signed in.

**How to apply:** When adding browser coverage around provider-owned UI, pass the provider's resolved auth state into that UI and keep production behavior sourced from the same provider auth resolution.