import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';
import type { PageLayout } from '@word/layout';
import { useHitTest } from './use-hit-test.js';

// ---------------------------------------------------------------------------
// Fixtures

function makePage(index: number): PageLayout {
  return {
    index,
    sizePx: { widthPx: 816, heightPx: 1056 },
    marginsPx: { top: 96, bottom: 96, left: 96, right: 96 },
    contentTopPx: 96,
    contentLeftPx: 96,
    lines: [
      {
        paragraphId: 'para-0',
        lineIndex: 0,
        topPx: 100,
        leftPx: 0,
        widthPx: 800,
        heightPx: 20,
        baselinePx: 116,
        runs: [
          {
            runId: 'run-0',
            text: 'Hello',
            leftPx: 0,
            widthPx: 50,
            props: { fontName: 'Arial', halfPoints: 24 },
            offsetInRun: 0,
          },
          {
            runId: 'run-1',
            text: ' World',
            leftPx: 50,
            widthPx: 60,
            props: { fontName: 'Arial', halfPoints: 24 },
            offsetInRun: 5,
          },
        ],
      },
    ],
  };
}

/**
 * Builds a container element that owns child page elements at the positions
 * the new DOM-rect hit-test logic will query.
 *
 * Layout: container fills (0,0,1000,2200).
 *   page 0: (100, 24, 816, 1056)    — centred with 24 px top padding
 *   page 1: (100, 1104, 816, 1056)  — 24 px gap below page 0
 */
function makeContainerWithPages(pages: readonly PageLayout[]): HTMLElement {
  const container = document.createElement('div');

  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 1000,
    bottom: 2200,
    width: 1000,
    height: 2200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });

  // Lay out pages: page N starts at top = 24 + N * (1056 + 24), left = 100.
  const PAGE_TOP_PADDING = 24;
  const PAGE_GAP = 24;
  const PAGE_LEFT = 100;

  pages.forEach((page, idx) => {
    const pageEl = document.createElement('div');
    pageEl.className = 'page';
    pageEl.dataset['pageIndex'] = String(idx);

    const top = PAGE_TOP_PADDING + idx * (page.sizePx.heightPx + PAGE_GAP);

    vi.spyOn(pageEl, 'getBoundingClientRect').mockReturnValue({
      left: PAGE_LEFT,
      top,
      right: PAGE_LEFT + page.sizePx.widthPx,
      bottom: top + page.sizePx.heightPx,
      width: page.sizePx.widthPx,
      height: page.sizePx.heightPx,
      x: PAGE_LEFT,
      y: top,
      toJSON: () => ({}),
    });

    container.appendChild(pageEl);
  });

  // querySelectorAll must return the child elements — jsdom supports this
  // natively so we don't need to stub it.

  return container;
}

// ---------------------------------------------------------------------------
// Tests

describe('useHitTest', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns undefined when containerRef is null', () => {
    const pages = [makePage(0)];
    const ref = React.createRef<HTMLElement | null>();
    const { result } = renderHook(() => useHitTest(pages, ref));

    const hit = result.current(100, 200);
    expect(hit).toBeUndefined();
  });

  it('returns undefined when click is outside all pages', () => {
    const pages = [makePage(0)];
    const container = makeContainerWithPages(pages);
    const ref = { current: container };

    const { result } = renderHook(() => useHitTest(pages, ref));

    // Far below page 0 (bottom = 24 + 1056 = 1080), so y=2000 misses.
    const hit = result.current(500, 2000);
    expect(hit).toBeUndefined();
  });

  it('returns undefined when click is to the left of page 0', () => {
    const pages = [makePage(0)];
    const container = makeContainerWithPages(pages);
    const ref = { current: container };

    const { result } = renderHook(() => useHitTest(pages, ref));

    // page 0 left = 100; click at x=50 misses.
    const hit = result.current(50, 100);
    expect(hit).toBeUndefined();
  });

  it('resolves a position inside the first run of page 0', () => {
    const pages = [makePage(0)];
    const container = makeContainerWithPages(pages);
    const ref = { current: container };

    const { result } = renderHook(() => useHitTest(pages, ref));

    // page 0: left=100, top=24.
    // Line topPx=100, so client y = 24 + 110 = 134 (inside the line).
    // run-0 spans localX [0, 50); click at localX=10 → inside run-0.
    // client x = 100 + 10 = 110.
    const hit = result.current(110, 134);

    expect(hit).toBeDefined();
    expect(hit!.leafId).toBe('para-0');
    expect(typeof hit!.offset).toBe('number');
    expect(hit!.offset).toBeGreaterThanOrEqual(0);
    expect(hit!.offset).toBeLessThanOrEqual(5);
  });

  it('resolves a position inside the second run of page 0', () => {
    const pages = [makePage(0)];
    const container = makeContainerWithPages(pages);
    const ref = { current: container };

    const { result } = renderHook(() => useHitTest(pages, ref));

    // run-1 spans localX [50, 110); click at localX=75 → inside run-1.
    // client x = 100 + 75 = 175; client y = 24 + 110 = 134.
    const hit = result.current(175, 134);

    expect(hit).toBeDefined();
    expect(hit!.leafId).toBe('para-0');
    // offsetInRun=5, text ' World' length=6; fraction=(75-50)/60≈0.42 → char≈2 → offset≈7
    expect(hit!.offset).toBeGreaterThanOrEqual(5);
    expect(hit!.offset).toBeLessThanOrEqual(11);
  });

  it('resolves a position inside page 1 when two pages are present', () => {
    const pages = [makePage(0), makePage(1)];
    const container = makeContainerWithPages(pages);
    const ref = { current: container };

    const { result } = renderHook(() => useHitTest(pages, ref));

    // page 1: top = 24 + 1*(1056+24) = 1104. Line topPx=100 → client y = 1104+110 = 1214.
    // client x = 100 + 10 = 110 (inside run-0).
    const hit = result.current(110, 1214);

    expect(hit).toBeDefined();
    expect(hit!.leafId).toBe('para-0');
  });

  it('returns undefined for a point between pages (in the gap)', () => {
    const pages = [makePage(0), makePage(1)];
    const container = makeContainerWithPages(pages);
    const ref = { current: container };

    const { result } = renderHook(() => useHitTest(pages, ref));

    // page 0 bottom = 24 + 1056 = 1080; page 1 top = 1104. Gap is [1080, 1104).
    // y=1090 is in the gap; x=110 would be within a page horizontally.
    const hit = result.current(110, 1090);
    expect(hit).toBeUndefined();
  });

  it('returns a stable function reference when pages reference does not change', () => {
    const pages = [makePage(0)];
    const container = makeContainerWithPages(pages);
    const ref = { current: container };

    const { result, rerender } = renderHook(
      ({ p }: { p: readonly PageLayout[] }) => useHitTest(p, ref),
      { initialProps: { p: pages } },
    );

    const fn1 = result.current;
    rerender({ p: pages });
    const fn2 = result.current;

    expect(fn1).toBe(fn2);
  });
});
