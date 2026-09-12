import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const roots = [
  "lib/api-client-react/src/generated",
  "lib/api-zod/src/generated",
];

async function normalize(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await normalize(filePath);
    } else if (entry.isFile() && filePath.endsWith(".ts")) {
      const content = await readFile(filePath, "utf8");
      const normalized = `${content.trimEnd()}\n`;
      if (normalized !== content) {
        await writeFile(filePath, normalized);
      }
    }
  }
}

await Promise.all(roots.map(normalize));