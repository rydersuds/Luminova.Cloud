export type ImportedClientQuote = {
  total: number;
  quoteNumber: string;
  lineItems: Array<{ id: string; description: string; amount: number }>;
  isProjectTotal?: boolean;
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
  const hasProjectQuote =
    latestClientQuote?.isProjectTotal === true &&
    Number.isFinite(latestClientQuote.total) &&
    latestClientQuote.total > 0;
  const hasProjectClientTotal =
    typeof clientQuoteDollars === "number" &&
    Number.isFinite(clientQuoteDollars) &&
    clientQuoteDollars > 0;

  if (hasProjectClientTotal) {
    const quoteMatchesContract = hasProjectQuote &&
      Math.abs(latestClientQuote.total - clientQuoteDollars) <= 0.02;
    if (!quoteMatchesContract) {
      return { total: clientQuoteDollars, revision: "", portions: [] };
    }
  }

  if (hasProjectQuote) {
    return {
      total: hasProjectClientTotal ? clientQuoteDollars : latestClientQuote.total,
      revision: latestClientQuote.quoteNumber,
      portions: latestClientQuote.lineItems.map((lineItem) => ({
        code: lineItem.id,
        label: lineItem.description,
        amount: lineItem.amount,
      })),
    };
  }

  if (hasProjectClientTotal) {
    return { total: clientQuoteDollars, revision: "", portions: [] };
  }

  return undefined;
}
