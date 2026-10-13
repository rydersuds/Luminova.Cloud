import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  importedProjectsTable,
  projectBoardGroupsTable,
  projectBoardItemsTable,
  projectImportBatchesTable,
} from "@workspace/db";
import projectBoardsRouter, { DEFAULT_BOARD_GROUPS } from "./projectBoards";
import { setWorkspaceRoleResolverForTests } from "./users";

test("project boards are scoped to authorized project team members and keep ordering consistent", async (t) => {
  const suffix = randomUUID();
  const ownerId = `board-owner-${suffix}`;
  const outsiderId = `board-outsider-${suffix}`;
  const clientId = `board-client-${suffix}`;
  const projectId = `board-project-${suffix}`;
  const importBatchId = `board-batch-${suffix}`;

  await db.insert(projectImportBatchesTable).values({ id: importBatchId, projectId, ownerId, status: "completed", manifest: [] });
  await db.insert(importedProjectsTable).values({
    id: projectId,
    importBatchId,
    ownerId,
    data: {
      id: projectId, name: "Board test project", address: "", region: "Calgary", status: "Planning", progress: 0,
      pmName: "", clientName: "", targetDate: "", budgeted: 0, invoiced: 0, exteriorImage: "", description: "",
    },
  });

  setWorkspaceRoleResolverForTests(async (userId) => userId === clientId ? "Client" : userId === ownerId ? "Project Manager" : "Field Team");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const actor = req.header("x-test-user");
    if (actor) Object.assign(req, { userId: actor });
    Object.assign(req, { log: { error: () => undefined, warn: () => undefined } });
    next();
  });
  app.use(projectBoardsRouter);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  t.after(async () => {
    server.close();
    setWorkspaceRoleResolverForTests();
    await db.delete(projectBoardItemsTable).where(eq(projectBoardItemsTable.projectId, projectId));
    await db.delete(projectBoardGroupsTable).where(eq(projectBoardGroupsTable.projectId, projectId));
    await db.delete(importedProjectsTable).where(eq(importedProjectsTable.id, projectId));
    await db.delete(projectImportBatchesTable).where(eq(projectImportBatchesTable.id, importBatchId));
  });

  const call = (method: string, path: string, user: string, body?: unknown) => fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json", "x-test-user": user },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const boardPath = `/projects/${projectId}/board`;

  assert.equal((await call("GET", boardPath, clientId)).status, 403, "clients cannot open internal boards");
  assert.equal((await call("GET", boardPath, outsiderId)).status, 404, "users outside the project cannot see it");

  type Board = { groups: Array<{ id: string; name: string }>; items: unknown[] };
  const first = await (await call("GET", boardPath, ownerId)).json() as Board;
  assert.deepEqual(first.groups.map((group) => group.name), DEFAULT_BOARD_GROUPS.map((group) => group.name));
  assert.deepEqual(first.items, [], "no tasks are invented for a new board");
  const second = await (await call("GET", boardPath, ownerId)).json() as Board;
  assert.equal(second.groups.length, DEFAULT_BOARD_GROUPS.length, "loading again does not duplicate the template");

  const [pre, site] = first.groups;
  const badDates = await call("POST", `${boardPath}/items`, ownerId, { groupId: pre.id, name: "Permit", startDate: "2026-05-10", endDate: "2026-05-01" });
  assert.equal(badDates.status, 400);

  const create = async (name: string, groupId: string, extra: Record<string, unknown> = {}) => {
    const response = await call("POST", `${boardPath}/items`, ownerId, { groupId, name, ...extra });
    assert.equal(response.status, 201);
    return response.json() as Promise<{ id: string; position: number; groupId: string }>;
  };
  const permit = await create("Building permit", pre.id, { startDate: "2026-05-01", endDate: "2026-05-20", status: "Working on it" });
  const survey = await create("Site survey", pre.id);
  const footings = await create("Pour footings", site.id, { startDate: "2026-06-01", endDate: "2026-06-05" });
  assert.deepEqual([permit.position, survey.position], [0, 1]);

  const moved = await (await call("PATCH", `${boardPath}/items/${footings.id}`, ownerId, { groupId: pre.id, position: 0 })).json() as { groupId: string };
  assert.equal(moved.groupId, pre.id);
  const ordered = await db.select().from(projectBoardItemsTable).where(eq(projectBoardItemsTable.groupId, pre.id));
  assert.deepEqual(
    ordered.sort((a, b) => a.position - b.position).map((item) => item.id),
    [footings.id, permit.id, survey.id],
    "moving into a group at position 0 renumbers the group",
  );

  assert.equal((await call("PATCH", `${boardPath}/items/${permit.id}`, ownerId, { dependsOnId: permit.id })).status, 400);
  assert.equal((await call("PATCH", `${boardPath}/items/${footings.id}`, ownerId, { dependsOnId: permit.id })).status, 200);
  assert.equal((await call("PATCH", `${boardPath}/items/${permit.id}`, ownerId, { dependsOnId: footings.id })).status, 400, "dependency loops are rejected");
  assert.equal((await call("PATCH", `${boardPath}/items/${permit.id}`, ownerId, { endDate: "2026-04-01" })).status, 400, "end date checked against the stored start date");

  const fieldEdit = await call("PATCH", `${boardPath}/items/${survey.id}`, `field-${suffix}`, { status: "Done" });
  assert.equal(fieldEdit.status, 404, "field team still needs access to the project itself");

  const schedule = await (await call("GET", "/board-items", ownerId)).json() as Array<{ id: string; projectName: string }>;
  const scheduled = schedule.filter((item) => [permit.id, survey.id, footings.id].includes(item.id));
  assert.deepEqual(scheduled.map((item) => item.id).sort(), [permit.id, footings.id].sort(), "only dated items appear on the schedule");
  assert.ok(scheduled.every((item) => item.projectName === "Board test project"));

  assert.equal((await call("DELETE", `${boardPath}/items/${permit.id}`, ownerId)).status, 204);
  const [footingsAfter] = await db.select().from(projectBoardItemsTable).where(eq(projectBoardItemsTable.id, footings.id));
  assert.equal(footingsAfter.dependsOnId, null, "deleting an item clears links that pointed at it");

  const groupIds = (await db.select().from(projectBoardGroupsTable).where(eq(projectBoardGroupsTable.projectId, projectId))).map((group) => group.id);
  for (const id of groupIds.slice(1)) assert.equal((await call("DELETE", `${boardPath}/groups/${id}`, ownerId)).status, 204);
  assert.equal((await call("DELETE", `${boardPath}/groups/${groupIds[0]}`, ownerId)).status, 400, "the last group cannot be deleted");
  const remaining = await db.select().from(projectBoardItemsTable).where(inArray(projectBoardItemsTable.groupId, groupIds.slice(1)));
  assert.equal(remaining.length, 0, "deleting a group removes its items");
});
