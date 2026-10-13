import assert from "node:assert/strict";
import test from "node:test";
import { decisionEmail, requestEmail, sendEmail, type ApprovalEmailFacts } from "./approvalNotifications";

const facts: ApprovalEmailFacts = {
  id: "approval-1", projectName: "Riverstone Residence", tradeLabel: "09 29 00 · Drywall", vendor: "Akal Drywalling",
  description: "Extra board for the <garage> ceiling", amount: 5700, overage: 700, remainingBefore: 5000,
  requestedById: "pm-1", requestedByName: "Maya Chen", status: "Approved", decidedByName: "Ryder Suds",
  decisionNote: "Garage added to scope", budgetIncrease: 700,
};

test("approval emails state the amount, overage and next step, with HTML escaped", () => {
  process.env.APP_URL = "https://app.example.com/";
  const request = requestEmail(facts, ["admin@example.com"]);
  assert.match(request.subject, /Approval needed: \$5,700\.00 09 29 00 · Drywall · Riverstone Residence/);
  assert.match(request.text, /had \$5,000\.00 left, so this is \$700\.00 over budget/);
  assert.match(request.text, /https:\/\/app\.example\.com\/approvals/);
  assert.match(request.html, /&lt;garage&gt;/);
  assert.doesNotMatch(request.html, /<garage>/);
  const decision = decisionEmail(facts, ["pm@example.com"]);
  assert.match(decision.subject, /^Approved:/);
  assert.match(decision.text, /budget was raised by \$700\.00/);
  assert.match(decision.text, /go ahead with the purchase/);
  assert.match(decisionEmail({ ...facts, status: "Declined" }, []).text, /Don't make this purchase/);
  delete process.env.APP_URL;
});

test("emails go through Resend only when it is configured", async () => {
  const realFetch = globalThis.fetch;
  const sent: Array<{ url: string; body: string; auth: string | null }> = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    sent.push({ url, body: String(init.body), auth: new Headers(init.headers).get("authorization") });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    delete process.env.RESEND_API_KEY;
    assert.equal(await sendEmail(requestEmail(facts, ["admin@example.com"])), false);
    assert.equal(sent.length, 0, "no key, no email");
    process.env.RESEND_API_KEY = "re_test";
    process.env.APPROVAL_EMAIL_FROM = "Luminova <approvals@example.com>";
    assert.equal(await sendEmail(requestEmail(facts, ["admin@example.com"])), true);
    assert.equal(sent[0].url, "https://api.resend.com/emails");
    assert.equal(sent[0].auth, "Bearer re_test");
    assert.deepEqual(JSON.parse(sent[0].body).to, ["admin@example.com"]);
    assert.equal(await sendEmail(requestEmail(facts, [])), false, "no recipients, no call");
    assert.equal(sent.length, 1);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.RESEND_API_KEY;
    delete process.env.APPROVAL_EMAIL_FROM;
  }
});
