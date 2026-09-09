import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { extractWorkbookInternalBudget } from "./financialDocumentExtraction";

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