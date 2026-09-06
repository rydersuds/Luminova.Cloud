import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const browserPath = process.env.PLAYWRIGHT_BROWSERS_PATH
  ? resolve(process.env.PLAYWRIGHT_BROWSERS_PATH)
  : resolve('.cache/ms-playwright');

mkdirSync(browserPath, { recursive: true });

const result = spawnSync('pnpm', ['exec', 'playwright', 'install', 'chromium'], {
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: browserPath,
  },
  stdio: 'inherit',
});

if (result.error || result.status !== 0) {
  console.error(`
Playwright could not provision the Chromium build required by the installed @playwright/test version.
Browser cache: ${browserPath}

Check network access and available disk space, then rerun:
  pnpm run setup:playwright

If @playwright/test was updated, commit the matching pnpm-lock.yaml change so every environment installs the same version.
`);
  process.exit(result.status ?? 1);
}