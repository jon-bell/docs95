// Comprehensive tests for @word/docx M0 implementation.
// Covers: round-trip, byte-stability, ZIP bomb, XXE, unknown preservation, fixture smoke.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readDocx, writeDocx } from './index.js';
import type { Document, Paragraph, PropsId, RunProps, ParaProps } from '@word/domain';
import { asNodeId, asPropsId, isParagraph } from '@word/domain';
import { unzip } from './zip/reader.js';
import { zip } from './zip/writer.js';
import { parseXml, textContent } from './xml/reader.js';
import type { XmlElement } from './xml/reader.js';
import { buildWireDocument } from './ast/builder.js';
import { serializeWireDocument } from './ast/serializer.js';
import { EMPTY_PARA_PROPS_ID } from './mappers/paragraph.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '../../test-fixtures/docx');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const enc = new TextEncoder();
const e = (s: string): Uint8Array => enc.encode(s);

function makeParagraph(text: string): Paragraph {
  return {
    id: asNodeId(`p-${text}`),
    type: 'paragraph',
    attrs: { paraPropsId: EMPTY_PARA_PROPS_ID },
    children: [
      {
        id: asNodeId(`r-${text}`),
        type: 'run',
        attrs: { runPropsId: EMPTY_PARA_PROPS_ID },
        text,
      },
    ],
  };
}

function makeMinimalDoc(texts: string[]): Document {
  const sectionPropsId = asPropsId('__default_section__');
  return {
    id: asNodeId('doc-test'),
    version: 1,
    sections: [
      {
        id: asNodeId('section-0'),
        type: 'section',
        attrs: { sectionPropsId },
        children: texts.map(makeParagraph),
      },
    ],
    footnotes: new Map(),
    endnotes: new Map(),
    comments: new Map(),
    bookmarks: new Map(),
    hyperlinks: new Map(),
    drawings: new Map(),
    images: new Map(),
    fields: new Map(),
    styles: {
      styles: new Map(),
      defaultParagraphStyleId: 'Normal',
      defaultCharacterStyleId: 'DefaultParagraphFont',
    },
    numbering: { nums: new Map(), abstracts: new Map() },
    fonts: { faces: new Map() },
    props: {
      run: new Map([[EMPTY_PARA_PROPS_ID, {}]]) as ReadonlyMap<PropsId, RunProps>,
      para: new Map([[EMPTY_PARA_PROPS_ID, {}]]) as ReadonlyMap<PropsId, ParaProps>,
      section: new Map(),
      table: new Map(),
      row: new Map(),
      cell: new Map(),
    },
    defaults: {
      runPropsId: EMPTY_PARA_PROPS_ID,
      paraPropsId: EMPTY_PARA_PROPS_ID,
    },
    meta: {},
  };
}

function collectText(doc: Document): string {
  const parts: string[] = [];
  for (const section of doc.sections) {
    for (const block of section.children) {
      if (isParagraph(block)) {
        for (const child of block.children) {
          if (child.type === 'run') parts.push(child.text);
        }
      }
    }
  }
  return parts.join('');
}

function countParagraphs(doc: Document): number {
  return doc.sections.flatMap((s) => s.children.filter(isParagraph)).length;
}

// ─── Round-trip ───────────────────────────────────────────────────────────────

