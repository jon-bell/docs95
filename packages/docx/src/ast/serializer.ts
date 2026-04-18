// Serialize a WireDocument back to word/document.xml XML string.
// Unknown elements (WireUnknown) are re-emitted verbatim.
import type {
  WireDocument,
  WireParagraph,
  WireParagraphChild,
  WireRun,
  WireRunChild,
  WireText,
  WireBreak,
} from './index.js';

function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function serializeText(wire: WireText): string {
  const spaceAttr = wire.preserveSpace ? ' xml:space="preserve"' : '';
  return `<w:t${spaceAttr}>${escXml(wire.value)}</w:t>`;
}

function serializeBreak(wire: WireBreak): string {
  const typeAttr = wire.breakType != null ? ` w:type="${escXml(wire.breakType)}"` : '';
  const clearAttr = wire.clear != null ? ` w:clear="${escXml(wire.clear)}"` : '';
  return `<w:br${typeAttr}${clearAttr}/>`;
}

function serializeRunChild(child: WireRunChild): string {
  if (child.type === 'text') return serializeText(child);
  if (child.type === 'break') return serializeBreak(child);
  // unknown: re-emit verbatim
  return child.xml;
}

function serializeRun(wire: WireRun): string {
  const rPr = wire.rPrXml ?? '';
  const content = wire.children.map(serializeRunChild).join('');
  return `<w:r>${rPr}${content}</w:r>`;
}

function serializeParagraphChild(child: WireParagraphChild): string {
  if (child.type === 'run') return serializeRun(child);
  // unknown: re-emit verbatim
  return child.xml;
}

function serializeParagraph(wire: WireParagraph): string {
  const pPr = wire.pPrXml ?? '';
  const content = wire.children.map(serializeParagraphChild).join('');
  return `<w:p>${pPr}${content}</w:p>`;
}

const DOCUMENT_NS_DECLS = [
  'xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"',
  'xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex"',
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"',
  'xmlns:aink="http://schemas.microsoft.com/office/drawing/2016/ink"',
  'xmlns:am3d="http://schemas.microsoft.com/office/drawing/2017/model3d"',
  'xmlns:o="urn:schemas-microsoft-com:office:office"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"',
  'xmlns:v="urn:schemas-microsoft-com:vml"',
  'xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"',
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  'xmlns:w10="urn:schemas-microsoft-com:office:word"',
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
  'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"',
  'xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"',
  'xmlns:w16cex="http://schemas.microsoft.com/office/word/2018/wordml/cex"',
  'xmlns:w16cid="http://schemas.microsoft.com/office/word/2016/wordml/cid"',
  'xmlns:w16="http://schemas.microsoft.com/office/word/2018/wordml"',
  'xmlns:w16sdtdh="http://schemas.microsoft.com/office/word/2020/wordml/sdtdatahash"',
  'xmlns:w16se="http://schemas.microsoft.com/office/word/2015/wordml/symex"',
  'xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"',
  'xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"',
  'xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"',
  'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"',
].join(' ');

/** Serialize a WireDocument to the XML content of word/document.xml. */
export function serializeWireDocument(wire: WireDocument): string {
  const bodyChildren = wire.body.children
    .map((child) => {
      if (child.type === 'paragraph') return serializeParagraph(child);
      return child.xml;
    })
    .join('');

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<w:document ${DOCUMENT_NS_DECLS}><w:body>${bodyChildren}</w:body></w:document>`
  );
}
