import type { IdPosition } from '@word/domain';
import type { PageLayout } from '@word/layout';
import React from 'react';

export interface CaretPosition {
  readonly leafId: string;
  readonly offset: number;
}

export interface CaretProps {
  readonly position: IdPosition;
  readonly pages: readonly PageLayout[];
}

interface ResolvedCaret {
  readonly pageIndex: number;
  readonly xPx: number;
  readonly topPx: number;
  readonly heightPx: number;
}

/**
 * Resolves the caret's visual coordinates from a logical position and the
 * current page layout.  Returns undefined when the position is not yet
 * laid out (e.g. during initial load).
 */
function resolveCaretPosition(
  position: IdPosition,
  pages: readonly PageLayout[],
): ResolvedCaret | undefined {
  for (let pi = 0; pi < pages.length; pi++) {
    const page = pages[pi];
    if (page === undefined) continue;
    for (const line of page.lines) {
      if (line.paragraphId !== position.leafId) continue;

      // Find the run that contains the logical offset.
      for (const run of line.runs) {
        const runEnd = run.offsetInRun + run.text.length;
        if (position.offset >= run.offsetInRun && position.offset <= runEnd) {
          // Approximate: place caret at run.leftPx + proportional x within run.
          const fraction =
            run.text.length > 0 ? (position.offset - run.offsetInRun) / run.text.length : 0;
          const xPx = run.leftPx + fraction * run.widthPx;
          return {
            pageIndex: pi,
            xPx,
            topPx: line.topPx,
            heightPx: line.heightPx,
          };
        }
      }

      // No run matched — caret is at start of line.
      return {
        pageIndex: pi,
        xPx: line.leftPx,
        topPx: line.topPx,
        heightPx: line.heightPx,
      };
    }
  }
  return undefined;
}

/**
 * Renders a 2-px blinking caret at the resolved visual position.
 * The blink animation is defined in styles.css via the `.caret` class.
 */
export const Caret: React.FC<CaretProps> = ({ position, pages }) => {
  const resolved = resolveCaretPosition(position, pages);
  if (resolved === undefined) return null;

  return (
    <div
      className="caret"
      aria-hidden="true"
      data-page-index={resolved.pageIndex}
      style={{
        top: resolved.topPx,
        left: resolved.xPx,
        height: resolved.heightPx,
      }}
    />
  );
};
