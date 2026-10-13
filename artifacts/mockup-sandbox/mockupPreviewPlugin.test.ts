import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { mockupPreviewPlugin } from "./mockupPreviewPlugin";

test("preview discovery includes nested TSX files but excludes private targets", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mockup-discovery-"));
  try {
    const files = [
      "Public.tsx",
      "nested/Card.tsx",
      "_Private.tsx",
      "_hidden/Card.tsx",
      "nested/_Hidden.tsx",
      "nested/_private/Deep.tsx",
      "helpers.ts",
    ];
    for (const file of files) {
      const absolute = path.join(root, "src/components/mockups", file);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, "export default function Component() { return null; }");
    }
    const plugin = mockupPreviewPlugin();
    const configure = plugin.configResolved as (config: { root: string }) => void;
    const buildStart = plugin.buildStart as () => Promise<void>;
    configure({ root });
    await buildStart();
    const source = await readFile(path.join(root, "src/.generated/mockup-components.ts"), "utf8");
    assert.match(source, /"\.\/components\/mockups\/Public\.tsx"/);
    assert.match(source, /"\.\/components\/mockups\/nested\/Card\.tsx"/);
    assert.match(source, /import\("\.\.\/components\/mockups\/nested\/Card\.tsx"\)/);
    assert.equal((source.match(/: \(\) => import\(/g) ?? []).length, 2);
    assert.doesNotMatch(source, /Private|Hidden|Deep|helpers|_hidden/);

    await rm(path.join(root, "src/components/mockups/Public.tsx"));
    await buildStart();
    const refreshed = await readFile(path.join(root, "src/.generated/mockup-components.ts"), "utf8");
    assert.doesNotMatch(refreshed, /Public\.tsx/);
    assert.match(refreshed, /nested\/Card\.tsx/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("preview discovery generates an empty module when no targets exist", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mockup-discovery-empty-"));
  try {
    const plugin = mockupPreviewPlugin();
    (plugin.configResolved as (config: { root: string }) => void)({ root });
    await (plugin.buildStart as () => Promise<void>)();
    const source = await readFile(path.join(root, "src/.generated/mockup-components.ts"), "utf8");
    assert.match(source, /export const modules: ModuleMap = \{\s*\};/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
