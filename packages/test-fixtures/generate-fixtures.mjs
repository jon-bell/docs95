#!/usr/bin/env node
// Generate minimal but valid ECMA-376 DOCX fixtures programmatically.
// Run: node packages/test-fixtures/generate-fixtures.mjs
// Requires: pnpm install (fflate must be available)
//
// Each fixture is a standards-conformant DOCX that LibreOffice can open.
// We build the ZIP manually so we control byte content exactly.

import { zipSync } from '../../node_modules/.pnpm/fflate@0.8.2/node_modules/fflate/esm/index.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCX_DIR = join(__dirname, 'docx');

const enc = new TextEncoder();
const e = (s) => enc.encode(s);

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const W_DECL = `xmlns:w="${W}"`;

const CONTENT_TYPES_PLAIN = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

function makeContentTypes({ styles = false, numbering = false } = {}) {
  const stylesOverride = styles
    ? `  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>\n`
    : '';
  const numberingOverride = numbering
    ? `  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>\n`
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
${stylesOverride}${numberingOverride}</Types>`;
}

function makeDocumentRels({ styles = false, numbering = false } = {}) {
  const stylesRel = styles
    ? `  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>\n`
    : '';
  const numberingRel = numbering
    ? `  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>\n`
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${stylesRel}${numberingRel}</Relationships>`;
}

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

function escXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function makeDocument(paragraphs) {
  const paraXml = paragraphs
    .map((text) => {
      if (text === '') {
        return `<w:p><w:r><w:t></w:t></w:r></w:p>`;
      }
      const needsPreserve = text.startsWith(' ') || text.endsWith(' ');
      const spAttr = needsPreserve ? ' xml:space="preserve"' : '';
      return `<w:p><w:r><w:t${spAttr}>${escXml(text)}</w:t></w:r></w:p>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W_DECL}><w:body>${paraXml}<w:sectPr/></w:body></w:document>`;
}

// DOS epoch for deterministic timestamps.
const DOS_EPOCH = new Date('1980-01-01T00:00:00.000Z');

function buildDocx(paragraphs) {
  const entries = {
    '[Content_Types].xml': [e(CONTENT_TYPES_PLAIN), { level: 6, mtime: DOS_EPOCH }],
    '_rels/.rels': [e(ROOT_RELS), { level: 6, mtime: DOS_EPOCH }],
    'word/_rels/document.xml.rels': [e(makeDocumentRels()), { level: 6, mtime: DOS_EPOCH }],
    'word/document.xml': [e(makeDocument(paragraphs)), { level: 6, mtime: DOS_EPOCH }],
  };
  return zipSync(entries);
}

// ─── M1 fixture helpers ───────────────────────────────────────────────────────

function makeStylesXml(styles) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W_DECL}>
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="24"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  ${styles}
</w:styles>`;
}

const NORMAL_STYLE = `<w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>`;

const DEFAULT_PARA_FONT_STYLE = `<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont">
    <w:name w:val="Default Paragraph Font"/>
  </w:style>`;

const HEADING1_STYLE = `<w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:pPr><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="40"/></w:rPr>
  </w:style>`;

const HEADING2_STYLE = `<w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:pPr><w:keepNext/><w:outlineLvl w:val="1"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="32"/></w:rPr>
  </w:style>`;

const HEADING3_STYLE = `<w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:pPr><w:keepNext/><w:outlineLvl w:val="2"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="28"/></w:rPr>
  </w:style>`;

/** Build a DOCX with styles.xml and optional numbering.xml */
function buildFormattedDocx({ documentXml, stylesXml, numberingXml } = {}) {
  const hasStyles = stylesXml != null;
  const hasNumbering = numberingXml != null;

  const entries = {
    '[Content_Types].xml': [
      e(makeContentTypes({ styles: hasStyles, numbering: hasNumbering })),
      { level: 6, mtime: DOS_EPOCH },
    ],
    '_rels/.rels': [e(ROOT_RELS), { level: 6, mtime: DOS_EPOCH }],
    'word/_rels/document.xml.rels': [
      e(makeDocumentRels({ styles: hasStyles, numbering: hasNumbering })),
      { level: 6, mtime: DOS_EPOCH },
    ],
    'word/document.xml': [e(documentXml), { level: 6, mtime: DOS_EPOCH }],
  };
  if (hasStyles) {
    entries['word/styles.xml'] = [e(stylesXml), { level: 6, mtime: DOS_EPOCH }];
  }
  if (hasNumbering) {
    entries['word/numbering.xml'] = [e(numberingXml), { level: 6, mtime: DOS_EPOCH }];
  }
  return zipSync(entries);
}

// ─── M0 fixtures ─────────────────────────────────────────────────────────────

mkdirSync(DOCX_DIR, { recursive: true });

// empty.docx — one empty paragraph
writeFileSync(join(DOCX_DIR, 'empty.docx'), buildDocx(['']));
console.log('wrote empty.docx');

// hello.docx — one paragraph with "Hello, world."
writeFileSync(join(DOCX_DIR, 'hello.docx'), buildDocx(['Hello, world.']));
console.log('wrote hello.docx');

// three-para.docx — three short paragraphs
writeFileSync(
  join(DOCX_DIR, 'three-para.docx'),
  buildDocx(['First paragraph.', 'Second paragraph.', 'Third paragraph.']),
);
console.log('wrote three-para.docx');

// ─── M1 fixtures ─────────────────────────────────────────────────────────────

// bold-italic.docx — "Bold" (bold), " and " (normal), "Italic" (italic) in one paragraph.
writeFileSync(
  join(DOCX_DIR, 'bold-italic.docx'),
  buildFormattedDocx({
    documentXml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W_DECL}><w:body>
  <w:p>
    <w:r><w:rPr><w:b/></w:rPr><w:t>Bold</w:t></w:r>
    <w:r><w:t xml:space="preserve"> and </w:t></w:r>
    <w:r><w:rPr><w:i/></w:rPr><w:t>Italic</w:t></w:r>
  </w:p>
  <w:sectPr/>
</w:body></w:document>`,
    stylesXml: makeStylesXml(NORMAL_STYLE + DEFAULT_PARA_FONT_STYLE),
  }),
);
console.log('wrote bold-italic.docx');

