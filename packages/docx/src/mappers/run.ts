// Bidirectional mapper: WireRun ↔ Domain Run.
// M0 scope: plain text and line breaks only. rPr preserved opaquely.
import type { Run, InlineNode } from '@word/domain';
import { asNodeId, asPropsId } from '@word/domain';
import type { WireRun } from '../ast/index.js';
import { buildUnknownNodeId } from './unknown-id.js';
import type { DocxWarning } from '../index.js';

export const EMPTY_RUN_PROPS_ID = asPropsId('__empty__');

/** Map a WireRun to zero or more domain InlineNodes. */
export function mapRunToDomain(wire: WireRun, warnings: DocxWarning[]): InlineNode[] {
  const results: InlineNode[] = [];

  for (const child of wire.children) {
    if (child.type === 'text') {
      const run: Run = {
        id: asNodeId(buildUnknownNodeId(`run:${child.value}:${wire.rPrXml ?? ''}`)),
        type: 'run',
        attrs: { runPropsId: EMPTY_RUN_PROPS_ID },
        text: child.value,
      };
      results.push(run);
    } else if (child.type === 'break') {
      // Breaks are out of M0 domain scope; preserve as unknown inline
      // by emitting a warning. The run text content is still captured.
      warnings.push({
        code: 'UNSUPPORTED_RUN_CHILD',
        message: `Run child break (type=${child.breakType ?? 'line'}) skipped in M0`,
      });
    } else {
      warnings.push({
        code: 'UNSUPPORTED_RUN_CHILD',
        message: `Run child <${child.tag}> (${child.ns}) skipped in M0`,
      });
    }
  }

  return results;
}

/** Map a domain Run back to WireRun. */
export function mapDomainRunToWire(run: Run): WireRun {
  const needsPreserveSpace = run.text.startsWith(' ') || run.text.endsWith(' ');
  return {
    type: 'run',
    rPrXml: null,
    children: [
      {
        type: 'text',
        value: run.text,
        preserveSpace: needsPreserveSpace,
      },
    ],
  };
}
