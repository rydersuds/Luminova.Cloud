import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db, projectPanoramasTable, type ProjectPanorama } from "@workspace/db";
import { ObjectStorageService } from "./objectStorage";

export type PanoramaRecord = {
  id: string;
  url: string;
  label: string | null;
  location: string | null;
  date: string | null;
};

export interface PanoramaStore {
  list(projectId: string): Promise<PanoramaRecord[]>;
  create(input: {
    projectId: string;
    objectPath: string;
    label: string | null;
    location: string | null;
    date: string | null;
    ownerId: string;
  }): Promise<PanoramaRecord>;
  update(input: {
    projectId: string;
    panoramaId: string;
    label: string | null;
    location: string | null;
    date: string | null;
  }): Promise<PanoramaRecord | null>;
}

const servingUrl = (objectPath: string) => `/api/storage${objectPath}`;

export interface PanoramaRepository {
  list(projectId: string): Promise<ProjectPanorama[]>;
  insert(panorama: Omit<ProjectPanorama, "createdAt">): Promise<ProjectPanorama>;
  update(
    projectId: string,
    panoramaId: string,
    details: Pick<ProjectPanorama, "label" | "location" | "captureDate">,
  ): Promise<ProjectPanorama | null>;
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

  async update(
    projectId: string,
    panoramaId: string,
    details: Pick<ProjectPanorama, "label" | "location" | "captureDate">,
  ): Promise<ProjectPanorama | null> {
    const [row] = await db.update(projectPanoramasTable)
      .set(details)
      .where(and(
        eq(projectPanoramasTable.projectId, projectId),
        eq(projectPanoramasTable.id, panoramaId),
      ))
      .returning();
    return row ?? null;
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

  async update(input: Parameters<PanoramaStore["update"]>[0]): Promise<PanoramaRecord | null> {
    const row = await this.repository.update(input.projectId, input.panoramaId, {
      label: input.label,
      location: input.location,
      captureDate: input.date,
    });
    return row ? {
      id: row.id,
      url: servingUrl(row.objectPath),
      label: row.label,
      location: row.location,
      date: row.captureDate,
    } : null;
  }
}