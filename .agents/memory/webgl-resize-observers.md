---
name: WebGL resize observers
description: Preventing browser resize-loop errors when a responsive WebGL canvas changes its own backing dimensions.
---

Do not synchronously change a responsive canvas's backing width or height from inside its `ResizeObserver` callback. Schedule one coalesced animation-frame render and cancel it during teardown.

**Why:** Canvas backing-size changes can trigger another layout observation in the same delivery cycle. Browsers report the resulting resize loop as a generic window error, which development runtime overlays may treat as an uncaught application failure even when WebGL rendering itself succeeds.

**How to apply:** Any viewer or visualization that observes its canvas or container and updates canvas dimensions should defer that update to `requestAnimationFrame`, coalesce pending frames, and cancel the pending frame when unmounting.