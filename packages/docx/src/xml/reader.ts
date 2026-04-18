// Streaming XML parser backed by saxes. Rejects DOCTYPE (XXE guard).
// Produces a lightweight DOM-lite tree sufficient for the DOCX AST builder.
import { SaxesParser } from 'saxes';

export interface XmlAttr {
  readonly prefix: string;
  readonly local: string;
  readonly uri: string;
  readonly value: string;
}

export interface XmlElement {
  readonly type: 'element';
  readonly prefix: string;
  readonly local: string;
  readonly uri: string;
  readonly attrs: readonly XmlAttr[];
  readonly children: readonly XmlChild[];
}

export interface XmlText {
  readonly type: 'text';
  readonly value: string;
}

export type XmlChild = XmlElement | XmlText;

export interface XmlDocument {
  readonly root: XmlElement;
}

export function parseXml(xml: string): XmlDocument {
  const parser = new SaxesParser<{ xmlns: true }>({ xmlns: true });

  let root: XmlElement | null = null;
  const stack: Array<{
    prefix: string;
    local: string;
    uri: string;
    attrs: XmlAttr[];
    children: XmlChild[];
  }> = [];
  let parseError: Error | null = null;

  parser.on('doctype', () => {
    parseError = new Error('XXE: DOCTYPE declaration is not permitted in DOCX XML');
  });

  parser.on('error', (err: Error) => {
    parseError = err;
  });

  parser.on('opentag', (tag) => {
    if (parseError) return;
    const attrs: XmlAttr[] = [];
    // saxes with xmlns:true gives us attributes as an object of SaxesAttributeNS
    const rawAttrs = tag.attributes as Record<
      string,
      { prefix: string; local: string; uri: string; value: string }
    >;
    for (const [, a] of Object.entries(rawAttrs)) {
      attrs.push({ prefix: a.prefix, local: a.local, uri: a.uri, value: a.value });
    }
    stack.push({ prefix: tag.prefix, local: tag.local, uri: tag.uri, attrs, children: [] });
  });

  parser.on('closetag', () => {
    if (parseError) return;
    const frame = stack.pop();
    if (frame == null) return;
    const el: XmlElement = {
      type: 'element',
      prefix: frame.prefix,
      local: frame.local,
      uri: frame.uri,
      attrs: frame.attrs,
      children: frame.children,
    };
    if (stack.length === 0) {
      root = el;
    } else {
      const parent = stack[stack.length - 1];
      if (parent != null) {
        parent.children.push(el);
      }
    }
  });

  parser.on('text', (text: string) => {
    if (parseError) return;
    if (text.length === 0) return;
    const parent = stack[stack.length - 1];
    if (parent != null) {
      parent.children.push({ type: 'text', value: text });
    }
  });

  parser.on('cdata', (text: string) => {
    if (parseError) return;
    const parent = stack[stack.length - 1];
    if (parent != null) {
      parent.children.push({ type: 'text', value: text });
    }
  });

  parser.write(xml).close();

  if (parseError != null) {
    throw parseError;
  }
  if (root == null) {
    throw new Error('XML document has no root element');
  }
  return { root };
}

/** Return the first child element matching namespace URI + local name. */
export function childElement(el: XmlElement, uri: string, local: string): XmlElement | null {
  for (const child of el.children) {
    if (child.type === 'element' && child.uri === uri && child.local === local) {
      return child;
    }
  }
  return null;
}

/** Return all child elements matching namespace URI + local name. */
export function childElements(el: XmlElement, uri: string, local: string): XmlElement[] {
  const result: XmlElement[] = [];
  for (const child of el.children) {
    if (child.type === 'element' && child.uri === uri && child.local === local) {
      result.push(child);
    }
  }
  return result;
}

/** Return the concatenated text content of an element. */
export function textContent(el: XmlElement): string {
  let out = '';
  for (const child of el.children) {
    if (child.type === 'text') {
      out += child.value;
    } else {
      out += textContent(child);
    }
  }
  return out;
}

/** Get a named attribute value, or null. */
export function attr(el: XmlElement, uri: string, local: string): string | null {
  for (const a of el.attrs) {
    if (a.uri === uri && a.local === local) return a.value;
  }
  return null;
}

/** Get a no-namespace attribute value, or null. */
export function attrNN(el: XmlElement, local: string): string | null {
  for (const a of el.attrs) {
    if (a.uri === '' && a.local === local) return a.value;
  }
  return null;
}
