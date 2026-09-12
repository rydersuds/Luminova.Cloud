import { and, asc, eq, gt, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  db,
  clientsTable,
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
    const checks = await Promise.all([
      db.select({ value: projectScheduleImagesTable.id }).from(projectScheduleImagesTable)
        .where(eq(projectScheduleImagesTable.objectPath, objectPath)).limit(1),
      db.select({ value: projectPanoramasTable.id }).from(projectPanoramasTable)
        .where(eq(projectPanoramasTable.objectPath, objectPath)).limit(1),
      db.select({ value: projectDocumentsTable.id }).from(projectDocumentsTable)
        .where(eq(projectDocumentsTable.objectPath, objectPath)).limit(1),
      db.select({ value: clientsTable.id }).from(clientsTable)
        .where(or(eq(clientsTable.logoObjectPath, objectPath), eq(clientsTable.pendingLogoObjectPath, objectPath))).limit(1),
      db.select({ value: projectExteriorPhotosTable.projectId }).from(projectExteriorPhotosTable)
        .where(eq(projectExteriorPhotosTable.exteriorImage, objectPath)).limit(1),
    ]);
    return checks.some((rows) => rows.length > 0);
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