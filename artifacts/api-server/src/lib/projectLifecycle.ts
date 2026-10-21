import { and, eq, inArray, isNull, isNotNull, or } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import {
  conversationParticipantsTable,
  db,
  importedInvoicesTable,
  importedProjectsTable,
  importedVendorQuotesTable,
  importedVendorsTable,
  invoiceUploadReservationsTable,
  projectActivitiesTable,
  projectBoardGroupsTable,
  projectBoardItemsTable,
  projectConversationsTable,
  projectDocumentsTable,
  projectExteriorPhotosTable,
  projectImportBatchesTable,
  projectLifecycleEventsTable,
  projectMessagesTable,
  projectPanoramasTable,
  projectScheduleImagesTable,
  projectScheduleMetadataTable,
  purchaseApprovalsTable,
  scheduleUploadReservationsTable,
  vendorJobHistoryTable,
  vendorReviewTable,
} from "@workspace/db";
import { ObjectStorageService } from "./objectStorage";
import { getObjectPathReferences } from "./scheduleImageStore";

export class ProjectLifecycleNotFoundError extends Error {}
export class ProjectLifecycleConflictError extends Error {}
export class ProjectLifecyclePreviewStaleError extends Error {}
export class ProjectLifecycleStorageError extends Error {}

const objectStorage = new ObjectStorageService();

type LifecycleExecutor = Pick<typeof db, "select">;

function projectName(data: unknown, projectId: string): string {
  if (data && typeof data === "object" && "name" in data && typeof data.name === "string") {
    return data.name;
  }
  return projectId;
}

async function recordProjectLifecycleEvent(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  details: {
    workspaceId: string;
    projectId: string;
    projectName: string;
    actorId: string;
    action: "archived" | "restored" | "permanently_deleted";
  },
) {
  await tx.insert(projectLifecycleEventsTable).values({
    id: randomUUID(),
    ...details,
  });
}

type ProjectDeletionSnapshot = {
  recordCount: number;
  recordBreakdown: Array<{
    category:
      | "project"
      | "importData"
      | "documents"
      | "invoices"
      | "vendorQuotes"
      | "conversations"
      | "schedule"
      | "panoramas"
      | "exteriorPhotos"
      | "projectHistory"
      | "purchaseApprovals";
    count: number;
  }>;
  storedFileCount: number;
  previewToken: string;
  importBatchIds: string[];
  objectPaths: string[];
};

