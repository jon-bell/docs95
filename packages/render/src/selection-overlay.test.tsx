import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import type { PageLayout } from '@word/layout';
import { SelectionOverlay } from './selection-overlay.js';

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
        widthPx: 500,
        heightPx: 20,
        baselinePx: 116,
        runs: [
          {
            runId: 'run-0',
            text: 'Hello World',
            leftPx: 0,
            widthPx: 110,
            props: { fontName: 'Arial', halfPoints: 24 },
            offsetInRun: 0,
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests

describe('SelectionOverlay', () => {
  it('renders nothing when range does not intersect any page', () => {
    const { container } = render(
      <SelectionOverlay
        range={{
          anchor: { leafId: 'missing', offset: 0 },
          focus: { leafId: 'missing', offset: 5 },
        }}
        pages={[makePage(0)]}
      />,
    );
    expect(container.querySelectorAll('.sel-rect')).toHaveLength(0);
  });

  it('renders nothing for a collapsed range (same offset)', () => {
    const { container } = render(
      <SelectionOverlay
        range={{ anchor: { leafId: 'para-0', offset: 3 }, focus: { leafId: 'para-0', offset: 3 } }}
        pages={[makePage(0)]}
      />,
    );
    expect(container.querySelectorAll('.sel-rect')).toHaveLength(0);
  });

  it('renders a sel-rect for a selection within a run', () => {
    const { container } = render(
      <SelectionOverlay
        range={{ anchor: { leafId: 'para-0', offset: 0 }, focus: { leafId: 'para-0', offset: 5 } }}
        pages={[makePage(0)]}
      />,
    );
    const rects = container.querySelectorAll('.sel-rect');
    expect(rects.length).toBeGreaterThan(0);
  });

  it('positions sel-rect at correct top and height', () => {
    const { container } = render(
      <SelectionOverlay
        range={{ anchor: { leafId: 'para-0', offset: 0 }, focus: { leafId: 'para-0', offset: 11 } }}
        pages={[makePage(0)]}
      />,
    );
    const rect = container.querySelector('.sel-rect') as HTMLElement;
    expect(rect.style.top).toBe('100px');
    expect(rect.style.height).toBe('20px');
  });

  it('sel-rect covers full run for full run selection', () => {
    const { container } = render(
      <SelectionOverlay
        range={{ anchor: { leafId: 'para-0', offset: 0 }, focus: { leafId: 'para-0', offset: 11 } }}
        pages={[makePage(0)]}
      />,
    );
    const rect = container.querySelector('.sel-rect') as HTMLElement;
    // run goes from 0 to 110px; selection covers all of it
    expect(parseFloat(rect.style.left)).toBeCloseTo(0, 0);
    expect(parseFloat(rect.style.width)).toBeCloseTo(110, 0);
  });

  it('has aria-hidden="true" on sel-rect elements', () => {
    const { container } = render(
      <SelectionOverlay
        range={{ anchor: { leafId: 'para-0', offset: 0 }, focus: { leafId: 'para-0', offset: 5 } }}
        pages={[makePage(0)]}
      />,
    );
    const rect = container.querySelector('.sel-rect');
    expect(rect!.getAttribute('aria-hidden')).toBe('true');
  });

  it('works with anchor and focus reversed (focus < anchor)', () => {
    const { container } = render(
      <SelectionOverlay
        range={{ anchor: { leafId: 'para-0', offset: 5 }, focus: { leafId: 'para-0', offset: 0 } }}
        pages={[makePage(0)]}
      />,
    );
    const rects = container.querySelectorAll('.sel-rect');
    expect(rects.length).toBeGreaterThan(0);
  });
});
