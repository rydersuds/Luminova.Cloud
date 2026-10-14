import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { extractBoardImport, isSupportedBoardImportName, type BoardImportRawRow } from "./boardImportExtraction";

function makeOnePagePdf() {
  const stream = "BT /F1 10 Tf 72 720 Td (Task) Tj 120 0 Td (Group) Tj 0 -20 Td (Install cabinets) Tj 120 0 Td (Pre-construction) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let text = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(text));
    text += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(text);
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`
    + `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(text);
}

test("parses CSV headers and normalizes task fields while preserving row validation issues", async () => {
  const csv = [
    "Task,Group,Status,Priority,Owner,Start Date,End Date,Cost",
    "\"Install cabinets, upper floor\",Interior finishes,Working on it,High,Jamie Lee,2026-05-02,2026-05-04,\"$1,234.50\"",
    "Install lights,Electrical,Unknown,urgent,Alex,2026-02-31,2026-02-28,not set",
  ].join("\n");
  const preview = await extractBoardImport(Buffer.from(csv), "schedule.csv");
  assert.equal(preview.rows.length, 2);
  assert.deepEqual(preview.groups, ["Interior finishes", "Electrical"]);
  assert.equal(preview.rows[0].name, "Install cabinets, upper floor");
  assert.equal(preview.rows[0].status, "Working on it");
  assert.equal(preview.rows[0].costCents, 123450);
  assert.equal(preview.rows[1].status, null);
  assert.equal(preview.rows[1].startDate, null);
  assert.ok(preview.rows[1].issues.some((issue) => issue.includes("Unknown status")));
  assert.ok(preview.rows[1].issues.some((issue) => issue.includes("Start date")));
});

test("parses XLSX worksheets and leaves dates and empty values editable", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Schedule");
  sheet.addRow(["Phase", "Activity", "Assigned To", "Start Date", "End Date", "Budget"]);
  sheet.addRow(["Foundation", "Pour footings", "Morgan", new Date("2026-05-01T00:00:00.000Z"), "", 1250]);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const preview = await extractBoardImport(buffer, "schedule.xlsx");
  assert.deepEqual(preview.groups, ["Foundation"]);
  assert.equal(preview.rows[0].name, "Pour footings");
  assert.equal(preview.rows[0].assignee, "Morgan");
  assert.equal(preview.rows[0].startDate, "2026-05-01");
  assert.equal(preview.rows[0].endDate, null);
  assert.equal(preview.rows[0].costCents, 125000);
});

test("uses the bounded image extraction result for JPEG and PNG screenshot files", async () => {
  const raw: BoardImportRawRow[] = [{
    rowNumber: 1,
    group: "Framing",
    name: "Frame north wall",
    status: "",
    priority: "",
    assignee: "",
    startDate: "2026-06-01",
    endDate: "",
    cost: "",
  }];
  const extract = async () => raw;
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 1]);
  for (const [buffer, name] of [[png, "board.png"], [jpeg, "board.jpg"]] as const) {
    const preview = await extractBoardImport(buffer, name, extract);
    assert.equal(preview.rows[0].name, "Frame north wall");
    assert.deepEqual(preview.groups, ["Framing"]);
  }
});

test("extracts schedule rows from a text PDF through its bounded page preview", async () => {
  const raw: BoardImportRawRow[] = [{
    rowNumber: 1,
    group: "Pre-construction",
    name: "Install cabinets",
    status: "Not started",
    priority: "",
    assignee: "",
    startDate: "",
    endDate: "",
    cost: "",
  }];
  let screenshotCount = 0;
  const preview = await extractBoardImport(makeOnePagePdf(), "schedule.pdf", async (screenshot) => {
    screenshotCount += 1;
    assert.deepEqual([...screenshot.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    return raw;
  });
  assert.equal(screenshotCount, 1);
  assert.equal(preview.rows[0].name, "Install cabinets");
  assert.deepEqual(preview.groups, ["Pre-construction"]);
});

test("rejects unsupported, mislabeled, empty, and unreadable files without producing rows", async () => {
  assert.equal(isSupportedBoardImportName("schedule.docx"), false);
  await assert.rejects(() => extractBoardImport(Buffer.from(""), "empty.csv"), /non-empty/);
  await assert.rejects(() => extractBoardImport(Buffer.from("not a workbook"), "schedule.xlsx"), /isn't a readable Excel workbook/);
  await assert.rejects(() => extractBoardImport(Buffer.from("no headers here"), "schedule.csv"), /No task or item column/);
  await assert.rejects(() => extractBoardImport(Buffer.from("not an image"), "schedule.png"), /doesn't match/);
  await assert.rejects(() => extractBoardImport(Buffer.from("not a PDF"), "schedule.pdf"), /isn't readable/);
});
