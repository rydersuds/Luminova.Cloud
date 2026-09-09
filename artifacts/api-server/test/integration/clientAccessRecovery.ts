import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { spawn } from "node:child_process";
import pg from "pg";

const { Pool } = pg;

const workerIndex = process.argv.indexOf("--worker");
if (workerIndex !== -1) {
  const userId = process.argv[workerIndex + 1];
  const workspaceId = process.argv[workerIndex + 2];
  if (!userId || !workspaceId) {
    throw new Error("The recovery worker requires a user and workspace.");
  }

  const { revokeClientMemberships } = await import("../../src/routes/users");
  await revokeClientMemberships(userId, workspaceId);
  const { pool } = await import("@workspace/db");
  await pool.end();
  process.stdout.write(
    `Client access recovery completed for ${workspaceId}.\n`,
  );
} else {
  const sourceDatabaseUrl =
    process.env.CLIENT_ACCESS_RECOVERY_TEST_DATABASE_URL ??
    process.env.DATABASE_URL;
  if (!sourceDatabaseUrl) {
    throw new Error(
      "DATABASE_URL or CLIENT_ACCESS_RECOVERY_TEST_DATABASE_URL is required for the client access recovery integration test.",
    );
  }

  const runId = randomUUID().replaceAll("-", "");
  const databaseName = `client_access_${runId}`;
  const isolatedDatabaseUrl = new URL(sourceDatabaseUrl);
  isolatedDatabaseUrl.pathname = `/${databaseName}`;
  const adminPool = new Pool({ connectionString: sourceDatabaseUrl });
  let isolatedPool: (typeof import("@workspace/db"))["pool"] | undefined;

  async function runWorker(userId: string, workspaceId: string): Promise<void> {
    const child = spawn(
      "pnpm",
      [
        "--filter",
        "@workspace/api-server",
        "exec",
        "tsx",
        "test/integration/clientAccessRecovery.ts",
        "--worker",
        userId,
        workspaceId,
      ],
      {
        cwd: new URL("../../../..", import.meta.url),
        env: { ...process.env, DATABASE_URL: isolatedDatabaseUrl.toString() },
        stdio: "inherit",
      },
    );
    const [code] = (await once(child, "exit")) as [number | null];
    if (code !== 0)
      throw new Error(
        `Client access recovery worker exited with code ${code ?? "unknown"}.`,
      );
  }

  try {
    await adminPool.query(`create database "${databaseName}"`);
    process.env.DATABASE_URL = isolatedDatabaseUrl.toString();
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        "pnpm",
        ["--filter", "@workspace/db", "run", "push"],
        {
          cwd: new URL("../../../..", import.meta.url),
          env: { ...process.env, DATABASE_URL: isolatedDatabaseUrl.toString() },
          stdio: "inherit",
        },
      );
      child.once("error", reject);
      child.once("exit", (code) =>
        code === 0
          ? resolve()
          : reject(
              new Error(
                `Database schema setup exited with code ${code ?? "unknown"}.`,
              ),
            ),
      );
    });

    const database = await import("@workspace/db");
    isolatedPool = database.pool;
    const workspaceAClients = [
      {
        id: `${runId}-a-one`,
        workspaceId: "workspace-a",
        name: "Workspace A Organization One",
        createdBy: "admin",
      },
      {
        id: `${runId}-a-two`,
        workspaceId: "workspace-a",
        name: "Workspace A Organization Two",
        createdBy: "admin",
      },
    ];
    const workspaceBClients = [
      {
        id: `${runId}-b-one`,
        workspaceId: "workspace-b",
        name: "Workspace B Organization One",
        createdBy: "admin",
      },
    ];
    await database.db
      .insert(database.clientsTable)
      .values([...workspaceAClients, ...workspaceBClients]);
    await database.db.insert(database.clientMembersTable).values([
      {
        id: `${runId}-membership-a-stale-one`,
        clientId: workspaceAClients[0].id,
        userId: "stale-client",
        addedBy: "admin",
      },
      {
        id: `${runId}-membership-a-stale-two`,
        clientId: workspaceAClients[1].id,
        userId: "stale-client",
        addedBy: "admin",
      },
      {
        id: `${runId}-membership-a-valid`,
        clientId: workspaceAClients[1].id,
        userId: "active-client",
        addedBy: "admin",
      },
      {
        id: `${runId}-membership-b-stale`,
        clientId: workspaceBClients[0].id,
        userId: "stale-client",
        addedBy: "admin",
      },
    ]);

    // This worker is a fresh API process. The memberships above must remain recoverable
    // after the process that handled the interrupted role change is gone.
    await runWorker("stale-client", "workspace-a");

    const remaining = await database.db
      .select({
        clientId: database.clientMembersTable.clientId,
        userId: database.clientMembersTable.userId,
      })
      .from(database.clientMembersTable);
    assert.deepEqual(
      remaining.sort((left, right) =>
        `${left.clientId}:${left.userId}`.localeCompare(
          `${right.clientId}:${right.userId}`,
        ),
      ),
      [
        { clientId: workspaceAClients[1].id, userId: "active-client" },
        { clientId: workspaceBClients[0].id, userId: "stale-client" },
      ].sort((left, right) =>
        `${left.clientId}:${left.userId}`.localeCompare(
          `${right.clientId}:${right.userId}`,
        ),
      ),
      "Recovery must remove stale access from every client organization in its workspace without crossing into another workspace.",
    );
    process.stdout.write("Client access recovery integration test passed.\n");
  } finally {
    await isolatedPool?.end();
    await adminPool.query(
      `drop database if exists "${databaseName}" with (force)`,
    );
    await adminPool.end();
  }
}
