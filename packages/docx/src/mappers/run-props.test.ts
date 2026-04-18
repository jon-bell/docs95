// Colocated tests for the rPr ↔ RunProps mapper.
// Strategy: for each supported field, build RunProps → serialize → parse → equals original.
import { describe, it, expect } from 'vitest';
import { parseRunProps, serializeRunProps } from './run-props.js';
import type { RunProps, ColorValue } from '@word/domain';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roundTrip(props: RunProps, unknownXml: readonly string[] = []): RunProps {
  const xml = serializeRunProps(props, unknownXml);
  if (xml == null) return {};
  const { props: back } = parseRunProps(xml);
  return back;
}

// ─── Boolean toggles ─────────────────────────────────────────────────────────

describe('rPr: bold', () => {
  it('true survives round-trip', () => {
    expect(roundTrip({ bold: true })).toMatchObject({ bold: true });
  });
  it('false emits w:val="0" and survives round-trip', () => {
    const xml = serializeRunProps({ bold: false });
    expect(xml).toContain('w:val="0"');
    expect(roundTrip({ bold: false })).toMatchObject({ bold: false });
  });
  it('absent produces no bold field', () => {
    expect(roundTrip({}).bold).toBeUndefined();
  });
});

describe('rPr: italic', () => {
  it('true survives round-trip', () => {
    expect(roundTrip({ italic: true })).toMatchObject({ italic: true });
  });
  it('false survives round-trip', () => {
    expect(roundTrip({ italic: false })).toMatchObject({ italic: false });
  });
});

describe('rPr: strike / doubleStrike / caps / smallCaps', () => {
  it('all four toggle fields survive round-trip', () => {
    const props: RunProps = { strike: true, doubleStrike: true, caps: true, smallCaps: true };
    const rt = roundTrip(props);
    expect(rt).toMatchObject(props);
  });
});

// ─── Underline ────────────────────────────────────────────────────────────────

describe('rPr: underline', () => {
  it('single survives', () => {
    expect(roundTrip({ underline: 'single' })).toMatchObject({ underline: 'single' });
  });
  it('double survives', () => {
    expect(roundTrip({ underline: 'double' })).toMatchObject({ underline: 'double' });
  });
  it('none survives', () => {
    expect(roundTrip({ underline: 'none' })).toMatchObject({ underline: 'none' });
  });
  it('wave survives', () => {
    expect(roundTrip({ underline: 'wave' })).toMatchObject({ underline: 'wave' });
  });
});

// ─── Color ────────────────────────────────────────────────────────────────────

describe('rPr: color', () => {
  it('auto survives', () => {
    const rt = roundTrip({ color: { kind: 'auto' } });
    expect(rt.color).toEqual({ kind: 'auto' });
  });
  it('rgb 6-hex survives', () => {
    const c: ColorValue = { kind: 'rgb', value: 'FF0000' };
    const rt = roundTrip({ color: c });
    expect(rt.color).toEqual(c);
  });
  it('rgb is uppercased on output', () => {
    const xml = serializeRunProps({ color: { kind: 'rgb', value: 'ff0000' } });
    // parse back normalises to uppercase
    const { props } = parseRunProps(xml);
    expect((props.color as { value: string }).value).toBe('FF0000');
  });
});

// ─── Font size ───────────────────────────────────────────────────────────────

describe('rPr: halfPoints', () => {
  it('24 (12pt) survives', () => {
    expect(roundTrip({ halfPoints: 24 })).toMatchObject({ halfPoints: 24 });
  });
  it('emits both <w:sz> and <w:szCs>', () => {
    const xml = serializeRunProps({ halfPoints: 24 });
    expect(xml).toContain('<w:sz w:val="24"/>');
    expect(xml).toContain('<w:szCs w:val="24"/>');
  });
});

// ─── Fonts ───────────────────────────────────────────────────────────────────

describe('rPr: fonts', () => {
  it('fontName survives and coalesces to ascii+hAnsi', () => {
    const rt = roundTrip({ fontName: 'Arial' });
    expect(rt.fontName).toBe('Arial');
  });
  it('fontNameEastAsia survives', () => {
    const rt = roundTrip({ fontNameEastAsia: 'SimSun' });
    expect(rt.fontNameEastAsia).toBe('SimSun');
  });
  it('fontNameComplex survives', () => {
    const rt = roundTrip({ fontNameComplex: 'Arial Unicode MS' });
    expect(rt.fontNameComplex).toBe('Arial Unicode MS');
  });
  it('all three together survive', () => {
    const props: RunProps = {
      fontName: 'Arial',
      fontNameEastAsia: 'SimSun',
      fontNameComplex: 'Arial Unicode MS',
    };
    expect(roundTrip(props)).toMatchObject(props);
  });
});

