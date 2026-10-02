export type FinancialInvoice = {
  projectId: string;
  amount: number;
  direction?: "luminova_to_client" | "company_to_luminova";
  submittedById?: string;
};

export type FinancialProject = {
  projectId: string;
  clientQuoteTotal?: number;
  internalExpenseTotal?: number;
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
  lineItems?: Array<{
    id: string;
    description: string;
    amount: number;
  }>;
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

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

export function invoicedRevenueForProject(
  invoices: FinancialInvoice[],
  projectId: string,
): number {
  return roundCurrency(invoices.reduce(
    (total, invoice) =>
      total + (
        invoice.projectId === projectId && invoice.direction === "luminova_to_client"
          ? invoice.amount
          : 0
      ),
    0,
  ));
}

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

export function acceptedClientQuoteForProject(
  quotes: FinancialQuote[],
  projectId: string,
): FinancialQuote | undefined {
  const accepted = quotes
    .filter((quote) =>
      quote.projectId === projectId &&
      quote.direction === "luminova_to_client" &&
      quote.status === "Accepted"
    )
    .sort(newestFirst);
  return accepted.filter((quote) => quote.isProjectTotal === true).sort(latestProjectTotalFirst)[0]
    ?? accepted[0];
}

export function calculatePortfolioFinancialSummary(
  invoices: FinancialInvoice[],
  quotes: FinancialQuote[],
  projects: FinancialProject[] = [],
): PortfolioFinancialSummary {
  const invoicedRevenue = invoices.reduce(
    (total, invoice) => total + (invoice.direction === "luminova_to_client" ? invoice.amount : 0),
    0,
  );
  const expenseInvoicesByProject = new Map<string, number>();
  const submittedExpensesByProject = new Map<string, number>();
  for (const invoice of invoices) {
    if (invoice.direction === "luminova_to_client") continue;
    const expenseMap = invoice.submittedById ? submittedExpensesByProject : expenseInvoicesByProject;
    expenseMap.set(
      invoice.projectId,
      (expenseMap.get(invoice.projectId) ?? 0) + invoice.amount,
    );
  }

  const projectIds = new Set([
    ...invoices.map((invoice) => invoice.projectId),
    ...quotes.map((quote) => quote.projectId),
    ...projects.map((project) => project.projectId),
  ]);
  const projectsById = new Map(projects.map((project) => [project.projectId, project]));
  let invoicedExpenses = 0;
  let acceptedClientQuoteValue = 0;
  let upcomingClientPayments = 0;

  for (const projectId of projectIds) {
    const projectQuotes = quotes.filter((quote) => quote.projectId === projectId);
    const hasAcceptedClientQuote = projectQuotes.some(
      (quote) => quote.direction === "luminova_to_client" && quote.status === "Accepted",
    );
    const acceptedValue = hasAcceptedClientQuote
      ? acceptedClientQuoteTotal(projectQuotes)
      : projectsById.get(projectId)?.clientQuoteTotal ?? 0;
    const projectRevenue = invoicedRevenueForProject(invoices, projectId);
    const invoiceExpenses = expenseInvoicesByProject.get(projectId) ?? 0;
    const internalExpenses = projectsById.get(projectId)?.internalExpenseTotal ?? 0;
    invoicedExpenses += Math.max(invoiceExpenses, internalExpenses) + (submittedExpensesByProject.get(projectId) ?? 0);
    acceptedClientQuoteValue += acceptedValue;
    upcomingClientPayments += Math.max(acceptedValue - projectRevenue, 0);
  }

  return {
    invoicedRevenue: roundCurrency(invoicedRevenue),
    invoicedExpenses: roundCurrency(invoicedExpenses),
    acceptedClientQuoteValue: roundCurrency(acceptedClientQuoteValue),
    upcomingClientPayments: roundCurrency(upcomingClientPayments),
  };
}