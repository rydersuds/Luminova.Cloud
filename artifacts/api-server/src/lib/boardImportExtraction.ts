import ExcelJS from "exceljs";
import { PDFParse } from "pdf-parse";
import type { BoardImportPreview, BoardImportPreviewRow } from "@workspace/api-zod";
import { extractAiSchedule, type ScheduleDocument } from "./boardScheduleAI";
import { readPdfGanttEvidence } from "./pdfGanttEvidence";

export const MAX_BOARD_IMPORT_BYTES = 8 * 1024 * 1024;
export const MAX_BOARD_IMPORT_ROWS = 250;
const MAX_SOURCE_TEXT = 80_000;
const MAX_PDF_PAGES = 20;
const MAX_RENDERED_BYTES = 24 * 1024 * 1024;

export type BoardImportRawRow = {
  rowNumber: number;
  group: string;
  name: string;
  status: string;
  priority: string;
  assignee: string;
  startDate: string;
  endDate: string;
  cost: string;
  sourceColor?: string | null;
  categoryReason?: string;
  dateEvidence?: string;
  issues?: string[];
};

const STATUS_VALUES = ["Not started", "Working on it", "Stuck", "Done"] as const;
const PRIORITY_VALUES = ["Low", "Medium", "High", "Critical"] as const;
type Status = typeof STATUS_VALUES[number];
type Priority = typeof PRIORITY_VALUES[number];

type BoardTableField = "name" | "group" | "status" | "priority" | "assignee" | "startDate" | "endDate" | "cost";
const headerAliases: Record<BoardTableField, string[]> = {
  name: ["task", "item", "task name", "item name", "activity", "work item", "milestone", "description"],
  group: ["group", "phase", "section", "stage", "category", "workstream"],
  status: ["status", "progress", "state"],
  priority: ["priority", "importance"],
  assignee: ["assignee", "owner", "assigned to", "responsible", "lead"],
  startDate: ["start", "start date", "begin", "begin date", "planned start"],
  endDate: ["end", "end date", "due", "due date", "finish", "finish date", "planned finish"],
  cost: ["cost", "budget", "amount", "estimated cost", "planned cost"],
};

function headerKey(value: string): BoardTableField | null {
  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  for (const [key, aliases] of Object.entries(headerAliases) as [BoardTableField, string[]][]) {
    if (aliases.includes(normalized)) return key;
  }
  return null;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === "\"" && text[index + 1] === "\"") {
        cell += "\"";
        index += 1;
      } else if (character === "\"") quoted = false;
      else cell += character;
    } else if (character === "\"") {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((entry) => entry.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
    if (rows.length > MAX_BOARD_IMPORT_ROWS + 15) {
      throw new Error(`The file has more than ${MAX_BOARD_IMPORT_ROWS} rows.`);
    }
  }
  if (quoted) throw new Error("The CSV contains an unfinished quoted field.");
  row.push(cell);
  if (row.some((entry) => entry.trim())) rows.push(row);
  return rows;
}

function findHeader(rows: string[][]) {
  for (let index = 0; index < Math.min(rows.length, 15); index += 1) {
    const columns = rows[index].map((value) => headerKey(value));
    if (columns.includes("name")) return { index, columns };
  }
  throw new Error("No task or item column was found. Add a header named Task, Item, or Name.");
}

function hasTaskHeader(rows: string[][]) {
  return rows.slice(0, 15).some((row) => row.some((value) => headerKey(value) === "name"));
}

function readMatrix(rows: string[][], firstRowNumber = 1): BoardImportRawRow[] {
  const header = findHeader(rows);
  const result: BoardImportRawRow[] = [];
  for (let index = header.index + 1; index < rows.length; index += 1) {
    const cells = rows[index];
    if (!cells.some((value) => value.trim())) continue;
    const fields: BoardImportRawRow = {
      rowNumber: firstRowNumber + index,
      group: "",
      name: "",
      status: "",
      priority: "",
      assignee: "",
      startDate: "",
      endDate: "",
      cost: "",
    };
    header.columns.forEach((key, columnIndex) => {
      if (key) fields[key] = (cells[columnIndex] ?? "").trim();
    });
    result.push(fields);
    if (result.length > MAX_BOARD_IMPORT_ROWS) {
      throw new Error(`The file has more than ${MAX_BOARD_IMPORT_ROWS} schedule rows.`);
    }
  }
  return result;
}

