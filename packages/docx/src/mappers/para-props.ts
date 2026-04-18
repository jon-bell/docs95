// Bidirectional mapper: <w:pPr> XML ↔ ParaProps.
// Parses the serialized pPr XML string stored in WireParagraph.
// Unknown pPr children are preserved as opaque XML for round-trip.
import type { ParaProps, TabStop } from '@word/domain';
import { parseXml, attr, childElement, childElements } from '../xml/reader.js';
import type { XmlElement } from '../xml/reader.js';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function wAttr(el: XmlElement, local: string): string | null {
  return attr(el, W, local);
}

function readInt(el: XmlElement, local: string): number | undefined {
  const v = wAttr(el, local);
  if (v == null) return undefined;
  const n = parseInt(v, 10);
  return isNaN(n) ? undefined : n;
}

function readBoolToggle(el: XmlElement | null): boolean | undefined {
  if (el == null) return undefined;
  const val = wAttr(el, 'val');
  if (val == null || val === 'true' || val === '1' || val === 'on') return true;
  if (val === 'false' || val === '0' || val === 'off') return false;
  return true;
}

// ─── Parse ─────────────────────────────────────────────────────────────────────

export interface ParsedParaProps {
  readonly props: ParaProps;
  readonly unknownXml: readonly string[];
}

function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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

function parseTabStop(el: XmlElement): TabStop | null {
  const val = wAttr(el, 'val');
  const pos = wAttr(el, 'pos');
  if (pos == null) return null;
  const posTwips = parseInt(pos, 10);
  if (isNaN(posTwips)) return null;

  const KIND_MAP: Record<string, TabStop['kind']> = {
    left: 'left',
    center: 'center',
    right: 'right',
    decimal: 'decimal',
    bar: 'bar',
    clear: 'clear',
  };
  const kind: TabStop['kind'] = val != null && KIND_MAP[val] != null ? KIND_MAP[val]! : 'left';

  const leader = wAttr(el, 'leader');
  const LEADER_MAP: Record<string, NonNullable<TabStop['leader']>> = {
    none: 'none',
    dot: 'dot',
    hyphen: 'hyphen',
    underscore: 'underscore',
    heavy: 'heavy',
    middleDot: 'middleDot',
  };

  // exactOptionalPropertyTypes: only include leader when it is a known value.
  if (leader != null && LEADER_MAP[leader] != null) {
    return { positionTwips: posTwips, kind, leader: LEADER_MAP[leader] };
  }
  return { positionTwips: posTwips, kind };
}

// Mutable accumulator — we build the object and only freeze it when returning.
interface MutableParaProps {
  styleRef?: string;
  alignment?: ParaProps['alignment'];
  indent?: ParaProps['indent'];
  spacing?: ParaProps['spacing'];
  numbering?: ParaProps['numbering'];
  tabs?: readonly TabStop[];
  keepLines?: boolean;
  keepNext?: boolean;
  pageBreakBefore?: boolean;
  widowControl?: boolean;
  outlineLevel?: number;
  bidi?: boolean;
}

/**
 * Parse a serialized `<w:pPr>...</w:pPr>` XML string into ParaProps.
 * Returns an empty object when pPrXml is null.
 */
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** Ensure `xmlns:w` is declared on the fragment so it can be parsed standalone. */
function withWNs(xml: string): string {
  if (xml.includes(W_NS)) return xml;
  return xml.replace(/^(<w:\w+)/, `$1 xmlns:w="${W_NS}"`);
}

export function parseParaProps(pPrXml: string | null): ParsedParaProps {
  if (pPrXml == null) return { props: {}, unknownXml: [] };

  const doc = parseXml(withWNs(pPrXml));
  const el = doc.root; // <w:pPr>

  const unknownXml: string[] = [];
  const props: MutableParaProps = {};

  for (const child of el.children) {
    if (child.type !== 'element') continue;
    if (child.uri !== W) {
      unknownXml.push(serializeEl(child));
      continue;
    }
    switch (child.local) {
      case 'pStyle': {
        const v = wAttr(child, 'val');
        if (v != null) props.styleRef = v;
        break;
      }
      case 'jc': {
        const v = wAttr(child, 'val');
        if (v === 'left') props.alignment = 'left';
        else if (v === 'center') props.alignment = 'center';
        else if (v === 'right') props.alignment = 'right';
        else if (v === 'both') props.alignment = 'justify';
        else if (v === 'distribute') props.alignment = 'distribute';
        break;
      }
      case 'ind': {
        const left = readInt(child, 'left');
        const right = readInt(child, 'right');
        const firstLine = readInt(child, 'firstLine');
        const hanging = readInt(child, 'hanging');
        if (left != null || right != null || firstLine != null || hanging != null) {
          // exactOptionalPropertyTypes: only include fields that have values.
          props.indent = {
            ...(left != null ? { leftTwips: left } : {}),
            ...(right != null ? { rightTwips: right } : {}),
            ...(firstLine != null ? { firstLineTwips: firstLine } : {}),
            ...(hanging != null ? { hangingTwips: hanging } : {}),
          };
        }
        break;
      }
      case 'spacing': {
        const before = readInt(child, 'before');
        const after = readInt(child, 'after');
        const line = readInt(child, 'line');
        const lineRuleRaw = wAttr(child, 'lineRule');
        const lineRule: 'auto' | 'atLeast' | 'exact' =
          lineRuleRaw === 'atLeast' ? 'atLeast' : lineRuleRaw === 'exact' ? 'exact' : 'auto';
        if (before != null || after != null || line != null || lineRuleRaw != null) {
          props.spacing = {
            ...(before != null ? { beforeTwips: before } : {}),
            ...(after != null ? { afterTwips: after } : {}),
            ...(line != null ? { lineTwips: line } : {}),
            ...(lineRuleRaw != null ? { lineRule } : {}),
          };
        }
        break;
      }
      case 'numPr': {
        const numIdEl = childElement(child, W, 'numId');
        const ilvlEl = childElement(child, W, 'ilvl');
        const numIdVal = numIdEl != null ? wAttr(numIdEl, 'val') : null;
        const ilvlVal = ilvlEl != null ? wAttr(ilvlEl, 'val') : null;
        if (numIdVal != null && ilvlVal != null) {
          const numId = parseInt(numIdVal, 10);
          const ilvl = parseInt(ilvlVal, 10);
          if (!isNaN(numId) && !isNaN(ilvl)) {
            props.numbering = { numId, ilvl };
          }
        }
        break;
      }
      case 'tabs': {
        const tabEls = childElements(child, W, 'tab');
        const tabs: TabStop[] = [];
        for (const tabEl of tabEls) {
          const ts = parseTabStop(tabEl);
          if (ts != null) tabs.push(ts);
        }
        if (tabs.length > 0) props.tabs = tabs;
        break;
      }
      case 'keepLines':
        props.keepLines = readBoolToggle(child) ?? true;
        break;
      case 'keepNext':
        props.keepNext = readBoolToggle(child) ?? true;
        break;
      case 'pageBreakBefore':
        props.pageBreakBefore = readBoolToggle(child) ?? true;
        break;
      case 'widowControl': {
        props.widowControl = readBoolToggle(child) ?? true;
        break;
      }
      case 'outlineLvl': {
        const v = wAttr(child, 'val');
        if (v != null) {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n >= 0 && n <= 9) props.outlineLevel = n;
        }
        break;
      }
      case 'bidi':
        props.bidi = readBoolToggle(child) ?? true;
        break;
      default:
        unknownXml.push(serializeEl(child));
    }
  }

  return { props: props as ParaProps, unknownXml };
}

