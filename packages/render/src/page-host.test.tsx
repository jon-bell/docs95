import { afterEach, describe, it, expect } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import React from 'react';
import type { PageLayout, LineRun } from '@word/layout';
import type { RunProps } from '@word/domain';
import { PageHost } from './page-host.js';

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Fixtures

type LineRunWithFormatting = LineRun & { readonly resolvedRunProps?: RunProps };

function makeRun(
  index: number,
  text = 'hello',
  resolvedRunProps?: RunProps,
): LineRunWithFormatting {
  return {
    runId: `run-${index}`,
    text,
    leftPx: 0,
    widthPx: 60,
    props: { fontName: 'Arial', halfPoints: 24 },
    offsetInRun: 0,
    ...(resolvedRunProps !== undefined ? { resolvedRunProps } : {}),
  };
}

function makePage(
  index: number,
  text = 'hello',
  resolvedRunProps?: RunProps,
  marker?: { text: string; widthPx: number },
): PageLayout {
  return {
    index,
    sizePx: { widthPx: 816, heightPx: 1056 },
    marginsPx: { top: 96, bottom: 96, left: 96, right: 96 },
    contentTopPx: 96,
    contentLeftPx: 96,
    lines: [
      {
        paragraphId: `para-${index}`,
        lineIndex: 0,
        topPx: 96,
        leftPx: 96,
        widthPx: 624,
        heightPx: 20,
        baselinePx: 96 + 16,
        runs: [makeRun(index, text, resolvedRunProps)],
        ...(marker !== undefined ? { marker } : {}),
      } as PageLayout['lines'][number],
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests

describe('PageHost', () => {
  it('renders a data-page-index element for each page', () => {
    const { container } = render(<PageHost pages={[makePage(0), makePage(1)]} />);
    const pageEls = container.querySelectorAll('[data-page-index]');
    expect(pageEls).toHaveLength(2);
    expect(pageEls[0]!.getAttribute('data-page-index')).toBe('0');
    expect(pageEls[1]!.getAttribute('data-page-index')).toBe('1');
  });

  it('renders the correct text in each page', () => {
    render(<PageHost pages={[makePage(0, 'first page text'), makePage(1, 'second page text')]} />);
    expect(screen.getByText('first page text')).toBeTruthy();
    expect(screen.getByText('second page text')).toBeTruthy();
  });

  it('renders a scrolling container with role="document"', () => {
    const { container } = render(<PageHost pages={[makePage(0)]} />);
    const docEl = container.querySelector('[role="document"]');
    expect(docEl).not.toBeNull();
    expect(docEl!.classList.contains('page-host')).toBe(true);
    expect(Number((docEl as HTMLElement).tabIndex)).toBe(0);
  });

  it('renders pages with role="region" and correct aria-label', () => {
    const { container } = render(<PageHost pages={[makePage(0), makePage(1)]} />);
    const regions = container.querySelectorAll('[role="region"]');
    expect(regions).toHaveLength(2);
    expect(regions[0]!.getAttribute('aria-label')).toBe('Page 1');
    expect(regions[1]!.getAttribute('aria-label')).toBe('Page 2');
  });

  it('renders inline width/height styles on page divs', () => {
    const { container } = render(<PageHost pages={[makePage(0)]} />);
    const pageEl = container.querySelector('[data-page-index="0"]') as HTMLElement;
    expect(pageEl.style.width).toBe('816px');
    expect(pageEl.style.height).toBe('1056px');
  });

  it('renders absolutely positioned line divs with .line class', () => {
    const { container } = render(<PageHost pages={[makePage(0)]} />);
    const lineEl = container.querySelector('.line') as HTMLElement;
    expect(lineEl).not.toBeNull();
    expect(lineEl.style.top).toBe('96px');
    expect(lineEl.style.left).toBe('96px');
  });

  it('renders run spans with data-run-id attribute', () => {
    const { container } = render(<PageHost pages={[makePage(0)]} />);
    const runEl = container.querySelector('[data-run-id]');
    expect(runEl).not.toBeNull();
    expect(runEl!.getAttribute('data-run-id')).toBe('run-0');
  });

  it('handles empty pages array', () => {
    const { container } = render(<PageHost pages={[]} />);
    expect(container.querySelectorAll('[data-page-index]')).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Formatting tests

  it('applies font-weight: 700 for a bold run', () => {
    const { container } = render(
      <PageHost pages={[makePage(0, 'bold text', { bold: true, halfPoints: 24 })]} />,
    );
    const runEl = container.querySelector('[data-run-id="run-0"]') as HTMLElement;
    expect(runEl.style.fontWeight).toBe('700');
  });

  it('applies font-weight: 400 for a non-bold run', () => {
    const { container } = render(
      <PageHost pages={[makePage(0, 'normal text', { bold: false, halfPoints: 24 })]} />,
    );
    const runEl = container.querySelector('[data-run-id="run-0"]') as HTMLElement;
    expect(runEl.style.fontWeight).toBe('400');
  });

  it('applies font-style: italic for an italic run', () => {
    const { container } = render(
      <PageHost pages={[makePage(0, 'italic text', { italic: true, halfPoints: 24 })]} />,
    );
    const runEl = container.querySelector('[data-run-id="run-0"]') as HTMLElement;
    expect(runEl.style.fontStyle).toBe('italic');
  });

  it('applies text-decoration-line: underline for an underline run', () => {
    const { container } = render(
      <PageHost pages={[makePage(0, 'underlined', { underline: 'single', halfPoints: 24 })]} />,
    );
    const runEl = container.querySelector('[data-run-id="run-0"]') as HTMLElement;
    expect(runEl.style.textDecorationLine).toBe('underline');
  });

  it('applies text-decoration-line: line-through for a struck run', () => {
    const { container } = render(
      <PageHost pages={[makePage(0, 'struck text', { strike: true, halfPoints: 24 })]} />,
    );
    const runEl = container.querySelector('[data-run-id="run-0"]') as HTMLElement;
    expect(runEl.style.textDecorationLine).toBe('line-through');
  });

  it('applies both underline and line-through when both are set', () => {
    const { container } = render(
      <PageHost
        pages={[makePage(0, 'both', { underline: 'single', strike: true, halfPoints: 24 })]}
      />,
    );
    const runEl = container.querySelector('[data-run-id="run-0"]') as HTMLElement;
    expect(runEl.style.textDecorationLine).toBe('underline line-through');
  });

  it('applies color: #ff0000 for an rgb color run', () => {
    const { container } = render(
      <PageHost
        pages={[
          makePage(0, 'red text', { color: { kind: 'rgb', value: 'ff0000' }, halfPoints: 24 }),
        ]}
      />,
    );
    const runEl = container.querySelector('[data-run-id="run-0"]') as HTMLElement;
    // jsdom normalises #ff0000 → rgb(255, 0, 0)
    expect(runEl.style.color).toMatch(/rgb\(255,\s*0,\s*0\)|#ff0000/i);
  });

  it('applies currentColor for auto color', () => {
    const { container } = render(
      <PageHost pages={[makePage(0, 'auto color', { color: { kind: 'auto' }, halfPoints: 24 })]} />,
    );
    const runEl = container.querySelector('[data-run-id="run-0"]') as HTMLElement;
    expect(runEl.style.color).toBe('currentcolor');
  });

  it('applies font-size based on halfPoints', () => {
    const { container } = render(
      <PageHost pages={[makePage(0, 'sized text', { halfPoints: 48 })]} />,
    );
    const runEl = container.querySelector('[data-run-id="run-0"]') as HTMLElement;
    expect(runEl.style.fontSize).toBe('24pt');
  });

  it('applies text-transform: uppercase for caps', () => {
    const { container } = render(
      <PageHost pages={[makePage(0, 'caps text', { caps: true, halfPoints: 24 })]} />,
    );
    const runEl = container.querySelector('[data-run-id="run-0"]') as HTMLElement;
    expect(runEl.style.textTransform).toBe('uppercase');
  });

  it('renders text as uppercase visually when caps is true', () => {
    render(<PageHost pages={[makePage(0, 'hello', { caps: true, halfPoints: 24 })]} />);
    expect(screen.getByText('HELLO')).toBeTruthy();
  });

  it('applies font-variant-caps: small-caps for smallCaps', () => {
    const { container } = render(
      <PageHost pages={[makePage(0, 'small caps', { smallCaps: true, halfPoints: 24 })]} />,
    );
    const runEl = container.querySelector('[data-run-id="run-0"]') as HTMLElement;
    expect(runEl.style.fontVariantCaps).toBe('small-caps');
  });

  it('applies vertical-align: super for superscript', () => {
    const { container } = render(
      <PageHost pages={[makePage(0, 'super', { verticalAlign: 'superscript', halfPoints: 24 })]} />,
    );
    const runEl = container.querySelector('[data-run-id="run-0"]') as HTMLElement;
    expect(runEl.style.verticalAlign).toBe('super');
  });

  it('applies vertical-align: sub for subscript', () => {
    const { container } = render(
      <PageHost pages={[makePage(0, 'sub', { verticalAlign: 'subscript', halfPoints: 24 })]} />,
    );
    const runEl = container.querySelector('[data-run-id="run-0"]') as HTMLElement;
    expect(runEl.style.verticalAlign).toBe('sub');
  });

  it('applies background color for highlight', () => {
    const { container } = render(
      <PageHost pages={[makePage(0, 'highlighted', { highlight: 'yellow', halfPoints: 24 })]} />,
    );
    const runEl = container.querySelector('[data-run-id="run-0"]') as HTMLElement;
    // jsdom normalises #ffff00 → rgb(255, 255, 0)
    expect(runEl.style.backgroundColor).toMatch(/rgb\(255,\s*255,\s*0\)|#ffff00/i);
  });

  it('applies text-decoration-style: double for double underline', () => {
    const { container } = render(
      <PageHost pages={[makePage(0, 'double', { underline: 'double', halfPoints: 24 })]} />,
    );
    const runEl = container.querySelector('[data-run-id="run-0"]') as HTMLElement;
    expect(runEl.style.textDecorationStyle).toBe('double');
  });

  it('applies text-decoration-style: wavy for wave underline', () => {
    const { container } = render(
      <PageHost pages={[makePage(0, 'wavy', { underline: 'wave', halfPoints: 24 })]} />,
    );
    const runEl = container.querySelector('[data-run-id="run-0"]') as HTMLElement;
    expect(runEl.style.textDecorationStyle).toBe('wavy');
  });

  it('does not apply formatting styles when resolvedRunProps is absent', () => {
    const { container } = render(<PageHost pages={[makePage(0, 'plain')]} />);
    const runEl = container.querySelector('[data-run-id="run-0"]') as HTMLElement;
    // No resolvedRunProps → no explicit font-style from formatting
    expect(runEl.style.fontStyle).toBe('');
  });

  // ---------------------------------------------------------------------------
  // List marker tests

  it('renders a list marker before runs when marker is present', () => {
    const { container } = render(
      <PageHost pages={[makePage(0, 'item', undefined, { text: '1.', widthPx: 20 })]} />,
    );
    const markerEl = container.querySelector('.list-marker');
    expect(markerEl).not.toBeNull();
    expect(markerEl!.textContent).toBe('1.');
    // Marker must appear before the run span in the DOM
    const line = container.querySelector('.line')!;
    const children = Array.from(line.children);
    const markerIdx = children.findIndex((el) => el.classList.contains('list-marker'));
    const runIdx = children.findIndex((el) => el.classList.contains('run'));
    expect(markerIdx).toBeLessThan(runIdx);
  });

  it('does not render a list marker when marker is absent', () => {
    const { container } = render(<PageHost pages={[makePage(0, 'no marker')]} />);
    expect(container.querySelector('.list-marker')).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Varying font size — line height scales

  it('applies different font sizes to runs in the same line', () => {
    const smallRun: LineRunWithFormatting = {
      runId: 'run-small',
      text: 'small',
      leftPx: 0,
      widthPx: 40,
      props: { fontName: 'Arial', halfPoints: 20 },
      offsetInRun: 0,
      resolvedRunProps: { halfPoints: 20 },
    };
    const largeRun: LineRunWithFormatting = {
      runId: 'run-large',
      text: 'large',
      leftPx: 40,
      widthPx: 80,
      props: { fontName: 'Arial', halfPoints: 48 },
      offsetInRun: 0,
      resolvedRunProps: { halfPoints: 48 },
    };
    const multiPage: PageLayout = {
      index: 0,
      sizePx: { widthPx: 816, heightPx: 1056 },
      marginsPx: { top: 96, bottom: 96, left: 96, right: 96 },
      contentTopPx: 96,
      contentLeftPx: 96,
      lines: [
        {
          paragraphId: 'para-multi',
          lineIndex: 0,
          topPx: 96,
          leftPx: 96,
          widthPx: 624,
          heightPx: 48,
          baselinePx: 96 + 40,
          runs: [smallRun, largeRun],
        },
      ],
    };
    const { container } = render(<PageHost pages={[multiPage]} />);
    const smallEl = container.querySelector('[data-run-id="run-small"]') as HTMLElement;
    const largeEl = container.querySelector('[data-run-id="run-large"]') as HTMLElement;
    expect(smallEl.style.fontSize).toBe('10pt');
    expect(largeEl.style.fontSize).toBe('24pt');
  });
});
