/**
 * Set paragraph spacing. Three sub-commands:
 *   app.format.spacingBefore — before twips
 *   app.format.spacingAfter  — after twips
 *   app.format.lineSpacing   — line spacing (lineTwips + lineRule)
 */
import type { NodeId, ParaProps } from '@word/domain';
import type { Command, CommandError, Result } from '../../command.js';
import { asCommandId } from '../../command.js';
import type { Patch } from '../../patch.js';
import type { Op } from '../../op.js';

export interface SetSpacingBeforeParams {
  readonly beforeTwips: number;
}

export interface SetSpacingAfterParams {
  readonly afterTwips: number;
}

export interface SetLineSpacingParams {
  readonly lineTwips: number;
  readonly lineRule: NonNullable<NonNullable<ParaProps['spacing']>['lineRule']>;
}

function paragraphIds(ctx: {
  selection: { primary: { anchor: { leafId: NodeId }; focus: { leafId: NodeId } } };
}): readonly NodeId[] {
  const { anchor, focus } = ctx.selection.primary;
  const ids = new Set<NodeId>([anchor.leafId]);
  if (focus.leafId !== anchor.leafId) ids.add(focus.leafId);
  return Array.from(ids);
}

export function createSetSpacingBeforeCommand(): Command<SetSpacingBeforeParams> {
  return {
    meta: {
      id: asCommandId('app.format.spacingBefore'),
      title: 'Space Before',
      category: 'format',
      coalesceKey: 'format:spacingBefore',
    },
    canRun(_ctx, params): boolean {
      return Number.isFinite(params.beforeTwips);
    },
    run(ctx, params): Result<Patch, CommandError> {
      const ops: Op[] = paragraphIds(ctx).map((paragraphId) => ({
        kind: 'setParaProps' as const,
        paragraphId,
        props: { spacing: { beforeTwips: params.beforeTwips } },
      }));
      return { ok: true, value: { ops } };
    },
  };
}

export function createSetSpacingAfterCommand(): Command<SetSpacingAfterParams> {
  return {
    meta: {
      id: asCommandId('app.format.spacingAfter'),
      title: 'Space After',
      category: 'format',
      coalesceKey: 'format:spacingAfter',
    },
    canRun(_ctx, params): boolean {
      return Number.isFinite(params.afterTwips);
    },
    run(ctx, params): Result<Patch, CommandError> {
      const ops: Op[] = paragraphIds(ctx).map((paragraphId) => ({
        kind: 'setParaProps' as const,
        paragraphId,
        props: { spacing: { afterTwips: params.afterTwips } },
      }));
      return { ok: true, value: { ops } };
    },
  };
}

export function createSetLineSpacingCommand(): Command<SetLineSpacingParams> {
  return {
    meta: {
      id: asCommandId('app.format.lineSpacing'),
      title: 'Line Spacing',
      category: 'format',
      coalesceKey: 'format:lineSpacing',
    },
    canRun(_ctx, params): boolean {
      const valid: ReadonlyArray<string> = ['auto', 'atLeast', 'exact'];
      return Number.isFinite(params.lineTwips) && valid.includes(params.lineRule);
    },
    run(ctx, params): Result<Patch, CommandError> {
      const ops: Op[] = paragraphIds(ctx).map((paragraphId) => ({
        kind: 'setParaProps' as const,
        paragraphId,
        props: { spacing: { lineTwips: params.lineTwips, lineRule: params.lineRule } },
      }));
      return { ok: true, value: { ops } };
    },
  };
}