// ─── Serialize ─────────────────────────────────────────────────────────────────

function emitToggle(local: string, val: boolean | undefined): string {
  if (val == null) return '';
  if (val === false) return `<w:${local} w:val="0"/>`;
  return `<w:${local}/>`;
}

/**
 * Serialize ParaProps (+ any round-tripped unknown children) into a
 * `<w:pPr>...</w:pPr>` string, or null if there is nothing to emit.
 * Element order follows the ECMA-376 CT_PPr sequence for determinism.
 */
export function serializeParaProps(
  props: ParaProps,
  unknownXml: readonly string[] = [],
): string | null {
  const parts: string[] = [];

  if (props.styleRef != null) {
    parts.push(`<w:pStyle w:val="${escXml(props.styleRef)}"/>`);
  }

  if (props.keepNext != null) parts.push(emitToggle('keepNext', props.keepNext));
  if (props.keepLines != null) parts.push(emitToggle('keepLines', props.keepLines));
  if (props.pageBreakBefore != null)
    parts.push(emitToggle('pageBreakBefore', props.pageBreakBefore));

  if (props.bidi != null) parts.push(emitToggle('bidi', props.bidi));

  if (props.outlineLevel != null) {
    parts.push(`<w:outlineLvl w:val="${props.outlineLevel}"/>`);
  }

  if (props.tabs != null && props.tabs.length > 0) {
    const tabParts = props.tabs.map((t) => {
      const leader = t.leader != null ? ` w:leader="${escXml(t.leader)}"` : '';
      return `<w:tab w:val="${escXml(t.kind)}" w:pos="${t.positionTwips}"${leader}/>`;
    });
    parts.push(`<w:tabs>${tabParts.join('')}</w:tabs>`);
  }

  if (props.numbering != null) {
    parts.push(
      `<w:numPr><w:ilvl w:val="${props.numbering.ilvl}"/><w:numId w:val="${props.numbering.numId}"/></w:numPr>`,
    );
  }

  if (props.spacing != null) {
    const s = props.spacing;
    const before = s.beforeTwips != null ? ` w:before="${s.beforeTwips}"` : '';
    const after = s.afterTwips != null ? ` w:after="${s.afterTwips}"` : '';
    const line = s.lineTwips != null ? ` w:line="${s.lineTwips}"` : '';
    const lineRule = s.lineRule != null ? ` w:lineRule="${escXml(s.lineRule)}"` : '';
    parts.push(`<w:spacing${before}${after}${line}${lineRule}/>`);
  }

  if (props.indent != null) {
    const i = props.indent;
    const left = i.leftTwips != null ? ` w:left="${i.leftTwips}"` : '';
    const right = i.rightTwips != null ? ` w:right="${i.rightTwips}"` : '';
    const firstLine = i.firstLineTwips != null ? ` w:firstLine="${i.firstLineTwips}"` : '';
    const hanging = i.hangingTwips != null ? ` w:hanging="${i.hangingTwips}"` : '';
    parts.push(`<w:ind${left}${right}${firstLine}${hanging}/>`);
  }

  if (props.alignment != null) {
    // Domain "justify" maps back to OOXML "both".
    const jcVal = props.alignment === 'justify' ? 'both' : props.alignment;
    parts.push(`<w:jc w:val="${escXml(jcVal)}"/>`);
  }

  if (props.widowControl != null) parts.push(emitToggle('widowControl', props.widowControl));

  for (const xml of unknownXml) parts.push(xml);

  if (parts.length === 0) return null;
  return `<w:pPr>${parts.join('')}</w:pPr>`;
}
