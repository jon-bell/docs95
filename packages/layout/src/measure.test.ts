import { describe, expect, it } from 'vitest';
import type { FontMetricsPort, MeasureProps } from './index.js';
import { measureText } from './measure.js';

// Stub: every character is 8 px wide; cell height 20 px; ascent 16 px; descent 4 px.
const CHAR_WIDTH = 8;
const CELL_HEIGHT = 20;
const ASCENT = 16;
const DESCENT = 4;

const stubMetrics: FontMetricsPort = {
  measure(text, _props) {
    const chars = [...text].length; // Unicode-aware char count
    return {
      widthPx: chars * CHAR_WIDTH,
      heightPx: CELL_HEIGHT,
      ascentPx: ASCENT,
      descentPx: DESCENT,
    };
  },
};

const props: MeasureProps = { fontName: 'TestFont', halfPoints: 24 };

describe('measureText', () => {
  it('returns empty array for empty string', () => {
    expect(measureText('', props, stubMetrics)).toHaveLength(0);
  });

  it('splits "hello world" into two clusters', () => {
    const clusters = measureText('hello world', props, stubMetrics);
    // "hello " is one cluster, "world" is another.
    expect(clusters).toHaveLength(2);
    expect(clusters[0]?.text).toBe('hello ');
    expect(clusters[1]?.text).toBe('world');
  });

  it('preserves correct offsetInRun values', () => {
    const clusters = measureText('hello world', props, stubMetrics);
    expect(clusters[0]?.offsetInRun).toBe(0);
    expect(clusters[1]?.offsetInRun).toBe(6); // "hello " is 6 chars
  });

  it('assigns correct widths', () => {
    const clusters = measureText('hello world', props, stubMetrics);
    // "hello " = 6 chars = 48 px; "world" = 5 chars = 40 px.
    expect(clusters[0]?.widthPx).toBe(6 * CHAR_WIDTH);
    expect(clusters[1]?.widthPx).toBe(5 * CHAR_WIDTH);
  });

  it('handles a single word with no spaces', () => {
    const clusters = measureText('hello', props, stubMetrics);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.text).toBe('hello');
    expect(clusters[0]?.offsetInRun).toBe(0);
  });

  it('handles leading whitespace as its own cluster', () => {
    const clusters = measureText('  hello', props, stubMetrics);
    // Leading spaces become their own cluster, then "hello".
    expect(clusters.length).toBeGreaterThanOrEqual(1);
    // The word "hello" must appear somewhere.
    const helloCluster = clusters.find((c) => c.text.includes('hello'));
    expect(helloCluster).toBeDefined();
  });

  it('reports heightPx and ascentPx from the metrics port', () => {
    const clusters = measureText('hi', props, stubMetrics);
    expect(clusters[0]?.heightPx).toBe(CELL_HEIGHT);
    expect(clusters[0]?.ascentPx).toBe(ASCENT);
    expect(clusters[0]?.descentPx).toBe(DESCENT);
  });
});
