export type FinancialInvoice = {
  projectId: string;
  amount: number;
  direction?: "luminova_to_client" | "company_to_luminova";
};

export type FinancialQuote = {
  id: string;
  quoteNumber: string;
  projectId: string;
  direction: "luminova_to_client" | "company_to_luminova";
  isProjectTotal?: boolean;
  status: string;
  revision: number;
  issueDate: string;
  createdAt: string;
  total: number;
};

export type PortfolioFinancialSummary = {
  invoicedRevenue: number;
  invoicedExpenses: number;
  acceptedClientQuoteValue: number;
  upcomingClientPayments: number;
};

const newestFirst = (a: FinancialQuote, b: FinancialQuote) =>
  b.revision - a.revision ||
  b.issueDate.localeCompare(a.issueDate) ||
  b.createdAt.localeCompare(a.createdAt) ||
  b.id.localeCompare(a.id);

const latestProjectTotalFirst = (a: FinancialQuote, b: FinancialQuote) =>
  b.issueDate.localeCompare(a.issueDate) ||
  b.revision - a.revision ||
  b.createdAt.localeCompare(a.createdAt) ||
  b.id.localeCompare(a.id);

const normalizedQuoteNumber = (quote: FinancialQuote) =>
  quote.quoteNumber.trim().toLocaleLowerCase();

export function acceptedClientQuoteTotal(quotes: FinancialQuote[]): number {
  const accepted = quotes
    .filter((quote) => quote.direction === "luminova_to_client" && quote.status === "Accepted")
    .sort(newestFirst);

  const projectTotal = accepted
    .filter((quote) => quote.isProjectTotal === true)
    .sort(latestProjectTotalFirst)[0];
  if (projectTotal) return projectTotal.total;

  const latestRevisions = new Map<string, FinancialQuote>();
  for (const quote of accepted) {
    const key = normalizedQuoteNumber(quote) || quote.id;
    if (!latestRevisions.has(key)) latestRevisions.set(key, quote);
  }
  return [...latestRevisions.values()].reduce((total, quote) => total + quote.total, 0);
}

export function calculatePortfolioFinancialSummary(
  invoices: FinancialInvoice[],
  quotes: FinancialQuote[],
): PortfolioFinancialSummary {
  const invoicedRevenue = invoices.reduce(
    (total, invoice) => total + (invoice.direction === "luminova_to_client" ? invoice.amount : 0),
    0,
  );
  const invoicedExpenses = invoices.reduce(
    (total, invoice) => total + (invoice.direction !== "luminova_to_client" ? invoice.amount : 0),
    0,
  );

  const projectIds = new Set([
    ...invoices.map((invoice) => invoice.projectId),
    ...quotes.map((quote) => quote.projectId),
  ]);
  let acceptedClientQuoteValue = 0;
  let upcomingClientPayments = 0;

  for (const projectId of projectIds) {
    const projectQuotes = quotes.filter((quote) => quote.projectId === projectId);
    const acceptedValue = acceptedClientQuoteTotal(projectQuotes);
    const projectRevenue = invoices
      .filter((invoice) => invoice.projectId === projectId && invoice.direction === "luminova_to_client")
      .reduce((total, invoice) => total + invoice.amount, 0);
    acceptedClientQuoteValue += acceptedValue;
    upcomingClientPayments += Math.max(acceptedValue - projectRevenue, 0);
  }

  return {
    invoicedRevenue,
    invoicedExpenses,
    acceptedClientQuoteValue,
    upcomingClientPayments,
  };
}