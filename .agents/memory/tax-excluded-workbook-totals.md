---
name: Tax-excluded workbook totals
description: Spreadsheet grand totals may exclude jurisdiction-specific taxes without using the word “tax”.
---

When extracting internal construction budgets, workbook grand-total labels may say “not including GST&PST” rather than “before tax”. Treat the labeled project total as authoritative only when it reconciles with the internal category, unit-type, and shared-area subtotals; do not add excluded taxes or client-facing charges.

**Why:** The Madison Park source workbook labels its grand total with GST/PST names, so matching only the literal word “tax” misses a valid internal total.

**How to apply:** Support common tax abbreviations in spreadsheet total labels, while keeping client charges, profit, and excluded taxes out of internal-budget calculations.
