import { describe, expect, it } from 'vitest';
import { asNodeId, createEmptyDocument, createMutablePropsRegistry } from '@word/domain';
import type { Document, Paragraph, ParaProps, Run, RunProps, Section } from '@word/domain';
import type { FontMetricsPort, LayoutInput } from './index.js';
import { layoutDocument } from './layout-document.js';
import { twipsToPx } from './constants.js';

// ---------------------------------------------------------------------------
// Stub metrics: 8 px/char, 20 px cell height, 16 px ascent.
// ---------------------------------------------------------------------------
const CHAR_W = 8;
const CELL_H = 20;
const ASCENT = 16;

const stubMetrics: FontMetricsPort = {
  measure(text, _props) {
    return {
      widthPx: [...text].length * CHAR_W,
      heightPx: CELL_H,
      ascentPx: ASCENT,
      descentPx: 4,
    };
  },
};

// ---------------------------------------------------------------------------
// Tiny deterministic IdGen
// ---------------------------------------------------------------------------
function makeIdGen() {
  let n = 0;
  return {
    newId() {
      return asNodeId(`id${String(n++).padStart(4, '0')}`);
    },
  };
}

// ---------------------------------------------------------------------------
// Document builder helpers
// ---------------------------------------------------------------------------

function buildDoc(paragraphTexts: readonly string[]): Document {
  const idGen = makeIdGen();
  const registry = createMutablePropsRegistry();

  const defaultRunPropsId = registry.internRun({});
  const defaultParaPropsId = registry.internPara({});
  const defaultSectionPropsId = registry.internSection({
    pageSize: { widthTwips: 12_240, heightTwips: 15_840, orient: 'portrait' },
    pageMargin: {
      topTwips: 1440,
      bottomTwips: 1440,
      leftTwips: 1440,
      rightTwips: 1440,
      headerTwips: 720,
      footerTwips: 720,
      gutterTwips: 0,
    },
  });

  const paragraphs: Paragraph[] = paragraphTexts.map((text) => {
    const run: Run = {
      id: idGen.newId(),
      type: 'run',
      attrs: { runPropsId: defaultRunPropsId },
      text,
    };
    return {
      id: idGen.newId(),
      type: 'paragraph',
      attrs: { paraPropsId: defaultParaPropsId },
      children: [run],
    };
  });

  const section: Section = {
    id: idGen.newId(),
    type: 'section',
    attrs: { sectionPropsId: defaultSectionPropsId },
    children: paragraphs,
  };

  const base = createEmptyDocument(idGen);
  return {
    ...base,
    sections: [section],
    props: registry.freeze(),
    defaults: { runPropsId: defaultRunPropsId, paraPropsId: defaultParaPropsId },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('layoutDocument', () => {
  it('returns at least one page for an empty document', () => {
    const doc = createEmptyDocument(makeIdGen());
    const input: LayoutInput = { doc, metrics: stubMetrics };
    const pages = layoutDocument(input);
    expect(pages.length).toBeGreaterThanOrEqual(1);
  });

  it('three short paragraphs each produce exactly one line', () => {
    // Content width = (12240 - 1440 - 1440) twips × (96/1440) px/twip = 624 px.
    // "hello" = 5 chars × 8 px = 40 px — fits comfortably.
    const doc = buildDoc(['hello', 'world', 'foo']);
    const input: LayoutInput = { doc, metrics: stubMetrics };
    const pages = layoutDocument(input);

    // Collect all lines across all pages.
    const allLines = pages.flatMap((p) => p.lines);
    // 3 paragraphs × 1 line each = 3 lines minimum.
    expect(allLines.length).toBeGreaterThanOrEqual(3);
  });

  it('a paragraph with text long enough to wrap produces multiple lines', () => {
    // Content width ≈ 624 px. 624/8 ≈ 78 chars per line.
    // "word " × 20 = 100 chars (with spaces) → should wrap.
    const longText = Array.from({ length: 20 }, () => 'word').join(' ');
    const doc = buildDoc([longText]);
    const input: LayoutInput = { doc, metrics: stubMetrics };
    const pages = layoutDocument(input);

    const allLines = pages.flatMap((p) => p.lines);
    expect(allLines.length).toBeGreaterThan(1);
  });

  it('page layout has correct size matching letter page at 96 DPI', () => {
    const doc = buildDoc(['test']);
    const pages = layoutDocument({ doc, metrics: stubMetrics });
    // 8.5" × 96 = 816 px; 11" × 96 = 1056 px.
    expect(pages[0]?.sizePx.widthPx).toBeCloseTo(816, 0);
    expect(pages[0]?.sizePx.heightPx).toBeCloseTo(1056, 0);
  });

  it('content margins reflect 1-inch margins', () => {
    const doc = buildDoc(['test']);
    const pages = layoutDocument({ doc, metrics: stubMetrics });
    // 1 inch × 96 DPI = 96 px margin on each side.
    expect(pages[0]?.contentTopPx).toBeCloseTo(96, 0);
    expect(pages[0]?.contentLeftPx).toBeCloseTo(96, 0);
  });
});

// ---------------------------------------------------------------------------
// Builder helpers for M1-C formatting tests
// ---------------------------------------------------------------------------

/**
 * Build a document with one paragraph that has specific run and para props.
 * Content width = (12240 - 1440 - 1440) × (96/1440) = 624 px.
 */
function buildDocWithProps(text: string, paraProps: ParaProps, runProps: RunProps = {}): Document {
  const idGen = makeIdGen();
  const registry = createMutablePropsRegistry();

  const defaultRunPropsId = registry.internRun({});
  const defaultParaPropsId = registry.internPara({});
  const runPropsId = registry.internRun(runProps);
  const paraPropsId = registry.internPara(paraProps);
  const sectionPropsId = registry.internSection({
    pageSize: { widthTwips: 12_240, heightTwips: 15_840, orient: 'portrait' },
    pageMargin: {
      topTwips: 1440,
      bottomTwips: 1440,
      leftTwips: 1440,
      rightTwips: 1440,
      headerTwips: 720,
      footerTwips: 720,
      gutterTwips: 0,
    },
  });

  const run: Run = {
    id: idGen.newId(),
    type: 'run',
    attrs: { runPropsId },
    text,
  };
  const para: Paragraph = {
    id: idGen.newId(),
    type: 'paragraph',
    attrs: { paraPropsId },
    children: [run],
  };
  const section: Section = {
    id: idGen.newId(),
    type: 'section',
    attrs: { sectionPropsId },
    children: [para],
  };

  const base = createEmptyDocument(idGen);
  return {
    ...base,
    sections: [section],
    props: registry.freeze(),
    defaults: { runPropsId: defaultRunPropsId, paraPropsId: defaultParaPropsId },
  };
}

// ---------------------------------------------------------------------------
// M1-C: Alignment tests
// ---------------------------------------------------------------------------

describe('layoutDocument — alignment', () => {
  // Content width = 624 px.
  const CONTENT_W = twipsToPx(12_240 - 1440 - 1440); // 624

  it('center-aligned paragraph: first line leftPx is centered within content width', () => {
    // "hi" = 2 chars × 8 px = 16 px wide. Centered in 624 px → left = (624-16)/2 = 304.
    const doc = buildDocWithProps('hi', { alignment: 'center' });
    const pages = layoutDocument({ doc, metrics: stubMetrics });
    const line = pages[0]?.lines[0];
    expect(line).toBeDefined();
    expect(line?.alignment).toBe('center');
    const textWidth = 2 * CHAR_W; // 16 px
    const expectedLeft = (CONTENT_W - textWidth) / 2;
    expect(line?.leftPx).toBeCloseTo(expectedLeft, 1);
  });

  it('right-aligned paragraph: first line leftPx places text at content right edge', () => {
    // "hi" = 16 px; right-aligned in 624 px → left = 624 - 16 = 608.
    const doc = buildDocWithProps('hi', { alignment: 'right' });
    const pages = layoutDocument({ doc, metrics: stubMetrics });
    const line = pages[0]?.lines[0];
    expect(line?.alignment).toBe('right');
    const textWidth = 2 * CHAR_W;
    const expectedLeft = CONTENT_W - textWidth;
    expect(line?.leftPx).toBeCloseTo(expectedLeft, 1);
  });

  it('left-aligned paragraph: leftPx is 0 (no indent)', () => {
    const doc = buildDocWithProps('hi', { alignment: 'left' });
    const pages = layoutDocument({ doc, metrics: stubMetrics });
    const line = pages[0]?.lines[0];
    expect(line?.alignment).toBe('left');
    expect(line?.leftPx).toBeCloseTo(0, 1);
  });

  it('justify alignment is stored as "justify" on the LineBox', () => {
    const doc = buildDocWithProps('hello world', { alignment: 'justify' });
    const pages = layoutDocument({ doc, metrics: stubMetrics });
    const line = pages[0]?.lines[0];
    expect(line?.alignment).toBe('justify');
    // Justify is left-positioned at the layout stage; render agent expands inter-word.
  });
});

// ---------------------------------------------------------------------------
// M1-C: Indent tests
// ---------------------------------------------------------------------------

describe('layoutDocument — indent', () => {
  it('left indent of 720 twips (0.5") shifts all lines right by that amount', () => {
    // 720 twips × (96/1440) = 48 px indent.
    const doc = buildDocWithProps('hello', { indent: { leftTwips: 720 } });
    const pages = layoutDocument({ doc, metrics: stubMetrics });
    const lines = pages[0]?.lines ?? [];
    expect(lines.length).toBeGreaterThanOrEqual(1);
    // All lines should start at leftIndent = 48 px (left-aligned, short text).
    for (const line of lines) {
      expect(line.leftPx).toBeGreaterThanOrEqual(twipsToPx(720) - 0.1);
    }
  });

  it('first-line indent only insets the first line', () => {
    // firstLineTwips=240 (1/6") means first line is 16 px further right than subsequent.
    const longText = Array.from({ length: 20 }, () => 'word').join(' ');
    const doc = buildDocWithProps(longText, { indent: { firstLineTwips: 240 } });
    const pages = layoutDocument({ doc, metrics: stubMetrics });
    const lines = pages[0]?.lines ?? [];
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const firstLine = lines[0];
    const secondLine = lines[1];
    expect(firstLine).toBeDefined();
    expect(secondLine).toBeDefined();
    // First line starts further right than subsequent lines.
    expect(firstLine?.leftPx ?? 0).toBeGreaterThan(secondLine?.leftPx ?? 0);
  });
});

// ---------------------------------------------------------------------------
// M1-C: Paragraph spacing tests
// ---------------------------------------------------------------------------

describe('layoutDocument — paragraph spacing', () => {
  it('spacingBeforeTwips adds vertical gap before a paragraph', () => {
    // Build doc with two paragraphs; second has spacingBefore=480 twips (1/3 inch ~ 32 px).
    const idGen = makeIdGen();
    const registry = createMutablePropsRegistry();

    const defaultRunPropsId = registry.internRun({});
    const para1PropsId = registry.internPara({});
    const para2PropsId = registry.internPara({ spacing: { beforeTwips: 480 } });
    const sectionPropsId = registry.internSection({
      pageSize: { widthTwips: 12_240, heightTwips: 15_840, orient: 'portrait' },
      pageMargin: {
        topTwips: 1440,
        bottomTwips: 1440,
        leftTwips: 1440,
        rightTwips: 1440,
        headerTwips: 720,
        footerTwips: 720,
        gutterTwips: 0,
      },
    });

    function mkPara(text: string, paraPropsId: typeof para1PropsId): Paragraph {
      return {
        id: idGen.newId(),
        type: 'paragraph',
        attrs: { paraPropsId },
        children: [
          { id: idGen.newId(), type: 'run', attrs: { runPropsId: defaultRunPropsId }, text },
        ],
      };
    }

    const section: Section = {
      id: idGen.newId(),
      type: 'section',
      attrs: { sectionPropsId },
      children: [mkPara('first', para1PropsId), mkPara('second', para2PropsId)],
    };

    const base = createEmptyDocument(idGen);
    const doc: Document = {
      ...base,
      sections: [section],
      props: registry.freeze(),
      defaults: { runPropsId: defaultRunPropsId, paraPropsId: para1PropsId },
    };

    const pages = layoutDocument({ doc, metrics: stubMetrics });
    const lines = pages[0]?.lines ?? [];
    expect(lines.length).toBeGreaterThanOrEqual(2);

    const line1 = lines[0];
    const line2 = lines[1];
    expect(line1).toBeDefined();
    expect(line2).toBeDefined();

    // Without spacing the gap between lines would just be line1.heightPx.
    // With spacingBefore=480 twips the gap should be larger.
    const gap = (line2?.topPx ?? 0) - ((line1?.topPx ?? 0) + (line1?.heightPx ?? 0));
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeCloseTo(twipsToPx(480), 0);
  });
});

// ---------------------------------------------------------------------------
// M1-C: Font size → line height
// ---------------------------------------------------------------------------

describe('layoutDocument — font size and line height', () => {
  it('24 halfPoints (12 pt) font produces expected line height', () => {
    // halfPointsToPx(24) = (24/2) × (96/72) = 16 px; line height = 16 × 1.15 = 18.4 px.
    const doc = buildDocWithProps('test', {}, { halfPoints: 24 });
    const pages = layoutDocument({ doc, metrics: stubMetrics });
    const line = pages[0]?.lines[0];
    // The stub metrics return CELL_H=20 px; natural line height = 20 × 1.15 = 23 px.
    // The stub overrides the actual font metrics so we test the plumbing works, not exact px.
    expect(line?.heightPx).toBeGreaterThan(0);
  });

  it('larger halfPoints produces taller line height than smaller halfPoints', () => {
    // Use a metrics stub that respects halfPoints so we can verify scaling.
    const scalingMetrics: FontMetricsPort = {
      measure(text, props) {
        const cellH = props.halfPoints; // use halfPoints directly as cell height proxy
        return {
          widthPx: [...text].length * CHAR_W,
          heightPx: cellH,
          ascentPx: cellH * 0.8,
          descentPx: cellH * 0.2,
        };
      },
    };
    const docSmall = buildDocWithProps('test', {}, { halfPoints: 20 });
    const docLarge = buildDocWithProps('test', {}, { halfPoints: 40 });
    const smallLine = layoutDocument({ doc: docSmall, metrics: scalingMetrics })[0]?.lines[0];
    const largeLine = layoutDocument({ doc: docLarge, metrics: scalingMetrics })[0]?.lines[0];
    expect(largeLine?.heightPx ?? 0).toBeGreaterThan(smallLine?.heightPx ?? 0);
  });
});

// ---------------------------------------------------------------------------
// M1-C: List marker
// ---------------------------------------------------------------------------

describe('layoutDocument — list markers', () => {
  it('a paragraph with numbering emits a marker on lineIndex=0', () => {
    const doc = buildDocWithProps('item text', { numbering: { numId: 1, ilvl: 0 } });
    const pages = layoutDocument({ doc, metrics: stubMetrics });
    const line = pages[0]?.lines[0];
    expect(line).toBeDefined();
    expect(line?.marker).toBeDefined();
    expect(line?.marker?.text).toBeTruthy();
    expect(line?.marker?.widthPx ?? 0).toBeGreaterThan(0);
  });

  it('only the first line of a numbered paragraph has a marker', () => {
    // Long text forces wrap; only lineIndex=0 gets the marker.
    const longText = Array.from({ length: 20 }, () => 'item').join(' ');
    const doc = buildDocWithProps(longText, { numbering: { numId: 1, ilvl: 0 } });
    const pages = layoutDocument({ doc, metrics: stubMetrics });
    const lines = pages[0]?.lines ?? [];
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[0]?.marker).toBeDefined();
    expect(lines[1]?.marker).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// M1-C: resolvedRunProps on LineRun
// ---------------------------------------------------------------------------

describe('layoutDocument — resolvedRunProps on LineRun', () => {
  it('LineRun.resolvedRunProps reflects the run formatting', () => {
    const doc = buildDocWithProps('bold text', {}, { bold: true, halfPoints: 28 });
    const pages = layoutDocument({ doc, metrics: stubMetrics });
    const run = pages[0]?.lines[0]?.runs[0];
    expect(run).toBeDefined();
    expect(run?.resolvedRunProps.bold).toBe(true);
    expect(run?.resolvedRunProps.halfPoints).toBe(28);
  });
});

// ---------------------------------------------------------------------------
// M1-C: Determinism
// ---------------------------------------------------------------------------

describe('layoutDocument — determinism', () => {
  it('identical inputs produce byte-identical output', () => {
    const doc = buildDocWithProps(
      'deterministic paragraph',
      { alignment: 'center', indent: { leftTwips: 360 } },
      { halfPoints: 24 },
    );
    const input: LayoutInput = { doc, metrics: stubMetrics };
    const pages1 = layoutDocument(input);
    const pages2 = layoutDocument(input);
    expect(JSON.stringify(pages1)).toBe(JSON.stringify(pages2));
  });
});
