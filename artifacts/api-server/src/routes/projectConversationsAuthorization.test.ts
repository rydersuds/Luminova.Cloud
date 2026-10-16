import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import luminovaRouter from "./luminova";

test("retired conversation and message API routes are not served", async (t) => {
  const app = express();
  app.use(express.json());
  app.use(luminovaRouter);

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => server.close());

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const retiredRoutes: Array<[string, string]> = [
    ["GET", "/conversations"],
    ["POST", "/conversations"],
    ["GET", "/conversations/options"],
    ["GET", "/conversations/retained-record"],
    ["POST", "/conversations/retained-record/messages"],
  ];

  for (const [method, path] of retiredRoutes) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      ...(method === "POST" ? { body: JSON.stringify({ text: "not sent" }) } : {}),
    });
    assert.equal(response.status, 404, `${method} ${path} should not be registered`);
  }
});
