// @word/layout — measure/shape/break/paginate/position pipeline.
// MVP: single-column body, first-fit line breaks, letter page, 1-inch margins.

import type { Document, NodeId, ParaProps, RunProps } from '@word/domain';

/** A measuring seam. Canvas-based implementation lives in @word/render. */
export interface FontMetricsPort {
  measure(
    text: string,
    props: MeasureProps,
  ): {
    readonly widthPx: number;
    readonly heightPx: number;
    readonly ascentPx: number;
    readonly descentPx: number;
  };
}

export interface MeasureProps {
  readonly fontName: string;
  readonly halfPoints: number;
  readonly bold?: boolean;
  readonly italic?: boolean;
}

/**
 * Optional resolver port. When omitted, layout-document falls back to its
 * built-in prop lookup against `doc.props`. M1-A's domain style-resolution
 * helpers satisfy this interface when available.
 */
export interface LayoutResolver {
  /** Fully-resolved RunProps including style inheritance chain. */
  resolveRunProps: (propsId: string, doc: Document) => RunProps;
  /** Fully-resolved ParaProps including style inheritance chain. */
  resolveParaProps: (propsId: string, doc: Document) => ParaProps;
  /**
   * Returns the rendered marker text and run-props for a numbered/bulleted
   * paragraph, or undefined when the paragraph has no numbering.
   * Provided by the M1-F agent; a placeholder is used until it lands.
   */
  resolveNumbering?: (
    doc: Document,
    paragraphId: NodeId,
    numId: number,
    ilvl: number,
  ) => { readonly text: string; readonly runProps: RunProps } | undefined;
}

export interface LayoutInput {
  readonly doc: Document;
  readonly metrics: FontMetricsPort;
  readonly viewportPx?: { readonly widthPx: number; readonly heightPx: number };
  /**
   * Plug in the domain style-resolution helpers here. When omitted, the layout
   * engine uses direct prop-registry look-ups (no style inheritance).
   */
  readonly resolver?: LayoutResolver;
}

export interface PageLayout {
  readonly index: number;
  readonly sizePx: { readonly widthPx: number; readonly heightPx: number };
  readonly marginsPx: {
    readonly top: number;
    readonly bottom: number;
    readonly left: number;
    readonly right: number;
  };
  readonly contentTopPx: number;
  readonly contentLeftPx: number;
  readonly lines: readonly LineBox[];
}

export interface LineBox {
  readonly paragraphId: NodeId;
  readonly lineIndex: number; // within paragraph
  readonly topPx: number;
  readonly leftPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly baselinePx: number;
  readonly runs: readonly LineRun[];
  /** Paragraph-level alignment applied to this line. */
  readonly alignment: 'left' | 'center' | 'right' | 'justify';
  /**
   * List marker emitted before the first line of a numbered/bulleted paragraph.
   * Only present on lineIndex === 0 lines that belong to a numbered paragraph.
   */
  readonly marker?: {
    readonly text: string;
    readonly props: MeasureProps;
    readonly widthPx: number;
  };
}

export interface LineRun {
  readonly runId: NodeId;
  readonly text: string;
  readonly leftPx: number;
  readonly widthPx: number;
  readonly props: MeasureProps;
  /** Fully resolved RunProps (including style chain). Consumed by M1-D render agent. */
  readonly resolvedRunProps: RunProps;
  /** Offset within the run text where this line-slice begins. */
  readonly offsetInRun: number;
}

/** Maps a screen point (relative to a page) to a domain position. */
export interface HitTester {
  hitTest(
    pageIndex: number,
    xPx: number,
    yPx: number,
  ): { readonly leafId: NodeId; readonly offset: number } | undefined;
}

export { layoutDocument } from './layout-document.js';
export { createHitTester } from './hit-test.js';
export { measureText } from './measure.js';
export type { GlyphCluster } from './measure.js';
export { breakParagraph } from './break-lines.js';
export type { ParaLine, InlineSegment } from './break-lines.js';
export { paginate } from './paginate.js';
export type { PaginateInput, PageGeometry } from './paginate.js';
export * from './constants.js';
