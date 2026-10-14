import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import type { BoardImportRawRow } from "./boardImportExtraction";

export type GanttEvidence = { task: string; startDate: string; endDate: string; color: string; page: number };
type Word = { text: string; x: number; y: number; width: number };
type Matrix = [number, number, number, number, number, number];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAY = 86_400_000;
const normalizedName = (name: string) => name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

function lines(words: Word[]) {
  const result: Word[][] = [];
  for (const word of [...words].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = result.find((candidate) => Math.abs(candidate[0].y - word.y) < 1.5);
    if (line) line.push(word);
    else result.push([word]);
  }
  return result.map((line) => line.sort((a, b) => a.x - b.x));
}

/** Only accept a labelled, consecutive DAILY calendar, never extrapolate a weekly scale. */
export function dailyGridDates(labels: string[], reference: string | null): string[] | null {
  const monthIndex = labels.findIndex((label) => MONTHS.includes(label.toLowerCase().slice(0, 3)));
  if (monthIndex < 0 || !reference || labels.length < 10) return null;
  const ref = Date.parse(`${reference}T00:00:00Z`);
  if (!Number.isFinite(ref)) return null;
  const month = MONTHS.indexOf(labels[monthIndex].toLowerCase().slice(0, 3));
  const year = new Date(ref).getUTCFullYear();
  const candidates = [year - 1, year, year + 1].map((candidate) => Date.UTC(candidate, month, 1) - monthIndex * DAY)
    .filter((start) => labels.every((label, index) => {
      const date = new Date(start + index * DAY);
      const namedMonth = MONTHS.indexOf(label.toLowerCase().slice(0, 3));
      return namedMonth >= 0
        ? date.getUTCDate() === 1 && date.getUTCMonth() === namedMonth
        : /^\d{1,2}$/.test(label) && date.getUTCDate() === Number(label);
    })).sort((a, b) => Math.abs(a - ref) - Math.abs(b - ref));
  if (!candidates.length || Math.abs(candidates[0] - ref) > 366 * DAY) return null;
  return labels.map((_, index) => new Date(candidates[0] + index * DAY).toISOString().slice(0, 10));
}

function documentStart(text: string, fallback?: string | null): string | null {
  const match = /project\s+start\s*:?\s*(?:(?:mon|tue|wed|thu|fri|sat|sun)\w*,?\s*)?([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/i.exec(text);
  if (!match) return fallback ?? null;
  const month = MONTHS.indexOf(match[1].toLowerCase().slice(0, 3));
  if (month < 0) return fallback ?? null;
  const date = new Date(Date.UTC(Number(match[3]), month, Number(match[2])));
  return date.getUTCMonth() === month ? date.toISOString().slice(0, 10) : null;
}

function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

export async function readPdfGanttEvidence(buffer: Buffer, projectStart?: string | null): Promise<GanttEvidence[]> {
  const document = await getDocument({ data: Uint8Array.from(buffer), isEvalSupported: false, useSystemFonts: true }).promise;
  const evidence: GanttEvidence[] = [];
  try {
    let reference = projectStart ?? null;
    for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, 20); pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const words: Word[] = content.items.filter((item): item is TextItem => "str" in item && Boolean(item.str.trim()))
        .map((item) => ({ text: item.str.trim(), x: item.transform[4], y: item.transform[5], width: item.width }));
      reference = documentStart(words.map((word) => word.text).join(" "), reference);
      const pageLines = lines(words);
      const header = pageLines.map((line) => line.filter((word) => /^(?:\d{1,2}|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)$/i.test(word.text)))
        .find((line) => line.length >= 10 && dailyGridDates(line.map((word) => word.text), reference));
      if (!header) continue;
      const dates = dailyGridDates(header.map((word) => word.text), reference)!;
      const centers = header.map((word) => word.x + word.width / 2);
      const gridLeft = centers[0] - (centers[1] - centers[0]) / 2;
      const operators = await page.getOperatorList();
      if (operators.fnArray.length > 200_000) continue;
      let state = { matrix: [1, 0, 0, 1, 0, 0] as Matrix, color: "#000000", opaque: true };
      const stack: typeof state[] = [];
      for (let index = 0; index < operators.fnArray.length; index += 1) {
        const op = operators.fnArray[index], args = operators.argsArray[index];
        if (op === OPS.save) { stack.push({ ...state, matrix: [...state.matrix] }); continue; }
        if (op === OPS.restore) { state = stack.pop() ?? state; continue; }
        if (op === OPS.transform) { state.matrix = multiply(state.matrix, args as Matrix); continue; }
        if (op === OPS.setGState) {
          for (const [key, value] of args[0]) if (key === "ca") state.opaque = value === 1;
          continue;
        }
        if (op === OPS.setFillRGBColor) { state.color = String(args[0]).toUpperCase(); continue; }
        if (op !== OPS.constructPath || ![OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke].includes(args[0])) continue;
        const path = args[1]?.[0], bounds = args[2];
        if (!path || path.length !== 13 || ![0, 1, 1, 1, 3].every((code, n) => path[n * 3] === code) || !bounds) continue;
        const m = state.matrix;
        if (!state.opaque || Math.abs(m[1]) > 0.0001 || Math.abs(m[2]) > 0.0001) continue;
        const x0 = Math.min(bounds[0] * m[0] + m[4], bounds[2] * m[0] + m[4]);
        const x1 = Math.max(bounds[0] * m[0] + m[4], bounds[2] * m[0] + m[4]);
        const y0 = Math.min(bounds[1] * m[3] + m[5], bounds[3] * m[3] + m[5]);
        const y1 = Math.max(bounds[1] * m[3] + m[5], bounds[3] * m[3] + m[5]);
        if (x0 < gridLeft - 1 || y1 >= header[0].y || y1 - y0 < 3 || y1 - y0 > 60) continue;
        const rgb = [1, 3, 5].map((offset) => parseInt(state.color.slice(offset, offset + 2), 16));
        // Pale neutral rectangles are alternating rows, weekends, and holidays, not bars.
        if (!/^#[0-9A-F]{6}$/.test(state.color) || (Math.max(...rgb) - Math.min(...rgb) < 25 && Math.min(...rgb) >= 160)) continue;
        const cells = centers.map((center, cell) => ({ center, cell })).filter(({ center }) => center > x0 && center < x1);
        if (!cells.length) continue;
        for (const line of pageLines) {
          const label = line.filter((word) => word.x < gridLeft - 1 && word.y >= y0 && word.y <= y1 && !/^\d+$/.test(word.text));
          const task = label.map((word) => word.text).join(" ").trim();
          if (task.length < 3) continue;
          evidence.push({ task, startDate: dates[cells[0].cell], endDate: dates[cells.at(-1)!.cell], color: state.color, page: pageNumber });
        }
      }
    }
    return evidence;
  } finally {
    await document.destroy();
  }
}

export function applyPdfGanttEvidence(rows: BoardImportRawRow[], evidence: GanttEvidence[]) {
  for (const row of rows) {
    const matches = evidence.filter((entry) => normalizedName(entry.task) === normalizedName(row.name));
    // Do not overwrite genuinely repeated task names whose source bars differ.
    if (!matches.length || matches.some((entry) => entry.startDate !== matches[0].startDate || entry.endDate !== matches[0].endDate || entry.color !== matches[0].color)) continue;
    const entry = matches[0];
    row.startDate = entry.startDate;
    row.endDate = entry.endDate;
    row.sourceColor = entry.color;
    row.dateEvidence = `PDF page ${entry.page}: task bar aligned to labelled daily columns ${entry.startDate} through ${entry.endDate}, inclusive.`;
  }
}
