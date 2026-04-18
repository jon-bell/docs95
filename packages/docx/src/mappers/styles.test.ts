// Tests for styles.xml ↔ StyleRegistry mapper.
// Covers: parse, serialize, structural round-trip, docDefaults.
import { describe, it, expect } from 'vitest';
import { parseStyles, serializeStyles } from './styles.js';

// ─── Sample styles.xml ────────────────────────────────────────────────────────

const SAMPLE_STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
        <w:sz w:val="24"/>
        <w:lang w:val="en-US"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="200" w:line="276" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr><w:sz w:val="24"/></w:rPr>
  </w:style>
  <w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont">
    <w:name w:val="Default Paragraph Font"/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:pPr>
      <w:keepNext/>
      <w:outlineLvl w:val="0"/>
    </w:pPr>
    <w:rPr>
      <w:b/>
      <w:sz w:val="40"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:pPr>
      <w:keepNext/>
      <w:outlineLvl w:val="1"/>
    </w:pPr>
    <w:rPr>
      <w:b/>
      <w:sz w:val="32"/>
    </w:rPr>
  </w:style>
  <w:style w:type="character" w:styleId="Emphasis">
    <w:name w:val="Emphasis"/>
    <w:rPr><w:i/></w:rPr>
  </w:style>
</w:styles>`;

// ─── Parse tests ──────────────────────────────────────────────────────────────

describe('parseStyles', () => {
  it('parses all style entries', () => {
    const { registry } = parseStyles(SAMPLE_STYLES_XML);
    expect(registry.styles.size).toBe(5);
    expect(registry.styles.has('Normal')).toBe(true);
    expect(registry.styles.has('Heading1')).toBe(true);
    expect(registry.styles.has('Heading2')).toBe(true);
    expect(registry.styles.has('Emphasis')).toBe(true);
  });

  it('captures default paragraph style id', () => {
    const { registry } = parseStyles(SAMPLE_STYLES_XML);
    expect(registry.defaultParagraphStyleId).toBe('Normal');
  });

  it('captures default character style id', () => {
    const { registry } = parseStyles(SAMPLE_STYLES_XML);
    expect(registry.defaultCharacterStyleId).toBe('DefaultParagraphFont');
  });

  it('sets isDefault=true on default styles', () => {
    const { registry } = parseStyles(SAMPLE_STYLES_XML);
    expect(registry.styles.get('Normal')?.isDefault).toBe(true);
    expect(registry.styles.get('Heading1')?.isDefault).toBeUndefined();
  });

  it('captures basedOn and next', () => {
    const { registry } = parseStyles(SAMPLE_STYLES_XML);
    const h1 = registry.styles.get('Heading1');
    expect(h1?.basedOn).toBe('Normal');
    expect(h1?.next).toBe('Normal');
  });

  it('captures style type', () => {
    const { registry } = parseStyles(SAMPLE_STYLES_XML);
    expect(registry.styles.get('Normal')?.type).toBe('paragraph');
    expect(registry.styles.get('Emphasis')?.type).toBe('character');
  });

  it('extracts rPr props for Normal (sz=24)', () => {
    const { runPropsById, registry } = parseStyles(SAMPLE_STYLES_XML);
    const normalStyle = registry.styles.get('Normal');
    expect(normalStyle?.runPropsId).toBeDefined();
    const rp = runPropsById.get(normalStyle!.runPropsId!);
    expect(rp?.halfPoints).toBe(24);
  });

  it('extracts pPr props for Heading1 (outlineLevel=0, keepNext)', () => {
    const { paraPropsById, registry } = parseStyles(SAMPLE_STYLES_XML);
    const h1 = registry.styles.get('Heading1');
    expect(h1?.paraPropsId).toBeDefined();
    const pp = paraPropsById.get(h1!.paraPropsId!);
    expect(pp?.outlineLevel).toBe(0);
    expect(pp?.keepNext).toBe(true);
  });

  it('extracts rPr for Heading1 (bold, sz=40)', () => {
    const { runPropsById, registry } = parseStyles(SAMPLE_STYLES_XML);
    const h1 = registry.styles.get('Heading1');
    const rp = runPropsById.get(h1!.runPropsId!);
    expect(rp?.bold).toBe(true);
    expect(rp?.halfPoints).toBe(40);
  });

  it('extracts italic from Emphasis character style', () => {
    const { runPropsById, registry } = parseStyles(SAMPLE_STYLES_XML);
    const emp = registry.styles.get('Emphasis');
    const rp = runPropsById.get(emp!.runPropsId!);
    expect(rp?.italic).toBe(true);
  });

  it('parses docDefaults rPr (font=Calibri, sz=24, lang=en-US)', () => {
    const { runPropsById, defaults } = parseStyles(SAMPLE_STYLES_XML);
    const rp = runPropsById.get(defaults.runPropsId);
    expect(rp?.fontName).toBe('Calibri');
    expect(rp?.halfPoints).toBe(24);
    expect(rp?.lang).toBe('en-US');
  });

  it('parses docDefaults pPr (after=200, lineTwips=276, lineRule=auto)', () => {
    const { paraPropsById, defaults } = parseStyles(SAMPLE_STYLES_XML);
    const pp = paraPropsById.get(defaults.paraPropsId);
    expect(pp?.spacing?.afterTwips).toBe(200);
    expect(pp?.spacing?.lineTwips).toBe(276);
    expect(pp?.spacing?.lineRule).toBe('auto');
  });
});

// ─── Structural round-trip ────────────────────────────────────────────────────

describe('styles round-trip', () => {
  it('parse → serialize → parse yields same style ids', () => {
    const p1 = parseStyles(SAMPLE_STYLES_XML);
    const xml2 = serializeStyles(p1.registry, p1.runPropsById, p1.paraPropsById, p1.defaults);
    const p2 = parseStyles(xml2);
    expect([...p2.registry.styles.keys()].sort()).toEqual([...p1.registry.styles.keys()].sort());
  });

  it('parse → serialize → parse preserves basedOn / next', () => {
    const p1 = parseStyles(SAMPLE_STYLES_XML);
    const xml2 = serializeStyles(p1.registry, p1.runPropsById, p1.paraPropsById, p1.defaults);
    const p2 = parseStyles(xml2);
    const h1 = p2.registry.styles.get('Heading1');
    expect(h1?.basedOn).toBe('Normal');
    expect(h1?.next).toBe('Normal');
  });

  it('parse → serialize → parse preserves defaultParagraphStyleId', () => {
    const p1 = parseStyles(SAMPLE_STYLES_XML);
    const xml2 = serializeStyles(p1.registry, p1.runPropsById, p1.paraPropsById, p1.defaults);
    const p2 = parseStyles(xml2);
    expect(p2.registry.defaultParagraphStyleId).toBe('Normal');
  });

  it('two serializations of the same registry produce identical output (determinism)', () => {
    const p1 = parseStyles(SAMPLE_STYLES_XML);
    const xml1 = serializeStyles(p1.registry, p1.runPropsById, p1.paraPropsById, p1.defaults);
    const xml2 = serializeStyles(p1.registry, p1.runPropsById, p1.paraPropsById, p1.defaults);
    expect(xml1).toBe(xml2);
  });

  it('Heading1 rPr round-trips with bold and sz=40', () => {
    const p1 = parseStyles(SAMPLE_STYLES_XML);
    const xml2 = serializeStyles(p1.registry, p1.runPropsById, p1.paraPropsById, p1.defaults);
    const p2 = parseStyles(xml2);
    const h1 = p2.registry.styles.get('Heading1');
    const rp = p2.runPropsById.get(h1!.runPropsId!);
    expect(rp?.bold).toBe(true);
    expect(rp?.halfPoints).toBe(40);
  });
});

// ─── Minimal styles.xml (empty doc defaults) ─────────────────────────────────

describe('parseStyles: minimal input', () => {
  const MINIMAL = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults/>
  <w:style w:type="paragraph" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>
</w:styles>`;

  it('handles missing rPrDefault and pPrDefault gracefully', () => {
    const { runPropsById, paraPropsById, defaults } = parseStyles(MINIMAL);
    expect(runPropsById.get(defaults.runPropsId)).toEqual({});
    expect(paraPropsById.get(defaults.paraPropsId)).toEqual({});
  });

  it('still parses Normal style', () => {
    const { registry } = parseStyles(MINIMAL);
    expect(registry.styles.has('Normal')).toBe(true);
  });
});
