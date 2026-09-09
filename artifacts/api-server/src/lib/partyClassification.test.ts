import assert from "node:assert/strict";
import test from "node:test";
import {
  WEIDNER_CLIENT_NAME,
  canonicalClientName,
  isClientParty,
  isDirectoryVendorName,
  normalizeFinancialParty,
} from "./partyClassification";

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