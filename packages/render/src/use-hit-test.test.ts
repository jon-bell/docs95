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

function makeContainerEl(
  opts: {
    left?: number;
    top?: number;
    width?: number;
    height?: number;
    scrollLeft?: number;
    scrollTop?: number;
  } = {},
): HTMLElement {
  const el = document.createElement('div');
  const { left = 0, top = 0, width = 1200, height = 900, scrollLeft = 0, scrollTop = 0 } = opts;

  el.scrollLeft = scrollLeft;
  el.scrollTop = scrollTop;

  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  });

  return el;
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
    const el = makeContainerEl();
    // Use a mutable ref
    const ref = { current: el };

    const { result } = renderHook(() => useHitTest(pages, ref));
    // Click far below all pages (past 1056 + 24 + 24)
    const hit = result.current(0, 2000);
    expect(hit).toBeUndefined();
  });

  it('resolves a position inside the first run', () => {
    const pages = [makePage(0)];
    const el = makeContainerEl({ left: 0, top: 0, width: 1200, height: 900 });
    const ref = { current: el };

    const { result } = renderHook(() => useHitTest(pages, ref));

    // The page is centered: pageLeft = (1200 - 816) / 2 = 192
    // Click at x=192+10=202, which maps to localX=10 (inside run-0 which spans [0,50])
    // Line topPx=100, so y inside page = 110 (lineTop=100, click y = 24+110=134)
    const pageLeft = (1200 - 816) / 2;
    const hit = result.current(pageLeft + 10, 24 + 110);

    expect(hit).toBeDefined();
    expect(hit!.leafId).toBe('para-0');
    expect(typeof hit!.offset).toBe('number');
  });

  it('resolves a position inside the second run', () => {
    const pages = [makePage(0)];
    const el = makeContainerEl({ left: 0, top: 0, width: 1200, height: 900 });
    const ref = { current: el };

    const { result } = renderHook(() => useHitTest(pages, ref));

    const pageLeft = (1200 - 816) / 2;
    // run-1 spans [50, 110], click at localX=75 → inside run-1
    const hit = result.current(pageLeft + 75, 24 + 110);

    expect(hit).toBeDefined();
    expect(hit!.leafId).toBe('para-0');
    // offsetInRun=5, text length 6, fraction ≈ (75-50)/60 ≈ 0.42 → char ≈ 2 → offset ≈ 7
    expect(hit!.offset).toBeGreaterThanOrEqual(5);
    expect(hit!.offset).toBeLessThanOrEqual(11);
  });

  it('accounts for container scroll offset', () => {
    const pages = [makePage(0)];
    const el = makeContainerEl({
      left: 0,
      top: 0,
      width: 1200,
      height: 900,
      scrollLeft: 0,
      scrollTop: 200,
    });
    const ref = { current: el };

    const { result } = renderHook(() => useHitTest(pages, ref));

    // With scrollTop=200, clicking at client y=0 means content y = 0-0+200 = 200
    // The page starts at y=24 within scroll content, so localY = 200-24 = 176
    // Line is at topPx=100, which is within the page (heightPx=1056)
    const pageLeft = (1200 - 816) / 2;
    const hit = result.current(pageLeft + 10, 0);

    // localY = 200 − inside page body, so should find the line
    expect(hit).toBeDefined();
  });

  it('returns a stable function reference when pages reference does not change', () => {
    const pages = [makePage(0)];
    const el = makeContainerEl();
    const ref = { current: el };

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
