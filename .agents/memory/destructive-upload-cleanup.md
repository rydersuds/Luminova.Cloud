---
name: Destructive upload cleanup
description: Safety boundary for deleting direct-to-storage uploads after an attachment request fails.
---

Failed-upload cleanup must require a durable reservation bound to the uploader, intended target, and declared metadata. Attachment must atomically claim that reservation, and cleanup must verify both the reservation and all relevant persisted references before deleting the object.

**Why:** An object path supplied by a client is not proof of ownership or purpose. Checking only one feature table permits cross-user deletion, cross-feature data loss, and concurrent attach/cleanup races.

**How to apply:** Persist reservations when issuing upload URLs, reject attachment without a matching unexpired reservation, allow only one claim, and keep cleanup failures secondary to the original attachment error.