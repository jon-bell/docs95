// Bidirectional mapper: <w:rPr> XML ↔ RunProps.
// Parses the serialized rPr XML string stored in WireRun and produces a typed RunProps.
// On write, serializes RunProps back to a <w:rPr> fragment.
// Unknown children of rPr are preserved as opaque XML per ADR-0013.
import type { RunProps, UnderlineKind, ColorValue, HighlightColor } from '@word/domain';
import { parseXml, attr } from '../xml/reader.js';
import type { XmlElement } from '../xml/reader.js';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function wAttr(el: XmlElement, local: string): string | null {
  return attr(el, W, local);
}

/**
 * A boolean toggle element is "true" when it is present and either has no
 * w:val attribute or has w:val="true"/"1"/"on". It is "false" only when
 * explicitly set to "false"/"0"/"off".
 */
function readToggle(el: XmlElement | null): boolean | undefined {
  if (el == null) return undefined;
  const val = wAttr(el, 'val');
  if (val == null || val === 'true' || val === '1' || val === 'on') return true;
  if (val === 'false' || val === '0' || val === 'off') return false;
  return true;
}

function readColor(el: XmlElement | null): ColorValue | undefined {
  if (el == null) return undefined;
  const val = wAttr(el, 'val');
  if (val == null) return undefined;
  if (val === 'auto') return { kind: 'auto' };
  const themeColor = wAttr(el, 'themeColor');
  if (themeColor != null) {
    const tintRaw = wAttr(el, 'tint');
    const shadeRaw = wAttr(el, 'shade');
    // exactOptionalPropertyTypes: only include tint/shade when non-null.
    return tintRaw != null && shadeRaw != null
      ? { kind: 'themed', themeColor, tint: tintRaw, shade: shadeRaw }
      : tintRaw != null
        ? { kind: 'themed', themeColor, tint: tintRaw }
        : shadeRaw != null
          ? { kind: 'themed', themeColor, shade: shadeRaw }
          : { kind: 'themed', themeColor };
  }
  // 6-digit hex RRGGBB
  if (/^[0-9A-Fa-f]{6}$/.test(val)) {
    return { kind: 'rgb', value: val.toUpperCase() };
  }
  return undefined;
}

function readUnderline(el: XmlElement | null): UnderlineKind | undefined {
  if (el == null) return undefined;
  const val = wAttr(el, 'val');
  if (val == null) return 'single';
  const KNOWN: ReadonlySet<string> = new Set([
    'none',
    'single',
    'words',
    'double',
    'thick',
    'dotted',
    'dottedHeavy',
    'dash',
    'dashHeavy',
    'dashLong',
    'dashLongHeavy',
    'dotDash',
    'dotDashHeavy',
    'dotDotDash',
    'dotDotDashHeavy',
    'wave',
    'wavyHeavy',
    'wavyDouble',
  ]);
  return KNOWN.has(val) ? (val as UnderlineKind) : 'single';
}

function readHighlight(el: XmlElement | null): HighlightColor | undefined {
  if (el == null) return undefined;
  const val = wAttr(el, 'val');
  if (val == null) return undefined;
  const KNOWN: ReadonlySet<string> = new Set([
    'none',
    'black',
    'blue',
    'cyan',
    'darkBlue',
    'darkCyan',
    'darkGray',
    'darkGreen',
    'darkMagenta',
    'darkRed',
    'darkYellow',
    'green',
    'lightGray',
    'magenta',
    'red',
    'white',
    'yellow',
  ]);
  return KNOWN.has(val) ? (val as HighlightColor) : undefined;
}

// ─── Parse ─────────────────────────────────────────────────────────────────────

/**
 * Parse a serialized `<w:rPr>...</w:rPr>` XML string into a RunProps.
 * Returns an empty object when rPrXml is null (no formatting applied).
 * Unknown child elements are collected and returned separately so the caller
 * can round-trip them through the wire layer.
 */
export interface ParsedRunProps {
  readonly props: RunProps;
  readonly unknownXml: readonly string[];
}

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** Ensure `xmlns:w` is declared on the fragment so it can be parsed standalone. */
function withWNs(xml: string): string {
  // If it already has the namespace, don't add it again.
  if (xml.includes(W_NS)) return xml;
  return xml.replace(/^(<w:\w+)/, `$1 xmlns:w="${W_NS}"`);
}

