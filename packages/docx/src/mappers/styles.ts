// Bidirectional mapper: styles.xml ↔ StyleRegistry + DocDefaults.
// Parses <w:styles> root with <w:docDefaults> and <w:style> entries.
// Serializes deterministically (sorted by styleId for byte-stable output).
import type {
  StyleDef,
  StyleRegistry,
  DocDefaults,
  PropsId,
  RunProps,
  ParaProps,
} from '@word/domain';
import { asPropsId } from '@word/domain';
import { parseXml, attr, childElement } from '../xml/reader.js';
import type { XmlElement } from '../xml/reader.js';
import { parseRunProps, serializeRunProps } from './run-props.js';
import { parseParaProps, serializeParaProps } from './para-props.js';

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

// ─── PropsId helpers ─────────────────────────────────────────────────────────

/**
 * A flat intern table mapping serialized props JSON to a stable PropsId.
 * Styles.ts is the only place that needs this; the real MutablePropsRegistry
 * lives on the Document. For the two-stage AST→Domain pipeline we simply
 * derive a deterministic ID from the props content.
 */
function makePropsId(kind: 'r' | 'p', styleId: string, suffix?: string): PropsId {
  return asPropsId(`style:${kind}:${styleId}${suffix != null ? `:${suffix}` : ''}`);
}

// ─── Parse ───────────────────────────────────────────────────────────────────

export interface ParsedStyles {
  readonly registry: StyleRegistry;
  /** Extracted props keyed by PropsId — caller merges into PropsRegistry. */
  readonly runPropsById: ReadonlyMap<PropsId, RunProps>;
  readonly paraPropsById: ReadonlyMap<PropsId, ParaProps>;
  readonly defaults: DocDefaults;
}