// heading-and-body.docx — 1 Heading1 paragraph + 1 Normal paragraph.
writeFileSync(
  join(DOCX_DIR, 'heading-and-body.docx'),
  buildFormattedDocx({
    documentXml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W_DECL}><w:body>
  <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter One</w:t></w:r></w:p>
  <w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr><w:r><w:t>Body text here.</w:t></w:r></w:p>
  <w:sectPr/>
</w:body></w:document>`,
    stylesXml: makeStylesXml(NORMAL_STYLE + DEFAULT_PARA_FONT_STYLE + HEADING1_STYLE),
  }),
);
console.log('wrote heading-and-body.docx');

// bulleted-list.docx — 3 paragraphs with numPr (bullet).
const BULLET_NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering ${W_DECL}>
  <w:abstractNum w:abstractNumId="0">
    <w:nsid w:val="00AB1234"/>
    <w:multiLevelType w:val="hybridMultilevel"/>
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="·"/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
      <w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol"/></w:rPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`;

function makeBulletPara(text) {
  return `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>${escXml(text)}</w:t></w:r></w:p>`;
}

writeFileSync(
  join(DOCX_DIR, 'bulleted-list.docx'),
  buildFormattedDocx({
    documentXml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W_DECL}><w:body>
  ${makeBulletPara('First bullet item')}
  ${makeBulletPara('Second bullet item')}
  ${makeBulletPara('Third bullet item')}
  <w:sectPr/>
</w:body></w:document>`,
    stylesXml: makeStylesXml(NORMAL_STYLE + DEFAULT_PARA_FONT_STYLE),
    numberingXml: BULLET_NUMBERING,
  }),
);
console.log('wrote bulleted-list.docx');

// numbered-list.docx — 3 paragraphs with numPr (decimal).
const DECIMAL_NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering ${W_DECL}>
  <w:abstractNum w:abstractNumId="0">
    <w:nsid w:val="00CD5678"/>
    <w:multiLevelType w:val="multilevel"/>
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1."/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`;

function makeDecimalPara(text) {
  return `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>${escXml(text)}</w:t></w:r></w:p>`;
}

writeFileSync(
  join(DOCX_DIR, 'numbered-list.docx'),
  buildFormattedDocx({
    documentXml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W_DECL}><w:body>
  ${makeDecimalPara('First numbered item')}
  ${makeDecimalPara('Second numbered item')}
  ${makeDecimalPara('Third numbered item')}
  <w:sectPr/>
</w:body></w:document>`,
    stylesXml: makeStylesXml(NORMAL_STYLE + DEFAULT_PARA_FONT_STYLE),
    numberingXml: DECIMAL_NUMBERING,
  }),
);
console.log('wrote numbered-list.docx');

// styles-doc.docx — body with direct rPr/pPr, styles.xml has Normal + Heading1/2/3.
writeFileSync(
  join(DOCX_DIR, 'styles-doc.docx'),
  buildFormattedDocx({
    documentXml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W_DECL}><w:body>
  <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Main Title</w:t></w:r></w:p>
  <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Section</w:t></w:r></w:p>
  <w:p><w:pPr><w:pStyle w:val="Heading3"/></w:pPr><w:r><w:t>Subsection</w:t></w:r></w:p>
  <w:p><w:pPr><w:pStyle w:val="Normal"/><w:jc w:val="center"/></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="FF0000"/></w:rPr><w:t>Direct formatting: bold red 14pt centered</w:t></w:r>
  </w:p>
  <w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr>
    <w:r><w:rPr><w:i/><w:u w:val="single"/></w:rPr><w:t>Italic underlined text</w:t></w:r>
  </w:p>
  <w:sectPr/>
</w:body></w:document>`,
    stylesXml: makeStylesXml(
      NORMAL_STYLE + DEFAULT_PARA_FONT_STYLE + HEADING1_STYLE + HEADING2_STYLE + HEADING3_STYLE,
    ),
  }),
);
console.log('wrote styles-doc.docx');

console.log('All fixtures generated in', DOCX_DIR);
