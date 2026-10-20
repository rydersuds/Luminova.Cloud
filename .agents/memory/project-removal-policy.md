---
name: Project removal policy
description: User-approved archive and permanent deletion rules for Luminova projects.
---

Only Administrators may archive, restore, or permanently delete projects. Archiving removes a project from active lists but retains its history and files. Permanent deletion removes records and stored files linked only to that project, while preserving shared vendor profiles and unrelated projects.

Permanent-deletion previews must be bound to the exact project-owned records and stored-object paths being removed. Compare that snapshot during deletion and require a fresh review if the scope changed.

**Why:** The project owner explicitly selected both removal options and restricted them to Administrators.

**How to apply:** Keep UI controls and server authorization aligned. Do not cascade project deletion into workspace-wide vendor profiles or other projects, and never let an irreversible action proceed against counts the Administrator did not review.
