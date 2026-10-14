import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  importedInvoicesTable,
  importedProjectsTable,
  projectActivitiesTable,
  projectImportBatchesTable,
  projectPanoramasTable,
} from "@workspace/db";
import luminovaRouter from "./luminova";

test("dashboard summary reports persisted, workspace-scoped metrics with explicit unavailable unread count", async (t) => {
  const suffix = randomUUID();
  const ownerId = `dashboard-owner-${suffix}`;
  const workspaceId = `dashboard-workspace-${suffix}`;
  const otherWorkspaceId = `dashboard-other-workspace-${suffix}`;
  const projectIds = Array.from({ length: 6 }, (_, index) => `dashboard-project-${index}-${suffix}`);
  const otherProjectId = `dashboard-private-project-${suffix}`;
  const batchIds = [
    ...projectIds.map((_, index) => `${index === 5 ? "imported" : "manual"}-dashboard-batch-${index}-${suffix}`),
    `dashboard-private-batch-${suffix}`,
  ];
  const now = Date.now();

  const project = (id: string, status: string, budgeted: number, budgetEnabled?: boolean) => ({
    id,
    name: id,
    address: "1 Test Street",
    region: "Calgary",
    status,
    progress: 0,
    pmName: "Test PM",
    clientName: "Test Client",
    targetDate: "2027-01-01",
    budgeted,
    invoiced: 0,
    exteriorImage: "",
    description: "",
    ...(budgetEnabled === undefined ? {} : { budgetEnabled }),
  });

  await db.insert(projectImportBatchesTable).values([
    ...projectIds.map((projectId, index) => ({
      id: batchIds[index],
      projectId,
      ownerId,
      workspaceId,
      status: "completed",
      manifest: [],
    })),
    {
      id: batchIds[6],
      projectId: otherProjectId,
      ownerId,
      workspaceId: otherWorkspaceId,
      status: "completed",
      manifest: [],
    },
  ]);
  await db.insert(importedProjectsTable).values([
    { id: projectIds[0], importBatchId: batchIds[0], ownerId, workspaceId, data: project(projectIds[0], "Active", 100_000) },
    { id: projectIds[1], importBatchId: batchIds[1], ownerId, workspaceId, data: project(projectIds[1], "In progress", 20_000, false) },
    { id: projectIds[2], importBatchId: batchIds[2], ownerId, workspaceId, data: project(projectIds[2], "Planning", 0) },
    { id: projectIds[3], importBatchId: batchIds[3], ownerId, workspaceId, data: project(projectIds[3], "Completed", 0) },
    { id: projectIds[4], importBatchId: batchIds[4], ownerId, workspaceId, data: project(projectIds[4], "Paused", 0) },
    {
      id: projectIds[5], importBatchId: batchIds[5], ownerId, workspaceId,
      data: project(projectIds[5], "Planning", 2500),
    },
    { id: otherProjectId, importBatchId: batchIds[6], ownerId, workspaceId: otherWorkspaceId, data: project(otherProjectId, "Active", 9_000_000) },
  ]);
  await db.insert(importedInvoicesTable).values([
    {
      id: `dashboard-pending-${suffix}`,
      importBatchId: batchIds[0],
      ownerId,
      data: {
        id: `dashboard-pending-${suffix}`, projectId: projectIds[0], amount: 10,
        status: "Pending approval", direction: "company_to_luminova",
      },
    },
    {
      id: `dashboard-pending-short-status-${suffix}`,
      importBatchId: batchIds[1],
      ownerId,
      data: {
        id: `dashboard-pending-short-status-${suffix}`, projectId: projectIds[1], amount: 15,
        status: "Pending", direction: "company_to_luminova",
      },
    },
    {
      id: `dashboard-client-invoice-${suffix}`,
      importBatchId: batchIds[1],
      ownerId,
      data: {
        id: `dashboard-client-invoice-${suffix}`, projectId: projectIds[1], amount: 42,
        status: "Sent", direction: "luminova_to_client",
      },
    },
    {
      // Same owner and visible project ID, but a private import batch must not cross the workspace boundary.
      id: `dashboard-private-invoice-${suffix}`,
      importBatchId: batchIds[6],
      ownerId,
      data: {
        id: `dashboard-private-invoice-${suffix}`, projectId: projectIds[0], amount: 999,
        status: "Pending approval", direction: "company_to_luminova",
      },
    },
  ]);
  await db.insert(projectPanoramasTable).values([
    {
      id: `dashboard-recent-panorama-${suffix}`, projectId: projectIds[0], objectPath: `/objects/${suffix}-recent`,
      label: null, location: null, captureDate: null, createdAt: new Date(now - 6 * 24 * 60 * 60 * 1000),
    },
    {
      id: `dashboard-old-panorama-${suffix}`, projectId: projectIds[0], objectPath: `/objects/${suffix}-old`,
      label: null, location: null, captureDate: null, createdAt: new Date(now - 8 * 24 * 60 * 60 * 1000),
    },
    {
      id: `dashboard-private-panorama-${suffix}`, projectId: otherProjectId, objectPath: `/objects/${suffix}-private`,
      label: null, location: null, captureDate: null, createdAt: new Date(now),
    },
  ]);
  await db.insert(projectActivitiesTable).values([
    {
      id: `dashboard-activity-${suffix}`, projectId: projectIds[0], ownerId, type: "status",
      title: "Persisted update", description: "A real project activity.", author: "Test PM",
      createdAt: new Date(now - 60_000),
    },
    {
      id: `dashboard-private-activity-${suffix}`, projectId: otherProjectId, ownerId, type: "status",
      title: "Private update", description: "Must not appear.", author: "Test PM", createdAt: new Date(now),
    },
  ]);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const actor = req.header("x-test-user");
    const orgId = req.header("x-test-workspace");
    const auth = Object.assign(
      () => ({ userId: actor || null, orgId: orgId || null, tokenType: "session_token" }),
      { [Symbol.for("@clerk/express.auth")]: true },
    );
    if (actor) Object.assign(req, { userId: actor, auth });
    next();
  });
  app.use(luminovaRouter);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;

  t.after(async () => {
    server.close();
    await db.delete(projectActivitiesTable).where(eq(projectActivitiesTable.ownerId, ownerId));
    await db.delete(projectPanoramasTable).where(inArray(projectPanoramasTable.projectId, [...projectIds, otherProjectId]));
    await db.delete(importedInvoicesTable).where(inArray(importedInvoicesTable.importBatchId, batchIds));
    await db.delete(importedProjectsTable).where(inArray(importedProjectsTable.importBatchId, batchIds));
    await db.delete(projectImportBatchesTable).where(inArray(projectImportBatchesTable.id, batchIds));
  });

  const response = await fetch(`http://127.0.0.1:${port}/dashboard/summary`, {
    headers: { "x-test-user": ownerId, "x-test-workspace": workspaceId },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    activeProjects: 2,
    awaitingApproval: 2,
    unreadMessages: null,
    new360Photos: 1,
    budgetEnabledProjects: 5,
    budgeted: 3500,
    invoiced: 42,
    recentActivity: [{
      id: `dashboard-activity-${suffix}`,
      type: "status",
      title: "Persisted update",
      description: "A real project activity.",
      author: "Test PM",
      date: new Date(now - 60_000).toISOString(),
    }],
  });
  const financialResponse = await fetch(`http://127.0.0.1:${port}/invoices/summary`, {
    headers: { "x-test-user": ownerId, "x-test-workspace": workspaceId },
  });
  assert.equal(financialResponse.status, 200);
  const financialSummary = await financialResponse.json() as { invoicedExpenses: number; invoicedRevenue: number };
  assert.equal(financialSummary.invoicedExpenses, 25, "internal costs remain reportable when one project's budget is disabled");
  assert.equal(financialSummary.invoicedRevenue, 42, "client invoice revenue remains reportable independently of budget tracking");
});