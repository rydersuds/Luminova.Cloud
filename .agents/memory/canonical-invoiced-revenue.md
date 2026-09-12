---
name: Canonical invoiced revenue
description: User-facing invoiced totals must come from persisted outgoing invoice rows, never denormalized project or quote totals.
---

Dashboard, project-list, project-detail, and portfolio invoiced revenue must use the same persisted invoices whose direction is Luminova-to-client.

**Why:** A project-level stored invoiced field can become stale or inherit import adjustments, making accepted quote value appear in the invoiced section.

**How to apply:** Aggregate canonical outgoing invoice rows per project, calculate remaining accepted value separately, and keep quote totals out of invoiced revenue calculations.