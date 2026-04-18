// Bidirectional mapper: numbering.xml ↔ NumberingRegistry.
// Reads <w:abstractNum> and <w:num> entries; serializes deterministically.
// Supports basic formats: decimal, bullet, upperLetter, lowerLetter, upperRoman, lowerRoman.
import type { NumberingRegistry, NumberingDef } from '@word/domain';
import { parseXml, attr, childElement, childElements } from '../xml/reader.js';
import type { XmlElement } from '../xml/reader.js';
import { parseRunProps, serializeRunProps } from './run-props.js';
import { parseParaProps, serializeParaProps } from './para-props.js';
import type { RunProps, ParaProps } from '@word/domain';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function wAttr(el: XmlElement, local: string): string | null {
  return attr(el, W, local);
}

function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function collectNs(el: XmlElement, ns: Map<string, string>): void {
  if (el.prefix && el.uri && !ns.has(el.prefix)) ns.set(el.prefix, el.uri);
  for (const a of el.attrs) {
    if (a.prefix && a.uri && a.prefix !== 'xmlns' && !ns.has(a.prefix)) {
      ns.set(a.prefix, a.uri);
    }
  }
  for (const c of el.children) {
    if (c.type === 'element') collectNs(c, ns);
  }
}

function serializeInnerEl(el: XmlElement): string {
  const prefix = el.prefix ? `${el.prefix}:` : '';
  const tag = `${prefix}${el.local}`;
  const attrStr = el.attrs
    .map((a) => {
      const ap = a.prefix ? `${a.prefix}:` : '';
      return ` ${ap}${a.local}="${escXml(a.value)}"`;
    })
    .join('');
  if (el.children.length === 0) return `<${tag}${attrStr}/>`;
  const inner = el.children
    .map((c) => (c.type === 'text' ? escXml(c.value) : serializeInnerEl(c)))
    .join('');
  return `<${tag}${attrStr}>${inner}</${tag}>`;
}

/**
 * Serialize an element to XML with namespace declarations on the root.
 * Needed when extracting child elements from numbering.xml to feed into
 * parseRunProps/parseParaProps (standalone parsers need xmlns:w declared).
 */
function serializeOuterEl(el: XmlElement): string {
  const prefix = el.prefix ? `${el.prefix}:` : '';
  const tag = `${prefix}${el.local}`;

  const nsMap = new Map<string, string>();
  collectNs(el, nsMap);
  const nsPart = [...nsMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([p, u]) => ` xmlns:${p}="${escXml(u)}"`)
    .join('');

  const attrStr = el.attrs
    .map((a) => {
      const ap = a.prefix ? `${a.prefix}:` : '';
      return ` ${ap}${a.local}="${escXml(a.value)}"`;
    })
    .join('');
  if (el.children.length === 0) return `<${tag}${nsPart}${attrStr}/>`;
  const inner = el.children
    .map((c) => (c.type === 'text' ? escXml(c.value) : serializeInnerEl(c)))
    .join('');
  return `<${tag}${nsPart}${attrStr}>${inner}</${tag}>`;
}

// ─── Domain types for numbering level ────────────────────────────────────────

export type NumFmt =
  | 'decimal'
  | 'bullet'
  | 'upperLetter'
  | 'lowerLetter'
  | 'upperRoman'
  | 'lowerRoman'
  | 'none';

export interface NumberingLevel {
  readonly ilvl: number;
  readonly start: number;
  readonly numFmt: NumFmt;
  readonly lvlText: string;
  readonly lvlJc: 'left' | 'center' | 'right';
  readonly pPr?: ParaProps | undefined;
  readonly rPr?: RunProps | undefined;
  /** Opaque pPr unknown children. */
  readonly pPrUnknown: readonly string[];
  /** Opaque rPr unknown children. */
  readonly rPrUnknown: readonly string[];
}

export interface AbstractNum {
  readonly abstractNumId: number;
  readonly nsid?: string | undefined;
  readonly multiLevelType?: string | undefined;
  readonly levels: readonly NumberingLevel[];
}

