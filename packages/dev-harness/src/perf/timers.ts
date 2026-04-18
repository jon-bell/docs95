// Lightweight benchmarking helpers for the performance harness.
// All measurements use performance.now() which is available in Node ≥ 16.

export interface BenchResult {
  readonly label: string;
  readonly iterations: number;
  readonly meanMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly samples: readonly number[];
}

/** High-resolution monotonic timestamp in milliseconds. */
export function now(): number {
  return performance.now();
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  const clamped = Math.max(0, Math.min(sorted.length - 1, idx));
  return sorted[clamped] ?? 0;
}

function computeStats(samples: number[], label: string, iterations: number): BenchResult {
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
  return {
    label,
    iterations,
    meanMs: mean,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    samples: sorted,
  };
}

export interface BenchOptions {
  readonly warmup?: number;
  readonly iterations?: number;
}

/**
 * Synchronous micro-benchmark. Runs fn `warmup` times (discarded) then
 * `iterations` times, returning percentile stats over the timed samples.
 */
export function bench(label: string, fn: () => unknown, opts: BenchOptions = {}): BenchResult {
  const warmup = opts.warmup ?? 3;
  const iterations = opts.iterations ?? 50;

  for (let i = 0; i < warmup; i++) {
    fn();
  }

  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = now();
    fn();
    samples.push(now() - t0);
  }

  return computeStats(samples, label, iterations);
}

/**
 * Async micro-benchmark. Runs fn `warmup` times (discarded) then
 * `iterations` times, returning percentile stats over the timed samples.
 */
export async function benchAsync(
  label: string,
  fn: () => Promise<unknown>,
  opts: BenchOptions = {},
): Promise<BenchResult> {
  const warmup = opts.warmup ?? 3;
  const iterations = opts.iterations ?? 50;

  for (let i = 0; i < warmup; i++) {
    await fn();
  }

  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = now();
    await fn();
    samples.push(now() - t0);
  }

  return computeStats(samples, label, iterations);
}
