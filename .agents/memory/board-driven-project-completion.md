---
name: Board-driven project completion
description: Source of truth for the calendar-based project completion percentage.
---

For calendar-based project completion, use the earliest valid board task start date and latest valid board task end date. Fall back to project-level dates for a missing endpoint or when no usable board date exists. Board task statuses do not replace this metric.

**Why:** The user chose board date ranges over project-level dates for the existing date-based completion metric.

**How to apply:** Query board dates in workspace scope and recompute completion on reads. Do not overwrite the user's saved project dates when calculating the board-driven percentage.