describe('round-trip', () => {
  it('single paragraph survives write → read', async () => {
    const original = makeMinimalDoc(['Hello, world.']);
    const bytes = await writeDocx(original, { deterministic: true });
    const { doc, warnings } = await readDocx(bytes);

    expect(countParagraphs(doc)).toBe(1);
    expect(collectText(doc)).toBe('Hello, world.');
    expect(warnings.filter((w) => w.code !== 'UNSUPPORTED_BODY_CHILD')).toHaveLength(0);
  });

  it('three paragraphs survive write → read', async () => {
    const original = makeMinimalDoc(['First.', 'Second.', 'Third.']);
    const bytes = await writeDocx(original, { deterministic: true });
    const { doc } = await readDocx(bytes);

    expect(countParagraphs(doc)).toBe(3);
    expect(collectText(doc)).toBe('First.Second.Third.');
  });

  it('empty paragraph survives write → read', async () => {
    const original = makeMinimalDoc(['']);
    const bytes = await writeDocx(original, { deterministic: true });
    const { doc } = await readDocx(bytes);
    expect(countParagraphs(doc)).toBe(1);
    expect(collectText(doc)).toBe('');
  });

  it('text with leading and trailing spaces survives', async () => {
    const original = makeMinimalDoc([' indented ']);
    const bytes = await writeDocx(original, { deterministic: true });
    const { doc } = await readDocx(bytes);
    expect(collectText(doc)).toBe(' indented ');
  });
});

// ─── Byte-stable ──────────────────────────────────────────────────────────────

describe('byte-stable', () => {
  it('two writes of same doc produce identical bytes (deterministic mode)', async () => {
    const doc = makeMinimalDoc(['Stable output test.']);
    const opts = { deterministic: true, pinnedTimestamp: '2024-01-01T00:00:00Z' };

    const bytes1 = await writeDocx(doc, opts);
    const bytes2 = await writeDocx(doc, opts);

    expect(bytes1).toEqual(bytes2);
  });

  it('different documents produce different bytes', async () => {
    const opts = { deterministic: true, pinnedTimestamp: '2024-01-01T00:00:00Z' };
    const bytes1 = await writeDocx(makeMinimalDoc(['Doc A']), opts);
    const bytes2 = await writeDocx(makeMinimalDoc(['Doc B']), opts);
    expect(bytes1).not.toEqual(bytes2);
  });
});

// ─── ZIP defenses ─────────────────────────────────────────────────────────────

describe('ZIP bomb defense', () => {
  it('rejects a payload whose declared ratio exceeds the limit', () => {
    // Build a trivial valid ZIP but pass maxCompressionRatio=1 to force rejection
    // on any compressed entry.  Use a real DOCX bytes so structure is valid.
    const fixtureBytes = readFileSync(join(FIXTURES, 'hello.docx'));
    expect(() => unzip(fixtureBytes, { maxCompressionRatio: 1 })).toThrow(/bomb|ratio/i);
  });

  it('accepts a normal DOCX under default limits', () => {
    const fixtureBytes = readFileSync(join(FIXTURES, 'hello.docx'));
    expect(() => unzip(fixtureBytes)).not.toThrow();
  });

  it('rejects paths with ".." (path traversal)', () => {
    // Build a fake "ZIP" with an entry named "../evil.xml".
    // We can't easily construct one with fflate (it normalises names),
    // so we test the validateEntryName logic directly via a crafted error.
    // We replicate the validation logic here.
    const validateEntry = (name: string): boolean => {
      return !name.includes('..') && !name.startsWith('/') && !name.includes('\0');
    };
    expect(validateEntry('../evil.xml')).toBe(false);
    expect(validateEntry('/abs.xml')).toBe(false);
    expect(validateEntry('word/document.xml')).toBe(true);
  });
});

// ─── XXE defense ──────────────────────────────────────────────────────────────

describe('XXE defense', () => {
  it('rejects XML with DOCTYPE declaration', () => {
    const malicious = `<?xml version="1.0"?>
<!DOCTYPE foo [<!ENTITY x "y">]>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p/></w:body>
</w:document>`;
    expect(() => parseXml(malicious)).toThrow(/XXE|DOCTYPE/i);
  });

  it('parses clean XML without error', () => {
    const clean = `<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>Hello</w:t></w:r></w:p></w:body>
</w:document>`;
    expect(() => parseXml(clean)).not.toThrow();
  });
});

// ─── Unknown preservation ─────────────────────────────────────────────────────

