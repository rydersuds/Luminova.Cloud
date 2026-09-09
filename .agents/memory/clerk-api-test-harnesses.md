---
name: Clerk API test harnesses
description: The minimal Clerk Express request shape needed for direct route tests that exercise organization scope.
---

Direct Express route tests that call `getAuth(req)` must provide `req.auth` as a branded handler, not a plain object. The handler should return the test user and organization plus the session token type.

**Why:** Clerk Express rejects unbranded handlers, and without `tokenType: "session_token"` its default accepted-token check returns a signed-out object, silently collapsing organization-scoped tests to the default workspace.

**How to apply:** In isolated route tests, brand the auth function with `Symbol.for("@clerk/express.auth")`, return `{ userId, orgId, tokenType: "session_token" }`, and continue supplying the route's test logger and user ID.