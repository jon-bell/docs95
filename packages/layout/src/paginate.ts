// Pagination: accumulate paragraph lines into PageLayouts.
//
// Strategy: simple top-down bin-packing. Each line is added to the current
// page. When a line (or a page-break signal from the paragraph) doesn't fit in
// the remaining content height, we close the current page and start a new one.
//
// M1-C additions:
// - PaginateInput now carries per-paragraph formatting metadata so paginate()
//   can apply alignment offsets, paragraph spacing, and list markers.
// - Alignment: center/right adjust leftPx within content width; justify is
//   stored as-is but not spatially expanded (true Knuth-Plass justification
//   is a follow-up; the alignment field is correct for the render agent).
// - spacingBeforePx / spacingAfterPx add vertical gaps between paragraphs.
// - leftIndentPx / firstLineExtraPx shift lines horizontally.

import type { NodeId } from '@word/domain';
import type { LineBox, MeasureProps, PageLayout } from './index.js';
import type { ParaLine } from './break-lines.js';

export interface PaginateInput {
  readonly paragraphId: NodeId;
  readonly lines: readonly ParaLine[];
  /** Paragraph-level alignment applied to every LineBox. */
  readonly alignment?: 'left' | 'center' | 'right' | 'justify';
  /**
   * Vertical space injected before the first line of this paragraph (px).
   * Applied as a gap between the previous paragraph's last line and this one.
   */
  readonly spacingBeforePx?: number;
  /**
   * Vertical space injected after the last line of this paragraph (px).
   * Accumulated into yInPage so the next paragraph sees the gap.
   */
  readonly spacingAfterPx?: number;
  /**
   * Left indent applied to all lines in the paragraph (px, relative to
   * content-left). Does not affect widthPx — the caller already narrowed
   * availableWidthPx when breaking lines.
   */
  readonly leftIndentPx?: number;
  /**
   * Extra horizontal offset for the *first* line only (positive = further
   * right, i.e. a first-line indent). Negative values implement a hanging
   * indent where the first line sits to the *left* of subsequent lines.
   */
  readonly firstLineExtraPx?: number;
  /**
   * List marker emitted on the first line (lineIndex === 0).
   * Width is already accounted for in leftIndentPx by the caller.
   */
  readonly marker?: {
    readonly text: string;
    readonly props: MeasureProps;
    readonly widthPx: number;
  };
}

export interface PageGeometry {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly marginTopPx: number;
  readonly marginBottomPx: number;
  readonly marginLeftPx: number;
  readonly marginRightPx: number;
}

function contentHeight(page: PageGeometry): number {
  return page.heightPx - page.marginTopPx - page.marginBottomPx;
}

function contentWidth(page: PageGeometry): number {
  return page.widthPx - page.marginLeftPx - page.marginRightPx;
}

/**
 * Compute the content-relative leftPx for a line given its alignment and
 * actual text width.
 *
 * For justify we store left alignment and let the render agent expand
 * inter-word spaces — true justification requires glyph-level metrics that
 * belong in the render pipeline, not the paginator.
 */
function alignedLeftPx(
  alignment: 'left' | 'center' | 'right' | 'justify',
  lineTextWidthPx: number,
  availableWidthPx: number,
  indentLeftPx: number,
): number {
  const innerWidth = availableWidthPx - indentLeftPx;
  switch (alignment) {
    case 'center': {
      const slack = Math.max(0, innerWidth - lineTextWidthPx);
      return indentLeftPx + slack / 2;
    }
    case 'right': {
      const slack = Math.max(0, innerWidth - lineTextWidthPx);
      return indentLeftPx + slack;
    }
    case 'left':
    case 'justify':
      // justify: correct field value; spatial expansion is a render-agent concern.
      return indentLeftPx;
  }
}

/**
 * Convert a sequence of (paragraphId, lines[]) pairs into an array of pages.
 *
 * Each returned `PageLayout` has its `lines` already positioned with absolute
 * page-relative coordinates.
 */
export function paginate(
  paragraphLines: readonly PaginateInput[],
  page: PageGeometry,
): readonly PageLayout[] {
  const pages: PageLayout[] = [];
  let pageIndex = 0;
  let currentLines: LineBox[] = [];
  let yInPage = 0; // px from content-top
  let pendingSpacingAfterPx = 0; // carried from the previous paragraph

  const contentH = contentHeight(page);
  const contentW = contentWidth(page);

  function newPage(): void {
    pages.push(buildPage(pageIndex, page, currentLines));
    pageIndex++;
    currentLines = [];
    yInPage = 0;
    pendingSpacingAfterPx = 0;
  }

  for (const paraInput of paragraphLines) {
    const {
      paragraphId,
      lines,
      alignment = 'left',
      spacingBeforePx = 0,
      spacingAfterPx = 0,
      leftIndentPx = 0,
      firstLineExtraPx = 0,
      marker,
    } = paraInput;

    // Apply spacing-before after spacing-after of the previous paragraph.
    // The effective gap is max(spacingAfter, spacingBefore) — Word collapses
    // adjacent paragraph spacing (not a simple sum).
    const paraSpacingBefore = Math.max(pendingSpacingAfterPx, spacingBeforePx);
    pendingSpacingAfterPx = spacingAfterPx;

    let lineIndexInPara = 0;
    let firstLineInPara = true;

    for (const paraLine of lines) {
      const lineH = paraLine.heightPx;

      // Inject vertical spacing before the first line of this paragraph.
      if (firstLineInPara && paraSpacingBefore > 0 && currentLines.length > 0) {
        yInPage += paraSpacingBefore;
      }
      firstLineInPara = false;

      // If this line does not fit and the page is not empty, break to next page.
      // If the page is empty we emit it anyway (oversized line handled gracefully).
      if (yInPage + lineH > contentH && currentLines.length > 0) {
        newPage();
      }

      // Compute the horizontal position of this line.
      const isFirstLine = lineIndexInPara === 0;
      const lineIndent = isFirstLine ? leftIndentPx + firstLineExtraPx : leftIndentPx;

      // Sum the actual rendered text width to compute alignment offset.
      const lineTextWidth = paraLine.runs.reduce((sum, r) => sum + r.widthPx, 0);
      const lineFinalLeft = alignedLeftPx(alignment, lineTextWidth, contentW, lineIndent);

      const lineBox: LineBox = {
        paragraphId,
        lineIndex: lineIndexInPara,
        topPx: yInPage,
        leftPx: lineFinalLeft,
        widthPx: contentW - lineIndent,
        heightPx: lineH,
        baselinePx: yInPage + paraLine.ascentPx,
        runs: paraLine.runs,
        alignment,
        // Attach the marker only to the first line of the paragraph.
        ...(isFirstLine && marker !== undefined ? { marker } : {}),
      };

      currentLines.push(lineBox);
      yInPage += lineH;
      lineIndexInPara++;

      if (paraLine.pageBreakAfter) {
        newPage();
      }
    }
  }

  // Always emit the last page even if empty (so page count ≥ 1).
  pages.push(buildPage(pageIndex, page, currentLines));

  return pages;
}

function buildPage(index: number, page: PageGeometry, lines: readonly LineBox[]): PageLayout {
  return {
    index,
    sizePx: { widthPx: page.widthPx, heightPx: page.heightPx },
    marginsPx: {
      top: page.marginTopPx,
      bottom: page.marginBottomPx,
      left: page.marginLeftPx,
      right: page.marginRightPx,
    },
    contentTopPx: page.marginTopPx,
    contentLeftPx: page.marginLeftPx,
    lines,
  };
}
