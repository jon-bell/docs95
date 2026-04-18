import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppShell,
  FindReplaceDialog,
  FormattingToolbar,
  createKeyboardDispatcher,
  useActiveFormatting,
  useDocumentStore,
  useUIStore,
  wireEditorToStore,
  type FindOptions as UIFindOptions,
} from '@word/ui';
import {
  asCommandId,
  createApplyStyleCommand,
  createDeleteRangeCommand,
  createEditorInstance,
  createFindCommand,
  createFindNextCommand,
  createFindPrevCommand,
  createInsertTextCommand,
  createRedoCommand,
  createReplaceAllCommand,
  createReplaceCommand,
  createSetAlignmentCommand,
  createSetFontColorCommand,
  createSetFontNameCommand,
  createSetFontSizeCommand,
  createSetFirstLineIndentCommand,
  createSetHangingIndentCommand,
  createSetIndentLeftCommand,
  createSetIndentRightCommand,
  createSetLineSpacingCommand,
  createSetSpacingAfterCommand,
  createSetSpacingBeforeCommand,
  createSplitParagraphCommand,
  createToggleBoldCommand,
  createToggleBulletedListCommand,
  createToggleItalicCommand,
  createToggleNumberedListCommand,
  createToggleStrikethroughCommand,
  createToggleUnderlineCommand,
  createUndoCommand,
  findNext as findNextImpl,
  isCollapsed,
  singleSelection,
  type FindOptions as EngineFindOptions,
} from '@word/engine';
import { createEmptyDocument, createIdGen } from '@word/domain';
import type { EditorInstance } from '@word/engine';
import { layoutDocument, type LayoutInput } from '@word/layout';
import {
  Caret,
  ImeSurface,
  PageHost,
  SelectionOverlay,
  createCanvasMetrics,
  useHitTest,
} from '@word/render';
import { createClockPort, createConsoleLog, createRandomPort } from './ports.js';
import { openDocxFile, saveDocxFile } from './file-io.js';
import { createWelcomeDocument } from './welcome-document.js';

/** Translate UI's FindOptions to engine FindOptions. */
function toEngineFindOptions(query: string, options: UIFindOptions): EngineFindOptions {
  return {
    query,
    caseSensitive: options.matchCase,
    wholeWord: options.wholeWord,
    regex: options.regex,
  };
}

function useEditor(): EditorInstance {
  const [editor] = useState(() => {
    const idGen = createIdGen();
    const clock = createClockPort();
    const random = createRandomPort();
    const log = createConsoleLog();
    const doc = createWelcomeDocument(idGen);
    const ed = createEditorInstance({ doc, idGen, clock, random, log });

    // Core editing commands
    ed.bus.register(createInsertTextCommand());
    ed.bus.register(createDeleteRangeCommand());
    ed.bus.register(createSplitParagraphCommand());
    ed.bus.register(createUndoCommand());
    ed.bus.register(createRedoCommand());

    // Character formatting
    ed.bus.register(createToggleBoldCommand());
    ed.bus.register(createToggleItalicCommand());
    ed.bus.register(createToggleUnderlineCommand());
    ed.bus.register(createToggleStrikethroughCommand());
    ed.bus.register(createSetFontNameCommand());
    ed.bus.register(createSetFontSizeCommand());
    ed.bus.register(createSetFontColorCommand());

    // Paragraph formatting
    ed.bus.register(createSetAlignmentCommand());
    ed.bus.register(createSetIndentLeftCommand());
    ed.bus.register(createSetIndentRightCommand());
    ed.bus.register(createSetFirstLineIndentCommand());
    ed.bus.register(createSetHangingIndentCommand());
    ed.bus.register(createSetSpacingBeforeCommand());
    ed.bus.register(createSetSpacingAfterCommand());
    ed.bus.register(createSetLineSpacingCommand());
    ed.bus.register(createApplyStyleCommand());
    ed.bus.register(createToggleBulletedListCommand());
    ed.bus.register(createToggleNumberedListCommand());

    // Find / replace
    ed.bus.register(createFindCommand());
    ed.bus.register(createFindNextCommand());
    ed.bus.register(createFindPrevCommand());
    ed.bus.register(createReplaceCommand());
    ed.bus.register(createReplaceAllCommand());

    return ed;
  });
  return editor;
}

