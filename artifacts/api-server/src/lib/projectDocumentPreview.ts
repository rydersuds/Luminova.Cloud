import ExcelJS from "exceljs";
import mammoth from "mammoth";

export const MAX_PREVIEW_SOURCE_BYTES = 20 * 1024 * 1024;

const MAX_WORD_PREVIEW_CHARACTERS = 24_000;
const MAX_PREVIEW_SHEETS = 8;
const MAX_PREVIEW_ROWS = 100;
const MAX_PREVIEW_COLUMNS = 16;
const MAX_PREVIEW_CELL_CHARACTERS = 300;

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

  if (extension === "docx" || mimeType.includes("wordprocessingml")) return "word";
  if (
    extension === "xlsx" ||
    extension === "xlsm" ||
    mimeType.includes("spreadsheetml") ||
    mimeType.includes("sheet.macroenabled")
  ) {
    return "excel";
  }

  return null;
}

function cellPreviewText(cell: ExcelJS.Cell): string {
  if (cell.text) return cell.text;

  const value = cell.value;
  if (value == null) return "";
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

export async function createProjectDocumentPreview(
  buffer: Buffer,
  name: string,
  contentType: string,
): Promise<ProjectDocumentPreview> {
  const kind = getProjectDocumentPreviewKind(name, contentType);
  if (!kind) throw new Error("This document format cannot be previewed.");

  if (kind === "word") {
    const { value } = await mammoth.extractRawText({ buffer });
    const text = value.trim();
    return {
      kind,
      text: text.slice(0, MAX_WORD_PREVIEW_CHARACTERS),
      worksheets: [],
      truncated: text.length > MAX_WORD_PREVIEW_CHARACTERS,
    };
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