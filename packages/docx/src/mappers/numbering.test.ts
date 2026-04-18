// Tests for numbering.xml ↔ NumberingRegistry mapper.
// Covers: parse bullet list, parse decimal list, serialize, structural round-trip.
import { describe, it, expect } from 'vitest';
import { parseNumbering, serializeNumbering } from './numbering.js';

// ─── Sample numbering.xml ─────────────────────────────────────────────────────

const BULLET_NUMBERING_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:nsid w:val="00AB1234"/>
    <w:multiLevelType w:val="hybridMultilevel"/>
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="·"/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
      <w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol"/></w:rPr>
    </w:lvl>
    <w:lvl w:ilvl="1">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="o"/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="1440" w:hanging="360"/></w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1">
    <w:abstractNumId w:val="0"/>
  </w:num>
</w:numbering>`;

const DECIMAL_NUMBERING_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="1">
    <w:nsid w:val="00CD5678"/>
    <w:multiLevelType w:val="multilevel"/>
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1."/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
    </w:lvl>
    <w:lvl w:ilvl="1">
      <w:start w:val="1"/>
      <w:numFmt w:val="lowerLetter"/>
      <w:lvlText w:val="%2."/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="1440" w:hanging="360"/></w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="2">
    <w:abstractNumId w:val="1"/>
  </w:num>
  <w:num w:numId="3">
    <w:abstractNumId w:val="1"/>
  </w:num>
</w:numbering>`;

// ─── Parse: bullet ────────────────────────────────────────────────────────────

describe('parseNumbering: bullet list', () => {
  it('parses abstractNum with correct id', () => {
    const { abstracts } = parseNumbering(BULLET_NUMBERING_XML);
    expect(abstracts.has(0)).toBe(true);
  });

  it('captures nsid and multiLevelType', () => {
    const { abstracts } = parseNumbering(BULLET_NUMBERING_XML);
    const an = abstracts.get(0)!;
    expect(an.nsid).toBe('00AB1234');
    expect(an.multiLevelType).toBe('hybridMultilevel');
  });

  it('parses two levels', () => {
    const { abstracts } = parseNumbering(BULLET_NUMBERING_XML);
    expect(abstracts.get(0)!.levels).toHaveLength(2);
  });

  it('level 0 has correct fields', () => {
    const { abstracts } = parseNumbering(BULLET_NUMBERING_XML);
    const lvl0 = abstracts.get(0)!.levels[0]!;
    expect(lvl0.ilvl).toBe(0);
    expect(lvl0.start).toBe(1);
    expect(lvl0.numFmt).toBe('bullet');
    expect(lvl0.lvlText).toBe('·');
    expect(lvl0.lvlJc).toBe('left');
  });

  it('level 0 rPr captures font name (Symbol)', () => {
    const { abstracts } = parseNumbering(BULLET_NUMBERING_XML);
    const lvl0 = abstracts.get(0)!.levels[0]!;
    expect(lvl0.rPr?.fontName).toBe('Symbol');
  });

  it('level 0 pPr captures indent (left=720 hanging=360)', () => {
    const { abstracts } = parseNumbering(BULLET_NUMBERING_XML);
    const lvl0 = abstracts.get(0)!.levels[0]!;
    expect(lvl0.pPr?.indent?.leftTwips).toBe(720);
    expect(lvl0.pPr?.indent?.hangingTwips).toBe(360);
  });

  it('parses num with numId=1 and abstractId=0', () => {
    const { registry } = parseNumbering(BULLET_NUMBERING_XML);
    const num = registry.nums.get(1)!;
    expect(num.id).toBe(1);
    expect(num.abstractId).toBe(0);
  });
});

// ─── Parse: decimal ──────────────────────────────────────────────────────────

describe('parseNumbering: decimal list', () => {
  it('level 0 numFmt is decimal', () => {
    const { abstracts } = parseNumbering(DECIMAL_NUMBERING_XML);
    const lvl0 = abstracts.get(1)!.levels[0]!;
    expect(lvl0.numFmt).toBe('decimal');
    expect(lvl0.lvlText).toBe('%1.');
  });

  it('level 1 numFmt is lowerLetter', () => {
    const { abstracts } = parseNumbering(DECIMAL_NUMBERING_XML);
    const lvl1 = abstracts.get(1)!.levels[1]!;
    expect(lvl1.numFmt).toBe('lowerLetter');
  });

  it('parses two nums', () => {
    const { registry } = parseNumbering(DECIMAL_NUMBERING_XML);
    expect(registry.nums.size).toBe(2);
    expect(registry.nums.has(2)).toBe(true);
    expect(registry.nums.has(3)).toBe(true);
  });
});

// ─── Structural round-trip ────────────────────────────────────────────────────

describe('numbering round-trip', () => {
  it('bullet: parse → serialize → parse yields same abstractNum id', () => {
    const p1 = parseNumbering(BULLET_NUMBERING_XML);
    const xml2 = serializeNumbering(p1.registry, p1.abstracts);
    const p2 = parseNumbering(xml2);
    expect(p2.abstracts.has(0)).toBe(true);
  });

  it('bullet: parse → serialize → parse preserves level count', () => {
    const p1 = parseNumbering(BULLET_NUMBERING_XML);
    const xml2 = serializeNumbering(p1.registry, p1.abstracts);
    const p2 = parseNumbering(xml2);
    expect(p2.abstracts.get(0)!.levels).toHaveLength(2);
  });

  it('bullet: parse → serialize → parse preserves numFmt and lvlText', () => {
    const p1 = parseNumbering(BULLET_NUMBERING_XML);
    const xml2 = serializeNumbering(p1.registry, p1.abstracts);
    const p2 = parseNumbering(xml2);
    const lvl0 = p2.abstracts.get(0)!.levels[0]!;
    expect(lvl0.numFmt).toBe('bullet');
    expect(lvl0.lvlText).toBe('·');
  });

  it('bullet: parse → serialize → parse preserves pPr indentation', () => {
    const p1 = parseNumbering(BULLET_NUMBERING_XML);
    const xml2 = serializeNumbering(p1.registry, p1.abstracts);
    const p2 = parseNumbering(xml2);
    const lvl0 = p2.abstracts.get(0)!.levels[0]!;
    expect(lvl0.pPr?.indent?.leftTwips).toBe(720);
    expect(lvl0.pPr?.indent?.hangingTwips).toBe(360);
  });

  it('decimal: parse → serialize → parse preserves lowerLetter at level 1', () => {
    const p1 = parseNumbering(DECIMAL_NUMBERING_XML);
    const xml2 = serializeNumbering(p1.registry, p1.abstracts);
    const p2 = parseNumbering(xml2);
    const lvl1 = p2.abstracts.get(1)!.levels[1]!;
    expect(lvl1.numFmt).toBe('lowerLetter');
  });

  it('two serializations of the same registry produce identical output (determinism)', () => {
    const p1 = parseNumbering(DECIMAL_NUMBERING_XML);
    const xml1 = serializeNumbering(p1.registry, p1.abstracts);
    const xml2 = serializeNumbering(p1.registry, p1.abstracts);
    expect(xml1).toBe(xml2);
  });

  it('num references survive round-trip', () => {
    const p1 = parseNumbering(DECIMAL_NUMBERING_XML);
    const xml2 = serializeNumbering(p1.registry, p1.abstracts);
    const p2 = parseNumbering(xml2);
    expect(p2.registry.nums.get(2)?.abstractId).toBe(1);
    expect(p2.registry.nums.get(3)?.abstractId).toBe(1);
  });
});
