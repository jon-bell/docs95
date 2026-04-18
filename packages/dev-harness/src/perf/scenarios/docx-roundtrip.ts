// Benchmark readDocx + writeDocx for each fixture in packages/test-fixtures/docx/.
// Reports per-fixture p50/p95/p99 timings.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDocx, writeDocx } from '@word/docx';
import { benchAsync } from '../timers.js';
import type { BenchResult } from '../timers.js';

// __dirname equivalent for ESM
const FIXTURES_DIR = fileURLToPath(new URL('../../../../../test-fixtures/docx/', import.meta.url));

const FIXTURES = ['hello.docx', 'empty.docx', 'three-para.docx'] as const;

export async function runDocxRoundtrip(): Promise<readonly BenchResult[]> {
  const results: BenchResult[] = [];

  for (const filename of FIXTURES) {
    const filePath = join(FIXTURES_DIR, filename);
    let bytes: Uint8Array;
    try {
      bytes = await readFile(filePath);
    } catch {
      // Skip fixtures that don't exist in this environment.
      continue;
    }

    // Benchmark read phase
    const readResult = await benchAsync(
      `docx:read:${filename}`,
      async () => {
        await readDocx(bytes);
      },
      { warmup: 5, iterations: 60 },
    );
    results.push(readResult);

    // Benchmark read + write (round-trip)
    const roundtripResult = await benchAsync(
      `docx:roundtrip:${filename}`,
      async () => {
        const { doc } = await readDocx(bytes);
        await writeDocx(doc, { deterministic: true });
      },
      { warmup: 5, iterations: 50 },
    );
    results.push(roundtripResult);
  }

  return results;
}
