import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db, projectPanoramasTable, type ProjectPanorama } from "@workspace/db";
import { ObjectStorageService } from "./objectStorage";

export type PanoramaRecord = {
  id: string;
  url: string;
  label: string;
  location: string;
  date: string;
};

export interface PanoramaStore {
  list(projectId: string): Promise<PanoramaRecord[]>;
  create(input: {
    projectId: string;
    objectPath: string;
    label: string;
    location: string;
    date: string;
    ownerId: string;
  }): Promise<PanoramaRecord>;
}

const servingUrl = (objectPath: string) => `/api/storage${objectPath}`;

export interface PanoramaRepository {
  list(projectId: string): Promise<ProjectPanorama[]>;
  insert(panorama: Omit<ProjectPanorama, "createdAt">): Promise<ProjectPanorama>;
}

export interface PanoramaObjectStorage {
  verifyPanorama(objectPath: string): Promise<void>;
  setAcl(objectPath: string, policy: { owner: string; visibility: "public" | "private" }): Promise<void>;
}

export class DrizzlePanoramaRepository implements PanoramaRepository {
  async list(projectId: string): Promise<ProjectPanorama[]> {
    return db.select().from(projectPanoramasTable)
      .where(eq(projectPanoramasTable.projectId, projectId))
      .orderBy(asc(projectPanoramasTable.createdAt));
  }

  async insert(panorama: Omit<ProjectPanorama, "createdAt">): Promise<ProjectPanorama> {
    const [row] = await db.insert(projectPanoramasTable).values(panorama).returning();
    return row;
  }
}

export class DatabasePanoramaStore implements PanoramaStore {
  constructor(
    private readonly storage: PanoramaObjectStorage = new ObjectStorageService(),
    private readonly repository: PanoramaRepository = new DrizzlePanoramaRepository(),
  ) {}

  async list(projectId: string): Promise<PanoramaRecord[]> {
    const rows = await this.repository.list(projectId);
    return rows.map((row) => ({
      id: row.id,
      url: servingUrl(row.objectPath),
      label: row.label,
      location: row.location,
      date: row.captureDate,
    }));
  }

  async create(input: Parameters<PanoramaStore["create"]>[0]): Promise<PanoramaRecord> {
    await this.storage.verifyPanorama(input.objectPath);
    await this.storage.setAcl(input.objectPath, { owner: input.ownerId, visibility: "public" });
    const row = await this.repository.insert({
      id: `pano-${randomUUID()}`,
      projectId: input.projectId,
      objectPath: input.objectPath,
      label: input.label,
      location: input.location,
      captureDate: input.date,
    });
    return {
      id: row.id,
      url: servingUrl(row.objectPath),
      label: row.label,
      location: row.location,
      date: row.captureDate,
    };
  }
}