// DOCX read pipeline: unzip → parse OPC → parse XML → WireDocument → Domain Document.
// Enforces ZIP bomb and XXE defenses per architecture/persistence.md §5.5.
import type {
  Document,
  Section,
  PropsRegistry,
  StyleRegistry,
  NumberingRegistry,
  FontRegistry,
  PropsId,
  RunProps,
  ParaProps,
  SectionProps,
  TableProps,
  RowProps,
  CellProps,
  DocDefaults,
} from '@word/domain';
import { asNodeId, asPropsId } from '@word/domain';
import type { ReadDocxOptions, ReadDocxResult, DocxWarning } from './index.js';
import { unzip } from './zip/reader.js';
import { parseXml } from './xml/reader.js';
import { buildWireDocument } from './ast/builder.js';
import { mapBodyChildrenToDomain, EMPTY_PARA_PROPS_ID } from './mappers/paragraph.js';
import { parseStyles } from './mappers/styles.js';
import { parseNumbering } from './mappers/numbering.js';

const TEXT_DECODER = new TextDecoder('utf-8');

function decodeUtf8(bytes: Uint8Array): string {
  return TEXT_DECODER.decode(bytes);
}

function makeMinimalPropsRegistry(
  extraRun: ReadonlyMap<PropsId, RunProps> = new Map(),
  extraPara: ReadonlyMap<PropsId, ParaProps> = new Map(),
): PropsRegistry {
  const emptyRunProps: RunProps = {};
  const emptyParaProps: ParaProps = {};
  const runMap = new Map<PropsId, RunProps>([[EMPTY_PARA_PROPS_ID, emptyRunProps]]);
  const paraMap = new Map<PropsId, ParaProps>([[EMPTY_PARA_PROPS_ID, emptyParaProps]]);
  for (const [k, v] of extraRun) runMap.set(k, v);
  for (const [k, v] of extraPara) paraMap.set(k, v);
  return {
    run: runMap as ReadonlyMap<PropsId, RunProps>,
    para: paraMap as ReadonlyMap<PropsId, ParaProps>,
    section: new Map<PropsId, SectionProps>(),
    table: new Map<PropsId, TableProps>(),
    row: new Map<PropsId, RowProps>(),
    cell: new Map<PropsId, CellProps>(),
  };
}

function makeMinimalStyleRegistry(): StyleRegistry {
  return {
    styles: new Map(),
    defaultParagraphStyleId: 'Normal',
    defaultCharacterStyleId: 'DefaultParagraphFont',
  };
}

function makeMinimalNumberingRegistry(): NumberingRegistry {
  return {
    nums: new Map(),
    abstracts: new Map(),
  };
}

function makeMinimalFontRegistry(): FontRegistry {
  return { faces: new Map() };
}

function makeMinimalDefaults(): DocDefaults {
  return {
    runPropsId: EMPTY_PARA_PROPS_ID,
    paraPropsId: EMPTY_PARA_PROPS_ID,
  };
}

function findDocumentPart(entries: Map<string, Uint8Array>): Uint8Array {
  // Parse [Content_Types].xml to find the main document part.
  const ctBytes = entries.get('[Content_Types].xml');
  if (ctBytes != null) {
    try {
      const ctXml = parseXml(decodeUtf8(ctBytes));
      const CT_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
      const MAIN_DOC_CT =
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
      for (const child of ctXml.root.children) {
        if (child.type === 'element' && child.uri === CT_NS && child.local === 'Override') {
          const ct = child.attrs.find((a) => a.local === 'ContentType')?.value ?? '';
          const partName = child.attrs.find((a) => a.local === 'PartName')?.value ?? '';
          if (ct === MAIN_DOC_CT && partName.length > 0) {
            const key = partName.replace(/^\//, '');
            const part = entries.get(key);
            if (part != null) return part;
          }
        }
      }
    } catch {
      // Fall through to conventional path.
    }
  }

  const conventional = entries.get('word/document.xml');
  if (conventional != null) return conventional;

  throw new Error('DOCX missing word/document.xml and Content_Types.xml has no document override');
}

export async function readDocx(
  bytes: Uint8Array,
  opts: ReadDocxOptions = {},
): Promise<ReadDocxResult> {
  const warnings: DocxWarning[] = [];

  // 1. Unzip with bomb defenses.
  const entries = unzip(bytes, {
    maxUncompressedBytes: opts.maxUncompressedBytes,
    maxCompressionRatio: opts.maxCompressionRatio,
  });

  // 2. Locate and parse word/document.xml.
  const docXmlBytes = findDocumentPart(entries);
  const docXmlStr = decodeUtf8(docXmlBytes);

  // 3. Parse XML (rejects DOCTYPE).
  const xmlDoc = parseXml(docXmlStr);

  // 4. Build WireDocument.
  const wireDoc = buildWireDocument(xmlDoc.root);

  // 5. Parse styles.xml if present.
  let styles: StyleRegistry = makeMinimalStyleRegistry();
  let defaults: DocDefaults = makeMinimalDefaults();
  const extraRunProps = new Map<PropsId, RunProps>();
  const extraParaProps = new Map<PropsId, ParaProps>();

  const stylesBytes = entries.get('word/styles.xml');
  if (stylesBytes != null) {
    try {
      const stylesXml = decodeUtf8(stylesBytes);
      const parsed = parseStyles(stylesXml);
      styles = parsed.registry;
      defaults = parsed.defaults;
      for (const [k, v] of parsed.runPropsById) extraRunProps.set(k, v);
      for (const [k, v] of parsed.paraPropsById) extraParaProps.set(k, v);
    } catch (err) {
      warnings.push({
        code: 'STYLES_PARSE_ERROR',
        message: `Failed to parse word/styles.xml: ${String(err)}`,
        part: 'word/styles.xml',
      });
    }
  }

  // 6. Parse numbering.xml if present.
  let numbering: NumberingRegistry = makeMinimalNumberingRegistry();

  const numberingBytes = entries.get('word/numbering.xml');
  if (numberingBytes != null) {
    try {
      const numberingXml = decodeUtf8(numberingBytes);
      const parsed = parseNumbering(numberingXml);
      numbering = parsed.registry;
    } catch (err) {
      warnings.push({
        code: 'NUMBERING_PARSE_ERROR',
        message: `Failed to parse word/numbering.xml: ${String(err)}`,
        part: 'word/numbering.xml',
      });
    }
  }

  // 7. Map wire body to domain paragraphs.
  const paragraphs = mapBodyChildrenToDomain(wireDoc.body.children, warnings);

  // 8. Build Document.
  const sectionPropsId = asPropsId('__default_section__');
  const section: Section = {
    id: asNodeId('section-0'),
    type: 'section',
    attrs: { sectionPropsId },
    children: paragraphs,
  };

  const doc: Document = {
    id: asNodeId('doc-0'),
    version: 1,
    sections: [section],
    footnotes: new Map(),
    endnotes: new Map(),
    comments: new Map(),
    bookmarks: new Map(),
    hyperlinks: new Map(),
    drawings: new Map(),
    images: new Map(),
    fields: new Map(),
    styles,
    numbering,
    fonts: makeMinimalFontRegistry(),
    props: makeMinimalPropsRegistry(extraRunProps, extraParaProps),
    defaults,
    meta: {},
  };

  return { doc, warnings };
}
