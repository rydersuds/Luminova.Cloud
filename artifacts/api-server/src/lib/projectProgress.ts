const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const LEGACY_PROJECT_START_DATE = "2026-01-01";

export const isValidCalendarDate = (date: string): boolean => {
  if (!DATE_ONLY_PATTERN.test(date)) return false;
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsedDate.valueOf()) && parsedDate.toISOString().slice(0, 10) === date;
};

const dateOnlyToUtcMs = (date: string): number | null =>
  isValidCalendarDate(date) ? Date.parse(`${date}T00:00:00.000Z`) : null;

const currentDateOnly = (): string => new Date().toISOString().slice(0, 10);

export const resolveProjectStartDate = (project: {
  startDate?: unknown;
  targetDate?: unknown;
}): string => {
  if (typeof project.startDate === "string" && isValidCalendarDate(project.startDate)) {
    return project.startDate;
  }
  if (typeof project.targetDate === "string" && isValidCalendarDate(project.targetDate)) {
    return project.targetDate;
  }
  return LEGACY_PROJECT_START_DATE;
};

export const calculateProjectProgress = (
  startDate: string,
  endDate: string,
  asOfDate = currentDateOnly(),
): number => {
  const startMs = dateOnlyToUtcMs(startDate);
  const endMs = dateOnlyToUtcMs(endDate);
  const asOfMs = dateOnlyToUtcMs(asOfDate);

  if (startMs === null || endMs === null || asOfMs === null) return 0;
  if (endMs <= startMs) return 0;
  if (asOfMs <= startMs) return 0;
  if (asOfMs >= endMs) return 100;

  const elapsed = (asOfMs - startMs) / (endMs - startMs);
  return Math.round(Math.min(Math.max(elapsed, 0), 1) * 1000) / 10;
};