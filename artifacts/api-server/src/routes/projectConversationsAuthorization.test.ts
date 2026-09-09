import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  importedProjectsTable,
  projectConversationsTable,
  projectImportBatchesTable,
  projectMessagesTable,
} from "@workspace/db";
import luminovaRouter from "./luminova";

test("project conversations persist while remaining inaccessible across owners", async (t) => {
  const suffix = randomUUID();
  const ownerId = `conversation-owner-${suffix}`;
  const otherOwnerId = `conversation-other-${suffix}`;
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
    { id: batchIds[1], projectId: otherProjectId, ownerId: otherOwnerId, status: "completed", manifest: [] },
  ]);
  await db.insert(importedProjectsTable).values([
    { id: projectId, importBatchId: batchIds[0], ownerId, data: project(projectId, "Owned project") },
    { id: otherProjectId, importBatchId: batchIds[1], ownerId: otherOwnerId, data: project(otherProjectId, "Private project") },
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
    await db.delete(projectMessagesTable).where(inArray(projectMessagesTable.ownerId, [ownerId, otherOwnerId]));
    await db.delete(projectConversationsTable).where(inArray(projectConversationsTable.ownerId, [ownerId, otherOwnerId]));
    await db.delete(importedProjectsTable).where(inArray(importedProjectsTable.ownerId, [ownerId, otherOwnerId]));
    await db.delete(projectImportBatchesTable).where(inArray(projectImportBatchesTable.id, batchIds));
  });

  const base = await startApi();
  const headers = (actor: string) => ({ "content-type": "application/json", "x-test-user": actor });

  assert.equal((await fetch(`${base}/conversations`)).status, 401);
  assert.equal((await fetch(`${base}/conversations`, {
    method: "POST",
    headers: headers(ownerId),
    body: JSON.stringify({ projectId: otherProjectId, title: "Forbidden channel" }),
  })).status, 404);

  const createdResponse = await fetch(`${base}/conversations`, {
    method: "POST",
    headers: headers(ownerId),
    body: JSON.stringify({ projectId, title: "Site coordination", context: "Electrical trade" }),
  });
  assert.equal(createdResponse.status, 201);
  const conversation = await createdResponse.json() as { id: string };

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
    headers: { "x-test-user": otherOwnerId },
  })).status, 404);
  assert.equal((await fetch(`${base}/conversations/${conversation.id}/messages`, {
    method: "POST",
    headers: headers(otherOwnerId),
    body: JSON.stringify({ text: "Unauthorized reply" }),
  })).status, 404);
  assert.deepEqual(await (await fetch(`${base}/conversations`, {
    headers: { "x-test-user": otherOwnerId },
  })).json(), []);

  const ownerSearch = await fetch(`${base}/search?query=${encodeURIComponent(`conduit update ${suffix}`)}`, {
    headers: { "x-test-user": ownerId },
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
    headers: { "x-test-user": otherOwnerId },
  })).json(), []);

  const freshBase = await startApi();
  const persisted = await fetch(`${freshBase}/conversations`, { headers: { "x-test-user": ownerId } });
  assert.equal(persisted.status, 200);
  const records = await persisted.json() as Array<{ id: string; messages: Array<{ id: string }> }>;
  assert.equal(records.find((record) => record.id === conversation.id)?.messages[0]?.id, message.id);

  const [savedConversation] = await db.select().from(projectConversationsTable)
    .where(eq(projectConversationsTable.id, conversation.id));
  assert.equal(savedConversation.workspaceId, ownerId);
  assert.equal(savedConversation.projectId, projectId);
});