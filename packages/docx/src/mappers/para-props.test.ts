// Colocated tests for the pPr ↔ ParaProps mapper.
// Strategy: for each supported field, build ParaProps → serialize → parse → equals original.
import { describe, it, expect } from 'vitest';
import { parseParaProps, serializeParaProps } from './para-props.js';
import type { ParaProps } from '@word/domain';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roundTrip(props: ParaProps, unknownXml: readonly string[] = []): ParaProps {
  const xml = serializeParaProps(props, unknownXml);
  if (xml == null) return {};
  const { props: back } = parseParaProps(xml);
  return back;
}

// ─── Style ref ────────────────────────────────────────────────────────────────

describe('pPr: styleRef', () => {
  it('survives round-trip', () => {
    expect(roundTrip({ styleRef: 'Heading1' })).toMatchObject({ styleRef: 'Heading1' });
  });
  it('Normal style ref survives', () => {
    expect(roundTrip({ styleRef: 'Normal' })).toMatchObject({ styleRef: 'Normal' });
  });
});

// ─── Alignment ────────────────────────────────────────────────────────────────

describe('pPr: alignment', () => {
  it('left survives', () => {
    expect(roundTrip({ alignment: 'left' })).toMatchObject({ alignment: 'left' });
  });
  it('center survives', () => {
    expect(roundTrip({ alignment: 'center' })).toMatchObject({ alignment: 'center' });
  });
  it('right survives', () => {
    expect(roundTrip({ alignment: 'right' })).toMatchObject({ alignment: 'right' });
  });
  it('justify maps to OOXML "both" and back to "justify"', () => {
    const xml = serializeParaProps({ alignment: 'justify' });
    expect(xml).toContain('w:val="both"');
    const { props } = parseParaProps(xml);
    expect(props.alignment).toBe('justify');
  });
  it('distribute survives', () => {
    expect(roundTrip({ alignment: 'distribute' })).toMatchObject({ alignment: 'distribute' });
  });
});

// ─── Indentation ──────────────────────────────────────────────────────────────

describe('pPr: indent', () => {
  it('leftTwips survives', () => {
    const rt = roundTrip({ indent: { leftTwips: 720 } });
    expect(rt.indent?.leftTwips).toBe(720);
  });
  it('rightTwips survives', () => {
    const rt = roundTrip({ indent: { rightTwips: 360 } });
    expect(rt.indent?.rightTwips).toBe(360);
  });
  it('firstLineTwips survives', () => {
    const rt = roundTrip({ indent: { firstLineTwips: 180 } });
    expect(rt.indent?.firstLineTwips).toBe(180);
  });
  it('hangingTwips survives', () => {
    const rt = roundTrip({ indent: { hangingTwips: 180 } });
    expect(rt.indent?.hangingTwips).toBe(180);
  });
  it('all four indent fields together survive', () => {
    const props: ParaProps = {
      indent: { leftTwips: 720, rightTwips: 360, firstLineTwips: 180, hangingTwips: 0 },
    };
    const rt = roundTrip(props);
    expect(rt.indent?.leftTwips).toBe(720);
    expect(rt.indent?.rightTwips).toBe(360);
    expect(rt.indent?.firstLineTwips).toBe(180);
  });
});

// ─── Spacing ──────────────────────────────────────────────────────────────────

describe('pPr: spacing', () => {
  it('beforeTwips and afterTwips survive', () => {
    const props: ParaProps = { spacing: { beforeTwips: 240, afterTwips: 120 } };
    const rt = roundTrip(props);
    expect(rt.spacing?.beforeTwips).toBe(240);
    expect(rt.spacing?.afterTwips).toBe(120);
  });
  it('lineTwips and lineRule survive', () => {
    const props: ParaProps = { spacing: { lineTwips: 276, lineRule: 'auto' } };
    const rt = roundTrip(props);
    expect(rt.spacing?.lineTwips).toBe(276);
    expect(rt.spacing?.lineRule).toBe('auto');
  });
  it('lineRule "atLeast" survives', () => {
    const props: ParaProps = { spacing: { lineTwips: 300, lineRule: 'atLeast' } };
    const rt = roundTrip(props);
    expect(rt.spacing?.lineRule).toBe('atLeast');
  });
  it('lineRule "exact" survives', () => {
    const props: ParaProps = { spacing: { lineTwips: 300, lineRule: 'exact' } };
    const rt = roundTrip(props);
    expect(rt.spacing?.lineRule).toBe('exact');
  });
});

// ─── Numbering ────────────────────────────────────────────────────────────────

describe('pPr: numbering', () => {
  it('numId and ilvl survive round-trip', () => {
    const props: ParaProps = { numbering: { numId: 1, ilvl: 0 } };
    const rt = roundTrip(props);
    expect(rt.numbering?.numId).toBe(1);
    expect(rt.numbering?.ilvl).toBe(0);
  });
  it('ilvl=2 survives', () => {
    const rt = roundTrip({ numbering: { numId: 3, ilvl: 2 } });
    expect(rt.numbering?.ilvl).toBe(2);
  });
});

