import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  clientMembersTable,
  clientsTable,
  conversationParticipantsTable,
  importedProjectsTable,
  importedVendorQuotesTable,
  projectConversationsTable,
  projectImportBatchesTable,
  projectMessagesTable,
} from "@workspace/db";
import luminovaRouter from "./luminova";

process.env.NODE_ENV = "test";

test("shared conversations persist while remaining inaccessible to non-participants", async (t) => {
  const suffix = randomUUID();
  const ownerId = `conversation-owner-${suffix}`;
  const otherOwnerId = `conversation-other-${suffix}`;
  const outsiderId = `conversation-outsider-${suffix}`;
  const clientUserId = `conversation-client-${suffix}`;
  const clientId = `conversation-client-company-${suffix}`;
  const assignedClientName = `Test Client ${suffix}`;
  const workspaceId = `conversation-workspace-${suffix}`;
  const otherWorkspaceId = `conversation-other-workspace-${suffix}`;
  const projectId = `conversation-project-${suffix}`;
  const otherProjectId = `conversation-other-project-${suffix}`;
  const otherQuoteId = `conversation-other-quote-${suffix}`;
  const batchIds = [`conversation-batch-${suffix}`, `conversation-other-batch-${suffix}`];
  const project = (id: string, name: string, clientName = assignedClientName) => ({
    id,
    name,
    address: "1 Test Street",
    region: "Calgary",
    status: "In progress",
    progress: 25,
    pmName: "Project Manager",
    clientName,
    targetDate: "2026-12-31",
    budgeted: 1000,
    invoiced: 250,
    exteriorImage: "",
    description: "",
  });

  await db.insert(projectImportBatchesTable).values([
    { id: batchIds[0], projectId, ownerId, workspaceId, status: "completed", manifest: [] },
    { id: batchIds[1], projectId: otherProjectId, ownerId, workspaceId: otherWorkspaceId, status: "completed", manifest: [] },
  ]);
  await db.insert(importedProjectsTable).values([
    { id: projectId, importBatchId: batchIds[0], ownerId, workspaceId, data: project(projectId, "Owned project") },
    {
      id: otherProjectId,
      importBatchId: batchIds[1],
      ownerId,
      workspaceId: otherWorkspaceId,
      data: project(otherProjectId, "Private project", assignedClientName),
    },
  ]);
  await db.insert(importedVendorQuotesTable).values({
    id: otherQuoteId,
    importBatchId: batchIds[1],
    ownerId,
    data: {
      id: otherQuoteId,
      projectId: otherProjectId,
      notes: "Other workspace quote",
    },
  });
  await db.insert(clientsTable).values({
    id: clientId,
    workspaceId,
    name: assignedClientName,
    createdBy: ownerId,
  });
  await db.insert(clientMembersTable).values({
    id: randomUUID(),
    clientId,
    userId: clientUserId,
    addedBy: ownerId,
  });

  const startApi = async () => {
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
    t.after(() => server.close());
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  };

  t.after(async () => {
    await db.delete(conversationParticipantsTable).where(inArray(conversationParticipantsTable.userId, [ownerId, otherOwnerId, outsiderId, clientUserId]));
    await db.delete(projectMessagesTable).where(inArray(projectMessagesTable.ownerId, [ownerId, otherOwnerId, outsiderId, clientUserId]));
    await db.delete(projectConversationsTable).where(inArray(projectConversationsTable.ownerId, [ownerId, otherOwnerId, outsiderId, clientUserId]));
    await db.delete(clientMembersTable).where(eq(clientMembersTable.clientId, clientId));
    await db.delete(clientsTable).where(eq(clientsTable.id, clientId));
    await db.delete(importedVendorQuotesTable).where(eq(importedVendorQuotesTable.id, otherQuoteId));
    await db.delete(importedProjectsTable).where(inArray(importedProjectsTable.ownerId, [ownerId, otherOwnerId, outsiderId]));
    await db.delete(projectImportBatchesTable).where(inArray(projectImportBatchesTable.id, batchIds));
  });

  const base = await startApi();
  const headers = (actor: string) => ({
    "content-type": "application/json",
    "x-test-user": actor,
    "x-test-workspace": workspaceId,
    "x-test-workspace-users": `${ownerId},${otherOwnerId}`,
  });
  const clientHeaders = {
    "content-type": "application/json",
    "x-test-user": clientUserId,
    "x-test-workspace": workspaceId,
    "x-test-workspace-users": `${ownerId},${otherOwnerId},${outsiderId},${clientUserId}`,
    "x-test-workspace-client-users": clientUserId,
  };
  const staleClientHeaders = {
    ...clientHeaders,
    "x-test-workspace-users": `${ownerId},${otherOwnerId},${outsiderId}`,
  };

  assert.equal((await fetch(`${base}/conversations`)).status, 401);
  const listedProjects = await fetch(`${base}/projects`, { headers: headers(ownerId) });
  assert.equal(listedProjects.status, 200);
  assert.deepEqual(
    (await listedProjects.json() as Array<{ id: string }>).map((record) => record.id),
    [projectId],
  );
  assert.equal((await fetch(`${base}/projects/${projectId}`, {
    headers: headers(ownerId),
  })).status, 200);
  assert.equal((await fetch(`${base}/projects/${otherProjectId}`, {
    headers: headers(ownerId),
  })).status, 404);
  assert.equal((await fetch(`${base}/projects/${otherProjectId}`, {
    method: "PATCH",
    headers: headers(ownerId),
    body: JSON.stringify({ description: "Cross-workspace update must be rejected" }),
  })).status, 404);
  const [unchangedOtherProject] = await db.select({ data: importedProjectsTable.data })
    .from(importedProjectsTable)
    .where(eq(importedProjectsTable.id, otherProjectId));
  assert.equal((unchangedOtherProject.data as { description: string }).description, "");
  assert.equal((await fetch(`${base}/vendor-quotes/${otherQuoteId}`, {
    method: "PATCH",
    headers: headers(ownerId),
    body: JSON.stringify({
      projectId,
      notes: "Cross-workspace quote update must be rejected",
    }),
  })).status, 404);
  const [unchangedOtherQuote] = await db.select({ data: importedVendorQuotesTable.data })
    .from(importedVendorQuotesTable)
    .where(eq(importedVendorQuotesTable.id, otherQuoteId));
  assert.deepEqual(unchangedOtherQuote.data, {
    id: otherQuoteId,
    projectId: otherProjectId,
    notes: "Other workspace quote",
  });
  assert.equal((await fetch(`${base}/conversations`, {
    method: "POST",
    headers: headers(ownerId),
    body: JSON.stringify({ type: "project", projectId: otherProjectId, title: "Forbidden channel", participantIds: [otherOwnerId] }),
  })).status, 404);
  const clientConversationResponse = await fetch(`${base}/conversations`, {
    method: "POST",
    headers: clientHeaders,
    body: JSON.stringify({
      type: "project",
      projectId,
      title: "Client project channel",
      participantIds: [ownerId],
    }),
  });
  assert.equal(clientConversationResponse.status, 201);
  const clientConversation = await clientConversationResponse.json() as { id: string };
  assert.equal((await fetch(`${base}/conversations/${clientConversation.id}`, {
    headers: clientHeaders,
  })).status, 200);
  await db.delete(clientMembersTable).where(eq(clientMembersTable.clientId, clientId));
  assert.equal((await fetch(`${base}/conversations/${clientConversation.id}`, {
    headers: clientHeaders,
  })).status, 404);
  assert.equal((await fetch(`${base}/conversations/${clientConversation.id}/messages`, {
    method: "POST",
    headers: clientHeaders,
    body: JSON.stringify({ text: "Revoked client message" }),
  })).status, 404);
  assert.equal(
    (await (await fetch(`${base}/conversations`, { headers: clientHeaders })).json() as Array<{ id: string }>)
      .some((conversation) => conversation.id === clientConversation.id),
    false,
  );
  await db.insert(clientMembersTable).values({
    id: randomUUID(),
    clientId,
    userId: clientUserId,
    addedBy: ownerId,
  });
  assert.equal((await fetch(`${base}/conversations/${clientConversation.id}`, {
    headers: staleClientHeaders,
  })).status, 404);
  assert.equal((await fetch(`${base}/conversations/${clientConversation.id}/messages`, {
    method: "POST",
    headers: staleClientHeaders,
    body: JSON.stringify({ text: "Stale organization message" }),
  })).status, 404);
  const clientOptions = await fetch(`${base}/conversations/options`, { headers: clientHeaders });
  assert.equal(clientOptions.status, 200);
  assert.deepEqual(
    (await clientOptions.json() as { projects: Array<{ id: string }> }).projects.map((candidate) => candidate.id),
    [projectId],
  );
  assert.equal((await fetch(`${base}/conversations`, {
    method: "POST",
    headers: clientHeaders,
    body: JSON.stringify({
      type: "project",
      projectId: otherProjectId,
      title: "Unauthorized client channel",
      participantIds: [ownerId],
    }),
  })).status, 404);
  await db.delete(clientMembersTable).where(eq(clientMembersTable.clientId, clientId));
  await db.delete(clientsTable).where(eq(clientsTable.id, clientId));
  assert.equal((await fetch(`${base}/conversations/${clientConversation.id}`, {
    headers: clientHeaders,
  })).status, 404);

  const createdResponse = await fetch(`${base}/conversations`, {
    method: "POST",
    headers: headers(ownerId),
    body: JSON.stringify({ type: "project", projectId, title: "Site coordination", context: "Electrical trade", participantIds: [otherOwnerId] }),
  });
  const createdResponseBody = await createdResponse.text();
  assert.equal(createdResponse.status, 201, createdResponseBody);
  const conversation = JSON.parse(createdResponseBody) as { id: string };

  const directResponse = await fetch(`${base}/conversations`, {
    method: "POST",
    headers: headers(ownerId),
    body: JSON.stringify({ type: "direct", participantIds: [otherOwnerId] }),
  });
  assert.equal(directResponse.status, 201);
  const direct = await directResponse.json() as { id: string; title: string };
  assert.equal(direct.title, otherOwnerId);
  const otherDirect = await fetch(`${base}/conversations/${direct.id}`, { headers: headers(otherOwnerId) });
  assert.equal(otherDirect.status, 200);
  assert.equal((await otherDirect.json() as { title: string }).title, ownerId);

  const messageResponse = await fetch(`${base}/conversations/${conversation.id}/messages`, {
    method: "POST",
    headers: headers(ownerId),
    body: JSON.stringify({ text: `Private conduit update ${suffix}` }),
  });
  assert.equal(messageResponse.status, 201);
  const message = await messageResponse.json() as { id: string; conversationId: string; projectId: string };
  assert.equal(message.conversationId, conversation.id);
  assert.equal(message.projectId, projectId);

  assert.equal((await fetch(`${base}/conversations/${conversation.id}`, {
    headers: headers(otherOwnerId),
  })).status, 200);
  assert.equal((await fetch(`${base}/conversations/${conversation.id}/messages`, {
    method: "POST",
    headers: headers(otherOwnerId),
    body: JSON.stringify({ text: "Authorized reply" }),
  })).status, 201);
  assert.equal((await fetch(`${base}/conversations/${conversation.id}`, {
    headers: headers(outsiderId),
  })).status, 404);
  assert.deepEqual(await (await fetch(`${base}/conversations`, {
    headers: headers(outsiderId),
  })).json(), []);

  const ownerSearch = await fetch(`${base}/search?query=${encodeURIComponent(`conduit update ${suffix}`)}`, {
    headers: headers(ownerId),
  });
  assert.equal(ownerSearch.status, 200);
  assert.deepEqual(await ownerSearch.json(), [{
    id: message.id,
    kind: "message",
    title: "Site coordination",
    subtitle: `Private conduit update ${suffix} · Owned project`,
    href: `/messages?conversation=${conversation.id}`,
  }]);
  assert.deepEqual(await (await fetch(`${base}/search?query=${encodeURIComponent(`conduit update ${suffix}`)}`, {
    headers: headers(otherOwnerId),
  })).json(), [{
    id: message.id,
    kind: "message",
    title: "Site coordination",
    subtitle: `Private conduit update ${suffix} · Owned project`,
    href: `/messages?conversation=${conversation.id}`,
  }]);

  const freshBase = await startApi();
  const persisted = await fetch(`${freshBase}/conversations`, { headers: headers(ownerId) });
  assert.equal(persisted.status, 200);
  const records = await persisted.json() as Array<{ id: string; messages: Array<{ id: string }> }>;
  assert.equal(records.find((record) => record.id === conversation.id)?.messages[0]?.id, message.id);

  const [savedConversation] = await db.select().from(projectConversationsTable)
    .where(eq(projectConversationsTable.id, conversation.id));
  assert.equal(savedConversation.workspaceId, workspaceId);
  assert.equal(savedConversation.projectId, projectId);
});