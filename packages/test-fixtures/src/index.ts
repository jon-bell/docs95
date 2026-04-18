// @word/test-fixtures — DOCX corpus, golden files, helpers for building sample Documents.

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export const FIXTURES_ROOT = resolve(here, '..', 'docx');

export function fixturePath(name: string): string {
  return resolve(FIXTURES_ROOT, name);
}
