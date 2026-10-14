import express, { Router, type IRouter, type Request, type Response } from "express";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import {
  db,
  projectBoardGroupsTable,
  projectBoardItemsTable,
  type ProjectBoardGroupRow,
  type ProjectBoardItemRow,
} from "@workspace/db";
import {
  CreateBoardGroupBody,
  CreateBoardGroupParams,
  CreateBoardGroupResponse,
  CreateBoardItemBody,
  CreateBoardItemParams,
  CreateBoardItemResponse,
  DeleteBoardGroupParams,
  DeleteBoardItemParams,
  GetBoardScheduleResponse,
  GetProjectBoardParams,
  GetProjectBoardResponse,
  ImportBoardItemsBody,
  ImportBoardItemsParams,
  ImportBoardItemsResponse,
  PreviewBoardImportHeader,
  PreviewBoardImportParams,
  PreviewBoardImportResponse,
  UpdateBoardGroupBody,
  UpdateBoardGroupParams,
  UpdateBoardGroupResponse,
  UpdateBoardItemBody,
  UpdateBoardItemParams,
  UpdateBoardItemResponse,
} from "@workspace/api-zod";
import { findAuthorizedProject, projectsForOwner, requestWorkspaceId } from "./luminova";
import { requireWorkspaceRole } from "./users";
import { extractBoardImport, isSupportedBoardImportName, MAX_BOARD_IMPORT_BYTES } from "../lib/boardImportExtraction";

type AuthenticatedRequest = Request & { userId?: string };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const BOARD_ROLES = ["Admin", "Project Manager", "Field Team"] as const;
const BOARD_ACCESS_ERROR = "Project team access required";

/** Phases every new construction board starts with. Structure only: no tasks are invented. */
export const DEFAULT_BOARD_GROUPS = [
  { name: "Pre-construction", color: "sky" },
  { name: "Site work & foundation", color: "orange" },
  { name: "Structure & envelope", color: "gold" },
  { name: "Mechanical, electrical & plumbing", color: "indigo" },
  { name: "Interior finishes", color: "pink" },
  { name: "Closeout & handover", color: "green" },
] as const;

const router: IRouter = Router();

function serializeGroup(row: ProjectBoardGroupRow) {
  return { id: row.id, projectId: row.projectId, name: row.name, color: row.color, position: row.position };
}

function serializeItem(row: ProjectBoardItemRow) {
  return {
    id: row.id,
    projectId: row.projectId,
    groupId: row.groupId,
    name: row.name,
    color: row.color,
    status: row.status,
    priority: row.priority,
    assignee: row.assignee,
    startDate: row.startDate,
    endDate: row.endDate,
    costCents: row.costCents,
    dependsOnId: row.dependsOnId,
    position: row.position,
  };
}

function templateGroupId(workspaceId: string, projectId: string, index: number) {
  return `bg_${createHash("sha256").update(`${workspaceId}\u0000${projectId}\u0000${index}`).digest("hex").slice(0, 24)}`;
}

/** Resolves the caller's access to a project board, answering the request itself when access is refused. */
async function authorizeBoard(req: AuthenticatedRequest, res: Response, projectId: string) {
  if (!req.userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  if (!await requireWorkspaceRole(req, res, BOARD_ROLES, BOARD_ACCESS_ERROR)) return null;
  const workspaceId = requestWorkspaceId(req);
  const project = await findAuthorizedProject(projectId, req.userId, workspaceId);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return null;
  }
  return { project, workspaceId, userId: req.userId };
}

const boardScope = (table: typeof projectBoardGroupsTable | typeof projectBoardItemsTable, workspaceId: string, projectId: string) =>
  and(eq(table.workspaceId, workspaceId), eq(table.projectId, projectId));

async function ensureDefaultGroups(workspaceId: string, projectId: string) {
  const existing = await db.select({ id: projectBoardGroupsTable.id }).from(projectBoardGroupsTable)
    .where(boardScope(projectBoardGroupsTable, workspaceId, projectId)).limit(1);
  if (existing.length) return;
  // Deterministic ids make concurrent first loads converge on one set of groups.
  await db.insert(projectBoardGroupsTable).values(DEFAULT_BOARD_GROUPS.map((group, index) => ({
    id: templateGroupId(workspaceId, projectId, index),
    workspaceId,
    projectId,
    name: group.name,
    color: group.color,
    position: index,
  }))).onConflictDoNothing();
}

