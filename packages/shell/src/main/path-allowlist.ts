import * as path from 'path';
import { app } from 'electron';

/**
 * Allowed root directories for file I/O. Using an allowlist (not blocklist)
 * prevents traversal to arbitrary paths. Roots are resolved lazily so this
 * module can be imported before app is ready (tests stub app).
 *
 * Test seam: when WORD_TEST_DOCS_ROOT is set (E2E environment only), that
 * directory is added to the allowlist so smoke tests can read fixture files
 * without moving them into the user's Documents folder.
 */
function allowedRoots(): readonly string[] {
  const roots = [
    app.getPath('documents'),
    app.getPath('downloads'),
    app.getPath('desktop'),
    app.getPath('userData'),
  ];

  const testRoot = process.env['WORD_TEST_DOCS_ROOT'];
  if (testRoot) {
    roots.push(testRoot);
  }

  return roots;
}

/**
 * Returns true only when p is an absolute path that resolves to a location
 * inside one of the allowed roots. Traversal sequences are rejected even
 * after normalization.
 */
export function isPathAllowed(p: string): boolean {
  if (!path.isAbsolute(p)) {
    return false;
  }

  const normalized = path.normalize(p);

  // Reject any remaining traversal components after normalization.
  if (normalized.includes('..')) {
    return false;
  }

  for (const root of allowedRoots()) {
    const normalizedRoot = path.normalize(root);
    // Ensure the path is strictly inside the root (not just a prefix match).
    const relative = path.relative(normalizedRoot, normalized);
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
      return true;
    }
  }

  return false;
}