async function getProjectDeletionSnapshot(
  executor: LifecycleExecutor,
  projectId: string,
  workspaceId: string,
): Promise<ProjectDeletionSnapshot> {
  const [project] = await executor.select({
    id: importedProjectsTable.id,
    importBatchId: importedProjectsTable.importBatchId,
  })
    .from(importedProjectsTable)
    .where(and(
      eq(importedProjectsTable.id, projectId),
      eq(importedProjectsTable.workspaceId, workspaceId),
    ))
    .limit(1);
  if (!project) throw new ProjectLifecycleNotFoundError("Project not found");

  const projectBatches = await executor.select({
    id: projectImportBatchesTable.id,
    status: projectImportBatchesTable.status,
  })
    .from(projectImportBatchesTable)
    .where(and(
      eq(projectImportBatchesTable.projectId, projectId),
      eq(projectImportBatchesTable.workspaceId, workspaceId),
    ));
  if (projectBatches.some((batch) => batch.status === "building")) {
    throw new ProjectLifecycleConflictError("The project is still being built");
  }

  const candidateBatchIds = [...new Set([
    project.importBatchId,
    ...projectBatches.map((batch) => batch.id),
  ])];
  const candidateBatchRows = await executor.select({
    id: projectImportBatchesTable.id,
    projectId: projectImportBatchesTable.projectId,
    workspaceId: projectImportBatchesTable.workspaceId,
  })
    .from(projectImportBatchesTable)
    .where(inArray(projectImportBatchesTable.id, candidateBatchIds));
  const batchesOwnedElsewhere = new Set(candidateBatchRows
    .filter((batch) => batch.workspaceId !== workspaceId || (batch.projectId && batch.projectId !== projectId))
    .map((batch) => batch.id));
  const projectBatchIds = candidateBatchIds.filter((id) => !batchesOwnedElsewhere.has(id));
  const batchReferences = await executor.select({
    id: importedProjectsTable.id,
    importBatchId: importedProjectsTable.importBatchId,
  })
    .from(importedProjectsTable)
    .where(inArray(importedProjectsTable.importBatchId, projectBatchIds));
  const batchesUsedByAnotherProject = new Set(
    batchReferences
      .filter((reference) => reference.id !== projectId)
      .map((reference) => reference.importBatchId),
  );
  const importBatchIds = projectBatchIds.filter((id) => !batchesUsedByAnotherProject.has(id));

  const recordIds: Record<string, string[]> = {};
  const objectPaths: string[] = [];
  const addRecords = (kind: string, rows: Array<{ id: string }>) => {
    recordIds[kind] = [...new Set(rows.map((row) => row.id))].sort();
  };

  addRecords("project", [{ id: project.id }]);
  addRecords("importBatches", await executor.select({ id: projectImportBatchesTable.id })
    .from(projectImportBatchesTable)
    .where(inArray(projectImportBatchesTable.id, importBatchIds)));

  const documents = await executor.select({
    id: projectDocumentsTable.id,
    objectPath: projectDocumentsTable.objectPath,
  })
    .from(projectDocumentsTable)
    .where(or(
      eq(projectDocumentsTable.projectId, projectId),
      inArray(projectDocumentsTable.importBatchId, importBatchIds),
    ));
  addRecords("documents", documents);
  objectPaths.push(...documents.map((document) => document.objectPath));

  addRecords("invoices", await executor.select({ id: importedInvoicesTable.id })
    .from(importedInvoicesTable)
    .where(inArray(importedInvoicesTable.importBatchId, importBatchIds)));
  addRecords("vendorQuotes", await executor.select({ id: importedVendorQuotesTable.id })
    .from(importedVendorQuotesTable)
    .where(inArray(importedVendorQuotesTable.importBatchId, importBatchIds)));
  addRecords("importedVendors", await executor.select({ id: importedVendorsTable.id })
    .from(importedVendorsTable)
    .where(inArray(importedVendorsTable.importBatchId, importBatchIds)));

  const conversations = await executor.select({ id: projectConversationsTable.id })
    .from(projectConversationsTable)
    .where(and(
      eq(projectConversationsTable.workspaceId, workspaceId),
      eq(projectConversationsTable.projectId, projectId),
    ));
  const conversationIds = conversations.map((conversation) => conversation.id);
  addRecords("conversations", conversations);

  const conversationMessages = conversationIds.length
    ? await executor.select({ id: projectMessagesTable.id })
      .from(projectMessagesTable)
      .where(inArray(projectMessagesTable.conversationId, conversationIds))
    : [];
  const projectMessages = await executor.select({ id: projectMessagesTable.id })
    .from(projectMessagesTable)
    .where(and(
      eq(projectMessagesTable.workspaceId, workspaceId),
      eq(projectMessagesTable.projectId, projectId),
    ));
  addRecords("messages", [...conversationMessages, ...projectMessages]);
  addRecords("conversationParticipants", conversationIds.length
    ? (await executor.select({
      conversationId: conversationParticipantsTable.conversationId,
      userId: conversationParticipantsTable.userId,
    })
      .from(conversationParticipantsTable)
      .where(and(
        eq(conversationParticipantsTable.workspaceId, workspaceId),
        inArray(conversationParticipantsTable.conversationId, conversationIds),
      ))).map((participant) => ({
        id: `${participant.conversationId}:${participant.userId}`,
      }))
    : []);

  addRecords("boardItems", await executor.select({ id: projectBoardItemsTable.id })
    .from(projectBoardItemsTable)
    .where(and(
      eq(projectBoardItemsTable.workspaceId, workspaceId),
      eq(projectBoardItemsTable.projectId, projectId),
    )));
  addRecords("boardGroups", await executor.select({ id: projectBoardGroupsTable.id })
    .from(projectBoardGroupsTable)
    .where(and(
      eq(projectBoardGroupsTable.workspaceId, workspaceId),
      eq(projectBoardGroupsTable.projectId, projectId),
    )));
  addRecords("scheduleMetadata", await executor.select({ id: projectScheduleMetadataTable.id })
    .from(projectScheduleMetadataTable)
    .where(and(
      eq(projectScheduleMetadataTable.workspaceId, workspaceId),
      eq(projectScheduleMetadataTable.projectId, projectId),
    )));

  const scheduleImages = await executor.select({
    id: projectScheduleImagesTable.id,
    objectPath: projectScheduleImagesTable.objectPath,
  })
    .from(projectScheduleImagesTable)
    .where(and(
      eq(projectScheduleImagesTable.workspaceId, workspaceId),
      eq(projectScheduleImagesTable.projectId, projectId),
    ));
  addRecords("scheduleImages", scheduleImages);
  objectPaths.push(...scheduleImages.map((image) => image.objectPath));

  const panoramas = await executor.select({
    id: projectPanoramasTable.id,
    objectPath: projectPanoramasTable.objectPath,
  })
    .from(projectPanoramasTable)
    .where(eq(projectPanoramasTable.projectId, projectId));
  addRecords("panoramas", panoramas);
  objectPaths.push(...panoramas.map((panorama) => panorama.objectPath));

  addRecords("exteriorPhotos", (await executor.select({ projectId: projectExteriorPhotosTable.projectId })
    .from(projectExteriorPhotosTable)
    .where(eq(projectExteriorPhotosTable.projectId, projectId)))
    .map((photo) => ({ id: photo.projectId })));
  addRecords("activities", await executor.select({ id: projectActivitiesTable.id })
    .from(projectActivitiesTable)
    .where(eq(projectActivitiesTable.projectId, projectId)));
  addRecords("vendorJobHistory", await executor.select({ id: vendorJobHistoryTable.id })
    .from(vendorJobHistoryTable)
    .where(eq(vendorJobHistoryTable.projectId, projectId)));
  addRecords("vendorReviews", await executor.select({ id: vendorReviewTable.id })
    .from(vendorReviewTable)
    .where(eq(vendorReviewTable.projectId, projectId)));
  addRecords("purchaseApprovals", await executor.select({ id: purchaseApprovalsTable.id })
    .from(purchaseApprovalsTable)
    .where(and(
      eq(purchaseApprovalsTable.workspaceId, workspaceId),
      eq(purchaseApprovalsTable.projectId, projectId),
    )));

  const scheduleReservations = await executor.select({
    objectPath: scheduleUploadReservationsTable.objectPath,
  })
    .from(scheduleUploadReservationsTable)
    .where(eq(scheduleUploadReservationsTable.projectId, projectId));
  const invoiceReservations = await executor.select({
    objectPath: invoiceUploadReservationsTable.objectPath,
  })
    .from(invoiceUploadReservationsTable)
    .where(eq(invoiceUploadReservationsTable.projectId, projectId));
  addRecords("scheduleUploadReservations", scheduleReservations.map(({ objectPath }) => ({ id: objectPath })));
  addRecords("invoiceUploadReservations", invoiceReservations.map(({ objectPath }) => ({ id: objectPath })));
  objectPaths.push(
    ...scheduleReservations.map((reservation) => reservation.objectPath),
    ...invoiceReservations.map((reservation) => reservation.objectPath),
  );

  const candidateObjectPaths = [...new Set(objectPaths.filter((path) => path.startsWith("/objects/")))].sort();
  const objectPathReferences = await getObjectPathReferences(executor, candidateObjectPaths);
  const referencedOutsideDeletion = new Set<string>();
  for (const reference of objectPathReferences) {
    const referenceIsDeleted = (() => {
      switch (reference.source) {
        case "document":
          return reference.projectId === projectId || importBatchIds.includes(reference.importBatchId);
        case "scheduleImage":
          return reference.projectId === projectId && reference.workspaceId === workspaceId;
        case "panorama":
        case "exteriorPhoto":
        case "scheduleReservation":
        case "invoiceReservation":
          return reference.projectId === projectId;
        case "clientLogo":
          return false;
      }
    })();
    if (!referenceIsDeleted) referencedOutsideDeletion.add(reference.objectPath);
  }
  const uniqueObjectPaths = candidateObjectPaths
    .filter((path) => !referencedOutsideDeletion.has(path));
  const countRecords = (...kinds: string[]) =>
    kinds.reduce((total, kind) => total + (recordIds[kind]?.length ?? 0), 0);
  const recordBreakdown: ProjectDeletionSnapshot["recordBreakdown"] = [
    { category: "project", count: countRecords("project") },
    { category: "importData", count: countRecords("importBatches", "importedVendors") },
    { category: "documents", count: countRecords("documents") },
    { category: "invoices", count: countRecords("invoices", "invoiceUploadReservations") },
    { category: "vendorQuotes", count: countRecords("vendorQuotes") },
    {
      category: "conversations",
      count: countRecords("conversations", "messages", "conversationParticipants"),
    },
    {
      category: "schedule",
      count: countRecords(
        "boardItems",
        "boardGroups",
        "scheduleMetadata",
        "scheduleImages",
        "scheduleUploadReservations",
      ),
    },
    { category: "panoramas", count: countRecords("panoramas") },
    { category: "exteriorPhotos", count: countRecords("exteriorPhotos") },
    { category: "projectHistory", count: countRecords("activities", "vendorJobHistory", "vendorReviews") },
    { category: "purchaseApprovals", count: countRecords("purchaseApprovals") },
  ];
  const recordCount = recordBreakdown.reduce((total, item) => total + item.count, 0);
  const previewToken = createHash("sha256")
    .update(JSON.stringify({
      projectId,
      workspaceId,
      recordIds,
      objectPaths: uniqueObjectPaths,
    }))
    .digest("hex");

  return {
    recordCount,
    recordBreakdown,
    storedFileCount: uniqueObjectPaths.length,
    previewToken,
    importBatchIds,
    objectPaths: uniqueObjectPaths,
  };
}

