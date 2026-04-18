import { describe, expect, it } from 'vitest';
import { asNodeId } from '@word/domain';
import type { FontMetricsPort, LineBox, LineRun, MeasureProps, PageLayout } from './index.js';
import { createHitTester } from './hit-test.js';

const CHAR_W = 8;
const CELL_H = 20;

const stubMetrics: FontMetricsPort = {
  measure(text, _props) {
    return {
      widthPx: [...text].length * CHAR_W,
      heightPx: CELL_H,
      ascentPx: 16,
      descentPx: 4,
    };
  },
};

const props: MeasureProps = { fontName: 'TestFont', halfPoints: 24 };

// ---------------------------------------------------------------------------
// Build a minimal PageLayout fixture
// ---------------------------------------------------------------------------

function makeRun(text: string, leftPx: number, runId = 'run1'): LineRun {
  return {
    runId: asNodeId(runId),
    text,
    leftPx,
    widthPx: [...text].length * CHAR_W,
    props,
    resolvedRunProps: {},
    offsetInRun: 0,
  };
}

function makePage(runs: LineRun[]): PageLayout {
  const lineBox: LineBox = {
    paragraphId: asNodeId('para1'),
    lineIndex: 0,
    topPx: 0, // relative to content-top
    leftPx: 0,
    widthPx: 624,
    heightPx: CELL_H,
    baselinePx: 16,
    runs,
    alignment: 'left',
  };

  return {
    index: 0,
    sizePx: { widthPx: 816, heightPx: 1056 },
    marginsPx: { top: 96, bottom: 96, left: 96, right: 96 },
    contentTopPx: 96,
    contentLeftPx: 96,
    lines: [lineBox],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createHitTester', () => {
  it('returns undefined for an out-of-range page index', () => {
    const page = makePage([makeRun('hello', 0)]);
    const tester = createHitTester([page], stubMetrics);
    expect(tester.hitTest(1, 100, 100)).toBeUndefined();
  });

  it('clicking the middle of "hello" returns mid-offset', () => {
    // "hello" = 5 chars × 8 px = 40 px wide.
    // Middle of the third character ('l') ≈ x = 2.5 chars from left = 20 px.
    // Page content starts at x=96. So absolute x for mid-'l' ≈ 96 + 20 = 116.
    const page = makePage([makeRun('hello', 0)]);
    const tester = createHitTester([page], stubMetrics);

    // Click at content-relative x=20 (mid third char), y=5 (within first line).
    const result = tester.hitTest(0, 96 + 20, 96 + 5);
    expect(result).toBeDefined();
    // offset should be 2 (before 'l') or 3 (after 'l'); bisect puts us before midpoint.
    expect(result?.offset).toBeGreaterThanOrEqual(2);
    expect(result?.offset).toBeLessThanOrEqual(3);
  });

  it('clicking at x=0 (start of run) returns offset 0', () => {
    const page = makePage([makeRun('hello', 0)]);
    const tester = createHitTester([page], stubMetrics);
    const result = tester.hitTest(0, 96 + 0, 96 + 5);
    expect(result?.offset).toBe(0);
  });

  it('clicking past the end of the run returns the last offset', () => {
    const page = makePage([makeRun('hello', 0)]);
    const tester = createHitTester([page], stubMetrics);
    // "hello" is 40 px wide; click at x = 50 (past end).
    const result = tester.hitTest(0, 96 + 50, 96 + 5);
    expect(result?.offset).toBe(5); // length of "hello"
  });

  it('returns the correct runId', () => {
    const page = makePage([makeRun('hello', 0, 'run-abc')]);
    const tester = createHitTester([page], stubMetrics);
    const result = tester.hitTest(0, 96 + 4, 96 + 5);
    expect(result?.leafId).toBe('run-abc');
  });

  it('click below all lines returns the last line', () => {
    const page = makePage([makeRun('hello', 0)]);
    const tester = createHitTester([page], stubMetrics);
    // y = 9999 is well below the single line.
    const result = tester.hitTest(0, 96 + 4, 96 + 9999);
    expect(result).toBeDefined();
  });
});