function cellText(cell: ExcelJS.Cell): string {
  if (cell.value instanceof Date) return cell.value.toISOString().slice(0, 10);
  try {
    return cell.text.trim();
  } catch {
    return "";
  }
}

async function readWorkbook(buffer: Buffer): Promise<BoardImportRawRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const rawRows: BoardImportRawRow[] = [];
  for (const worksheet of workbook.worksheets.slice(0, 30)) {
    const matrix = Array.from({ length: Math.min(worksheet.rowCount, MAX_BOARD_IMPORT_ROWS + 15) }, (_, rowIndex) => {
      const row = worksheet.getRow(rowIndex + 1);
      return Array.from({ length: Math.min(worksheet.columnCount, 40) }, (_, columnIndex) =>
        cellText(row.getCell(columnIndex + 1)));
    });
    // Real workbooks often include cover sheets, notes, or instruction tabs.
    if (!hasTaskHeader(matrix)) continue;
    const parsed = readMatrix(matrix);
    rawRows.push(...parsed);
    if (rawRows.length > MAX_BOARD_IMPORT_ROWS) {
      throw new Error(`The workbook has more than ${MAX_BOARD_IMPORT_ROWS} schedule rows.`);
    }
  }
  if (!rawRows.length) throw new Error("No task or item column was found. Add a header named Task, Item, or Name.");
  return rawRows;
}

function normalizeStatus(value: string, issues: string[]): Status | null {
  if (!value.trim()) return null;
  const normalized = value.trim().toLowerCase();
  const status = STATUS_VALUES.find((candidate) => candidate.toLowerCase() === normalized);
  if (status) return status;
  issues.push(`Unknown status “${value.slice(0, 50)}”; choose a board status.`);
  return null;
}

function normalizePriority(value: string, issues: string[]): Priority | null {
  if (!value.trim()) return null;
  const priority = PRIORITY_VALUES.find((candidate) => candidate.toLowerCase() === value.trim().toLowerCase());
  if (priority) return priority;
  issues.push(`Unknown priority “${value.slice(0, 50)}”; choose a board priority.`);
  return null;
}

function normalizeDate(value: string, fieldName: string, issues: string[]) {
  if (!value.trim()) return null;
  const text = value.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  const short = iso ? null : /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (!iso && !short) {
    issues.push(`${fieldName} date needs review; enter a valid date.`);
    return null;
  }
  const yearText = iso?.[1] ?? short?.[3] ?? "";
  const monthText = iso?.[2] ?? short?.[1] ?? "";
  const dayText = iso?.[3] ?? short?.[2] ?? "";
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    issues.push(`${fieldName} date needs review; enter a valid date.`);
    return null;
  }
  return `${yearText.padStart(4, "0")}-${monthText.padStart(2, "0")}-${dayText.padStart(2, "0")}`;
}

function normalizeCost(value: string, issues: string[]) {
  if (!value.trim()) return null;
  const normalized = value.trim().replace(/[,$£€\s]/g, "").replace(/^(?:CAD|USD)/i, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    issues.push("Cost needs review; enter a non-negative amount.");
    return null;
  }
  const cents = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(cents) || cents > 2_147_483_647) {
    issues.push("Cost is outside the supported range.");
    return null;
  }
  return cents;
}

function normalizeRows(rawRows: BoardImportRawRow[]): BoardImportPreview {
  if (!rawRows.length) throw new Error("No schedule rows were found beneath the header.");
  const rows: BoardImportPreviewRow[] = rawRows.map((raw) => {
    const issues: string[] = [...(raw.issues ?? [])];
    const name = raw.name.trim();
    if (!name) issues.push("Task name is required.");
    if (name.length > 200) issues.push("Task name is over 200 characters; shorten it before import.");
    if (raw.assignee.length > 120) issues.push("Owner is over 120 characters; shorten it before import.");
    const sourceGroup = raw.group.trim().slice(0, 80) || null;
    return {
      rowNumber: raw.rowNumber,
      sourceGroup,
      sourceColor: raw.sourceColor ?? null,
      categoryReason: raw.categoryReason ?? "",
      dateEvidence: raw.dateEvidence ?? "",
      name: name.slice(0, 500),
      status: normalizeStatus(raw.status, issues),
      priority: normalizePriority(raw.priority, issues),
      assignee: raw.assignee.trim() ? raw.assignee.trim().slice(0, 200) : null,
      startDate: normalizeDate(raw.startDate, "Start", issues),
      endDate: normalizeDate(raw.endDate, "End", issues),
      costCents: normalizeCost(raw.cost, issues),
      issues,
    };
  });
  rows.forEach((row) => {
    if (row.startDate && row.endDate && row.endDate < row.startDate) {
      row.issues.push("End date can't be before start date.");
    }
  });
  const groups = [...new Set(rows.map((row) => row.sourceGroup).filter((group): group is string => Boolean(group)))];
  if (groups.length > 30) throw new Error("The file has more than 30 detected groups.");
  return { groups, rows };
}

