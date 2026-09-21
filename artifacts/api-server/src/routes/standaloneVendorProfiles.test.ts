import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, standaloneVendorProfilesTable } from "@workspace/db";
import { ensureSeededVendorProfiles } from "../lib/standaloneVendorProfiles";

const originalFetch = globalThis.fetch;
const { default: luminovaRouter } = await import("./luminova");

after(() => {
  globalThis.fetch = originalFetch;
});

async function startApi(t: { after: (callback: () => void | Promise<void>) => void }, workspaceId: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const actor = req.header("x-test-user") ?? "seed-test-user";
    const auth = Object.assign(
      () => ({ userId: actor, orgId: workspaceId, tokenType: "session_token" }),
      { [Symbol.for("@clerk/express.auth")]: true },
    );
    Object.assign(req, { userId: actor, auth });
    next();
  });
  app.use(luminovaRouter);
  const server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  t.after(() => {
    server.close();
  });
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

function headers(userId = "seed-test-user") {
  return {
    "content-type": "application/json",
    "x-test-user": userId,
  };
}

test("seeded vendor profiles are idempotent, searchable, editable, and workspace-scoped", async (t) => {
  const suffix = randomUUID().replaceAll("-", "");
  const workspaceA = `org_seed_${suffix}_a`;
  const workspaceB = `org_seed_${suffix}_b`;
  t.after(async () => {
    await db.delete(standaloneVendorProfilesTable).where(
      eq(standaloneVendorProfilesTable.workspaceId, workspaceA),
    );
    await db.delete(standaloneVendorProfilesTable).where(
      eq(standaloneVendorProfilesTable.workspaceId, workspaceB),
    );
  });

  await ensureSeededVendorProfiles(workspaceA);
  await ensureSeededVendorProfiles(workspaceA);
  const rows = await db.select().from(standaloneVendorProfilesTable)
    .where(eq(standaloneVendorProfilesTable.workspaceId, workspaceA));
  assert.equal(rows.length, 19);
  const dryBuild = rows.find((row) => row.seedKey === "drybuild-group-mike");
  assert.deepEqual((dryBuild?.data as { specialties: string[] }).specialties, [
    "Drywall Boarding",
    "Drywall Taping",
    "T-Bar Ceiling",
  ]);
  assert.equal((dryBuild?.data as { sourceNotes: string }).sourceNotes, "Quoting Strahmore");

  const base = await startApi(t, workspaceA);
  const list = await fetch(base + "/trades", { headers: headers() });
  assert.equal(list.status, 200);
  const listed = await list.json() as Array<{
    id: string;
    companyName: string;
    specialties?: string[];
    sourceNotes?: string;
  }>;
  assert.equal(listed.length, 19);
  assert.equal(listed.filter((trade) => trade.companyName === "DryBuild Group LTD").length, 1);

  const noteSearch = await fetch(base + "/trades?search=Strahmore", { headers: headers() });
  assert.equal(noteSearch.status, 200);
  assert.deepEqual((await noteSearch.json() as Array<{ companyName: string }>).map((trade) => trade.companyName), [
    "DryBuild Group LTD",
  ]);

  const specialtyFilter = await fetch(base + "/trades?tradeType=Drywall%20Taping", { headers: headers() });
  assert.equal(specialtyFilter.status, 200);
  const filtered = await specialtyFilter.json() as Array<{ companyName: string; specialties?: string[] }>;
  assert.ok(filtered.some((trade) => trade.companyName === "DryBuild Group LTD"));
  assert.ok(filtered.some((trade) => trade.companyName === "Akal Drywalling"));

  const detailResponse = await fetch(base + `/trades/${dryBuild?.id}`, { headers: headers() });
  assert.equal(detailResponse.status, 200);
  const detail = await detailResponse.json() as {
    phone: string;
    email: string;
    specialties: string[];
    sourceNotes: string;
  };
  assert.equal(detail.phone, "825-747-0464");
  assert.equal(detail.email, "drybuildalberta@gmail.com");
  assert.deepEqual(detail.specialties, ["Drywall Boarding", "Drywall Taping", "T-Bar Ceiling"]);
  assert.equal(detail.sourceNotes, "Quoting Strahmore");

  const updateResponse = await fetch(base + `/trades/${dryBuild?.id}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({
      phone: detail.phone,
      email: detail.email,
      website: "",
      regions: ["Calgary"],
      licence: "",
      insurance: "",
      insuranceExpiry: "",
      profilePhotoPositionX: 50,
      profilePhotoPositionY: 50,
      profilePhotoZoom: 1,
    }),
  });
  assert.equal(updateResponse.status, 200);
  const updated = await updateResponse.json() as { sourceNotes: string; specialties: string[] };
  assert.equal(updated.sourceNotes, "Quoting Strahmore");
  assert.deepEqual(updated.specialties, ["Drywall Boarding", "Drywall Taping", "T-Bar Ceiling"]);

  const otherWorkspaceApi = await startApi(t, workspaceB);
  const otherWorkspaceList = await fetch(otherWorkspaceApi + "/trades", { headers: headers("other-user") });
  assert.equal(otherWorkspaceList.status, 200);
  const otherWorkspace = await otherWorkspaceList.json() as Array<{ id: string }>;
  assert.equal(otherWorkspace.length, 19);
  assert.notEqual(otherWorkspace[0]?.id, listed[0]?.id);

  const unauthorizedDetail = await fetch(base + `/trades/${otherWorkspace[0]?.id}`, { headers: headers() });
  assert.equal(unauthorizedDetail.status, 404);
});