// Performance harness runner — orchestrates all scenarios, writes results,
// compares against baseline, and exits non-zero on regressions.
//
// Usage:
//   node ./dist/perf/runner.js
//   node ./dist/perf/runner.js --update-baseline

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runLayoutEmpty } from './scenarios/layout-empty.js';
import { runLayoutLarge } from './scenarios/layout-large.js';
import { runTyping } from './scenarios/typing.js';
import { runDocxRoundtrip } from './scenarios/docx-roundtrip.js';
import { runMemoryCheck } from './scenarios/memory.js';
import type { BenchResult } from './timers.js';
import type { MemorySnapshot } from './scenarios/memory.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PerfMetric {
  readonly label: string;
  readonly p95Ms: number;
  readonly p50Ms: number;
  readonly p99Ms: number;
  readonly meanMs: number;
}

export interface MemoryMetric {
  readonly label: string;
  readonly rssMb: number;
  readonly heapUsedMb: number;
}

export interface PerfResults {
  readonly timestamp: string;
  readonly benchmarks: readonly PerfMetric[];
  readonly memory: readonly MemoryMetric[];
}

// A single named comparison outcome.
export type CompareOutcome =
  | {
      readonly label: string;
      readonly metric: string;
      readonly currentValue: number;
      readonly baselineValue: number;
      readonly regressionPct: number;
      readonly status: 'ok';
    }
  | {
      readonly label: string;
      readonly metric: string;
      readonly currentValue: number;
      readonly baselineValue: number;
      readonly regressionPct: number;
      readonly status: 'fail';
      readonly reason: string;
    };

export interface CompareResult {
  readonly outcomes: readonly CompareOutcome[];
  readonly anyFailed: boolean;
}

// ---------------------------------------------------------------------------
// Budget thresholds (warn only — printed in summary but do not set exit code)
// ---------------------------------------------------------------------------

interface BudgetEntry {
  readonly labelPattern: string;
  readonly metric: 'p95Ms';
  readonly warnAboveMs: number;
}

const BUDGETS: readonly BudgetEntry[] = [
  { labelPattern: 'layout:empty', metric: 'p95Ms', warnAboveMs: 10 },
  { labelPattern: 'layout:100-para', metric: 'p95Ms', warnAboveMs: 500 },
  { labelPattern: 'typing:1000-keystrokes', metric: 'p95Ms', warnAboveMs: 16 },
  { labelPattern: 'docx:roundtrip:hello.docx', metric: 'p95Ms', warnAboveMs: 50 },
];

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUTPUT_DIR = join(PACKAGE_ROOT, 'perf-output');
const BASELINE_PATH = join(PACKAGE_ROOT, 'perf-baseline.json');

// ---------------------------------------------------------------------------
// Comparison logic (exported so the seeded-regression test can use it)
// ---------------------------------------------------------------------------

const REGRESSION_THRESHOLD = 0.1; // 10 %
// Minimum absolute regression in ms before flagging; prevents false positives
// from OS timer quantization on sub-millisecond benchmarks.
const MIN_REGRESSION_ABS_MS = 1.0;

