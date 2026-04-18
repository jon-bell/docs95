import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import type { PageLayout } from '@word/layout';
import { Caret } from './caret.js';

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
        leftPx: 96,
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

describe('Caret', () => {
  it('renders nothing when position is not in any page', () => {
    const { container } = render(
      <Caret position={{ leafId: 'unknown-para', offset: 0 }} pages={[makePage(0)]} />,
    );
    expect(container.querySelector('.caret')).toBeNull();
  });

  it('renders a .caret element when position is resolved', () => {
    const { container } = render(
      <Caret position={{ leafId: 'para-0', offset: 0 }} pages={[makePage(0)]} />,
    );
    const caret = container.querySelector('.caret');
    expect(caret).not.toBeNull();
  });

  it('positions caret at the line top with correct height', () => {
    const { container } = render(
      <Caret position={{ leafId: 'para-0', offset: 0 }} pages={[makePage(0)]} />,
    );
    const caret = container.querySelector('.caret') as HTMLElement;
    expect(caret.style.top).toBe('100px');
    expect(caret.style.height).toBe('20px');
  });

  it('positions caret at run start (offset 0) at run.leftPx', () => {
    const { container } = render(
      <Caret position={{ leafId: 'para-0', offset: 0 }} pages={[makePage(0)]} />,
    );
    const caret = container.querySelector('.caret') as HTMLElement;
    // offset 0 → fraction 0 → xPx = run.leftPx = 0
    expect(caret.style.left).toBe('0px');
  });

  it('positions caret at end of run (offset = text.length)', () => {
    const { container } = render(
      // 'Hello World' has 11 characters; offset 11 → fraction 1 → xPx = leftPx + widthPx = 110
      <Caret position={{ leafId: 'para-0', offset: 11 }} pages={[makePage(0)]} />,
    );
    const caret = container.querySelector('.caret') as HTMLElement;
    expect(caret.style.left).toBe('110px');
  });

  it('positions caret at midpoint for offset in middle of run', () => {
    // text = 'Hello World' (11 chars), widthPx = 110
    // offset 5 (mid) → fraction 5/11 → left = 5/11 * 110 ≈ 50px
    const { container } = render(
      <Caret position={{ leafId: 'para-0', offset: 5 }} pages={[makePage(0)]} />,
    );
    const caret = container.querySelector('.caret') as HTMLElement;
    const leftPx = parseFloat(caret.style.left);
    expect(leftPx).toBeCloseTo(50, 0);
  });

  it('has aria-hidden="true"', () => {
    const { container } = render(
      <Caret position={{ leafId: 'para-0', offset: 0 }} pages={[makePage(0)]} />,
    );
    const caret = container.querySelector('.caret');
    expect(caret!.getAttribute('aria-hidden')).toBe('true');
  });

  it('marks the correct page index on the caret element', () => {
    const { container } = render(
      <Caret position={{ leafId: 'para-0', offset: 0 }} pages={[makePage(0)]} />,
    );
    const caret = container.querySelector('.caret');
    expect(caret!.getAttribute('data-page-index')).toBe('0');
  });
});
