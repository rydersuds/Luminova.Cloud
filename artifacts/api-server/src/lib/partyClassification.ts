export const WEIDNER_CLIENT_NAME = "Weidner Apartment Homes";

export const normalizePartyName = (value: string) => value.replace(/[^a-z0-9]/gi, "").toLowerCase();

export const isClientParty = (value: string | null | undefined) =>
  Boolean(value && normalizePartyName(value).includes("weidner"));

export const canonicalClientName = (value: string) =>
  isClientParty(value) ? WEIDNER_CLIENT_NAME : value;

export const isDirectoryVendorName = (value: string) =>
  !normalizePartyName(value).startsWith("luminova") && !isClientParty(value);

export const isLuminovaParty = (value: string | null | undefined) =>
  Boolean(value && normalizePartyName(value).startsWith("luminova"));

export type FinancialDirection = "luminova_to_client" | "company_to_luminova";

export function normalizeFinancialParty<T extends {
  direction?: FinancialDirection;
  vendor?: string;
  vendorName?: string;
}>(
  record: T,
  projectClientName?: string,
): T {
  const isClientRecord = isClientParty(record.vendor) ||
    isClientParty(record.vendorName) ||
    isClientParty(projectClientName);
  if (!isClientRecord) return record;
  return {
    ...record,
    direction: "luminova_to_client",
    ...(record.vendor && isClientParty(record.vendor) ? { vendor: canonicalClientName(record.vendor) } : {}),
    ...(record.vendorName && isClientParty(record.vendorName) ? { vendorName: canonicalClientName(record.vendorName) } : {}),
  };
}