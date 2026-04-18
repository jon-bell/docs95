// Benchmark layoutDocument on an empty document — the baseline for cold-path
// overhead with no content to measure or break.

import { createEmptyDocument, createIdGen } from '@word/domain';
import { layoutDocument } from '@word/layout';
import type { FontMetricsPort, MeasureProps } from '@word/layout';
import { bench } from '../timers.js';
import type { BenchResult } from '../timers.js';

/** Stub metrics that return fixed dimensions — no canvas required in Node. */
const stubMetrics: FontMetricsPort = {
  measure(_text: string, props: MeasureProps) {
    const heightPx = (props.halfPoints / 2) * (96 / 72);
    return {
      widthPx: 0,
      heightPx,
      ascentPx: heightPx * 0.8,
      descentPx: heightPx * 0.2,
    };
  },
};

export function runLayoutEmpty(): BenchResult {
  const idGen = createIdGen();
  const doc = createEmptyDocument(idGen);

  return bench('layout:empty', () => layoutDocument({ doc, metrics: stubMetrics }), {
    warmup: 20,
    iterations: 500,
  });
}
