// layoutDocument: top-level entry point. Iterates section → paragraph →
// breakParagraph → paginate, returning a PageLayout[] for the full document.
//
// M0 assumptions still in force (single-column, tables/images/headers skipped).
// M1-C additions:
// - Resolves RunProps and ParaProps (via LayoutResolver port or direct lookup).
// - Applies paragraph alignment, indent (left, right, firstLine, hanging).
// - Applies spacing before/after paragraphs.
// - Computes line height from spacing.lineRule / spacing.lineTwips when set.
// - Emits list markers for numbered paragraphs using a resolveNumbering port
//   (placeholder used until the M1-F agent lands the full implementation).
//
// Dependency rule: this file imports from @word/domain for *types* only and
// from layout-internal helpers. It does not import from React, Electron, or any
// layer above this package.

import type { Document, InlineNode, NodeId, Paragraph, ParaProps, RunProps } from '@word/domain';
import { isParagraph } from '@word/domain';
import type { LayoutInput, LayoutResolver, MeasureProps, PageLayout } from './index.js';
import {
  DEFAULT_HALF_POINTS,
  DEFAULT_LINE_RATIO,
  DEFAULT_MARGIN_TWIPS,
  LETTER_HEIGHT_TWIPS,
  LETTER_WIDTH_TWIPS,
  halfPointsToPx,
  twipsToPx,
} from './constants.js';
import { breakParagraph, type InlineSegment, type LineWidths } from './break-lines.js';
import { paginate, type PageGeometry, type PaginateInput } from './paginate.js';

// ---------------------------------------------------------------------------
// Built-in (no-style-inheritance) prop resolvers — used when no resolver port
// is supplied. These do direct registry look-ups only.
// ---------------------------------------------------------------------------

function builtinResolveRunProps(propsId: string, doc: Document): RunProps {
  return doc.props.run.get(propsId as Parameters<typeof doc.props.run.get>[0]) ?? {};
}

function builtinResolveParaProps(propsId: string, doc: Document): ParaProps {
  return doc.props.para.get(propsId as Parameters<typeof doc.props.para.get>[0]) ?? {};
}

/**
 * Placeholder list-marker resolver used until the M1-F agent provides a full
 * implementation via the LayoutResolver.resolveNumbering port.
 *
 * Returns a bullet "•" for any list paragraph. The M1-F agent will supply
 * correct decimal, alpha, roman, etc. sequences based on the numbering registry.
 */
function placeholderResolveNumbering(
  _doc: Document,
  _paragraphId: NodeId,
  _numId: number,
  _ilvl: number,
): { readonly text: string; readonly runProps: RunProps } {
  // TODO(M1-F): replace with full numbering resolution using NumberingRegistry.
  return { text: '\u2022', runProps: {} };
}

// ---------------------------------------------------------------------------
// MeasureProps builder
// ---------------------------------------------------------------------------

function buildMeasureProps(runProps: RunProps, defaultProps: RunProps): MeasureProps {
  const halfPoints = runProps.halfPoints ?? defaultProps.halfPoints ?? DEFAULT_HALF_POINTS;
  const bold = runProps.bold ?? defaultProps.bold;
  const italic = runProps.italic ?? defaultProps.italic;
  return {
    fontName: runProps.fontName ?? defaultProps.fontName ?? 'Times New Roman',
    halfPoints,
    ...(bold !== undefined ? { bold } : {}),
    ...(italic !== undefined ? { italic } : {}),
  };
}

// ---------------------------------------------------------------------------
// Page geometry helpers
// ---------------------------------------------------------------------------

function defaultPageGeometry(): PageGeometry {
  const marginPx = twipsToPx(DEFAULT_MARGIN_TWIPS);
  return {
    widthPx: twipsToPx(LETTER_WIDTH_TWIPS),
    heightPx: twipsToPx(LETTER_HEIGHT_TWIPS),
    marginTopPx: marginPx,
    marginBottomPx: marginPx,
    marginLeftPx: marginPx,
    marginRightPx: marginPx,
  };
}

function sectionPageGeometry(sectionPropsId: string, doc: Document): PageGeometry {
  const sp = doc.props.section.get(sectionPropsId as Parameters<typeof doc.props.section.get>[0]);
  if (sp === undefined) return defaultPageGeometry();

  return {
    widthPx: twipsToPx(sp.pageSize.widthTwips),
    heightPx: twipsToPx(sp.pageSize.heightTwips),
    marginTopPx: twipsToPx(sp.pageMargin.topTwips),
    marginBottomPx: twipsToPx(sp.pageMargin.bottomTwips),
    marginLeftPx: twipsToPx(sp.pageMargin.leftTwips),
    marginRightPx: twipsToPx(sp.pageMargin.rightTwips),
  };
}

// ---------------------------------------------------------------------------
// Paragraph → InlineSegments
// ---------------------------------------------------------------------------

