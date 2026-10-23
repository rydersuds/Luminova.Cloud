---
name: Browser popup fixtures
description: Intercepting document requests opened in a new tab in Playwright regressions.
---

Install document-response fixtures on the browser context when the document opens in a popup, not only on the originating page.

**Why:** A page-level route does not intercept the popup's initial navigation. A relative fixture URL can instead reach Vite's SPA fallback and render the sign-in page, falsely suggesting the document action is broken.

**How to apply:** Use context-level request interception for new-tab document fixtures; page-level routes remain appropriate for requests made by the original project page.
