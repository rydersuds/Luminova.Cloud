import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import {
  boundProjectImportDocumentSnippets,
  extractWorkbookInternalBudget,
  financialPdfOcrPageNumbers,
  isFinancialDocumentPath,
  isInternalBudgetDocumentPath,
} from "./financialDocumentExtraction";
import { purchaseApproval, remainingTradeBudgets } from "./invoiceBudget";

test("recognizes contracts and agreements as financial documents without treating them as internal budgets", () => {
  assert.equal(isFinancialDocumentPath("Client/Executed Agreement.pdf"), true);
  assert.equal(isFinancialDocumentPath("Project/Client-Contract-Scan.png"), true);
  assert.equal(isInternalBudgetDocumentPath("Project/Internal Costs.xlsx"), true);
  assert.equal(isInternalBudgetDocumentPath("Project/Client Contract.xlsx"), false);
});

test("retains financial snippets before general documents when the shared text limit is reached", () => {
  const bounded = boundProjectImportDocumentSnippets([
    { relativePath: "Project/General Notes.docx", textSnippet: "general text" },
    { relativePath: "Project/Signed Contract.pdf", textSnippet: "contract text" },
  ], 13, 13);

  assert.equal(bounded[0].textSnippet, undefined);
  assert.equal(bounded[1].textSnippet, "contract text");
});

test("bounds scanned-PDF OCR to representative pages", () => {
  assert.deepEqual(financialPdfOcrPageNumbers(3), [1, 2, 3]);
  assert.deepEqual(financialPdfOcrPageNumbers(12), [1, 2, 3, 4, 6, 10, 11, 12]);
  assert.deepEqual(financialPdfOcrPageNumbers(0), []);
});

test("extracts internal budget categories and includes tax rows", async () => {
  const workbook = new ExcelJS.Workbook();
  const summary = workbook.addWorksheet("Summary");
  summary.getCell("B6").value = "Construction";
  summary.getCell("C6").value = 100;
  summary.getCell("B11").value = "CONSTRUCTION SUBTOTAL";
  summary.getCell("C11").value = { formula: "C6", result: 100 };
  summary.getCell("B18").value = "TOTAL BEFORE TAX";
  summary.getCell("C18").value = { formula: "C11", result: 100 };
  summary.getCell("B19").value = "GST — 5% (on Total Before Tax)";
  summary.getCell("C19").value = { formula: "C18*0.05", result: 5 };
  summary.getCell("B20").value = "PST — 6% (on Total Before Tax)";
  summary.getCell("C20").value = { formula: "C18*0.06", result: 6 };
  summary.getCell("B21").value = "GRAND TOTAL — COMPLETE PROJECT RESTORATION (CAD)";
  summary.getCell("C21").value = { formula: "C18+C19+C20", result: 111 };

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const result = await extractWorkbookInternalBudget(buffer, "internal-budget.xlsx");

  assert.equal(result?.total, 111);
  assert.deepEqual(result?.lineItems.map((item) => [item.description, item.budgeted]), [
    ["Construction", 100],
    ["GST — 5% (on Total Before Tax)", 5],
    ["PST — 6% (on Total Before Tax)", 6],
  ]);
});

test("extracts internal budget columns from a non-Summary worksheet and ignores client price", async () => {
  const workbook = new ExcelJS.Workbook();
  const costs = workbook.addWorksheet("Cost Plan");
  costs.addRow(["Trade", "Internal Cost", "Client Price"]);
  costs.addRow(["Demolition", "$1,000.00", "$1,500.00"]);
  costs.addRow(["Electrical", "$2,000.00", "$3,000.00"]);
  costs.addRow(["Internal Cost Total", "$3,000.00", "$4,500.00"]);

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const result = await extractWorkbookInternalBudget(buffer, "Project/Project Financials.xlsx");

  assert.equal(result?.total, 3_000);
  assert.deepEqual(result?.lineItems.map((item) => [item.description, item.budgeted]), [
    ["Demolition", 1_000],
    ["Electrical", 2_000],
  ]);
});

test("does not infer an internal budget from a client-facing contract price column", async () => {
  const workbook = new ExcelJS.Workbook();
  const contract = workbook.addWorksheet("Summary");
  contract.addRow(["Trade", "Contract Price"]);
  contract.addRow(["Renovation", 79_925]);
  contract.addRow(["Grand Total", 79_925]);

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const result = await extractWorkbookInternalBudget(buffer, "Project/Client Contract.xlsx");

  assert.equal(result, null);
});

