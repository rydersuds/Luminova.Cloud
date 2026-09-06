import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { db, projectPanoramasTable, type ProjectPanorama } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  DatabasePanoramaStore,
  type PanoramaObjectStorage,
  type PanoramaRepository,
} from "./panoramaStore";

class MemoryRepository implements PanoramaRepository {
  constructor(readonly rows: ProjectPanorama[] = []) {}

  async list(projectId: string) {
    return this.rows.filter((row) => row.projectId === projectId);
  }

  async insert(row: Omit<ProjectPanorama, "createdAt">) {
    const stored = { ...row, createdAt: new Date("2026-09-06T12:00:00Z") };
    this.rows.push(stored);
    return stored;
  }

  async update(
    projectId: string,
    panoramaId: string,
    details: Pick<ProjectPanorama, "label" | "location" | "captureDate">,
  ) {
    const row = this.rows.find((item) => item.projectId === projectId && item.id === panoramaId);
    if (!row) return null;
    Object.assign(row, details);
    return row;
  }
}

class FakeStorage implements PanoramaObjectStorage {
  verified: string[] = [];
  policies: Array<{ path: string; owner: string; visibility: "public" | "private" }> = [];
  failure?: Error;

  async verifyPanorama(objectPath: string) {
    if (this.failure) throw this.failure;
    this.verified.push(objectPath);
  }

  async setAcl(objectPath: string, policy: { owner: string; visibility: "public" | "private" }) {
    this.policies.push({ path: objectPath, ...policy });
  }
}

const upload = {
  projectId: "riverstone",
  objectPath: "/objects/uploads/123e4567-e89b-12d3-a456-426614174000",
  label: "Week 25",
  location: "Main floor",
  date: "2026-09-06",
  ownerId: "user-1",
};

test("persists a verified panorama and returns a stable serving URL", async () => {
  const repository = new MemoryRepository();
  const storage = new FakeStorage();
  const store = new DatabasePanoramaStore(storage, repository);

  const created = await store.create(upload);

  assert.equal(created.url, `/api/storage${upload.objectPath}`);
  assert.equal(repository.rows[0].projectId, "riverstone");
  assert.deepEqual(storage.verified, [upload.objectPath]);
  assert.deepEqual(storage.policies, [{
    path: upload.objectPath,
    owner: "user-1",
    visibility: "public",
  }]);
});

test("persists an image-only panorama with absent details", async () => {
  const repository = new MemoryRepository();
  const store = new DatabasePanoramaStore(new FakeStorage(), repository);

  const created = await store.create({
    ...upload,
    label: null,
    location: null,
    date: null,
  });

  assert.equal(created.label, null);
  assert.equal(created.location, null);
  assert.equal(created.date, null);
  assert.equal(repository.rows[0].captureDate, null);
});

test("reloads metadata for only the requested project after a store restart", async () => {
  const repository = new MemoryRepository();
  await new DatabasePanoramaStore(new FakeStorage(), repository).create(upload);
  await new DatabasePanoramaStore(new FakeStorage(), repository).create({
    ...upload,
    projectId: "ridge-house",
    objectPath: "/objects/uploads/223e4567-e89b-12d3-a456-426614174000",
  });

  const restartedStore = new DatabasePanoramaStore(new FakeStorage(), repository);
  const panoramas = await restartedStore.list("riverstone");

  assert.equal(panoramas.length, 1);
  assert.equal(panoramas[0].label, "Week 25");
  assert.equal(panoramas[0].url, `/api/storage${upload.objectPath}`);
});

test("adds, changes, and clears panorama details", async () => {
  const repository = new MemoryRepository();
  const store = new DatabasePanoramaStore(new FakeStorage(), repository);
  const created = await store.create({ ...upload, label: null, location: null, date: null });

  const added = await store.update({
    projectId: upload.projectId,
    panoramaId: created.id,
    label: "Week 26",
    location: "Second floor",
    date: "2026-09-07",
  });
  assert.deepEqual(added && {
    label: added.label,
    location: added.location,
    date: added.date,
  }, {
    label: "Week 26",
    location: "Second floor",
    date: "2026-09-07",
  });

  const changed = await store.update({
    projectId: upload.projectId,
    panoramaId: created.id,
    label: "Closeout",
    location: null,
    date: null,
  });
  assert.equal(changed?.label, "Closeout");
  assert.equal(changed?.location, null);
  assert.equal(changed?.date, null);

  const reloaded = await new DatabasePanoramaStore(new FakeStorage(), repository).list(upload.projectId);
  assert.equal(reloaded[0].label, "Closeout");
  assert.equal(reloaded[0].location, null);
  assert.equal(reloaded[0].date, null);
});

test("does not update a panorama from another project", async () => {
  const repository = new MemoryRepository();
  const store = new DatabasePanoramaStore(new FakeStorage(), repository);
  const created = await store.create(upload);

  const updated = await store.update({
    projectId: "ridge-house",
    panoramaId: created.id,
    label: "Wrong project",
    location: null,
    date: null,
  });

  assert.equal(updated, null);
  assert.equal(repository.rows[0].label, "Week 25");
});

test("does not persist metadata when the uploaded object is missing or invalid", async () => {
  const repository = new MemoryRepository();
  const storage = new FakeStorage();
  storage.failure = new Error("Object not found");

  await assert.rejects(
    new DatabasePanoramaStore(storage, repository).create(upload),
    /Object not found/,
  );
  assert.equal(repository.rows.length, 0);
  assert.equal(storage.policies.length, 0);
});

test("persists and reloads a panorama through PostgreSQL with a new store instance", async () => {
  const projectId = `integration-${randomUUID()}`;
  const objectPath = `/objects/uploads/${randomUUID()}`;
  const storage = new FakeStorage();

  try {
    await new DatabasePanoramaStore(storage).create({
      ...upload,
      projectId,
      objectPath,
    });

    const restartedStore = new DatabasePanoramaStore(new FakeStorage());
    const panoramas = await restartedStore.list(projectId);

    assert.equal(panoramas.length, 1);
    assert.equal(panoramas[0].url, `/api/storage${objectPath}`);
    assert.equal(panoramas[0].date, upload.date);
  } finally {
    await db.delete(projectPanoramasTable).where(eq(projectPanoramasTable.projectId, projectId));
  }
});