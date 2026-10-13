---
name: pnpm patch directories
description: Location constraints when preparing checked-in dependency patches.
---

Keep a pnpm-created editable patch directory at its original location until
`pnpm patch-commit` has finished.

**Why:** Moving the directory after `pnpm patch --edit-dir` makes patch-commit
reject it as an invalid patch directory, even when the package files are intact.
Restoring the original location allows the commit to succeed.

**How to apply:** Choose an editable location reachable by the file-editing
tools before starting a patch. Commit from that same location, and keep only
the resulting patch file and package-manager configuration in the repository.
