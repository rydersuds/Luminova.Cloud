---
name: Shared navigation visual baselines
description: Keep page screenshots and mobile navigation focus assertions in sync with the shared app shell.
---

Shared shell navigation changes affect screenshots for unrelated pages, not just navigation specs. Adding a link also changes the mobile drawer's keyboard order.

**Why:** Route-level visual tests include the shared shell, so stale baselines can fail across multiple pages even when their page content is unchanged.

**How to apply:** When changing shared navigation, review visual specs that capture the app shell, update only intentional screenshot differences, and assert the drawer's updated keyboard order.
