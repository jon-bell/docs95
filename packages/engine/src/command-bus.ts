import type {
  AnyCommand,
  Command,
  CommandError,
  CommandId,
  CommandContext,
  Result,
} from './command.js';
import type { Transaction } from './transaction.js';
import { applyPatch, type Patch } from './patch.js';
import type { Document } from '@word/domain';

export interface CommandBus {
  register<P>(cmd: Command<P>): void;
  unregister(id: CommandId): void;
  get(id: CommandId): AnyCommand | undefined;
  dispatch<P>(id: CommandId, params: P): Result<Transaction, CommandError>;
  list(): readonly AnyCommand[];
}

export interface CommandBusOptions {
  /** Called before command runs to get current state. */
  getContext: () => CommandContext;
  /** Called with the result transaction after a successful dispatch. */
  onCommit: (txn: Transaction, newDoc: Document) => void;
}

/**
 * Creates a CommandBus instance.
 *
 * dispatch() flow:
 *   1. Look up command.
 *   2. canRun? no → error.
 *   3. run(ctx, params) → Patch or error.
 *   4. applyPatch(doc, patch) → {doc, inverse}.
 *   5. Build Transaction.
 *   6. Call onCommit so caller can update history and doc state.
 *   7. Return ok(txn).
 */
export function createCommandBus(options: CommandBusOptions): CommandBus {
  const registry = new Map<CommandId, AnyCommand>();

  return {
    register<P>(cmd: Command<P>): void {
      registry.set(cmd.meta.id, cmd as AnyCommand);
    },

    unregister(id: CommandId): void {
      registry.delete(id);
    },

    get(id: CommandId): AnyCommand | undefined {
      return registry.get(id);
    },

    list(): readonly AnyCommand[] {
      return Array.from(registry.values());
    },

    dispatch<P>(id: CommandId, params: P): Result<Transaction, CommandError> {
      const cmd = registry.get(id);
      if (cmd === undefined) {
        return {
          ok: false,
          error: {
            code: 'internal',
            message: `Command "${id}" is not registered`,
          },
        };
      }

      const ctx = options.getContext();

      // canRun check
      let canRun: boolean;
      try {
        canRun = (cmd as Command<P>).canRun(ctx, params);
      } catch (err) {
        return {
          ok: false,
          error: {
            code: 'internal',
            message: 'canRun threw',
            cause: err,
          },
        };
      }
      if (!canRun) {
        return {
          ok: false,
          error: {
            code: 'constraint',
            message: `Command "${id}" cannot run in current context`,
          },
        };
      }

      // Run the command
      let runResult: Result<Patch, CommandError>;
      try {
        runResult = (cmd as Command<P>).run(ctx, params);
      } catch (err) {
        return {
          ok: false,
          error: {
            code: 'internal',
            message: 'Command run threw an exception',
            cause: err,
          },
        };
      }
      if (!runResult.ok) {
        return runResult;
      }

      const patch = runResult.value;

      // Apply the patch
      let patchResult: ReturnType<typeof applyPatch>;
      try {
        patchResult = applyPatch(ctx.doc, patch, {
          idGen: ctx.idGen,
        });
      } catch (err) {
        return {
          ok: false,
          error: {
            code: 'internal',
            message: 'applyPatch threw',
            cause: err,
          },
        };
      }

      const newDoc = patchResult.doc;
      const inversePatch = patchResult.inverse;

      // Build transaction
      const txnBase = {
        id: ctx.idGen.newId(),
        label: cmd.meta.title,
        timestamp: ctx.clock.now(),
        atomic: true,
        ops: patch,
        inverse: inversePatch,
      };
      const txn: Transaction =
        cmd.meta.coalesceKey !== undefined
          ? { ...txnBase, coalesceKey: cmd.meta.coalesceKey }
          : txnBase;

      options.onCommit(txn, newDoc);

      return { ok: true, value: txn };
    },
  };
}
