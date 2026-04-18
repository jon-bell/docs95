import type { IdRange } from '@word/domain';
import type { LineBox, PageLayout } from '@word/layout';
import React from 'react';

export interface SelectionOverlayProps {
  readonly range: IdRange;
  readonly pages: readonly PageLayout[];
}

interface SelectionRect {
  readonly key: string;
  readonly pageIndex: number;
  readonly topPx: number;
  readonly leftPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

/**
 * Resolves a logical range into a flat list of per-line selection rectangles.
 * MVP: selection is within a single paragraph identified by anchor.leafId.
 * Cross-paragraph selection falls back to covering the full line widths.
 */
function resolveSelectionRects(
  range: IdRange,
  pages: readonly PageLayout[],
): readonly SelectionRect[] {
  const rects: SelectionRect[] = [];

  const { anchor, focus } = range;
  const startOffset = Math.min(anchor.offset, focus.offset);
  const endOffset = Math.max(anchor.offset, focus.offset);

  for (let pi = 0; pi < pages.length; pi++) {
    const page = pages[pi];
    if (page === undefined) continue;

    for (const line of page.lines) {
      const isAnchorLine = line.paragraphId === anchor.leafId;
      const isFocusLine = line.paragraphId === focus.leafId;
      const samePara = anchor.leafId === focus.leafId;

      if (!isAnchorLine && !isFocusLine && !samePara) continue;
      if (!isAnchorLine && !isFocusLine) continue;

      const rect = computeLineSelectionRect(line, startOffset, endOffset, samePara);
      if (rect !== undefined) {
        rects.push({
          key: `${pi}-${line.paragraphId}-${line.lineIndex}`,
          pageIndex: pi,
          ...rect,
        });
      }
    }
  }

  return rects;
}

interface LineRect {
  readonly topPx: number;
  readonly leftPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

function computeLineSelectionRect(
  line: LineBox,
  startOffset: number,
  endOffset: number,
  samePara: boolean,
): LineRect | undefined {
  if (!samePara) {
    // Cross-paragraph: cover full line.
    return {
      topPx: line.topPx,
      leftPx: line.leftPx,
      widthPx: line.widthPx,
      heightPx: line.heightPx,
    };
  }

  // Compute the visual x-range of runs intersecting [startOffset, endOffset).
  let selLeft = Infinity;
  let selRight = -Infinity;

  for (const run of line.runs) {
    const runStart = run.offsetInRun;
    const runEnd = run.offsetInRun + run.text.length;

    // Intersection of [runStart, runEnd] with [startOffset, endOffset].
    const overlapStart = Math.max(runStart, startOffset);
    const overlapEnd = Math.min(runEnd, endOffset);

    if (overlapStart >= overlapEnd && !(overlapStart === overlapEnd && run.text.length === 0)) {
      continue;
    }

    const runLen = run.text.length;
    const xStart =
      runLen > 0 ? run.leftPx + ((overlapStart - runStart) / runLen) * run.widthPx : run.leftPx;
    const xEnd =
      runLen > 0
        ? run.leftPx + ((overlapEnd - runStart) / runLen) * run.widthPx
        : run.leftPx + run.widthPx;

    selLeft = Math.min(selLeft, xStart);
    selRight = Math.max(selRight, xEnd);
  }

  if (!isFinite(selLeft) || !isFinite(selRight) || selRight <= selLeft) {
    return undefined;
  }

  return {
    topPx: line.topPx,
    leftPx: selLeft,
    widthPx: selRight - selLeft,
    heightPx: line.heightPx,
  };
}

/**
 * Renders translucent selection highlight rectangles over the document pages.
 * Each rect is positioned absolutely within its parent page container.
 */
export const SelectionOverlay: React.FC<SelectionOverlayProps> = ({ range, pages }) => {
  const rects = resolveSelectionRects(range, pages);
  if (rects.length === 0) return null;

  return (
    <>
      {rects.map((r) => (
        <div
          key={r.key}
          className="sel-rect"
          aria-hidden="true"
          data-page-index={r.pageIndex}
          style={{
            top: r.topPx,
            left: r.leftPx,
            width: r.widthPx,
            height: r.heightPx,
          }}
        />
      ))}
    </>
  );
};
