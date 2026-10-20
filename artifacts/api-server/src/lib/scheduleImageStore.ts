import { and, asc, eq, gt, inArray, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  db,
  clientsTable,
  invoiceUploadReservationsTable,
  projectDocumentsTable,
  projectExteriorPhotosTable,
  projectPanoramasTable,
  projectScheduleImagesTable,
  scheduleUploadReservationsTable,
  type ProjectScheduleImage,
} from "@workspace/db";
import { ObjectStorageService } from "./objectStorage";

export type ScheduleImageRecord = {
  id: string;
  url: string;
  name: string;
  relativePath: string;
  contentType: string;
  size: number;
  revision: string | null;
  effectiveDate: string | null;
  isCurrent: boolean;
};

export type ScheduleImageInput = {
  projectId: string;
  objectPath: string;
  name: string;
  size: number;
  contentType: string;
  ownerId: string;
  workspaceId: string;
};

export interface ScheduleImageRepository {
  list(projectId: string, workspaceId?: string): Promise<ProjectScheduleImage[]>;
  insert(image: Omit<ProjectScheduleImage, "createdAt">): Promise<ProjectScheduleImage>;
  claimReservation(input: ScheduleImageInput): Promise<boolean>;
  canCleanReservation(objectPath: string, ownerId: string, projectId: string): Promise<boolean>;
  releaseReservation(objectPath: string): Promise<void>;
  hasObjectPath(objectPath: string): Promise<boolean>;
  find(projectId: string, imageId: string, workspaceId: string): Promise<ProjectScheduleImage | undefined>;
  delete(projectId: string, imageId: string, workspaceId: string): Promise<void>;
}

export interface ScheduleImageObjectStorage {
  verifyScheduleImage(input: {
    objectPath: string;
    size: number;
    contentType: string;
  }): Promise<void>;
  setAcl(objectPath: string, policy: {
    owner: string;
    visibility: "public" | "private";
    workspaceId?: string;
  }): Promise<void>;
  deleteObject(objectPath: string): Promise<void>;
}

const servingUrl = (objectPath: string) => `/api/storage${objectPath}`;

export type ObjectPathReference =
  | { source: "document"; objectPath: string; projectId: string | null; importBatchId: string }
  | { source: "scheduleImage"; objectPath: string; projectId: string; workspaceId: string }
  | { source: "panorama" | "exteriorPhoto"; objectPath: string; projectId: string }
  | { source: "clientLogo"; objectPath: string }
  | { source: "scheduleReservation" | "invoiceReservation"; objectPath: string; projectId: string };

