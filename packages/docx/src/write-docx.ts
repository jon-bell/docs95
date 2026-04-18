// DOCX write pipeline: Domain Document → WireDocument → XML → deterministic ZIP.
// Preserves WireUnknown elements verbatim per ADR-0013.
// M1: also emits word/styles.xml and word/numbering.xml when registries are non-empty.
import type { Document } from '@word/domain';
import { isParagraph } from '@word/domain';
import type { WriteDocxOptions } from './index.js';
import { zip as zipEntries } from './zip/writer.js';
import { serializeWireDocument } from './ast/serializer.js';
import { mapDomainParagraphToWire } from './mappers/paragraph.js';
import { serializeStyles } from './mappers/styles.js';
import { serializeNumbering } from './mappers/numbering.js';
import type { AbstractNum } from './mappers/numbering.js';
import type { WireDocument, WireBodyChild } from './ast/index.js';

const TEXT_ENCODER = new TextEncoder();
function encodeUtf8(s: string): Uint8Array {
  return TEXT_ENCODER.encode(s);
}

/** Build a WireDocument from a Domain Document. */
function domainToWire(doc: Document): WireDocument {
  const bodyChildren: WireBodyChild[] = [];

  for (const section of doc.sections) {
    for (const block of section.children) {
      if (isParagraph(block)) {
        bodyChildren.push(mapDomainParagraphToWire(block));
      } else {
        const xml = `<w:tbl/>`;
        bodyChildren.push({
          type: 'unknown',
          nodeId: `u-tbl-${bodyChildren.length}`,
          ns: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
          tag: 'tbl',
          xml,
        });
      }
    }
  }

  return { type: 'document', body: { type: 'body', children: bodyChildren } };
}

function buildContentTypesXml(includeStyles: boolean, includeNumbering: boolean): string {
  const stylesOverride = includeStyles
    ? `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>`
    : '';
  const numberingOverride = includeNumbering
    ? `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>`
    : '';
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    stylesOverride +
    numberingOverride +
    `</Types>`
  );
}

function buildRootRelsXml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`
  );
}

function buildDocumentRelsXml(includeStyles: boolean, includeNumbering: boolean): string {
  const stylesRel = includeStyles
    ? `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
    : '';
  const numberingRel = includeNumbering
    ? `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>`
    : '';
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    stylesRel +
    numberingRel +
    `</Relationships>`
  );
}

export async function writeDocx(doc: Document, opts: WriteDocxOptions = {}): Promise<Uint8Array> {
  const wire = domainToWire(doc);
  const documentXml = serializeWireDocument(wire);

  const hasStyles = doc.styles.styles.size > 0;
  const hasNumbering = doc.numbering.nums.size > 0;

  const entries: Array<{ name: string; data: Uint8Array }> = [
    {
      name: '[Content_Types].xml',
      data: encodeUtf8(buildContentTypesXml(hasStyles, hasNumbering)),
    },
    { name: '_rels/.rels', data: encodeUtf8(buildRootRelsXml()) },
    {
      name: 'word/_rels/document.xml.rels',
      data: encodeUtf8(buildDocumentRelsXml(hasStyles, hasNumbering)),
    },
    { name: 'word/document.xml', data: encodeUtf8(documentXml) },
  ];

  if (hasStyles) {
    const stylesXml = serializeStyles(doc.styles, doc.props.run, doc.props.para, doc.defaults);
    entries.push({ name: 'word/styles.xml', data: encodeUtf8(stylesXml) });
  }

  if (hasNumbering) {
    // The NumberingRegistry.abstracts field carries opaque unknown data in the
    // base domain type; for M1 we cast it to the richer AbstractNum shape used
    // by the numbering mapper (both the read and write paths go through this package).
    const abstracts = doc.numbering.abstracts as ReadonlyMap<number, AbstractNum>;
    const numberingXml = serializeNumbering(doc.numbering, abstracts);
    entries.push({ name: 'word/numbering.xml', data: encodeUtf8(numberingXml) });
  }

  return zipEntries(entries, {
    deterministic: opts.deterministic ?? false,
    pinnedTimestamp: opts.pinnedTimestamp,
  });
}
