# UI Components Architecture

## 1. Overview

This document specifies the React UI component system that constitutes the visible, interactive surface of the word processor. It covers every pixel and every input event that passes through React: the application shell, menus, toolbars, rulers, status bar, MDI workspace, dialogs, context menus, toast notifications, focus management, keyboard dispatching, theming, state stores, accessibility, and testing.

The UI package (`packages/ui`) is one of three top-level React-adjacent packages. It sits alongside:

- `packages/layout-react` — React bindings for the layout engine (page host, selection overlays, hit tests).
- `packages/engine` — domain logic, document model, command bus, event emitter, persistence adapters.

The UI package imports from both but never touches the internals of either. The contract with the layout engine is the single `<PageHost>` component (rendered as a child of `<EditorViewport>`) plus a small bundle of hooks for selection and hit-testing (`useSelectionGeometry`, `useHitTest`). The contract with the engine is the command bus (`engine.dispatchCommand`) and the event emitter subscribed by `useDocument` / `useEngineEvent`.

The UI aims for true visual parity with Microsoft Word 95. This is not a stylistic homage; it is a specification requirement. Component metrics, colors, typography, accelerator keys, menu ordering, dialog layouts, and focus behaviors must match the reference product. Where Word 95 behavior is ambiguous or platform-dependent, we prefer the Windows 95 behavior as authoritative (Microsoft Windows Interface Guidelines, 1995) and document deviations explicitly.

### 1.1 Design principles

- **Composition over inheritance.** Every complex component is built from primitives in `packages/ui/src/primitives`. There is no `BaseComponent` class; we lean on React composition, hooks, and typed prop contracts.
- **Typed end-to-end.** Every prop, event, and state slice has a TypeScript interface. `strict: true` and `noUncheckedIndexedAccess: true` in `tsconfig.json`. Zod schemas validate anything crossing a process boundary (IPC, persisted prefs, imported keymaps).
- **Deterministic rendering.** Given identical state, the DOM tree is identical. This enables visual regression tests and screenshot-based review.
- **Fine-grained reactivity.** Stores are sliced; selectors are memoized; `React.memo` gates re-renders of the most numerous components (MenuItem, ToolbarButton, RulerTab, StatusRegion).
- **Accessibility first.** WCAG 2.1 AA is the floor. Every interactive element has an accessible name, a focus ring, keyboard operability, and correct ARIA roles. Screen-reader paths are tested in CI.
- **Keyboard-first.** Every feature that exists as a toolbar button or menu item also exists as a keyboard command. The keymap is data-driven and user-customizable.
- **Separation of ephemeral and durable state.** What is currently visible (active MDI child, open dialog, hovered menu) is ephemeral and lives in UIStore. What persists across sessions (toolbar positions, preferences) lives in PrefsStore. The document itself lives in the engine, not in a React store.

### 1.2 File layout

```
packages/ui/
  package.json
  tsconfig.json
  src/
    index.ts                    -- public barrel export
    shell/
      App.tsx
      AppProviders.tsx
      AppShell.tsx
      TitleBar.tsx
      WorkspaceArea.tsx
    menu/
      MenuBar.tsx
      MenuItem.tsx
      SubMenu.tsx
      MenuRegistry.ts
      menuModel.ts              -- MenuNode, MenuTree types
      menuHooks.ts               -- useMenuNavigation, useMnemonics
    toolbar/
      ToolbarStack.tsx
      Toolbar.tsx
      ToolbarButton.tsx
      ToolbarDropdown.tsx
      ToolbarCombo.tsx
      ToolbarSeparator.tsx
      FloatingToolbar.tsx
      DockManager.ts
      toolbarModel.ts
    ruler/
      HorizontalRuler.tsx
      VerticalRuler.tsx
      RulerTabMarker.tsx
      RulerIndentMarker.tsx
      RulerMarginHandle.tsx
      rulerScales.ts
    statusbar/
      StatusBar.tsx
      StatusRegion.tsx
      PageIndicatorRegion.tsx
      LineColumnRegion.tsx
      ModeIndicatorsRegion.tsx
      SpellStatusRegion.tsx
      BackgroundSaveRegion.tsx
    mdi/
      MDIWorkspace.tsx
      MDIChild.tsx
      MDIChildTitleBar.tsx
      EditorViewport.tsx
      Scrollbars.tsx
      mdiArrangements.ts
    dialogs/
      DialogRoot.tsx
      DialogManager.ts
      DialogFrame.tsx
      FontDialog.tsx
      ParagraphDialog.tsx
      PageSetupDialog.tsx
      ... (one file per dialog)
    primitives/
      Button.tsx
      Checkbox.tsx
      Radio.tsx
      RadioGroup.tsx
      TextInput.tsx
      NumberSpinner.tsx
      ComboBox.tsx
      ListBox.tsx
      GroupBox.tsx
      Tabs.tsx
      DialogPrimitive.tsx
      PopoverPrimitive.tsx
      Tooltip.tsx
      ProgressIndicator.tsx
      Divider.tsx
    themes/
      ThemeProvider.tsx
      tokens.ts                 -- token type definitions
      word95.ts
      modernLight.ts
      modernDark.ts
      highContrast.ts
      cssVariables.ts            -- writes :root variables
    icons/
      IconRegistry.ts
      Icon.tsx
      packs/
        word95/
          save.svg
          open.svg
          ... (hundreds)
    focus/
      FocusManager.ts
      FocusProvider.tsx
      useFocusRing.ts
      FocusHolder.ts
    keyboard/
      KeyboardDispatcher.tsx
      Keymap.ts
      defaultKeymap.ts
      accelerators.ts
      chordResolver.ts
    stores/
      uiStore.ts
      prefsStore.ts
      documentStoreBridge.ts
      useDocument.ts
      useEngineEvent.ts
    hooks/
      useHotkey.ts
      useCommand.ts
      useSelectionVisual.ts
      useMenuCommand.ts
    clipboard/
      ClipboardService.ts
      PasteSpecialDialog.tsx
    dnd/
      DndProvider.tsx
      DropZone.tsx
      DragSource.ts
    contextmenu/
      ContextMenu.tsx
      contextMenuRegistry.ts
    toasts/
      ToastRoot.tsx
      toastStore.ts
    help/
      HelpViewer.tsx
      TipOfTheDayDialog.tsx
    splash/
      SplashScreen.tsx
    testing/
      renderWithProviders.tsx
      mockEngine.ts
```

### 1.3 Terminology

- **Shell**: the persistent outer chrome (title bar, menu bar, toolbars, status bar) shared by all open documents.
- **MDI child**: a sub-window that hosts one open document, analogous to Word 95's child windows within the MDI parent frame.
- **Host**: a component from another package that we render but do not own (`PageHost`).
- **Primitive**: a low-level controlled component with no domain knowledge (Button, Checkbox).
- **Region**: a discrete area of the status bar that can be clicked or double-clicked.
- **Mnemonic**: the underlined letter in a menu/button that activates it via Alt+letter.
- **Accelerator**: a keyboard shortcut for a command (e.g., Ctrl+S).
- **Focus holder**: the single subtree that currently owns keyboard focus (document editor, dialog, menu, or toolbar capture).

---

## 2. Component hierarchy

```
<App>
  <AppProviders>
    <ErrorBoundary>
      <StoreProvider>                    // Zustand is storeless at Provider level; this is for DI of the bridge
        <ThemeProvider theme="Word95">
          <I18nProvider locale="en-US">
            <FocusProvider>
              <KeyboardDispatcher>
                <DndProvider>
                  <AppShell>
                    <TitleBar />
                    <MenuBar />
                    <ToolbarStack>
                      <Toolbar name="Standard" />
                      <Toolbar name="Formatting" />
                      ...docked toolbars (varies by user config)
                    </ToolbarStack>
                    <WorkspaceArea>
                      <MDIWorkspace>
                        <MDIChild docId="A">
                          <MDIChildTitleBar />
                          <RulerRow>
                            <HorizontalRuler />
                          </RulerRow>
                          <EditorViewport>
                            <VerticalRuler />
                            <PageHost />       // from @word/layout-react
                            <Scrollbars />
                          </EditorViewport>
                        </MDIChild>
                        <MDIChild docId="B" />
                        ...
                      </MDIWorkspace>
                    </WorkspaceArea>
                    <StatusBar />
                  </AppShell>
                  <DialogRoot />
                  <PopoverRoot />
                  <ToastRoot />
                  <FloatingToolbarHost />      // floating toolbars rendered here
                  <ContextMenuRoot />
                </DndProvider>
              </KeyboardDispatcher>
            </FocusProvider>
          </I18nProvider>
        </ThemeProvider>
      </StoreProvider>
    </ErrorBoundary>
  </AppProviders>
</App>
```

### 2.1 Responsibilities at each level