export interface ParsedNumbering {
  readonly registry: NumberingRegistry;
  readonly abstracts: ReadonlyMap<number, AbstractNum>;
}

// ─── Parse ───────────────────────────────────────────────────────────────────

function parseLvl(el: XmlElement): NumberingLevel | null {
  const ilvlRaw = wAttr(el, 'ilvl');
  if (ilvlRaw == null) return null;
  const ilvl = parseInt(ilvlRaw, 10);
  if (isNaN(ilvl)) return null;

  const startEl = childElement(el, W, 'start');
  const startRaw = startEl != null ? wAttr(startEl, 'val') : null;
  const start = startRaw != null ? parseInt(startRaw, 10) : 1;

  const numFmtEl = childElement(el, W, 'numFmt');
  const numFmtRaw = numFmtEl != null ? wAttr(numFmtEl, 'val') : null;
  const KNOWN_FMTS: ReadonlySet<string> = new Set([
    'decimal',
    'bullet',
    'upperLetter',
    'lowerLetter',
    'upperRoman',
    'lowerRoman',
    'none',
  ]);
  const numFmt: NumFmt =
    numFmtRaw != null && KNOWN_FMTS.has(numFmtRaw) ? (numFmtRaw as NumFmt) : 'decimal';

  const lvlTextEl = childElement(el, W, 'lvlText');
  const lvlText = lvlTextEl != null ? (wAttr(lvlTextEl, 'val') ?? '') : '';

  const lvlJcEl = childElement(el, W, 'lvlJc');
  const lvlJcRaw = lvlJcEl != null ? wAttr(lvlJcEl, 'val') : null;
  const lvlJc: 'left' | 'center' | 'right' =
    lvlJcRaw === 'center' ? 'center' : lvlJcRaw === 'right' ? 'right' : 'left';

  const pPrEl = childElement(el, W, 'pPr');
  let pPr: ParaProps | undefined;
  let pPrUnknown: readonly string[] = [];
  if (pPrEl != null) {
    const parsed = parseParaProps(serializeOuterEl(pPrEl));
    pPr = parsed.props;
    pPrUnknown = parsed.unknownXml;
  }

  const rPrEl = childElement(el, W, 'rPr');
  let rPr: RunProps | undefined;
  let rPrUnknown: readonly string[] = [];
  if (rPrEl != null) {
    const parsed = parseRunProps(serializeOuterEl(rPrEl));
    rPr = parsed.props;
    rPrUnknown = parsed.unknownXml;
  }

  // exactOptionalPropertyTypes: only include pPr/rPr when defined.
  return {
    ilvl,
    start,
    numFmt,
    lvlText,
    lvlJc,
    pPrUnknown,
    rPrUnknown,
    ...(pPr != null ? { pPr } : {}),
    ...(rPr != null ? { rPr } : {}),
  };
}

function parseAbstractNum(el: XmlElement): AbstractNum | null {
  const idRaw = wAttr(el, 'abstractNumId');
  if (idRaw == null) return null;
  const abstractNumId = parseInt(idRaw, 10);
  if (isNaN(abstractNumId)) return null;

  const nsidEl = childElement(el, W, 'nsid');
  const nsid = nsidEl != null ? (wAttr(nsidEl, 'val') ?? undefined) : undefined;

  const multiLevelTypeEl = childElement(el, W, 'multiLevelType');
  const multiLevelType =
    multiLevelTypeEl != null ? (wAttr(multiLevelTypeEl, 'val') ?? undefined) : undefined;

  const lvlEls = childElements(el, W, 'lvl');
  const levels: NumberingLevel[] = [];
  for (const lvlEl of lvlEls) {
    const lvl = parseLvl(lvlEl);
    if (lvl != null) levels.push(lvl);
  }

  return {
    abstractNumId,
    levels,
    ...(nsid != null ? { nsid } : {}),
    ...(multiLevelType != null ? { multiLevelType } : {}),
  };
}

