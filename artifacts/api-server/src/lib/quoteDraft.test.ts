import assert from "node:assert/strict";
import test from "node:test";
import { resolveQuoteDraft, verifyQuoteBytes, quoteAnalysisSchema } from "./quoteDraft";

const base = {
  classification: "vendor_quote" as const, vendorName: "Clear Glass Ltd", quoteNumber: "Q-1", trade: "Glazing",
  issueDate: "2026-02-30", dueDate: null, notes: "Scope excludes tax", documentTotal: 12005,
  lineItems: [{ description: "Glass", quantity: 1.5, unitPrice: 8000 }],
};
test("drafts use cents internally, retain explicit totals, and leave invalid dates unresolved", () => {
  const draft = resolveQuoteDraft(base, [{ id: "glass", companyName: "Clear Glass Ltd" }]);
  assert.equal(draft.vendorId, "glass");
  assert.equal(draft.issueDate, null);
  assert.equal(draft.dueDate, null);
  assert.equal(draft.lineItems[0].unitPrice, 80);
  assert.equal(draft.documentTotal, 12005);
  assert.equal(draft.lineItems.length, 1); // No fabricated balancing line.
  assert.ok(draft.unresolved.some(value => value.includes("Issue date")));
});
test("matching is workspace-directory-only and never guesses ambiguous/unknown vendors", () => {
  assert.equal(resolveQuoteDraft(base, []).vendorId, null);
  assert.equal(resolveQuoteDraft(base, [
    { id: "a", companyName: "Clear Glass Ltd" }, { id: "b", companyName: "Clear Glass Ltd." },
  ]).vendorId, null);
  assert.throws(() => resolveQuoteDraft({ ...base, classification: "other" }, []));
  assert.throws(() => resolveQuoteDraft({ ...base, classification: "uncertain" }, []));
});
test("missing prices/quantities remain visibly unresolved, not substituted from document totals", () => {
  const draft = resolveQuoteDraft({ ...base, quoteNumber: null, trade: null, lineItems: [{ description: "Glass", quantity: null, unitPrice: null }] }, []);
  assert.equal(draft.lineItems[0].quantity, 0);
  assert.equal(draft.lineItems[0].unitPrice, 0);
  assert.ok(draft.unresolved.some(value => value.includes("quantities or prices")));
  assert.equal(resolveQuoteDraft({ ...base, lineItems: [] }, []).lineItems.length, 0);
  assert.equal(quoteAnalysisSchema.safeParse({ ...base, documentTotal: 10.5 }).success, false);
});
test("source verification enforces metadata, supported file signatures, and PDF/image-specific limits", () => {
  const pdf = Buffer.from("%PDF-1.4\n%%EOF");
  assert.doesNotThrow(() => verifyQuoteBytes(pdf, { size: pdf.length, contentType: "application/pdf" }));
  assert.throws(() => verifyQuoteBytes(pdf, { size: pdf.length + 1, contentType: "application/pdf" }));
  assert.throws(() => verifyQuoteBytes(pdf, { size: pdf.length, contentType: "image/png" }));
  assert.throws(() => verifyQuoteBytes(Buffer.from("<script>bad</script>"), { size: 20, contentType: "application/pdf" }));
  const image = Buffer.alloc(8 * 1024 * 1024 + 1);
  Buffer.from([255, 216, 255]).copy(image);
  assert.throws(() => verifyQuoteBytes(image, { size: image.length, contentType: "image/jpeg" }));
});
