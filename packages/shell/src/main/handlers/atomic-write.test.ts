import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Set up the allowed path mock BEFORE importing the module.
let tmpDir: string;

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      // Return the real tmpDir so our test path is "allowed".
      if (name === 'documents') return tmpDir ?? os.tmpdir();
      if (name === 'downloads') return '/unused-downloads';
      if (name === 'desktop') return '/unused-desktop';
      if (name === 'userData') return '/unused-userdata';
      throw new Error(`Unknown path: ${name}`);
    },
  },
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
  },
}));

// Import after mocks.
const { writeBytes, readBytes } = await import('./file.js');

describe('writeBytes — atomic write', () => {
  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'word-shell-test-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes content to the target path', async () => {
    const dest = path.join(tmpDir, 'out.bin');
    const content = Buffer.from('hello world');
    const b64 = content.toString('base64');

    const result = await writeBytes({ path: dest, bytes: b64, atomic: true });

    expect(result.ok).toBe(true);
    expect(result.bytesWritten).toBe(content.byteLength);
    const written = await fs.promises.readFile(dest);
    expect(written.toString()).toBe('hello world');
  });

  it('uses a tmp file then renames (atomic path)', async () => {
    // Spy on fs.promises.rename to confirm it is called.
    const renameSpy = vi.spyOn(fs.promises, 'rename');
    const dest = path.join(tmpDir, 'atomic.bin');
    const b64 = Buffer.from('data').toString('base64');

    await writeBytes({ path: dest, bytes: b64, atomic: true });

    expect(renameSpy).toHaveBeenCalledOnce();
    const [tmpPath, finalPath] = renameSpy.mock.calls[0] as [string, string];
    expect(finalPath).toBe(dest);
    // The tmp path should include "tmp-" and be near the destination.
    expect(tmpPath).toContain('.tmp-');
    expect(path.dirname(tmpPath)).toBe(tmpDir);

    renameSpy.mockRestore();
  });

  it('no rename for non-atomic write', async () => {
    const renameSpy = vi.spyOn(fs.promises, 'rename');
    const dest = path.join(tmpDir, 'direct.bin');
    const b64 = Buffer.from('direct').toString('base64');

    await writeBytes({ path: dest, bytes: b64, atomic: false });

    expect(renameSpy).not.toHaveBeenCalled();
    renameSpy.mockRestore();
  });

  it('rejects a path outside allowed roots', async () => {
    const badPath = '/etc/shadow';
    const b64 = Buffer.from('evil').toString('base64');

    await expect(writeBytes({ path: badPath, bytes: b64 })).rejects.toThrow(
      /not in allowed roots/i,
    );
  });

  it('readBytes returns base64-encoded content and correct size', async () => {
    const src = path.join(tmpDir, 'readable.bin');
    const content = Buffer.from('read me');
    await fs.promises.writeFile(src, content);

    const result = await readBytes({ path: src });

    expect(result.size).toBe(content.byteLength);
    const decoded = Buffer.from(result.bytes, 'base64');
    expect(decoded.toString()).toBe('read me');
  });
});