export async function getObjectPathReferences(
  executor: Pick<typeof db, "select">,
  objectPaths: string[],
): Promise<ObjectPathReference[]> {
  if (!objectPaths.length) return [];

  const references: ObjectPathReference[] = [];
  const documents = await executor.select({
    objectPath: projectDocumentsTable.objectPath,
    projectId: projectDocumentsTable.projectId,
    importBatchId: projectDocumentsTable.importBatchId,
  }).from(projectDocumentsTable).where(inArray(projectDocumentsTable.objectPath, objectPaths));
  references.push(...documents.map((row) => ({ source: "document" as const, ...row })));

  const scheduleImages = await executor.select({
    objectPath: projectScheduleImagesTable.objectPath,
    projectId: projectScheduleImagesTable.projectId,
    workspaceId: projectScheduleImagesTable.workspaceId,
  }).from(projectScheduleImagesTable).where(inArray(projectScheduleImagesTable.objectPath, objectPaths));
  references.push(...scheduleImages.map((row) => ({ source: "scheduleImage" as const, ...row })));

  const panoramas = await executor.select({
    objectPath: projectPanoramasTable.objectPath,
    projectId: projectPanoramasTable.projectId,
  }).from(projectPanoramasTable).where(inArray(projectPanoramasTable.objectPath, objectPaths));
  references.push(...panoramas.map((row) => ({ source: "panorama" as const, ...row })));

  const exteriorPhotos = await executor.select({
    objectPath: projectExteriorPhotosTable.exteriorImage,
    projectId: projectExteriorPhotosTable.projectId,
  }).from(projectExteriorPhotosTable)
    .where(inArray(projectExteriorPhotosTable.exteriorImage, objectPaths));
  references.push(...exteriorPhotos.map((row) => ({ source: "exteriorPhoto" as const, ...row })));

  const clients = await executor.select({
    logoObjectPath: clientsTable.logoObjectPath,
    pendingLogoObjectPath: clientsTable.pendingLogoObjectPath,
  }).from(clientsTable).where(or(
    inArray(clientsTable.logoObjectPath, objectPaths),
    inArray(clientsTable.pendingLogoObjectPath, objectPaths),
  ));
  for (const client of clients) {
    if (client.logoObjectPath && objectPaths.includes(client.logoObjectPath)) {
      references.push({ source: "clientLogo", objectPath: client.logoObjectPath });
    }
    if (client.pendingLogoObjectPath && objectPaths.includes(client.pendingLogoObjectPath)) {
      references.push({ source: "clientLogo", objectPath: client.pendingLogoObjectPath });
    }
  }

  const scheduleReservations = await executor.select({
    objectPath: scheduleUploadReservationsTable.objectPath,
    projectId: scheduleUploadReservationsTable.projectId,
  }).from(scheduleUploadReservationsTable)
    .where(inArray(scheduleUploadReservationsTable.objectPath, objectPaths));
  references.push(...scheduleReservations.map((row) => ({ source: "scheduleReservation" as const, ...row })));

  const invoiceReservations = await executor.select({
    objectPath: invoiceUploadReservationsTable.objectPath,
    projectId: invoiceUploadReservationsTable.projectId,
  }).from(invoiceUploadReservationsTable)
    .where(inArray(invoiceUploadReservationsTable.objectPath, objectPaths));
  references.push(...invoiceReservations.map((row) => ({ source: "invoiceReservation" as const, ...row })));

  return references;
}

export class DrizzleScheduleImageRepository implements ScheduleImageRepository {
  async list(projectId: string, workspaceId?: string): Promise<ProjectScheduleImage[]> {
    return db.select().from(projectScheduleImagesTable)
      .where(workspaceId
        ? and(
            eq(projectScheduleImagesTable.projectId, projectId),
            eq(projectScheduleImagesTable.workspaceId, workspaceId),
          )
        : eq(projectScheduleImagesTable.projectId, projectId))
      .orderBy(asc(projectScheduleImagesTable.createdAt));
  }

  async insert(image: Omit<ProjectScheduleImage, "createdAt">): Promise<ProjectScheduleImage> {
    const [row] = await db.insert(projectScheduleImagesTable).values(image).returning();
    return row;
  }

  async claimReservation(input: ScheduleImageInput): Promise<boolean> {
    const [row] = await db.update(scheduleUploadReservationsTable)
      .set({ status: "processing" })
      .where(and(
        eq(scheduleUploadReservationsTable.objectPath, input.objectPath),
        eq(scheduleUploadReservationsTable.ownerId, input.ownerId),
        eq(scheduleUploadReservationsTable.projectId, input.projectId),
        eq(scheduleUploadReservationsTable.size, input.size),
        eq(scheduleUploadReservationsTable.contentType, input.contentType),
        eq(scheduleUploadReservationsTable.status, "reserved"),
        gt(scheduleUploadReservationsTable.expiresAt, new Date()),
      ))
      .returning({ objectPath: scheduleUploadReservationsTable.objectPath });
    return Boolean(row);
  }

  async canCleanReservation(objectPath: string, ownerId: string, projectId: string): Promise<boolean> {
    const [row] = await db.select({ objectPath: scheduleUploadReservationsTable.objectPath })
      .from(scheduleUploadReservationsTable)
      .where(and(
        eq(scheduleUploadReservationsTable.objectPath, objectPath),
        eq(scheduleUploadReservationsTable.ownerId, ownerId),
        eq(scheduleUploadReservationsTable.projectId, projectId),
      ))
      .limit(1);
    return Boolean(row);
  }

  async releaseReservation(objectPath: string): Promise<void> {
    await db.delete(scheduleUploadReservationsTable)
      .where(eq(scheduleUploadReservationsTable.objectPath, objectPath));
  }

