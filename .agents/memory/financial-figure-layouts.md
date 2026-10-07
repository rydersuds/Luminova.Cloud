---
name: Financial figure layouts
description: User requirement for amount-driven financial card columns.
---

Financials and Command Center should show two figures per row whenever both complete numbers fit, and one per row otherwise. Do not split dollar amounts across lines.

**Why:** The user clarified that stacking is conditional on the actual numbers fitting, not simply on the screen reaching a fixed breakpoint.

**How to apply:** Account for the rendered currency text, card padding, and adjacent icons when choosing columns. Preserve this behavior when changing typography or adding financial figures.
