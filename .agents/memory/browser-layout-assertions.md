---
name: Browser layout assertions
description: Avoid false overflow and focus failures in isolated visual checks.
---

Overflow checks must distinguish scrolling layout containers from inline text and intentionally clipped screen-reader labels. Keyboard-focus checks must activate keyboard modality before asserting `focus-visible` styling.

**Why:** Inline text can report a zero client width despite visible text, screen-reader labels intentionally overflow their clipped boxes, and programmatic focus after mouse input need not match `focus-visible`. Treating those cases as failures produces misleading visual regressions.

**How to apply:** Compare scroll width only on actual layout boxes, exclude intentionally clipped accessibility labels, and check document width separately. Use Tab or Shift+Tab before asserting a focus ring.
