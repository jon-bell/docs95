// Build WireDocument from a parsed XML element tree (word/document.xml).
// Unknown elements are captured as WireUnknown with a content-hash nodeId.
import type { XmlElement, XmlChild } from '../xml/reader.js';
import { attr } from '../xml/reader.js';
import type {
  WireDocument,
  WireBody,
  WireBodyChild,
  WireParagraph,
  WireParagraphChild,
  WireRun,
  WireRunChild,
  WireText,
  WireBreak,
  WireUnknown,
} from './index.js';
import { buildUnknownNodeId } from '../mappers/unknown-id.js';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function serializeOuter(el: XmlElement): string {
  const buf: string[] = [];
  serializeEl(el, buf, undefined);
  return buf.join('');
}

function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function collectNamespaces(el: XmlElement, ns: Map<string, string>): void {
  if (el.uri && el.prefix && !ns.has(el.prefix)) {
    ns.set(el.prefix, el.uri);
  }
  for (const a of el.attrs) {
    if (a.uri && a.prefix && a.prefix !== 'xmlns' && !ns.has(a.prefix)) {
      ns.set(a.prefix, a.uri);
    }
  }
  for (const child of el.children) {
    if (child.type === 'element') collectNamespaces(child, ns);
  }
}

function serializeEl(el: XmlElement, buf: string[], nsDecls?: Map<string, string>): void {
  const prefix = el.prefix ? el.prefix : '';
  const tag = prefix ? `${prefix}:${el.local}` : el.local;
  buf.push('<', tag);
  // Emit namespace declarations if provided (root of an unknown subtree).
  if (nsDecls != null) {
    for (const [p, u] of nsDecls) {
      buf.push(` xmlns:${p}="`, escXml(u), '"');
    }
  }
  for (const a of el.attrs) {
    const aPrefix = a.prefix ? a.prefix : '';
    const aName = aPrefix ? `${aPrefix}:${a.local}` : a.local;
    buf.push(' ', aName, '="', escXml(a.value), '"');
  }
  if (el.children.length === 0) {
    buf.push('/>');
    return;
  }
  buf.push('>');
  for (const child of el.children) {
    serializeChild(child, buf);
  }
  buf.push('</', tag, '>');
}

function serializeChild(child: XmlChild, buf: string[]): void {
  if (child.type === 'text') {
    buf.push(escXml(child.value));
  } else {
    serializeEl(child, buf, undefined);
  }
}

function makeUnknown(el: XmlElement): WireUnknown {
  // Collect all namespace prefixes used within this subtree so they are
  // declared on the root of the serialized fragment — necessary for the
  // fragment to be valid XML when re-inserted into a document that only
  // declares the well-known W/R/etc. prefixes.
  const ns = new Map<string, string>();
  collectNamespaces(el, ns);
  const buf: string[] = [];
  serializeEl(el, buf, ns.size > 0 ? ns : undefined);
  const xml = buf.join('');
  return {
    type: 'unknown',
    nodeId: buildUnknownNodeId(xml),
    ns: el.uri,
    tag: el.local,
    xml,
  };
}

function buildWireText(el: XmlElement): WireText {
  let text = '';
  for (const child of el.children) {
    if (child.type === 'text') text += child.value;
  }
  const space = attr(el, 'http://www.w3.org/XML/1998/namespace', 'space');
  return {
    type: 'text',
    value: text,
    preserveSpace: space === 'preserve',
  };
}

function buildWireBreak(el: XmlElement): WireBreak {
  const breakType = attr(el, W, 'type');
  const clear = attr(el, W, 'clear');
  return { type: 'break', breakType, clear };
}

function buildWireRun(el: XmlElement): WireRun {
  let rPrXml: string | null = null;
  const children: WireRunChild[] = [];

  for (const child of el.children) {
    if (child.type === 'text') continue; // whitespace between elements
    if (child.uri === W && child.local === 'rPr') {
      rPrXml = serializeOuter(child);
    } else if (child.uri === W && child.local === 't') {
      children.push(buildWireText(child));
    } else if (child.uri === W && child.local === 'br') {
      children.push(buildWireBreak(child));
    } else {
      children.push(makeUnknown(child));
    }
  }

  return { type: 'run', rPrXml, children };
}

function buildWireParagraph(el: XmlElement): WireParagraph {
  let pPrXml: string | null = null;
  const children: WireParagraphChild[] = [];

  for (const child of el.children) {
    if (child.type === 'text') continue;
    if (child.uri === W && child.local === 'pPr') {
      pPrXml = serializeOuter(child);
    } else if (child.uri === W && child.local === 'r') {
      children.push(buildWireRun(child));
    } else {
      children.push(makeUnknown(child));
    }
  }

  return { type: 'paragraph', pPrXml, children };
}

function buildWireBody(el: XmlElement): WireBody {
  const children: WireBodyChild[] = [];

  for (const child of el.children) {
    if (child.type === 'text') continue;
    if (child.uri === W && child.local === 'p') {
      children.push(buildWireParagraph(child));
    } else if (child.uri === W && child.local === 'sectPr') {
      // Section properties at body end — preserved as unknown for M0.
      children.push(makeUnknown(child));
    } else {
      children.push(makeUnknown(child));
    }
  }

  return { type: 'body', children };
}

/** Build a WireDocument from a parsed word/document.xml element tree. */
export function buildWireDocument(root: XmlElement): WireDocument {
  // root is <w:document>; find <w:body>
  let bodyEl: XmlElement | null = null;
  for (const child of root.children) {
    if (child.type === 'element' && child.uri === W && child.local === 'body') {
      bodyEl = child;
      break;
    }
  }
  if (bodyEl == null) {
    throw new Error('word/document.xml missing <w:body>');
  }

  return { type: 'document', body: buildWireBody(bodyEl) };
}