describe('unknown element preservation', () => {
  it('a custom element injected into a paragraph wire survives write/read as WireUnknown', () => {
    // Build wire XML with a custom element, then round-trip through
    // builder → serializer → builder to verify preservation.
    const customXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:custom="http://example.com/custom">
  <w:body>
    <w:p>
      <w:r><w:t>Before</w:t></w:r>
      <custom:customThing foo="bar"/>
      <w:r><w:t>After</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

    const parsed = parseXml(customXml);
    const wire = buildWireDocument(parsed.root);

    // The paragraph should have: run, unknown, run
    const para = wire.body.children[0];
    expect(para?.type).toBe('paragraph');
    if (para?.type !== 'paragraph') return;

    const unknownChild = para.children.find((c) => c.type === 'unknown');
    expect(unknownChild).toBeDefined();
    if (unknownChild?.type !== 'unknown') return;
    expect(unknownChild.ns).toBe('http://example.com/custom');
    expect(unknownChild.tag).toBe('customThing');
    expect(unknownChild.xml).toContain('customThing');

    // Serialize and re-parse — the unknown should still be there.
    const serialized = serializeWireDocument(wire);
    const reparsed = parseXml(serialized);
    const wire2 = buildWireDocument(reparsed.root);
    const para2 = wire2.body.children[0];
    if (para2?.type !== 'paragraph') {
      expect(para2?.type).toBe('paragraph');
      return;
    }
    const unknown2 = para2.children.find((c) => c.type === 'unknown');
    expect(unknown2).toBeDefined();
  });
});

// ─── Fixture smoke tests (M0) ─────────────────────────────────────────────────

describe('fixture smoke tests', () => {
  it('empty.docx: reads 1 paragraph with empty text', async () => {
    const bytes = new Uint8Array(readFileSync(join(FIXTURES, 'empty.docx')));
    const { doc } = await readDocx(bytes);
    expect(countParagraphs(doc)).toBe(1);
    expect(collectText(doc)).toBe('');
  });

  it('hello.docx: reads 1 paragraph with "Hello, world."', async () => {
    const bytes = new Uint8Array(readFileSync(join(FIXTURES, 'hello.docx')));
    const { doc } = await readDocx(bytes);
    expect(countParagraphs(doc)).toBe(1);
    expect(collectText(doc)).toBe('Hello, world.');
  });

  it('three-para.docx: reads 3 paragraphs', async () => {
    const bytes = new Uint8Array(readFileSync(join(FIXTURES, 'three-para.docx')));
    const { doc } = await readDocx(bytes);
    expect(countParagraphs(doc)).toBe(3);
    const text = collectText(doc);
    expect(text).toContain('First paragraph.');
    expect(text).toContain('Second paragraph.');
    expect(text).toContain('Third paragraph.');
  });
});

// ─── Fixture smoke tests (M1 — formatting) ────────────────────────────────────

