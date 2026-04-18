import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEditorInstance } from './editor-instance.js';
import { createInsertTextCommand } from './commands/insert-text.js';
import { createSplitParagraphCommand } from './commands/split-paragraph.js';
import {
  makeDocument,
  makeParagraph,
  makeTestIdGen,
  makeTestClock,
  makeTestRandom,
  makeTestLog,
  firstParaText,
  resetIdCounter,
} from './test-helpers.js';
import { asCommandId } from './command.js';

function makeInstance(para = makeParagraph('hello')) {
  const doc = makeDocument([para]);
  const instance = createEditorInstance({
    doc,
    idGen: makeTestIdGen(),
    clock: makeTestClock(),
    random: makeTestRandom(),
    log: makeTestLog(),
  });
  return { instance, doc, para };
}

beforeEach(() => {
  resetIdCounter();
});

describe('createEditorInstance – basics', () => {
  it('exposes the initial document', () => {
    const { instance, doc } = makeInstance();
    expect(instance.doc).toBe(doc);
  });

  it('exposes a CommandBus', () => {
    const { instance } = makeInstance();
    expect(instance.bus).toBeDefined();
    expect(typeof instance.bus.dispatch).toBe('function');
  });

  it('exposes History', () => {
    const { instance } = makeInstance();
    expect(instance.history).toBeDefined();
    expect(instance.history.canUndo).toBe(false);
  });
});

describe('createEditorInstance – dispatch and stateChanged', () => {
  it('updates doc after dispatching insertText', () => {
    const { instance, para } = makeInstance();
    instance.bus.register(createInsertTextCommand());

    const result = instance.bus.dispatch(asCommandId('doc.insertText'), {
      text: ' world',
      at: { leafId: para.id, offset: 5 },
    });
    expect(result.ok).toBe(true);
    expect(firstParaText(instance.doc)).toBe('hello world');
  });

  it('emits stateChanged event', () => {
    const { instance, para } = makeInstance();
    instance.bus.register(createInsertTextCommand());

    const handler = vi.fn();
    instance.on('stateChanged', handler);

    instance.bus.dispatch(asCommandId('doc.insertText'), {
      text: ' world',
      at: { leafId: para.id, offset: 5 },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0].doc).toBe(instance.doc);
  });

  it('emits historyChanged after first dispatch', () => {
    const { instance, para } = makeInstance();
    instance.bus.register(createInsertTextCommand());

    const handler = vi.fn();
    instance.on('historyChanged', handler);

    instance.bus.dispatch(asCommandId('doc.insertText'), {
      text: ' world',
      at: { leafId: para.id, offset: 5 },
    });

    expect(handler).toHaveBeenCalledWith({ canUndo: true, canRedo: false });
  });

  it('unsubscribe works', () => {
    const { instance, para } = makeInstance();
    instance.bus.register(createInsertTextCommand());

    const handler = vi.fn();
    const unsub = instance.on('stateChanged', handler);
    unsub();

    instance.bus.dispatch(asCommandId('doc.insertText'), {
      text: ' world',
      at: { leafId: para.id, offset: 5 },
    });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('createEditorInstance – replaceDocument', () => {
  it('replaces the document and clears history', () => {
    const { instance, para } = makeInstance();
    instance.bus.register(createInsertTextCommand());
    instance.bus.dispatch(asCommandId('doc.insertText'), {
      text: ' world',
      at: { leafId: para.id, offset: 5 },
    });
    expect(instance.history.canUndo).toBe(true);

    const newDoc = makeDocument([makeParagraph('fresh start')]);
    instance.replaceDocument(newDoc);

    expect(instance.doc).toBe(newDoc);
    expect(instance.history.canUndo).toBe(false);
  });

  it('emits documentLoaded', () => {
    const { instance } = makeInstance();
    const handler = vi.fn();
    instance.on('documentLoaded', handler);

    const newDoc = makeDocument();
    instance.replaceDocument(newDoc);

    expect(handler).toHaveBeenCalledWith({ doc: newDoc });
  });
});

describe('createEditorInstance – undo via history', () => {
  it('undo after insertText restores original text', () => {
    const { instance, para } = makeInstance();
    instance.bus.register(createInsertTextCommand());

    instance.bus.dispatch(asCommandId('doc.insertText'), {
      text: ' world',
      at: { leafId: para.id, offset: 5 },
    });
    expect(firstParaText(instance.doc)).toBe('hello world');

    const undoResult = instance.history.undo();
    expect(undoResult).toBeDefined();
    // The doc returned by undo is the pre-edit snapshot
    expect(firstParaText(undoResult!.doc)).toBe('hello');
  });
});

describe('createEditorInstance – splitParagraph', () => {
  it('splits paragraph on command dispatch', () => {
    const { instance } = makeInstance();
    instance.bus.register(createSplitParagraphCommand());

    // Selection starts at paragraph start (offset 0); split produces empty first para + full second
    instance.bus.dispatch(asCommandId('doc.splitParagraph'), {});
    expect(instance.doc.sections[0]?.children).toHaveLength(2);
  });
});
