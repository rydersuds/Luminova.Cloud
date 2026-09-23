---
name: Shared shell pointer targets
description: Keep keyboard-only accessibility targets from being classified as pointer-interactive surfaces.
---

Pointer interaction classifiers should ignore elements with `tabindex="-1"` when deciding whether a custom pointer treatment should switch to interactive mode.

**Why:** Skip links and programmatic focus targets need to remain keyboard-accessible, but they are not pointer controls; classifying their parent surface as interactive makes pointer state incorrect across the page.

**How to apply:** Prefer `tabindex` selectors that exclude `-1` in shared pointer handlers, while leaving the accessibility target itself focusable for keyboard navigation.