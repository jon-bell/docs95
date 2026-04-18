/**
 * Set paragraph alignment on all paragraphs touched by the current selection.
 */
import type { NodeId, ParaProps } from '@word/domain';
import type { Command, CommandContext, CommandError, Result } from '../../command.js';
import { asCommandId } from '../../command.js';
import type { Patch } from '../../patch.js';
import type { Op } from '../../op.js';

export interface SetAlignmentParams {
  readonly alignment: NonNullable<ParaProps['alignment']>;
}

export function createSetAlignmentCommand(): Command<SetAlignmentParams> {
  return {
    meta: {
      id: asCommandId('app.format.alignment'),
      title: 'Alignment',
      category: 'format',
      coalesceKey: 'format:alignment',
    },

    canRun(_ctx: CommandContext, params: SetAlignmentParams): boolean {
      const valid: ReadonlyArray<string> = ['left', 'center', 'right', 'justify', 'distribute'];
      return valid.includes(params.alignment);
    },

    run(ctx: CommandContext, params: SetAlignmentParams): Result<Patch, CommandError> {
      const { anchor, focus } = ctx.selection.primary;
      // Apply to the anchor paragraph (and focus if different)
      const ids = new Set<NodeId>([anchor.leafId]);
      if (focus.leafId !== anchor.leafId) ids.add(focus.leafId);

      const ops: Op[] = Array.from(ids).map((paragraphId) => ({
        kind: 'setParaProps' as const,
        paragraphId,
        props: { alignment: params.alignment },
      }));
      return { ok: true, value: { ops } };
    },
  };
}
