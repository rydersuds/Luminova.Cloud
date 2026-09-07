import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { spawn } from "node:child_process";
import express from "express";
import pg from "pg";

const { Pool } = pg;
const sourceDatabaseUrl = process.env.PROJECT_IMPORT_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const sourcePrivateDir = process.env.PRIVATE_OBJECT_DIR;

if (!sourceDatabaseUrl) {
  throw new Error("DATABASE_URL or PROJECT_IMPORT_TEST_DATABASE_URL is required for the isolated folder import integration test.");
}
if (!sourcePrivateDir) {
  throw new Error("PRIVATE_OBJECT_DIR is required for the real-storage folder import integration test.");
}

const runId = randomUUID().replaceAll("-", "");
const databaseName = `folder_import_${runId}`;
const ownerId = `integration-owner-${runId}`;
const fixturePrefix = `folder-import-integration/${runId}`;
const isolatedPrivateDir = `${sourcePrivateDir.replace(/\/$/, "")}/${fixturePrefix}`;

function databaseUrlForDatabase(databaseUrl: string, database: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

async function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  const child = spawn(command, args, { cwd: new URL("../../../..", import.meta.url), env, stdio: "inherit" });
  const [code] = await once(child, "exit") as [number | null];
  if (code !== 0) throw new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}`);
}

async function listen(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port.");
  return address.port;
}

async function close(server: Server | undefined): Promise<void> {
  if (!server?.listening) return;
  server.close();
  await once(server, "close");
}

async function json(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => null);
  assert.ok(response.ok, `Expected ${response.url} to succeed, received ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

const adminPool = new Pool({ connectionString: sourceDatabaseUrl });
let apiServer: Server | undefined;
let analysisServer: Server | undefined;
let isolatedPool: typeof import("@workspace/db")["pool"] | undefined;
const uploadedObjectPaths: string[] = [];

try {
  await adminPool.query(`create database "${databaseName}"`);
  const isolatedDatabaseUrl = databaseUrlForDatabase(sourceDatabaseUrl, databaseName);
  process.env.DATABASE_URL = isolatedDatabaseUrl;
  process.env.PRIVATE_OBJECT_DIR = isolatedPrivateDir;

  await run("pnpm", ["--filter", "@workspace/db", "run", "push"], {
    ...process.env,
    DATABASE_URL: isolatedDatabaseUrl,
  });

  analysisServer = createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/chat/completions") {
      res.writeHead(404).end();
      return;
    }
    for await (const _chunk of req) {
      // Drain the production OpenAI request before returning the deterministic fixture.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      id: `analysis-${runId}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "integration-fixture",
      choices: [{
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: JSON.stringify({
            project: { name: "Recovery Integration Project", address: "", region: "", clientName: "", pmName: "", description: "" },
            documents: [
              { relativePath: "scope.txt", classification: "contract" },
              { relativePath: "budget.txt", classification: "other" },
            ],
            vendors: [],
            quotes: [],
            invoices: [],
          }),
        },
      }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }));
  });
  const analysisPort = await listen(analysisServer);
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = `http://127.0.0.1:${analysisPort}`;
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "integration-fixture";

  const [{ default: storageRouter }, { default: luminovaRouter }, database] = await Promise.all([
    import("../../src/routes/storage"),
    import("../../src/routes/luminova"),
    import("@workspace/db"),
  ]);
  isolatedPool = database.pool;

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as typeof req & { userId: string }).userId = ownerId;
    (req as typeof req & { log: Console }).log = console;
    next();
  });
  app.use("/api", storageRouter, luminovaRouter);
  apiServer = createServer(app);
  const apiPort = await listen(apiServer);
  const baseUrl = `http://127.0.0.1:${apiPort}/api`;

  const files = [
    { relativePath: "scope.txt", name: "scope.txt", contentType: "text/plain", body: Buffer.from("Project scope") },
    { relativePath: "budget.txt", name: "budget.txt", contentType: "text/plain", body: Buffer.from("Budget: $1000") },
  ];
  const manifest = files.map(({ relativePath, name, contentType, body }) => ({
    relativePath, name, contentType, size: body.length,
  }));

  const created = await json(await fetch(`${baseUrl}/project-import-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documents: manifest }),
  })) as { importId: string };

  const attach = async (file: typeof files[number]) => {
    const upload = await json(await fetch(`${baseUrl}/storage/uploads/request-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        importId: created.importId,
        relativePath: file.relativePath,
        name: file.name,
        size: file.body.length,
        contentType: file.contentType,
      }),
    })) as { uploadURL: string; objectPath: string };
    uploadedObjectPaths.push(upload.objectPath);
    const uploadResponse = await fetch(upload.uploadURL, {
      method: "PUT",
      headers: { "Content-Type": file.contentType },
      body: file.body,
    });
    assert.ok(uploadResponse.ok, `Real storage upload failed with ${uploadResponse.status}`);
    const payload = {
      relativePath: file.relativePath,
      objectPath: upload.objectPath,
      name: file.name,
      size: file.body.length,
      contentType: file.contentType,
      textSnippet: file.body.toString("utf8"),
    };
    await json(await fetch(`${baseUrl}/project-import-sessions/${created.importId}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }));
    return payload;
  };

  const firstAttachment = await attach(files[0]);
  const recovered = await json(await fetch(`${baseUrl}/project-import-sessions`)) as { importId: string; uploadedPaths: string[] };
  assert.equal(recovered.importId, created.importId);
  assert.deepEqual(recovered.uploadedPaths, ["scope.txt"]);

  const duplicateAttach = await fetch(`${baseUrl}/project-import-sessions/${created.importId}/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(firstAttachment),
  });
  assert.equal(duplicateAttach.status, 200);
  await attach(files[1]);

  const attachmentCount = await database.db.select().from(database.projectDocumentsTable);
  assert.equal(attachmentCount.length, 2, "Duplicate attachment request created an extra database row.");

  const buildRequests = [0, 1].map(() => fetch(`${baseUrl}/project-import-sessions/${created.importId}/build`, { method: "POST" }));
  const buildResponses = await Promise.all(buildRequests);
  assert.deepEqual(buildResponses.map((response) => response.status).sort(), [201, 409]);

  const duplicateBuild = await fetch(`${baseUrl}/project-import-sessions/${created.importId}/build`, { method: "POST" });
  assert.equal(duplicateBuild.status, 409);

  const projects = await database.db.select().from(database.importedProjectsTable);
  assert.equal(projects.length, 1, "Duplicate build requests created more than one project.");
  process.stdout.write("Folder import recovery integration test passed.\n");
} finally {
  await close(apiServer);
  await close(analysisServer);

  try {
    const { ObjectNotFoundError, ObjectStorageService } = await import("../../src/lib/objectStorage");
    const storage = new ObjectStorageService();
    await Promise.all(uploadedObjectPaths.map(async (objectPath) => {
      try {
        await (await storage.getObjectEntityFile(objectPath)).delete({ ignoreNotFound: true });
      } catch (error) {
        if (!(error instanceof ObjectNotFoundError)) throw error;
      }
    }));
  } finally {
    await isolatedPool?.end();
    await adminPool.query(`drop database if exists "${databaseName}" with (force)`);
    await adminPool.end();
  }
}