export async function previewProjectDeletion(
  projectId: string,
  workspaceId: string,
): Promise<Pick<ProjectDeletionSnapshot, "recordCount" | "recordBreakdown" | "storedFileCount" | "previewToken">> {
  const { recordCount, recordBreakdown, storedFileCount, previewToken } =
    await getProjectDeletionSnapshot(db, projectId, workspaceId);
  return { recordCount, recordBreakdown, storedFileCount, previewToken };
}

export async function archiveProject(projectId: string, workspaceId: string, actorId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({
      archivedAt: importedProjectsTable.archivedAt,
      data: importedProjectsTable.data,
    })
      .from(importedProjectsTable)
      .where(and(
        eq(importedProjectsTable.id, projectId),
        eq(importedProjectsTable.workspaceId, workspaceId),
      ))
      .for("update")
      .limit(1);
    if (!existing) return false;
    if (existing.archivedAt) return true;

    await tx.update(importedProjectsTable)
      .set({ archivedAt: new Date() })
      .where(and(
        eq(importedProjectsTable.id, projectId),
        eq(importedProjectsTable.workspaceId, workspaceId),
        isNull(importedProjectsTable.archivedAt),
      ));
    await recordProjectLifecycleEvent(tx, {
      workspaceId,
      projectId,
      projectName: projectName(existing.data, projectId),
      actorId,
      action: "archived",
    });
    return true;
  });
}