/** Rewrites positions 0..n for a list of ids in the given order. */
async function renumber(tx: Tx, table: typeof projectBoardGroupsTable | typeof projectBoardItemsTable, ids: string[]) {
  for (const [position, id] of ids.entries()) {
    await tx.update(table).set({ position }).where(eq(table.id, id));
  }
}

function insertAt<T>(list: T[], value: T, index: number) {
  const next = [...list];
  next.splice(Math.max(0, Math.min(index, next.length)), 0, value);
  return next;
}

/** True when pointing `itemId` at `dependsOnId` would close a loop of dependencies. */
function createsDependencyCycle(items: Pick<ProjectBoardItemRow, "id" | "dependsOnId">[], itemId: string, dependsOnId: string) {
  const byId = new Map(items.map((item) => [item.id, item.dependsOnId]));
  let cursor: string | null | undefined = dependsOnId;
  for (let hops = 0; cursor && hops <= items.length; hops += 1) {
    if (cursor === itemId) return true;
    cursor = byId.get(cursor);
  }
  return false;
}

const invalid = (res: Response, error: string) => {
  res.status(400).json({ error });
};

router.get("/projects/:projectId/board", async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = GetProjectBoardParams.safeParse(req.params);
  if (!params.success) return invalid(res, "Choose a valid project.");
  const access = await authorizeBoard(req, res, params.data.projectId);
  if (!access) return;
  try {
    await ensureDefaultGroups(access.workspaceId, access.project.id);
    const [groups, items] = await Promise.all([
      db.select().from(projectBoardGroupsTable)
        .where(boardScope(projectBoardGroupsTable, access.workspaceId, access.project.id))
        .orderBy(asc(projectBoardGroupsTable.position), asc(projectBoardGroupsTable.createdAt)),
      db.select().from(projectBoardItemsTable)
        .where(boardScope(projectBoardItemsTable, access.workspaceId, access.project.id))
        .orderBy(asc(projectBoardItemsTable.position), asc(projectBoardItemsTable.createdAt)),
    ]);
    res.json(GetProjectBoardResponse.parse({
      projectId: access.project.id,
      groups: groups.map(serializeGroup),
      items: items.map(serializeItem),
    }));
  } catch (error) {
    req.log.error({ err: error, projectId: access.project.id }, "Failed to load project board");
    res.status(500).json({ error: "The board could not be loaded." });
  }
});

router.post("/projects/:projectId/board/import/preview", async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = PreviewBoardImportParams.safeParse(req.params);
  if (!params.success) return invalid(res, "Choose a valid project.");
  const access = await authorizeBoard(req, res, params.data.projectId);
  if (!access) return;
  const filename = PreviewBoardImportHeader.safeParse({ "X-File-Name": req.get("X-File-Name") });
  if (!filename.success) return invalid(res, "Choose a supported file with a valid filename.");
  if (!isSupportedBoardImportName(filename.data["X-File-Name"])) {
    res.status(415).json({ error: "Choose a CSV, XLSX, PDF, JPEG, or PNG file." });
    return;
  }

  express.raw({ type: "application/octet-stream", limit: MAX_BOARD_IMPORT_BYTES })(req, res, async (parseError) => {
    if (parseError) {
      const status = typeof parseError === "object" && parseError && "status" in parseError
        ? Number(parseError.status)
        : 400;
      res.status(status === 413 ? 413 : 400).json({
        error: status === 413 ? "Files must be 8 MiB or smaller." : "The uploaded file could not be read.",
      });
      return;
    }
    if (!Buffer.isBuffer(req.body) || !req.body.length) {
      res.status(400).json({ error: "Choose a non-empty file." });
      return;
    }
    try {
      const categories = await db.select({ name: projectBoardGroupsTable.name }).from(projectBoardGroupsTable)
        .where(boardScope(projectBoardGroupsTable, access.workspaceId, access.project.id));
      const preview = await extractBoardImport(req.body, filename.data["X-File-Name"], undefined, undefined, {
        filename: filename.data["X-File-Name"],
        categories: categories.length ? categories.map((group) => group.name) : DEFAULT_BOARD_GROUPS.map((group) => group.name),
        projectDates: { start: access.project.startDate, end: access.project.targetDate },
      });
      res.json(PreviewBoardImportResponse.parse(preview));
    } catch (error) {
      req.log.warn({ err: error, projectId: access.project.id }, "Board import file could not be parsed");
      const message = error instanceof Error ? error.message : "The file could not be read.";
      res.status(422).json({ error: message });
    }
  });
});

