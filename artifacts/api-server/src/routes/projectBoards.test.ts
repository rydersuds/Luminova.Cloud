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
import { MAX_BOARD_IMPORT_BYTES } from "../lib/boardImportExtraction";

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
    if (actor) {
      const auth = Object.assign(
        () => ({ userId: actor, orgId: req.header("x-test-workspace") ?? null, tokenType: "session_token" }),
        { [Symbol.for("@clerk/express.auth")]: true },
      );
      Object.assign(req, { userId: actor, auth });
    }
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

  const call = (method: string, path: string, user: string, body?: unknown, workspace?: string) => fetch(`${base}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-test-user": user,
      ...(workspace ? { "x-test-workspace": workspace } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const upload = (filename: string, contents: Buffer, user = ownerId, workspace?: string) => fetch(`${base}/projects/${projectId}/board/import/preview`, {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
      "x-file-name": filename,
      "x-test-user": user,
      ...(workspace ? { "x-test-workspace": workspace } : {}),
    },
    body: contents,
  });
  const boardPath = `/projects/${projectId}/board`;

  assert.equal((await call("GET", boardPath, clientId)).status, 403, "clients cannot open internal boards");
  assert.equal((await call("GET", boardPath, outsiderId)).status, 404, "users outside the project cannot see it");
  assert.equal((await call("GET", boardPath, ownerId, undefined, `other-workspace-${suffix}`)).status, 404, "workspace scope hides projects from other organizations");

  type Board = { groups: Array<{ id: string; name: string }>; items: unknown[] };
  const first = await (await call("GET", boardPath, ownerId)).json() as Board;
  assert.deepEqual(first.groups.map((group) => group.name), DEFAULT_BOARD_GROUPS.map((group) => group.name));
  assert.deepEqual(first.items, [], "no tasks are invented for a new board");
  const second = await (await call("GET", boardPath, ownerId)).json() as Board;
  assert.equal(second.groups.length, DEFAULT_BOARD_GROUPS.length, "loading again does not duplicate the template");

  const [pre, site] = first.groups;
  assert.equal((await upload("schedule.csv", Buffer.from("Task,Group\nInstall cabinets,Interior finishes\n"), clientId)).status, 403);
  assert.equal((await upload("schedule.csv", Buffer.from("Task,Group\nInstall cabinets,Interior finishes\n"), outsiderId)).status, 404);
  assert.equal((await upload("schedule.csv", Buffer.from("Task,Group\nInstall cabinets,Interior finishes\n"), ownerId, `other-workspace-${suffix}`)).status, 404);
  assert.equal((await upload("notes.docx", Buffer.from("unsupported"), ownerId)).status, 415);
  assert.equal(
    (await upload("oversized.csv", Buffer.alloc(MAX_BOARD_IMPORT_BYTES + 1), ownerId)).status,
    413,
    "uploads above the server limit are rejected before parsing",
  );
  const csvPreviewResponse = await upload(
    "schedule.csv",
    Buffer.from("Task,Group,Start Date,Cost\nInstall cabinets,Interior finishes,2026-05-02,\"$1,234.50\"\n"),
  );
  assert.equal(csvPreviewResponse.status, 200);
  const csvPreview = await csvPreviewResponse.json() as {
    groups: string[];
    rows: Array<{ name: string; sourceGroup: string; startDate: string; costCents: number }>;
  };
  assert.deepEqual(csvPreview.groups, ["Interior finishes"]);
  assert.deepEqual(csvPreview.rows.map((row) => [row.name, row.sourceGroup, row.startDate, row.costCents]), [
    ["Install cabinets", "Interior finishes", "2026-05-02", 123450],
  ]);
  const unreadable = await upload("invalid.csv", Buffer.from("No schedule headings\nOnly notes"));
  assert.equal(unreadable.status, 422);
  assert.match((await unreadable.json() as { error: string }).error, /No task or item column/);

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

  const beforeImport = await db.select().from(projectBoardItemsTable).where(eq(projectBoardItemsTable.projectId, projectId));
  const importDenied = await call("POST", `${boardPath}/import`, clientId, {
    groupsToCreate: [],
    items: [{ groupRef: pre.id, name: "Client must not import" }],
  });
  assert.equal(importDenied.status, 403);
  assert.equal((await call("POST", `${boardPath}/import`, ownerId, {
    groupsToCreate: [],
    items: [{ groupRef: pre.id, name: "Wrong workspace import" }],
  }, `other-workspace-${suffix}`)).status, 404);
  const unmapped = await call("POST", `${boardPath}/import`, ownerId, {
    groupsToCreate: [],
    items: [{ groupRef: "another-project-group", name: "Unmapped task" }],
  });
  assert.equal(unmapped.status, 400);
  const invalidDates = await call("POST", `${boardPath}/import`, ownerId, {
    groupsToCreate: [{ key: "rolled-back-group", name: "Should not be created", color: "gold" }],
    items: [{ groupRef: "rolled-back-group", name: "Impossible date", startDate: "2026-02-31" }],
  });
  assert.equal(invalidDates.status, 400);
  const createdGroupName = `Imported phase ${suffix}`;
  const createdImport = await call("POST", `${boardPath}/import`, ownerId, {
    groupsToCreate: [{ key: "new-import-phase", name: createdGroupName, color: "#1177CC" }],
    items: [
      { groupRef: pre.id, name: "Imported permit milestone", status: "Not started" },
      { groupRef: "new-import-phase", name: "Imported electrical rough-in", startDate: "2026-07-01", color: "#33AA66" },
    ],
  });
  assert.equal(createdImport.status, 201);
  const importResult = await createdImport.json() as {
    groups: Array<{ id: string; name: string; position: number; color: string }>;
    items: Array<{ name: string; groupId: string; position: number; color: string | null }>;
  };
  assert.deepEqual(importResult.groups.map(({ name }) => name), [createdGroupName]);
  assert.deepEqual(importResult.items.map(({ name }) => name), ["Imported permit milestone", "Imported electrical rough-in"]);
  assert.ok(importResult.items[0].position > 0, "import appends after existing group items");
  assert.equal(importResult.items[1].groupId, importResult.groups[0].id);
  assert.equal(importResult.groups[0].color, "#1177CC");
  assert.equal(importResult.items[1].color, "#33AA66");
  const reloadedImport = await (await call("GET", boardPath, ownerId)).json() as { items: Array<{ name: string; color: string | null }> };
  assert.equal(reloadedImport.items.find((item) => item.name === "Imported electrical rough-in")?.color, "#33AA66");
  const retained = await db.select().from(projectBoardItemsTable).where(eq(projectBoardItemsTable.projectId, projectId));
  assert.ok(retained.some((item) => item.id === survey.id), "import does not replace or remove existing items");
  assert.equal(retained.length, beforeImport.length + 2);

  const groupsBeforeRollback = await db.select().from(projectBoardGroupsTable).where(eq(projectBoardGroupsTable.projectId, projectId));
  const itemsBeforeRollback = await db.select().from(projectBoardItemsTable).where(eq(projectBoardItemsTable.projectId, projectId));
  const databaseFailure = await call("POST", `${boardPath}/import`, ownerId, {
    groupsToCreate: [{ key: "failed-transaction", name: "Failed transaction group", color: "gold" }],
    items: [
      { groupRef: "failed-transaction", name: "Valid item before database error" },
      { groupRef: "failed-transaction", name: "Invalid integer amount", costCents: 2147483648 },
    ],
  });
  assert.equal(databaseFailure.status, 500, "a database failure returns an import-level error");
  const groupsAfterRollback = await db.select().from(projectBoardGroupsTable).where(eq(projectBoardGroupsTable.projectId, projectId));
  const itemsAfterRollback = await db.select().from(projectBoardItemsTable).where(eq(projectBoardItemsTable.projectId, projectId));
  assert.equal(groupsAfterRollback.length, groupsBeforeRollback.length, "transaction rolls back the new group");
  assert.equal(itemsAfterRollback.length, itemsBeforeRollback.length, "transaction leaves no partial items");

  assert.equal((await call("DELETE", `${boardPath}/items/${permit.id}`, ownerId)).status, 204);
  const [footingsAfter] = await db.select().from(projectBoardItemsTable).where(eq(projectBoardItemsTable.id, footings.id));
  assert.equal(footingsAfter.dependsOnId, null, "deleting an item clears links that pointed at it");

  const groupIds = (await db.select().from(projectBoardGroupsTable).where(eq(projectBoardGroupsTable.projectId, projectId))).map((group) => group.id);
  for (const id of groupIds.slice(1)) assert.equal((await call("DELETE", `${boardPath}/groups/${id}`, ownerId)).status, 204);
  assert.equal((await call("DELETE", `${boardPath}/groups/${groupIds[0]}`, ownerId)).status, 400, "the last group cannot be deleted");
  const remaining = await db.select().from(projectBoardItemsTable).where(inArray(projectBoardItemsTable.groupId, groupIds.slice(1)));
  assert.equal(remaining.length, 0, "deleting a group removes its items");
});
