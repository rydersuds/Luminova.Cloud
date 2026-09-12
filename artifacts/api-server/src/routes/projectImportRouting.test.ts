import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import app from "../app";
import luminovaRouter from "./luminova";

type RouterLayer = {
  route?: {
    path?: string;
    methods?: Record<string, boolean>;
  };
};

test("project import session routes are available at their public API paths", async (t) => {
  const server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  t.after(() => server.close());

  const { port } = server.address() as AddressInfo;
  const request = (path: string, init?: RequestInit) =>
    fetch(`http://127.0.0.1:${port}${path}`, init);

  const health = await request("/api/healthz");
  assert.equal(health.status, 200);

  const importRequests: Array<[string, RequestInit | undefined]> = [
    ["/api/project-import-sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ documents: [] }),
    }],
    ["/api/project-import-sessions", undefined],
    ["/api/project-import-sessions/import-route-test/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }],
    ["/api/project-import-sessions/import-route-test/build", { method: "POST" }],
    ["/api/projects/project-route-test/vendor-quotes/rescan", { method: "POST" }],
  ];

  for (const [path, init] of importRequests) {
    const response = await request(path, init);
    assert.equal(
      response.status,
      401,
      `${init?.method ?? "GET"} ${path} should reach the authenticated API router`,
    );
    assert.deepEqual(await response.json(), { error: "Authentication required" });
  }

  const importRouteMethods = ((luminovaRouter as unknown as { stack: RouterLayer[] }).stack)
    .filter((layer) => layer.route?.path?.startsWith("/project-import-sessions"))
    .flatMap((layer) =>
      Object.keys(layer.route?.methods ?? {})
        .filter((method) => layer.route?.methods?.[method])
        .map((method) => `${method.toUpperCase()} ${layer.route?.path}`),
    )
    .sort();
  assert.deepEqual(importRouteMethods, [
    "GET /project-import-sessions",
    "POST /project-import-sessions",
    "POST /project-import-sessions/:importId/build",
    "POST /project-import-sessions/:importId/documents",
  ]);

  const missing = await request("/project-import-sessions");
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get("content-type") ?? "", /^text\/html/);
});