---
name: Clerk organization invitation email
description: Email notification behavior for Clerk organization invitation API calls.
---

Clerk's organization invitation Backend API accepts `notify: true` to request an email. Some SDK versions omit that property from the TypeScript parameter type while forwarding the request object as-is; check both the current API contract and SDK implementation before removing the explicit flag or its narrow type assertion.

**Why:** Leaving the notification behavior implicit makes the organization-backed invitation path harder to verify and can diverge from the instance-invitation path.

**How to apply:** Keep the email request explicit for organization and default-workspace invitations, and update the type handling when the SDK's published parameter type catches up.
