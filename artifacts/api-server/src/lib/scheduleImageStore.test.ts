import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  db,
  projectScheduleImagesTable,
  scheduleUploadReservationsTable,
  type ProjectScheduleImage,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  DatabaseScheduleImageStore,
  type ScheduleImageObjectStorage,
  type ScheduleImageRepository,
} from "./scheduleImageStore";

class MemoryRepository implements ScheduleImageRepository {
  reservationClaimable = true;
  reservationCleanable = true;

  constructor(readonly rows: ProjectScheduleImage[] = []) {}

  async list(projectId: string, workspaceId?: string) {
    return this.rows.filter((row) => row.projectId === projectId && (!workspaceId || row.workspaceId === workspaceId));
  }

  async insert(row: Omit<ProjectScheduleImage, "createdAt">) {
    const stored = { ...row, createdAt: new Date("2026-09-06T12:00:00Z") };
    this.rows.push(stored);
    return stored;
  }

  async claimReservation() {
    if (!this.reservationClaimable) return false;
    this.reservationClaimable = false;
    return true;
  }

  async canCleanReservation() {
    return this.reservationCleanable;
  }

  async releaseReservation() {}

  async hasObjectPath(objectPath: string) {
    return this.rows.some((row) => row.objectPath === objectPath);
  }

  async find(projectId: string, imageId: string, workspaceId: string) {
    return this.rows.find((row) =>
      row.projectId === projectId &&
      row.id === imageId &&
      row.workspaceId === workspaceId
    );
  }

  async delete(projectId: string, imageId: string, workspaceId: string) {
    const index = this.rows.findIndex((row) =>
      row.projectId === projectId &&
      row.id === imageId &&
      row.workspaceId === workspaceId
    );
    if (index >= 0) this.rows.splice(index, 1);
  }
}

class FakeStorage implements ScheduleImageObjectStorage {
  verified: Array<{ objectPath: string; size: number; contentType: string }> = [];
  policies: Array<{ path: string; owner: string; visibility: "public" | "private"; workspaceId?: string }> = [];
  deleted: string[] = [];
  verifyFailure?: Error;
  deleteFailure?: Error;

  async verifyScheduleImage(input: { objectPath: string; size: number; contentType: string }) {
    if (this.verifyFailure) throw this.verifyFailure;
    this.verified.push(input);
  }

  async setAcl(objectPath: string, policy: { owner: string; visibility: "public" | "private"; workspaceId?: string }) {
    this.policies.push({ path: objectPath, ...policy });
  }

  async deleteObject(objectPath: string) {
    if (this.deleteFailure) throw this.deleteFailure;
    this.deleted.push(objectPath);
  }
}

const upload = {
  projectId: "riverstone",
  objectPath: "/objects/uploads/schedule-123",
  name: "schedule.png",
  size: 2048,
  contentType: "image/png",
  ownerId: "user-1",
  workspaceId: "workspace-1",
};

test("persists a verified schedule image with a private workspace ACL", async () => {
  const repository = new MemoryRepository();
  const storage = new FakeStorage();
  const created = await new DatabaseScheduleImageStore(storage, repository).create(upload);

  assert.equal(created.url, `/api/storage${upload.objectPath}`);
  assert.deepEqual(storage.verified, [{
    objectPath: upload.objectPath,
    size: upload.size,
    contentType: upload.contentType,
  }]);
  assert.deepEqual(storage.policies, [{
    path: upload.objectPath,
    owner: upload.ownerId,
    workspaceId: upload.workspaceId,
    visibility: "private",
  }]);
  assert.equal(repository.rows[0].projectId, upload.projectId);
});

test("does not persist a schedule image when object verification fails", async () => {
  const repository = new MemoryRepository();
  const storage = new FakeStorage();
  storage.verifyFailure = new Error("metadata mismatch");

  await assert.rejects(new DatabaseScheduleImageStore(storage, repository).create(upload), /metadata mismatch/);
  assert.equal(repository.rows.length, 0);
  assert.equal(storage.policies.length, 0);
  assert.deepEqual(storage.deleted, [upload.objectPath]);
});

test("cleans up an uploaded schedule image when persistence fails", async () => {
  const repository = new MemoryRepository();
  repository.insert = async () => {
    throw new Error("database unavailable");
  };
  const storage = new FakeStorage();

  await assert.rejects(new DatabaseScheduleImageStore(storage, repository).create(upload), /database unavailable/);
  assert.deepEqual(storage.deleted, [upload.objectPath]);
});

test("does not clean up a schedule image object already attached to another record", async () => {
  const repository = new MemoryRepository();
  const storage = new FakeStorage();
  const store = new DatabaseScheduleImageStore(storage, repository);
  await store.create(upload);
  repository.reservationClaimable = true;
  storage.verifyFailure = new Error("metadata mismatch");

  await assert.rejects(store.create(upload), /metadata mismatch/);
  assert.deepEqual(storage.deleted, []);
  assert.equal(repository.rows.length, 1);
});

