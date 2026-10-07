---
name: Authentication contrast
description: Keep authentication branding readable independently of the workspace theme.
---

Authentication screens intentionally use a dark branded surface regardless of the workspace's light/dark preference.

**Why:** Light workspace surface effects produced a nearly white sign-in panel with pale text. Clerk's neutral colour also controls secondary button text, not just borders, so a dark neutral made Google sign-in unreadable on the dark card.

**How to apply:** Keep authentication surfaces opaque and independently themed. When changing Clerk colours, inspect the actual social sign-in buttons as well as headings, labels and fields; use a light neutral foreground on a dark card.