export async function restoreProject(projectId: string, workspaceId: string, actorId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({
      archivedAt: importedProjectsTable.archivedAt,
      data: importedProjectsTable.data,
    })
      .from(importedProjectsTable)
      .where(and(
        eq(importedProjectsTable.id, projectId),
        eq(importedProjectsTable.workspaceId, workspaceId),
      ))
      .for("update")
      .limit(1);
    if (!existing) return false;
    if (!existing.archivedAt) return true;

    await tx.update(importedProjectsTable)
      .set({ archivedAt: null })
      .where(and(
        eq(importedProjectsTable.id, projectId),
        eq(importedProjectsTable.workspaceId, workspaceId),
        isNotNull(importedProjectsTable.archivedAt),
      ));
    await recordProjectLifecycleEvent(tx, {
      workspaceId,
      projectId,
      projectName: projectName(existing.data, projectId),
      actorId,
      action: "restored",
    });
    return true;
  });
}

export async function permanentlyDeleteProject(
  projectId: string,
  workspaceId: string,
  actorId: string,
  expectedPreviewToken: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [project] = await tx.select({
      id: importedProjectsTable.id,
      data: importedProjectsTable.data,
    })
      .from(importedProjectsTable)
      .where(and(
        eq(importedProjectsTable.id, projectId),
        eq(importedProjectsTable.workspaceId, workspaceId),
      ))
      .for("update")
      .limit(1);
    if (!project) throw new ProjectLifecycleNotFoundError("Project not found");

    const batches = await tx.select({
      id: projectImportBatchesTable.id,
      status: projectImportBatchesTable.status,
    })
      .from(projectImportBatchesTable)
      .where(and(
        eq(projectImportBatchesTable.projectId, projectId),
        eq(projectImportBatchesTable.workspaceId, workspaceId),
      ))
      .for("update");
    if (batches.some((batch) => batch.status === "building")) {
      throw new ProjectLifecycleConflictError("The project is still being built");
    }

    const snapshot = await getProjectDeletionSnapshot(tx, projectId, workspaceId);
    if (snapshot.previewToken !== expectedPreviewToken) {
      throw new ProjectLifecyclePreviewStaleError("The project changed after the deletion preview was loaded");
    }

    const cleanupResults = await Promise.allSettled(snapshot.objectPaths.map((path) => objectStorage.deleteObject(path)));
    if (cleanupResults.some((result) => result.status === "rejected")) {
      throw new ProjectLifecycleStorageError("One or more project files could not be removed");
    }

    const conversations = await tx.select({ id: projectConversationsTable.id })
      .from(projectConversationsTable)
      .where(and(
        eq(projectConversationsTable.workspaceId, workspaceId),
        eq(projectConversationsTable.projectId, projectId),
      ));
    const conversationIds = conversations.map((conversation) => conversation.id);
    if (conversationIds.length) {
      await tx.delete(projectMessagesTable)
        .where(inArray(projectMessagesTable.conversationId, conversationIds));
      await tx.delete(conversationParticipantsTable)
        .where(and(
          eq(conversationParticipantsTable.workspaceId, workspaceId),
          inArray(conversationParticipantsTable.conversationId, conversationIds),
        ));
    }
    await tx.delete(projectMessagesTable).where(and(
      eq(projectMessagesTable.workspaceId, workspaceId),
      eq(projectMessagesTable.projectId, projectId),
    ));
    await tx.delete(projectConversationsTable).where(and(
      eq(projectConversationsTable.workspaceId, workspaceId),
      eq(projectConversationsTable.projectId, projectId),
    ));

    await tx.delete(projectBoardItemsTable).where(and(
      eq(projectBoardItemsTable.workspaceId, workspaceId),
      eq(projectBoardItemsTable.projectId, projectId),
    ));
    await tx.delete(projectBoardGroupsTable).where(and(
      eq(projectBoardGroupsTable.workspaceId, workspaceId),
      eq(projectBoardGroupsTable.projectId, projectId),
    ));
    await tx.delete(projectScheduleMetadataTable).where(and(
      eq(projectScheduleMetadataTable.workspaceId, workspaceId),
      eq(projectScheduleMetadataTable.projectId, projectId),
    ));
    await tx.delete(projectScheduleImagesTable).where(and(
      eq(projectScheduleImagesTable.workspaceId, workspaceId),
      eq(projectScheduleImagesTable.projectId, projectId),
    ));
    await tx.delete(projectPanoramasTable).where(eq(projectPanoramasTable.projectId, projectId));
    await tx.delete(projectExteriorPhotosTable).where(eq(projectExteriorPhotosTable.projectId, projectId));
    await tx.delete(projectActivitiesTable).where(eq(projectActivitiesTable.projectId, projectId));
    await tx.delete(vendorJobHistoryTable).where(eq(vendorJobHistoryTable.projectId, projectId));
    await tx.delete(vendorReviewTable).where(eq(vendorReviewTable.projectId, projectId));
    await tx.delete(purchaseApprovalsTable).where(and(
      eq(purchaseApprovalsTable.workspaceId, workspaceId),
      eq(purchaseApprovalsTable.projectId, projectId),
    ));
    await tx.delete(scheduleUploadReservationsTable).where(eq(scheduleUploadReservationsTable.projectId, projectId));
    await tx.delete(invoiceUploadReservationsTable).where(eq(invoiceUploadReservationsTable.projectId, projectId));
    await tx.delete(projectDocumentsTable).where(or(
      eq(projectDocumentsTable.projectId, projectId),
      inArray(projectDocumentsTable.importBatchId, snapshot.importBatchIds),
    ));
    await tx.delete(importedInvoicesTable).where(inArray(importedInvoicesTable.importBatchId, snapshot.importBatchIds));
    await tx.delete(importedVendorQuotesTable).where(inArray(importedVendorQuotesTable.importBatchId, snapshot.importBatchIds));
    await tx.delete(importedVendorsTable).where(inArray(importedVendorsTable.importBatchId, snapshot.importBatchIds));
    await tx.delete(projectImportBatchesTable).where(inArray(projectImportBatchesTable.id, snapshot.importBatchIds));
    await tx.delete(importedProjectsTable).where(and(
      eq(importedProjectsTable.id, projectId),
      eq(importedProjectsTable.workspaceId, workspaceId),
    ));
    await recordProjectLifecycleEvent(tx, {
      workspaceId,
      projectId,
      projectName: projectName(project.data, projectId),
      actorId,
      action: "permanently_deleted",
    });
  });
}
