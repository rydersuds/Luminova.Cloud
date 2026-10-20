import { and, eq, inArray, isNull, isNotNull, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  conversationParticipantsTable,
  db,
  importedInvoicesTable,
  importedProjectsTable,
  importedVendorQuotesTable,
  importedVendorsTable,
  invoiceUploadReservationsTable,
  projectActivitiesTable,
  projectLifecycleEventsTable,
  projectBoardGroupsTable,
  projectBoardItemsTable,
  projectConversationsTable,
  projectDocumentsTable,
  projectExteriorPhotosTable,
  projectImportBatchesTable,
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

export class ProjectLifecycleNotFoundError extends Error {}
export class ProjectLifecycleConflictError extends Error {}
export class ProjectLifecycleStorageError extends Error {}

const objectStorage = new ObjectStorageService();

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

export async function permanentlyDeleteProject(projectId: string, workspaceId: string, actorId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [project] = await tx.select({
      importBatchId: importedProjectsTable.importBatchId,
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

    const importBatchIds = [...new Set([
      project.importBatchId,
      ...batches.map((batch) => batch.id),
    ])];

    const documents = await tx.select({ objectPath: projectDocumentsTable.objectPath })
      .from(projectDocumentsTable)
      .where(or(
        eq(projectDocumentsTable.projectId, projectId),
        inArray(projectDocumentsTable.importBatchId, importBatchIds),
      ));
    const scheduleImages = await tx.select({ objectPath: projectScheduleImagesTable.objectPath })
      .from(projectScheduleImagesTable)
      .where(and(
        eq(projectScheduleImagesTable.projectId, projectId),
        eq(projectScheduleImagesTable.workspaceId, workspaceId),
      ));
    const panoramas = await tx.select({ objectPath: projectPanoramasTable.objectPath })
      .from(projectPanoramasTable)
      .where(eq(projectPanoramasTable.projectId, projectId));
    const scheduleReservations = await tx.select({ objectPath: scheduleUploadReservationsTable.objectPath })
      .from(scheduleUploadReservationsTable)
      .where(eq(scheduleUploadReservationsTable.projectId, projectId));
    const invoiceReservations = await tx.select({ objectPath: invoiceUploadReservationsTable.objectPath })
      .from(invoiceUploadReservationsTable)
      .where(eq(invoiceUploadReservationsTable.projectId, projectId));
    const objectPaths = [...new Set([
      ...documents,
      ...scheduleImages,
      ...panoramas,
      ...scheduleReservations,
      ...invoiceReservations,
    ].map((item) => item.objectPath).filter((path) => path.startsWith("/objects/")))];

    const cleanupResults = await Promise.allSettled(objectPaths.map((path) => objectStorage.deleteObject(path)));
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
      inArray(projectDocumentsTable.importBatchId, importBatchIds),
    ));
    await tx.delete(importedInvoicesTable).where(inArray(importedInvoicesTable.importBatchId, importBatchIds));
    await tx.delete(importedVendorQuotesTable).where(inArray(importedVendorQuotesTable.importBatchId, importBatchIds));
    await tx.delete(importedVendorsTable).where(inArray(importedVendorsTable.importBatchId, importBatchIds));
    await tx.delete(projectImportBatchesTable).where(or(
      and(
        eq(projectImportBatchesTable.projectId, projectId),
        eq(projectImportBatchesTable.workspaceId, workspaceId),
      ),
      inArray(projectImportBatchesTable.id, importBatchIds),
    ));
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