export const App: React.FC = () => {
  const editor = useEditor();
  const store = useDocumentStore();
  const uiStore = useUIStore();
  const metrics = useMemo(() => createCanvasMetrics(), []);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const imeSurfaceRef = useRef<HTMLSpanElement | null>(null);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [findReplaceTab, setFindReplaceTab] = useState<'find' | 'replace'>('find');

  useEffect(() => {
    store.replaceDocument(editor.doc);
    store.setSelection(editor.selection);
    const dispose = wireEditorToStore(editor, store);
    return dispose;
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  const pages = useMemo(() => {
    if (!store.doc) return [];
    const input: LayoutInput = {
      doc: store.doc,
      metrics,
      viewportPx: { widthPx: 816, heightPx: 1056 },
    };
    return layoutDocument(input);
  }, [store.doc, metrics]);

  useEffect(() => {
    uiStore.setPagination(1, Math.max(pages.length, 1));
  }, [pages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeFormatting = useActiveFormatting(store.doc, store.selection);

  // Resolve caret coordinates for IME surface placement.
  // MVP: use the top-left of the focused paragraph's first matching line.
  const caretCoords = useMemo((): { x: number; y: number } => {
    const focus = store.selection.primary.focus;
    for (const page of pages) {
      for (const line of page.lines) {
        if (line.paragraphId === focus.leafId) {
          return { x: line.leftPx, y: line.topPx };
        }
      }
    }
    return { x: 0, y: 0 };
  }, [store.selection, pages]);

  const hitTest = useHitTest(pages, viewportRef);

  const handleViewportMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const pos = hitTest(e.clientX, e.clientY);
      if (pos !== undefined) {
        editor.setSelection(singleSelection({ anchor: pos, focus: pos }));
      }
      // Move focus to the IME surface so keystrokes are captured.
      imeSurfaceRef.current?.focus();
    },
    [editor, hitTest],
  );

  const handleBeforeInput = useCallback(
    (event: InputEvent) => {
      event.preventDefault();

      const { inputType } = event;

      if (inputType === 'insertText' || inputType === 'insertFromPaste') {
        const text = event.data;
        if (text !== null && text.length > 0) {
          const { anchor, focus } = editor.selection.primary;
          // When selection is non-collapsed, the command deletes the range first,
          // then inserts at the start offset.
          const collapsed = isCollapsed(editor.selection);
          const effectiveOffset = collapsed ? focus.offset : Math.min(anchor.offset, focus.offset);
          const effectiveLeafId = anchor.leafId;
          const result = editor.bus.dispatch(asCommandId('doc.insertText'), { text });
          if (result.ok) {
            const newOffset = effectiveOffset + text.length;
            const newPos = { leafId: effectiveLeafId, offset: newOffset };
            editor.setSelection(singleSelection({ anchor: newPos, focus: newPos }));
          }
        }
        return;
      }

      if (inputType === 'deleteContentBackward') {
        if (isCollapsed(editor.selection)) {
          const { focus } = editor.selection.primary;
          if (focus.offset > 0) {
            // Expand one character backward before deleting.
            const expandedSel = singleSelection({
              anchor: { leafId: focus.leafId, offset: focus.offset - 1 },
              focus,
            });
            editor.setSelection(expandedSel);
          } else {
            // At offset 0 — nothing to delete on this line for MVP.
            return;
          }
        }
        // After delete, collapse selection to the start (lower offset).
        const { anchor, focus } = editor.selection.primary;
        const startOffset = Math.min(anchor.offset, focus.offset);
        editor.bus.dispatch(asCommandId('doc.deleteRange'), {});
        const collapsePos = { leafId: anchor.leafId, offset: startOffset };
        editor.setSelection(singleSelection({ anchor: collapsePos, focus: collapsePos }));
        return;
      }

      if (inputType === 'deleteContentForward') {
        if (isCollapsed(editor.selection)) {
          const { focus } = editor.selection.primary;
          // Expand one character forward; let the command no-op if out of range.
          const expandedSel = singleSelection({
            anchor: focus,
            focus: { leafId: focus.leafId, offset: focus.offset + 1 },
          });
          editor.setSelection(expandedSel);
        }
        const { anchor, focus } = editor.selection.primary;
        const startOffset = Math.min(anchor.offset, focus.offset);
        editor.bus.dispatch(asCommandId('doc.deleteRange'), {});
        const collapsePos = { leafId: anchor.leafId, offset: startOffset };
        editor.setSelection(singleSelection({ anchor: collapsePos, focus: collapsePos }));
        return;
      }

      if (inputType === 'insertParagraph') {
        editor.bus.dispatch(asCommandId('doc.splitParagraph'), {});
        return;
      }
    },
    [editor],
  );

  const handleCommand = useCallback(
    async (commandId: string, params?: unknown): Promise<void> => {
      // File operations
      if (commandId === 'app.file.new') {
        editor.replaceDocument(createEmptyDocument(createIdGen()));
        return;
      }
      if (commandId === 'app.file.open') {
        const result = await openDocxFile();
        if (result) {
          editor.replaceDocument(result.doc);
          store.replaceDocument(result.doc, result.path);
          uiStore.setStatus(`Opened ${result.path}`);
        }
        return;
      }
      if (commandId === 'app.file.save' || commandId === 'app.file.saveAs') {
        if (!store.doc) return;
        const existing = commandId === 'app.file.save' ? store.filePath : null;
        const path = await saveDocxFile(store.doc, existing);
        if (path) {
          store.markDirty(false);
          store.replaceDocument(store.doc, path);
          uiStore.setStatus(`Saved ${path}`);
        }
        return;
      }
      if (commandId === 'app.file.print') {
        if (!window.wordAPI) return;
        await window.wordAPI.invoke('print.toPDF', {});
        return;
      }
      if (commandId === 'app.file.exit') {
        window.close();
        return;
      }

      // Find/Replace — open dialog + translate params
      if (commandId === 'app.edit.find' || commandId === 'app.edit.replace') {
        setFindReplaceTab(commandId === 'app.edit.replace' ? 'replace' : 'find');
        setFindReplaceOpen(true);
        return;
      }
      if (commandId === 'app.edit.findNext' || commandId === 'app.edit.findPrev') {
        const p = params as { query: string; options: UIFindOptions };
        const findOptions = toEngineFindOptions(p.query, p.options);
        const result =
          commandId === 'app.edit.findNext'
            ? findNextImpl(editor.doc, editor.selection.primary.focus, findOptions)
            : undefined; // findPrev: engine has it; we'd wire similarly
        if (result) {
          uiStore.setStatus(`Found: ${result.snippet}`);
        } else {
          uiStore.setStatus('Not found');
        }
        return;
      }
      if (commandId === 'app.edit.replaceAll') {
        const p = params as { query: string; replacement: string; options: UIFindOptions };
        const findOptions = toEngineFindOptions(p.query, p.options);
        editor.bus.dispatch(asCommandId('app.edit.replaceAll'), {
          findOptions,
          replacement: p.replacement,
        });
        return;
      }
      if (commandId === 'app.edit.replace') {
        // Opened the dialog above; actual single-match replace is not wired to a one-shot here
        // because it needs a prior find result. Users press Find Next then Replace in sequence.
        return;
      }

      // Clipboard — deferred past M1
      if (
        commandId === 'app.edit.cut' ||
        commandId === 'app.edit.copy' ||
        commandId === 'app.edit.paste'
      ) {
        uiStore.setStatus(`${commandId} not yet implemented`);
        return;
      }

      // Everything else — forward to the engine bus as-is
      const result = editor.bus.dispatch(asCommandId(commandId), params);
      if (!result.ok) {
        uiStore.setStatus(`Command failed: ${commandId} (${result.error.message})`);
      }
    },
    [editor, store, uiStore],
  );

  useEffect(() => {
    const dispatcher = createKeyboardDispatcher({ onCommand: handleCommand });
    return dispatcher.dispose;
  }, [handleCommand]);

  // Selection is collapsed when anchor === focus.
  const selectionIsCollapsed =
    store.selection.primary.anchor.leafId === store.selection.primary.focus.leafId &&
    store.selection.primary.anchor.offset === store.selection.primary.focus.offset;

  return (
    <AppShell onCommand={handleCommand}>
      <FormattingToolbar onCommand={handleCommand} activeFormatting={activeFormatting} />
      <div className="viewport" ref={viewportRef} onMouseDown={handleViewportMouseDown}>
        <PageHost pages={pages} />
        {store.selection.primary.focus.leafId !== '' && (
          <Caret position={store.selection.primary.focus} pages={pages} />
        )}
        {store.selection.primary.focus.leafId !== '' && !selectionIsCollapsed && (
          <SelectionOverlay range={store.selection.primary} pages={pages} />
        )}
      </div>
      <ImeSurface
        ref={imeSurfaceRef}
        caretX={caretCoords.x}
        caretY={caretCoords.y}
        onBeforeInput={handleBeforeInput}
      />
      {findReplaceOpen && (
        <FindReplaceDialog
          initialTab={findReplaceTab}
          onCommand={handleCommand}
          onClose={() => setFindReplaceOpen(false)}
        />
      )}
    </AppShell>
  );
};