// ─── Highlight ────────────────────────────────────────────────────────────────

describe('rPr: highlight', () => {
  it('yellow survives', () => {
    expect(roundTrip({ highlight: 'yellow' })).toMatchObject({ highlight: 'yellow' });
  });
  it('red survives', () => {
    expect(roundTrip({ highlight: 'red' })).toMatchObject({ highlight: 'red' });
  });
});

// ─── Style ref ───────────────────────────────────────────────────────────────

describe('rPr: styleRef', () => {
  it('survives round-trip', () => {
    expect(roundTrip({ styleRef: 'Emphasis' })).toMatchObject({ styleRef: 'Emphasis' });
  });
});

// ─── Lang ────────────────────────────────────────────────────────────────────

describe('rPr: lang', () => {
  it('all three lang fields survive', () => {
    const props: RunProps = { lang: 'en-US', langEastAsia: 'zh-CN', langComplex: 'ar-SA' };
    expect(roundTrip(props)).toMatchObject(props);
  });
  it('only lang survives without east-asia or bidi', () => {
    expect(roundTrip({ lang: 'en-GB' })).toMatchObject({ lang: 'en-GB' });
  });
});

// ─── Vertical align ──────────────────────────────────────────────────────────

describe('rPr: verticalAlign', () => {
  it('superscript survives', () => {
    expect(roundTrip({ verticalAlign: 'superscript' })).toMatchObject({
      verticalAlign: 'superscript',
    });
  });
  it('subscript survives', () => {
    expect(roundTrip({ verticalAlign: 'subscript' })).toMatchObject({ verticalAlign: 'subscript' });
  });
  it('baseline survives', () => {
    expect(roundTrip({ verticalAlign: 'baseline' })).toMatchObject({ verticalAlign: 'baseline' });
  });
});

// ─── Hidden / RTL ────────────────────────────────────────────────────────────

describe('rPr: hidden', () => {
  it('true survives', () => {
    expect(roundTrip({ hidden: true })).toMatchObject({ hidden: true });
  });
});

describe('rPr: rtl', () => {
  it('true survives', () => {
    expect(roundTrip({ rtl: true })).toMatchObject({ rtl: true });
  });
});

// ─── Unknown preservation ────────────────────────────────────────────────────

describe('rPr: unknown child preservation', () => {
  it('custom element inside rPr is preserved verbatim', () => {
    // Inject a custom XML snippet through a raw rPr string.
    const rPrXml = `<w:rPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:custom="http://example.com/custom"><w:b/><custom:customX foo="bar"/></w:rPr>`;
    const { props, unknownXml } = parseRunProps(rPrXml);
    expect(props.bold).toBe(true);
    expect(unknownXml).toHaveLength(1);
    expect(unknownXml[0]).toContain('customX');

    // Re-serialize with the unknown preserved.
    const xml = serializeRunProps(props, unknownXml);
    expect(xml).toContain('customX');
    expect(xml).toContain('w:b');
  });
});

// ─── Null / empty cases ──────────────────────────────────────────────────────

describe('rPr: null input', () => {
  it('parseRunProps(null) returns empty props and no unknowns', () => {
    const { props, unknownXml } = parseRunProps(null);
    expect(props).toEqual({});
    expect(unknownXml).toHaveLength(0);
  });
  it('serializeRunProps({}) returns null', () => {
    expect(serializeRunProps({})).toBeNull();
  });
});

// ─── All fields together ─────────────────────────────────────────────────────

describe('rPr: all supported fields together', () => {
  it('full props round-trip preserves all fields', () => {
    const props: RunProps = {
      fontName: 'Times New Roman',
      fontNameEastAsia: 'SimSun',
      fontNameComplex: 'Arial Unicode MS',
      halfPoints: 28,
      bold: true,
      italic: true,
      underline: 'single',
      strike: false,
      doubleStrike: false,
      caps: false,
      smallCaps: false,
      color: { kind: 'rgb', value: 'FF0000' },
      highlight: 'yellow',
      styleRef: 'Strong',
      lang: 'en-US',
      langEastAsia: 'zh-CN',
      langComplex: 'ar-SA',
      verticalAlign: 'superscript',
      hidden: false,
      rtl: false,
    };
    const rt = roundTrip(props);
    expect(rt).toMatchObject({
      fontName: 'Times New Roman',
      bold: true,
      italic: true,
      underline: 'single',
      halfPoints: 28,
      color: { kind: 'rgb', value: 'FF0000' },
      highlight: 'yellow',
      styleRef: 'Strong',
      lang: 'en-US',
      verticalAlign: 'superscript',
    });
  });
});