  async hasObjectPath(objectPath: string): Promise<boolean> {
    const references = await getObjectPathReferences(db, [objectPath]);
    return references.some((reference) =>
      reference.source !== "scheduleReservation" && reference.source !== "invoiceReservation");
  }

  async find(projectId: string, imageId: string, workspaceId: string): Promise<ProjectScheduleImage | undefined> {
    const [row] = await db.select().from(projectScheduleImagesTable).where(and(
      eq(projectScheduleImagesTable.id, imageId),
      eq(projectScheduleImagesTable.projectId, projectId),
      eq(projectScheduleImagesTable.workspaceId, workspaceId),
    )).limit(1);
    return row;
  }

  async delete(projectId: string, imageId: string, workspaceId: string): Promise<void> {
    await db.delete(projectScheduleImagesTable).where(and(
      eq(projectScheduleImagesTable.id, imageId),
      eq(projectScheduleImagesTable.projectId, projectId),
      eq(projectScheduleImagesTable.workspaceId, workspaceId),
    ));
  }
}

export class DatabaseScheduleImageStore {
  constructor(
    private readonly storage: ScheduleImageObjectStorage = new ObjectStorageService(),
    private readonly repository: ScheduleImageRepository = new DrizzleScheduleImageRepository(),
  ) {}

  async list(projectId: string, workspaceId?: string): Promise<ScheduleImageRecord[]> {
    const rows = await this.repository.list(projectId, workspaceId);
    return rows.map((row) => ({
      id: row.id,
      url: servingUrl(row.objectPath),
      name: row.name,
      relativePath: row.relativePath,
      contentType: row.contentType,
      size: row.size,
      revision: null,
      effectiveDate: null,
      isCurrent: false,
    }));
  }

  async create(input: ScheduleImageInput): Promise<ScheduleImageRecord> {
    if (!await this.repository.claimReservation(input)) {
      throw new Error("Schedule image upload reservation is invalid or expired");
    }
    try {
      await this.storage.verifyScheduleImage({
        objectPath: input.objectPath,
        size: input.size,
        contentType: input.contentType,
      });
      await this.storage.setAcl(input.objectPath, {
        owner: input.ownerId,
        workspaceId: input.workspaceId,
        visibility: "private",
      });
      const row = await this.repository.insert({
        id: `schedule-${randomUUID()}`,
        projectId: input.projectId,
        ownerId: input.ownerId,
        workspaceId: input.workspaceId,
        objectPath: input.objectPath,
        name: input.name,
        relativePath: input.name,
        contentType: input.contentType,
        size: input.size,
      });
      await this.repository.releaseReservation(input.objectPath);
      return {
        id: row.id,
        url: servingUrl(row.objectPath),
        name: row.name,
        relativePath: row.relativePath,
        contentType: row.contentType,
        size: row.size,
        revision: null,
        effectiveDate: null,
        isCurrent: false,
      };
    } catch (error) {
      try {
        await this.cleanupUnattached(input.objectPath, input.ownerId, input.projectId);
      } catch (cleanupError) {
        throw new ScheduleImageCreationError(error, cleanupError);
      }
      throw error;
    }
  }

  async cleanupUnattached(objectPath: string, ownerId: string, projectId: string): Promise<boolean> {
    if (!await this.repository.canCleanReservation(objectPath, ownerId, projectId)) return false;
    if (await this.repository.hasObjectPath(objectPath)) {
      await this.repository.releaseReservation(objectPath);
      return false;
    }
    await this.storage.deleteObject(objectPath);
    await this.repository.releaseReservation(objectPath);
    return true;
  }

  async remove(projectId: string, imageId: string, workspaceId: string): Promise<boolean> {
    const row = await this.repository.find(projectId, imageId, workspaceId);
    if (!row) return false;
    await this.storage.deleteObject(row.objectPath);
    await this.repository.delete(projectId, imageId, workspaceId);
    return true;
  }
}

export class ScheduleImageCreationError extends Error {
  constructor(
    readonly originalError: unknown,
    readonly cleanupError: unknown,
  ) {
    super(originalError instanceof Error ? originalError.message : "Schedule image creation failed", {
      cause: originalError,
    });
    this.name = "ScheduleImageCreationError";
  }
}