- **App**: mounts once; owns lifecycle hooks (cold boot, shutdown). Injects the engine instance via the store bridge.
- **AppProviders**: aggregates every top-level context provider in a stable order. No business logic.
- **ErrorBoundary**: traps uncaught React errors, shows a recovery dialog, writes a crash report via IPC.
- **StoreProvider**: injects the `EngineBridge` (a facade around `engine.dispatchCommand` + event emitter). Zustand stores themselves are module-scoped; the provider only provides engine access.
- **ThemeProvider**: exposes theme tokens via context and writes CSS custom properties to `:root`.
- **I18nProvider**: exposes `t(key, params)` and current locale; drives MenuBar, toolbar tooltips, dialog labels.
- **FocusProvider**: maintains the single focus holder; supplies `useFocusRequest`, `useFocusTrap`.
- **KeyboardDispatcher**: top-level key capture; routes to focus holder or dispatches command.
- **DndProvider**: HTML5 DnD root (we use React DnD's HTML5Backend).
- **AppShell**: purely layout (grid rows: title bar, menu bar, toolbars, workspace, status bar).
- **TitleBar**: OS-dependent. On Windows, the native title bar is hidden and we render our own Word-styled one (with Program icon, title text, minimize/maximize/close). On macOS we use the traffic lights region and render just the title text.
- **MenuBar**: Word 95-style in-window menus, not OS menus. On macOS we also mirror to the OS menu (native Cmd+Q, etc.) but the in-window menu remains authoritative.
- **ToolbarStack**: docks toolbars on four sides; manages rearrangement.
- **WorkspaceArea**: the remaining space between toolbars and status bar.
- **MDIWorkspace**: owns the multi-document state and arrangements (cascade/tile).
- **MDIChild**: one document; its own title bar, rulers, scroll bars, and `PageHost`.
- **StatusBar**: reactive status regions.
- **DialogRoot / PopoverRoot / ToastRoot / ContextMenuRoot**: React portals that mount at `document.body` to avoid z-index contortions inside the shell.

### 2.2 Rendering ownership

| Subtree | Owned by | Package |
|---|---|---|
| TitleBar, MenuBar, ToolbarStack, StatusBar | UI | `@word/ui` |
| MDIWorkspace, MDIChild, RulerRow, EditorViewport, Scrollbars | UI | `@word/ui` |
| PageHost and its child page/line/run elements | Layout engine | `@word/layout-react` |
| Selection overlay, caret, marching ants | Layout engine | `@word/layout-react` |
| Dialog chrome, dialog content | UI | `@word/ui` |
| PopoverRoot, Tooltip, Toast | UI | `@word/ui` |

---

## 3. State management

### 3.1 Three-store model

We use three distinct stores, scoped by purpose and volatility:

**DocumentStore** (engine-owned)
Not actually a store in the React sense. The engine is an event emitter with a command bus. React accesses it through `useDocument(docId, selector, equalityFn)` which subscribes to engine events and re-renders on change. This keeps the domain state authoritative in the engine (where it's transactional, undoable, and serializable) and avoids double-buffering.

**UIStore** (Zustand)
Ephemeral UI state that is recomputed at session start. Examples: which dialog is open, which menu is currently being navigated, the find/replace state, the zoom level per MDI child, the current view mode (Normal/Outline/Page Layout/Master Document), ruler visibility, toolbar visibility. This store is deliberately never persisted to disk; closing the app wipes it.

**PrefsStore** (Zustand backed by electron-store over IPC)
Durable user preferences: selected theme, toolbar positions, custom keymap, default font, recent file list, window geometry, view options (show formatting marks, show bookmarks), spell-check options, dictionary language, autocorrect entries, custom dictionaries, paths to template folders. Changes are debounced and persisted to disk on a 250 ms timer.

### 3.2 Why Zustand

- **Selector-based subscriptions** avoid the whole-tree re-renders of legacy Context.
- **No provider required** — stores are module-scoped, perfect for a single-window Electron app with a single renderer process.
- **Type-first** — stores are defined as typed `create<T>()` functions; the state shape is the single source of truth.
- **Devtools integration** — Redux DevTools middleware for time-travel debugging.
- **Middleware ecosystem** — we use `persist` for PrefsStore and `subscribeWithSelector` for granular subscriptions.

Redux was considered and rejected: the engine already provides transactional state with command/event semantics, so a second reducer layer in UIStore is overkill. MobX was considered and rejected: we prefer explicit updates over reactive proxies for predictability in unit tests.

### 3.3 UIStore shape

```ts
// packages/ui/src/stores/uiStore.ts

export type ViewMode = 'normal' | 'outline' | 'pageLayout' | 'masterDocument';
export type ZoomPreset = 'pageWidth' | 'wholePage' | 'twoPages' | number;

export interface PerChildUIState {
  docId: string;
  viewMode: ViewMode;
  zoom: ZoomPreset;
  rulerVisible: boolean;
  formattingMarksVisible: boolean;
  scrollTopPx: number;
  scrollLeftPx: number;
  splitPositionPct: number | null;   // null = no split
}

export interface FindReplaceState {
  open: boolean;
  mode: 'find' | 'replace';
  findText: string;
  replaceText: string;
  matchCase: boolean;
  wholeWords: boolean;
  useRegex: boolean;
  useWildcards: boolean;
  soundsLike: boolean;
  direction: 'up' | 'down' | 'all';
  searchIn: 'main' | 'header' | 'footer' | 'footnotes' | 'endnotes' | 'comments';
  format?: FindFormat;
  special?: FindSpecial;
  lastResult: { ok: true; matchIndex: number; totalMatches: number } | { ok: false; reason: 'notFound' | 'searching' } | null;
}

export interface DialogStackEntry {
  id: string;                                // unique per open
  kind: DialogKind;
  props: unknown;
  modal: boolean;
  openedAt: number;
  zIndex: number;
}

export type DialogKind =
  | 'font' | 'paragraph' | 'pageSetup' | 'print' | 'findReplace'
  | 'options' | 'bulletNumbering' | 'bordersShading' | 'columns'
  | 'break' | 'changeCase' | 'dropCap' | 'style' | 'styleGallery'
  | 'field' | 'symbol' | 'bookmark' | 'crossReference' | 'indexTables'
  | 'formula' | 'tableInsert' | 'cellHeightWidth' | 'tableSort'
  | 'mailMergeHelper' | 'envelopeLabels' | 'protectDocument'
  | 'revisions' | 'compareVersions' | 'mergeDocuments' | 'macro'
  | 'customize' | 'thesaurus' | 'spelling' | 'grammar' | 'wordCount'
  | 'summaryInfo' | 'findFile' | 'autoCorrect' | 'autoFormat'
  | 'tipOfTheDay' | 'paste' | 'pasteSpecial' | 'help' | 'about'
  | 'confirmOverwrite' | 'confirmClose' | 'error' | 'custom';

export interface PopoverStackEntry {
  id: string;
  kind: 'menu' | 'submenu' | 'toolbarDropdown' | 'tooltip' | 'autocomplete' | 'contextMenu';
  anchorRectPx: { left: number; top: number; right: number; bottom: number };
  placement: Placement;
  content: React.ReactNode;
  onClose: () => void;
}

export type Placement =
  | 'bottomStart' | 'bottomEnd' | 'bottomCenter'
  | 'topStart' | 'topEnd' | 'topCenter'
  | 'rightStart' | 'rightEnd' | 'rightCenter'
  | 'leftStart' | 'leftEnd' | 'leftCenter';

export interface Toast {
  id: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message?: string;
  action?: { label: string; onClick: () => void };
  createdAt: number;
  durationMs: number;
}

export interface MenuNavigationState {
  activePath: string[];                      // e.g. ['file', 'new']
  openSubmenuId: string | null;
  mnemonicsVisible: boolean;                 // Alt has been pressed
  activatedVia: 'mouse' | 'keyboard' | 'accelerator' | null;
}

export interface UIState {
  // MDI
  activeMdiChildId: string | null;
  perChildUI: Record<string, PerChildUIState>;
  mdiArrangement: 'cascade' | 'tile' | 'free';

  // Menu
  menuNavigation: MenuNavigationState;

  // Dialogs / popovers / toasts
  dialogStack: DialogStackEntry[];
  popoverStack: PopoverStackEntry[];
  toasts: Toast[];

  // Find/Replace (modeless -> lives here, not in dialog stack)
  findReplace: FindReplaceState;

  // Toolbars
  toolbarVisibility: Record<string, boolean>;
  toolbarDockStates: Record<string, DockState>;      // see § 6
  customizeMode: boolean;

  // Selection visual markers (co-aligned with layout selection, cached for marching-ants animation)
  selectionVisualFrame: number;

  // Input modes
  keyboardMode: 'default' | 'extendSelection' | 'marking' | 'recordMacro';
  overtypeMode: boolean;

  // Cursor mode indicators surfaced in status bar
  statusIndicators: {
    rec: boolean;
    mrk: boolean;
    ext: boolean;
    ovr: boolean;
    wph: boolean;      // WordPerfect Help emulation
  };

  // Splash / onboarding
  splashVisible: boolean;
  tipOfDayVisible: boolean;

  // Animation / reduced-motion
  reduceMotion: boolean;
}

export interface UIActions {
  // MDI
  setActiveMdiChild: (id: string | null) => void;
  addMdiChild: (docId: string) => void;
  removeMdiChild: (docId: string) => void;
  patchPerChildUI: (docId: string, patch: Partial<PerChildUIState>) => void;
  setArrangement: (a: 'cascade' | 'tile' | 'free') => void;

  // Menu
  openMenu: (path: string[], via: 'mouse' | 'keyboard' | 'accelerator') => void;
  closeMenu: () => void;
  setMnemonicsVisible: (v: boolean) => void;

  // Dialogs
  openDialog: <K extends DialogKind>(kind: K, props: DialogPropsFor<K>) => string;
  closeDialog: (id: string) => void;
  closeTopDialog: () => void;

  // Popovers
  pushPopover: (entry: Omit<PopoverStackEntry, 'id'>) => string;
  popPopover: (id: string) => void;

  // Toasts
  pushToast: (t: Omit<Toast, 'id' | 'createdAt'>) => string;
  dismissToast: (id: string) => void;

  // Find/Replace
  setFindReplace: (patch: Partial<FindReplaceState>) => void;

  // Toolbars
  setToolbarVisible: (id: string, v: boolean) => void;
  setToolbarDockState: (id: string, s: DockState) => void;
  enterCustomizeMode: () => void;
  exitCustomizeMode: () => void;

  // Status indicators
  toggleStatusIndicator: (k: keyof UIState['statusIndicators']) => void;
}
```

### 3.4 PrefsStore shape

```ts
// packages/ui/src/stores/prefsStore.ts

export interface PrefsState {
  theme: ThemeId;
  uiFontScale: number;                        // 1.0 = native
  chromeZoom: number;                         // for accessibility

  window: {
    width: number;
    height: number;
    x: number | null;
    y: number | null;
    maximized: boolean;
  };

  toolbars: ToolbarsPrefs;
  menus: MenuCustomizationPrefs;
  keymap: KeymapOverrides;

  view: {
    showStatusBar: boolean;
    showRuler: boolean;
    showHorizontalScrollbar: boolean;
    showVerticalScrollbar: boolean;
    showFormattingMarks: boolean;
    showBookmarks: boolean;
    showFieldCodes: boolean;
    showFieldShading: 'never' | 'whenSelected' | 'always';
    showHighlighting: boolean;
    draftFont: boolean;
    wrapToWindow: boolean;
    showPictureDescriptionsOnly: boolean;    // accessibility
    showTextBoundaries: boolean;
  };

  general: {
    measurementUnit: 'inch' | 'cm' | 'mm' | 'point' | 'pica';
    recentFilesCount: number;
    recentFiles: RecentFile[];
    backgroundRepagination: boolean;
    wordCountStatusBar: boolean;
    showTipOfDayOnStart: boolean;
    showSplashOnStart: boolean;
    emulateWordPerfectHelp: boolean;
    emulateWordPerfectNavKeys: boolean;
    helpForWordPerfectUsers: boolean;
    provideFeedbackWithSound: boolean;
    provideFeedbackWithAnimation: boolean;
    confirmConversionAtOpen: boolean;
    updateAutomaticLinks: boolean;
    mailAsAttachment: boolean;
  };

  edit: {
    typingReplacesSelection: boolean;
    dragAndDropTextEditing: boolean;
    autoWordSelection: boolean;
    useSmartCutPaste: boolean;
    useOvertypeMode: boolean;
    allowAccentsOnCaps: boolean;
    pictureEditor: 'microsoftWord' | string;
    tabsAndBackspaceIndent: boolean;
  };

  print: {
    defaultPrinter: string | null;
    draftOutput: boolean;
    reverseOrder: boolean;
    updateFields: boolean;
    updateLinks: boolean;
    printDocumentPropertiesOnNewPage: boolean;
    printHiddenText: boolean;
    printDrawingObjects: boolean;
    defaultPaperSize: PaperSize;
  };

  save: {
    alwaysCreateBackup: boolean;
    allowFastSaves: boolean;
    promptForSummaryInfo: boolean;
    promptToSaveNormalTemplate: boolean;
    saveDataOnlyForForms: boolean;
    embedTrueTypeFonts: boolean;
    saveAutoRecoverEvery: number;            // minutes
    fileSharing: { password: string | null; readOnlyRecommended: boolean };
    defaultFormat: 'docx' | 'doc' | 'rtf' | 'txt';
  };

  spelling: {
    alwaysSuggest: boolean;
    fromMainDictionaryOnly: boolean;
    ignoreWordsInUppercase: boolean;
    ignoreWordsWithNumbers: boolean;
    automaticCheck: boolean;
    reset: boolean;
    customDictionaries: CustomDictionary[];
    language: string;                         // BCP-47
  };

  grammar: {
    automaticCheck: boolean;
    checkSpellingAlso: boolean;
    showReadability: boolean;
    ruleSet: 'casualWriting' | 'standardWriting' | 'formalWriting' | 'technicalWriting' | 'custom';
  };

  autoCorrect: AutoCorrectPrefs;
  autoFormat: AutoFormatPrefs;

  filePaths: {
    documents: string;
    picturePath: string;
    userTemplates: string;
    workgroupTemplates: string;
    userOptionsFile: string;
    autoRecoverFiles: string;
    tools: string;
    startup: string;
  };

  userInfo: {
    name: string;
    initials: string;
    mailingAddress: string;
  };

  compatibility: Record<CompatibilityOption, boolean>;
}
```

### 3.5 DocumentStore bridge

```ts
// packages/ui/src/stores/documentStoreBridge.ts

export interface DocumentSnapshot {
  docId: string;
  version: number;                           // monotonic, bumped per command
  title: string;
  filePath: string | null;
  dirty: boolean;
  readOnly: boolean;
  protected: ProtectionLevel;
  pageCount: number;
  wordCount: number;
  charCount: number;
  selection: SelectionInfo;
  caretVisualRect: { left: number; top: number; width: number; height: number } | null;
  activeStyleName: string;
  activeFont: FontInfo;
  activeParagraphFormat: ParagraphFormatInfo;
  zoomPct: number;
  revisionsTracked: boolean;
  revisions: RevisionInfo[];
  history: { canUndo: boolean; canRedo: boolean; undoLabel: string | null; redoLabel: string | null };
  fields: FieldInfo[];
  comments: CommentInfo[];
  bookmarks: BookmarkInfo[];
  // ... engine surface that UI cares about; exclude layout-specific data
}

export interface EngineBridge {
  getSnapshot(docId: string): DocumentSnapshot;
  subscribe(docId: string, listener: () => void): () => void;
  dispatchCommand<A extends CommandArgs = CommandArgs>(docId: string, commandId: string, args?: A): CommandResult;
  on<E extends EngineEventName>(event: E, listener: (payload: EngineEventPayload[E]) => void): () => void;
  // Cross-document / app-scoped events
  onAny(listener: (event: EngineEventName, payload: unknown) => void): () => void;
}

// React surface
export function useDocument<T>(
  docId: string,
  selector: (s: DocumentSnapshot) => T,
  eq: (a: T, b: T) => boolean = Object.is,
): { value: T; dispatch: (id: string, args?: CommandArgs) => CommandResult };

export function useEngineEvent<E extends EngineEventName>(
  event: E,
  handler: (payload: EngineEventPayload[E]) => void,
): void;

export function useDocumentHistory(docId: string): {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  undo: () => void;
  redo: () => void;
};
```

`useDocument` uses `useSyncExternalStore` under the hood to guarantee tearing-free updates in concurrent rendering. The selector result is cached with the user-supplied equality function.

### 3.6 Store interaction patterns

- **Command result to UI.** Commands return `{ ok: boolean; error?: CommandError; effects?: EngineEvent[] }`. UI components typically ignore the result but may surface errors via `pushToast`.
- **Optimistic UI.** We do not do optimistic UI at the document level; the engine is fast enough. We do show immediate visual feedback for non-document actions (toolbar button press state, menu highlight).
- **Cross-store references.** UIStore never stores engine IDs without validation. Subscriptions are automatically invalidated when a document is closed (the bridge emits `docClosed` which UIStore clears).

### 3.7 Devtools

Both Zustand stores wire `devtools` middleware in development builds, tagged as `UIStore` and `PrefsStore`. The engine surfaces its command log on the Redux DevTools "Actions" tab via a lightweight adapter.

---

## 4. Rendering cohesion with layout engine

### 4.1 The boundary

The layout engine is a separate package that does text shaping, line breaking, pagination, and raster/SVG rendering of content. It is not a React component library. We wrap it in `@word/layout-react`, which exposes:

```tsx
export interface PageHostProps {
  docId: string;
  viewportRectPx: { width: number; height: number };
  scrollOffsetPx: { x: number; y: number };
  zoomPct: number;
  viewMode: ViewMode;
  showFormattingMarks: boolean;
  showFieldShading: 'never' | 'whenSelected' | 'always';
  onViewportNeedsScroll?: (rect: Rect) => void;
  onContextMenu?: (e: { clientX: number; clientY: number; target: HitTestResult }) => void;
  ariaLabel?: string;
}

export function PageHost(props: PageHostProps): JSX.Element;

export function useSelectionGeometry(docId: string): {
  bounds: Rect[];             // per-line boxes in viewport pixels
  caretRect: Rect | null;
  caretBlinkPhase: number;
};

export function useHitTest(docId: string): (clientX: number, clientY: number) => HitTestResult;

export interface HitTestResult {
  kind: 'text' | 'table' | 'image' | 'hyperlink' | 'footnote' | 'comment' | 'field' | 'outside';
  offset?: number;            // character offset for text
  tableRef?: TableRef;
  imageId?: string;
  hyperlinkTarget?: string;
  fieldId?: string;
  commentId?: string;
}
```

### 4.2 What the UI provides

- **Viewport rectangle**: the pixel size of `EditorViewport` minus the VerticalRuler's width.
- **Scroll offset**: from Scrollbars.
- **Zoom percent**: from `UIStore.perChildUI[docId].zoom` resolved through `resolveZoom`.
- **View mode**: from `UIStore`.
- **Visibility flags**: from `PrefsStore.view`.
- **Event callbacks**: for context menu and scroll-into-view requests.

### 4.3 What the UI receives

- Nothing by direct prop. The UI reads layout-derived data only through the explicit hooks (`useSelectionGeometry`, `useHitTest`) or through engine events (`selectionChanged`, `paginationCompleted`). The UI never reaches into the page DOM.

### 4.4 Selection rendering

Selection marching-ants, caret, and I-beam cursor are rendered inside `PageHost`. The UI provides the visual frame counter (`UIStore.selectionVisualFrame`) via `requestAnimationFrame` and passes it in as a prop so `PageHost` can animate consistently with the UI frame loop. The UI also provides the current theme's selection colors through CSS custom properties on the `<EditorViewport>` ancestor.

### 4.5 Scrolling

- The scroll container is the UI's `Scrollbars`, not inside `PageHost`. This lets us render a single scrollbar that spans all pages in the document (unlike a per-page scroller).
- Page-up, Page-down, arrow scrolling are routed through `KeyboardDispatcher` → command → `engine.scrollBy(...)` → emits `scrollRequested` with a new offset → `Scrollbars` updates.
- Ctrl+End, Ctrl+Home jump to document end/start; these are layout-aware and resolved by the engine.

### 4.6 Zoom

Zoom is a first-class concern:

- Preset strings (`pageWidth`, `wholePage`, `twoPages`) resolve to a number when the viewport size is known.
- `PageHost` uses CSS `transform: scale()` for smooth zoom up to 500%.
- When zoom changes, the UI waits for `engine.repaginate` completion before applying; during the wait, we show the old layout with a zoom transform as a placeholder.

---

## 5. Input routing

### 5.1 KeyboardDispatcher

A component at the root that captures `keydown`, `keyup`, and `beforeinput` on `window`. It:

1. Normalizes the event into an accelerator (e.g. `Ctrl+Shift+F12`).
2. Consults the active focus holder; dialogs and menus can claim keys first.
3. Resolves accelerators through the `Keymap`:
   - Chord state machine for chords like `Ctrl+K, 1`.
   - Locale-aware resolution: we key on `KeyboardEvent.code` (physical key) for most accelerators, and on `KeyboardEvent.key` for letter-based ones, following Word's behavior.
4. If resolved, dispatches `engine.dispatchCommand(commandId, args)`.
5. If unresolved and focus is in the document, lets the event reach the browser for text input (with `isComposing` respected for IME).

```ts
// packages/ui/src/keyboard/KeyboardDispatcher.tsx

export interface KeyboardDispatcherAPI {
  pushHandler(scope: KeymapScope, handler: KeyHandler): () => void;  // dialogs/menus use this
  resolve(e: KeyboardEvent): ResolvedAccelerator | null;
  flushPendingChord(): void;
}

export interface Keymap {
  scopes: Record<KeymapScope, KeymapScopeDef>;
  chords: ChordDefinition[];
}

export type KeymapScope =
  | 'global'
  | 'documentEditor'
  | 'menu'
  | 'dialog'
  | 'findReplace'
  | 'outlineMode'
  | 'tableEditing'
  | 'headerFooter';

export interface KeymapScopeDef {
  bindings: Map<AcceleratorString, CommandId>;
  allowFallthrough: boolean;
}

export interface ChordDefinition {
  scope: KeymapScope;
  prefix: AcceleratorString;
  children: Map<AcceleratorString, CommandId>;
  timeoutMs: number;            // chord timeout, default 1000
}

export interface ResolvedAccelerator {
  command: CommandId;
  scope: KeymapScope;
  consumedChord: boolean;
}

export type AcceleratorString = string;   // canonical form: "Ctrl+Shift+F12"
export type CommandId = string;

export interface KeyHandler {
  (e: KeyboardEvent): 'consumed' | 'fallthrough';
}
```

### 5.2 Default keymap

The default keymap (`defaultKeymap.ts`) ships ~250 bindings. A partial list:

```
File
  Ctrl+N          file.new
  Ctrl+O          file.open
  Ctrl+W          file.close
  Ctrl+S          file.save
  Ctrl+Shift+S    file.saveAs
  Ctrl+P          file.print
  Alt+F, then X   file.exit

Edit
  Ctrl+Z          edit.undo
  Ctrl+Y          edit.redo
  Ctrl+X          edit.cut
  Ctrl+C          edit.copy
  Ctrl+V          edit.paste
  Ctrl+Shift+V    edit.pasteSpecial
  Ctrl+A          edit.selectAll
  Ctrl+F          edit.find
  Ctrl+H          edit.replace
  Ctrl+G          edit.goto
  F5              edit.goto

View
  Ctrl+F2         view.printPreview
  Alt+Ctrl+N      view.normal
  Alt+Ctrl+O      view.outline
  Alt+Ctrl+P      view.pageLayout

Insert
  Ctrl+K          insert.hyperlink
  Ctrl+F9         insert.field
  Shift+F5        insert.goBack
  Ctrl+Enter      insert.pageBreak

Format
  Ctrl+B          format.bold
  Ctrl+I          format.italic
  Ctrl+U          format.underline
  Ctrl+Shift+D    format.doubleUnderline
  Ctrl+=          format.subscript
  Ctrl+Shift+=    format.superscript
  Ctrl+Shift+A    format.allCaps
  Ctrl+Shift+K    format.smallCaps
  Ctrl+Shift+H    format.hidden
  Ctrl+Space      format.clearCharFormatting
  Ctrl+Q          format.clearParaFormatting
  Ctrl+L          format.alignLeft
  Ctrl+E          format.alignCenter
  Ctrl+R          format.alignRight
  Ctrl+J          format.justify
  Ctrl+M          format.indentIncrease
  Ctrl+Shift+M    format.indentDecrease
  Ctrl+T          format.hangingIndent
  Ctrl+Shift+T    format.hangingIndentRemove
  Ctrl+1          format.lineSpacing1
  Ctrl+2          format.lineSpacing2
  Ctrl+5          format.lineSpacing1_5
  Ctrl+0          format.addRemoveSpaceBefore
  Ctrl+Shift+L    format.applyListBullet
  Ctrl+Shift+N    format.applyNormalStyle
  Ctrl+Shift+S    format.applyStyle
  Ctrl+Shift+F    format.fontName
  Ctrl+Shift+P    format.fontSize
  Ctrl+>          format.growFontOnePoint
  Ctrl+<          format.shrinkFontOnePoint
  Ctrl+]          format.growFont
  Ctrl+[          format.shrinkFont

Tools
  F7              tools.spelling
  Shift+F7        tools.thesaurus
  Ctrl+Shift+G    tools.wordCount

Table
  Tab             table.nextCell
  Shift+Tab       table.prevCell
  Alt+Shift+End   table.selectRow
  Alt+Shift+PgDn  table.selectColumn

Window
  Ctrl+F6         window.next
  Ctrl+Shift+F6   window.previous
  Alt+F6          window.nextNonmodal

Help
  F1              help.context
  Shift+F1        help.whatIsThis
  Ctrl+?          help.about

Navigation / Selection
  Left/Right            caret.charLeft / caret.charRight
  Ctrl+Left/Right       caret.wordLeft / caret.wordRight
  Home/End              caret.lineStart / caret.lineEnd
  Ctrl+Home/End         caret.docStart / caret.docEnd
  PgUp/PgDn             caret.pageUp / caret.pageDown
  Shift+<anything>      selection.extend
  F8                    selection.extendMode
  Esc                   selection.cancelExtendMode

Chords (Word 95 "speed" keys; few, but supported)
  Ctrl+K, 1       insert.hyperlinkDefaultTarget1
  Ctrl+K, 2       insert.hyperlinkDefaultTarget2
```

### 5.3 Menu accelerators

Menu accelerators (the `Ctrl+...` displayed on the right side of a menu item) are derived from the Keymap; we do not duplicate them. The menu system calls `keymap.getAcceleratorFor('format.bold')` and renders the result. Mnemonics (underlined letters for Alt+letter sequences) live on the MenuNode itself.

### 5.4 Focus management

The `FocusManager` tracks exactly one `FocusHolder` at a time. The holder can be:

- `documentEditor` (default)
- `menu` (menu bar active)
- `dialog:<id>` (modal or modeless dialog)
- `toolbar` (toolbar keyboard capture, entered via F10+Tab)
- `contextMenu`
- `popover:<id>` (autocomplete popover, etc.)

```ts
// packages/ui/src/focus/FocusManager.ts

export type FocusHolderId = string;

export interface FocusHolderOptions {
  id: FocusHolderId;
  kind: 'documentEditor' | 'menu' | 'dialog' | 'toolbar' | 'contextMenu' | 'popover';
  trap: boolean;                     // true for modal dialogs
  restoreOnUnmount: boolean;
  rootElement: HTMLElement;
  initialFocus?: HTMLElement;
}

export interface FocusManagerAPI {
  push(options: FocusHolderOptions): () => void;  // returns release function
  current(): FocusHolderId | null;
  transfer(to: FocusHolderId): void;
  isTrapped(): boolean;
  notify(event: FocusEvent): void;
}
```

The manager:

- Intercepts `Tab` when a trap is active; cycles focus within the trap.
- On `Esc` in a modal dialog, calls `closeDialog` if the dialog has a cancel action.
- On modal dialog open, saves the previously focused element; restores on close.
- On menu activation (Alt or F10), saves document focus; restores on Esc.
- On `Tab` at app level (not trapped), cycles through shell regions: document editor, toolbars, menu bar, status bar. This mirrors Word 95's F10+Tab behavior.

### 5.5 Command bus integration

Every resolved accelerator becomes `engine.dispatchCommand`. Commands are the single choke point through which document state changes. The engine is responsible for:

- Undoability (grouping edits into a single undo unit via a per-command `undoGroup`).
- Event emission (`commandApplied`, `selectionChanged`, etc.).
- Validation and error reporting.

UI components call commands through `useDocument().dispatch(commandId, args)` or via the `useCommand(id)` hook which returns a stable callback and the command's current enablement:

```ts
export function useCommand(commandId: CommandId, args?: CommandArgs): {
  run: () => void;
  enabled: boolean;
  checked: boolean | undefined;
  label: string;
  accelerator: AcceleratorString | null;
  description: string;
};
```

---

## 6. Menu system

### 6.1 Data model

```ts
// packages/ui/src/menu/menuModel.ts

export interface MenuNode {
  id: string;
  label: string;
  mnemonic?: string;                 // single char
  accelerator?: AcceleratorString;
  icon?: IconId;
  enabled?: boolean | (() => boolean);
  checked?: boolean | (() => boolean);
  radioGroup?: string;               // when set, appears as radio item
  children?: MenuNode[];
  command?: CommandId;
  commandArgs?: CommandArgs;
  separator?: boolean;
  insertBefore?: string;             // customization hint
  insertAfter?: string;
  recentFiles?: boolean;             // placeholder replaced dynamically
  dynamic?: (ctx: MenuContext) => MenuNode[];   // for Window > open windows, etc.
  description?: string;              // shown in status bar on hover
}

export interface MenuContext {
  docId: string | null;
  selection: SelectionInfo | null;
  pluginContributions: MenuNode[];
}

export interface MenuTree {
  root: MenuNode[];                  // top-level bar items
}
```

### 6.2 MenuBar component

Rendered as a horizontal strip under the title bar. Top-level items are `<button>` elements with `role="menuitem"` contained in a `role="menubar"` `<div>`.

Behavior:
- `Alt` toggles mnemonic visibility (underline chars).
- `F10` moves focus to the first menu item; arrows navigate; Enter opens.
- `Alt+<char>` opens the matching top-level menu.
- Hover opens a menu only if one is already open (Word 95 behavior).
- Click opens/closes.
- `Esc` closes the open menu and returns focus to document.

### 6.3 Submenu rendering

Submenus render via `PopoverRoot` portal. A submenu:

- Positions itself with Floating UI (`@floating-ui/react`) using `placement: 'bottomStart'` for top-level, `'rightStart'` for nested.
- Has a 150 ms open delay on hover (Word behavior); instant on click.
- Closes on outside click, Esc, or focus loss.
- Shows icons (16×16) on the left when present; accelerators right-aligned.
- Radio items use a filled circle glyph before the label.
- Checked items use a check glyph.
- Disabled items gray text with 50% alpha.
- Separators are 1px gray horizontal lines with 2px top/bottom margin.

### 6.4 Visuals (Word 95)

```
┌────────────────────────────────────────┐
│ ∎ File    Edit    View    Insert ...   │   <-- MenuBar
└────────────────────────────────────────┘
       │
       ▼
  ┌───────────────────────────────────────┐
  │   New...                    Ctrl+N    │
  │   Open...                   Ctrl+O    │
  │   Close                               │
  ├───────────────────────────────────────┤
  │   Save                      Ctrl+S    │
  │   Save As...                F12       │
  │   Save All                            │
  ├───────────────────────────────────────┤
  │   Print Preview                       │
  │   Print...                  Ctrl+P    │
  │   Send...                             │
  │   Add Routing Slip...                 │
  ├───────────────────────────────────────┤
  │   1 ReportDraft.docx                  │
  │   2 Q4-Notes.docx                     │
  ├───────────────────────────────────────┤
  │   Exit                                │
  └───────────────────────────────────────┘
```

Metrics:
- Item height: 18 px
- Top/bottom padding: 1 px
- Left padding (icon area): 22 px
- Right padding (accelerator): 32 px
- Icon size: 16×16, vertically centered
- Font: MS Sans Serif 8 pt (our ship-with `Micross` font)
- Hover: `#000080` background, `#FFFFFF` text
- Normal: `#000000` text, `#C0C0C0` background
- Disabled: `#808080` text
- Separator: 1 px line of `#808080`, 2 px margin top and bottom
- Shadow: 2 px drop shadow (`#808080`), behind the menu

### 6.5 Mnemonic handling

On `Alt` press (without another key), we set `UIStore.menuNavigation.mnemonicsVisible = true`. Each MenuNode's label is rendered with `<span class="mnemonic">` around the mnemonic character. When hidden, the span has `text-decoration: none`; when visible, `text-decoration: underline`. This follows Windows 95 behavior of "hide accelerator keys until Alt is pressed."

Mnemonic resolution is locale-aware: German `&Datei` has mnemonic `D`, matched by Alt+D regardless of current keyboard layout.

### 6.6 Customization

Menus are customizable through the Customize dialog (§ 7 under CustomizeDialog). User changes merge with defaults in `PrefsStore.menus`:

```ts
export interface MenuCustomizationPrefs {
  hiddenItems: string[];             // menu node IDs
  addedItems: Array<{ parentId: string; node: MenuNode; position: number }>;
  renamedItems: Record<string, string>;
  reorderedChildren: Record<string, string[]>;
}
```

The merged tree is computed in `MenuRegistry.getEffectiveTree(defaultTree, prefs, pluginContributions)`.

### 6.7 Plugin contributions

Engine plugins (e.g., the mail-merge plugin) contribute menu items via:

```ts
engine.contributeMenuItems({
  parentId: 'tools.mailMerge',
  items: [{ id: 'custom.foo', label: 'My Merge Tool', command: 'myplugin.foo' }]
});
```

UI subscribes via `useMenuContributions()` and passes them into the registry.

### 6.8 Specification per component

**MenuBar props**
```ts
interface MenuBarProps {
  tree: MenuTree;
  onCommand: (commandId: CommandId, args?: CommandArgs) => void;
}
```

**MenuItem props**
```ts
interface MenuItemProps {
  node: MenuNode;
  depth: number;                     // 0 for top-level bar item
  activePath: string[];
  mnemonicsVisible: boolean;
  context: MenuContext;
  onActivate: (node: MenuNode) => void;
  onHover: (node: MenuNode) => void;
  onSubmenuOpen: (id: string) => void;
}
```

All `MenuItem` instances are `React.memo`-wrapped, comparing by `node.id`, `enabled`, `checked`, `activePath.includes(node.id)`, and `mnemonicsVisible`.

---

## 7. Toolbar system

### 7.1 Data model

```ts
// packages/ui/src/toolbar/toolbarModel.ts

export interface ToolbarNode {
  id: string;
  displayName: string;
  defaultDocked: 'top' | 'bottom' | 'left' | 'right' | 'floating';
  visibleByDefault: boolean;
  buttons: Button[];
  customizable: boolean;
  rowHint?: number;                  // preferred row index when multiple toolbars dock top
}

export type Button =
  | { kind: 'separator'; id: string }
  | { kind: 'standard'; id: string; icon: IconId; commandId: CommandId; args?: CommandArgs; tooltip: string; showLabel?: boolean; width?: number }
  | { kind: 'dropdown'; id: string; icon?: IconId; label?: string; items: DropdownItem[]; commandId?: CommandId; tooltip: string; defaultAction?: CommandId; width?: number }
  | { kind: 'combo'; id: string; items: ComboItem[]; width: number; commandId: CommandId; tooltip: string; editable: boolean; showRecent?: boolean }
  | { kind: 'swatch'; id: string; kind2: 'fontColor' | 'highlight' | 'shading'; tooltip: string; commandId: CommandId };

export interface DropdownItem {
  id: string;
  label?: string;
  icon?: IconId;
  commandId: CommandId;
  args?: CommandArgs;
  separator?: boolean;
}

export interface ComboItem {
  value: string;
  label: string;
  icon?: IconId;
}

export type DockSide = 'top' | 'bottom' | 'left' | 'right';

export interface DockState {
  side: DockSide | 'floating';
  rowOrCol: number;                  // docked strips are stacked in rows/cols
  order: number;                     // within a row/col, from left-top
  floatingPos?: { x: number; y: number };
  floatingSize?: { width: number; height: number };
}

export interface ToolbarsPrefs {
  customToolbars: ToolbarNode[];
  dockStates: Record<string, DockState>;
  hidden: string[];
  showLargeIcons: boolean;
  showTooltips: boolean;
  showShortcutKeysInTooltips: boolean;
  colorButtons: boolean;             // Word 95 "Color Buttons" option
  listFontNamesInFont: boolean;
}
```

### 7.2 Default toolbars

- **Standard**: New, Open, Save, Print, Print Preview, Spelling, Cut, Copy, Paste, Format Painter, Undo, Redo, AutoFormat, Insert Address, Insert Table, Insert Excel Sheet, Columns, Drawing, Show/Hide, Zoom combo, Help.
- **Formatting**: Style combo, Font combo, Size combo, Bold, Italic, Underline, Align Left, Align Center, Align Right, Justify, Numbering, Bullets, Decrease Indent, Increase Indent, Borders dropdown, Highlight dropdown, Font Color dropdown.
- **Borders**: Toolbar for border controls (see Word 95).
- **Database**: Mail-merge-adjacent.
- **Drawing**: Drawing tools.
- **Forms**: Form fields.
- **Microsoft**: Links to other Office apps (vestigial; we preserve the name and provide an analog for other installed apps).
- **Word for Windows 2.0**: A compatibility toolbar that emulates WinWord 2.0 button set.
- **Full Screen**: Minimal toolbar for full screen mode.
- **TipWizard**: Toolbar with a bulb icon that displays tips.

### 7.3 Toolbar component

```tsx
interface ToolbarProps {
  node: ToolbarNode;
  dockState: DockState;
  onReorderButtons?: (newOrder: string[]) => void;    // only in customize mode
  onDock?: (to: DockState) => void;
}
```

Layout:
- Horizontal toolbar: left edge has a 4 px "gripper" (drag handle). Buttons flow left-to-right. Height is 22 px at 100% zoom (native Win95).
- Vertical toolbar: top edge has the gripper. Buttons flow top-to-bottom. Width 22 px.
- Floating toolbar: rendered in `FloatingToolbarHost` as a draggable window with a title bar and close button.

Right-click on the gripper or between buttons opens a context menu with the list of known toolbars (checked items for visible) and `Customize...`.

### 7.4 ToolbarButton

```tsx
interface ToolbarButtonProps {
  button: Button;
  pressed: boolean;                  // for toggle commands
  enabled: boolean;
  tooltip: string;
  onClick: () => void;
  showLabel: boolean;
  largeIcon: boolean;
}
```

Visual states:
- **Normal**: flat, 1 px transparent border.
- **Hover**: 1 px raised bevel (white top/left, dark bottom/right).
- **Pressed** (mouse down or toggled on): 1 px sunken bevel.
- **Disabled**: icon rendered at 50% with a slight emboss.
- **Focused (via Tab)**: 1 px dotted focus ring inside the button.

Tooltip: delayed 500 ms; shown in a popover aligned below the button. If `showShortcutKeysInTooltips`, appends `(Ctrl+B)` in parens.

### 7.5 Docking behavior

The `DockManager` handles:

- Dragging the gripper to another side (top/bottom/left/right docks) with a live outline preview.
- Dropping onto empty space to float.
- Dropping floating onto a side edge to redock.
- Auto-adjusting toolbar row counts when multiple docks share a side.

Implementation uses HTML5 DnD with a custom drag image drawn in Canvas (a 1 px outline of the toolbar's bounding box).

### 7.6 Customize dialog integration

See CustomizeDialog (§ 9.16). In customize mode:
- Buttons show a hatched highlight.
- Drag between toolbars.
- Drag off a toolbar to remove.
- Drag from a Commands list panel to a toolbar to add.
- Right-click a button shows Delete / Reset / Image / Text / Image and Text / Default Style / Begin a Group.

### 7.7 Accessibility

- Toolbar container has `role="toolbar"` and `aria-label` (e.g., "Standard toolbar").
- Buttons have `role="button"`, `aria-label` (from tooltip), `aria-pressed` when toggle, `aria-disabled` when disabled.
- Arrow keys navigate within the focused toolbar; Tab moves out.
- F10 enters the toolbar region; Escape leaves.

---

## 8. Ruler components

### 8.1 HorizontalRuler

```tsx
interface HorizontalRulerProps {
  docId: string;
  widthPx: number;
  unit: MeasurementUnit;
  zoomPct: number;
  scrollLeftPx: number;
  pageLayout: {
    leftMarginPx: number;
    rightMarginPx: number;
    pageWidthPx: number;
    columnSpec: ColumnSpec;
  };
  paragraph: {
    firstLineIndentPx: number;
    leftIndentPx: number;
    rightIndentPx: number;
    tabStops: TabStop[];
    defaultTabWidthPx: number;
  };
  onSetTab: (xPx: number, alignment: TabAlignment) => void;
  onSetIndent: (which: 'firstLine' | 'left' | 'right', xPx: number) => void;
  onSetMargin: (which: 'left' | 'right', xPx: number) => void;
  onColumnResize: (columnIndex: number, xPx: number) => void;
}
```

Visual layout (inches at 100%):
- Ruler height: 17 px.
- Tick marks: major every `unit` increment, minor in between.
- Margin boundaries: shaded darker at left/right edges.
- Indent markers: small house-shape icons (first-line, hanging, left).
- Tab stops: L/R/C/D glyphs at tab positions; draggable.
- Tab selector at far left (18×17 px) cycles tab alignment on click.
- Column markers: shaded boundaries between columns.

Interaction:
- Click in ruler body: inserts a tab stop at the cursor position with current alignment.
- Drag existing tab: repositions it; dragging below the ruler (into page area) removes it.
- Drag indent markers: set paragraph indents; engine issues a real-time preview.
- Drag margin boundary: adjusts page margins.
- Right-click: context menu with "Default Tab Stops..." → opens Tabs dialog.

### 8.2 VerticalRuler

```tsx
interface VerticalRulerProps {
  docId: string;
  heightPx: number;
  unit: MeasurementUnit;
  zoomPct: number;
  scrollTopPx: number;
  pageLayout: {
    topMarginPx: number;
    bottomMarginPx: number;
    pageHeightPx: number;
  };
  table: {
    rowHeights: number[];
    selectedRowIndex: number | null;
  } | null;
  onSetMargin: (which: 'top' | 'bottom', yPx: number) => void;
  onSetRowHeight: (index: number, heightPx: number) => void;
}
```

Visible only in Page Layout view. Tracks top/bottom margin handles; in tables, row handles allow drag-resize.

### 8.3 Ruler scale resolution

```ts
// packages/ui/src/ruler/rulerScales.ts

export const UNIT_TICKS: Record<MeasurementUnit, { majorPx: (zoom: number) => number; minors: number }> = {
  inch: { majorPx: z => 96 * z, minors: 8 },
  cm:   { majorPx: z => 37.795275591 * z, minors: 10 },
  mm:   { majorPx: z => 3.7795275591 * z, minors: 10 },
  point: { majorPx: z => 1.333 * z, minors: 1 },
  pica:  { majorPx: z => 16 * z, minors: 12 },
};
```

### 8.4 Performance

- Ruler is drawn as SVG with inline `<path>` strokes for ticks, avoiding per-tick React elements.
- Tab stops and indent markers are React children of the SVG; each is `React.memo`.
- Re-renders are gated by narrow selectors: ruler re-renders when paragraph formatting changes at the caret or when scroll position changes.

---

## 9. Dialogs

### 9.1 Shared infrastructure

```ts
// packages/ui/src/dialogs/DialogManager.ts

export interface DialogManagerAPI {
  open<K extends DialogKind>(kind: K, props: DialogPropsFor<K>): Promise<DialogResult<K>>;
  close(id: string, result?: unknown): void;
  closeAll(): void;
  getStack(): DialogStackEntry[];
}

export type DialogResult<K extends DialogKind> =
  | { kind: 'ok'; value: DialogValueFor<K> }
  | { kind: 'cancel' }
  | { kind: 'destroyed' };
```

- Dialogs are registered in a type map; opening a non-registered dialog is a TS error.
- `open(...)` returns a Promise that resolves when the dialog closes; callers can `await` for the result.
- Modal dialogs stack; newer dialogs cover older ones with a backdrop; Z-index is `1000 + stackIndex * 10`.

```tsx
// packages/ui/src/dialogs/DialogFrame.tsx

interface DialogFrameProps {
  id: string;
  title: string;
  iconId?: IconId;
  size: 'fixed' | 'resizable';
  width?: number;
  height?: number;
  children: React.ReactNode;
  onClose: (reason: 'ok' | 'cancel' | 'esc' | 'x') => void;
  contextHelpTopic?: string;
  showHelp?: boolean;
}
```

The frame provides: title bar (with Program icon, title text, `?` context help button, close X), borders, shadow, focus trap, escape-to-cancel.

### 9.2 Dialog primitive

We build on Radix UI's `Dialog` for accessibility (focus trap, ARIA `dialog`, aria-labelledby from title). We replace the Radix visuals entirely with Word 95 styling:

- 2 px outset border (`#DFDFDF` top/left, `#808080` bottom/right).
- Title bar: 18 px high, `#000080` background, `#FFFFFF` text.
- Content area: `#C0C0C0` background.
- Drop shadow: 4 px `#808080` offset (when elevated theme is selected; default Word 95 has no shadow).

### 9.3 Form primitives

Every dialog composes from primitives:

```tsx
// GroupBox (fieldset with labeled border)
interface GroupBoxProps {
  label: string;
  children: React.ReactNode;
  width?: number | string;
}

// Checkbox
interface CheckboxProps {
  checked: boolean | 'indeterminate';
  onChange: (checked: boolean) => void;
  label: string;
  mnemonic?: string;
  disabled?: boolean;
  ariaDescribedBy?: string;
}

// Radio
interface RadioProps {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  label: string;
  mnemonic?: string;
  disabled?: boolean;
}

// TextInput
interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  width?: number | string;
  ariaLabel: string;
  maxLength?: number;
  autoComplete?: 'filename' | 'fontname' | 'off';
}

// NumberSpinner (with up/down buttons)
interface NumberSpinnerProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: MeasurementUnit | 'percent' | 'pt' | 'px';
  width?: number | string;
  ariaLabel: string;
}

// ComboBox
interface ComboBoxProps<T> {
  value: T;
  onChange: (value: T) => void;
  items: Array<{ value: T; label: string; icon?: IconId; disabled?: boolean }>;
  editable?: boolean;
  width?: number | string;
  dropDownWidth?: number;
  ariaLabel: string;
  renderItem?: (item: { value: T; label: string }) => React.ReactNode;
}

// ListBox (single/multi select)
interface ListBoxProps<T> {
  items: Array<{ value: T; label: string; icon?: IconId }>;
  value: T | T[] | null;
  onChange: (value: T | T[]) => void;
  multiple?: boolean;
  width?: number | string;
  height?: number | string;
  ariaLabel: string;
  virtualized?: boolean;                  // for long lists (fonts)
}

// Button
interface ButtonProps {
  label: string;
  onClick: () => void;
  kind?: 'default' | 'cancel' | 'normal';
  mnemonic?: string;
  disabled?: boolean;
  width?: number | string;
  icon?: IconId;
}

// Tabs
interface TabsProps {
  tabs: Array<{ id: string; label: string; mnemonic?: string; content: React.ReactNode }>;
  activeId: string;
  onChange: (id: string) => void;
}

// ColorPicker
interface ColorPickerProps {
  value: Color | 'auto';
  onChange: (value: Color | 'auto') => void;
  palette: ColorPalette;
  allowAuto?: boolean;
  allowCustom?: boolean;
}
```

### 9.4 Dialog catalogue

For each dialog we list: fields, submit command, default button, cancel button, Help topic. Tabs are listed per tab-strip. Validation notes are concise.

#### 9.4.1 FontDialog

Tabs: Font, Character Spacing.

**Font tab:**
- `Font` ComboBox (editable, autocomplete=fontname, virtualized list of installed fonts, preview font).
- `Font style` ComboBox: Regular, Italic, Bold, Bold Italic.
- `Size` ComboBox (editable, items 8–72).
- `Underline` ComboBox: None, Single, Words only, Double, Dotted.
- `Color` ColorPicker.
- `Effects` group: Checkboxes for Strikethrough, Superscript, Subscript, Hidden, Small caps, All caps.
- `Preview` pane: renders "Times New Roman" style text in the chosen font/size/style.
- `Default...` button: apply settings to Normal style (confirmation dialog first).

**Character Spacing tab:**
- `Spacing` ComboBox (Normal/Expanded/Condensed) + NumberSpinner for value (pt, -2000..+2000).
- `Position` (Normal/Raised/Lowered) + NumberSpinner (pt).
- `Kerning for fonts` checkbox + NumberSpinner for "Points and above".

Submit: `format.applyFont` with merged args. Default = OK; Cancel; Help.

#### 9.4.2 ParagraphDialog

Tabs: Indents and Spacing, Text Flow.

**Indents and Spacing:**
- Alignment ComboBox (Left/Centered/Right/Justified).
- Indentation group: Left NumberSpinner, Right NumberSpinner, Special ComboBox (None/First line/Hanging) + By NumberSpinner.
- Spacing group: Before, After, Line Spacing ComboBox (Single/1.5 lines/Double/At least/Exactly/Multiple) + At NumberSpinner.
- Preview pane.

**Text Flow:**
- Pagination group: Keep lines together, Keep with next, Page break before, Widow/Orphan control, Suppress line numbers, Don't hyphenate.
- Preview.

Submit: `format.applyParagraph`.

#### 9.4.3 PageSetupDialog

Tabs: Margins, Paper Size, Paper Source, Layout.

Fields per tab match Word 95 exactly (left/right/top/bottom margins, gutter, mirror margins, paper size ComboBox, paper orientation radios, paper source ComboBox for first/other pages, section start, headers/footers distance from edge, vertical alignment, line numbers button → dialog, borders button → dialog, suppress endnotes, different odd/even, different first page).

Submit: `file.applyPageSetup`.

#### 9.4.4 PrintDialog

- Printer ComboBox with Properties button.
- Print Range radios: All, Current page, Selection, Pages (with TextInput for ranges like "1-4, 6, 8-").
- Copies NumberSpinner + Collate checkbox.
- Print ComboBox: Document/Summary Info/Annotations/Styles/AutoText entries/Key Assignments.
- Print what ComboBox when Range=Odd/Even.
- `Options...` button → Print options sub-dialog.
- OK / Cancel.

Submit: `file.print`.

#### 9.4.5 FindReplaceDialog (modeless)

This is modeless. Fields:
- Find what ComboBox (recent searches).
- Replace with ComboBox (in Replace mode).
- Match case checkbox.
- Find whole words only checkbox.
- Use pattern matching checkbox.
- Sounds like checkbox.
- Find all word forms checkbox.
- Find buttons: Find Next, Replace, Replace All, Cancel.
- Search ComboBox: All/Down/Up.
- Format... button drops down formatting options.
- Special... button drops down special chars (paragraph mark, tab, any char, etc.).
- No Formatting button clears formatting constraints.

Surfaces state via `UIStore.findReplace`.

#### 9.4.6 OptionsDialog (tabs)

Tabs (each a separate tab panel):
- View: Show (Draft font, Wrap to window, Picture placeholders, Field codes, Bookmarks, Field shading, Text boundaries, Highlight); Nonprinting characters (Tab characters, Spaces, Paragraph marks, Optional hyphens, Hidden text, All); Window (Status bar, Horizontal scroll bar, Vertical scroll bar); Style area width.
- General: Background repagination, Help for WordPerfect users, Navigation keys for WordPerfect users, Blue background white text, Beep on error actions, Confirm conversion at Open, Update automatic links at Open, Mail as attachment, Recently used file list count, Measurement units.
- Edit: Typing replaces selection, Drag-and-drop text editing, Automatic word selection, Use smart cut and paste, Tabs and backspace set left indent, Allow accented uppercase in French, Overtype mode, Use the INS key for paste, Picture editor.
- Print: Draft output, Reverse print order, Update fields, Update links, Background printing, Document properties, Field codes, Annotations, Hidden text, Drawing objects, Default tray.
- Revisions: Inserted text (by color, mark), Deleted text (by color, mark), Revised lines (mark, color), Highlight color.
- User Info: Name, Initials, Mailing Address.
- Compatibility: Font Substitution, options listbox with Word 6.0/Word for Macintosh 5.x/WordPerfect 5.x/WordPerfect 6.x/Word for Windows 2.0/Custom presets.
- File Locations: Listbox of path types (Documents, Pictures, User Templates, Workgroup Templates, User Options, Autosave Files, Tools, Startup) with Modify button.
- Save: Always create backup copy, Allow fast saves, Prompt for Summary Info, Prompt to save Normal.dot, Save data only for forms, Embed TrueTypeFonts, Save AutoRecover info every N minutes, File-sharing options (Protection Password, Write Reservation Password, Read-Only Recommended), Default format ComboBox.
- Spelling: Automatic spell checking, Always suggest, From main dictionary only, Words in UPPERCASE, Words with numbers, Reset, Custom Dictionaries button → sub-dialog.
- Grammar: Use grammar & style rules (casual/standard/formal/technical/custom), Show readability statistics, Check spelling.
- AutoFormat: AutoFormat as you type options.
- AutoCorrect: AutoCorrect entries and replacements (also opened standalone).

Submit: Apply to `PrefsStore` via commands; close.

#### 9.4.7 BulletNumberingDialog

Tabs: Bulleted, Numbered, Multilevel, List styles.

Each tab shows 7 sample boxes (6 + "None") of preset lists; Modify... button opens the numbering format sub-dialog. OK applies.

#### 9.4.8 BordersShadingDialog

Tabs: Borders, Page Border, Shading.

Fields: Preset (None/Box/Shadow/3-D/Custom), Style list, Color, Width, From Text, Preview with clickable edges.

#### 9.4.9 ColumnsDialog

Presets (One/Two/Three/Left/Right), NumberOfColumns spinner, Width and Spacing per column (EqualColumnWidth checkbox), LineBetween checkbox, Apply to ComboBox.

#### 9.4.10 BreakDialog

Radios: Page break, Column break, Text wrapping break; Section breaks (Next page, Continuous, Even page, Odd page). OK / Cancel.

#### 9.4.11 ChangeCaseDialog

Radios: Sentence case, lowercase, UPPERCASE, Title Case, tOGGLE cASE. OK applies `format.changeCase`.

#### 9.4.12 DropCapDialog

Position radios (None/Dropped/In Margin), Font ComboBox, Lines to drop NumberSpinner, Distance from text NumberSpinner.

#### 9.4.13 StyleDialog and StyleGalleryDialog

StyleDialog: List of styles (character and paragraph), Modify/Delete/New buttons, Organizer button → cross-document copy. Description pane shows resolved style.

StyleGalleryDialog: List of templates, Preview with current doc, Apply.

#### 9.4.14 FieldDialog

Categories ListBox, Field names ListBox, Field codes TextInput, Options button, Preserve formatting checkbox, OK applies `insert.field`.

#### 9.4.15 SymbolDialog

Tabs: Symbols, Special Characters.

Symbols: Font ComboBox, grid of glyphs, Insert button, Shortcut Key button → Customize keyboard.

#### 9.4.16 BookmarkDialog

Name TextInput (autocomplete), list of existing bookmarks, Sort by radios (Name/Location), Hidden bookmarks checkbox, Add/Delete/Go To buttons.

#### 9.4.17 CrossReferenceDialog

Reference type ComboBox, Insert reference to ComboBox, For which item ListBox, Insert as hyperlink checkbox, Include above/below checkbox.

#### 9.4.18 IndexTablesDialog

Tabs: Index, Table of Contents, Table of Figures, Table of Authorities.

#### 9.4.19 FormulaDialog

Formula TextInput, Number format ComboBox, Paste function ComboBox, Paste bookmark ComboBox. OK inserts a field.

#### 9.4.20 TableInsertDialog

Number of columns/rows spinners, Column width ComboBox (Auto or pt), Format button → Table AutoFormat sub-dialog.

#### 9.4.21 CellHeightWidthDialog, TableSortDialog, InsertTableDialog

Cell Height and Width: Row tab (height), Column tab (width), manage row heights, column widths.

Table Sort: Up to three sort keys with Field/Type/Ascending|Descending.

Insert Table: alternate insert UI.

#### 9.4.22 MailMergeHelperDialog

A three-step wizard: Main Document, Data Source, Merge. Each step a GroupBox with actions. Status table of current state.

#### 9.4.23 EnvelopeLabelsDialog

Tabs: Envelopes, Labels. Fields per Word 95 exactly (address boxes with postal code, Add to Document button, Print button, Options...).

#### 9.4.24 ProtectDocumentDialog

Radios: Revisions, Annotations, Forms; Password TextInput. OK applies `document.protect`.

#### 9.4.25 RevisionsDialog

Mark revisions while editing checkbox, Show revisions on screen checkbox, Show revisions in printed document checkbox, Accept All/Reject All/Review... buttons.

#### 9.4.26 CompareVersionsDialog

Open file picker and run a compare. Results are revision marks in the current document.

#### 9.4.27 MergeDocumentsDialog

Pick an original and a revised; three-way reconciliation.

#### 9.4.28 MacroDialog

Macro Name TextInput, list of macros, Macros in ComboBox (All/Normal/Document), Run/Step/Edit/Create/Delete/Organizer buttons. Since we do not execute macros, "Run" is disabled and a tooltip explains; we preserve the dialog and existing macros in the docx.

#### 9.4.29 CustomizeDialog

Three tabs: Toolbars, Menus, Keyboard. See § 17.

#### 9.4.30 ThesaurusDialog

Looked Up ComboBox (current word), Meanings ListBox, Replace With TextInput, Synonyms ListBox, Look Up/Replace/Cancel/Previous buttons.

#### 9.4.31 SpellingDialog

Not in Dictionary text area (contextual), Change To TextInput, Suggestions ListBox, Add Words To ComboBox (dictionaries), Ignore/Ignore All/Change/Change All/AutoCorrect/Options/Undo Last/Cancel buttons.

#### 9.4.32 GrammarDialog

Similar shape to Spelling; Sentence box, Suggestions, Ignore/Next/Change/Ignore Rule/Explain/Options/Cancel.

#### 9.4.33 WordCountDialog

Read-only statistics: Pages, Words, Characters (no spaces), Characters (with spaces), Paragraphs, Lines. Include footnotes and endnotes checkbox.

#### 9.4.34 SummaryInfoDialog

Title, Subject, Author, Manager, Company, Category, Keywords, Comments, Hyperlink Base textareas. Statistics tab shows read-only fields. Custom tab allows arbitrary metadata.

#### 9.4.35 FindFileDialog

Search criteria (Location, File Name, Title, Author, Last Saved By, Text or Property, Date), Saved Searches ListBox, Commands dropdown (Open, Print, Summary, Delete, Copy, Sort, Find Again, Open Read Only).

#### 9.4.36 AutoCorrectDialog

Table of replacements (what->with), Exceptions... button (opens sub-dialog), AutoCorrect options checkboxes.

#### 9.4.37 AutoFormatDialog

AutoFormat Now or Review radio, Document Type ComboBox, Options button.

#### 9.4.38 PasteSpecialDialog

Source text area, Paste / Paste Link radios, As ListBox with available formats, Result text area explaining chosen format, Display as icon checkbox.

### 9.5 Help button

Every dialog has a `?` title-bar button that opens context-sensitive help via `help.context?topic=<contextHelpTopic>`. When in "What's This?" mode (Shift+F1), clicking any control in a dialog shows a tooltip with the field's help text.

### 9.6 Dialog mounting

Dialogs are lazy-loaded via `React.lazy`:

```ts
const FontDialog = React.lazy(() => import('./FontDialog'));
```

`DialogRoot` wraps each in `Suspense` with a minimal loading indicator (unnoticeable for small dialogs, noticeable only for the multi-tab Options dialog).

### 9.7 Dialog default behaviors

- **Enter** triggers the default button (OK by default). Exception: if the focused control is a multi-line TextInput, Enter inserts a newline.
- **Esc** triggers the cancel button.
- **Tab / Shift+Tab** move focus within the dialog's focus trap.
- **Alt+<mnemonic>** focuses the labeled control.
- On open, focus moves to the first focusable control (or a dialog-specified initial-focus).
- On close, focus returns to the pre-open element.

### 9.8 Dialog preview pattern

Dialogs that have a Preview pane (Font, Paragraph, Borders, Columns, Page Setup) use an internal `<PreviewCanvas>` component that renders a scaled-down representation of the current settings:

```tsx
interface PreviewCanvasProps<T> {
  value: T;
  render: (ctx: CanvasRenderingContext2D, value: T, sizePx: { width: number; height: number }) => void;
  widthPx: number;
  heightPx: number;
  ariaLabel: string;
}
```

Preview is never the actual document; it's a canvas that redraws as fields change.

---

## 10. Status bar

### 10.1 StatusBar component

```tsx
interface StatusBarProps {
  docId: string | null;
  visible: boolean;
}
```

Renders left-to-right regions separated by vertical bevel dividers. Each region is `<StatusRegion>`.

### 10.2 Regions (in order)

1. **PageIndicatorRegion**: "Page 1 of 12" ("Section 1, Page 1 of 12" when multi-section). Double-click opens Go To dialog.
2. **VerticalPositionRegion**: `At 2.5"` (distance from top). Updated on selection change.
3. **LineRegion**: `Ln 14`.
4. **ColumnRegion**: `Col 22`.
5. Separator.
6. **ModeIndicatorsRegion**: REC (record macro), MRK (marking revisions), EXT (extend selection), OVR (overtype). Each is a 3-char toggle label. Double-click toggles.
7. **LanguageRegion**: Language code / region from current paragraph; double-click opens Language dialog.
8. **SpellStatusRegion**: An open-book icon with a red X or checkmark. Double-click jumps to next spelling error.
9. **BackgroundSaveRegion**: Disk icon, visible only during background save.

### 10.3 StatusRegion primitive

```tsx
interface StatusRegionProps {
  id: string;
  width?: number | 'auto';
  children: React.ReactNode;
  onClick?: () => void;
  onDoubleClick?: () => void;
  tooltip?: string;
  ariaLabel: string;
  emphasis?: 'normal' | 'dimmed' | 'highlighted';
}
```

- Height matches status bar (20 px).
- Dividers: 1 px inset bevel between regions.
- Hover: subtle highlight if `onClick` or `onDoubleClick` is present.
- Focus: regions are keyboard focusable via F10+Tab to StatusBar region, then arrows; Enter triggers click, double-Enter triggers dblclick.

### 10.4 Reactivity

Each region uses `useDocument(docId, selector)` with a narrow selector:

```ts
const page = useDocument(docId, s => s.pageCount, Object.is);
const currentPage = useDocument(docId, s => s.selection.pageIndex, Object.is);
```

Page numbers update on repagination; line/column update on selection change. We use `useDeferredValue` for status updates so they never block a user's typing.

### 10.5 Screen reader announcements

When enabled (PrefsStore setting), numeric changes to the Page/Line/Column regions are announced via `aria-live="polite"` on a visually hidden region. Avoids announcing during rapid typing (debounce 500 ms).

---

## 11. MDI workspace

### 11.1 Architecture

Word 95 is an MDI (multi-document interface) application. Each document is a child window within the parent frame. We replicate this.

```tsx
interface MDIWorkspaceProps {
  childrenState: MDIChildState[];
  activeId: string | null;
  arrangement: 'cascade' | 'tile' | 'free';
  onArrange: (a: 'cascade' | 'tile') => void;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onReorder: (newOrder: string[]) => void;
}

export interface MDIChildState {
  docId: string;
  title: string;
  bounds: { x: number; y: number; width: number; height: number };
  minimized: boolean;
  maximized: boolean;
  zIndex: number;
  iconPosition?: { x: number; y: number };   // when minimized
}
```

### 11.2 Child window chrome

`MDIChildTitleBar`:
- 18 px tall, `#000080` active / `#808080` inactive background.
- Icon (16×16) at left, title text, min/max/close buttons at right.
- Drag to reposition (only when `arrangement === 'free'`).
- Double-click maximizes (toggles).

When a child is maximized, the workspace behavior changes:
- Child's title bar is removed.
- Child's icon, title, and min/max/close buttons are merged into the main MenuBar region (on the left side of the menu bar: child icon; on the right side: min/max/close for the child).
- This is a direct replica of Word 95 behavior and is implemented by `MenuBar` switching into "maximized child adornment" mode when `UIStore` reports a maximized active child.

### 11.3 Arrangements

- **Cascade** (`mdi.cascade`): stagger windows from top-left with 20 px offset; all at 70% workspace size.
- **Tile Horizontal** (`mdi.tileHorizontal`): stack horizontally, equal heights.
- **Tile Vertical** (`mdi.tileVertical`): stack vertically, equal widths.
- **Arrange Icons** (`mdi.arrangeIcons`): when some children are minimized (shown as icons in the workspace), align them at the bottom.

### 11.4 Virtualization

MDI children are expensive (each has a full editor). We virtualize:
- The active child is always rendered.
- Adjacent children (by Z-order) are rendered only when their bounds intersect the viewport.
- Non-rendered children show a placeholder in their title bar ("Reopening...") and reconstitute on focus.

### 11.5 Window menu integration

The Window menu dynamically lists open MDI children with numeric accelerators (1, 2, ... 9; "More Windows..." if >9). Each accelerator activates the child.

### 11.6 Scrollbars

`Scrollbars` inside `EditorViewport` are custom-drawn to match Word 95:
- 16 px wide.
- Gray arrow buttons at ends (up/down or left/right).
- Thumb with 1 px bevel.
- Arrow clicks scroll by 1 line (20 px).
- Page area click scrolls by a page.
- Thumb drag scrolls to position; a tooltip shows "Page N" during drag.

### 11.7 Split windows

Each child can be split horizontally (Word Split command). Implementation:
- `EditorViewport` renders one or two `<PageHost>` instances sharing the same `docId`.
- Splitter bar between them (4 px) is draggable.
- Each pane has its own scroll position and zoom.

---

## 12. Theming system

### 12.1 Token structure

```ts
// packages/ui/src/themes/tokens.ts

export interface ThemeTokens {
  id: ThemeId;
  name: string;

  color: {
    bg: {
      face: string;
      faceHover: string;
      facePressed: string;
      faceDisabled: string;
      window: string;
      input: string;
      menu: string;
      menuHover: string;
      highlight: string;
      highlightInactive: string;
      toolTip: string;
      backdrop: string;           // modal backdrop
    };
    text: {
      default: string;
      disabled: string;
      onHighlight: string;
      onMenuHover: string;
      toolTip: string;
      link: string;
      placeholder: string;
    };
    border: {
      outset: { top: string; left: string; bottom: string; right: string };
      inset: { top: string; left: string; bottom: string; right: string };
      divider: string;
      focusRing: string;
    };
    accent: {
      primary: string;
      secondary: string;
      warning: string;
      danger: string;
      success: string;
    };
  };

  font: {
    ui: { family: string; sizePx: number; weightNormal: number; weightBold: number };
    uiSmall: { family: string; sizePx: number; weightNormal: number };
    menu: { family: string; sizePx: number };
    ruler: { family: string; sizePx: number };
    statusBar: { family: string; sizePx: number };
    dialogTitle: { family: string; sizePx: number; weight: number };
    monospace: { family: string; sizePx: number };
  };

  space: {
    xs: number;                    // 2 px
    sm: number;                    // 4 px
    md: number;                    // 8 px
    lg: number;                    // 12 px
    xl: number;                    // 16 px
  };

  radius: {
    none: number;
    sm: number;
    md: number;
  };

  shadow: {
    none: string;
    subtle: string;
    raised: string;
    dialog: string;
  };

  control: {
    rowHeightPx: number;           // 23 for Word95
    toolbarHeightPx: number;       // 22 for Word95
    menuBarHeightPx: number;       // 20 for Word95
    statusBarHeightPx: number;     // 20 for Word95
    titleBarHeightPx: number;      // 18
    scrollbarSizePx: number;       // 16
    gripperWidthPx: number;        // 4
    iconSmallPx: number;           // 16
    iconMediumPx: number;          // 24
    iconLargePx: number;           // 32
    focusRingWidthPx: number;
    borderWidthPx: number;
  };

  animation: {
    menuOpenMs: number;            // 0 for Word95
    dialogFadeMs: number;          // 100 for Word95
    toastSlideMs: number;
    reduced: boolean;
  };
}

export type ThemeId = 'word95' | 'modernLight' | 'modernDark' | 'highContrast';
```

### 12.2 Word 95 theme values

```ts
// packages/ui/src/themes/word95.ts

export const word95Theme: ThemeTokens = {
  id: 'word95',
  name: 'Word 95',
  color: {
    bg: {
      face: '#C0C0C0',
      faceHover: '#C0C0C0',
      facePressed: '#808080',
      faceDisabled: '#C0C0C0',
      window: '#FFFFFF',
      input: '#FFFFFF',
      menu: '#C0C0C0',
      menuHover: '#000080',
      highlight: '#000080',
      highlightInactive: '#808080',
      toolTip: '#FFFFC0',
      backdrop: 'rgba(0,0,0,0.25)',
    },
    text: {
      default: '#000000',
      disabled: '#808080',
      onHighlight: '#FFFFFF',
      onMenuHover: '#FFFFFF',
      toolTip: '#000000',
      link: '#0000FF',
      placeholder: '#808080',
    },
    border: {
      outset: { top: '#DFDFDF', left: '#DFDFDF', bottom: '#808080', right: '#808080' },
      inset:  { top: '#808080', left: '#808080', bottom: '#DFDFDF', right: '#DFDFDF' },
      divider: '#808080',
      focusRing: '#000000',
    },
    accent: {
      primary: '#000080',
      secondary: '#008080',
      warning: '#C0C000',
      danger: '#800000',
      success: '#008000',
    },
  },
  font: {
    ui: { family: 'Micross, "MS Sans Serif", Tahoma, sans-serif', sizePx: 11, weightNormal: 400, weightBold: 700 },
    uiSmall: { family: 'Micross, "MS Sans Serif", sans-serif', sizePx: 10, weightNormal: 400 },
    menu: { family: 'Micross, "MS Sans Serif", sans-serif', sizePx: 11 },
    ruler: { family: 'Micross, "MS Sans Serif", sans-serif', sizePx: 10 },
    statusBar: { family: 'Micross, "MS Sans Serif", sans-serif', sizePx: 10 },
    dialogTitle: { family: 'Micross, "MS Sans Serif", sans-serif', sizePx: 11, weight: 700 },
    monospace: { family: '"Courier New", monospace', sizePx: 12 },
  },
  space: { xs: 2, sm: 4, md: 8, lg: 12, xl: 16 },
  radius: { none: 0, sm: 0, md: 0 },     // Word 95 has no rounded corners
  shadow: {
    none: 'none',
    subtle: 'none',
    raised: 'none',
    dialog: 'none',                      // authentic 95 has none; optional param makes 2px offset shadow
  },
  control: {
    rowHeightPx: 23,
    toolbarHeightPx: 22,
    menuBarHeightPx: 20,
    statusBarHeightPx: 20,
    titleBarHeightPx: 18,
    scrollbarSizePx: 16,
    gripperWidthPx: 4,
    iconSmallPx: 16,
    iconMediumPx: 24,
    iconLargePx: 32,
    focusRingWidthPx: 1,
    borderWidthPx: 2,
  },
  animation: {
    menuOpenMs: 0,
    dialogFadeMs: 100,
    toastSlideMs: 200,
    reduced: false,
  },
};
```

### 12.3 Other themes

- **Modern Light**: flat design, `#FFFFFF` window background, `#F3F3F3` face, system font (Segoe UI 14 on Windows, SF Pro on macOS), 4 px radii, gentle shadows. Control heights 32 px.
- **Modern Dark**: inverted palette (`#1E1E1E` window, `#2B2B2B` face, `#E0E0E0` text), system font.
- **High Contrast**: maps to OS high-contrast variables via `forced-colors` media query.

### 12.4 CSS architecture

- CSS Modules per component: `MenuBar.module.css`.
- Every color/font/size references a CSS custom property: `var(--color-bg-face)`, `var(--font-ui-family)`, `var(--space-md)`.
- Theme provider writes all tokens to `:root` on mount and on theme change.
- Theme change is instant; no reload; subscribers of `ThemeProvider` re-render only where tokens affect calculations.

```tsx
// packages/ui/src/themes/ThemeProvider.tsx

export interface ThemeProviderProps {
  theme: ThemeId | ThemeTokens;
  children: React.ReactNode;
}

export function ThemeProvider({ theme, children }: ThemeProviderProps) {
  const tokens = typeof theme === 'string' ? resolveTheme(theme) : theme;
  useEffect(() => writeThemeVariables(tokens), [tokens]);
  return (
    <ThemeContext.Provider value={tokens}>
      {children}
    </ThemeContext.Provider>
  );
}
```

### 12.5 Bevel utility

Word 95 uses 2 px bevels extensively. A utility generates the `box-shadow` form to avoid pseudo-elements:

```ts
export function bevel(style: 'outset' | 'inset', t: ThemeTokens): string {
  const b = t.color.border[style];
  return [
    `inset 1px 1px 0 0 ${b.top}`,
    `inset -1px -1px 0 0 ${b.bottom}`,
    `inset 2px 2px 0 0 ${style === 'outset' ? '#FFFFFF' : b.top}`,
    `inset -2px -2px 0 0 ${style === 'outset' ? '#000000' : b.bottom}`,
  ].join(', ');
}
```

### 12.6 Zoom and accessibility

- `uiFontScale` (PrefsStore) scales the UI font (for visually impaired users). Default 1.0; slider in Options.
- `chromeZoom` scales the entire chrome (without affecting document rendering). 100/125/150/200 %.
- System `prefers-reduced-motion` disables all animations (`animation.reduced = true`).

---

## 13. Icon system

### 13.1 Architecture

```ts
// packages/ui/src/icons/IconRegistry.ts

export type IconId = string;           // "file.save", "format.bold", etc.

export interface IconDefinition {
  id: IconId;
  svg: string;                         // raw <svg>...</svg>
  variants?: Record<'light' | 'dark' | 'highContrast', string>;
  size: 16 | 24 | 32;
}

export interface IconPack {
  id: string;                          // "word95-default", "material", "user-custom-A"
  displayName: string;
  icons: Map<IconId, IconDefinition>;
}

export interface IconRegistryAPI {
  loadPack(pack: IconPack): void;
  unloadPack(id: string): void;
  getIcon(id: IconId, size?: 16 | 24 | 32): IconDefinition | null;
  setActivePack(id: string): void;
}
```

### 13.2 Word 95 pack

~250 SVGs commissioned to match Word 95 semantics without copying bitmaps. Each SVG is 16×16 with pixel-accurate coordinates (no subpixel strokes) so it renders crisply at 100%. Larger sizes (24, 32) are separate SVGs because up-scaled 16 px icons look poor.

Icon metadata is declared in `packs/word95/index.json`:

```json
{
  "file.save": { "file": "save.svg", "description": "Save document (Ctrl+S)" },
  ...
}
```

### 13.3 Icon component

```tsx
interface IconProps {
  id: IconId;
  size?: 16 | 24 | 32;
  title?: string;
  decorative?: boolean;                // if true, aria-hidden
  disabled?: boolean;
  theme?: 'light' | 'dark' | 'highContrast';
}
```

- Renders inline `<svg>` with theme-aware fill colors via CSS variables.
- When `disabled`, applies a grayscale + 50% alpha filter.
- Bitmap fallback for users who disable SVG in prefs (rare; optional).

### 13.4 Icon loading

Icons are loaded on demand by Vite's glob import:

```ts
const icons = import.meta.glob('./packs/word95/*.svg', { query: '?raw', eager: false });
```

Each toolbar button lazy-loads its icon on first mount; once loaded, cached in memory.

---

## 14. Fonts for UI

### 14.1 Shipping fonts

We ship the following fonts in `packages/ui/src/fonts/`:

- **Micross.ttf**: a truetype font shaped like MS Sans Serif, public-domain or licensed replacement. Used for 8 pt and 10 pt UI text.
- **Tahoma** and **Segoe UI** are system-installed on Windows; we fall back to them if Micross fails.
- **Monospace**: Courier New fallback.

`@font-face` declarations in `fonts.css`:

```css
@font-face {
  font-family: 'Micross';
  src: url('./fonts/Micross.ttf') format('truetype');
  font-weight: 400;
  font-style: normal;
  font-display: block;          /* avoid FOUT on first render */
}
@font-face {
  font-family: 'Micross';
  src: url('./fonts/MicrossBold.ttf') format('truetype');
  font-weight: 700;
}
```

### 14.2 Bitmap sharpness at 100%

The tricky part: bitmap fonts are pixel-perfect at their native size (8 pt @ 96 DPI = 11 px). Our TTF replacement includes a bitmap strike for 11 px to match. At other sizes the outline is rasterized smoothly.

### 14.3 Loading

Fonts are preloaded (`<link rel="preload">`) before paint so first render doesn't FOUT. A font-load detector defers AppShell paint until fonts report ready.

---

## 15. Form controls

### 15.1 Principles

- All form controls are controlled (no uncontrolled React components in the UI package).
- Validation is done with Zod schemas per dialog.
- Accessibility is non-negotiable: every control has `aria-label` (or visible label), focus ring, keyboard operability, and correct role.

### 15.2 Button

```tsx
interface ButtonProps {
  label: string;                        // or `children` for custom
  onClick: () => void;
  kind?: 'default' | 'cancel' | 'normal' | 'toolbar';
  mnemonic?: string;
  disabled?: boolean;
  width?: number | string;              // default: auto with min 75 px
  icon?: IconId;
  ariaLabel?: string;
  tooltip?: string;
}
```

Visuals (Word 95):
- Height 23 px.
- Min width 75 px.
- Bevel: outset normal, inset when pressed.
- Default variant has a 1 px dark border + 2 px bevel (thicker than normal).
- Focus: 1 px dotted rectangle inset 4 px.
- Text centered, mnemonic underlined (when enabled).
- Cancel variant: visually identical to default except no thick border, but responds to Esc when in a dialog.

### 15.3 Checkbox

```tsx
interface CheckboxProps {
  checked: boolean | 'indeterminate';
  onChange: (checked: boolean) => void;
  label: string;
  mnemonic?: string;
  disabled?: boolean;
  ariaDescribedBy?: string;
}
```

Visuals:
- 13×13 sunken bevel box on left, 4 px gap, label on right.
- Check glyph: simple angular check in black.
- Indeterminate: filled rectangle inside.
- Hover: entire row gets subtle highlight.
- Focus: 1 px dotted rectangle around label + box.

### 15.4 Radio / RadioGroup

```tsx
interface RadioGroupProps {
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string; mnemonic?: string; disabled?: boolean }>;
  orientation?: 'vertical' | 'horizontal';
  ariaLabel: string;
}
```

- 12×12 circle with inner dot when selected.
- Keyboard: arrows move between options within the group; Space activates.

### 15.5 TextInput

- 23 px high, sunken bevel, white background.
- Focus: same sunken bevel; caret is system default.
- Disabled: gray background (`#C0C0C0`).
- Selection: `#000080` background, white text.
- Autocomplete variants supported (font names, file paths).

### 15.6 NumberSpinner

Composition: TextInput + vertical pair of up/down arrow buttons (8 px wide, half-height each).

- Arrows repeat when held.
- Scroll wheel increments.
- Unit suffix optional and read-only.
- Zod validation: clamps to min/max; reverts to last valid on blur if invalid.

### 15.7 ComboBox

- Editable or read-only (dropdown-only).
- Drop-down arrow on right (16 px wide).
- Drop-down list: bordered, with up to 8 visible rows (scrollable beyond).
- Mouse click, keyboard F4 or Alt+Down opens dropdown.
- When editable: keystrokes filter; autocomplete suggests.
- Virtualized for large lists (font names).

### 15.8 ListBox

- Bordered box with rows.
- Single or multi-select.
- Keyboard: arrows, Home, End, PgUp/PgDn, Ctrl+A (multi).
- Visual: selected rows `#000080` / white.

### 15.9 GroupBox

- Thin outset border with text in upper-left.
- Used to group related controls in dialogs.
- Accessibility: `<fieldset>` + `<legend>`.

### 15.10 Tabs

- Horizontal strip of tab buttons at top.
- Active tab: bevel merges with content area (looks like a folder tab).
- Inactive tabs: slightly inset.
- Accessibility: `role="tablist"`, `role="tab"`, `role="tabpanel"`, arrow-key navigation between tabs.

### 15.11 Divider

- Horizontal line used between toolbar sections, dialog sections.
- 1 px inset bevel.

### 15.12 Tooltip

- Yellow (`#FFFFC0`) background, 1 px black border.
- Shown after 500 ms hover; hidden on leave or click.
- Follows cursor for toolbar tips (Word 95 behavior).
- Accessibility: `aria-describedby` on the target; delayed appearance.

### 15.13 ProgressIndicator

- Determinate or indeterminate.
- Bevel frame with blue/green filled segments (Word 95 animated bar style for indeterminate).

---

## 16. Clipboard integration

### 16.1 Architecture

```ts
// packages/ui/src/clipboard/ClipboardService.ts

export interface ClipboardServiceAPI {
  readAll(): Promise<ClipboardItem[]>;    // all available representations
  writeAll(items: ClipboardItem[]): Promise<void>;
  hasFormat(format: ClipboardFormat): Promise<boolean>;
}

export type ClipboardFormat =
  | 'text/plain'
  | 'text/rtf'
  | 'text/html'
  | 'application/vnd.ms-word'              // OOXML WordProcessingML
  | 'image/png'
  | 'image/bmp'
  | 'image/wmf'
  | 'image/svg+xml'
  | 'word.internal';                       // our own inline format

export interface ClipboardItem {
  format: ClipboardFormat;
  data: string | Blob;
  source: 'user' | 'paste-special' | 'office-interop';
}
```

All clipboard access is routed through IPC to the main process (`window.clipboardBridge.*`) to leverage Electron's broader format support.

### 16.2 Paste Special dialog

Opens on `edit.pasteSpecial` command. Shows:
- `Source:` text area describing clipboard origin.
- `As:` list of formats: Microsoft Word Document Object, Formatted Text (RTF), Unformatted Text, HTML Format, Picture, Bitmap.
- `Paste` / `Paste link` radio buttons.
- `Display as icon` checkbox.
- `Result:` text describing the effect of the chosen format.
- OK / Cancel.

OK dispatches `edit.pasteAs` with the chosen format.

### 16.3 Cut/Copy/Paste commands

Commands accept optional `format?: ClipboardFormat` args. The default paste uses a priority order:
1. `word.internal` (preserves full fidelity across instances)
2. `application/vnd.ms-word`
3. `text/rtf`
4. `text/html`
5. `text/plain`

Images:
1. `image/png`
2. `image/wmf` (preferred for scalability; not supported on web, only via Electron)
3. `image/bmp`

---

## 17. Drag and drop

### 17.1 Architecture

We use React DnD with HTML5 backend for all drag-and-drop. Two distinct domains:

**Intra-document** (text selection drag, image reorder, table row reorder):
- Drag source: `PageHost` detects a drag-start on a selection.
- We then create a custom drag image (rendered off-screen via Canvas), attach data with MIME `word.internal`.
- Drop target: `PageHost` again; on drop, layout engine resolves the target location and commits a move or copy (Ctrl modifier for copy).

**External DnD** (files/images from OS):
- Drop zones: `MDIWorkspace` (drop file to open), `EditorViewport` (drop image to insert).
- We accept standard `DataTransfer` types: `Files`, `text/uri-list`, `text/plain`.
- We render a full-viewport drop indicator overlay during drag-over.

### 17.2 DnD types

```ts
export const DND_TYPES = {
  DOCUMENT_SELECTION: 'word.selection',
  TABLE_ROW: 'word.tableRow',
  TOOLBAR_BUTTON: 'ui.toolbarButton',
  MDI_TITLE: 'ui.mdiTitle',
  EXTERNAL_FILE: 'nativeFile',
  EXTERNAL_IMAGE: 'nativeImage',
} as const;
```

### 17.3 Toolbar DnD in customize mode

- Drag button between toolbars.
- Drag from Commands catalog onto a toolbar.
- Drag off the toolbar removes.

### 17.4 MDI title drag

- Drag an MDI title bar to reposition within the workspace.
- Drop on an edge to dock (future extension; not Word 95 behavior).

---

## 18. Context menus

### 18.1 Architecture

```ts
// packages/ui/src/contextmenu/contextMenuRegistry.ts

export interface ContextMenuDefinition {
  id: string;
  match: (target: ContextTarget) => boolean;
  priority: number;
  items: (target: ContextTarget, ctx: MenuContext) => MenuNode[];
}

export type ContextTarget =
  | { kind: 'text'; offset: number; docId: string }
  | { kind: 'image'; imageId: string; docId: string }
  | { kind: 'table'; tableRef: TableRef; cell: CellRef; docId: string }
  | { kind: 'hyperlink'; target: string; docId: string }
  | { kind: 'misspelling'; word: string; suggestions: string[]; docId: string }
  | { kind: 'comment'; commentId: string; docId: string }
  | { kind: 'field'; fieldId: string; docId: string }
  | { kind: 'bookmark'; name: string; docId: string }
  | { kind: 'toolbar'; toolbarId: string }
  | { kind: 'menubar'; }
  | { kind: 'ruler'; }
  | { kind: 'statusbar'; };

export interface ContextMenuRegistryAPI {
  register(def: ContextMenuDefinition): () => void;
  resolve(target: ContextTarget): MenuNode[];
}
```

Multiple matching definitions are composed in priority order (higher first), separated by separators.

### 18.2 Trigger

Right-click anywhere emits a synthetic "context menu requested" event:
- In `PageHost`, we hit-test and produce a `ContextTarget`.
- In UI components (toolbar, ruler, status bar), the target is known by the component.

The resolved `MenuNode[]` is rendered by the same `SubMenu` component used for menu bar submenus, but through `ContextMenuRoot`.

### 18.3 Standard context menus

Text selection:
- Cut
- Copy
- Paste
- Font...
- Paragraph...
- Bullets and Numbering...
- separator
- Hyperlink...

Table cell:
- Cut / Copy / Paste
- Insert Rows Above / Below
- Delete Row / Column
- Merge Cells / Split Cells
- Table Properties...

Image:
- Cut / Copy / Paste
- Edit Picture
- Format Picture...
- Caption...

Misspelling (from spell checker):
- Top 5 suggestions (in bold)
- separator
- Ignore All
- Add to Dictionary
- AutoCorrect submenu
- separator
- Language...
- Spelling...

Hyperlink:
- Open Hyperlink
- Copy Hyperlink
- Edit Hyperlink
- Remove Hyperlink

Comment:
- Edit Comment
- Delete Comment
- Reply to Comment

Ruler / Status bar / Toolbar area also have context menus (matching Word 95).

---

## 19. Notifications / Toasts

### 19.1 ToastRoot

```tsx
interface ToastRootProps {
  placement?: 'bottomRight' | 'topRight' | 'bottomCenter';
  maxConcurrent?: number;           // default 3
  defaultDurationMs?: number;       // default 4000
}
```

Renders a stack of toasts from `uiStore.toasts`. Each toast slides in from the edge, auto-dismisses after `durationMs`, or is dismissed on click.

### 19.2 Usage

```ts
ui.pushToast({
  severity: 'success',
  title: 'Document saved',
  message: 'Report.docx saved to Documents',
  durationMs: 3000,
});
```

### 19.3 Styling

- 320 px wide, variable height.
- Colored left stripe (4 px): green/blue/yellow/red by severity.
- Close button (12×12 X) in top-right.
- Optional action button.

### 19.4 Accessibility

- `role="status"` for info/success, `role="alert"` for warning/error.
- Time-sensitive toasts have adjustable duration via prefs.
- Screen reader announces on appearance.

---

## 20. Accessibility architecture

### 20.1 WCAG 2.1 AA compliance checklist

- **1.4.3 Contrast**: Text vs. background ≥ 4.5:1 in all themes. Tested per theme with `axe-core`.
- **1.4.11 Non-text Contrast**: Icon strokes, borders ≥ 3:1.
- **1.4.12 Text Spacing**: UI does not break when user applies `*{ letter-spacing:0.12em; line-height:1.5 }`.
- **2.1.1 Keyboard**: Every feature available via keyboard.
- **2.1.2 No Keyboard Trap**: Dialogs trap deliberately; they release on close.
- **2.4.3 Focus Order**: Left-to-right top-to-bottom.
- **2.4.7 Focus Visible**: Focus ring never suppressed.
- **2.5.3 Label in Name**: Button visible text appears in `accessibleName`.
- **3.3.1 Error Identification**: Dialog validation shows inline error with `aria-invalid` and `aria-describedby`.
- **4.1.2 Name, Role, Value**: Every control has correct role, name, value.
- **4.1.3 Status Messages**: Toasts use `role="status"`/`role="alert"`.

### 20.2 Role map

| Component | Role |
|---|---|
| AppShell | `application` |
| MenuBar | `menubar` |
| Top menu item | `menuitem` |
| Submenu | `menu` |
| Menu item (regular) | `menuitem` |
| Menu item (radio) | `menuitemradio` |
| Menu item (checkbox) | `menuitemcheckbox` |
| Toolbar | `toolbar` |
| Toolbar button | `button` |
| Toolbar toggle button | `button` + `aria-pressed` |
| Toolbar dropdown | `button` + `aria-haspopup="menu"` |
| StatusBar | `status` |
| Status region | various; if clickable `button` |
| Dialog | `dialog` + `aria-modal="true"` |
| Modeless dialog | `dialog` + `aria-modal="false"` |
| PageHost | `document` |
| Tabs | `tablist` / `tab` / `tabpanel` |
| Ruler | `slider` group (tabs, indents act as sliders) |
| MDIWorkspace | `region` |
| MDIChild | `group` with aria-label |

### 20.3 Live regions

- `<div aria-live="polite" aria-atomic="false" class="sr-only" id="live-status">`: toasts summary, status bar updates.
- `<div aria-live="assertive" class="sr-only" id="live-alerts">`: dialog open/close, errors.

Utilities:

```ts
announce(message: string, urgency: 'polite' | 'assertive'): void;
```

### 20.4 Keyboard-only test plan

For every feature, a Playwright script verifies operability without a mouse. A CI test fails if any command can't be reached by keyboard.

### 20.5 Reduced motion

`@media (prefers-reduced-motion: reduce)` disables all CSS transitions and animations. Toast entrance becomes instant; dialog fade skipped.

### 20.6 Zoom independence

UI chrome zoom is separate from document zoom:
- CSS uses logical units; browser zoom (Ctrl+= on the native window) affects chrome.
- Document zoom (`zoomPct` in UIStore) only affects `PageHost`.

---

## 21. Keyboard layout awareness

### 21.1 Event normalization

```ts
export interface NormalizedKeyEvent {
  code: string;             // physical key, e.g. "KeyB"
  key: string;              // logical char, e.g. "b" or "B"
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  isComposing: boolean;
  repeat: boolean;
}

export function normalize(e: KeyboardEvent): NormalizedKeyEvent;
```

### 21.2 Accelerator matching

Accelerators are stored in canonical form (`Ctrl+Shift+F12`). Matching:

- **Letter accelerators** (`Ctrl+B`): match on `key` (case-insensitive). Locale-aware: works on Dvorak, AZERTY, etc. where the `B` key is in a different physical location.
- **Number accelerators** (`Ctrl+1`): match on `key` so digit row keys work regardless of layout.
- **Function keys** (`F1`, `F7`): match on `code` exclusively.
- **Punctuation accelerators** (`Ctrl+[`): match on `code` (rare in Word 95 but present).
- **Navigation keys** (`Home`, `End`, `PgUp`): match on `code`.

### 21.3 IME handling

`isComposing` suppresses accelerator handling during composition. We respect `compositionstart`, `compositionupdate`, `compositionend` events. During composition, only `Esc` is dispatched (to cancel) and `Enter` is dispatched (to commit; handled by IME itself).

### 21.4 Dead keys

Dead keys (accent composition) are ignored for accelerator matching; they are passed to the editor as text input.

---

## 22. Customization UI

### 22.1 CustomizeDialog

Three tabs:

**Toolbars tab:**
- List of toolbars with checkboxes (visible/hidden).
- `New...` button → create new toolbar dialog (name + template).
- `Rename...`, `Delete`, `Reset` buttons.
- `Toolbar Options` group: Large buttons, Show ScreenTips on toolbars, Show shortcut keys in ScreenTips, Color buttons, List font names in their font.

**Menus tab:**
- Menu bar ListBox: Built-in Menus, Custom Menus.
- `Rename...`, `Delete`, `Reset` buttons.
- `Change What's on Menu` area:
  - Category ListBox (File, Edit, View, ...).
  - Commands ListBox filtered to category.
  - Buttons: Add, Remove, Move Up, Move Down.

**Keyboard tab:**
- Categories ListBox (File, Edit, ...).
- Commands ListBox filtered to category.
- `Current Keys` ListBox: existing shortcuts for selected command.
- `Press new shortcut key` TextInput: user presses a key chord; shown as normalized accelerator.
- `Currently Assigned To` text: shows what command the new shortcut is bound to (if any).
- `Assign`, `Remove`, `Reset All` buttons.
- `Save changes in` ComboBox (Normal.dot or a template).

### 22.2 Data flow

- Changes accumulate in a local dialog state.
- `Close` (no OK/Cancel in this dialog, matching Word 95) commits to `PrefsStore`.
- PrefsStore change triggers:
  - KeyboardDispatcher recomputes keymap via `Keymap.merge(defaults, overrides)`.
  - MenuRegistry recomputes effective tree.
  - Toolbars re-render with new buttons.
- Undo of customization changes not supported; we offer `Reset` per scope.

### 22.3 Per-document customizations

Like Word 95, a user can save customizations in a template (not just Normal.dot). Customize dialog's `Save changes in` picker determines the scope. The engine reads/writes templates; UI only surfaces the picker.

---

## 23. Error / empty states

### 23.1 Document open failure

`DialogError` shown with:
- Icon (warning triangle).
- Title: `Error Opening Document`.
- Body: Description of error + truncated path.
- Details disclosure: stack trace or engine message.
- Buttons: OK, View Log.

### 23.2 Empty workspace

When no document is open, MDIWorkspace shows `StartPage`:

```tsx
interface StartPageProps {
  recentFiles: RecentFile[];
  templates: TemplateInfo[];
  tipOfTheDay: Tip;
  onOpenFile: (path: string) => void;
  onCreateFromTemplate: (id: string) => void;
  onOpenBrowse: () => void;
  onCreateBlank: () => void;
}
```

Three columns: Recent (20 most-recent files), Templates (grid with thumbnails), News (tip + Help shortcut). This is a modern touch; the user can disable it in Options to get a blank gray MDI workspace instead.

### 23.3 Network or file system errors

Unified error surface via `ErrorDialog`:

```ts
interface ErrorDetails {
  title: string;
  summary: string;
  code?: string;
  cause?: Error | string;
  remediation?: string[];        // bulleted steps
  logHref?: string;
}
```

---

## 24. Loading states

### 24.1 Document open

- For files > 1 MB, show a progress dialog with determinate bar.
- Under the hood, the engine streams parse events: `openProgress` (0-100%).
- Cancel button aborts the stream.

### 24.2 Background saves

- Status bar shows a small disk icon when `engine.isSaving`.
- No modal; non-blocking.
- On error, a toast with `Retry` action.

### 24.3 Re-pagination

- When the engine repaginates, pages that haven't been laid out show a placeholder with text "Paginating..." and a subtle animated shimmer.
- Placeholder cell is the same height as the final page (from a fast pre-estimate) to avoid layout shift.

### 24.4 Skeleton loaders

Dialogs with heavy data (Font dialog with thousands of fonts; FindFile with search results) show skeleton rows while data loads, then replace.

---

## 25. Animations

### 25.1 Catalogue

| Element | Animation | Duration | Easing |
|---|---|---|---|
| Menu open | instant | 0 ms | n/a |
| Menu close | instant | 0 ms | n/a |
| Dialog open | fade-in | 100 ms | ease-out |
| Dialog close | fade-out | 80 ms | ease-in |
| Toast slide | slide-in | 200 ms | ease-out |
| Toast dismiss | fade-out | 120 ms | linear |
| Toolbar dock | snap | 0 ms | n/a |
| Scroll thumb | instant | 0 ms | n/a |
| Tooltip appear | fade | 120 ms (after 500 ms delay) | linear |
| Caret blink | handled by layout engine | 530 ms period | n/a |
| Focus ring | instant | 0 ms | n/a |

### 25.2 Reduced motion

All animations clamp to 0 ms when `prefers-reduced-motion: reduce` is set or when `PrefsStore.general.provideFeedbackWithAnimation === false`.

---

## 26. Splash screen

### 26.1 Splash

```tsx
interface SplashScreenProps {
  version: string;
  productName: string;
  buildDate: string;
  minimumVisibleMs: number;     // default 800
  onClose: () => void;
}
```

Shown for at minimum 800 ms on cold boot, dismissed automatically after shell is ready. Can be disabled in Options > General > Show Splash on Start.

### 26.2 Visuals

A 420×240 px centered image matching the Word 95 splash aesthetic (our own artwork, not Microsoft's). Includes product name, version, build date, copyright.

---

## 27. Tip of the Day

### 27.1 Dialog

Shown on cold launch if enabled.

```tsx
interface TipOfTheDayDialogProps {
  tips: Tip[];
  seenTipIds: Set<string>;       // persisted in PrefsStore
  onClose: () => void;
  onToggleShowAtStartup: (show: boolean) => void;
}

export interface Tip {
  id: string;
  text: string;
  helpTopic?: string;
}
```

UI:
- Title: `Tip of the Day`.
- Lightbulb icon + current tip text.
- `Show Tips at Startup` checkbox (default on).
- `Next Tip`, `More Tips...`, `OK` buttons.
- `More Tips...` opens HelpViewer to tips chapter.

---

## 28. Help system

### 28.1 Architecture

```tsx
interface HelpViewerProps {
  initialTopic?: string;
  mode: 'window' | 'overlay' | 'whatIsThis';
}
```

- `window` mode: separate Electron window with toolbar (Back, Print, Options, Contents, Index, Find) and content pane.
- `overlay` mode: in-app modal dialog with smaller content.
- `whatIsThis` mode: a large tooltip pointing at a specific control.

### 28.2 Content

Content is HTML files shipped in `packages/ui/src/help/content/`, organized by topic. Each topic has a topic ID (e.g., `paragraphDialog.lineSpacing`). Context-sensitive Help maps each dialog/control to a topic.

### 28.3 F1 behavior

- F1 with no focus: open Help Contents.
- F1 with focus on a menu item: open topic for that menu.
- F1 with focus in a dialog: open topic for that dialog + focused control.
- Shift+F1 enters `whatIsThis` mode: cursor becomes a `?` arrow; click a UI element shows a tip.

### 28.4 WordPerfect Help

Optional (PrefsStore toggle). When enabled, pressing `F3` (WP help key) shows a translation panel explaining the Word equivalent, matching Word 95's WP Help emulator.

---

## 29. Virtualization

### 29.1 MDI children virtualization

- Only `activeId` + adjacent (next/prev in z-order) children are fully rendered.
- Non-active children render a placeholder that matches their bounds.
- On activation, the placeholder swaps to full.
- Internal state (scroll position, selection) is preserved in UIStore even when dormant.

### 29.2 Lazy dialogs

Every dialog is `React.lazy`:

```ts
const dialogLoaders = {
  font: () => import('./dialogs/FontDialog'),
  paragraph: () => import('./dialogs/ParagraphDialog'),
  // ...
};
```

On first open, the chunk is loaded (network or disk). Subsequent opens are instant.

### 29.3 Virtualized lists

- Font ComboBox dropdown: `react-window` for > 100 items.
- FindFile results: virtualized.
- StyleGallery: virtualized thumbnails.
- Macro list: virtualized.

### 29.4 Toolbar button icons

Icons are loaded only when their toolbar button first mounts and is visible. A `LazyIcon` wrapper uses `IntersectionObserver` for offscreen buttons (though typical toolbars fit in viewport).

---

## 30. Performance patterns

### 30.1 Memoization

- `React.memo` on MenuItem, ToolbarButton, RulerTab, RulerIndent, StatusRegion — always with explicit `arePropsEqual`.
- `useMemo` for expensive computations (merged menu tree, merged keymap).
- `useCallback` for handlers passed to memoized children.

### 30.2 Deferred rendering

- `useDeferredValue` for:
  - Status bar page/line/column (update lags behind typing).
  - Ruler paragraph indicators (lag behind caret by one frame).

### 30.3 Transitions

- `useTransition` for:
  - Opening heavy dialogs (Options, FindFile).
  - Switching MDI child (so the close animation of the previous child doesn't block).

### 30.4 Context splitting

Context providers are split by volatility:

| Provider | Volatility | Example |
|---|---|---|
| ThemeContext | low (changes on theme switch) | tokens |
| I18nContext | low | locale |
| FocusContext | medium | focus holder |
| KeyboardContext | medium | dispatcher |
| DndContext | low | DnD root |

High-frequency state (selection, caret position) is **not** in context; it's read via Zustand selectors.

### 30.5 Subscription slicing

Zustand selectors are narrow and use reference equality where possible:

```ts
const dirty = useUIStore(s => s.perChildUI[activeId]?.zoom);
```

For multi-field selections, use `shallow` equality:

```ts
const { zoom, viewMode } = useUIStore(s => ({ zoom: ..., viewMode: ... }), shallow);
```

### 30.6 Paint throttling

The selection visual frame counter (`UIStore.selectionVisualFrame`) advances on `requestAnimationFrame` only when the caret is blinking; it stops when focus is lost or when the user disables blink in Prefs. This prevents an idle 60 fps re-render loop.

### 30.7 Debouncing

- PrefsStore persistence debounced 250 ms.
- Window geometry persistence debounced 500 ms.
- Word count recalculation debounced 500 ms (unless Options dialog is open, where it's live).

---

## 31. Testing

### 31.1 Storybook

Storybook is the primary documentation and visual inventory for components.

- Every component in `packages/ui/src/**` has a `.stories.tsx` file.
- Stories live alongside components.
- Stories are typed via `@storybook/react` CSF 3.0.
- Themes toggle via Storybook toolbar addon.
- Stories include interaction tests via `@storybook/test` (e.g., click MenuItem, verify submenu opens).

### 31.2 Accessibility tests

- Storybook `a11y` addon runs axe-core per story.
- CI fails on violations of WCAG 2.1 AA severity.
- Additional dedicated accessibility tests with `@axe-core/playwright` exercise keyboard-only flows.

### 31.3 Component unit tests

- React Testing Library for every component with behavior.
- Mock EngineBridge: `testing/mockEngine.ts` provides a simple fake with controllable event emission.
- Test files: `*.test.tsx`, colocated.

### 31.4 Visual regression

- Chromatic publishes a baseline per commit.
- Failing stories block PR merge.
- Baseline approved by design reviewer.

### 31.5 End-to-end

- Playwright scripts live in `e2e/` at repo root.
- UI package contributes page-object helpers: `MenuBarPO`, `FontDialogPO`, etc.

### 31.6 Property-based tests

- Keymap resolver tested with `fast-check`: generate random accelerator sequences; verify idempotent normalization.
- MenuTree merging tested likewise.

---

## 32. Directory layout (detailed)

Already outlined in § 1.2. Additional rules:

- **Public API**: only `packages/ui/src/index.ts` exports. Every other file is internal unless re-exported.
- **Story-only code**: lives next to the component; no separate `stories/` directory.
- **Fixtures**: `packages/ui/src/testing/fixtures/` for JSON-like test data.
- **Assets**: fonts in `src/fonts/`, icons in `src/icons/packs/`. Both resolved via Vite's asset pipeline.

---

## 33. Interop with engine

### 33.1 Bridge setup

```ts
// packages/ui/src/stores/documentStoreBridge.ts

let bridge: EngineBridge | null = null;

export function setEngineBridge(b: EngineBridge): void {
  if (bridge) throw new Error('Engine bridge already set');
  bridge = b;
}

export function getEngineBridge(): EngineBridge {
  if (!bridge) throw new Error('Engine bridge not initialized');
  return bridge;
}
```

Set once at app startup, typically in the App component or in `main.tsx` before rendering.

### 33.2 Command dispatch through hooks

```ts
// useCommand
export function useCommand(commandId: CommandId, args?: CommandArgs) {
  const docId = useActiveDocId();
  const bridge = getEngineBridge();
  const snap = useDocument(docId ?? '', s => s, Object.is);

  return {
    run: useCallback(() => bridge.dispatchCommand(docId ?? '', commandId, args), [docId, commandId, args]),
    enabled: useMemo(() => bridge.isCommandEnabled(docId ?? '', commandId, args), [snap.version]),
    checked: useMemo(() => bridge.isCommandChecked(docId ?? '', commandId, args), [snap.version]),
    label: bridge.getCommandLabel(commandId),
    accelerator: useKeymap().getAcceleratorFor(commandId),
    description: bridge.getCommandDescription(commandId),
  };
}
```

### 33.3 Undo / redo

Every UI action that changes document state is a command. Undo/redo are themselves commands (`edit.undo`, `edit.redo`) that operate on the engine's history stack. The UI does not track undo state directly.

### 33.4 Plugin contributions

Plugins contribute:
- Menu items
- Toolbar buttons (with an optional custom rendering hook)
- Dialog sub-panels (injected into existing dialogs' tabs, with a declared schema)
- Context menu items

UI exposes registration APIs; plugins are loaded by the engine and emit `registerUIContribution` events that the UI listens to.

```ts
export interface UIContribution {
  id: string;
  kind: 'menu' | 'toolbar' | 'dialog' | 'contextMenu' | 'statusBar' | 'keymap';
  payload: MenuContribution | ToolbarContribution | DialogContribution | ContextMenuContribution | StatusBarContribution | KeymapContribution;
}
```

---

## 34. Component-by-component specs

This section provides Storybook-style specifications for the most important components.

### 34.1 AppShell

```tsx
export interface AppShellProps {
  children: React.ReactNode;
  showTitleBar?: boolean;         // false on macOS with unified title
  showStatusBar?: boolean;        // driven by PrefsStore.view.showStatusBar
}

export function AppShell({ children, showTitleBar = true, showStatusBar = true }: AppShellProps) {
  // ... grid layout implementation
}
```

Layout model (CSS Grid):

```css
.appShell {
  display: grid;
  grid-template-rows:
    var(--titleBarHeight, 0)   /* titleBar */
    var(--menuBarHeight)        /* menuBar */
    auto                        /* toolbarStack */
    1fr                         /* workspaceArea */
    var(--statusBarHeight, 0);  /* statusBar */
  height: 100vh;
  overflow: hidden;
}
```

**Accessibility**: contains `role="application"` on the outer container; skip-links (`<a href="#main">Skip to document</a>`) hidden until focused.

### 34.2 TitleBar

- Renders OS-aware.
- Drags move the window (via `-webkit-app-region: drag`).
- Window buttons only on Windows/Linux.
- macOS reserves 80 px at left for traffic lights.
- Displays active document's title + `"Microsoft Word"` app name + `"*"` if dirty + `" (Read-Only)"` if protected.

```tsx
interface TitleBarProps {
  activeDocTitle: string | null;
  dirty: boolean;
  readOnly: boolean;
  appName: string;
  platform: 'win' | 'mac' | 'linux';
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
}
```

### 34.3 MenuBar

Props:
```tsx
interface MenuBarProps {
  tree: MenuTree;
  maximizedChildAdornments?: {
    docIcon: IconId;
    docTitle: string;
    onRestore: () => void;
    onClose: () => void;
  } | null;
}
```

- When `maximizedChildAdornments` non-null, left side shows the doc icon, right side shows min/restore/close buttons for the MDI child.
- Implements full keyboard model (§ 6.2).

### 34.4 Toolbar

Props already listed in § 7.3.

Behavior notes:
- `role="toolbar"` + `aria-label="{displayName}"`.
- Arrow keys move between buttons; Home/End jump to ends.
- Double-click on gripper docks/undocks (Word 95 behavior).

### 34.5 ToolbarCombo

A combo box inside a toolbar (zoom, font name, font size, style).

- `width` prop controls input width.
- `items` array for drop-down.
- Editable: arrow keys walk through list; Enter commits; Esc cancels.
- On commit, dispatches `commandId` with the value.

### 34.6 HorizontalRuler and VerticalRuler

Already specified in § 8.

### 34.7 StatusBar

Already specified in § 10.

### 34.8 MDIChild

Props:

```tsx
interface MDIChildProps {
  state: MDIChildState;
  active: boolean;
  arrangement: 'cascade' | 'tile' | 'free';
  onActivate: () => void;
  onClose: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onRestore: () => void;
  onResize: (bounds: Rect) => void;
  onMove: (pos: { x: number; y: number }) => void;
}
```

Handles dragging (own title bar), resizing (8-direction grip), scroll, ruler row, child menu (Ctrl+Space).

### 34.9 FontDialog (example full spec)

```tsx
interface FontDialogProps {
  docId: string;
  initialValues: FontDialogValues;
  onOk: (values: FontDialogValues) => void;
  onCancel: () => void;
  onDefault: (values: FontDialogValues) => void;
}

interface FontDialogValues {
  fontName: string;
  fontStyle: 'regular' | 'italic' | 'bold' | 'boldItalic';
  fontSizePt: number;
  underline: 'none' | 'single' | 'wordsOnly' | 'double' | 'dotted';
  color: Color | 'auto';
  strikethrough: boolean;
  superscript: boolean;
  subscript: boolean;
  hidden: boolean;
  smallCaps: boolean;
  allCaps: boolean;
  characterSpacing: { style: 'normal' | 'expanded' | 'condensed'; byPt: number };
  position: { style: 'normal' | 'raised' | 'lowered'; byPt: number };
  kerning: { enabled: boolean; fromPt: number };
}
```

Structure:
```
DialogFrame title="Font"
  Tabs
    Tab "Font"
      Grid 3 cols
        GroupBox "Font"
          ComboBox (font names, virtualized)
        GroupBox "Font Style"
          ListBox Regular/Italic/Bold/Bold Italic
        GroupBox "Size"
          ComboBox (8..72)
      Grid 2 cols
        GroupBox "Underline"
          ComboBox
        GroupBox "Color"
          ColorPicker (auto, 16 colors, more...)
      GroupBox "Effects"
        Checkbox Strikethrough
        Checkbox Superscript
        Checkbox Subscript
        Checkbox Hidden
        Checkbox Small caps
        Checkbox All caps
      GroupBox "Preview"
        PreviewCanvas (samples the current settings)
      Row of buttons: Default..., OK, Cancel, Help
    Tab "Character Spacing"
      Grid
        GroupBox "Spacing"
          ComboBox Normal/Expanded/Condensed
          NumberSpinner by (pt)
        GroupBox "Position"
          ComboBox Normal/Raised/Lowered
          NumberSpinner by (pt)
        GroupBox "Kerning for fonts"
          Checkbox + NumberSpinner Points and above
      PreviewCanvas
      Buttons
```

Validation (Zod):

```ts
const FontDialogSchema = z.object({
  fontName: z.string().min(1),
  fontSizePt: z.number().min(1).max(1638).step(0.5),
  characterSpacing: z.object({
    style: z.enum(['normal','expanded','condensed']),
    byPt: z.number().min(-2000).max(2000),
  }),
  // ...
});
```

OK flow: validate → dispatch `format.applyFont` → close.

### 34.10 ParagraphDialog, PageSetupDialog, PrintDialog, etc.

Follow the same pattern: Props = `{ docId, initialValues, onOk, onCancel, ...optional special buttons }`, a structured JSX tree, a Zod schema, and a submit command. Spec pages for each dialog exist in Storybook.

---

## 35. Detailed TS interfaces (central collection)

This section consolidates the public TypeScript interfaces referenced across the doc.

### 35.1 Theme tokens

See § 12.1.

### 35.2 MenuNode

See § 6.1.

### 35.3 ToolbarNode + Button

See § 7.1.

### 35.4 Dialog props

```ts
export interface DialogPropsMap {
  font: FontDialogProps;
  paragraph: ParagraphDialogProps;
  pageSetup: PageSetupDialogProps;
  print: PrintDialogProps;
  findReplace: FindReplaceDialogProps;
  options: OptionsDialogProps;
  bulletNumbering: BulletNumberingDialogProps;
  bordersShading: BordersShadingDialogProps;
  columns: ColumnsDialogProps;
  break: BreakDialogProps;
  changeCase: ChangeCaseDialogProps;
  dropCap: DropCapDialogProps;
  style: StyleDialogProps;
  styleGallery: StyleGalleryDialogProps;
  field: FieldDialogProps;
  symbol: SymbolDialogProps;
  bookmark: BookmarkDialogProps;
  crossReference: CrossReferenceDialogProps;
  indexTables: IndexTablesDialogProps;
  formula: FormulaDialogProps;
  tableInsert: TableInsertDialogProps;
  cellHeightWidth: CellHeightWidthDialogProps;
  tableSort: TableSortDialogProps;
  mailMergeHelper: MailMergeHelperDialogProps;
  envelopeLabels: EnvelopeLabelsDialogProps;
  protectDocument: ProtectDocumentDialogProps;
  revisions: RevisionsDialogProps;
  compareVersions: CompareVersionsDialogProps;
  mergeDocuments: MergeDocumentsDialogProps;
  macro: MacroDialogProps;
  customize: CustomizeDialogProps;
  thesaurus: ThesaurusDialogProps;
  spelling: SpellingDialogProps;
  grammar: GrammarDialogProps;
  wordCount: WordCountDialogProps;
  summaryInfo: SummaryInfoDialogProps;
  findFile: FindFileDialogProps;
  autoCorrect: AutoCorrectDialogProps;
  autoFormat: AutoFormatDialogProps;
  pasteSpecial: PasteSpecialDialogProps;
  tipOfTheDay: TipOfTheDayDialogProps;
  help: HelpViewerProps;
  about: AboutDialogProps;
  confirmClose: ConfirmCloseDialogProps;
  confirmOverwrite: ConfirmOverwriteDialogProps;
  error: ErrorDialogProps;
}

export type DialogPropsFor<K extends keyof DialogPropsMap> = DialogPropsMap[K];
```

### 35.5 FocusManager API

See § 5.4.

### 35.6 KeyboardDispatcher + Keymap

See § 5.1.

### 35.7 UIStore shape

See § 3.3.

### 35.8 PrefsStore shape

See § 3.4.

### 35.9 MDI state

```ts
export interface MDIState {
  children: MDIChildState[];
  activeId: string | null;
  arrangement: 'cascade' | 'tile' | 'free';
  maxZIndex: number;
}
```

### 35.10 Command surface

```ts
export interface CommandRegistryAPI {
  register(desc: CommandDescriptor): () => void;
  get(id: CommandId): CommandDescriptor | undefined;
  categories(): string[];
  commandsByCategory(cat: string): CommandDescriptor[];
  search(query: string): CommandDescriptor[];
}

export interface CommandDescriptor {
  id: CommandId;
  category: string;
  label: string;
  description: string;
  icon?: IconId;
  defaultAccelerators: AcceleratorString[];
  enabledPredicate?: (ctx: CommandContext) => boolean;
  checkedPredicate?: (ctx: CommandContext) => boolean;
}
```

---

## 36. Implementation roadmap

The UI package is large. We staged its construction in the following rough order (documentation for future contributors):

1. **Primitives**: Button, Checkbox, Radio, TextInput, ComboBox, ListBox, GroupBox, Tabs, Tooltip. Storybook stories for each.
2. **Theme**: tokens + Word 95 theme; ThemeProvider; CSS variable bridge.
3. **Icons**: Word 95 pack (250 SVGs); IconRegistry; Icon component.
4. **Focus**: FocusManager + Provider; useFocusTrap; useFocusRequest.
5. **Keyboard**: Keymap defaults; KeyboardDispatcher; chord support; integration with FocusManager.
6. **Menu**: MenuBar + SubMenu + MenuItem; navigation; mnemonic handling.
7. **Toolbar**: ToolbarStack + Toolbar + ToolbarButton + ToolbarCombo; DockManager.
8. **Ruler**: HorizontalRuler + VerticalRuler with drag interactions.
9. **Status bar**: StatusBar + StatusRegion with reactive slots.
10. **MDI**: MDIWorkspace + MDIChild with arrangements.
11. **Dialogs core**: DialogRoot + DialogManager + DialogFrame + a few representative dialogs (Font, Paragraph, PageSetup).
12. **Remaining dialogs**: remaining Word 95 dialogs.
13. **Context menus**: ContextMenuRoot + contextMenuRegistry; integration with PageHost.
14. **Toasts**: ToastRoot.
15. **Splash + Tip of the Day**.
16. **Help system**: HelpViewer + content.
17. **Customize**: CustomizeDialog with Toolbars / Menus / Keyboard tabs.
18. **Polish**: performance audits, accessibility audits, visual regression.

---

## 37. Appendix — Mapping Word 95 features to UI components

This appendix ensures coverage of every Word 95 feature visible in the UI. The engine owns the feature; the UI provides the surface.

| Word 95 feature | Primary UI surface | Secondary |
|---|---|---|
| Open file | FileDialog (via main-process IPC native picker) | MenuBar File > Open |
| Recent files | Menu File > recents, StartPage Recent column | |
| Save, Save As | Native save picker | MenuBar, toolbar, Ctrl+S |
| Print, Print Preview | PrintDialog, PrintPreviewMode (view mode) | |
| Exit | app.quit command | |
| Cut/Copy/Paste | Clipboard commands via KeyboardDispatcher | context menu, toolbar |
| Paste Special | PasteSpecialDialog | |
| Undo/Redo | engine commands via toolbar dropdowns (multi-undo) | keyboard |
| Find/Replace/Goto | FindReplaceDialog (modeless), GoToDialog (modal) | |
| AutoText | AutoTextDialog (subset of AutoCorrectDialog) | |
| Normal/Outline/Page Layout/Master Document views | ViewMode radio in UIStore; Menu View | |
| Toolbar toggle | MenuBar View > Toolbars submenu | ContextMenu on toolbar area |
| Ruler toggle | MenuBar View > Ruler | |
| Header/Footer | HeaderFooterMode + HeaderFooterToolbar | |
| Footnotes/Endnotes | FootnoteDialog (Insert > Footnote) | |
| Annotation/Comments | AnnotationPane below PageHost | |
| Page Setup | PageSetupDialog | |
| Line Numbers | LineNumbersDialog (nested from PageSetup) | |
| Insert Break | BreakDialog | |
| Insert Page Numbers | PageNumbersDialog | |
| Insert Date/Time | DateTimeDialog | |
| Insert Symbol | SymbolDialog | |
| Insert Field | FieldDialog | |
| Insert Form Field | FormFieldDialog | |
| Insert Caption | CaptionDialog | |
| Insert Cross-reference | CrossReferenceDialog | |
| Insert Index and Tables | IndexTablesDialog | |
| Insert File | File picker + options | |
| Insert Frame | Frame mode | |
| Insert Picture | File picker | |
| Insert Object | ObjectDialog (OLE lineage; limited in modern build) | |
| Insert Database | DatabaseDialog (mail merge source) | |
| Format Font | FontDialog | |
| Format Paragraph | ParagraphDialog | |
| Format Tabs | TabsDialog | |
| Format Borders and Shading | BordersShadingDialog | |
| Format Columns | ColumnsDialog | |
| Format Change Case | ChangeCaseDialog | |
| Format Drop Cap | DropCapDialog | |
| Format Bullets and Numbering | BulletNumberingDialog | |
| Format Heading Numbering | HeadingNumberingDialog | |
| Format AutoFormat | AutoFormatDialog | |
| Format Style | StyleDialog | |
| Format Style Gallery | StyleGalleryDialog | |
| Format Frame | FrameDialog | |
| Format Picture | PictureDialog | |
| Format Drawing Object | DrawingObjectDialog | |
| Tools Spelling | SpellingDialog | |
| Tools Grammar | GrammarDialog | |
| Tools Thesaurus | ThesaurusDialog | |
| Tools Hyphenation | HyphenationDialog | |
| Tools Language | LanguageDialog | |
| Tools Word Count | WordCountDialog | |
| Tools Envelopes and Labels | EnvelopeLabelsDialog | |
| Tools Mail Merge | MailMergeHelperDialog | |
| Tools Protect Document | ProtectDocumentDialog | |
| Tools Revisions | RevisionsDialog | |
| Tools Merge Revisions | MergeDocumentsDialog | |
| Tools Macro | MacroDialog (preserves but does not execute) | |
| Tools Customize | CustomizeDialog | |
| Tools Options | OptionsDialog (many tabs) | |
| Table Insert Table | TableInsertDialog | |
| Table Insert/Delete Cells/Rows/Columns | commands via menu + context | |
| Table Merge Cells / Split Cells | commands | |
| Table Cell Height and Width | CellHeightWidthDialog | |
| Table Table AutoFormat | TableAutoFormatDialog | |
| Table Sort | TableSortDialog | |
| Table Formula | FormulaDialog | |
| Table Split Table | command | |
| Table Gridlines toggle | View option | |
| Window New Window | command | |
| Window Arrange All / Split / Remove Split | commands | |
| Window list of open docs | dynamic menu | |
| Help Contents | HelpViewer | |
| Help Examples and Demos | HelpViewer demos section | |
| Help Index | HelpViewer index | |
| Help Microsoft Word Help Topics | HelpViewer | |
| Help WordPerfect Help | WordPerfectHelpDialog | |
| Help Technical Support | HelpViewer topic | |
| Help About | AboutDialog | |

---

## 38. Appendix — Storybook story conventions

### 38.1 Per-component

```tsx
// Button.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  title: 'Primitives/Button',
  component: Button,
  parameters: { layout: 'centered', theme: 'word95' },
  argTypes: { kind: { control: 'select', options: ['default','cancel','normal','toolbar'] } },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Default: Story = { args: { label: 'OK', kind: 'default', onClick: () => {} } };
export const Cancel: Story = { args: { label: 'Cancel', kind: 'cancel', onClick: () => {} } };
export const Disabled: Story = { args: { label: 'OK', kind: 'default', disabled: true } };
export const WithIcon: Story = { args: { label: 'Save', icon: 'file.save' } };
export const Pressed: Story = { args: { label: 'Bold', kind: 'toolbar' }, play: async ({ canvasElement }) => { /* press */ } };
```

### 38.2 Interaction tests

Stories include `play` functions using `@storybook/test` primitives for click, type, keypress. These serve as both docs and smoke tests.

### 38.3 Themes

A Storybook decorator wraps every story in a `ThemeProvider`. A toolbar control toggles between Word 95 / Modern Light / Modern Dark / High Contrast.

### 38.4 Mock engine

Every story that needs document state uses `renderWithProviders` (a test utility) which seeds a `mockEngine`. Stories can preconfigure mockEngine state to reproduce edge cases.

---

## 39. Appendix — Command catalog contribution table

A small extract showing how commands surface across UI:

| Command ID | Menu | Toolbar (Standard) | Toolbar (Formatting) | Accelerator | Context menu |
|---|---|---|---|---|---|
| `file.new` | File > New... | New button | | Ctrl+N | |
| `file.open` | File > Open... | Open button | | Ctrl+O | |
| `file.save` | File > Save | Save button | | Ctrl+S | |
| `edit.cut` | Edit > Cut | Cut button | | Ctrl+X | text |
| `edit.copy` | Edit > Copy | Copy button | | Ctrl+C | text |
| `edit.paste` | Edit > Paste | Paste button | | Ctrl+V | text |
| `edit.undo` | Edit > Undo | Undo dropdown | | Ctrl+Z | |
| `format.bold` | Format > Font... (in Font style) | | Bold button | Ctrl+B | text |
| `format.italic` | Format > Font... | | Italic button | Ctrl+I | text |
| `format.underline` | Format > Font... | | Underline button | Ctrl+U | text |
| `format.alignLeft` | Format > Paragraph... | | Align Left button | Ctrl+L | text |
| `format.alignCenter` | Format > Paragraph... | | Align Center | Ctrl+E | text |
| `format.alignRight` | Format > Paragraph... | | Align Right | Ctrl+R | text |
| `format.justify` | Format > Paragraph... | | Justify | Ctrl+J | text |
| `insert.hyperlink` | Insert > Hyperlink... | | | Ctrl+K | text |
| `insert.pageBreak` | Insert > Break... | | | Ctrl+Enter | |
| `view.normal` | View > Normal | | | Alt+Ctrl+N | |
| `view.outline` | View > Outline | | | Alt+Ctrl+O | |
| `view.pageLayout` | View > Page Layout | | | Alt+Ctrl+P | |
| `tools.spelling` | Tools > Spelling | Spelling button | | F7 | |
| `tools.thesaurus` | Tools > Thesaurus... | | | Shift+F7 | text |
| `tools.wordCount` | Tools > Word Count... | | | Ctrl+Shift+G | |
| `table.insertRow` | Table > Insert Rows | | | | table |
| `table.deleteRow` | Table > Delete Rows | | | | table |
| `window.next` | Window > 1..N | | | Ctrl+F6 | |

---

## 40. Appendix — Example component implementation sketch

The following is an illustrative (non-final) sketch showing how pieces fit together in code. It is not exhaustive and is intended as an onboarding cross-reference.

```tsx
// packages/ui/src/menu/MenuBar.tsx

import * as React from 'react';
import { useUIStore } from '../stores/uiStore';
import { useMenuTree } from '../hooks/useMenuTree';
import { useKeymap } from '../keyboard/useKeymap';
import { MenuItem } from './MenuItem';
import { SubMenu } from './SubMenu';
import { useFocus } from '../focus/useFocus';
import { useCommand } from '../hooks/useCommand';
import styles from './MenuBar.module.css';

export interface MenuBarProps {
  docId: string | null;
}

export function MenuBar({ docId }: MenuBarProps) {
  const tree = useMenuTree(docId);
  const nav = useUIStore(s => s.menuNavigation);
  const openMenu = useUIStore(s => s.openMenu);
  const closeMenu = useUIStore(s => s.closeMenu);
  const setMnemonicsVisible = useUIStore(s => s.setMnemonicsVisible);
  const barRef = React.useRef<HTMLDivElement>(null);

  // Alt key handling
  React.useEffect(() => {
    let altDown = false;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Alt' && !e.repeat) altDown = true;
      if (altDown && e.key !== 'Alt') altDown = false;
      if (e.key === 'Alt') setMnemonicsVisible(true);
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === 'Alt' && altDown) {
        // solo alt press => focus menu
        openMenu([tree.root[0]!.id], 'keyboard');
        altDown = false;
      }
      if (e.key === 'Alt') setMnemonicsVisible(false);
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [openMenu, setMnemonicsVisible, tree]);

  const activeTopId = nav.activePath[0] ?? null;

  return (
    <div
      ref={barRef}
      role="menubar"
      aria-label="Application menu"
      className={styles.menuBar}
    >
      {tree.root.map(node => (
        <MenuItem
          key={node.id}
          node={node}
          depth={0}
          activePath={nav.activePath}
          mnemonicsVisible={nav.mnemonicsVisible}
          onActivate={() => openMenu([node.id], 'mouse')}
          onHover={() => { if (activeTopId !== null && activeTopId !== node.id) openMenu([node.id], 'mouse'); }}
          onSubmenuOpen={() => {}}
        />
      ))}
      {activeTopId && (
        <SubMenu
          parentPath={[activeTopId]}
          nodes={tree.root.find(n => n.id === activeTopId)?.children ?? []}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}
```

---

## 41. Appendix — Risk log

- **Font fidelity**: Shipping a TTF replacement for MS Sans Serif risks imperfect match at 100% zoom. Mitigation: ship a bitmap-embedded TTF with exact 11 px strike; extensive visual regression.
- **MDI on Linux**: HTML DnD + pixel-level window chrome may be choppy under Wayland. Mitigation: optional native frame on Wayland with degraded parity (documented).
- **Dialog count**: 40+ dialogs is a lot of surface; risk of drift between dialogs and engine state. Mitigation: every dialog's initial values pulled from `useDocument`; submit via typed command; Zod schemas.
- **Accessibility regressions**: 40+ dialogs and many composite components mean accessibility regressions are likely without CI enforcement. Mitigation: axe-core in CI, dedicated a11y sprint, manual screen-reader test matrix.
- **Performance**: MDI virtualization + engine subscriptions + zoom transforms can collide. Mitigation: performance budget per panel, React Profiler captures in CI.
- **Icon rights**: commissioned SVGs must not infringe Microsoft's bitmaps. Mitigation: licensed-to-this-project contract with the artist; distinctive differences documented.

---

## 42. Appendix — Telemetry hooks (optional, off by default)

If the user opts in (Options > General > Send usage data), the UI emits events:
- `ui.menu.opened`, `ui.menu.command`, `ui.dialog.opened`, `ui.dialog.submitted`, `ui.toolbar.buttonPressed`, `ui.theme.changed`, `ui.customize.saved`.

All events are anonymized; no document content leaves the machine. Telemetry is strictly off by default.

---

## 43. Summary

This document specifies the React UI component system for a Word 95-parity word processor. The UI is a cohesive ecosystem of primitives (buttons, checkboxes, text inputs), composite components (menus, toolbars, rulers, status bar, dialogs, MDI workspace), and infrastructure (theming, keyboard dispatcher, focus manager, icon registry, stores).

The architecture is organized around four cornerstones:

1. **Composition of primitives** — every complex component is built from small, typed, accessible primitives.
2. **Three-store state model** — DocumentStore (engine-owned), UIStore (ephemeral), PrefsStore (durable).
3. **Command bus discipline** — every mutation goes through the engine's command dispatch; the UI never mutates document state directly.
4. **Themability + accessibility** — CSS custom properties + tokens enable Word 95 fidelity alongside modern themes; WCAG 2.1 AA is enforced in CI.

Storybook is the living spec; Chromatic guards visual regressions; Playwright guards end-to-end keyboard paths; React Testing Library guards component behavior. Together these produce a UI layer that is both historically faithful and modernly maintained.
