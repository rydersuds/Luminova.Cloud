---
name: Route animation remounts
description: Navigation animations must account for page-local app shells being recreated on route changes.
---

Navigation selection animations must preserve their prior visual position across route-driven shell remounts, and their test harness must recreate that remount behavior.

**Why:** A persistent visual harness can show a working transition even though real navigation destroys the old shell before the animation starts.

**How to apply:** When changing cross-route sidebar motion, verify it with the layout remounted between destinations rather than only changing the active route prop in place.

Mobile destination selection should close the navigation drawer immediately; preserving the open drawer to display selection animation is not a requirement.

**Why:** Workflow simplification takes priority over decorative motion. Older visual checks expected the drawer to remain open after navigation, which prevented users from seeing the destination.

**How to apply:** Keep staged-motion coverage on desktop. On mobile, verify dismissal, restored background interaction, and correctly aligned selection when reopening the drawer.