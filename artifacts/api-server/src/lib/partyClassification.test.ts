import assert from "node:assert/strict";
import test from "node:test";
import {
  WEIDNER_CLIENT_NAME,
  canonicalClientName,
  isClientParty,
  isConfidentCompanyQuote,
  isDirectoryVendorName,
  normalizeFinancialParty,
} from "./partyClassification";

const confidentVendorQuote = {
  direction: "company_to_luminova" as const,
  vendorName: "Northline Electric",
  amountDollars: 1250,
  confidence: 92,
  sourceRelativePaths: ["Bids/northline-125.pdf"],
};

test("treats every Weidner name as a client, not a vendor", () => {
  assert.equal(isClientParty("Weidner Apartment Homes"), true);
  assert.equal(isClientParty("WEIDNER"), true);
  assert.equal(isDirectoryVendorName("Weidner Apartment Homes"), false);
  assert.equal(canonicalClientName("WEIDNER"), WEIDNER_CLIENT_NAME);
});

test("normalizes Weidner invoices and client quotes to outgoing client records", () => {
  assert.deepEqual(
    normalizeFinancialParty({
      vendor: "Weidner",
      direction: "company_to_luminova" as const,
    }),
    {
      vendor: WEIDNER_CLIENT_NAME,
      direction: "luminova_to_client",
    },
  );
  assert.deepEqual(
    normalizeFinancialParty({
      vendorName: "Luminova Construction",
      direction: "company_to_luminova" as const,
    }, "Weidner Apartment Homes"),
    {
      vendorName: "Luminova Construction",
      direction: "luminova_to_client",
    },
  );
});

test("accepts only confident vendor-originated quote documents", () => {
  assert.equal(isConfidentCompanyQuote(confidentVendorQuote), true);
  assert.equal(isConfidentCompanyQuote({ ...confidentVendorQuote, confidence: 79 }), false);
  assert.equal(isConfidentCompanyQuote({ ...confidentVendorQuote, sourceRelativePaths: [] }), false);
  assert.equal(isConfidentCompanyQuote({ ...confidentVendorQuote, amountDollars: 0 }), false);
});

test("rejects client-facing and Luminova-issued quote records", () => {
  assert.equal(isConfidentCompanyQuote({ ...confidentVendorQuote, direction: "luminova_to_client" }), false);
  assert.equal(isConfidentCompanyQuote({ ...confidentVendorQuote, vendorName: "Luminova Construction" }), false);
  assert.equal(isConfidentCompanyQuote({ ...confidentVendorQuote, vendorName: "Weidner Apartment Homes" }), false);
});