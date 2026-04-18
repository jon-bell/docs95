import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // One worker: Electron tests cannot parallelise safely (single-instance lock).
  workers: 1,
  timeout: 60_000,
  // No webServer block — tests launch Electron directly via _electron.launch.
  use: {
    // Increase action timeout within each test step.
    actionTimeout: 15_000,
  },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
});
