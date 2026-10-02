---
name: Invoice purchase policy
description: Trade-budget approval rules and external leadership contact for vendor invoice submissions.
---

Vendor invoices submitted by Project Managers use the **remaining trade/category budget**, not the overall project budget or client quote. An amount at or below that remainder is auto-approved. Excess amounts, missing categories, unpriced categories, or unreliable remaining-budget evidence stay unapproved.

**Why:** The user explicitly selected “Remaining trade budget” and “Manager contacts leadership outside the app.” Do not introduce in-app administrator approval controls, automatic email, payment execution, or purchase placement as part of this flow.

**How to apply:** Pending purchases must clearly tell the manager to contact leadership externally and not proceed without authorization. Restrict submissions and downloads to the appropriate workspace and assigned/owned projects. Pending submissions reserve budget so repeated submissions cannot reuse it.

Imported internal actuals are historical baseline evidence. Reconcile matching legacy invoices against that baseline, then add newly submitted invoices separately rather than taking the maximum of the baseline and all invoices.

**Why:** A historical baseline can already exceed normalized legacy invoices. Taking a maximum over new and old invoices would hide new purchases until the normalized total overtook that baseline.

**How to apply:** Keep the imported baseline unchanged and derive current trade usage and portfolio expenses from that baseline plus new submissions. Never subtract client billings from available internal trade budgets.