export type ImportedClientQuote = {
  total: number;
  quoteNumber: string;
  lineItems: Array<{ id: string; description: string; amount: number }>;
};

export type ImportedClientQuoteSummary = {
  total: number;
  revision: string;
  portions: Array<{ code: string; label: string; amount: number }>;
};

export function resolveImportedProjectBudget(
  internalBudgetTotal: number | null | undefined,
  internalBudgetDollars: number | null | undefined,
) {
  return internalBudgetTotal ?? Math.round((internalBudgetDollars ?? 0) * 100) / 100;
}

export function resolveImportedClientQuote(
  clientQuoteDollars: number | null | undefined,
  latestClientQuote?: ImportedClientQuote | null,
): ImportedClientQuoteSummary | undefined {
  if (latestClientQuote) {
    return {
      total: latestClientQuote.total,
      revision: latestClientQuote.quoteNumber,
      portions: latestClientQuote.lineItems.map((lineItem) => ({
        code: lineItem.id,
        label: lineItem.description,
        amount: lineItem.amount,
      })),
    };
  }

  if (typeof clientQuoteDollars !== "number" || !Number.isFinite(clientQuoteDollars) || clientQuoteDollars <= 0) {
    return undefined;
  }

  return { total: clientQuoteDollars, revision: "", portions: [] };
}
