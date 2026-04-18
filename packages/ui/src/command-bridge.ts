import type { EditorInstance } from '@word/engine';
import type { DocumentStore } from './stores/document-store.js';

export interface CommandBridgeDispose {
  (): void;
}

/**
 * Subscribes to engine events and synchronises them into the DocumentStore.
 * Returns a dispose function that removes all subscriptions.
 *
 * Wiring belongs at the app composition root, not inside any component,
 * so the bridge lives here rather than in a hook.
 */
export function wireEditorToStore(
  editor: EditorInstance,
  store: Pick<DocumentStore, 'applyTransaction' | 'replaceDocument' | 'setSelection'>,
): CommandBridgeDispose {
  const offStateChanged = editor.on('stateChanged', ({ doc, txn }) => {
    store.applyTransaction(txn, doc);
  });

  const offSelectionChanged = editor.on('selectionChanged', ({ selection }) => {
    store.setSelection(selection);
  });

  const offDocumentLoaded = editor.on('documentLoaded', ({ doc }) => {
    store.replaceDocument(doc);
  });

  // historyChanged does not map to DocumentStore state in M0;
  // a future UIStore field (canUndo/canRedo) will consume it.
  const offHistoryChanged = editor.on('historyChanged', () => {
    // reserved for UIStore canUndo/canRedo — no-op in M0
  });

  return (): void => {
    offStateChanged();
    offSelectionChanged();
    offDocumentLoaded();
    offHistoryChanged();
  };
}
