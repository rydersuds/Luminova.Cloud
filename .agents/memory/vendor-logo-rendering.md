---
name: Vendor logo rendering
description: Vendor logos share the private profile-image upload path and must preserve the full transparent asset when rendered.
---

Vendor logos should use the existing private vendor profile-image upload flow, accept PNG files, and render with containment rather than cover-cropping.

**Why:** Transparent logo artwork is often wider or taller than the square vendor avatar; cover-cropping can remove the mark or text.

**How to apply:** Keep the upload path private and owner-scoped, and use a contained image treatment anywhere the vendor profile image appears.