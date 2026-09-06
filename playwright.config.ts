import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './artifacts/luminova-pm/tests/visual',
  outputDir: './artifacts/luminova-pm/test-results',
  snapshotPathTemplate: '{testDir}/__snapshots__/{testFilePath}/{arg}{ext}',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    colorScheme: 'light',
    reducedMotion: 'reduce',
  },
  webServer: {
    command: 'PORT=4173 BASE_PATH=/ pnpm --filter @workspace/luminova-pm run dev',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
  },
});