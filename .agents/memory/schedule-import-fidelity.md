---
name: Schedule import fidelity
description: User requirements for screenshot dates, colours, and AI category suggestions.
---

Schedule imports must prioritize reading the dates visible in the source, preserving its task colours, and using AI to suggest the most appropriate construction category.

**Why:** The user reported that visible screenshot dates had been missed and explicitly requested matching screenshot colours plus best-fit AI categorization. Categories and colours are independent: tasks in the same category may have different source colours.

**How to apply:** Preserve per-task colours rather than only assigning a rotating category palette. Use document labels and reliable project-year context for abbreviated dates; flag unresolved dates instead of silently dropping them. Keep inferred categories editable and distinguish their reasoning from headings actually read in the source.

PDF daily grids can have unequal column widths. AI may return plausible, nonblank dates that are still one day early, so checking only missing dates is insufficient. Grey inspection bars and dark completion bars are source colours too, not necessarily background shading.

**Why:** Comparing the supplied basement-suite schedule to its actual PDF geometry exposed right-edge date drift and lost neutral task colours.

**How to apply:** When a PDF contains a verifiable labelled daily grid, cross-check all matching task bars against their actual column positions and preserve their original fills. Do not extrapolate weekly grids or overwrite ambiguous repeated task names. Keep AI responsible for semantic category suggestions.

Show only tasks physically present in the project's own schedule, and populate dates actually documented there. Do not substitute generic construction tasks or another project's schedule.

**Why:** The user explicitly requested actual source items and dates after Building 79 displayed unrelated basement-suite tasks with missing dates.

**How to apply:** Verify project-bound source documents before reconciling a board. Honor explicit dated revisions or annotations over older copied values, retain a recovery copy before replacing incorrect rows, and never fill missing dates with arbitrary durations.
