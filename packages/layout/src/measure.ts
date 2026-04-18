// Text measurement: split run text into GlyphClusters at Unicode whitespace
// boundaries, keeping trailing whitespace attached to the preceding word.
// Each cluster is measured independently so the line-breaker can make greedy
// decisions without re-measuring.
//
// MVP: no HarfBuzz, no bidi. FontMetricsPort is the only measurement seam.

import type { FontMetricsPort, MeasureProps } from './index.js';

export interface GlyphCluster {
  /** Substring of the run this cluster covers (may include trailing whitespace). */
  readonly text: string;
  /** Byte offset of `text` within the full run string. */
  readonly offsetInRun: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly ascentPx: number;
  readonly descentPx: number;
}

// Unicode whitespace regex — matches any Unicode whitespace codepoint.
const WORD_SPLIT_RE = /(\S+\s*|\s+)/gu;

/**
 * Split `text` into GlyphClusters at Unicode word boundaries.
 *
 * Trailing whitespace is absorbed into the preceding word cluster rather than
 * standing alone so that line-end whitespace suppression is trivial: a cluster
 * that ends with whitespace contributes zero width at end-of-line.
 *
 * An empty string yields an empty array.
 */
export function measureText(
  text: string,
  props: MeasureProps,
  metrics: FontMetricsPort,
): readonly GlyphCluster[] {
  if (text.length === 0) return [];

  const clusters: GlyphCluster[] = [];
  let match: RegExpExecArray | null;

  WORD_SPLIT_RE.lastIndex = 0;
  while ((match = WORD_SPLIT_RE.exec(text)) !== null) {
    const chunk = match[0];
    if (chunk === undefined || chunk.length === 0) continue;
    const offsetInRun = match.index;
    const m = metrics.measure(chunk, props);
    clusters.push({
      text: chunk,
      offsetInRun,
      widthPx: m.widthPx,
      heightPx: m.heightPx,
      ascentPx: m.ascentPx,
      descentPx: m.descentPx,
    });
  }

  return clusters;
}