export function compareResults(current: PerfResults, baseline: PerfResults): CompareResult {
  const outcomes: CompareOutcome[] = [];

  for (const cur of current.benchmarks) {
    const base = baseline.benchmarks.find((b) => b.label === cur.label);
    if (base === undefined) continue; // new metric — no comparison possible

    // Use p95 as the tracked metric but require both a relative and absolute
    // threshold to be exceeded before declaring a failure. This prevents
    // false positives when the absolute value is below OS timer resolution.
    const regressionPct = (cur.p95Ms - base.p95Ms) / base.p95Ms;
    const absoluteDeltaMs = cur.p95Ms - base.p95Ms;
    const failed = regressionPct > REGRESSION_THRESHOLD && absoluteDeltaMs > MIN_REGRESSION_ABS_MS;
    if (failed) {
      outcomes.push({
        label: cur.label,
        metric: 'p95Ms',
        currentValue: cur.p95Ms,
        baselineValue: base.p95Ms,
        regressionPct,
        status: 'fail',
        reason:
          `p95 regressed by ${(regressionPct * 100).toFixed(1)}% ` +
          `(${cur.p95Ms.toFixed(2)} ms vs baseline ${base.p95Ms.toFixed(2)} ms)`,
      });
    } else {
      outcomes.push({
        label: cur.label,
        metric: 'p95Ms',
        currentValue: cur.p95Ms,
        baselineValue: base.p95Ms,
        regressionPct,
        status: 'ok',
      });
    }
  }

  for (const cur of current.memory) {
    const base = baseline.memory.find((b) => b.label === cur.label);
    if (base === undefined) continue;

    const regressionPct = (cur.rssMb - base.rssMb) / base.rssMb;
    const failed = regressionPct > REGRESSION_THRESHOLD;
    if (failed) {
      outcomes.push({
        label: cur.label,
        metric: 'rssMb',
        currentValue: cur.rssMb,
        baselineValue: base.rssMb,
        regressionPct,
        status: 'fail',
        reason:
          `RSS regressed by ${(regressionPct * 100).toFixed(1)}% ` +
          `(${cur.rssMb.toFixed(1)} MB vs baseline ${base.rssMb.toFixed(1)} MB)`,
      });
    } else {
      outcomes.push({
        label: cur.label,
        metric: 'rssMb',
        currentValue: cur.rssMb,
        baselineValue: base.rssMb,
        regressionPct,
        status: 'ok',
      });
    }
  }

  return {
    outcomes,
    anyFailed: outcomes.some((o) => o.status === 'fail'),
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function padRight(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}
function padLeft(s: string, n: number): string {
  return s.length >= n ? s : ' '.repeat(n - s.length) + s;
}
function ms(v: number): string {
  return v.toFixed(2) + ' ms';
}

function printSummaryTable(results: PerfResults): void {
  const header = [
    padRight('Scenario', 40),
    padLeft('p50', 10),
    padLeft('p95', 10),
    padLeft('p99', 10),
    padLeft('mean', 10),
    '  Budget',
  ].join('  ');
  console.log('\n' + header);
  console.log('-'.repeat(header.length));

  for (const b of results.benchmarks) {
    const budget = BUDGETS.find((bd) => b.label.includes(bd.labelPattern));
    const budgetStr =
      budget !== undefined
        ? b.p95Ms > budget.warnAboveMs
          ? `  WARN (>${budget.warnAboveMs} ms)`
          : '  OK'
        : '';
    console.log(
      [
        padRight(b.label, 40),
        padLeft(ms(b.p50Ms), 10),
        padLeft(ms(b.p95Ms), 10),
        padLeft(ms(b.p99Ms), 10),
        padLeft(ms(b.meanMs), 10),
        budgetStr,
      ].join('  '),
    );
  }

  console.log('\nMemory:');
  for (const m of results.memory) {
    const rssWarn = m.rssMb > 200 ? '  WARN (>200 MB)' : '  OK';
    console.log(
      `  ${padRight(m.label, 38)}  RSS ${m.rssMb.toFixed(1)} MB  heap ${m.heapUsedMb.toFixed(1)} MB${rssWarn}`,
    );
  }
}

function printCompareTable(compare: CompareResult): void {
  console.log('\nRegression check (> 10% = FAIL):');
  for (const o of compare.outcomes) {
    const pct = (o.regressionPct * 100).toFixed(1);
    const tag = o.status === 'fail' ? 'FAIL' : ' ok ';
    const suffix = o.status === 'fail' ? `  ← ${o.reason}` : '';
    console.log(
      `  [${tag}]  ${padRight(o.label, 40)}  ${o.metric}: ` +
        `${o.currentValue.toFixed(2)} vs ${o.baselineValue.toFixed(2)}  (${pct}%)${suffix}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const updateBaseline = process.argv.includes('--update-baseline');

  console.log('Running performance scenarios…\n');

  // --- Run scenarios ---
  const emptyResult = runLayoutEmpty();
  console.log(`layout:empty           p95=${emptyResult.p95Ms.toFixed(2)} ms`);

  const largeResult = runLayoutLarge();
  console.log(`layout:100-para        p95=${largeResult.p95Ms.toFixed(2)} ms`);

  const typingResult = runTyping();
  console.log(`typing:1000-keystrokes p95=${typingResult.p95Ms.toFixed(2)} ms`);

  const docxResults = await runDocxRoundtrip();
  for (const r of docxResults) {
    console.log(`${r.label.padEnd(40)} p95=${r.p95Ms.toFixed(2)} ms`);
  }

  const memSnap = runMemoryCheck();
  console.log(`memory:100-para        RSS=${memSnap.rssMb.toFixed(1)} MB`);

  // --- Assemble results ---
  function toBenchMetric(r: BenchResult): PerfMetric {
    return { label: r.label, p50Ms: r.p50Ms, p95Ms: r.p95Ms, p99Ms: r.p99Ms, meanMs: r.meanMs };
  }

  function toMemMetric(m: MemorySnapshot): MemoryMetric {
    return { label: m.label, rssMb: m.rssMb, heapUsedMb: m.heapUsedMb };
  }

  const results: PerfResults = {
    timestamp: new Date().toISOString(),
    benchmarks: [emptyResult, largeResult, typingResult, ...docxResults].map(toBenchMetric),
    memory: [toMemMetric(memSnap)],
  };

  // --- Write output files ---
  await mkdir(OUTPUT_DIR, { recursive: true });

  const timestamp = results.timestamp.replace(/[:.]/g, '-');
  const timestampedPath = join(OUTPUT_DIR, `results-${timestamp}.json`);
  const latestPath = join(OUTPUT_DIR, 'latest.json');

  await writeFile(timestampedPath, JSON.stringify(results, null, 2), 'utf8');
  await writeFile(latestPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\nResults written to perf-output/latest.json`);

  // --- Print summary table ---
  printSummaryTable(results);

  // --- Compare against baseline ---
  let exitCode = 0;

  if (updateBaseline) {
    // Omit samples from baseline to keep the file small.
    const forBaseline: PerfResults = {
      ...results,
      benchmarks: results.benchmarks.map(({ label, p50Ms, p95Ms, p99Ms, meanMs }) => ({
        label,
        p50Ms,
        p95Ms,
        p99Ms,
        meanMs,
      })),
    };
    await writeFile(BASELINE_PATH, JSON.stringify(forBaseline, null, 2), 'utf8');
    console.log('\nBaseline updated: perf-baseline.json');
  } else {
    let baselineRaw: string;
    try {
      baselineRaw = await readFile(BASELINE_PATH, 'utf8');
    } catch {
      console.log(
        '\n[NOTICE] No baseline file found (perf-baseline.json). ' +
          'Run with --update-baseline to create one. Skipping regression check.',
      );
      process.exit(0);
    }

    const baseline = JSON.parse(baselineRaw) as PerfResults;
    const compare = compareResults(results, baseline);
    printCompareTable(compare);

    if (compare.anyFailed) {
      console.error('\nPerformance regression detected — see FAIL entries above.');
      exitCode = 1;
    } else {
      console.log('\nAll metrics within 10% of baseline.');
    }
  }

  process.exit(exitCode);
}

main().catch((err: unknown) => {
  console.error('Perf runner error:', err);
  process.exit(2);
});