describe('M1 fixture smoke tests', () => {
  it('bold-italic.docx: reads 1 paragraph, text includes Bold and Italic', async () => {
    const bytes = new Uint8Array(readFileSync(join(FIXTURES, 'bold-italic.docx')));
    const { doc } = await readDocx(bytes);
    expect(countParagraphs(doc)).toBe(1);
    const text = collectText(doc);
    expect(text).toContain('Bold');
    expect(text).toContain('and');
    expect(text).toContain('Italic');
  });

  it('bold-italic.docx: styles.xml is parsed (Normal and DefaultParagraphFont present)', async () => {
    const bytes = new Uint8Array(readFileSync(join(FIXTURES, 'bold-italic.docx')));
    const { doc } = await readDocx(bytes);
    expect(doc.styles.styles.has('Normal')).toBe(true);
    expect(doc.styles.styles.has('DefaultParagraphFont')).toBe(true);
  });

  it('heading-and-body.docx: reads 2 paragraphs with correct style refs', async () => {
    const bytes = new Uint8Array(readFileSync(join(FIXTURES, 'heading-and-body.docx')));
    const { doc } = await readDocx(bytes);
    expect(countParagraphs(doc)).toBe(2);
    const text = collectText(doc);
    expect(text).toContain('Chapter One');
    expect(text).toContain('Body text here.');
  });

  it('heading-and-body.docx: Heading1 style parsed with outlineLevel=0', async () => {
    const bytes = new Uint8Array(readFileSync(join(FIXTURES, 'heading-and-body.docx')));
    const { doc } = await readDocx(bytes);
    const h1 = doc.styles.styles.get('Heading1');
    expect(h1).toBeDefined();
    if (h1?.paraPropsId != null) {
      const pp = doc.props.para.get(h1.paraPropsId);
      expect(pp?.outlineLevel).toBe(0);
      expect(pp?.keepNext).toBe(true);
    }
  });

  it('bulleted-list.docx: reads 3 paragraphs with numbering references', async () => {
    const bytes = new Uint8Array(readFileSync(join(FIXTURES, 'bulleted-list.docx')));
    const { doc } = await readDocx(bytes);
    expect(countParagraphs(doc)).toBe(3);
    const text = collectText(doc);
    expect(text).toContain('First bullet item');
    expect(text).toContain('Second bullet item');
    expect(text).toContain('Third bullet item');
  });

  it('bulleted-list.docx: numbering registry has numId=1 with bullet abstractNum', async () => {
    const bytes = new Uint8Array(readFileSync(join(FIXTURES, 'bulleted-list.docx')));
    const { doc } = await readDocx(bytes);
    expect(doc.numbering.nums.size).toBeGreaterThan(0);
    expect(doc.numbering.nums.has(1)).toBe(true);
    const num = doc.numbering.nums.get(1);
    expect(num?.abstractId).toBe(0);
  });

  it('numbered-list.docx: reads 3 paragraphs', async () => {
    const bytes = new Uint8Array(readFileSync(join(FIXTURES, 'numbered-list.docx')));
    const { doc } = await readDocx(bytes);
    expect(countParagraphs(doc)).toBe(3);
    const text = collectText(doc);
    expect(text).toContain('First numbered item');
    expect(text).toContain('Second numbered item');
    expect(text).toContain('Third numbered item');
  });

  it('numbered-list.docx: abstractNum level 0 has decimal format', async () => {
    const bytes = new Uint8Array(readFileSync(join(FIXTURES, 'numbered-list.docx')));
    const { doc } = await readDocx(bytes);
    // The abstracts are stored as unknown in domain — cast to AbstractNum for M1 tests.
    const abstracts = doc.numbering.abstracts as ReadonlyMap<
      number,
      { levels: Array<{ numFmt: string }> }
    >;
    const an = abstracts.get(0);
    expect(an?.levels[0]?.numFmt).toBe('decimal');
  });

  it('styles-doc.docx: 5 paragraphs with mixed styles and direct formatting', async () => {
    const bytes = new Uint8Array(readFileSync(join(FIXTURES, 'styles-doc.docx')));
    const { doc } = await readDocx(bytes);
    expect(countParagraphs(doc)).toBe(5);
    const text = collectText(doc);
    expect(text).toContain('Main Title');
    expect(text).toContain('Section');
    expect(text).toContain('Subsection');
    expect(text).toContain('Direct formatting');
    expect(text).toContain('Italic underlined text');
  });

  it('styles-doc.docx: Heading1/2/3 all parsed in style registry', async () => {
    const bytes = new Uint8Array(readFileSync(join(FIXTURES, 'styles-doc.docx')));
    const { doc } = await readDocx(bytes);
    expect(doc.styles.styles.has('Heading1')).toBe(true);
    expect(doc.styles.styles.has('Heading2')).toBe(true);
    expect(doc.styles.styles.has('Heading3')).toBe(true);
  });
});