router.post("/projects/:projectId/board/import", async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = ImportBoardItemsParams.safeParse(req.params);
  const body = ImportBoardItemsBody.safeParse(req.body);
  if (!params.success || !body.success) return invalid(res, "Review the imported rows and check their fields and group mappings.");
  const access = await authorizeBoard(req, res, params.data.projectId);
  if (!access) return;

  const groups = await db.select().from(projectBoardGroupsTable)
    .where(boardScope(projectBoardGroupsTable, access.workspaceId, access.project.id))
    .orderBy(asc(projectBoardGroupsTable.position), asc(projectBoardGroupsTable.createdAt));
  const existingGroupIds = new Set(groups.map((group) => group.id));
  const newGroupKeys = new Set<string>();
  const newGroupNames = new Set<string>();
  for (const group of body.data.groupsToCreate) {
    const key = group.key.trim();
    const name = group.name.trim();
    if (!key || !name || existingGroupIds.has(key) || newGroupKeys.has(key)) {
      return invalid(res, "New group mappings must have unique keys and non-empty names.");
    }
    const normalizedName = name.toLocaleLowerCase();
    if (newGroupNames.has(normalizedName)) {
      return invalid(res, "Each new board group must have a unique name.");
    }
    newGroupKeys.add(key);
    newGroupNames.add(normalizedName);
  }
  for (const item of body.data.items) {
    if (!existingGroupIds.has(item.groupRef) && !newGroupKeys.has(item.groupRef)) {
      return invalid(res, "Map every imported row to a group on this project's board.");
    }
    const name = item.name.trim();
    if (!name) return invalid(res, "Every imported row needs a task name.");
    if (item.startDate && item.endDate && item.endDate < item.startDate) {
      return invalid(res, "An imported row has an end date before its start date.");
    }
    for (const value of [item.startDate, item.endDate]) {
      if (value) {
        const parsedDate = new Date(`${value}T00:00:00.000Z`);
        if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== value) {
          return invalid(res, "An imported row has an invalid calendar date.");
        }
      }
    }
  }

  try {
    const result = await db.transaction(async (tx) => {
      const createdGroups = body.data.groupsToCreate.length
        ? await tx.insert(projectBoardGroupsTable).values(body.data.groupsToCreate.map((group, index) => ({
          id: randomUUID(),
          workspaceId: access.workspaceId,
          projectId: access.project.id,
          name: group.name.trim(),
          color: group.color,
          position: groups.length + index,
        }))).returning()
        : [];
      const groupByRef = new Map<string, ProjectBoardGroupRow>(groups.map((group) => [group.id, group]));
      body.data.groupsToCreate.forEach((group, index) => groupByRef.set(group.key, createdGroups[index]));

      const positions = new Map<string, number>();
      const counts = await tx.select({ groupId: projectBoardItemsTable.groupId })
        .from(projectBoardItemsTable)
        .where(boardScope(projectBoardItemsTable, access.workspaceId, access.project.id));
      for (const row of counts) positions.set(row.groupId, (positions.get(row.groupId) ?? 0) + 1);
      const createdItems = await tx.insert(projectBoardItemsTable).values(body.data.items.map((item) => {
        const group = groupByRef.get(item.groupRef)!;
        const position = positions.get(group.id) ?? 0;
        positions.set(group.id, position + 1);
        return {
          id: randomUUID(),
          workspaceId: access.workspaceId,
          projectId: access.project.id,
          groupId: group.id,
          name: item.name.trim(),
          color: item.color ?? null,
          status: item.status ?? "Not started",
          priority: item.priority ?? null,
          assignee: item.assignee?.trim() || null,
          startDate: item.startDate ?? null,
          endDate: item.endDate ?? null,
          costCents: item.costCents ?? null,
          position,
          createdBy: access.userId,
        };
      })).returning();
      return { groups: createdGroups, items: createdItems };
    });
    res.status(201).json(ImportBoardItemsResponse.parse({
      groups: result.groups.map(serializeGroup),
      items: result.items.map(serializeItem),
    }));
  } catch (error) {
    req.log.error({ err: error, projectId: access.project.id }, "Failed to append imported board items");
    res.status(500).json({ error: "The board import could not be saved. No rows were added." });
  }
});