// ─── Tabs ─────────────────────────────────────────────────────────────────────

describe('pPr: tabs', () => {
  it('left tab at 720 survives', () => {
    const props: ParaProps = { tabs: [{ positionTwips: 720, kind: 'left' }] };
    const rt = roundTrip(props);
    expect(rt.tabs?.[0]?.positionTwips).toBe(720);
    expect(rt.tabs?.[0]?.kind).toBe('left');
  });
  it('right tab with dot leader survives', () => {
    const props: ParaProps = {
      tabs: [{ positionTwips: 9360, kind: 'right', leader: 'dot' }],
    };
    const rt = roundTrip(props);
    expect(rt.tabs?.[0]?.kind).toBe('right');
    expect(rt.tabs?.[0]?.leader).toBe('dot');
  });
  it('multiple tabs survive in order', () => {
    const props: ParaProps = {
      tabs: [
        { positionTwips: 720, kind: 'left' },
        { positionTwips: 1440, kind: 'center' },
        { positionTwips: 2160, kind: 'right', leader: 'hyphen' },
      ],
    };
    const rt = roundTrip(props);
    expect(rt.tabs).toHaveLength(3);
    expect(rt.tabs?.[1]?.kind).toBe('center');
    expect(rt.tabs?.[2]?.leader).toBe('hyphen');
  });
});

// ─── Boolean flags ────────────────────────────────────────────────────────────

describe('pPr: keepLines / keepNext / pageBreakBefore / widowControl', () => {
  it('keepLines true survives', () => {
    expect(roundTrip({ keepLines: true })).toMatchObject({ keepLines: true });
  });
  it('keepNext true survives', () => {
    expect(roundTrip({ keepNext: true })).toMatchObject({ keepNext: true });
  });
  it('pageBreakBefore true survives', () => {
    expect(roundTrip({ pageBreakBefore: true })).toMatchObject({ pageBreakBefore: true });
  });
  it('widowControl true survives', () => {
    expect(roundTrip({ widowControl: true })).toMatchObject({ widowControl: true });
  });
});

// ─── Outline level ────────────────────────────────────────────────────────────

describe('pPr: outlineLevel', () => {
  it('0 (Heading1) survives', () => {
    expect(roundTrip({ outlineLevel: 0 })).toMatchObject({ outlineLevel: 0 });
  });
  it('8 survives', () => {
    expect(roundTrip({ outlineLevel: 8 })).toMatchObject({ outlineLevel: 8 });
  });
});

// ─── Bidi ─────────────────────────────────────────────────────────────────────

describe('pPr: bidi', () => {
  it('true survives', () => {
    expect(roundTrip({ bidi: true })).toMatchObject({ bidi: true });
  });
});

// ─── Unknown preservation ─────────────────────────────────────────────────────

describe('pPr: unknown child preservation', () => {
  it('custom element inside pPr is preserved verbatim', () => {
    const pPrXml = `<w:pPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:custom="http://example.com/custom"><w:jc w:val="center"/><custom:specialFormatting attr="x"/></w:pPr>`;
    const { props, unknownXml } = parseParaProps(pPrXml);
    expect(props.alignment).toBe('center');
    expect(unknownXml).toHaveLength(1);
    expect(unknownXml[0]).toContain('specialFormatting');

    // Re-serialize with the unknown preserved.
    const xml = serializeParaProps(props, unknownXml);
    expect(xml).toContain('specialFormatting');
    expect(xml).toContain('w:jc');
  });
});

// ─── Null / empty ─────────────────────────────────────────────────────────────

describe('pPr: null input', () => {
  it('parseParaProps(null) returns empty props', () => {
    const { props, unknownXml } = parseParaProps(null);
    expect(props).toEqual({});
    expect(unknownXml).toHaveLength(0);
  });
  it('serializeParaProps({}) returns null', () => {
    expect(serializeParaProps({})).toBeNull();
  });
});

// ─── All fields together ─────────────────────────────────────────────────────

describe('pPr: all supported fields together', () => {
  it('full props round-trip preserves all fields', () => {
    const props: ParaProps = {
      styleRef: 'Heading1',
      alignment: 'center',
      indent: { leftTwips: 720, rightTwips: 360 },
      spacing: { beforeTwips: 240, afterTwips: 120, lineTwips: 276, lineRule: 'auto' },
      numbering: { numId: 1, ilvl: 0 },
      tabs: [{ positionTwips: 4320, kind: 'center' }],
      keepLines: true,
      keepNext: true,
      pageBreakBefore: false,
      widowControl: true,
      outlineLevel: 0,
      bidi: false,
    };
    const rt = roundTrip(props);
    expect(rt).toMatchObject({
      styleRef: 'Heading1',
      alignment: 'center',
      outlineLevel: 0,
    });
    expect(rt.indent?.leftTwips).toBe(720);
    expect(rt.spacing?.beforeTwips).toBe(240);
    expect(rt.numbering?.numId).toBe(1);
    expect(rt.tabs?.[0]?.positionTwips).toBe(4320);
    expect(rt.keepLines).toBe(true);
  });
});