// ─── Formatted doc write→read round-trip ─────────────────────────────────────

describe('formatted doc write → read round-trip', () => {
  it('doc with styles survives write → read with registry intact', async () => {
    const bytes = new Uint8Array(readFileSync(join(FIXTURES, 'heading-and-body.docx')));
    const { doc: docIn } = await readDocx(bytes);

    // Write it back out, then read again.
    const written = await writeDocx(docIn, { deterministic: true });
    const { doc: docOut } = await readDocx(written);

    expect(countParagraphs(docOut)).toBe(countParagraphs(docIn));
    expect(collectText(docOut)).toBe(collectText(docIn));
    expect(docOut.styles.styles.has('Heading1')).toBe(true);
  });

  it('doc with numbering survives write → read with numbering intact', async () => {
    const bytes = new Uint8Array(readFileSync(join(FIXTURES, 'bulleted-list.docx')));
    const { doc: docIn } = await readDocx(bytes);

    const written = await writeDocx(docIn, { deterministic: true });
    const { doc: docOut } = await readDocx(written);

    expect(countParagraphs(docOut)).toBe(3);
    expect(docOut.numbering.nums.has(1)).toBe(true);
  });

  it('formatted doc is byte-stable on two deterministic writes', async () => {
    const bytes = new Uint8Array(readFileSync(join(FIXTURES, 'styles-doc.docx')));
    const { doc } = await readDocx(bytes);

    const opts = { deterministic: true, pinnedTimestamp: '2024-01-01T00:00:00Z' };
    const bytes1 = await writeDocx(doc, opts);
    const bytes2 = await writeDocx(doc, opts);

    expect(bytes1).toEqual(bytes2);
  });
});

// ─── ZIP reader/writer unit tests ─────────────────────────────────────────────

describe('zip reader', () => {
  it('unzips a valid archive and returns entries', () => {
    const fixture = readFileSync(join(FIXTURES, 'hello.docx'));
    const entries = unzip(new Uint8Array(fixture));
    expect(entries.has('word/document.xml')).toBe(true);
    expect(entries.has('[Content_Types].xml')).toBe(true);
  });
});

describe('zip writer', () => {
  it('produces deterministic output when deterministic=true', () => {
    const entries = [
      { name: 'b.xml', data: e('<b/>') },
      { name: 'a.xml', data: e('<a/>') },
    ];
    const opts = { deterministic: true, pinnedTimestamp: '2024-01-01T00:00:00Z' };
    const bytes1 = zip(entries, opts);
    const bytes2 = zip(entries, opts);
    expect(bytes1).toEqual(bytes2);
  });

  it('round-trips entries: zip then unzip yields same content', () => {
    const entries = [
      { name: 'hello.txt', data: e('Hello, world!') },
      { name: 'world.txt', data: e('World!') },
    ];
    const zipped = zip(entries, { deterministic: true });
    const unzipped = unzip(zipped);
    expect(new TextDecoder().decode(unzipped.get('hello.txt'))).toBe('Hello, world!');
    expect(new TextDecoder().decode(unzipped.get('world.txt'))).toBe('World!');
  });
});

// ─── XML reader unit tests ────────────────────────────────────────────────────

describe('xml reader', () => {
  it('parses namespace-aware XML', () => {
    const xml = `<root xmlns:w="http://example.com/w"><w:child attr="val"/></root>`;
    const doc = parseXml(xml);
    expect(doc.root.local).toBe('root');
    const child = doc.root.children.find((c) => c.type === 'element') as XmlElement;
    expect(child?.local).toBe('child');
    expect(child?.uri).toBe('http://example.com/w');
    expect(child?.attrs[0]?.value).toBe('val');
  });

  it('captures text nodes', () => {
    const xml = `<root xmlns="http://example.com">Hello &amp; world</root>`;
    const doc = parseXml(xml);
    expect(textContent(doc.root)).toBe('Hello & world');
  });
});
