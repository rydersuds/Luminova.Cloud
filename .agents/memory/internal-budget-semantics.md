---
name: Internal budget semantics
description: Defines which financial records belong in Budget vs Actual reporting.
---

Budget vs Actual must compare the internal cost budget against verified costs or signed commitments. Luminova invoices issued to a client are revenue billings and must remain in client quote/progress reporting, not internal actual costs.

**Why:** Mixing client billings with internal costs produces a plausible-looking but financially invalid variance and margin.

**How to apply:** Use incoming vendor invoices as actual costs and identify signed subcontract values as commitments. Keep their source and status visible, and leave unsupported actual values empty rather than inferring them.

Legacy imports may omit invoice direction. Reclassify those rows as client revenue only when the persisted project invoiced total exactly reconciles the unknown rows after explicit client invoices; otherwise keep them as expenses. Use persisted project client-quote and internal budget actual fields as fallback evidence when normalized quote or invoice rows are absent.

**Why:** Older imported Madison Park records stored the correct financial totals on the project but omitted direction and standalone quote rows; treating every unknown row as an expense or ignoring project-level evidence produced invalid portfolio totals.

**How to apply:** Resolve legacy direction in the owner-scoped financial aggregation, and prefer project-level budget actuals over duplicate expense rows when both represent the same persisted cost.

For imported budgets with itemized source rows, use internal-cost (`OUR COST`) values only. Preserve blank source amounts as unpriced, keep the parent category subtotal authoritative, and exclude client charges and profit from the detail view.

**Why:** Workbook detail can be partial, so treating blanks as zero or summing child rows into the parent can change approved budget totals or expose the wrong financial basis.

**How to apply:** Store source rows as optional detail under their budget category. Display missing internal costs as not provided without changing category totals.

Portfolio budgets historically mix manual-entry cents and imported dollars. Normalize by source provenance, never by numeric magnitude or the presence of itemized details.

**Why:** Older imports can have valid dollar totals without source/detail metadata; assuming all budgets are cents introduces a hundredfold error.

**How to apply:** Preserve explicit monetary units on new budget records and use known legacy source provenance for old records. Normalize when aggregating without rewriting the original evidence.