test("allows only one concurrent create attempt to claim an upload reservation", async () => {
  const repository = new MemoryRepository();
  const storage = new FakeStorage();
  const store = new DatabaseScheduleImageStore(storage, repository);

  const results = await Promise.allSettled([store.create(upload), store.create(upload)]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(repository.rows.length, 1);
  assert.deepEqual(storage.deleted, []);
});

test("rejects an upload without a matching reservation and leaves the object untouched", async () => {
  const repository = new MemoryRepository();
  repository.reservationClaimable = false;
  const storage = new FakeStorage();

  await assert.rejects(
    new DatabaseScheduleImageStore(storage, repository).create(upload),
    /reservation is invalid or expired/,
  );
  assert.deepEqual(storage.verified, []);
  assert.deepEqual(storage.deleted, []);
});

test("does not clean an unattached object without a reservation owned by the caller and project", async () => {
  const repository = new MemoryRepository();
  repository.reservationCleanable = false;
  const storage = new FakeStorage();

  assert.equal(
    await new DatabaseScheduleImageStore(storage, repository)
      .cleanupUnattached(upload.objectPath, "other-user", upload.projectId),
    false,
  );
  assert.deepEqual(storage.deleted, []);
});

test("preserves the creation error when cleanup also fails", async () => {
  const repository = new MemoryRepository();
  const storage = new FakeStorage();
  storage.verifyFailure = new Error("metadata mismatch");
  storage.deleteFailure = new Error("storage unavailable");

  await assert.rejects(
    new DatabaseScheduleImageStore(storage, repository).create(upload),
    (error: unknown) => {
      assert.equal((error as Error).message, "metadata mismatch");
      assert.equal((error as { cleanupError?: Error }).cleanupError?.message, "storage unavailable");
      return true;
    },
  );
});

test("reloads schedule images for the requested project after a store restart", async () => {
  const repository = new MemoryRepository();
  await new DatabaseScheduleImageStore(new FakeStorage(), repository).create(upload);
  repository.reservationClaimable = true;
  await new DatabaseScheduleImageStore(new FakeStorage(), repository).create({
    ...upload,
    projectId: "ridge-house",
    objectPath: "/objects/uploads/schedule-456",
    name: "ridge-schedule.webp",
    contentType: "image/webp",
  });

  const restarted = await new DatabaseScheduleImageStore(new FakeStorage(), repository).list(upload.projectId);
  assert.equal(restarted.length, 1);
  assert.equal(restarted[0].name, upload.name);
  assert.equal(restarted[0].url, `/api/storage${upload.objectPath}`);
});

test("lists only schedule images from the requesting workspace when scoped", async () => {
  const repository = new MemoryRepository();
  await new DatabaseScheduleImageStore(new FakeStorage(), repository).create(upload);
  repository.reservationClaimable = true;
  await new DatabaseScheduleImageStore(new FakeStorage(), repository).create({
    ...upload,
    objectPath: "/objects/uploads/schedule-other-workspace",
    workspaceId: "workspace-2",
  });

  const visible = await new DatabaseScheduleImageStore(new FakeStorage(), repository).list(upload.projectId, upload.workspaceId);
  assert.deepEqual(visible.map((image) => image.name), [upload.name]);
});

test("removes an uploaded schedule image object and record only within its project workspace", async () => {
  const repository = new MemoryRepository();
  const storage = new FakeStorage();
  const store = new DatabaseScheduleImageStore(storage, repository);
  const created = await store.create(upload);

  assert.equal(await store.remove(upload.projectId, created.id, "workspace-2"), false);
  assert.deepEqual(storage.deleted, []);
  assert.equal(repository.rows.length, 1);

  assert.equal(await store.remove(upload.projectId, created.id, upload.workspaceId), true);
  assert.deepEqual(storage.deleted, [upload.objectPath]);
  assert.equal(repository.rows.length, 0);
});

test("keeps an uploaded schedule image record when private object cleanup fails", async () => {
  const repository = new MemoryRepository();
  const storage = new FakeStorage();
  const store = new DatabaseScheduleImageStore(storage, repository);
  const created = await store.create(upload);
  storage.deleteFailure = new Error("storage unavailable");

  await assert.rejects(store.remove(upload.projectId, created.id, upload.workspaceId), /storage unavailable/);
  assert.equal(repository.rows.length, 1);
});

test("persists and reloads schedule image metadata through PostgreSQL", async () => {
  const projectId = `schedule-integration-${randomUUID()}`;
  const objectPath = `/objects/uploads/${randomUUID()}`;
  try {
    await db.insert(scheduleUploadReservationsTable).values({
      objectPath,
      ownerId: upload.ownerId,
      projectId,
      size: upload.size,
      contentType: upload.contentType,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await new DatabaseScheduleImageStore(new FakeStorage()).create({ ...upload, projectId, objectPath });
    const restarted = await new DatabaseScheduleImageStore(new FakeStorage()).list(projectId);
    assert.equal(restarted.length, 1);
    assert.equal(restarted[0].relativePath, upload.name);
  } finally {
    await db.delete(projectScheduleImagesTable).where(eq(projectScheduleImagesTable.projectId, projectId));
    await db.delete(scheduleUploadReservationsTable).where(eq(scheduleUploadReservationsTable.objectPath, objectPath));
  }
});