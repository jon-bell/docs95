// Hit testing: map a screen point (relative to the page's top-left corner)
// to a domain position { leafId, offset }.
//
// Algorithm:
// 1. Find the page by index (caller supplies pageIndex).
// 2. Binary search for the line whose vertical span contains yPx.
// 3. Walk runs left-to-right to find which run contains xPx.
// 4. Bisect the run's glyph clusters to find the grapheme offset within the run.
//
// For MVP we measure each grapheme individually using the FontMetricsPort.
// This is O(n) in run length but acceptable for click events.

import type { NodeId } from '@word/domain';
import type { FontMetricsPort, HitTester, LineBox, LineRun, PageLayout } from './index.js';

// ---------------------------------------------------------------------------
// Grapheme offset bisection
// ---------------------------------------------------------------------------

/**
 * Given a run and an x offset within that run, return the character offset
 * into `run.text` that is closest to `xInRun`.
 *
 * We iterate character-by-character with the metrics port. For ASCII/Latin
 * this is fast enough for a click handler (O(n), n ≤ typical word length).
 */
function bisectOffset(run: LineRun, xInRun: number, metrics: FontMetricsPort): number {
  const text = run.text;
  if (text.length === 0) return 0;

  // Iterate over Unicode grapheme clusters using string iterator
  // (which yields codepoints, close enough for MVP Latin text).
  let accumulated = 0;
  let charOffset = 0;

  for (const char of text) {
    const charWidth = metrics.measure(char, run.props).widthPx;
    const midpoint = accumulated + charWidth / 2;
    if (xInRun < midpoint) {
      // Click lands before the midpoint of this character → position before it.
      return charOffset;
    }
    accumulated += charWidth;
    charOffset += char.length; // .length in UTF-16 code units
  }

  return text.length;
}

// ---------------------------------------------------------------------------
// Line search helpers
// ---------------------------------------------------------------------------

function findLineByY(lines: readonly LineBox[], yPx: number): LineBox | undefined {
  // Lines are stored in top-down order. Find the first line whose bottom edge
  // is below yPx, or the last line if yPx is beyond all lines.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const bottom = line.topPx + line.heightPx;
    if (yPx < bottom) return line;
  }
  return lines[lines.length - 1];
}

function findRunByX(runs: readonly LineRun[], xPx: number): LineRun | undefined {
  if (runs.length === 0) return undefined;
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    if (run === undefined) continue;
    const right = run.leftPx + run.widthPx;
    if (xPx < right) return run;
  }
  return runs[runs.length - 1];
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

export function createHitTester(pages: readonly PageLayout[], metrics: FontMetricsPort): HitTester {
  return {
    hitTest(
      pageIndex: number,
      xPx: number,
      yPx: number,
    ): { readonly leafId: NodeId; readonly offset: number } | undefined {
      const page = pages[pageIndex];
      if (page === undefined) return undefined;

      // Coordinates are relative to the page's top-left corner.
      // Translate to content-relative coordinates.
      const contentX = xPx - page.contentLeftPx;
      const contentY = yPx - page.contentTopPx;

      const line = findLineByY(page.lines, contentY);
      if (line === undefined) return undefined;

      if (line.runs.length === 0) {
        // Empty line (e.g. empty paragraph). Return position 0 within the
        // paragraph. We use the paragraphId as the leafId with offset 0.
        return { leafId: line.paragraphId, offset: 0 };
      }

      const run = findRunByX(line.runs, contentX);
      if (run === undefined) return undefined;

      const xInRun = contentX - run.leftPx;
      const charOffset = bisectOffset(run, Math.max(0, xInRun), metrics);

      return {
        leafId: run.runId,
        offset: run.offsetInRun + charOffset,
      };
    },
  };
}
