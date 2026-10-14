import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { spawn } from "node:child_process";
import express from "express";
import pg from "pg";
import { eq } from "drizzle-orm";

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
const importFailureLogs: unknown[] = [];

try {
  await adminPool.query(`create database "${databaseName}"`);
  const isolatedDatabaseUrl = databaseUrlForDatabase(sourceDatabaseUrl, databaseName);
  process.env.DATABASE_URL = isolatedDatabaseUrl;
  process.env.PRIVATE_OBJECT_DIR = isolatedPrivateDir;

  await run("pnpm", ["--filter", "@workspace/db", "run", "push"], {
    ...process.env,
    DATABASE_URL: isolatedDatabaseUrl,
  });

  let transientAnalysisFailures = 10;
  const analysisRequests: Array<{
    model?: string;
    responseFormatType?: string;
    responseSchemaName?: string;
    maxCompletionTokens?: number;
  }> = [];
  analysisServer = createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/chat/completions") {
      res.writeHead(404).end();
      return;
    }
    const requestChunks: Buffer[] = [];
    for await (const chunk of req) requestChunks.push(Buffer.from(chunk));
    const requestBody = JSON.parse(Buffer.concat(requestChunks).toString("utf8")) as {
      model?: string;
      max_completion_tokens?: number;
      response_format?: { type?: string; json_schema?: { name?: string } };
    };
    analysisRequests.push({
      model: requestBody.model,
      responseFormatType: requestBody.response_format?.type,
      responseSchemaName: requestBody.response_format?.json_schema?.name,
      maxCompletionTokens: requestBody.max_completion_tokens,
    });
    if (transientAnalysisFailures > 0) {
      transientAnalysisFailures--;
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: {
        message: "Temporary analysis service outage.",
        type: "server_error",
        code: "upstream_overloaded",
      } }));
      return;
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
            project: {
              name: "Recovery Integration Project",
              address: "",
              region: "",
              clientName: "",
              pmName: "",
              description: "",
              startDate: "2025-01-01",
              targetDate: "2026-01-01",
              internalBudgetDollars: 0,
              clientQuoteDollars: 0,
            },
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
    (req as typeof req & { log: Console }).log = {
      ...console,
      error(value: unknown) {
        importFailureLogs.push(value);
        const error = value && typeof value === "object" && "err" in value ? value.err : value;
        process.stderr.write(`Folder import integration route error: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      },
      warn(value: unknown) {
        importFailureLogs.push(value);
      },
    } as Console;
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

  const attach = async (file: typeof files[number], verifyAttachmentRecovery = false) => {
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
    if (verifyAttachmentRecovery) {
      const failedAttachment = await fetch(`${baseUrl}/project-import-sessions/${created.importId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          objectPath: `${payload.objectPath.slice(0, payload.objectPath.lastIndexOf("/") + 1)}missing-${runId}`,
        }),
      });
      assert.equal(failedAttachment.status, 500);
      const failureBody = await failedAttachment.json() as { error: string };
      assert.match(failureBody.error, /uploaded file failed temporarily.*retry this upload/i);
      assert.doesNotMatch(failureBody.error, /ObjectNotFound|stack| at /i);
    }
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
  await attach(files[1], true);
  assert.ok(importFailureLogs.some((entry) =>
    entry && typeof entry === "object" &&
    "importId" in entry && entry.importId === created.importId &&
    "stage" in entry && entry.stage === "verifying the uploaded document",
  ), "The attachment failure log is missing its import ID or stage.");

  const attachmentCount = await database.db.select().from(database.projectDocumentsTable);
  assert.equal(attachmentCount.length, 2, "Duplicate attachment request created an extra database row.");

  const analysisFailure = await fetch(`${baseUrl}/project-import-sessions/${created.importId}/build`, { method: "POST" });
  transientAnalysisFailures = 0;
  assert.equal(analysisFailure.status, 503);
  const analysisFailureBody = await analysisFailure.json() as { error: string };
  assert.match(analysisFailureBody.error, /project analysis is temporarily unavailable.*HTTP 503/i);
  assert.doesNotMatch(analysisFailureBody.error, /Temporary analysis service outage|stack| at /i);
  assert.equal(analysisRequests.length, 3, "Provider retries must be bounded to the initial request plus two retries.");
  assert.ok(analysisRequests.every((request) =>
    request.model === "gpt-5-mini" &&
    request.responseFormatType === "json_schema" &&
    request.responseSchemaName === "project_import_analysis" &&
    request.maxCompletionTokens === 8192,
  ), "The configured model and structured response request must reach the OpenAI-compatible provider.");
  const analysisSession = await json(await fetch(`${baseUrl}/project-import-sessions/${created.importId}`)) as {
    status: string;
    retryable: boolean;
    failureStage: string | null;
    error: string | null;
    uploadedPaths: string[];
  };
  assert.equal(analysisSession.status, "failed");
  assert.equal(analysisSession.retryable, true);
  assert.equal(analysisSession.failureStage, "project analysis");
  assert.match(analysisSession.error ?? "", /temporarily unavailable.*preserved; retry/i);
  assert.deepEqual(analysisSession.uploadedPaths.sort(), ["budget.txt", "scope.txt"]);
  assert.ok(importFailureLogs.some((entry) =>
    entry && typeof entry === "object" &&
    "importId" in entry && entry.importId === created.importId &&
    "stage" in entry && entry.stage === "project analysis" &&
    "err" in entry && entry.err && typeof entry.err === "object" &&
    "category" in entry.err && entry.err.category === "temporary_provider" &&
    "status" in entry.err && entry.err.status === 503 &&
    "retryable" in entry && entry.retryable === true,
  ), "The project analysis failure log is missing its import ID, sub-step, or safe upstream classification.");

  await database.db.update(database.projectImportBatchesTable)
    .set({
      status: "building",
      error: null,
      buildLeaseId: "expired-build-lease",
      updatedAt: new Date(Date.now() - 60_000),
    })
    .where(eq(database.projectImportBatchesTable.id, created.importId));
  transientAnalysisFailures = 2;
  const interrupted = await json(await fetch(`${baseUrl}/project-import-sessions`)) as {
    importId: string;
    status: string;
    retryable: boolean;
    uploadedPaths: string[];
  };
  assert.equal(interrupted.importId, created.importId);
  assert.equal(interrupted.status, "failed");
  assert.equal(interrupted.retryable, true);
  assert.deepEqual(interrupted.uploadedPaths.sort(), ["budget.txt", "scope.txt"]);

  const buildRequests = [0, 1].map(() => fetch(`${baseUrl}/project-import-sessions/${created.importId}/build`, { method: "POST" }));
  const buildResponses = await Promise.all(buildRequests);
  assert.deepEqual(buildResponses.map((response) => response.status).sort(), [201, 409]);
  assert.equal(transientAnalysisFailures, 0, "The preserved-session retry must recover after repeated temporary provider failures.");
  assert.equal(analysisRequests.length, 6, "Recovery must use bounded provider retries rather than restarting uploads or looping.");

  const completedSession = await json(await fetch(`${baseUrl}/project-import-sessions/${created.importId}`)) as {
    importId: string;
    status: string;
    retryable: boolean;
    projectId: string | null;
  };
  assert.equal(completedSession.importId, created.importId);
  assert.equal(completedSession.status, "completed");
  assert.equal(completedSession.retryable, false);
  assert.ok(completedSession.projectId);

  const duplicateBuild = await fetch(`${baseUrl}/project-import-sessions/${created.importId}/build`, { method: "POST" });
  assert.equal(duplicateBuild.status, 409);

  const permanentImport = await json(await fetch(`${baseUrl}/project-import-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documents: [{ relativePath: "rejected.txt", name: "rejected.txt", size: 1, contentType: "text/plain" }] }),
  })) as { importId: string };
  await database.db.update(database.projectImportBatchesTable).set({
    status: "failed",
    error: "The project documents could not be analyzed with the current request. Choose different or smaller files to start a new import.",
    failureStage: "project analysis",
    retryable: false,
  }).where(eq(database.projectImportBatchesTable.id, permanentImport.importId));
  const blockedRetry = await fetch(`${baseUrl}/project-import-sessions/${permanentImport.importId}/build`, { method: "POST" });
  assert.equal(blockedRetry.status, 422, "A permanent input failure was submitted to analysis again.");
  const blockedRetryBody = await blockedRetry.json() as { error: string };
  assert.match(blockedRetryBody.error, /Choose different or smaller files/i);

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