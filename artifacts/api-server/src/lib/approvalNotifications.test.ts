import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmailApprovalNotifier, decisionEmail, requestEmail, sendEmail,
  type ApprovalEmailFacts,
} from "./approvalNotifications";

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

test("emails are sent only when configured, and delivery failures stay best-effort", async () => {
  const realFetch = globalThis.fetch;
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.APPROVAL_EMAIL_FROM;
  const sent: Array<{ url: string; body: string; auth: string | null }> = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    sent.push({ url, body: String(init.body), auth: new Headers(init.headers).get("authorization") });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    delete process.env.RESEND_API_KEY;
    process.env.APPROVAL_EMAIL_FROM = "Luminova <approvals@example.com>";
    assert.equal(await sendEmail(requestEmail(facts, ["admin@example.com"])), false);
    assert.equal(sent.length, 0, "no key, no email");
    process.env.RESEND_API_KEY = "re_test";
    delete process.env.APPROVAL_EMAIL_FROM;
    assert.equal(await sendEmail(requestEmail(facts, ["admin@example.com"])), false);
    assert.equal(sent.length, 0, "no sender, no email");
    process.env.APPROVAL_EMAIL_FROM = "Luminova <approvals@example.com>";
    assert.equal(await sendEmail(requestEmail(facts, ["admin@example.com"])), true);
    assert.equal(sent[0].url, "https://api.resend.com/emails");
    assert.equal(sent[0].auth, "Bearer re_test");
    assert.deepEqual(JSON.parse(sent[0].body).to, ["admin@example.com"]);
    assert.equal(await sendEmail(requestEmail(facts, [])), false, "no recipients, no call");
    assert.equal(sent.length, 1);

    globalThis.fetch = (async () => new Response("unavailable", { status: 503 })) as typeof fetch;
    assert.equal(await sendEmail(requestEmail(facts, ["admin@example.com"])), false, "a rejected delivery is reported");
    globalThis.fetch = (async () => { throw new Error("network unavailable"); }) as typeof fetch;
    assert.equal(await sendEmail(requestEmail(facts, ["admin@example.com"])), false, "a network failure is reported instead of thrown");
  } finally {
    globalThis.fetch = realFetch;
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalFrom === undefined) delete process.env.APPROVAL_EMAIL_FROM;
    else process.env.APPROVAL_EMAIL_FROM = originalFrom;
  }
});

test("decision notifications go once to the requester with the saved outcome", async () => {
  const delivered: Array<{ to: string[]; subject: string; text: string }> = [];
  const notifier = createEmailApprovalNotifier({
    usersForRequest: async () => [
      { id: "admin-1", role: "Admin", email: "admin@example.com" },
      { id: facts.requestedById, role: "Project Manager", email: "requester@example.com" },
    ],
    deliver: async email => {
      delivered.push(email);
      return true;
    },
  });
  const req = {} as never;

  await notifier(req, { type: "decided", approval: facts });
  await notifier(req, { type: "decided", approval: { ...facts, status: "Declined" } });

  assert.equal(delivered.length, 2);
  assert.deepEqual(delivered.map(email => email.to), [["requester@example.com"], ["requester@example.com"]]);
  assert.match(delivered[0].subject, /^Approved:/);
  assert.match(delivered[0].text, /go ahead with the purchase/);
  assert.match(delivered[1].subject, /^Declined:/);
  assert.match(delivered[1].text, /Don't make this purchase/);
});
