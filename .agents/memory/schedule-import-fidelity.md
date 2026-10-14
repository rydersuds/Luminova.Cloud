---
name: Schedule import fidelity
description: User requirements for screenshot dates, colours, and AI category suggestions.
---

Schedule imports must prioritize reading the dates visible in the source, preserving its task colours, and using AI to suggest the most appropriate construction category.

**Why:** The user reported that visible screenshot dates had been missed and explicitly requested matching screenshot colours plus best-fit AI categorization. Categories and colours are independent: tasks in the same category may have different source colours.

**How to apply:** Preserve per-task colours rather than only assigning a rotating category palette. Use document labels and reliable project-year context for abbreviated dates; flag unresolved dates instead of silently dropping them. Keep inferred categories editable and distinguish their reasoning from headings actually read in the source.