function collectSegments(
  para: Paragraph,
  doc: Document,
  resolveRunPropsFn: (propsId: string, doc: Document) => RunProps,
): readonly InlineSegment[] {
  const defaultRunProps = resolveRunPropsFn(doc.defaults.runPropsId, doc);
  const segments: InlineSegment[] = [];

  function walk(nodes: readonly InlineNode[], runPropsOverride?: RunProps): void {
    for (const node of nodes) {
      if (node.type === 'run') {
        const runProps = resolveRunPropsFn(node.attrs.runPropsId, doc);
        const effective =
          runPropsOverride !== undefined ? { ...runPropsOverride, ...runProps } : runProps;
        const props = buildMeasureProps(effective, defaultRunProps);
        if (node.text.length > 0) {
          segments.push({
            kind: 'text',
            runId: node.id,
            text: node.text,
            props,
            resolvedRunProps: effective,
          });
        }
      } else if (node.type === 'break') {
        if (node.attrs.kind === 'line' || node.attrs.kind === 'page') {
          segments.push({ kind: 'hardBreak', breakKind: node.attrs.kind });
        }
        // column and textWrapping treated as soft; ignored at MVP.
      } else if (node.type === 'hyperlinkRun') {
        walk(node.children);
      } else if (node.type === 'fieldRun') {
        walk(node.children);
      }
      // drawingRun, commentMarker, bookmarkMarker, footnoteMarker,
      // endnoteMarker — all skipped at MVP.
    }
  }

  walk(para.children);
  return segments;
}

// ---------------------------------------------------------------------------
// Line height computation from ParaProps.spacing
// ---------------------------------------------------------------------------

function computeLineHeightPx(
  paraSpacing: ParaProps['spacing'],
  nominalFontHeightPx: number,
): number {
  if (paraSpacing === undefined) return nominalFontHeightPx * DEFAULT_LINE_RATIO;

  const { lineTwips, lineRule } = paraSpacing;

  if (lineTwips === undefined || lineRule === undefined) {
    return nominalFontHeightPx * DEFAULT_LINE_RATIO;
  }

  const linePx = twipsToPx(lineTwips);

  switch (lineRule) {
    case 'exact':
      // Fixed line height — ignore font size.
      return linePx;
    case 'atLeast':
      // At-least: use the larger of the specified value and the natural height.
      return Math.max(linePx, nominalFontHeightPx * DEFAULT_LINE_RATIO);
    case 'auto':
      // auto: lineTwips is 240 × multiplier (e.g. 240 = single, 360 = 1.5×, 480 = double).
      // Multiplier = lineTwips / 240.
      return nominalFontHeightPx * DEFAULT_LINE_RATIO * (lineTwips / 240);
  }
}

// ---------------------------------------------------------------------------
// Paragraph alignment normalisation
// ---------------------------------------------------------------------------

function normaliseAlignment(raw: ParaProps['alignment']): 'left' | 'center' | 'right' | 'justify' {
  switch (raw) {
    case 'center':
      return 'center';
    case 'right':
      return 'right';
    case 'justify':
    case 'distribute':
      // distribute is an East-Asian variant of justify; treat as justify for layout.
      return 'justify';
    default:
      return 'left';
  }
}

// ---------------------------------------------------------------------------
// layoutDocument
// ---------------------------------------------------------------------------