function parseNum(el: XmlElement): NumberingDef | null {
  const idRaw = wAttr(el, 'numId');
  if (idRaw == null) return null;
  const id = parseInt(idRaw, 10);
  if (isNaN(id)) return null;

  const abstractNumIdEl = childElement(el, W, 'abstractNumId');
  const abstractIdRaw = abstractNumIdEl != null ? wAttr(abstractNumIdEl, 'val') : null;
  if (abstractIdRaw == null) return null;
  const abstractId = parseInt(abstractIdRaw, 10);
  if (isNaN(abstractId)) return null;

  return { id, abstractId, overrides: [] };
}

/**
 * Parse numbering.xml into a NumberingRegistry plus rich AbstractNum data
 * needed for serialization.
 */
export function parseNumbering(xml: string): ParsedNumbering {
  const doc = parseXml(xml);
  const root = doc.root; // <w:numbering>

  const abstracts = new Map<number, AbstractNum>();
  const nums = new Map<number, NumberingDef>();

  for (const child of root.children) {
    if (child.type !== 'element' || child.uri !== W) continue;
    if (child.local === 'abstractNum') {
      const an = parseAbstractNum(child);
      if (an != null) abstracts.set(an.abstractNumId, an);
    } else if (child.local === 'num') {
      const n = parseNum(child);
      if (n != null) nums.set(n.id, n);
    }
  }

  const registry: NumberingRegistry = {
    nums,
    abstracts,
  };

  return { registry, abstracts };
}

// ─── Serialize ───────────────────────────────────────────────────────────────

const NUMBERING_NS_DECLS =
  'xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" ' +
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" ' +
  'xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" ' +
  'mc:Ignorable="w14 w15" ' +
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';

function serializeLvl(lvl: NumberingLevel): string {
  const parts: string[] = [];
  parts.push(`<w:start w:val="${lvl.start}"/>`);
  parts.push(`<w:numFmt w:val="${escXml(lvl.numFmt)}"/>`);
  parts.push(`<w:lvlText w:val="${escXml(lvl.lvlText)}"/>`);
  parts.push(`<w:lvlJc w:val="${escXml(lvl.lvlJc)}"/>`);
  if (lvl.pPr != null) {
    const pPrXml = serializeParaProps(lvl.pPr, lvl.pPrUnknown);
    if (pPrXml != null) parts.push(pPrXml);
  }
  if (lvl.rPr != null) {
    const rPrXml = serializeRunProps(lvl.rPr, lvl.rPrUnknown);
    if (rPrXml != null) parts.push(rPrXml);
  }
  return `<w:lvl w:ilvl="${lvl.ilvl}">${parts.join('')}</w:lvl>`;
}

function serializeAbstractNum(an: AbstractNum): string {
  const parts: string[] = [];
  if (an.nsid != null) parts.push(`<w:nsid w:val="${escXml(an.nsid)}"/>`);
  if (an.multiLevelType != null)
    parts.push(`<w:multiLevelType w:val="${escXml(an.multiLevelType)}"/>`);

  // Sorted by ilvl for determinism.
  const sortedLevels = [...an.levels].sort((a, b) => a.ilvl - b.ilvl);
  for (const lvl of sortedLevels) parts.push(serializeLvl(lvl));

  return `<w:abstractNum w:abstractNumId="${an.abstractNumId}">${parts.join('')}</w:abstractNum>`;
}

/**
 * Serialize NumberingRegistry + AbstractNum data back to numbering.xml.
 * Output is deterministic: abstractNums sorted by id, nums sorted by id.
 */
export function serializeNumbering(
  registry: NumberingRegistry,
  abstracts: ReadonlyMap<number, AbstractNum>,
): string {
  const sortedAbstracts = [...abstracts.values()].sort((a, b) => a.abstractNumId - b.abstractNumId);
  const sortedNums = [...registry.nums.values()].sort((a, b) => a.id - b.id);

  const abstractParts = sortedAbstracts.map(serializeAbstractNum);
  const numParts = sortedNums.map((n) => {
    return `<w:num w:numId="${n.id}">` + `<w:abstractNumId w:val="${n.abstractId}"/>` + `</w:num>`;
  });

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<w:numbering ${NUMBERING_NS_DECLS}>` +
    abstractParts.join('') +
    numParts.join('') +
    `</w:numbering>`
  );
}
