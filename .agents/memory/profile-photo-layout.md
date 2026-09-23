---
name: Profile photo control layout
description: Layout constraint for editable profile photos inside responsive workspace user cards.
---

Keep editable profile-photo controls inside a fixed avatar-sized wrapper, with validation feedback positioned outside the normal card flow.

**Why:** A control that changes the height of each user card shifts the browser’s mobile scroll clamp when switching between the long Users view and the shorter Clients view, producing a visible page-position regression.

**How to apply:** When changing the shared profile-photo control, preserve the small and large avatar wrapper dimensions and keep transient error text out of the card’s normal layout.