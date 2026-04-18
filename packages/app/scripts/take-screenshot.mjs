// Launches the built Electron app and captures a screenshot of the welcome
// document. Intended to be run from the repo root under xvfb on Linux CI,
// or on a developer's desktop.

import { _electron as electron } from 'playwright';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const outDir = path.resolve(repoRoot, 'docs', 'screenshots');
const outPath = path.resolve(outDir, 'welcome.png');

fs.mkdirSync(outDir, { recursive: true });

// Use a throwaway userData dir so we don't clash with any real install.
const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'word-screenshot-'));

const app = await electron.launch({
  args: ['.', `--user-data-dir=${tmpUserData}`],
  cwd: appRoot,
});

const window = await app.firstWindow();
await window.waitForLoadState('domcontentloaded');

await window.locator('[role="document"]').waitFor({ state: 'visible', timeout: 20_000 });
await window.locator('.page[data-page-index="0"]').waitFor({ state: 'visible', timeout: 20_000 });

// Let fonts / measurements settle and the IME surface finish its first paint.
await window.waitForTimeout(800);

// Expand the window so the full first page fits in the screenshot.
await app.evaluate(async ({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.setSize(1200, 1600);
    win.center();
  }
});
await window.waitForTimeout(400);

await window.screenshot({ path: outPath, fullPage: false });

await app.close();

try {
  fs.rmSync(tmpUserData, { recursive: true, force: true });
} catch {
  // best effort
}

console.log(`Screenshot saved to ${path.relative(repoRoot, outPath)}`);