function parseDocDefaults(
  el: XmlElement,
  runPropsById: Map<PropsId, RunProps>,
  paraPropsById: Map<PropsId, ParaProps>,
): DocDefaults {
  // <w:docDefaults>
  //   <w:rPrDefault><w:rPr>...</w:rPr></w:rPrDefault>
  //   <w:pPrDefault><w:pPr>...</w:pPr></w:pPrDefault>
  // </w:docDefaults>

  const defaultRunId = asPropsId('__default_run__');
  const defaultParaId = asPropsId('__default_para__');

  const rPrDefaultEl = childElement(el, W, 'rPrDefault');
  if (rPrDefaultEl != null) {
    const rPrEl = childElement(rPrDefaultEl, W, 'rPr');
    if (rPrEl != null) {
      const rPrXml = serializeOuterEl(rPrEl);
      const { props } = parseRunProps(rPrXml);
      runPropsById.set(defaultRunId, props);
    } else {
      runPropsById.set(defaultRunId, {});
    }
  } else {
    runPropsById.set(defaultRunId, {});
  }

  const pPrDefaultEl = childElement(el, W, 'pPrDefault');
  if (pPrDefaultEl != null) {
    const pPrEl = childElement(pPrDefaultEl, W, 'pPr');
    if (pPrEl != null) {
      const pPrXml = serializeOuterEl(pPrEl);
      const { props } = parseParaProps(pPrXml);
      paraPropsById.set(defaultParaId, props);
    } else {
      paraPropsById.set(defaultParaId, {});
    }
  } else {
    paraPropsById.set(defaultParaId, {});
  }

  return { runPropsId: defaultRunId, paraPropsId: defaultParaId };
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
 * Serialize an element to XML with the `xmlns:w` namespace declaration on the root.
 * This is needed when extracting child elements (e.g. <w:rPr>) from styles.xml to
 * feed back into parseRunProps/parseParaProps, which use the standalone saxes parser.
 */
function serializeOuterEl(el: XmlElement): string {
  const prefix = el.prefix ? `${el.prefix}:` : '';
  const tag = `${prefix}${el.local}`;

  // Collect all namespace prefixes used in this subtree so the standalone fragment is valid XML.
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

function parseStyleEl(
  el: XmlElement,
  runPropsById: Map<PropsId, RunProps>,
  paraPropsById: Map<PropsId, ParaProps>,
): StyleDef | null {
  const typeRaw = wAttr(el, 'type');
  if (typeRaw == null) return null;
  const type =
    typeRaw === 'paragraph'
      ? 'paragraph'
      : typeRaw === 'character'
        ? 'character'
        : typeRaw === 'table'
          ? 'table'
          : typeRaw === 'numbering'
            ? 'numbering'
            : null;
  if (type == null) return null;

  const id = wAttr(el, 'styleId');
  if (id == null) return null;

  // <w:name w:val="..."/>
  const nameEl = childElement(el, W, 'name');
  const name = nameEl != null ? (wAttr(nameEl, 'val') ?? id) : id;

  const basedOnEl = childElement(el, W, 'basedOn');
  const basedOn = basedOnEl != null ? (wAttr(basedOnEl, 'val') ?? undefined) : undefined;

  const nextEl = childElement(el, W, 'next');
  const next = nextEl != null ? (wAttr(nextEl, 'val') ?? undefined) : undefined;

  const linkEl = childElement(el, W, 'link');
  const link = linkEl != null ? (wAttr(linkEl, 'val') ?? undefined) : undefined;

  const isDefault = wAttr(el, 'default') === '1' || wAttr(el, 'default') === 'true';
  const hidden = childElement(el, W, 'hidden') != null;
  const builtIn = childElement(el, W, 'semiHidden') == null; // rough heuristic

  // rPr
  const rPrEl = childElement(el, W, 'rPr');
  let runPropsId: PropsId | undefined;
  if (rPrEl != null) {
    const rPrXml = serializeOuterEl(rPrEl);
    const { props } = parseRunProps(rPrXml);
    runPropsId = makePropsId('r', id);
    runPropsById.set(runPropsId, props);
  }

  // pPr
  const pPrEl = childElement(el, W, 'pPr');
  let paraPropsId: PropsId | undefined;
  if (pPrEl != null) {
    const pPrXml = serializeOuterEl(pPrEl);
    const { props } = parseParaProps(pPrXml);
    paraPropsId = makePropsId('p', id);
    paraPropsById.set(paraPropsId, props);
  }

  // exactOptionalPropertyTypes: only include optional fields when they have values.
  return {
    id,
    name,
    type,
    ...(basedOn != null ? { basedOn } : {}),
    ...(next != null ? { next } : {}),
    ...(link != null ? { link } : {}),
    ...(runPropsId != null ? { runPropsId } : {}),
    ...(paraPropsId != null ? { paraPropsId } : {}),
    ...(hidden ? { hidden: true as const } : {}),
    ...(isDefault ? { isDefault: true as const } : {}),
    ...(builtIn ? { builtIn: true as const } : {}),
  };
}

/**
 * Parse a styles.xml string into a StyleRegistry + extracted props maps.
 */
export function parseStyles(xml: string): ParsedStyles {
  const doc = parseXml(xml);
  const root = doc.root; // <w:styles>

  const runPropsById = new Map<PropsId, RunProps>();
  const paraPropsById = new Map<PropsId, ParaProps>();

  let defaults: DocDefaults = {
    runPropsId: asPropsId('__default_run__'),
    paraPropsId: asPropsId('__default_para__'),
  };
  runPropsById.set(asPropsId('__default_run__'), {});
  paraPropsById.set(asPropsId('__default_para__'), {});

  const styles = new Map<string, StyleDef>();
  let defaultParagraphStyleId = 'Normal';
  let defaultCharacterStyleId = 'DefaultParagraphFont';

  for (const child of root.children) {
    if (child.type !== 'element' || child.uri !== W) continue;
    if (child.local === 'docDefaults') {
      defaults = parseDocDefaults(child, runPropsById, paraPropsById);
    } else if (child.local === 'style') {
      const styleDef = parseStyleEl(child, runPropsById, paraPropsById);
      if (styleDef != null) {
        styles.set(styleDef.id, styleDef);
        if (styleDef.isDefault === true) {
          if (styleDef.type === 'paragraph') defaultParagraphStyleId = styleDef.id;
          else if (styleDef.type === 'character') defaultCharacterStyleId = styleDef.id;
        }
      }
    }
  }

  return {
    registry: { styles, defaultParagraphStyleId, defaultCharacterStyleId },
    runPropsById,
    paraPropsById,
    defaults,
  };
}

// ─── Serialize ───────────────────────────────────────────────────────────────

const STYLES_NS_DECLS =
  'xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" ' +
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" ' +
  'xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" ' +
  'mc:Ignorable="w14 w15" ' +
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';

/**
 * Serialize StyleRegistry + extracted props back to a styles.xml string.
 * Output is deterministic: styles sorted by id.
 */
export function serializeStyles(
  registry: StyleRegistry,
  runPropsById: ReadonlyMap<PropsId, RunProps>,
  paraPropsById: ReadonlyMap<PropsId, ParaProps>,
  defaults: DocDefaults,
): string {
  const defaultRunProps = runPropsById.get(defaults.runPropsId) ?? {};
  const defaultParaProps = paraPropsById.get(defaults.paraPropsId) ?? {};

  const rPrDefault = serializeRunProps(defaultRunProps);
  const pPrDefault = serializeParaProps(defaultParaProps);

  const docDefaultsParts: string[] = [];
  if (rPrDefault != null) {
    docDefaultsParts.push(`<w:rPrDefault>${rPrDefault}</w:rPrDefault>`);
  } else {
    docDefaultsParts.push(`<w:rPrDefault/>`);
  }
  if (pPrDefault != null) {
    docDefaultsParts.push(`<w:pPrDefault>${pPrDefault}</w:pPrDefault>`);
  } else {
    docDefaultsParts.push(`<w:pPrDefault/>`);
  }

  const docDefaults = `<w:docDefaults>${docDefaultsParts.join('')}</w:docDefaults>`;

  // Styles sorted by id for determinism.
  const sorted = [...registry.styles.values()].sort((a, b) => a.id.localeCompare(b.id));

  const styleParts = sorted.map((s) => {
    const isDefaultAttr = s.isDefault === true ? ` w:default="1"` : '';
    const parts: string[] = [];
    parts.push(`<w:name w:val="${escXml(s.name)}"/>`);
    if (s.basedOn != null) parts.push(`<w:basedOn w:val="${escXml(s.basedOn)}"/>`);
    if (s.next != null) parts.push(`<w:next w:val="${escXml(s.next)}"/>`);
    if (s.link != null) parts.push(`<w:link w:val="${escXml(s.link)}"/>`);
    if (s.hidden === true) parts.push(`<w:hidden/>`);

    if (s.runPropsId != null) {
      const rp = runPropsById.get(s.runPropsId);
      if (rp != null) {
        const rPrXml = serializeRunProps(rp);
        if (rPrXml != null) parts.push(rPrXml);
      }
    }
    if (s.paraPropsId != null) {
      const pp = paraPropsById.get(s.paraPropsId);
      if (pp != null) {
        const pPrXml = serializeParaProps(pp);
        if (pPrXml != null) parts.push(pPrXml);
      }
    }

    return (
      `<w:style w:type="${escXml(s.type)}" w:styleId="${escXml(s.id)}"${isDefaultAttr}>` +
      parts.join('') +
      `</w:style>`
    );
  });

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<w:styles ${STYLES_NS_DECLS}>` +
    docDefaults +
    styleParts.join('') +
    `</w:styles>`
  );
}