async function extractImageRows(buffer: Buffer, context: Partial<ScheduleDocument> = {}): Promise<BoardImportRawRow[]> {
  return extractAiSchedule({ ...context, text: "", images: [buffer] });
}

export function isSupportedBoardImportName(filename: string) {
  return /\.(csv|xlsx|pdf|jpe?g|png)$/i.test(filename);
}

export async function extractBoardImport(
  buffer: Buffer,
  filename: string,
  imageExtractor = extractImageRows,
  pdfExtractor: (document: ScheduleDocument) => Promise<BoardImportRawRow[]> = extractAiSchedule,
  context: Partial<ScheduleDocument> = {},
): Promise<BoardImportPreview> {
  if (!buffer.length) throw new Error("Choose a non-empty file.");
  if (buffer.length > MAX_BOARD_IMPORT_BYTES) throw new Error("Files must be 8 MiB or smaller.");
  const extension = filename.toLowerCase().split(".").at(-1);
  let rawRows: BoardImportRawRow[];
  if (extension === "csv") {
    const text = buffer.toString("utf8");
    if (text.includes("\u0000")) throw new Error("This CSV file isn't readable as text.");
    rawRows = readMatrix(parseCsv(text.replace(/^\uFEFF/, "")));
  } else if (extension === "xlsx") {
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new Error("This XLSX file isn't a readable Excel workbook.");
    rawRows = await readWorkbook(buffer);
  } else if (extension === "pdf") {
    if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("This PDF file isn't readable.");
    const parser = new PDFParse({ data: buffer });
    try {
      const info = await parser.getInfo();
      if (info.total > MAX_PDF_PAGES) throw new Error("PDFs must have 20 pages or fewer. Export only the schedule pages and try again.");
      const text = (await parser.getText({ first: MAX_PDF_PAGES, cellSeparator: "\t" })).text;
      if (text.length > MAX_SOURCE_TEXT) {
        throw new Error("This PDF contains too much text. Export only the schedule pages and try again.");
      }
      const images: Buffer[] = [];
      let renderedBytes = 0;
      // Render sequentially to keep memory bounded. Send all pages together so
      // AI can use timeline legends, years, and phase headings across pages.
      for (let page = 1; page <= info.total; page += 1) {
        const screenshot = await parser.getScreenshot({
          partial: [page], desiredWidth: 2400, imageBuffer: true, imageDataUrl: false,
        });
        const image = screenshot.pages[0]?.data;
        if (!image?.length) throw new Error(`PDF page ${page} could not be read. No tasks were added.`);
        renderedBytes += image.length;
        if (renderedBytes > MAX_RENDERED_BYTES) {
          throw new Error("This PDF is too complex to read in one import. Export only the schedule pages and try again.");
        }
        images.push(Buffer.from(image));
      }
      const ganttEvidence = await readPdfGanttEvidence(buffer, context.projectDates?.start);
      rawRows = await pdfExtractor({ ...context, text, images, ganttEvidence });
    } finally {
      await parser.destroy();
    }
  } else if (extension === "jpg" || extension === "jpeg" || extension === "png") {
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
    const isPng = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (!isJpeg && !isPng) throw new Error("The image content doesn't match a JPEG or PNG file.");
    rawRows = await imageExtractor(buffer, context);
  } else {
    throw new Error("Choose a CSV, XLSX, PDF, JPEG, or PNG file.");
  }
  return normalizeRows(rawRows);
}
