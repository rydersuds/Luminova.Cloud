import assert from "node:assert/strict";
import test from "node:test";
import AdmZip from "adm-zip";
import ExcelJS from "exceljs";
import {
  createProjectDocumentPreview,
  getProjectDocumentPreviewKind,
} from "./projectDocumentPreview";

function makeDocx(text: string) {
  const zip = new AdmZip();
  zip.addFile("[Content_Types].xml", Buffer.from(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    </Types>`,
  ));
  zip.addFile("_rels/.rels", Buffer.from(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`,
  ));
  zip.addFile("word/document.xml", Buffer.from(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body>
    </w:document>`,
  ));
  return zip.toBuffer();
}

test("Word preview extracts plain text from DOCX", async () => {
  const preview = await createProjectDocumentPreview(
    makeDocx("Private agreement preview"),
    "agreement.docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );

  assert.equal(preview.kind, "word");
  assert.equal(preview.text, "Private agreement preview");
  assert.deepEqual(preview.worksheets, []);
  assert.equal(preview.truncated, false);
});

test("Excel preview includes worksheet names and formatted cell values", async () => {
  const workbook = new ExcelJS.Workbook();
  const summary = workbook.addWorksheet("Summary");
  summary.addRows([
    ["Trade", "Amount"],
    ["Framing", 2500],
  ]);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

  const preview = await createProjectDocumentPreview(
    buffer,
    "budget.xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );

  assert.equal(preview.kind, "excel");
  assert.equal(preview.text, null);
  assert.deepEqual(preview.worksheets, [{
    name: "Summary",
    rows: [
      ["Trade", "Amount"],
      ["Framing", "2500"],
    ],
  }]);
  assert.equal(preview.truncated, false);
});

test("Excel preview bounds rows and columns and reports truncation", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Large");
  for (let row = 1; row <= 101; row += 1) {
    sheet.addRow(Array.from({ length: 17 }, (_, column) => `R${row}C${column + 1}`));
  }
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

  const preview = await createProjectDocumentPreview(buffer, "large.xlsx", "");

  assert.equal(preview.worksheets[0]?.rows.length, 100);
  assert.equal(preview.worksheets[0]?.rows[0]?.length, 16);
  assert.equal(preview.truncated, true);
});

test("preview format detection excludes unsupported legacy Office formats", () => {
  assert.equal(getProjectDocumentPreviewKind("letter.doc", "application/msword"), null);
  assert.equal(getProjectDocumentPreviewKind("ledger.xls", "application/vnd.ms-excel"), null);
  assert.equal(getProjectDocumentPreviewKind("letter.docx", "application/octet-stream"), "word");
  assert.equal(getProjectDocumentPreviewKind("ledger.xlsm", "application/octet-stream"), "excel");
});