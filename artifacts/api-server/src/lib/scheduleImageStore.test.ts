import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { db, projectScheduleImagesTable, type ProjectScheduleImage } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  DatabaseScheduleImageStore,
  type ScheduleImageObjectStorage,
  type ScheduleImageRepository,
} from "./scheduleImageStore";

class MemoryRepository implements ScheduleImageRepository {
  constructor(readonly rows: ProjectScheduleImage[] = []) {}

  async list(projectId: string, workspaceId?: string) {
    return this.rows.filter((row) => row.projectId === projectId && (!workspaceId || row.workspaceId === workspaceId));
  }

  async insert(row: Omit<ProjectScheduleImage, "createdAt">) {
    const stored = { ...row, createdAt: new Date("2026-09-06T12:00:00Z") };
    this.rows.push(stored);
    return stored;
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
  failure?: Error;

  async verifyScheduleImage(input: { objectPath: string; size: number; contentType: string }) {
    if (this.failure) throw this.failure;
    this.verified.push(input);
  }

  async setAcl(objectPath: string, policy: { owner: string; visibility: "public" | "private"; workspaceId?: string }) {
    this.policies.push({ path: objectPath, ...policy });
  }

  async deleteObject(objectPath: string) {
    if (this.failure) throw this.failure;
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
  storage.failure = new Error("metadata mismatch");

  await assert.rejects(new DatabaseScheduleImageStore(storage, repository).create(upload), /metadata mismatch/);
  assert.equal(repository.rows.length, 0);
  assert.equal(storage.policies.length, 0);
});

test("reloads schedule images for the requested project after a store restart", async () => {
  const repository = new MemoryRepository();
  await new DatabaseScheduleImageStore(new FakeStorage(), repository).create(upload);
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
  storage.failure = new Error("storage unavailable");

  await assert.rejects(store.remove(upload.projectId, created.id, upload.workspaceId), /storage unavailable/);
  assert.equal(repository.rows.length, 1);
});

test("persists and reloads schedule image metadata through PostgreSQL", async () => {
  const projectId = `schedule-integration-${randomUUID()}`;
  const objectPath = `/objects/uploads/${randomUUID()}`;
  try {
    await new DatabaseScheduleImageStore(new FakeStorage()).create({ ...upload, projectId, objectPath });
    const restarted = await new DatabaseScheduleImageStore(new FakeStorage()).list(projectId);
    assert.equal(restarted.length, 1);
    assert.equal(restarted[0].relativePath, upload.name);
  } finally {
    await db.delete(projectScheduleImagesTable).where(eq(projectScheduleImagesTable.projectId, projectId));
  }
});