/**
 * Toggle numbered list on the selection paragraphs.
 * Uses numId=2 for default numbered list, ilvl=0.
 * If all selected paragraphs already have numId=2, clears numbering.
 */
import type { Document, NodeId, Paragraph, ParaProps } from '@word/domain';
import type { Command, CommandContext, CommandError, Result } from '../../command.js';
import { asCommandId } from '../../command.js';
import type { Patch } from '../../patch.js';
import type { Op } from '../../op.js';

const NUMBERED_NUM_ID = 2;

function getParaNumbering(
  doc: Document,
  paragraphId: NodeId,
): { numId: number; ilvl: number } | undefined {
  for (const section of doc.sections) {
    for (const block of section.children) {
      if (block.type !== 'paragraph' || block.id !== paragraphId) continue;
      const para = block as Paragraph;
      const props = doc.props.para.get(para.attrs.paraPropsId);
      return props?.numbering;
    }
  }
  return undefined;
}

function clearNumberingProps(): Partial<ParaProps> {
  const p: Record<string, unknown> = {};
  p['numbering'] = undefined;
  return p as Partial<ParaProps>;
}

export function createToggleNumberedListCommand(): Command<void> {
  return {
    meta: {
      id: asCommandId('app.format.list.numbered'),
      title: 'Numbered List',
      category: 'format',
      coalesceKey: 'format:list:numbered',
    },

    canRun(): boolean {
      return true;
    },

    run(ctx: CommandContext): Result<Patch, CommandError> {
      const { anchor, focus } = ctx.selection.primary;
      const ids = new Set<NodeId>([anchor.leafId]);
      if (focus.leafId !== anchor.leafId) ids.add(focus.leafId);

      const idArray = Array.from(ids);
      const allNumbered = idArray.every((id) => {
        const num = getParaNumbering(ctx.doc, id);
        return num !== undefined && num.numId === NUMBERED_NUM_ID;
      });

      const ops: Op[] = idArray.map((paragraphId) => ({
        kind: 'setParaProps' as const,
        paragraphId,
        props: allNumbered
          ? clearNumberingProps()
          : { numbering: { numId: NUMBERED_NUM_ID, ilvl: 0 } },
      }));
      return { ok: true, value: { ops } };
    },
  };
}
