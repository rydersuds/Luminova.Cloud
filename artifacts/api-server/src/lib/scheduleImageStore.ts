import { and, asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  db,
  projectScheduleImagesTable,
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
    }));
  }

  async create(input: ScheduleImageInput): Promise<ScheduleImageRecord> {
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
    return {
      id: row.id,
      url: servingUrl(row.objectPath),
      name: row.name,
      relativePath: row.relativePath,
      contentType: row.contentType,
      size: row.size,
    };
  }

  async remove(projectId: string, imageId: string, workspaceId: string): Promise<boolean> {
    const row = await this.repository.find(projectId, imageId, workspaceId);
    if (!row) return false;
    await this.storage.deleteObject(row.objectPath);
    await this.repository.delete(projectId, imageId, workspaceId);
    return true;
  }
}