import type { IdPosition } from '@word/domain';
import type { PageLayout } from '@word/layout';
import React from 'react';

export type HitTestFn = (clientX: number, clientY: number) => IdPosition | undefined;

/**
 * Returns a stable hit-test function that maps viewport coordinates to a
 * logical document position.
 *
 * The function reads each page's rendered position from the DOM via
 * getBoundingClientRect() on the [data-page-index] elements inside the
 * container. This is robust to any CSS layout — flex, grid, zoom, retina
 * DPR, OS scrollbar behaviour — because clientX/clientY and
 * getBoundingClientRect() live in the same CSS-pixel coordinate space.
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

      const currentPages = pagesRef.current;

      // Query rendered page elements by their data attribute. PageHost sets
      // data-page-index on each <div class="page"> so we can look them up here
      // without coupling hit-test logic to any CSS layout assumptions.
      const pageElements = container.querySelectorAll<HTMLElement>('.page[data-page-index]');

      for (let i = 0; i < pageElements.length; i++) {
        const el = pageElements[i];
        if (el === undefined || el === null) continue;

        const rect = el.getBoundingClientRect();

        if (
          clientX >= rect.left &&
          clientX < rect.right &&
          clientY >= rect.top &&
          clientY < rect.bottom
        ) {
          const idx = Number(el.dataset['pageIndex']);
          const page = currentPages[idx];
          if (page === undefined) return undefined;

          // Convert from viewport coords to page-local coords.
          return hitTestPage(page, clientX - rect.left, clientY - rect.top);
        }
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
