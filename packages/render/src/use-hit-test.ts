import type { IdPosition } from '@word/domain';
import type { PageLayout } from '@word/layout';
import React from 'react';

export type HitTestFn = (clientX: number, clientY: number) => IdPosition | undefined;

/**
 * Returns a stable hit-test function that maps viewport coordinates to a
 * logical document position.
 *
 * The function accounts for container scroll and bounding rect so the caller
 * passes raw pointer clientX/clientY values.
 */
export function useHitTest(
  pages: readonly PageLayout[],
  containerRef: React.RefObject<HTMLElement | null>,
): HitTestFn {
  // Capture pages in a ref so the returned function always sees the latest
  // layout without needing to be recreated on every render.
  const pagesRef = React.useRef(pages);
  pagesRef.current = pages;

  return React.useCallback(
    (clientX: number, clientY: number): IdPosition | undefined => {
      const container = containerRef.current;
      if (container === null || container === undefined) return undefined;

      const rect = container.getBoundingClientRect();
      const scrollLeft = container.scrollLeft;
      const scrollTop = container.scrollTop;

      // Convert from viewport coords to container-content coords.
      const contentX = clientX - rect.left + scrollLeft;
      const contentY = clientY - rect.top + scrollTop;

      const currentPages = pagesRef.current;

      // Find the page containing the point. Pages are laid out vertically with
      // a fixed gap; we walk them to find the one whose bounding box contains y.
      // PageHost renders pages at natural vertical flow — we accumulate their
      // heights to find each page's top offset within the scroll container.
      // For the MVP, we assume a 24px top padding and 24px inter-page gap
      // matching styles.css — the layout engine owns actual pixel offsets.
      const PAGE_PADDING = 24;
      const PAGE_GAP = 24;
      let accumulatedY = PAGE_PADDING;

      for (let pi = 0; pi < currentPages.length; pi++) {
        const page = currentPages[pi];
        if (page === undefined) continue;

        const pageTop = accumulatedY;
        const pageBottom = pageTop + page.sizePx.heightPx;

        // Center pages horizontally within the container.
        const containerWidth = rect.width + scrollLeft;
        const pageLeft = Math.max(0, (containerWidth - page.sizePx.widthPx) / 2);
        const pageRight = pageLeft + page.sizePx.widthPx;

        if (
          contentY >= pageTop &&
          contentY < pageBottom &&
          contentX >= pageLeft &&
          contentX < pageRight
        ) {
          const localX = contentX - pageLeft;
          const localY = contentY - pageTop;
          return hitTestPage(page, localX, localY);
        }

        accumulatedY = pageBottom + PAGE_GAP;
      }

      return undefined;
    },
    // containerRef is stable; callback only needs to close over it.
    [containerRef],
  );
}

function hitTestPage(page: PageLayout, localX: number, localY: number): IdPosition | undefined {
  // Binary-search lines by top Y within the page.
  const lines = page.lines;
  if (lines.length === 0) return undefined;

  let lo = 0;
  let hi = lines.length - 1;

  // Find the last line whose topPx <= localY.
  let bestLine = lines[0];
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const line = lines[mid];
    if (line === undefined) break;
    if (line.topPx <= localY) {
      bestLine = line;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (bestLine === undefined) return undefined;

  // Scan runs within the line for the x position.
  const runs = bestLine.runs;
  for (let ri = 0; ri < runs.length; ri++) {
    const run = runs[ri];
    if (run === undefined) continue;
    const runRight = run.leftPx + run.widthPx;

    if (localX >= run.leftPx && localX < runRight) {
      // Within this run: bisect to find offset.
      const fraction = run.widthPx > 0 ? (localX - run.leftPx) / run.widthPx : 0;
      const charOffset = Math.round(fraction * run.text.length);
      return {
        leafId: bestLine.paragraphId,
        offset: run.offsetInRun + Math.min(charOffset, run.text.length),
      };
    }
  }

  // x is past all runs — return end of line.
  const lastRun = runs[runs.length - 1];
  if (lastRun !== undefined) {
    return {
      leafId: bestLine.paragraphId,
      offset: lastRun.offsetInRun + lastRun.text.length,
    };
  }

  return { leafId: bestLine.paragraphId, offset: 0 };
}
