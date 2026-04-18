// Seeded-regression test: verifies that compareResults() correctly detects a
// 20%-worse p95 as a FAIL, and that an equal or better value is OK.
//
// This test does NOT run live scenarios — it constructs synthetic PerfResults
// so it is fast, deterministic, and not subject to environment noise.

import { describe, it, expect } from 'vitest';
import { compareResults } from './runner.js';
import type { PerfResults } from './runner.js';

function makeResults(p95Ms: number, rssMb: number): PerfResults {
  return {
    timestamp: '2026-01-01T00:00:00.000Z',
    benchmarks: [
      { label: 'layout:empty', p50Ms: 1, p95Ms, p99Ms: p95Ms * 1.2, meanMs: p95Ms * 0.9 },
    ],
    memory: [{ label: 'memory:100-para', rssMb, heapUsedMb: rssMb * 0.8 }],
  };
}

const BASELINE = makeResults(10, 100);

describe('compareResults — regression gate', () => {
  it('returns "ok" when current equals baseline', () => {
    const current = makeResults(10, 100);
    const result = compareResults(current, BASELINE);
    expect(result.anyFailed).toBe(false);
    for (const o of result.outcomes) {
      expect(o.status).toBe('ok');
    }
  });

  it('returns "ok" when current is better than baseline', () => {
    const current = makeResults(8, 90); // 20% faster / less memory
    const result = compareResults(current, BASELINE);
    expect(result.anyFailed).toBe(false);
  });

  it('returns "ok" when regression is exactly at the 10% threshold', () => {
    // 10 ms * 1.10 = 11 ms — right at the line, should not fail
    const current = makeResults(11, 110);
    const result = compareResults(current, BASELINE);
    expect(result.anyFailed).toBe(false);
  });

  it('returns "fail" when p95 is 20% worse than baseline', () => {
    const current = makeResults(12, 100); // 20% regression on p95
    const result = compareResults(current, BASELINE);
    expect(result.anyFailed).toBe(true);

    const benchOutcome = result.outcomes.find(
      (o) => o.label === 'layout:empty' && o.metric === 'p95Ms',
    );
    expect(benchOutcome).toBeDefined();
    expect(benchOutcome?.status).toBe('fail');
    if (benchOutcome?.status === 'fail') {
      // Reason must contain a useful human-readable explanation.
      expect(benchOutcome.reason).toMatch(/regressed/i);
      expect(benchOutcome.reason).toMatch(/12\.00/);
      expect(benchOutcome.reason).toMatch(/10\.00/);
    }
  });

  it('returns "fail" when RSS memory is 20% worse than baseline', () => {
    const current = makeResults(10, 121); // 21% regression on RSS
    const result = compareResults(current, BASELINE);
    expect(result.anyFailed).toBe(true);

    const memOutcome = result.outcomes.find(
      (o) => o.label === 'memory:100-para' && o.metric === 'rssMb',
    );
    expect(memOutcome).toBeDefined();
    expect(memOutcome?.status).toBe('fail');
    if (memOutcome?.status === 'fail') {
      expect(memOutcome.reason).toMatch(/regressed/i);
    }
  });

  it('includes regression percentage in the outcome', () => {
    const current = makeResults(12, 100);
    const result = compareResults(current, BASELINE);
    const outcome = result.outcomes.find((o) => o.metric === 'p95Ms');
    expect(outcome?.regressionPct).toBeCloseTo(0.2, 5);
  });

  it('skips metrics that are not in the baseline (new metrics)', () => {
    // Baseline has only 'layout:empty'; current adds 'layout:new'.
    const baselineWithOne = makeResults(10, 100);
    const currentWithExtra: PerfResults = {
      ...makeResults(9, 95),
      benchmarks: [
        ...makeResults(9, 95).benchmarks,
        { label: 'layout:new', p50Ms: 1, p95Ms: 5, p99Ms: 6, meanMs: 4 },
      ],
    };
    const result = compareResults(currentWithExtra, baselineWithOne);
    // The new metric has no baseline — should not fail.
    expect(result.anyFailed).toBe(false);
    // And the extra metric should not appear in outcomes (no baseline to compare).
    const extra = result.outcomes.find((o) => o.label === 'layout:new');
    expect(extra).toBeUndefined();
  });
});
