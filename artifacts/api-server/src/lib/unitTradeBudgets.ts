import type { InvoiceBudgetCategory, ProjectBudgetUnit } from "@workspace/api-zod";
import type { InternalBudgetBreakdown } from "./financialDocumentExtraction";
import { remainingTradeBudgets, type CostCategory, type PurchaseRecord } from "./invoiceBudget";

export type UnitBudgetProject = {
  budgetLineItems?: CostCategory[];
  unitBudget?: InternalBudgetBreakdown;
  budgetUnits?: ProjectBudgetUnit[];
};

const normalized = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
const cents = (amount: number) => Math.round(amount * 100);
export const scopePrefix = (id: string) => `ub:${encodeURIComponent(id)}:`;
const scopedId = (id: string, category: string) => `${scopePrefix(id)}${encodeURIComponent(normalized(category))}`;

/** The source per-unit subtotal, never a share of the whole project's trade budget. */
export function unitSourceTrades(type: InternalBudgetBreakdown["unitTypes"][number]) {
  if (type.categoryBudgets?.length) {
    const valid = type.categoryBudgets.every(trade => typeof trade.budgeted === "number" &&
      Number.isFinite(trade.budgeted) && trade.budgeted >= 0) &&
      Math.abs(type.categoryBudgets.reduce((sum, trade) => sum + cents(trade.budgeted!), 0) - cents(type.perUnitTotal)) <= 2;
    return type.categoryBudgets.map(trade => ({ ...trade, budgeted: valid ? trade.budgeted : null }));
  }
  const groups = new Map<string, { category: string; budgeted: number | null }>();
  for (const item of type.lineItems) {
    const key = normalized(item.category);
    const previous = groups.get(key);
    const known = typeof item.budgeted === "number" && Number.isFinite(item.budgeted) && item.budgeted >= 0;
    groups.set(key, {
      category: previous?.category ?? item.category,
      budgeted: !known || previous?.budgeted === null ? null
        : ((previous ? cents(previous.budgeted!) : 0) + cents(item.budgeted!)) / 100,
    });
  }
  const result = [...groups.values()];
  const reconciled = result.every(item => item.budgeted !== null) &&
    Math.abs(result.reduce((sum, item) => sum + cents(item.budgeted!), 0) - cents(type.perUnitTotal)) <= 2;
  // Partial workbook detail is not evidence of an approved trade limit.
  return result.map(item => ({ ...item, budgeted: reconciled ? item.budgeted : null }));
}

export function validateBudgetUnits(project: UnitBudgetProject, units: ProjectBudgetUnit[]): string | null {
  if (!project.unitBudget) return "This project has no dwelling-type budget to assign units to.";
  const labels = new Set<string>(), ids = new Set<string>(), counts = new Map<string, number>();
  for (const unit of units) {
    const key = normalized(unit.label);
    if (!key || labels.has(key) || ids.has(unit.id)) return "Each suite needs a unique number or label and identifier.";
    if (!project.unitBudget.unitTypes.some(type => type.id === unit.unitTypeId)) return "Choose a dwelling type from this project's budget.";
    labels.add(key); ids.add(unit.id);
    counts.set(unit.unitTypeId, (counts.get(unit.unitTypeId) ?? 0) + 1);
  }
  for (const type of project.unitBudget.unitTypes) {
    if ((counts.get(type.id) ?? 0) > type.unitCount) return `${type.name} allows ${type.unitCount} units in the source budget.`;
  }
  return null;
}

export function suiteTradeBudgets(project: UnitBudgetProject, costs: PurchaseRecord[]): InvoiceBudgetCategory[] {
  if (!project.unitBudget) return remainingTradeBudgets(project.budgetLineItems ?? [], costs);
  const categories: Array<CostCategory & {
    unitId: string; unitLabel: string; unitTypeName: string; scopeKind: "suite" | "shared";
  }> = [];
  for (const unit of project.budgetUnits ?? []) {
    const type = project.unitBudget.unitTypes.find(type => type.id === unit.unitTypeId);
    if (!type) continue;
    for (const trade of unitSourceTrades(type)) categories.push({
      id: scopedId(unit.id, trade.category), code: trade.category, description: trade.category,
      budgeted: trade.budgeted, unitId: unit.id, unitLabel: unit.label,
      unitTypeName: type.name, scopeKind: "suite",
    });
  }
  for (const area of project.unitBudget.sharedAreas) {
    const id = `shared:${area.id}`;
    categories.push({
      id: scopedId(id, area.name), code: area.name, description: area.name, budgeted: area.total,
      unitId: id, unitLabel: area.name, unitTypeName: "Shared area", scopeKind: "shared",
    });
  }
  const baselineUnassigned = (project.budgetLineItems ?? []).some(item => (item.invoiced ?? 0) > 0);
  // A legacy label matching the only registered suite is still not a suite assignment.
  const scopedCosts = costs.map(cost => cost.budgetLineItemId?.startsWith("ub:")
    ? cost : { ...cost, budgetLineItemId: "unallocated-unit-cost" });
  return remainingTradeBudgets(categories, scopedCosts).map((category, index) => ({
    ...category,
    unitId: categories[index].unitId, unitLabel: categories[index].unitLabel,
    unitTypeName: categories[index].unitTypeName, scopeKind: categories[index].scopeKind,
    ...(baselineUnassigned ? { remaining: null, canAutoApprove: false } : {}),
  }));
}

export function suiteBudgetExtras(project: UnitBudgetProject, costs: PurchaseRecord[]) {
  if (!project.unitBudget) return {};
  const categories = suiteTradeBudgets(project, costs);
  const unknown = categories.some(category => category.remaining === null);
  return {
    unitBudgetEnabled: true, units: project.budgetUnits ?? [],
    unitTypes: project.unitBudget.unitTypes.map(({ id, name, unitCount, perUnitTotal, total }) =>
      ({ id, name, unitCount, perUnitTotal, total })),
    allocationWarning: unknown
      ? "Some source trade limits are unverified or existing costs are not assigned to suites. They have not been divided between units; affected requests require authorization."
      : null,
  };
}

export function scopedTradeLabel(category: InvoiceBudgetCategory) {
  return category.unitLabel
    ? `${category.unitLabel} · ${category.description}`
    : `${category.code} · ${category.description}`;
}

/** Roll suite invoices UP for project reporting, never spread historical costs DOWN to suites. */
export function projectCostAllocations(project: UnitBudgetProject, costs: PurchaseRecord[]): PurchaseRecord[] {
  if (!project.unitBudget) return costs;
  const scopes = new Map(suiteTradeBudgets(project, []).map(category => [category.id, category.description]));
  return costs.map(cost => {
    const name = cost.budgetLineItemId ? scopes.get(cost.budgetLineItemId) : undefined;
    if (!name) return cost;
    const matches = (project.budgetLineItems ?? []).filter(category => normalized(category.description) === normalized(name));
    return matches.length === 1 ? { ...cost, budgetLineItemId: matches[0].id } : cost;
  });
}