test("extracts mixed dwelling types and shared costs without adding client charges or profit", async () => {
  const workbook = new ExcelJS.Workbook();
  const units = workbook.addWorksheet("Pricing Units");
  units.addRow(["", "", "", "1 BED", "1 BED", "2 BED", "2 BED"]);
  units.addRow(["", "", "", 150, 150, 280, 280]);
  units.addRow(["", "UNIT", "RATE", "QTY", "TOTAL", "QTY", "TOTAL"]);
  units.addRow(["DRYWALL", null, null, null, 100, null, 200]);
  units.addRow(["Wallboard", "SQFT", 10, 10, 100, 20, 200]);
  units.addRow(["Unpriced allowance", "LOT", null, 1, null, 1, null]);
  units.addRow(["CABINETS", null, null, null, 50, null, 80]);
  units.addRow(["Cabinet install", "HOUR", 25, 2, 50, 3.2, 80]);
  units.addRow(["UNIT SUMMARY"]);
  units.addRow(["1 BEDROOM", "EACH", 150, 2, 300]);
  units.addRow(["2 BEDROOM", "EACH", 280, 3, 840]);
  units.addRow(["COMMON AREA", null, null, null, 60]);
  units.addRow(["Shared hall cleaning", "HOUR", 10, 6, 60]);
  units.addRow(["MISCELLANEOUS", null, null, null, 30]);
  units.addRow(["Waste removal", "LOT", 30, 1, 30]);
  units.addRow(["GRAND TOTAL NOT INCLUDING TAX", null, null, null, 1_230]);
  const pricing = workbook.addWorksheet("Project pricing");
  pricing.addRow(["Description", "OUR COST", "Client Price", "Profit"]);
  pricing.addRow(["Project", 999_999, 2_000_000, 1_000_001]);

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const result = await extractWorkbookInternalBudget(buffer, "Project/Cost Plan.xlsx");

  assert.equal(result?.total, 1_230);
  assert.deepEqual(result?.unitBudget?.unitTypes.map((type) => [
    type.name,
    type.unitCount,
    type.perUnitTotal,
    type.total,
  ]), [
    ["1 BED", 2, 150, 300],
    ["2 BED", 3, 280, 840],
  ]);
  assert.deepEqual(result?.unitBudget?.sharedAreas.map((area) => [area.name, area.total]), [
    ["Common areas", 60],
    ["Project-wide costs", 30],
  ]);
  assert.deepEqual(result?.lineItems.map((item) => [item.description, item.budgeted]), [
    ["DRYWALL", 800],
    ["CABINETS", 340],
    ["Common areas", 60],
    ["Project-wide costs", 30],
  ]);
  assert.equal(result?.lineItems.reduce((sum, item) => sum + item.budgeted, 0), result?.total);
  assert.deepEqual(result?.unitBudget?.unitTypes[0].lineItems[0], {
    id: "unit-1-5",
    category: "DRYWALL",
    description: "Wallboard",
    unit: "SQFT",
    quantity: 10,
    rate: 10,
    budgeted: 100,
  });
  assert.equal(result?.unitBudget?.sharedAreas[0].lineItems[0].budgeted, 60);
  const unpriced = result?.unitBudget?.unitTypes[0].lineItems.find((item) => item.description === "Unpriced allowance");
  assert.equal(unpriced?.rate, null);
  assert.equal(unpriced?.budgeted, null);
  const purchaseCategories = remainingTradeBudgets(result?.lineItems ?? [], [
    { amount: 100, budgetLineItemId: "internal-budget-1", submittedById: "pm" },
  ]);
  assert.equal(purchaseCategories[0].budgeted, 800);
  assert.equal(purchaseCategories[0].remaining, 700);
  assert.equal(purchaseApproval(purchaseCategories[0], 700).status, "Auto-approved");
  assert.equal(purchaseApproval(purchaseCategories[0], 700.01).status, "Pending approval");
});

test("does not retain a unit breakdown when source unit subtotals fail reconciliation", async () => {
  const workbook = new ExcelJS.Workbook();
  const units = workbook.addWorksheet("Pricing Units");
  units.addRow(["", "", "", "1 BED", "1 BED", "2 BED", "2 BED"]);
  units.addRow(["", "", "", 150, 150, 280, 280]);
  units.addRow(["", "UNIT", "RATE", "QTY", "TOTAL", "QTY", "TOTAL"]);
  units.addRow(["DRYWALL", null, null, null, 100, null, 200]);
  units.addRow(["Wallboard", "SQFT", 10, 10, 100, 20, 200]);
  units.addRow(["CABINETS", null, null, null, 50, null, 80]);
  units.addRow(["Cabinet install", "HOUR", 25, 2, 50, 3.2, 80]);
  units.addRow(["UNIT SUMMARY"]);
  units.addRow(["1 BEDROOM", "EACH", 150, 2, 300]);
  units.addRow(["2 BEDROOM", "EACH", 280, 3, 840]);
  units.addRow(["COMMON AREA", null, null, null, 60]);
  units.addRow(["Shared hall cleaning", "HOUR", 10, 6, 60]);
  units.addRow(["GRAND TOTAL NOT INCLUDING TAX", null, null, null, 1_199]);
  const pricing = workbook.addWorksheet("Project pricing");
  pricing.addRow(["Description", "OUR COST", "Client Price", "Profit"]);

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const result = await extractWorkbookInternalBudget(buffer, "Project/Cost Plan.xlsx");

  assert.equal(result, null);
});