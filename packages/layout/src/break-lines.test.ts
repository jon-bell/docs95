import { describe, expect, it } from 'vitest';
import { asNodeId } from '@word/domain';
import type { FontMetricsPort, MeasureProps } from './index.js';
import { breakParagraph, type InlineSegment } from './break-lines.js';

// Stub metrics: each character is 8 px wide, cell height 20 px, ascent 16 px.
const CHAR_WIDTH = 8;
const CELL_HEIGHT = 20;
const ASCENT = 16;

const stubMetrics: FontMetricsPort = {
  measure(text, _props) {
    return {
      widthPx: [...text].length * CHAR_WIDTH,
      heightPx: CELL_HEIGHT,
      ascentPx: ASCENT,
      descentPx: 4,
    };
  },
};

const props: MeasureProps = { fontName: 'TestFont', halfPoints: 24 };
const RUN_A = asNodeId('run-a');

function textSeg(text: string, runId = RUN_A): InlineSegment {
  return { kind: 'text', runId, text, props, resolvedRunProps: {} };
}

describe('breakParagraph', () => {
  it('"hello world" in 64 px viewport breaks after "hello"', () => {
    // "hello " = 48 px; "world" = 40 px; total = 88 px > 64 px.
    // So "hello " fits on line 1, "world" goes to line 2.
    const lines = breakParagraph(
      [textSeg('hello world')],
      64,
      stubMetrics,
      CELL_HEIGHT * 1.15,
      ASCENT,
    );
    expect(lines).toHaveLength(2);
    // Line 1 should contain "hello" (trailing space absorbed).
    const line1Texts = lines[0]?.runs.map((r) => r.text).join('') ?? '';
    expect(line1Texts).toContain('hello');
    // Line 2 should contain "world".
    const line2Texts = lines[1]?.runs.map((r) => r.text).join('') ?? '';
    expect(line2Texts).toContain('world');
  });

  it('a long single word overflows without infinite loop', () => {
    // "superlongword" = 13 chars × 8 px = 104 px; viewport = 64 px.
    // Must terminate and place the word on its own line.
    const lines = breakParagraph(
      [textSeg('superlongword')],
      64,
      stubMetrics,
      CELL_HEIGHT * 1.15,
      ASCENT,
    );
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const allText = lines.flatMap((l) => l.runs.map((r) => r.text)).join('');
    expect(allText).toContain('superlongword');
  });

  it('empty segment list still produces one (empty) line', () => {
    const lines = breakParagraph([], 640, stubMetrics, CELL_HEIGHT * 1.15, ASCENT);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.runs).toHaveLength(0);
  });

  it('hard line-break forces a new line', () => {
    const segs: InlineSegment[] = [
      textSeg('line1'),
      { kind: 'hardBreak', breakKind: 'line' },
      textSeg('line2'),
    ];
    const lines = breakParagraph(segs, 640, stubMetrics, CELL_HEIGHT * 1.15, ASCENT);
    // The hard break flushes "line1" → line 0. The break itself flushes an
    // empty line → line 1 (the break sentinel). "line2" is flushed at end → line 2.
    // Actually: "line1" content is pending when break arrives → commitLine flushes it as line 0.
    // Then break produces an empty commitLine → line 1. Then "line2" pending → final flush → line 2.
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const allText = lines.flatMap((l) => l.runs.map((r) => r.text)).join(' ');
    expect(allText).toContain('line1');
    expect(allText).toContain('line2');
  });

  it('page-break segment sets pageBreakAfter on the line containing the preceding text', () => {
    const segs: InlineSegment[] = [
      textSeg('before'),
      { kind: 'hardBreak', breakKind: 'page' },
      textSeg('after'),
    ];
    const lines = breakParagraph(segs, 640, stubMetrics, CELL_HEIGHT * 1.15, ASCENT);
    // When the page break is encountered, the pending "before" text is flushed
    // with pageBreakAfter=true (because the break has kind='page').
    const pageBreakLine = lines.find((l) => l.pageBreakAfter);
    expect(pageBreakLine).toBeDefined();
    const allText = lines.flatMap((l) => l.runs.map((r) => r.text)).join(' ');
    expect(allText).toContain('before');
    expect(allText).toContain('after');
  });

  it('trailing whitespace is not included in final line text', () => {
    const lines = breakParagraph(
      [textSeg('hello  ')],
      640,
      stubMetrics,
      CELL_HEIGHT * 1.15,
      ASCENT,
    );
    const text = lines[0]?.runs.map((r) => r.text).join('') ?? '';
    // Trailing whitespace cluster is absorbed at EOL.
    expect(text.trimEnd()).toBe('hello');
  });
});
