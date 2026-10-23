import assert from "node:assert/strict";
import test from "node:test";
import { reviewUnitPages, extractStoredUnitReview, isUnitRevisionSource, suiteRegisterVersion, type UnitPage } from "./documentedUnits";
import { validateBudgetUnits, suiteTradeBudgets, type UnitBudgetProject } from "./unitTradeBudgets";
import { unitDocumentTestPdf } from "./unitDocumentTestPdf";

const project: UnitBudgetProject = {
  unitBudget: { total: 100, sharedAreas: [], unitTypes: [
    { id: "one", name: "1 BED", unitCount: 1, total: 50, perUnitTotal: 50, lineItems: [], categoryBudgets: [{ category: "Paint", budgeted: 50 }] },
    { id: "two", name: "2 Bedroom", unitCount: 1, total: 50, perUnitTotal: 50, lineItems: [], categoryBudgets: [{ category: "Paint", budgeted: 50 }] },
  ] },
};
const page = (text: string, extra: Partial<UnitPage> = {}): UnitPage =>
  ({ documentId: "rev1", sourcePath: "RebuildREV1.pdf", page: 5, text, method: "text", ...extra });
const review = (pages: UnitPage[]) => reviewUnitPages(pages, project, []);

test("retains explicit labels and leading zeroes, deduplicates mentions with page evidence, and maps only supported types", () => {
  const result = review([
    page("Units A-001, 002 and 003 — 1 Bedroom\nUnit A-001 interior scope\nUnit 004 — type unknown"),
    page("Unit A-001 — 1 BED", { page: 6 }),
  ]);
  assert.deepEqual(result.candidates.map(c => c.label).sort(), ["002", "003", "004", "A-001"]);
  const first = result.candidates.find(c => c.label === "A-001")!;
  assert.equal(first.unitTypeId, "one");
  assert.deepEqual(first.evidence.map(e => e.page), [5, 5, 6]);
  assert.equal(result.candidates.find(c => c.label === "004")!.unitTypeId, null);
  assert.ok(result.warnings.some(w => /exceed/.test(w)));
  assert.equal(result.complete, false);
});

test("does not confuse addresses, prices, dates, shared scopes, quantities, page counts, ranges or numeric specifications with units", () => {
  const result = review([page([
    "9757 NE Juanita Drive, Suite 300", "Kirkland WA 98034", "",
    "500 4 TH Avenue SW", "Suite 2500", "Calgary AB", "",
    "Building 79 Cambridge Ave", "12 Units", "Page 5 of 36",
    "3 BEDROOM EACH $50.00 6 $300.00", "Unit summary 6",
    "Units 101-109", "Units 101 to 109", "Unit 2026-06-18",
    "Unit 50.00", "Unit 12/2 wire", "Unit 4 weeks", "Common area Unit 7",
    "Model Unit 123456", "Unit 2 Bedroom", "Unit 20 amp receptacle", "Unit 101 — residential scope",
  ].join("\n"))]);
  assert.deepEqual(result.candidates.map(c => c.label), ["101"]);
});

test("Madison floor-plan captions produce twelve labels, not office addresses, with no invented dwelling assignments", () => {
  const result = review([
    page("Figure 1 — Main Floor Plan (Units 4105, 4106, 4107, 4108)\nFigure 2 — 2nd Floor Plan (Units 4205, 4206, 4207, 4208)\nFigure 3 — 3rd Floor Plan (Units 4305, 4306, 4307, 4308)"),
    page("5.3 Unit 4307 & 4308 - Exterior Wall Assembly\nUnit 4307 and 4308.", { page: 6 }),
  ]);
  assert.equal(result.candidates.length, 12);
  assert.ok(result.candidates.every(c => !c.unitTypeId && c.evidence[0].page === 5));
  assert.equal(result.candidates.find(c => c.label === "4307")!.evidence.length, 3);
});

test("conflicting revisions and unknown types are explicit, never resolved by revision order", () => {
  const result = review([
    page("Unit 001 — 1 Bedroom\nUnit 002"),
    page("Unit 001 — 2 Bedroom\nUnit 003", { documentId: "rev2", sourcePath: "RebuildREV2.pdf" }),
  ]);
  assert.equal(result.candidates.find(c => c.label === "001")!.unitTypeId, null);
  assert.ok(result.candidates.every(c => c.uncertain));
  assert.ok(result.warnings.some(w => /different unit sets/.test(w)));
  assert.ok(result.warnings.some(w => /conflicting/.test(w)));
  const unknown = review([page("Unit 001 — 1 Bedroom"), page("Unit 001 — 3 Bedroom")]);
  assert.equal(unknown.candidates[0].unitTypeId, null);
  assert.equal(unknown.candidates[0].uncertain, true);
});

