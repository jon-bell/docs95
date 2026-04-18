import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCommandBus } from './command-bus.js';
import { asCommandId } from './command.js';
import type { Command, CommandContext } from './command.js';
import {
  makeDocument,
  makeParagraph,
  makeTestIdGen,
  makeTestClock,
  makeTestRandom,
  makeTestLog,
  resetIdCounter,
} from './test-helpers.js';
import { singleSelection } from './selection.js';
import { asNodeId } from '@word/domain';

function makeCtx(doc = makeDocument()): CommandContext {
  const para = doc.sections[0]?.children[0];
  const leafId = para?.id ?? asNodeId('leaf');
  return {
    doc,
    selection: singleSelection({ anchor: { leafId, offset: 0 }, focus: { leafId, offset: 0 } }),
    idGen: makeTestIdGen(),
    clock: makeTestClock(),
    random: makeTestRandom(),
    log: makeTestLog(),
  };
}

beforeEach(() => {
  resetIdCounter();
});

function makeBus() {
  let ctx: CommandContext = makeCtx();
  const onCommit = vi.fn();
  const bus = createCommandBus({
    getContext: () => ctx,
    onCommit,
  });
  return {
    bus,
    onCommit,
    setCtx: (c: CommandContext) => {
      ctx = c;
    },
  };
}

describe('createCommandBus – register/unregister/get/list', () => {
  it('registers and retrieves a command', () => {
    const { bus } = makeBus();
    const cmd: Command<void> = {
      meta: { id: asCommandId('test.cmd'), title: 'Test' },
      canRun: () => true,
      run: () => ({ ok: true, value: { ops: [] } }),
    };
    bus.register(cmd);
    expect(bus.get(asCommandId('test.cmd'))).toBe(cmd);
  });

  it('unregisters a command', () => {
    const { bus } = makeBus();
    const cmd: Command<void> = {
      meta: { id: asCommandId('test.cmd'), title: 'Test' },
      canRun: () => true,
      run: () => ({ ok: true, value: { ops: [] } }),
    };
    bus.register(cmd);
    bus.unregister(asCommandId('test.cmd'));
    expect(bus.get(asCommandId('test.cmd'))).toBeUndefined();
  });

  it('list returns all registered commands', () => {
    const { bus } = makeBus();
    const a: Command<void> = {
      meta: { id: asCommandId('a'), title: 'A' },
      canRun: () => true,
      run: () => ({ ok: true, value: { ops: [] } }),
    };
    const b: Command<void> = {
      meta: { id: asCommandId('b'), title: 'B' },
      canRun: () => true,
      run: () => ({ ok: true, value: { ops: [] } }),
    };
    bus.register(a);
    bus.register(b);
    const ids = bus.list().map((c) => c.meta.id);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
  });
});

describe('createCommandBus – dispatch', () => {
  it('returns error for unknown command', () => {
    const { bus } = makeBus();
    const result = bus.dispatch(asCommandId('unknown'), {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('internal');
    }
  });

  it('returns error if canRun is false', () => {
    const { bus } = makeBus();
    const cmd: Command<void> = {
      meta: { id: asCommandId('blocked'), title: 'Blocked' },
      canRun: () => false,
      run: () => ({ ok: true, value: { ops: [] } }),
    };
    bus.register(cmd);
    const result = bus.dispatch(asCommandId('blocked'), undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('constraint');
    }
  });

  it('calls onCommit with transaction and new doc on success', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const ctx = makeCtx(doc);
    const { bus, onCommit, setCtx } = makeBus();
    setCtx(ctx);

    const cmd: Command<void> = {
      meta: { id: asCommandId('insert'), title: 'Insert' },
      canRun: () => true,
      run: () => ({
        ok: true,
        value: {
          ops: [
            {
              kind: 'insertText',
              at: { leafId: para.id, offset: 5 },
              text: ' world',
            },
          ],
        },
      }),
    };
    bus.register(cmd);
    const result = bus.dispatch(asCommandId('insert'), undefined);
    expect(result.ok).toBe(true);
    expect(onCommit).toHaveBeenCalledTimes(1);
    const [txn] = onCommit.mock.calls[0]!;
    expect(txn.label).toBe('Insert');
  });

  it('propagates command error from run()', () => {
    const { bus } = makeBus();
    const cmd: Command<void> = {
      meta: { id: asCommandId('fail'), title: 'Fail' },
      canRun: () => true,
      run: () => ({ ok: false, error: { code: 'invalidArgs', message: 'bad args' } }),
    };
    bus.register(cmd);
    const result = bus.dispatch(asCommandId('fail'), undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('invalidArgs');
    }
  });

  it('returns error if run() throws', () => {
    const { bus } = makeBus();
    const cmd: Command<void> = {
      meta: { id: asCommandId('throws'), title: 'Throws' },
      canRun: () => true,
      run: () => {
        throw new Error('boom');
      },
    };
    bus.register(cmd);
    const result = bus.dispatch(asCommandId('throws'), undefined);
    expect(result.ok).toBe(false);
  });
});
