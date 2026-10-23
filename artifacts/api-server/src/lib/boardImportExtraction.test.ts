import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { extractBoardImport, isSupportedBoardImportName, type BoardImportRawRow } from "./boardImportExtraction";
import { readPdfGanttEvidence } from "./pdfGanttEvidence";

function makeOnePagePdf(stream = "BT /F1 10 Tf 72 720 Td (Task) Tj 120 0 Td (Group) Tj 0 -20 Td (Install cabinets) Tj 120 0 Td (Pre-construction) Tj ET") {
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

test("XLSX chart-helper columns cannot overwrite the source task and its paired dates", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Construction Schedule");
  sheet.addRow(["#", "Task", "Start Date", "End Date", "", "Task", "Start", "Duration"]);
  sheet.addRow([1, "Roof Framing", new Date("2026-07-13T00:00:00Z"), new Date("2026-07-17T00:00:00Z"),
    "", "Building completion", new Date("2026-11-09T00:00:00Z"), 1]);
  sheet.addRow([2, "Building completion", new Date("2026-11-09T00:00:00Z"), new Date("2026-11-09T00:00:00Z"),
    "", "Roof Framing", new Date("2026-07-13T00:00:00Z"), 5]);
  const preview = await extractBoardImport(Buffer.from(await workbook.xlsx.writeBuffer()), "schedule.xlsx");
  assert.deepEqual(preview.rows.map(row => [row.name, row.startDate, row.endDate]), [
    ["Roof Framing", "2026-07-13", "2026-07-17"],
    ["Building completion", "2026-11-09", "2026-11-09"],
  ]);
  assert.ok(preview.rows.every(row => row.issues.length === 0));
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

test("always sends PDF text and page images together to AI, then normalizes the populated schedule", async () => {
  const raw: BoardImportRawRow[] = [{
    rowNumber: 1,
    group: "Pre-construction",
    name: "Install cabinets",
    status: "Not started",
    priority: "",
    assignee: "",
    startDate: "2026-10-15",
    endDate: "2026-10-18",
    cost: "",
  }];
  let screenshotCount = 0;
  const preview = await extractBoardImport(makeOnePagePdf(), "schedule.pdf", undefined, async ({ text, images }) => {
    screenshotCount += 1;
    assert.match(text, /Install cabinets/);
    assert.equal(images.length, 1);
    const screenshot = images[0];
    assert.deepEqual([...screenshot.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    return raw;
  });
  assert.equal(screenshotCount, 1);
  assert.equal(preview.rows[0].name, "Install cabinets");
  assert.equal(preview.rows[0].startDate, "2026-10-15");
  assert.equal(preview.rows[0].endDate, "2026-10-18");
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

test("vector Gantt dates align with uneven daily columns and retain grey and dark task bars", async () => {
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let x = 180;
  const cells = Array.from({ length: 60 }, (_, index) => {
    const width = [6, 7, 8][index % 3];
    const date = new Date(Date.UTC(2026, 7, 25 + index));
    const label = date.getUTCDate() === 1 ? monthNames[date.getUTCMonth()] : String(date.getUTCDate());
    const cell = { x, width, label };
    x += width;
    return cell;
  });
  const bar = (from: number, to: number, y: number, color: string, name: string) => [
    `${color} rg ${cells[from].x} ${y} ${cells[to].x + cells[to].width - cells[from].x} 12 re f`,
    `0 0 0 rg BT /F1 6 Tf 20 ${y + 5} Td (${name}) Tj ET`,
  ].join("\n");
  const pdf = makeOnePagePdf([
    "BT /F1 9 Tf 20 760 Td (Project Start: Tue, Aug 25, 2026) Tj ET",
    ...cells.map((cell) => `BT /F1 3 Tf ${cell.x + cell.width / 2 - cell.label.length * .75} 700 Td (${cell.label}) Tj ET`),
    bar(42, 45, 600, ".89 .286 .282", "Flooring"),
    bar(58, 58, 570, ".35 .35 .35", "Final Inspection"),
    bar(59, 59, 540, ".15 .15 .15", "Completion"),
  ].join("\n"));
  const evidence = await readPdfGanttEvidence(pdf);
  assert.equal(evidence.length, 3);
  assert.equal(evidence[0].startDate, "2026-10-06");
  assert.equal(evidence[0].endDate, "2026-10-09");
  assert.equal(evidence[1].startDate, "2026-10-22");
  assert.equal(evidence[1].color, "#595959");
  assert.equal(evidence[2].startDate, "2026-10-23");
  assert.equal(evidence[2].color, "#262626");
});

test("live AI reads a PDF schedule and populates task dates", { skip: process.env.RUN_AI_SCHEDULE_TEST !== "1" }, async () => {
  const pdf = makeOnePagePdf([
    "BT /F1 11 Tf 50 720 Td",
    "(Construction Schedule - 2026) Tj 0 -25 Td",
    "(Phase: Interior finishes) Tj 0 -25 Td",
    "(Task | Owner | Start | Finish) Tj 0 -25 Td",
    "(Install cabinets | Morgan | October 15, 2026 | October 18, 2026) Tj 0 -25 Td",
    "(Paint walls | Jamie | October 19, 2026 | October 21, 2026) Tj ET",
  ].join(" "));
  const preview = await extractBoardImport(pdf, "schedule.pdf");
  assert.equal(preview.rows.length, 2);
  assert.equal(preview.rows[0].name.toLowerCase(), "install cabinets");
  assert.equal(preview.rows[0].startDate, "2026-10-15");
  assert.equal(preview.rows[0].endDate, "2026-10-18");
  assert.equal(preview.rows[1].startDate, "2026-10-19");
  assert.equal(preview.rows[1].endDate, "2026-10-21");
  assert.equal(preview.rows[0].issues.length, 0);
});

test("live AI captures abbreviated screenshot dates, original colours, and inferred construction categories", { skip: process.env.RUN_AI_SCHEDULE_TEST !== "1" }, async () => {
  const { stdout } = await promisify(execFile)("magick", [
    "-size", "1400x320", "xc:white", "-font", "DejaVu-Sans", "-pointsize", "26",
    "-fill", "black", "-annotate", "+30+45", "Construction Schedule - October 2026",
    "-annotate", "+30+100", "Task", "-annotate", "+500+100", "Start", "-annotate", "+760+100", "Finish",
    "-fill", "#33AA66", "-draw", "rectangle 30,130 430,180",
    "-fill", "white", "-annotate", "+45+164", "Install cabinets",
    "-fill", "black", "-annotate", "+500+164", "15-Oct", "-annotate", "+760+164", "18-Oct",
    "-fill", "#337ABB", "-draw", "rectangle 30,210 430,260",
    "-fill", "white", "-annotate", "+45+244", "Electrical rough-in",
    "-fill", "black", "-annotate", "+500+244", "19-Oct-26", "-annotate", "+760+244", "21-Oct-26",
    "png:-",
  ], { encoding: "buffer", maxBuffer: 2 * 1024 * 1024 });
  const preview = await extractBoardImport(stdout, "schedule.png", undefined, undefined, {
    categories: ["Interior finishes", "Mechanical, electrical & plumbing"],
    projectDates: { start: "2026-10-01", end: "2026-11-30" },
  });
  assert.equal(preview.rows.length, 2);
  assert.equal(preview.rows[0].startDate, "2026-10-15");
  assert.equal(preview.rows[0].endDate, "2026-10-18");
  assert.equal(preview.rows[1].startDate, "2026-10-19");
  assert.equal(preview.rows[1].endDate, "2026-10-21");
  assert.equal(preview.rows[0].sourceColor, "#33AA66");
  assert.equal(preview.rows[1].sourceColor, "#337ABB");
  assert.equal(preview.rows[0].sourceGroup, "Interior finishes");
  assert.equal(preview.rows[1].sourceGroup, "Mechanical, electrical & plumbing");
  assert.ok(preview.rows[0].categoryReason);
  assert.ok(preview.rows[1].dateEvidence);
});