router.post("/projects/:projectId/board/groups", async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = CreateBoardGroupParams.safeParse(req.params);
  const body = CreateBoardGroupBody.safeParse(req.body);
  if (!params.success || !body.success) return invalid(res, "Give the group a name of up to 80 characters.");
  const access = await authorizeBoard(req, res, params.data.projectId);
  if (!access) return;
  const name = body.data.name.trim();
  if (!name) return invalid(res, "Give the group a name of up to 80 characters.");
  const groups = await db.select({ id: projectBoardGroupsTable.id }).from(projectBoardGroupsTable)
    .where(boardScope(projectBoardGroupsTable, access.workspaceId, access.project.id));
  const [created] = await db.insert(projectBoardGroupsTable).values({
    id: randomUUID(),
    workspaceId: access.workspaceId,
    projectId: access.project.id,
    name,
    color: body.data.color ?? "gold",
    position: groups.length,
  }).returning();
  res.status(201).json(CreateBoardGroupResponse.parse(serializeGroup(created)));
});

router.patch("/projects/:projectId/board/groups/:groupId", async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = UpdateBoardGroupParams.safeParse(req.params);
  const body = UpdateBoardGroupBody.safeParse(req.body);
  if (!params.success || !body.success) return invalid(res, "Check the group name, colour, and position.");
  const access = await authorizeBoard(req, res, params.data.projectId);
  if (!access) return;
  const scope = boardScope(projectBoardGroupsTable, access.workspaceId, access.project.id);
  const [group] = await db.select().from(projectBoardGroupsTable)
    .where(and(scope, eq(projectBoardGroupsTable.id, params.data.groupId))).limit(1);
  if (!group) {
    res.status(404).json({ error: "Group not found" });
    return;
  }
  const name = body.data.name?.trim();
  if (body.data.name !== undefined && !name) return invalid(res, "Give the group a name of up to 80 characters.");
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx.update(projectBoardGroupsTable).set({
      ...(name ? { name } : {}),
      ...(body.data.color ? { color: body.data.color } : {}),
    }).where(eq(projectBoardGroupsTable.id, group.id)).returning();
    if (body.data.position === undefined) return row;
    const siblings = await tx.select({ id: projectBoardGroupsTable.id }).from(projectBoardGroupsTable)
      .where(and(scope, ne(projectBoardGroupsTable.id, group.id)))
      .orderBy(asc(projectBoardGroupsTable.position), asc(projectBoardGroupsTable.createdAt));
    const order = insertAt(siblings.map((sibling) => sibling.id), group.id, body.data.position);
    await renumber(tx, projectBoardGroupsTable, order);
    return { ...row, position: order.indexOf(group.id) };
  });
  res.json(UpdateBoardGroupResponse.parse(serializeGroup(updated)));
});

router.delete("/projects/:projectId/board/groups/:groupId", async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = DeleteBoardGroupParams.safeParse(req.params);
  if (!params.success) return invalid(res, "Choose a valid group.");
  const access = await authorizeBoard(req, res, params.data.projectId);
  if (!access) return;
  const scope = boardScope(projectBoardGroupsTable, access.workspaceId, access.project.id);
  const groups = await db.select({ id: projectBoardGroupsTable.id }).from(projectBoardGroupsTable)
    .where(scope).orderBy(asc(projectBoardGroupsTable.position));
  if (!groups.some((group) => group.id === params.data.groupId)) {
    res.status(404).json({ error: "Group not found" });
    return;
  }
  if (groups.length === 1) return invalid(res, "A board needs at least one group. Add another group before deleting this one.");
  await db.transaction(async (tx) => {
    const removedItems = await tx.select({ id: projectBoardItemsTable.id }).from(projectBoardItemsTable)
      .where(eq(projectBoardItemsTable.groupId, params.data.groupId));
    if (removedItems.length) {
      // Items elsewhere that depended on deleted tasks lose that link rather than pointing at nothing.
      await tx.update(projectBoardItemsTable).set({ dependsOnId: null })
        .where(and(
          boardScope(projectBoardItemsTable, access.workspaceId, access.project.id),
          inArray(projectBoardItemsTable.dependsOnId, removedItems.map((item) => item.id)),
        ));
    }
    await tx.delete(projectBoardGroupsTable).where(eq(projectBoardGroupsTable.id, params.data.groupId));
    await renumber(tx, projectBoardGroupsTable, groups.map((group) => group.id).filter((id) => id !== params.data.groupId));
  });
  res.status(204).end();
});

