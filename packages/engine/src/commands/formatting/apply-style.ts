/**
 * Apply a named paragraph style to all paragraphs in the selection.
 * Sets ParaProps.styleRef to the given styleId.
 */
import type { NodeId } from '@word/domain';
import type { Command, CommandContext, CommandError, Result } from '../../command.js';
import { asCommandId } from '../../command.js';
import type { Patch } from '../../patch.js';
import type { Op } from '../../op.js';

export interface ApplyStyleParams {
  readonly styleId: string;
}

export function createApplyStyleCommand(): Command<ApplyStyleParams> {
  return {
    meta: {
      id: asCommandId('app.format.applyStyle'),
      title: 'Apply Style',
      category: 'format',
      coalesceKey: 'format:applyStyle',
    },

    canRun(_ctx: CommandContext, params: ApplyStyleParams): boolean {
      return typeof params.styleId === 'string' && params.styleId.length > 0;
    },

    run(ctx: CommandContext, params: ApplyStyleParams): Result<Patch, CommandError> {
      const { anchor, focus } = ctx.selection.primary;
      const ids = new Set<NodeId>([anchor.leafId]);
      if (focus.leafId !== anchor.leafId) ids.add(focus.leafId);

      const ops: Op[] = Array.from(ids).map((paragraphId) => ({
        kind: 'setParaProps' as const,
        paragraphId,
        props: { styleRef: params.styleId },
      }));
      return { ok: true, value: { ops } };
    },
  };
}
