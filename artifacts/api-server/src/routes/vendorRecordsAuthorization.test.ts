import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  db,
  importedProjectsTable,
  importedVendorsTable,
  projectImportBatchesTable,
  vendorJobHistoryTable,
  vendorReviewTable,
} from "@workspace/db";

const originalFetch = globalThis.fetch;
const originalNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = "test";

const users = new Map([
  ["admin", { first_name: "Ada", last_name: "Builder", public_metadata: { role: "Admin" } }],
  ["pm", { first_name: "Morgan", last_name: "Builder", public_metadata: { role: "Project Manager" } }],
  ["field", { first_name: "Field", last_name: "Builder", public_metadata: { role: "Field Team" } }],
]);

globalThis.fetch = async (input, init) => {
  const inputUrl = input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
  const url = new URL(inputUrl);
  const match = url.pathname.match(/^\/v1\/users\/([^/]+)$/);
  if (match && (init?.method ?? "GET") === "GET") {
    const user = users.get(decodeURIComponent(match[1]));
    if (!user) {
      return new Response(JSON.stringify({ errors: [{ long_message: "User not found" }] }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({
      id: decodeURIComponent(match[1]),
      object: "user",
      ...user,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  return originalFetch(input, init);
};

const { default: luminovaRouter } = await import("./luminova");

after(() => {
  globalThis.fetch = originalFetch;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

type Fixture = {
  suffix: string;
  batchId: string;
  ownerId: string;
  vendorId: string;
  completedProjectId: string;
  incompleteProjectId: string;
};

async function createFixture(): Promise<Fixture> {
  const suffix = randomUUID();
  const fixture: Fixture = {
    suffix,
    batchId: `vendor-records-batch-${suffix}`,
    ownerId: `owner-${suffix}`,
    vendorId: `vendor-records-vendor-${suffix}`,
    completedProjectId: `vendor-records-completed-${suffix}`,
    incompleteProjectId: `vendor-records-incomplete-${suffix}`,
  };
  const project = (id: string, name: string, status: string) => ({
    id,
    name,
    address: "123 Test Street",
    region: "Calgary",
    status,
    progress: status === "Completed" ? 100 : 20,
    pmName: "Morgan Builder",
    clientName: "Test Client",
    targetDate: "2026-09-30",
    budgeted: 100000,
    invoiced: 0,
    exteriorImage: "",
    description: "",
  });

  await db.insert(projectImportBatchesTable).values({
    id: fixture.batchId,
    projectId: fixture.completedProjectId,
    ownerId: fixture.ownerId,
    status: "completed",
    manifest: [],
  });
  await db.insert(importedProjectsTable).values([
    {
      id: fixture.completedProjectId,
      importBatchId: fixture.batchId,
      ownerId: fixture.ownerId,
      data: project(fixture.completedProjectId, "Completed vendor project", "Completed"),
    },
    {
      id: fixture.incompleteProjectId,
      importBatchId: fixture.batchId,
      ownerId: fixture.ownerId,
      data: project(fixture.incompleteProjectId, "Incomplete vendor project", "In progress"),
    },
  ]);
  await db.insert(importedVendorsTable).values({
    id: fixture.vendorId,
    importBatchId: fixture.batchId,
    ownerId: fixture.ownerId,
    data: {
      id: fixture.vendorId,
      companyName: "Persistent Test Electric",
      contactName: "Taylor Electric",
      tradeType: "Electrical",
      region: "Calgary",
      rating: 0,
      reviewCount: 0,
      completedJobs: 0,
      initials: "PT",
      accent: "#64748B",
    },
  });
  return fixture;
}

async function removeFixture(fixture: Fixture) {
  await db.delete(vendorReviewTable).where(eq(vendorReviewTable.vendorId, fixture.vendorId));
  await db.delete(vendorJobHistoryTable).where(eq(vendorJobHistoryTable.vendorId, fixture.vendorId));
  await db.delete(importedVendorsTable).where(eq(importedVendorsTable.id, fixture.vendorId));
  await db.delete(importedProjectsTable).where(and(
    eq(importedProjectsTable.importBatchId, fixture.batchId),
    eq(importedProjectsTable.ownerId, fixture.ownerId),
  ));
  await db.delete(projectImportBatchesTable).where(eq(projectImportBatchesTable.id, fixture.batchId));
}

async function startApi(t: { after: (callback: () => void | Promise<void>) => void }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const actor = req.header("x-test-user");
    if (actor) Object.assign(req, { userId: actor });
    next();
  });
  app.use(luminovaRouter);
  const server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  t.after(() => {
    server.close();
  });
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

function jsonHeaders(actor: string) {
  return {
    "content-type": "application/json",
    "x-test-user": actor,
  };
}

async function createHistoryWithReview(base: string, fixture: Fixture) {
  const historyResponse = await fetch(base + `/trades/${fixture.vendorId}/job-history`, {
    method: "POST",
    headers: jsonHeaders("admin"),
    body: JSON.stringify({
      projectId: fixture.completedProjectId,
      date: "2026-08-20",
      amount: 24500,
      source: "Completion certificate",
    }),
  });
  assert.equal(historyResponse.status, 201);
  const history = await historyResponse.json() as { id: string };

  const reviewResponse = await fetch(base + `/trades/${fixture.vendorId}/reviews`, {
    method: "POST",
    headers: jsonHeaders("pm"),
    body: JSON.stringify({
      projectId: fixture.completedProjectId,
      date: "2026-08-25",
      rating: 5,
      comment: "Reliable closeout and clean workmanship.",
      source: "Project closeout review",
    }),
  });
  assert.equal(reviewResponse.status, 201);
  const review = await reviewResponse.json() as { id: string };

  const [savedHistory] = await db.select().from(vendorJobHistoryTable)
    .where(eq(vendorJobHistoryTable.id, history.id));
  const [savedReview] = await db.select().from(vendorReviewTable)
    .where(eq(vendorReviewTable.id, review.id));
  assert.ok(savedHistory);
  assert.ok(savedReview);
  return { history: savedHistory, review: savedReview };
}

test("history mutations require administrators and remain durable across list/detail reads", async (t) => {
  const fixture = await createFixture();
  t.after(() => removeFixture(fixture));
  const base = await startApi(t);
  const historyPath = `/trades/${fixture.vendorId}/job-history`;
  const body = {
    projectId: fixture.completedProjectId,
    date: "2026-08-20",
    amount: 24500,
    source: "Completion certificate",
  };

  assert.equal((await fetch(base + historyPath, {
    method: "POST",
    headers: jsonHeaders("pm"),
    body: JSON.stringify(body),
  })).status, 403);

  const created = await fetch(base + historyPath, {
    method: "POST",
    headers: jsonHeaders("admin"),
    body: JSON.stringify(body),
  });
  assert.equal(created.status, 201);
  const history = await created.json() as { id: string; recordedBy: string };
  assert.equal(history.recordedBy, "admin");

  const [saved] = await db.select().from(vendorJobHistoryTable).where(eq(vendorJobHistoryTable.id, history.id));
  assert.deepEqual(
    saved && {
      vendorId: saved.vendorId,
      projectId: saved.projectId,
      completedDate: saved.completedDate,
      amount: saved.amount,
      source: saved.source,
      recordedBy: saved.recordedBy,
    },
    {
      vendorId: fixture.vendorId,
      projectId: fixture.completedProjectId,
      completedDate: "2026-08-20",
      amount: 24500,
      source: "Completion certificate",
      recordedBy: "admin",
    },
  );

  const listAfterCreate = await fetch(base + "/trades", {
    headers: { "x-test-user": fixture.ownerId },
  });
  assert.equal(listAfterCreate.status, 200);
  const listedAfterCreate = (await listAfterCreate.json() as Array<{ id: string; completedJobs: number }>)
    .find((trade) => trade.id === fixture.vendorId);
  assert.equal(listedAfterCreate?.completedJobs, 1);

  const detailAfterCreate = await fetch(base + `/trades/${fixture.vendorId}`, {
    headers: { "x-test-user": fixture.ownerId },
  });
  assert.equal(detailAfterCreate.status, 200);
  const detail = await detailAfterCreate.json() as {
    completedJobs: number;
    jobHistory: Array<{ id: string; amount: number; source: string }>;
  };
  assert.equal(detail.completedJobs, 1);
  assert.deepEqual(detail.jobHistory, [{
    id: history.id,
    vendorId: fixture.vendorId,
    projectId: fixture.completedProjectId,
    projectName: "Completed vendor project",
    date: "2026-08-20",
    amount: 24500,
    source: "Completion certificate",
    recordedBy: "admin",
  }]);

  const updatedBody = { ...body, date: "2026-08-22", amount: 25100, source: "Updated completion certificate" };
  assert.equal((await fetch(base + `${historyPath}/${history.id}`, {
    method: "PATCH",
    headers: jsonHeaders("field"),
    body: JSON.stringify(updatedBody),
  })).status, 403);
  const updated = await fetch(base + `${historyPath}/${history.id}`, {
    method: "PATCH",
    headers: jsonHeaders("admin"),
    body: JSON.stringify(updatedBody),
  });
  assert.equal(updated.status, 200);
  assert.deepEqual(await updated.json(), {
    id: history.id,
    vendorId: fixture.vendorId,
    projectId: fixture.completedProjectId,
    projectName: "Completed vendor project",
    date: "2026-08-22",
    amount: 25100,
    source: "Updated completion certificate",
    recordedBy: "admin",
  });

  assert.equal((await fetch(base + `${historyPath}/${history.id}`, {
    method: "DELETE",
    headers: { "x-test-user": "pm" },
  })).status, 403);
  assert.equal((await fetch(base + `${historyPath}/${history.id}`, {
    method: "DELETE",
    headers: { "x-test-user": "admin" },
  })).status, 204);
  assert.equal((await db.select().from(vendorJobHistoryTable).where(eq(vendorJobHistoryTable.id, history.id))).length, 0);

  const listAfterDelete = await fetch(base + "/trades", {
    headers: { "x-test-user": fixture.ownerId },
  });
  const listedAfterDelete = (await listAfterDelete.json() as Array<{ id: string; completedJobs: number }>)
    .find((trade) => trade.id === fixture.vendorId);
  assert.equal(listedAfterDelete?.completedJobs, 0);
  const detailAfterDelete = await fetch(base + `/trades/${fixture.vendorId}`, {
    headers: { "x-test-user": fixture.ownerId },
  });
  const deletedDetail = await detailAfterDelete.json() as { completedJobs: number; jobHistory: unknown[] };
  assert.equal(deletedDetail.completedJobs, 0);
  assert.deepEqual(deletedDetail.jobHistory, []);
});

test("history deletion is rejected when a review depends on it and preserves both records", async (t) => {
  const fixture = await createFixture();
  t.after(() => removeFixture(fixture));
  const base = await startApi(t);
  const { history: savedHistory, review: savedReview } = await createHistoryWithReview(base, fixture);

  const response = await fetch(base + `/trades/${fixture.vendorId}/job-history/${savedHistory.id}`, {
    method: "DELETE",
    headers: { "x-test-user": "admin" },
  });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: "Remove linked reviews before removing this job history",
  });

  const [historyAfter] = await db.select().from(vendorJobHistoryTable)
    .where(eq(vendorJobHistoryTable.id, savedHistory.id));
  const [reviewAfter] = await db.select().from(vendorReviewTable)
    .where(eq(vendorReviewTable.id, savedReview.id));
  assert.deepEqual(historyAfter, savedHistory);
  assert.deepEqual(reviewAfter, savedReview);
});

test("history project changes are rejected when a review depends on it and preserves both records", async (t) => {
  const fixture = await createFixture();
  t.after(() => removeFixture(fixture));
  const base = await startApi(t);
  const { history: savedHistory, review: savedReview } = await createHistoryWithReview(base, fixture);

  const response = await fetch(base + `/trades/${fixture.vendorId}/job-history/${savedHistory.id}`, {
    method: "PATCH",
    headers: jsonHeaders("admin"),
    body: JSON.stringify({
      projectId: fixture.incompleteProjectId,
      date: "2026-09-01",
      amount: 27000,
      source: "Revised completion certificate",
    }),
  });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: "This job history has linked reviews and cannot change projects",
  });

  const [historyAfter] = await db.select().from(vendorJobHistoryTable)
    .where(eq(vendorJobHistoryTable.id, savedHistory.id));
  const [reviewAfter] = await db.select().from(vendorReviewTable)
    .where(eq(vendorReviewTable.id, savedReview.id));
  assert.deepEqual(historyAfter, savedHistory);
  assert.deepEqual(reviewAfter, savedReview);
});

test("reviews require reviewer roles and verified completed projects, then aggregate persisted records", async (t) => {
  const fixture = await createFixture();
  t.after(() => removeFixture(fixture));
  const base = await startApi(t);
  const historyPath = `/trades/${fixture.vendorId}/job-history`;
  const reviewPath = `/trades/${fixture.vendorId}/reviews`;

  const reviewBody = {
    projectId: fixture.completedProjectId,
    date: "2026-08-25",
    rating: 5,
    comment: "Reliable closeout and clean workmanship.",
    source: "Project closeout review",
  };

  assert.equal((await fetch(base + reviewPath, {
    method: "POST",
    headers: jsonHeaders("field"),
    body: JSON.stringify(reviewBody),
  })).status, 403);
  assert.equal((await fetch(base + reviewPath, {
    method: "POST",
    headers: jsonHeaders("pm"),
    body: JSON.stringify({ ...reviewBody, projectId: `unknown-${fixture.suffix}` }),
  })).status, 404);
  assert.equal((await fetch(base + reviewPath, {
    method: "POST",
    headers: jsonHeaders("pm"),
    body: JSON.stringify({ ...reviewBody, projectId: fixture.incompleteProjectId }),
  })).status, 404);

  const historyResponse = await fetch(base + historyPath, {
    method: "POST",
    headers: jsonHeaders("admin"),
    body: JSON.stringify({
      projectId: fixture.completedProjectId,
      date: "2026-08-20",
      amount: 24500,
      source: "Completion certificate",
    }),
  });
  assert.equal(historyResponse.status, 201);

  const createdReview = await fetch(base + reviewPath, {
    method: "POST",
    headers: jsonHeaders("pm"),
    body: JSON.stringify(reviewBody),
  });
  assert.equal(createdReview.status, 201);
  const review = await createdReview.json() as { id: string; reviewerId: string; reviewer: string };
  assert.equal(review.reviewerId, "pm");
  assert.equal(review.reviewer, "Morgan Builder");

  const [savedReview] = await db.select().from(vendorReviewTable).where(eq(vendorReviewTable.id, review.id));
  assert.deepEqual(
    savedReview && {
      vendorId: savedReview.vendorId,
      projectId: savedReview.projectId,
      reviewerId: savedReview.reviewerId,
      reviewerName: savedReview.reviewerName,
      rating: savedReview.rating,
      comment: savedReview.comment,
      source: savedReview.source,
    },
    {
      vendorId: fixture.vendorId,
      projectId: fixture.completedProjectId,
      reviewerId: "pm",
      reviewerName: "Morgan Builder",
      rating: 5,
      comment: "Reliable closeout and clean workmanship.",
      source: "Project closeout review",
    },
  );

  const duplicateReview = await fetch(base + reviewPath, {
    method: "POST",
    headers: jsonHeaders("pm"),
    body: JSON.stringify(reviewBody),
  });
  assert.equal(duplicateReview.status, 409);
  assert.deepEqual(await duplicateReview.json(), {
    error: "You have already reviewed this project for this vendor",
  });

  const freshBase = await startApi(t);
  const listed = await fetch(freshBase + "/trades", {
    headers: { "x-test-user": fixture.ownerId },
  });
  const listedTrade = (await listed.json() as Array<{
    id: string;
    completedJobs: number;
    reviewCount: number;
    rating: number;
  }>).find((trade) => trade.id === fixture.vendorId);
  assert.deepEqual(listedTrade && {
    id: fixture.vendorId,
    completedJobs: 1,
    reviewCount: 1,
    rating: 5,
  }, {
    id: fixture.vendorId,
    completedJobs: 1,
    reviewCount: 1,
    rating: 5,
  });

  const freshDetail = await fetch(freshBase + `/trades/${fixture.vendorId}`, {
    headers: { "x-test-user": fixture.ownerId },
  });
  const detail = await freshDetail.json() as {
    completedJobs: number;
    reviewCount: number;
    rating: number;
    reviews: Array<{ id: string; projectName: string; reviewer: string; rating: number }>;
    jobHistory: Array<{ projectName: string }>;
  };
  assert.equal(detail.completedJobs, 1);
  assert.equal(detail.reviewCount, 1);
  assert.equal(detail.rating, 5);
  assert.deepEqual(detail.reviews.map((review) => ({
    id: review.id,
    projectName: review.projectName,
    reviewer: review.reviewer,
    rating: review.rating,
  })), [{
    id: review.id,
    projectName: "Completed vendor project",
    reviewer: "Morgan Builder",
    rating: 5,
  }]);
  assert.deepEqual(detail.jobHistory.map((history) => ({
    projectName: history.projectName,
  })), [{
    projectName: "Completed vendor project",
  }]);
});