router.post("/projects/:projectId/board/items", async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = CreateBoardItemParams.safeParse(req.params);
  const body = CreateBoardItemBody.safeParse(req.body);
  if (!params.success || !body.success) return invalid(res, "Give the item a name and check its dates and cost.");
  const access = await authorizeBoard(req, res, params.data.projectId);
  if (!access) return;
  const name = body.data.name.trim();
  if (!name) return invalid(res, "Give the item a name of up to 200 characters.");
  const { startDate = null, endDate = null } = body.data;
  if (startDate && endDate && endDate < startDate) return invalid(res, "The end date can't be before the start date.");
  const [group] = await db.select().from(projectBoardGroupsTable).where(and(
    boardScope(projectBoardGroupsTable, access.workspaceId, access.project.id),
    eq(projectBoardGroupsTable.id, body.data.groupId),
  )).limit(1);
  if (!group) {
    res.status(404).json({ error: "Group not found" });
    return;
  }
  const siblings = await db.select({ id: projectBoardItemsTable.id }).from(projectBoardItemsTable)
    .where(eq(projectBoardItemsTable.groupId, group.id));
  const [created] = await db.insert(projectBoardItemsTable).values({
    id: randomUUID(),
    workspaceId: access.workspaceId,
    projectId: access.project.id,
    groupId: group.id,
    name,
    status: body.data.status ?? "Not started",
    priority: body.data.priority ?? null,
    assignee: body.data.assignee?.trim() || null,
    startDate,
    endDate,
    costCents: body.data.costCents ?? null,
    position: siblings.length,
    createdBy: access.userId,
  }).returning();
  res.status(201).json(CreateBoardItemResponse.parse(serializeItem(created)));
});

router.patch("/projects/:projectId/board/items/:itemId", async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = UpdateBoardItemParams.safeParse(req.params);
  const body = UpdateBoardItemBody.safeParse(req.body);
  if (!params.success || !body.success) return invalid(res, "Check the item's name, dates, and cost.");
  const access = await authorizeBoard(req, res, params.data.projectId);
  if (!access) return;
  const itemScope = boardScope(projectBoardItemsTable, access.workspaceId, access.project.id);
  const [item] = await db.select().from(projectBoardItemsTable)
    .where(and(itemScope, eq(projectBoardItemsTable.id, params.data.itemId))).limit(1);
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  const patch = body.data;
  const name = patch.name?.trim();
  if (patch.name !== undefined && !name) return invalid(res, "Give the item a name of up to 200 characters.");
  const startDate = patch.startDate === undefined ? item.startDate : patch.startDate;
  const endDate = patch.endDate === undefined ? item.endDate : patch.endDate;
  if (startDate && endDate && endDate < startDate) return invalid(res, "The end date can't be before the start date.");

  const targetGroupId = patch.groupId ?? item.groupId;
  if (targetGroupId !== item.groupId) {
    const [group] = await db.select({ id: projectBoardGroupsTable.id }).from(projectBoardGroupsTable).where(and(
      boardScope(projectBoardGroupsTable, access.workspaceId, access.project.id),
      eq(projectBoardGroupsTable.id, targetGroupId),
    )).limit(1);
    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
  }
  if (patch.dependsOnId) {
    if (patch.dependsOnId === item.id) return invalid(res, "An item can't depend on itself.");
    const projectItems = await db.select({ id: projectBoardItemsTable.id, dependsOnId: projectBoardItemsTable.dependsOnId })
      .from(projectBoardItemsTable).where(itemScope);
    if (!projectItems.some((candidate) => candidate.id === patch.dependsOnId)) {
      return invalid(res, "Choose an item from this project's board.");
    }
    if (createsDependencyCycle(projectItems, item.id, patch.dependsOnId)) {
      return invalid(res, "That dependency would create a loop.");
    }
  }

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx.update(projectBoardItemsTable).set({
      ...(name ? { name } : {}),
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      ...(patch.assignee !== undefined ? { assignee: patch.assignee?.trim() || null } : {}),
      ...(patch.startDate !== undefined ? { startDate: patch.startDate } : {}),
      ...(patch.endDate !== undefined ? { endDate: patch.endDate } : {}),
      ...(patch.costCents !== undefined ? { costCents: patch.costCents } : {}),
      ...(patch.dependsOnId !== undefined ? { dependsOnId: patch.dependsOnId } : {}),
      groupId: targetGroupId,
    }).where(eq(projectBoardItemsTable.id, item.id)).returning();
    if (patch.position === undefined && targetGroupId === item.groupId) return row;

    const siblings = await tx.select({ id: projectBoardItemsTable.id }).from(projectBoardItemsTable)
      .where(and(eq(projectBoardItemsTable.groupId, targetGroupId), ne(projectBoardItemsTable.id, item.id)))
      .orderBy(asc(projectBoardItemsTable.position), asc(projectBoardItemsTable.createdAt));
    const order = insertAt(siblings.map((sibling) => sibling.id), item.id, patch.position ?? siblings.length);
    await renumber(tx, projectBoardItemsTable, order);
    if (targetGroupId !== item.groupId) {
      const previous = await tx.select({ id: projectBoardItemsTable.id }).from(projectBoardItemsTable)
        .where(eq(projectBoardItemsTable.groupId, item.groupId))
        .orderBy(asc(projectBoardItemsTable.position), asc(projectBoardItemsTable.createdAt));
      await renumber(tx, projectBoardItemsTable, previous.map((entry) => entry.id));
    }
    return { ...row, position: order.indexOf(item.id) };
  });
  res.json(UpdateBoardItemResponse.parse(serializeItem(updated)));
});

