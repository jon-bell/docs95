import type { Document, IdGenPort, ClockPort, RandomPort, LogPort, NodeId } from '@word/domain';
import type { CommandBus } from './command-bus.js';
import { createCommandBus } from './command-bus.js';
import type { History } from './history.js';
import { createHistory } from './history.js';
import type { SelectionSet } from './selection.js';
import { singleSelection } from './selection.js';
import type { Transaction } from './transaction.js';
import mitt from 'mitt';

export type EditorEventMap = {
  stateChanged: { readonly doc: Document; readonly txn: Transaction };
  selectionChanged: { readonly selection: SelectionSet };
  documentLoaded: { readonly doc: Document };
  historyChanged: { readonly canUndo: boolean; readonly canRedo: boolean };
};

export type EditorEventName = keyof EditorEventMap;

export interface EditorInstance {
  readonly doc: Document;
  readonly selection: SelectionSet;
  readonly bus: CommandBus;
  readonly history: History;
  on<K extends EditorEventName>(
    event: K,
    handler: (payload: EditorEventMap[K]) => void,
  ): () => void;
  replaceDocument(doc: Document): void;
  setSelection(sel: SelectionSet): void;
}

export interface EditorInstanceOptions {
  readonly doc: Document;
  readonly idGen: IdGenPort;
  readonly clock: ClockPort;
  readonly random: RandomPort;
  readonly log: LogPort;
  readonly historyLimit?: number;
}

/**
 * Creates an EditorInstance — the top-level facade for the engine layer.
 *
 * Responsibilities:
 * - Owns the current Document snapshot (immutable; replaced on each commit).
 * - Owns the current SelectionSet.
 * - Wires CommandBus, History, and event emission.
 * - Emits stateChanged on each committed transaction.
 * - Emits historyChanged when undo/redo availability changes.
 * - Emits selectionChanged when selection is updated.
 * - Emits documentLoaded when replaceDocument() is called.
 */
export function createEditorInstance(options: EditorInstanceOptions): EditorInstance {
  const emitter = mitt<EditorEventMap>();

  let currentDoc = options.doc;

  // Start with a collapsed selection at the start of the first paragraph
  const firstLeafId = (() => {
    const firstSection = options.doc.sections[0];
    if (firstSection === undefined) return '' as NodeId;
    const firstBlock = firstSection.children[0];
    if (firstBlock === undefined) return '' as NodeId;
    return firstBlock.id;
  })();
  let currentSelection: SelectionSet = singleSelection({
    anchor: { leafId: firstLeafId, offset: 0 },
    focus: { leafId: firstLeafId, offset: 0 },
  });

  const historyImpl = createHistory(
    options.historyLimit !== undefined ? { limit: options.historyLimit } : {},
  );
  const history: History = historyImpl;

  let prevCanUndo = history.canUndo;
  let prevCanRedo = history.canRedo;

  function checkHistoryChanged(): void {
    const nowCanUndo = history.canUndo;
    const nowCanRedo = history.canRedo;
    if (nowCanUndo !== prevCanUndo || nowCanRedo !== prevCanRedo) {
      prevCanUndo = nowCanUndo;
      prevCanRedo = nowCanRedo;
      emitter.emit('historyChanged', { canUndo: nowCanUndo, canRedo: nowCanRedo });
    }
  }

  const bus = createCommandBus({
    getContext: () => ({
      doc: currentDoc,
      selection: currentSelection,
      idGen: options.idGen,
      clock: options.clock,
      random: options.random,
      log: options.log,
    }),
    onCommit: (txn: Transaction, newDoc: Document) => {
      const docBefore = currentDoc;
      currentDoc = newDoc;

      historyImpl._pushWithBefore(txn, newDoc, docBefore);

      emitter.emit('stateChanged', { doc: currentDoc, txn });
      checkHistoryChanged();
    },
  });

  return {
    get doc(): Document {
      return currentDoc;
    },

    get selection(): SelectionSet {
      return currentSelection;
    },

    get bus(): CommandBus {
      return bus;
    },

    get history(): History {
      return history;
    },

    on<K extends EditorEventName>(
      event: K,
      handler: (payload: EditorEventMap[K]) => void,
    ): () => void {
      // mitt's generics require the handler to match the exact event type.
      // We use a typed overload to satisfy the constraint.
      (
        emitter.on as <E extends EditorEventName>(
          type: E,
          handler: (event: EditorEventMap[E]) => void,
        ) => void
      )(event, handler);
      return () => {
        (
          emitter.off as <E extends EditorEventName>(
            type: E,
            handler?: (event: EditorEventMap[E]) => void,
          ) => void
        )(event, handler);
      };
    },

    replaceDocument(doc: Document): void {
      currentDoc = doc;
      historyImpl.clear();
      prevCanUndo = false;
      prevCanRedo = false;
      emitter.emit('documentLoaded', { doc });
      emitter.emit('historyChanged', { canUndo: false, canRedo: false });
    },

    setSelection(sel: SelectionSet): void {
      currentSelection = sel;
      emitter.emit('selectionChanged', { selection: sel });
    },
  };
}
