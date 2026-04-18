// Canonical XML writer. Known namespaces declared once on root; attributes in
// fixed order; UTF-8; no external dependencies beyond this module.

/** Well-known namespace prefix → URI table for DOCX. */
export const NS = {
  wpc: 'http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas',
  cx: 'http://schemas.microsoft.com/office/drawing/2014/chartex',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  aink: 'http://schemas.microsoft.com/office/drawing/2016/ink',
  am3d: 'http://schemas.microsoft.com/office/drawing/2017/model3d',
  o: 'urn:schemas-microsoft-com:office:office',
  oel: 'http://schemas.microsoft.com/office/2019/extlst',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  m: 'http://schemas.openxmlformats.org/officeDocument/2006/math',
  v: 'urn:schemas-microsoft-com:vml',
  wp14: 'http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  w10: 'urn:schemas-microsoft-com:office:word',
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  w14: 'http://schemas.microsoft.com/office/word/2010/wordml',
  w15: 'http://schemas.microsoft.com/office/word/2012/wordml',
  w16cex: 'http://schemas.microsoft.com/office/word/2018/wordml/cex',
  w16cid: 'http://schemas.microsoft.com/office/word/2016/wordml/cid',
  w16: 'http://schemas.microsoft.com/office/word/2018/wordml',
  w16sdtdh: 'http://schemas.microsoft.com/office/word/2020/wordml/sdtdatahash',
  w16se: 'http://schemas.microsoft.com/office/word/2015/wordml/symex',
  wpg: 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup',
  wpi: 'http://schemas.microsoft.com/office/word/2010/wordprocessingInk',
  wne: 'http://schemas.microsoft.com/office/word/2006/wordml',
  wps: 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
  ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  dc: 'http://purl.org/dc/elements/1.1/',
  dcterms: 'http://purl.org/dc/terms/',
  cp: 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties',
  xsi: 'http://www.w3.org/2001/XMLSchema-instance',
} as const;

// Reverse lookup: URI → prefix.
const URI_TO_PREFIX = new Map<string, string>(
  Object.entries(NS).map(([prefix, uri]) => [uri, prefix] as [string, string]),
);

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface SerAttr {
  readonly prefix: string;
  readonly local: string;
  readonly uri: string;
  readonly value: string;
}

export interface SerElement {
  readonly type: 'element';
  readonly prefix: string;
  readonly local: string;
  readonly uri: string;
  readonly attrs: readonly SerAttr[];
  readonly children: readonly SerChild[];
}

export interface SerText {
  readonly type: 'text';
  readonly value: string;
  readonly preserveSpace?: boolean;
}

export type SerChild = SerElement | SerText;

function resolvePrefix(uri: string, localPrefix: string): string {
  if (uri === '') return '';
  return URI_TO_PREFIX.get(uri) ?? localPrefix;
}

function qname(prefix: string, local: string): string {
  return prefix ? `${prefix}:${local}` : local;
}

function serializeElement(el: SerElement, buf: string[]): void {
  const prefix = resolvePrefix(el.uri, el.prefix);
  const tag = qname(prefix, el.local);
  buf.push('<', tag);

  // Attributes in deterministic order: sort by (uri, local).
  const sortedAttrs = [...el.attrs].sort(
    (a, b) => a.uri.localeCompare(b.uri) || a.local.localeCompare(b.local),
  );

  for (const a of sortedAttrs) {
    const aPrefix = resolvePrefix(a.uri, a.prefix);
    const aName = qname(aPrefix, a.local);
    buf.push(' ', aName, '="', escapeXml(a.value), '"');
  }

  if (el.children.length === 0) {
    buf.push('/>');
    return;
  }

  buf.push('>');
  for (const child of el.children) {
    if (child.type === 'text') {
      // Wrap in xml:space="preserve" context; just escape and emit.
      buf.push(escapeXml(child.value));
    } else {
      serializeElement(child, buf);
    }
  }
  buf.push('</', tag, '>');
}

/**
 * Serialize a root element to XML with the standard DOCX prolog and all
 * known namespace declarations on the root element.
 */
export function serializeXml(root: SerElement, nsDecls: ReadonlyArray<[string, string]>): string {
  const buf: string[] = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'];

  const prefix = resolvePrefix(root.uri, root.prefix);
  const tag = qname(prefix, root.local);
  buf.push('<', tag);

  // Namespace declarations come before regular attributes.
  for (const [nsPrefix, nsUri] of nsDecls) {
    const declName = nsPrefix ? `xmlns:${nsPrefix}` : 'xmlns';
    buf.push(' ', declName, '="', escapeXml(nsUri), '"');
  }

  // Attributes in deterministic order.
  const sortedAttrs = [...root.attrs].sort(
    (a, b) => a.uri.localeCompare(b.uri) || a.local.localeCompare(b.local),
  );
  for (const a of sortedAttrs) {
    const aPrefix = resolvePrefix(a.uri, a.prefix);
    const aName = qname(aPrefix, a.local);
    buf.push(' ', aName, '="', escapeXml(a.value), '"');
  }

  if (root.children.length === 0) {
    buf.push('/>');
    return buf.join('');
  }

  buf.push('>');
  for (const child of root.children) {
    if (child.type === 'text') {
      buf.push(escapeXml(child.value));
    } else {
      serializeElement(child, buf);
    }
  }
  buf.push('</', tag, '>');

  return buf.join('');
}

/** Encode a string as UTF-8 bytes. */
export function encodeUtf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}