router.delete("/projects/:projectId/board/items/:itemId", async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = DeleteBoardItemParams.safeParse(req.params);
  if (!params.success) return invalid(res, "Choose a valid item.");
  const access = await authorizeBoard(req, res, params.data.projectId);
  if (!access) return;
  const itemScope = boardScope(projectBoardItemsTable, access.workspaceId, access.project.id);
  const [item] = await db.select().from(projectBoardItemsTable)
    .where(and(itemScope, eq(projectBoardItemsTable.id, params.data.itemId))).limit(1);
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  await db.transaction(async (tx) => {
    await tx.update(projectBoardItemsTable).set({ dependsOnId: null })
      .where(and(itemScope, eq(projectBoardItemsTable.dependsOnId, item.id)));
    await tx.delete(projectBoardItemsTable).where(eq(projectBoardItemsTable.id, item.id));
    const remaining = await tx.select({ id: projectBoardItemsTable.id }).from(projectBoardItemsTable)
      .where(eq(projectBoardItemsTable.groupId, item.groupId))
      .orderBy(asc(projectBoardItemsTable.position), asc(projectBoardItemsTable.createdAt));
    await renumber(tx, projectBoardItemsTable, remaining.map((entry) => entry.id));
  });
  res.status(204).end();
});

router.get("/board-items", async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!await requireWorkspaceRole(req, res, BOARD_ROLES, BOARD_ACCESS_ERROR)) return;
  const workspaceId = requestWorkspaceId(req);
  try {
    const projects = await projectsForOwner(req.userId, workspaceId);
    const projectNames = new Map(projects.map((project) => [project.id, project.name]));
    if (!projectNames.size) {
      res.json([]);
      return;
    }
    const projectIds = [...projectNames.keys()];
    const [groups, items] = await Promise.all([
      db.select().from(projectBoardGroupsTable).where(and(
        eq(projectBoardGroupsTable.workspaceId, workspaceId),
        inArray(projectBoardGroupsTable.projectId, projectIds),
      )),
      db.select().from(projectBoardItemsTable).where(and(
        eq(projectBoardItemsTable.workspaceId, workspaceId),
        inArray(projectBoardItemsTable.projectId, projectIds),
      )).orderBy(asc(projectBoardItemsTable.startDate), asc(projectBoardItemsTable.endDate)),
    ]);
    const groupsById = new Map(groups.map((group) => [group.id, group]));
    res.json(GetBoardScheduleResponse.parse(items
      .filter((item) => item.startDate || item.endDate)
      .map((item) => {
        const group = groupsById.get(item.groupId);
        return {
          ...serializeItem(item),
          projectName: projectNames.get(item.projectId) ?? "Project",
          groupName: group?.name ?? "",
          groupColor: group?.color ?? "gold",
        };
      })));
  } catch (error) {
    req.log.error({ err: error }, "Failed to load board schedule");
    res.status(500).json({ error: "The schedule could not be loaded." });
  }
});

export default router;