test("OCR or tentative evidence remains uncertain and never establishes completeness", () => {
  const result = review([page("Proposed Suite PH-001", { method: "ocr" })]);
  assert.equal(result.candidates[0].uncertain, true);
  assert.equal(result.complete, false);
  assert.ok(result.warnings.some(w => /not a verified complete/.test(w)));
});

test("missing or corrupt stored sources never fall back to truncated import snippets or modify project budgets", async () => {
  const original = structuredClone(project);
  const source = { id: "source", name: "RebuildREV1.pdf", relativePath: "RebuildREV1.pdf", contentType: "application/pdf", size: 100, objectPath: "/objects/a", textSnippet: "Units 101, 102" };
  const missing = await extractStoredUnitReview([source], project, {
    getObjectEntityFile: async () => { throw new Error("missing"); }, downloadObject: async () => new Response(""),
  });
  assert.equal(missing.sources[0].status, "unavailable");
  assert.deepEqual(missing.candidates, []);
  const corrupt = await extractStoredUnitReview([source], project, {
    getObjectEntityFile: async () => ({ name: "test" } as never), downloadObject: async () => new Response("not a PDF"),
  });
  assert.deepEqual(corrupt.candidates, []);
  assert.deepEqual(project, original);
  const empty = await extractStoredUnitReview([], project, {} as never);
  assert.ok(empty.warnings.some(w => /No stored/.test(w)));
  assert.equal(isUnitRevisionSource({ ...source, name: "Rebuild Drawings.pdf", relativePath: "Rebuild Drawings.pdf" }), false);
});

test("candidate/document bounds are explicit and counts cannot create identifiers or allowances", async () => {
  const result = review([page(Array.from({ length: 510 }, (_, i) => `Unit A-${String(i).padStart(3, "0")}`).join("\n"))]);
  assert.equal(result.candidates.length, 500);
  assert.ok(result.warnings.some(w => /500/.test(w)));
  let read = false;
  const bounded = await extractStoredUnitReview([{ id: "huge", name: "Rebuild.pdf", relativePath: "Rebuild.pdf", size: 16 * 1024 * 1024, contentType: "application/pdf", objectPath: "/objects/huge" }], project, {
    getObjectEntityFile: async () => { read = true; throw new Error(); }, downloadObject: async () => new Response(""),
  });
  assert.equal(read, false);
  assert.equal(bounded.sources[0].status, "unavailable");
  assert.deepEqual(suiteTradeBudgets(project, []), []);
  assert.match(validateBudgetUnits(project, [
    { id: "a", label: "001", unitTypeId: "one" }, { id: "b", label: "002", unitTypeId: "one" },
  ])!, /allows 1/);
  assert.equal(suiteRegisterVersion(project, "batch"), suiteRegisterVersion(structuredClone(project), "batch"));
  assert.notEqual(suiteRegisterVersion(project, "batch"), suiteRegisterVersion({ ...project, budgetUnits: [{ id: "a", label: "001", unitTypeId: "one" }] }, "batch"));
});

test("page-limited PDF review is reported partial and never converted into a complete unit list", async () => {
  const pdf = unitDocumentTestPdf([
    "Unit A-001 residential scope",
    "Finishing and fixture replacement are included in this residential scope.",
    "All quantities and dates are separate from individually documented suite labels.",
  ], 61);
  const result = await extractStoredUnitReview([{
    id: "long", name: "RebuildREV1.pdf", relativePath: "RebuildREV1.pdf", objectPath: "/objects/long",
    contentType: "application/pdf", size: pdf.length,
  }], project, {
    getObjectEntityFile: async () => ({ name: "test" } as never),
    downloadObject: async () => new Response(pdf),
  });
  assert.equal(result.sources[0].status, "partial");
  assert.equal(result.sources[0].pageCount, 61);
  assert.equal(result.sources[0].pagesRead, 60);
  assert.equal(result.complete, false);
  assert.deepEqual(result.candidates.map(candidate => candidate.label), ["A-001"]);
  assert.ok(result.warnings.some(warning => /300,000/.test(warning)));
});
