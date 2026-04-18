// Benchmark the insert-text command dispatched 1000 times (one char each)
// via EditorInstance. Captures per-keystroke timing and reports percentiles.

import { createEmptyDocument, createIdGen, asIsoDateTime } from '@word/domain';
import type { ClockPort, RandomPort, LogPort } from '@word/domain';
import { createEditorInstance, createInsertTextCommand } from '@word/engine';
import { asCommandId } from '@word/engine';
import { now } from '../timers.js';
import type { BenchResult } from '../timers.js';

const CHARS = 'abcdefghijklmnopqrstuvwxyz ';

function makeChar(i: number): string {
  return CHARS[i % CHARS.length] ?? 'a';
}

const clock: ClockPort = {
  now: () => asIsoDateTime(new Date().toISOString()),
  perfNow: () => performance.now(),
};

const random: RandomPort = {
  nextU32: () => Math.floor(Math.random() * 0xffff_ffff),
  nextFloat: () => Math.random(),
};

const log: LogPort = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))] ?? 0;
}

export function runTyping(): BenchResult {
  const KEYSTROKES = 1000;
  const idGen = createIdGen();
  const doc = createEmptyDocument(idGen);

  const editor = createEditorInstance({ doc, idGen, clock, random, log });
  editor.bus.register(createInsertTextCommand());

  const insertId = asCommandId('doc.insertText');
  const samples: number[] = [];

  for (let i = 0; i < KEYSTROKES; i++) {
    const text = makeChar(i);
    const t0 = now();
    editor.bus.dispatch(insertId, { text });
    samples.push(now() - t0);
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((s, v) => s + v, 0) / samples.length;

  return {
    label: 'typing:1000-keystrokes',
    iterations: KEYSTROKES,
    meanMs: mean,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    samples: sorted,
  };
}
