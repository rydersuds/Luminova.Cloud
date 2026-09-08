---
name: Photo analysis isolation
description: Reliability and privacy boundary for AI analysis of imported project photos.
---

Treat visual metadata generation as a bounded, per-photo enrichment step. A decoder failure, unsupported/corrupt image, model refusal, or temporary AI error must not roll back an otherwise valid project import; missing metadata should remain eligible for a later retry.

**Why:** Folder imports can contain many heterogeneous, user-controlled images. Coupling their persistence to image decoding or AI availability makes one bad photo destroy useful project data, while unconstrained decoding creates a denial-of-service risk.

**How to apply:** Keep original objects private, analyze server-side bytes without public URLs, enforce source/decode/output/time limits, persist successful metadata once, and isolate failures to the affected photo with a recovery path.