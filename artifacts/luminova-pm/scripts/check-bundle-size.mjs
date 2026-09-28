import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chunkSizeWarningLimitKb } from '../bundle-size.config.mjs';

const appDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(appDirectory, 'dist', 'public');
const htmlPath = path.join(outputDirectory, 'index.html');

const buildEnvironment = {
  ...process.env,
  PORT: process.env.PORT ?? '4173',
  BASE_PATH: process.env.BASE_PATH ?? '/',
};

const build = spawnSync(
  'pnpm',
  ['exec', 'vite', 'build', '--config', 'vite.config.ts'],
  {
    cwd: appDirectory,
    env: buildEnvironment,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
const buildOutput = `${build.stdout ?? ''}${build.stderr ?? ''}`;

if (/circular/i.test(buildOutput)) {
  throw new Error(
    `Bundle check failed: Vite reported a circular manual chunk dependency.\n${buildOutput}`,
  );
}

if (build.error || build.status !== 0) {
  const reason = build.error?.message ?? `exit code ${build.status}`;
  throw new Error(
    `Bundle check failed: Vite could not build the workspace (${reason}).\n${buildOutput}`,
  );
}

const html = readFileSync(htmlPath, 'utf8');
const entryScriptMatch = html.match(
  /<script[^>]+type="module"[^>]+src="([^"]+)"[^>]*>/,
);

if (!entryScriptMatch) {
  throw new Error(
    `Bundle check failed: no module entry script was found in ${path.relative(appDirectory, htmlPath)}.`,
  );
}

const entryScriptPath = path.join(
  outputDirectory,
  'assets',
  path.basename(new URL(entryScriptMatch[1], 'http://localhost').pathname),
);
const entrySizeBytes = statSync(entryScriptPath).size;
const limitBytes = chunkSizeWarningLimitKb * 1000;

console.log(
  `Workspace entry ${path.basename(entryScriptPath)}: ${entrySizeBytes} bytes ` +
    `(limit ${limitBytes} bytes).`,
);

if (entrySizeBytes > limitBytes) {
  throw new Error(
    `Bundle check failed: workspace entry ${path.basename(entryScriptPath)} is ` +
    `${entrySizeBytes} bytes, above the ${chunkSizeWarningLimitKb} kB Vite warning limit.`,
  );
}

console.log('Bundle check passed: no circular chunks and workspace entry is within budget.');