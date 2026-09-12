import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  conversationParticipantsTable,
  importedProjectsTable,
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
  const projectId = `conversation-project-${suffix}`;
  const otherProjectId = `conversation-other-project-${suffix}`;
  const batchIds = [`conversation-batch-${suffix}`, `conversation-other-batch-${suffix}`];
  const project = (id: string, name: string) => ({
    id,
    name,
    address: "1 Test Street",
    region: "Calgary",
    status: "In progress",
    progress: 25,
    pmName: "Project Manager",
    clientName: "Test Client",
    targetDate: "2026-12-31",
    budgeted: 1000,
    invoiced: 250,
    exteriorImage: "",
    description: "",
  });

  await db.insert(projectImportBatchesTable).values([
    { id: batchIds[0], projectId, ownerId, status: "completed", manifest: [] },
    { id: batchIds[1], projectId: otherProjectId, ownerId: outsiderId, status: "completed", manifest: [] },
  ]);
  await db.insert(importedProjectsTable).values([
    { id: projectId, importBatchId: batchIds[0], ownerId, data: project(projectId, "Owned project") },
    { id: otherProjectId, importBatchId: batchIds[1], ownerId: outsiderId, data: project(otherProjectId, "Private project") },
  ]);

  const startApi = async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const actor = req.header("x-test-user");
      if (actor) Object.assign(req, { userId: actor });
      next();
    });
    app.use(luminovaRouter);
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    t.after(() => server.close());
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  };

  t.after(async () => {
    await db.delete(conversationParticipantsTable).where(inArray(conversationParticipantsTable.userId, [ownerId, otherOwnerId, outsiderId]));
    await db.delete(projectMessagesTable).where(inArray(projectMessagesTable.ownerId, [ownerId, otherOwnerId, outsiderId]));
    await db.delete(projectConversationsTable).where(inArray(projectConversationsTable.ownerId, [ownerId, otherOwnerId, outsiderId]));
    await db.delete(importedProjectsTable).where(inArray(importedProjectsTable.ownerId, [ownerId, otherOwnerId, outsiderId]));
    await db.delete(projectImportBatchesTable).where(inArray(projectImportBatchesTable.id, batchIds));
  });

  const base = await startApi();
  const headers = (actor: string) => ({
    "content-type": "application/json",
    "x-test-user": actor,
    "x-test-workspace-users": `${ownerId},${otherOwnerId}`,
  });

  assert.equal((await fetch(`${base}/conversations`)).status, 401);
  assert.equal((await fetch(`${base}/conversations`, {
    method: "POST",
    headers: headers(ownerId),
    body: JSON.stringify({ type: "project", projectId: otherProjectId, title: "Forbidden channel", participantIds: [otherOwnerId] }),
  })).status, 404);

  const createdResponse = await fetch(`${base}/conversations`, {
    method: "POST",
    headers: headers(ownerId),
    body: JSON.stringify({ type: "project", projectId, title: "Site coordination", context: "Electrical trade", participantIds: [otherOwnerId] }),
  });
  assert.equal(createdResponse.status, 201);
  const conversation = await createdResponse.json() as { id: string };

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
  assert.equal(savedConversation.workspaceId, "default");
  assert.equal(savedConversation.projectId, projectId);
});