export function layoutDocument(input: LayoutInput): readonly PageLayout[] {
  const { doc, metrics, resolver } = input;

  // Wire up resolvers: use supplied port or fall back to built-in look-ups.
  const resolveRunPropsFn: LayoutResolver['resolveRunProps'] =
    resolver?.resolveRunProps ?? builtinResolveRunProps;
  const resolveParaPropsFn: LayoutResolver['resolveParaProps'] =
    resolver?.resolveParaProps ?? builtinResolveParaProps;
  const resolveNumberingFn = resolver?.resolveNumbering ?? placeholderResolveNumbering;

  const allParagraphLines: PaginateInput[] = [];
  let pageGeometry = defaultPageGeometry();

  function emptyRunId(paragraphId: NodeId): NodeId {
    return (paragraphId + '_empty') as NodeId;
  }

  for (const section of doc.sections) {
    const sp = doc.props.section.get(
      section.attrs.sectionPropsId as Parameters<typeof doc.props.section.get>[0],
    );
    if (sp !== undefined) {
      pageGeometry = sectionPageGeometry(section.attrs.sectionPropsId, doc);
    }

    const baseContentWidthPx =
      pageGeometry.widthPx - pageGeometry.marginLeftPx - pageGeometry.marginRightPx;

    const defaultRunProps = resolveRunPropsFn(doc.defaults.runPropsId, doc);
    const defaultHalfPts = defaultRunProps.halfPoints ?? DEFAULT_HALF_POINTS;
    const defaultFontHeightPx = halfPointsToPx(defaultHalfPts);
    const defaultLineHeightPx = defaultFontHeightPx * DEFAULT_LINE_RATIO;
    const defaultAscentPx = defaultFontHeightPx * 0.8; // rough 80% ascent

    for (const block of section.children) {
      if (!isParagraph(block)) continue; // skip tables at MVP

      const para = block;

      // Resolve paragraph-level formatting.
      const paraProps = resolveParaPropsFn(para.attrs.paraPropsId, doc);
      const alignment = normaliseAlignment(paraProps.alignment);

      // Indent in px.
      const leftIndentPx = twipsToPx(paraProps.indent?.leftTwips ?? 0);
      const rightIndentPx = twipsToPx(paraProps.indent?.rightTwips ?? 0);

      // First-line and hanging indents are mutually exclusive in Word:
      // firstLineTwips > 0 → first-line indent (first line shifted right).
      // hangingTwips > 0 → hanging indent (first line shifted left relative to subsequent).
      // If both are somehow present, firstLine takes precedence.
      const firstLineTwips = paraProps.indent?.firstLineTwips ?? 0;
      const hangingTwips = paraProps.indent?.hangingTwips ?? 0;
      // firstLineExtraPx is the delta from the paragraph left indent to the first line.
      // Positive → first-line indent; negative → hanging (first line is to the left).
      const firstLineExtraPx =
        firstLineTwips !== 0
          ? twipsToPx(firstLineTwips)
          : hangingTwips !== 0
            ? -twipsToPx(hangingTwips)
            : 0;

      // Paragraph spacing.
      const spacingBeforePx = twipsToPx(paraProps.spacing?.beforeTwips ?? 0);
      const spacingAfterPx = twipsToPx(paraProps.spacing?.afterTwips ?? 0);

      // Available line widths for breaking (already adjusted for left+right indent).
      const indentReducedWidthPx = baseContentWidthPx - leftIndentPx - rightIndentPx;
      const firstLineAvailPx = indentReducedWidthPx - Math.max(0, firstLineExtraPx);
      const subsequentAvailPx = indentReducedWidthPx + Math.min(0, firstLineExtraPx);

      const lineWidths: LineWidths | undefined =
        firstLineExtraPx !== 0
          ? { firstLinePx: firstLineAvailPx, subsequentPx: subsequentAvailPx }
          : undefined;

      // Dominant font height for line-height computation.
      const segments = collectSegments(para, doc, resolveRunPropsFn);

      let paraFallbackLineH = defaultLineHeightPx;
      let paraFallbackAscent = defaultAscentPx;

      for (const seg of segments) {
        if (seg.kind === 'text') {
          const fontHeightPx = halfPointsToPx(seg.props.halfPoints);
          paraFallbackLineH = computeLineHeightPx(paraProps.spacing, fontHeightPx);
          paraFallbackAscent = fontHeightPx * 0.8;
          break;
        }
      }

      // List marker resolution.
      let marker: PaginateInput['marker'] | undefined;
      if (paraProps.numbering !== undefined) {
        const resolved = resolveNumberingFn(
          doc,
          para.id,
          paraProps.numbering.numId,
          paraProps.numbering.ilvl,
        );
        if (resolved !== undefined) {
          const markerProps = buildMeasureProps(resolved.runProps, defaultRunProps);
          const markerWidth = metrics.measure(resolved.text, markerProps).widthPx;
          marker = { text: resolved.text, props: markerProps, widthPx: markerWidth };
        }
      }

      let paraSegments = segments;
      if (paraSegments.length === 0) {
        const props = buildMeasureProps(defaultRunProps, defaultRunProps);
        paraSegments = [
          {
            kind: 'text',
            runId: emptyRunId(para.id),
            text: '',
            props,
            resolvedRunProps: defaultRunProps,
          },
        ];
      }

      const lines = breakParagraph(
        paraSegments,
        indentReducedWidthPx,
        metrics,
        paraFallbackLineH,
        paraFallbackAscent,
        lineWidths,
      );

      const paginateInput: PaginateInput = {
        paragraphId: para.id,
        lines,
        alignment,
        spacingBeforePx,
        spacingAfterPx,
        leftIndentPx,
        firstLineExtraPx,
        ...(marker !== undefined ? { marker } : {}),
      };
      allParagraphLines.push(paginateInput);
    }
  }

  if (allParagraphLines.length === 0) {
    return [
      {
        index: 0,
        sizePx: { widthPx: pageGeometry.widthPx, heightPx: pageGeometry.heightPx },
        marginsPx: {
          top: pageGeometry.marginTopPx,
          bottom: pageGeometry.marginBottomPx,
          left: pageGeometry.marginLeftPx,
          right: pageGeometry.marginRightPx,
        },
        contentTopPx: pageGeometry.marginTopPx,
        contentLeftPx: pageGeometry.marginLeftPx,
        lines: [],
      },
    ];
  }

  return paginate(allParagraphLines, pageGeometry);
}
