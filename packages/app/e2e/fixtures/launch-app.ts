/**
 * Helper that launches the built Electron app for E2E tests.
 *
 * The app must be built before running tests:
 *   pnpm --filter @word/app build
 *
 * WORD_TEST_DOCS_ROOT is set to the test-fixtures/docx directory so the
 * path-allowlist permits file.readBytes calls for fixture files (test seam
 * documented in shell/src/main/path-allowlist.ts).
 */

import { _electron } from 'playwright';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import type { ElectronApplication, Page } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve from e2e/fixtures → packages/app
const APP_ROOT = path.resolve(__dirname, '..', '..');

// packages/test-fixtures/docx
const FIXTURES_DOCX = path.resolve(APP_ROOT, '..', '..', 'packages', 'test-fixtures', 'docx');

export interface LaunchedApp {
  readonly electronApp: ElectronApplication;
  readonly window: Page;
  /** Call to clean up the temp userData dir after the test. */
  readonly cleanup: () => void;
}

export async function launchApp(): Promise<LaunchedApp> {
  // Use a unique temp userData dir per launch so Electron's SingletonLock does
  // not persist across tests or from a previous aborted run.
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'word-e2e-'));

  const electronApp = await _electron.launch({
    // 'electron .' loads the main entry from package.json.
    // --user-data-dir isolates each test run's Electron profile (avoids
    // SingletonLock conflicts when a previous run crashed without cleanup).
    // Playwright automatically adds --no-sandbox on Linux.
    args: [`--user-data-dir=${userDataDir}`, '.'],
    cwd: APP_ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      // Expose fixture directory to the path-allowlist test seam.
      WORD_TEST_DOCS_ROOT: FIXTURES_DOCX,
    },
  });

  // Wait for the first window to appear.
  const window = await electronApp.firstWindow();
  // Wait for the renderer to finish loading (DOM content settled).
  await window.waitForLoadState('domcontentloaded');

  const cleanup = () => {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  };

  return { electronApp, window, cleanup };
}
