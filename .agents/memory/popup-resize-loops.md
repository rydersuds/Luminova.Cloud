---
name: Popup resize loops
description: Trigger-width dropdowns need frame-based positioning to avoid browser resize feedback.
---

Use frame-based trigger geometry tracking for responsive popups, rather than synchronously observing their trigger dimensions.

**Why:** A participants picker with a long list produced a native `ResizeObserver loop completed with undelivered notifications` error when resizing from mobile to desktop. The runtime overlay converted this window error, which has no Error object, into an unknown runtime error. Frame-based popup positioning eliminated it without suppressing errors.

**How to apply:** Preserve this default when changing shared popup primitives. Capture raw window `error` events in resizing regressions; ordinary page-error listeners can miss this browser warning.