export function parseRunProps(rPrXml: string | null): ParsedRunProps {
  if (rPrXml == null) return { props: {}, unknownXml: [] };

  const doc = parseXml(withWNs(rPrXml));
  const el = doc.root; // <w:rPr>

  const unknownXml: string[] = [];
  const props: Record<string, unknown> = {};

  for (const child of el.children) {
    if (child.type !== 'element') continue;
    if (child.uri !== W) {
      unknownXml.push(serializeEl(child));
      continue;
    }
    switch (child.local) {
      case 'b':
        props['bold'] = readToggle(child) ?? true;
        break;
      case 'bCs':
        // bCs mirrors bold for complex scripts; we use the same bold field.
        // Only set if bold not already set by <w:b>.
        if (props['bold'] == null) props['bold'] = readToggle(child) ?? true;
        break;
      case 'i':
        props['italic'] = readToggle(child) ?? true;
        break;
      case 'iCs':
        if (props['italic'] == null) props['italic'] = readToggle(child) ?? true;
        break;
      case 'u':
        props['underline'] = readUnderline(child);
        break;
      case 'strike':
        props['strike'] = readToggle(child) ?? true;
        break;
      case 'dstrike':
        props['doubleStrike'] = readToggle(child) ?? true;
        break;
      case 'caps':
        props['caps'] = readToggle(child) ?? true;
        break;
      case 'smallCaps':
        props['smallCaps'] = readToggle(child) ?? true;
        break;
      case 'color':
        props['color'] = readColor(child);
        break;
      case 'sz':
      case 'szCs': {
        if (props['halfPoints'] == null) {
          const v = wAttr(child, 'val');
          if (v != null) {
            const n = parseInt(v, 10);
            if (!isNaN(n)) props['halfPoints'] = n;
          }
        }
        break;
      }
      case 'rFonts': {
        const ascii = wAttr(child, 'ascii');
        const hAnsi = wAttr(child, 'hAnsi');
        const eastAsia = wAttr(child, 'eastAsia');
        const cs = wAttr(child, 'cs');
        // Coalesce ascii/hAnsi → fontName, prefer ascii.
        const fontName = ascii ?? hAnsi ?? undefined;
        if (fontName != null) props['fontName'] = fontName;
        if (eastAsia != null) props['fontNameEastAsia'] = eastAsia;
        if (cs != null) props['fontNameComplex'] = cs;
        break;
      }
      case 'highlight':
        props['highlight'] = readHighlight(child);
        break;
      case 'rStyle': {
        const v = wAttr(child, 'val');
        if (v != null) props['styleRef'] = v;
        break;
      }
      case 'lang': {
        const v = wAttr(child, 'val');
        const ea = wAttr(child, 'eastAsia');
        const bidi = wAttr(child, 'bidi');
        if (v != null) props['lang'] = v;
        if (ea != null) props['langEastAsia'] = ea;
        if (bidi != null) props['langComplex'] = bidi;
        break;
      }
      case 'vertAlign': {
        const v = wAttr(child, 'val');
        if (v === 'superscript' || v === 'subscript' || v === 'baseline') {
          props['verticalAlign'] = v;
        }
        break;
      }
      case 'vanish':
        props['hidden'] = readToggle(child) ?? true;
        break;
      case 'rtl':
        props['rtl'] = readToggle(child) ?? true;
        break;
      default:
        unknownXml.push(serializeEl(child));
    }
  }

  // Remove any undefined values (keep type clean).
  const cleaned: Partial<RunProps> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v != null) (cleaned as Record<string, unknown>)[k] = v;
  }

  return { props: cleaned as RunProps, unknownXml };
}

// ─── Serialize ─────────────────────────────────────────────────────────────────

function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Minimal re-serializer for unknown child elements read from the wire. */
function serializeEl(el: XmlElement): string {
  const prefix = el.prefix ? `${el.prefix}:` : '';
  const tag = `${prefix}${el.local}`;
  const attrs = el.attrs
    .map((a) => {
      const ap = a.prefix ? `${a.prefix}:` : '';
      return ` ${ap}${a.local}="${escXml(a.value)}"`;
    })
    .join('');
  if (el.children.length === 0) return `<${tag}${attrs}/>`;
  const inner = el.children
    .map((c) => (c.type === 'text' ? escXml(c.value) : serializeEl(c)))
    .join('');
  return `<${tag}${attrs}>${inner}</${tag}>`;
}

