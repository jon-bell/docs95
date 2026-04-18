import { describe, expect, it } from 'vitest';
import { asNodeId } from '@word/domain';
import { paginate, type PageGeometry, type PaginateInput } from './paginate.js';
import type { ParaLine } from './break-lines.js';

const PAGE: PageGeometry = {
  widthPx: 816, // 8.5" × 96 dpi
  heightPx: 1056, // 11" × 96 dpi
  marginTopPx: 96,
  marginBottomPx: 96,
  marginLeftPx: 96,
  marginRightPx: 96,
};

// Content height = 1056 - 96 - 96 = 864 px.
const CONTENT_H = PAGE.heightPx - PAGE.marginTopPx - PAGE.marginBottomPx; // 864

const LINE_H = 23; // 20 px × 1.15

function makeLine(pageBreakAfter = false): ParaLine {
  return {
    runs: [],
    heightPx: LINE_H,
    ascentPx: 16,
    pageBreakAfter,
  };
}

function makeInput(paraId: string, count: number): PaginateInput {
  return {
    paragraphId: asNodeId(paraId),
    lines: Array.from({ length: count }, () => makeLine()),
  };
}

describe('paginate', () => {
  it('puts floor(contentHeight / lineHeight) lines on the first page', () => {
    const linesPerPage = Math.floor(CONTENT_H / LINE_H); // 37
    const input = makeInput('p1', linesPerPage + 10); // spans two pages
    const pages = paginate([input], PAGE);
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(pages[0]?.lines.length).toBe(linesPerPage);
    expect(pages[1]?.lines.length).toBe(10);
  });

  it('keeps all lines on one page when they fit', () => {
    const linesPerPage = Math.floor(CONTENT_H / LINE_H);
    const input = makeInput('p1', linesPerPage);
    const pages = paginate([input], PAGE);
    // All lines fit on one page; the paginator emits only that one page.
    expect(pages).toHaveLength(1);
    expect(pages[0]?.lines.length).toBe(linesPerPage);
  });

  it('always emits at least one page even for empty input', () => {
    const pages = paginate([], PAGE);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.lines).toHaveLength(0);
  });

  it('assigns correct page index values', () => {
    const linesPerPage = Math.floor(CONTENT_H / LINE_H);
    const input = makeInput('p1', linesPerPage * 3);
    const pages = paginate([input], PAGE);
    pages.forEach((p, i) => {
      expect(p.index).toBe(i);
    });
  });

  it('respects pageBreakAfter on a line', () => {
    const lines: ParaLine[] = [makeLine(false), makeLine(true), makeLine(false)];
    const input: PaginateInput = { paragraphId: asNodeId('p1'), lines };
    const pages = paginate([input], PAGE);
    // The page break forces a new page after line 2.
    // Page 0: lines 0 and 1; Page 1: line 2; Page 2: empty final.
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(pages[0]?.lines.length).toBe(2);
  });

  it('sets correct margin values on each page', () => {
    const pages = paginate([makeInput('p1', 1)], PAGE);
    const p = pages[0];
    expect(p?.marginsPx.top).toBe(PAGE.marginTopPx);
    expect(p?.marginsPx.left).toBe(PAGE.marginLeftPx);
    expect(p?.contentTopPx).toBe(PAGE.marginTopPx);
    expect(p?.contentLeftPx).toBe(PAGE.marginLeftPx);
  });
});
