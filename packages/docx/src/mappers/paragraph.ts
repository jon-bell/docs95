// Bidirectional mapper: WireParagraph ↔ Domain Paragraph.
// M0 scope: plain-text runs only. pPr is preserved opaquely.
import type { Paragraph } from '@word/domain';
import { asNodeId, asPropsId } from '@word/domain';
import type { WireParagraph, WireBodyChild } from '../ast/index.js';
import { mapRunToDomain, mapDomainRunToWire } from './run.js';
import { buildUnknownNodeId } from './unknown-id.js';
import type { DocxWarning } from '../index.js';

export const EMPTY_PARA_PROPS_ID = asPropsId('__empty__');

/** Map a WireParagraph to a domain Paragraph. */
export function mapParagraphToDomain(wire: WireParagraph, warnings: DocxWarning[]): Paragraph {
  const children = wire.children.flatMap((child) => {
    if (child.type === 'run') {
      return mapRunToDomain(child, warnings);
    }
    // Unknown inline element: attach as UnknownElement on the last run or skip.
    // M0: emit a warning and discard — the unknown is already preserved in WireUnknown
    // which will be re-emitted on write via the paragraph's raw child list.
    warnings.push({
      code: 'UNSUPPORTED_PARA_CHILD',
      message: `Paragraph child <${child.tag}> (${child.ns}) preserved opaquely`,
    });
    return [];
  });

  return {
    id: asNodeId(buildUnknownNodeId(`p:${wire.pPrXml ?? ''}:${wire.children.length}`)),
    type: 'paragraph',
    attrs: { paraPropsId: EMPTY_PARA_PROPS_ID },
    children,
  };
}

/** Map a domain Paragraph back to WireParagraph. */
export function mapDomainParagraphToWire(para: Paragraph): WireParagraph {
  const children = para.children.map((inline) => {
    if (inline.type === 'run') {
      return mapDomainRunToWire(inline);
    }
    // Non-run inline nodes (break, fieldRun, etc.) are out of M0 scope;
    // emit a minimal unknown placeholder so the paragraph round-trips structurally.
    const xml = `<w:unknownInline/>`;
    return {
      type: 'unknown' as const,
      nodeId: buildUnknownNodeId(xml),
      ns: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
      tag: 'unknownInline',
      xml,
    };
  });

  return {
    type: 'paragraph',
    pPrXml: null,
    children,
  };
}

/** Map wire body children to domain paragraphs, emitting warnings for unknowns. */
export function mapBodyChildrenToDomain(
  children: readonly WireBodyChild[],
  warnings: DocxWarning[],
): Paragraph[] {
  const paras: Paragraph[] = [];
  for (const child of children) {
    if (child.type === 'paragraph') {
      paras.push(mapParagraphToDomain(child, warnings));
    } else {
      warnings.push({
        code: 'UNSUPPORTED_BODY_CHILD',
        message: `Body child <${child.tag}> (${child.ns}) preserved opaquely`,
      });
    }
  }
  return paras;
}