/** Emit a boolean toggle element. Omit when value is exactly false (suppresses inherited). */
function emitToggle(local: string, val: boolean | undefined): string {
  if (val == null) return '';
  if (val === false) return `<w:${local} w:val="0"/>`;
  return `<w:${local}/>`;
}

/**
 * Serialize RunProps (+ any round-tripped unknown children) into a
 * `<w:rPr>...</w:rPr>` string, or null if there is nothing to emit.
 * The element order follows the ECMA-376 Transitional schema sequence so
 * round-trip output is deterministic.
 */
export function serializeRunProps(
  props: RunProps,
  unknownXml: readonly string[] = [],
): string | null {
  const parts: string[] = [];

  // ECMA-376 §17.3.2.27 defines the CT_RPr sequence order.
  // We emit in schema order to stay deterministic.

  if (props.styleRef != null) parts.push(`<w:rStyle w:val="${escXml(props.styleRef)}"/>`);
  if (props.fontName != null || props.fontNameEastAsia != null || props.fontNameComplex != null) {
    const ascii = props.fontName != null ? ` w:ascii="${escXml(props.fontName)}"` : '';
    const hAnsi = props.fontName != null ? ` w:hAnsi="${escXml(props.fontName)}"` : '';
    const ea =
      props.fontNameEastAsia != null ? ` w:eastAsia="${escXml(props.fontNameEastAsia)}"` : '';
    const cs = props.fontNameComplex != null ? ` w:cs="${escXml(props.fontNameComplex)}"` : '';
    parts.push(`<w:rFonts${ascii}${hAnsi}${ea}${cs}/>`);
  }

  parts.push(emitToggle('b', props.bold));
  // Emit bCs mirroring bold for complex-script fidelity.
  parts.push(emitToggle('bCs', props.bold));
  parts.push(emitToggle('i', props.italic));
  parts.push(emitToggle('iCs', props.italic));

  if (props.caps != null) parts.push(emitToggle('caps', props.caps));
  if (props.smallCaps != null) parts.push(emitToggle('smallCaps', props.smallCaps));
  if (props.strike != null) parts.push(emitToggle('strike', props.strike));
  if (props.doubleStrike != null) parts.push(emitToggle('dstrike', props.doubleStrike));

  if (props.color != null) {
    const c = props.color;
    if (c.kind === 'auto') {
      parts.push(`<w:color w:val="auto"/>`);
    } else if (c.kind === 'rgb') {
      parts.push(`<w:color w:val="${escXml(c.value)}"/>`);
    } else if (c.kind === 'themed') {
      const tint = c.tint != null ? ` w:tint="${escXml(c.tint)}"` : '';
      const shade = c.shade != null ? ` w:shade="${escXml(c.shade)}"` : '';
      parts.push(`<w:color w:val="auto" w:themeColor="${escXml(c.themeColor)}"${tint}${shade}/>`);
    }
  }

  if (props.halfPoints != null) {
    parts.push(`<w:sz w:val="${props.halfPoints}"/>`);
    parts.push(`<w:szCs w:val="${props.halfPoints}"/>`);
  }

  if (props.underline != null) {
    parts.push(`<w:u w:val="${escXml(props.underline)}"/>`);
  }

  if (props.verticalAlign != null) {
    parts.push(`<w:vertAlign w:val="${escXml(props.verticalAlign)}"/>`);
  }

  if (props.hidden != null) parts.push(emitToggle('vanish', props.hidden));
  if (props.rtl != null) parts.push(emitToggle('rtl', props.rtl));

  if (props.highlight != null) {
    parts.push(`<w:highlight w:val="${escXml(props.highlight)}"/>`);
  }

  if (props.lang != null || props.langEastAsia != null || props.langComplex != null) {
    const v = props.lang != null ? ` w:val="${escXml(props.lang)}"` : '';
    const ea = props.langEastAsia != null ? ` w:eastAsia="${escXml(props.langEastAsia)}"` : '';
    const bidi = props.langComplex != null ? ` w:bidi="${escXml(props.langComplex)}"` : '';
    parts.push(`<w:lang${v}${ea}${bidi}/>`);
  }

  // Unknown passthrough children at end.
  for (const xml of unknownXml) parts.push(xml);

  if (parts.length === 0 && unknownXml.length === 0) return null;
  const inner = parts.filter(Boolean).join('');
  if (inner === '') return null;
  return `<w:rPr>${inner}</w:rPr>`;
}
