// First-fit greedy line breaking for a single paragraph.
//
// Algorithm:
// 1. Walk inline children. Runs are split into GlyphClusters.
// 2. Add clusters to the current line until one would overflow, then flush.
// 3. Whitespace clusters that land exactly at end-of-line are absorbed
//    (contribute zero width so they don't push the line over).
// 4. Hard breaks (Break kind='line' | 'page') flush the current line
//    immediately and signal the caller for page breaks.
// 5. A single cluster wider than the available width is placed alone on its
//    own line (overflow rather than infinite loop).
//
// M1-C additions:
// - Each InlineSegment now carries the fully-resolved RunProps so that
//   LineRun.resolvedRunProps is populated for the render agent.
// - breakParagraph now accepts per-line available widths to support first-line
//   and hanging indents. The caller (layout-document) computes the widths.

import type { NodeId, RunProps } from '@word/domain';
import type { FontMetricsPort, LineRun, MeasureProps } from './index.js';
import { measureText } from './measure.js';
import type { GlyphCluster } from './measure.js';
import { DEFAULT_LINE_RATIO } from './constants.js';

export interface ParaLine {
  readonly runs: readonly LineRun[];
  readonly heightPx: number;
  readonly ascentPx: number;
  /** True when this line was terminated by a page-break inline. */
  readonly pageBreakAfter: boolean;
}

// An assembled cluster on the current line, carrying enough info to emit LineRuns.
interface PendingCluster {
  readonly runId: NodeId;
  readonly cluster: GlyphCluster;
  readonly props: MeasureProps;
  readonly resolvedRunProps: RunProps;
}

function flushLine(
  pending: readonly PendingCluster[],
  lineMaxAscent: number,
  lineMaxHeight: number,
  pageBreakAfter: boolean,
): ParaLine {
  if (pending.length === 0) {
    // Empty line (e.g., paragraph with no text, or after a hard break).
    return {
      runs: [],
      heightPx: lineMaxHeight,
      ascentPx: lineMaxAscent,
      pageBreakAfter,
    };
  }

  // Group adjacent clusters that share the same runId into a single LineRun.
  const runs: LineRun[] = [];
  let i = 0;
  let xPx = 0;

  while (i < pending.length) {
    const first = pending[i];
    if (first === undefined) break;
    const { runId, props, resolvedRunProps } = first;
    let text = first.cluster.text;
    let width = first.cluster.widthPx;
    const offsetInRun = first.cluster.offsetInRun;
    let j = i + 1;
    while (j < pending.length) {
      const next = pending[j];
      if (next === undefined || next.runId !== runId) break;
      text += next.cluster.text;
      width += next.cluster.widthPx;
      j++;
    }

    runs.push({
      runId,
      text,
      leftPx: xPx,
      widthPx: width,
      props,
      resolvedRunProps,
      offsetInRun,
    });
    xPx += width;
    i = j;
  }

  return {
    runs,
    heightPx: lineMaxHeight,
    ascentPx: lineMaxAscent,
    pageBreakAfter,
  };
}

export interface BreakParagraphInput {
  readonly runId: NodeId;
  readonly text: string;
  readonly props: MeasureProps;
}

/**
 * Break a paragraph's inline content into display lines.
 *
 * `inlines` is an already-resolved sequence of text runs and hard breaks.
 * Each entry is either a text segment (with runId + props + resolvedRunProps)
 * or a sentinel `{ kind: 'hardBreak' }`.
 */
export type InlineSegment =
  | {
      readonly kind: 'text';
      readonly runId: NodeId;
      readonly text: string;
      readonly props: MeasureProps;
      /** Fully resolved RunProps for this run, forwarded verbatim into LineRun. */
      readonly resolvedRunProps: RunProps;
    }
  | { readonly kind: 'hardBreak'; readonly breakKind: 'line' | 'page' };

/**
 * Per-line available-width override. Index 0 = first line (applies firstLine
 * or hanging indent), subsequent indices use the default width.
 *
 * Callers provide at most two distinct values: firstLineWidthPx and
 * subsequentWidthPx. When omitted, all lines use `defaultAvailableWidthPx`.
 */
export interface LineWidths {
  /** Width of the first line (may differ due to firstLine/hanging indent). */
  readonly firstLinePx: number;
  /** Width of all subsequent lines within the paragraph. */
  readonly subsequentPx: number;
}

export function breakParagraph(
  segments: readonly InlineSegment[],
  availableWidthPx: number,
  metrics: FontMetricsPort,
  fallbackLineHeightPx: number,
  fallbackAscentPx: number,
  lineWidths?: LineWidths,
): readonly ParaLine[] {
  const lines: ParaLine[] = [];
  let pending: PendingCluster[] = [];
  let lineUsedPx = 0;
  let lineMaxAscent = fallbackAscentPx;
  let lineMaxHeight = fallbackLineHeightPx;

  function currentLineAvailableWidth(): number {
    if (lineWidths === undefined) return availableWidthPx;
    return lines.length === 0 ? lineWidths.firstLinePx : lineWidths.subsequentPx;
  }

  function commitLine(pageBreakAfter: boolean): void {
    // Strip trailing pure-whitespace clusters (end-of-line whitespace absorption).
    let end = pending.length;
    while (end > 0) {
      const last = pending[end - 1];
      if (last !== undefined && last.cluster.text.trimEnd().length === 0) {
        end--;
      } else {
        break;
      }
    }
    const trimmed = pending.slice(0, end);
    lines.push(flushLine(trimmed, lineMaxAscent, lineMaxHeight, pageBreakAfter));
    pending = [];
    lineUsedPx = 0;
    lineMaxAscent = fallbackAscentPx;
    lineMaxHeight = fallbackLineHeightPx;
  }

  for (const seg of segments) {
    if (seg.kind === 'hardBreak') {
      commitLine(seg.breakKind === 'page');
      continue;
    }

    const clusters = measureText(seg.text, seg.props, metrics);

    for (const cluster of clusters) {
      const lineWidth = currentLineAvailableWidth();
      const isTrailingWhitespace = cluster.text.trimEnd().length === 0;
      const effectiveWidth = isTrailingWhitespace ? 0 : cluster.widthPx;

      if (lineUsedPx + cluster.widthPx > lineWidth && pending.length > 0 && !isTrailingWhitespace) {
        // This cluster doesn't fit. Flush and start fresh.
        commitLine(false);
      }

      pending.push({
        runId: seg.runId,
        cluster,
        props: seg.props,
        resolvedRunProps: seg.resolvedRunProps,
      });
      lineUsedPx += effectiveWidth;

      // Update line metrics using the full cluster height even if it's whitespace.
      if (cluster.ascentPx > lineMaxAscent) lineMaxAscent = cluster.ascentPx;
      const clusterLineHeight = cluster.heightPx * DEFAULT_LINE_RATIO;
      if (clusterLineHeight > lineMaxHeight) lineMaxHeight = clusterLineHeight;

      // If a single cluster is wider than the viewport, flush immediately
      // (overflow rather than infinite loop).
      if (lineUsedPx > lineWidth && pending.length === 1) {
        commitLine(false);
      }
    }
  }

  // Flush the final partial line (always, even if empty — paragraphs always
  // have at least one line so the caret has somewhere to live).
  commitLine(false);

  return lines;
}
