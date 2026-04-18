// @word/ui — AppShell, MenuBar, StatusBar, Zustand stores, keyboard dispatcher,
//             formatting toolbar, dialogs, hooks.

export { useDocumentStore } from './stores/document-store.js';
export type { DocumentStore, DocumentState, DocumentActions } from './stores/document-store.js';

export { useUIStore } from './stores/ui-store.js';
export type { UIStore, UIState, UIActions, DialogId } from './stores/ui-store.js';

export { usePrefsStore } from './stores/prefs-store.js';
export type { PrefsStore, PrefsState, PrefsActions, Theme } from './stores/prefs-store.js';

export { AppShell } from './components/AppShell.js';
export type { AppShellProps } from './components/AppShell.js';

export { MenuBar } from './components/MenuBar.js';
export type { MenuBarProps } from './components/MenuBar.js';

export { StatusBar } from './components/StatusBar.js';

export { FormattingToolbar } from './components/FormattingToolbar.js';
export type { FormattingToolbarProps } from './components/FormattingToolbar.js';

export { FontDialog } from './components/FontDialog.js';
export type { FontDialogProps, FontDialogValues } from './components/FontDialog.js';

export { ParagraphDialog } from './components/ParagraphDialog.js';
export type { ParagraphDialogProps, ParagraphDialogValues } from './components/ParagraphDialog.js';

export { StyleDialog } from './components/StyleDialog.js';
export type { StyleDialogProps, StyleEntry } from './components/StyleDialog.js';

export { BulletsAndNumberingDialog } from './components/BulletsAndNumberingDialog.js';
export type {
  BulletsAndNumberingDialogProps,
  ListChoice,
  BulletChar,
  NumberingFormat,
} from './components/BulletsAndNumberingDialog.js';

export { FindReplaceDialog } from './components/FindReplaceDialog.js';
export type { FindReplaceDialogProps, FindOptions } from './components/FindReplaceDialog.js';

export { useActiveFormatting } from './hooks/use-active-formatting.js';
export type { ActiveFormatting } from './hooks/use-active-formatting.js';

export { createKeyboardDispatcher } from './keyboard/dispatcher.js';
export type { KeyboardDispatcherOptions, KeyboardDispatcher } from './keyboard/dispatcher.js';

export { wireEditorToStore } from './command-bridge.js';
export type { CommandBridgeDispose } from './command-bridge.js';
