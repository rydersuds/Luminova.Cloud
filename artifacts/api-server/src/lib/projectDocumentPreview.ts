import ExcelJS from "exceljs";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import { readXls } from "xls-reader";

export const MAX_PREVIEW_SOURCE_BYTES = 20 * 1024 * 1024;

const MAX_WORD_PREVIEW_CHARACTERS = 24_000;
const MAX_PREVIEW_SHEETS = 8;
const MAX_PREVIEW_ROWS = 100;
const MAX_PREVIEW_COLUMNS = 16;
const MAX_PREVIEW_CELL_CHARACTERS = 300;
const WORD_EXTENSIONS = new Set(["doc", "docx", "docm", "dot", "dotx", "dotm"]);
const MODERN_EXCEL_EXTENSIONS = new Set(["xlsx", "xlsm", "xltx", "xltm"]);
const LEGACY_EXCEL_EXTENSIONS = new Set(["xls", "xlt"]);

export type ProjectDocumentPreviewKind = "word" | "excel";

export type ProjectDocumentPreview = {
  kind: ProjectDocumentPreviewKind;
  text: string | null;
  worksheets: Array<{ name: string; rows: string[][] }>;
  truncated: boolean;
};

export function getProjectDocumentPreviewKind(
  name: string,
  contentType: string,
): ProjectDocumentPreviewKind | null {
  const extension = name.toLowerCase().split(".").at(-1);
  const mimeType = contentType.toLowerCase();

  if (
    WORD_EXTENSIONS.has(extension ?? "") ||
    mimeType.includes("wordprocessingml") ||
    mimeType.includes("application/msword") ||
    mimeType.includes("vnd.ms-word")
  ) {
    return "word";
  }
  if (
    MODERN_EXCEL_EXTENSIONS.has(extension ?? "") ||
    LEGACY_EXCEL_EXTENSIONS.has(extension ?? "") ||
    mimeType.includes("spreadsheetml") ||
    mimeType.includes("sheet.macroenabled") ||
    mimeType.includes("application/vnd.ms-excel")
  ) {
    return "excel";
  }

  return null;
}

function cellPreviewText(cell: ExcelJS.Cell): string {
  // ExcelJS's text getter can throw on merged cells whose master is empty.
  if (cell.isMerged && cell.master.address !== cell.address) return "";

  const value = cell.value;
  if (value == null) return "";
  if (cell.text) return cell.text;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if ("result" in value && value.result != null) return String(value.result);
  if ("formula" in value && typeof value.formula === "string") return `=${value.formula}`;
  if ("text" in value && typeof value.text === "string") return value.text;
  if ("richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text).join("");
  }
  return "";
}

function legacyExcelCellText(value: string | number | boolean | Date | null | { toString(): string }): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function isLegacyExcel(name: string, contentType: string): boolean {
  const extension = name.toLowerCase().split(".").at(-1) ?? "";
  if (LEGACY_EXCEL_EXTENSIONS.has(extension)) return true;
  return !MODERN_EXCEL_EXTENSIONS.has(extension) &&
    contentType.toLowerCase().includes("application/vnd.ms-excel") &&
    !contentType.toLowerCase().includes("macroenabled");
}

export async function createProjectDocumentPreview(
  buffer: Buffer,
  name: string,
  contentType: string,
): Promise<ProjectDocumentPreview> {
  const kind = getProjectDocumentPreviewKind(name, contentType);
  if (!kind) throw new Error("This document format cannot be previewed.");

  if (kind === "word") {
    const extension = name.toLowerCase().split(".").at(-1);
    const rawText = extension === "doc" || contentType.toLowerCase().includes("application/msword")
      ? (await new WordExtractor().extract(buffer)).getBody()
      : (await mammoth.extractRawText({ buffer })).value;
    const text = rawText.trim();
    return {
      kind,
      text: text.slice(0, MAX_WORD_PREVIEW_CHARACTERS),
      worksheets: [],
      truncated: text.length > MAX_WORD_PREVIEW_CHARACTERS,
    };
  }

  if (isLegacyExcel(name, contentType)) {
    const workbook = readXls(buffer);
    const visibleWorksheets = workbook.sheets.slice(0, MAX_PREVIEW_SHEETS);
    let truncated = workbook.sheets.length > MAX_PREVIEW_SHEETS;
    const worksheets = visibleWorksheets.map((sheet) => {
      const rowLimit = Math.min(sheet.rows.length, MAX_PREVIEW_ROWS);
      const columnLimit = Math.min(
        Math.max(...sheet.rows.slice(0, rowLimit).map((row) => row.length), 0),
        MAX_PREVIEW_COLUMNS,
      );
      if (sheet.rows.length > MAX_PREVIEW_ROWS || sheet.rows.some((row) => row.length > MAX_PREVIEW_COLUMNS)) {
        truncated = true;
      }

      const rows = Array.from({ length: rowLimit }, (_, rowIndex) =>
        Array.from({ length: columnLimit }, (_, columnIndex) => {
          const value = legacyExcelCellText(sheet.rows[rowIndex]?.[columnIndex] ?? null);
          if (value.length > MAX_PREVIEW_CELL_CHARACTERS) truncated = true;
          return value.slice(0, MAX_PREVIEW_CELL_CHARACTERS);
        }),
      );

      return { name: sheet.name, rows };
    });

    return { kind, text: null, worksheets, truncated };
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const visibleWorksheets = workbook.worksheets.slice(0, MAX_PREVIEW_SHEETS);
  let truncated = workbook.worksheets.length > MAX_PREVIEW_SHEETS;
  const worksheets = visibleWorksheets.map((sheet) => {
    const rowLimit = Math.min(sheet.rowCount, MAX_PREVIEW_ROWS);
    const columnLimit = Math.min(sheet.columnCount, MAX_PREVIEW_COLUMNS);
    if (sheet.rowCount > MAX_PREVIEW_ROWS || sheet.columnCount > MAX_PREVIEW_COLUMNS) {
      truncated = true;
    }

    const rows = Array.from({ length: rowLimit }, (_, rowIndex) =>
      Array.from({ length: columnLimit }, (_, columnIndex) => {
        const value = cellPreviewText(sheet.getRow(rowIndex + 1).getCell(columnIndex + 1));
        if (value.length > MAX_PREVIEW_CELL_CHARACTERS) truncated = true;
        return value.slice(0, MAX_PREVIEW_CELL_CHARACTERS);
      }),
    );

    return { name: sheet.name, rows };
  });

  return { kind, text: null, worksheets, truncated };
}