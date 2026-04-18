# UX & Interaction Design Specification

## Scope and Intent

This document specifies the visible surface and tactile interaction model of the application. The application is a desktop word processor that must achieve **true feature parity with Microsoft Word for Windows 95 (version 7.0, a.k.a. "Word 95")** and that ships on Windows 10+, macOS 11+, and Linux, implemented with React + Electron + TypeScript.

The target audience for this spec is an implementing engineer who has **never used Word 95**. Every behavior, cursor, shortcut, color, and pixel size that matters is stated here. When a source disagrees with itself, the more conservative (more faithful) interpretation is chosen and a note explains why.

Units:

- "px" means CSS pixels at 100% OS scale (device-independent); implementations must pixel-snap bitmap icons at integer zoom factors.
- "pt" means typographic point (1/72 in).
- Colors are hex sRGB unless a Windows system color alias is indicated (e.g., `COLOR_3DFACE`).

Source references (used throughout and cited in Appendix A):

- WinWorldPC Word 95 archive (screenshots)
- Internet Archive "Running Microsoft Word 7 for Windows 95" (Microsoft Press, 1995)
- "The Windows Interface Guidelines for Software Design" (Microsoft Press, 1995)
- Microsoft Support KB articles on Word 95 shortcuts (later consolidated in KB290938 etc.)
- Internet Archive mirror of the Word 95 Quick Preview and Help files

---

## 1. Application Shell — Multiple Document Interface (MDI)

### 1.1 Overview

Word 95 uses the classic Windows MDI pattern: a single outer **application frame** (the "parent frame") contains zero or more **child document windows** inside an inner area called the **MDI client area** (the "workspace"). Child windows are real OS-style windows for all intents and purposes, but they are constrained to the workspace — they cannot be dragged outside the parent frame.

We implement **in-renderer MDI**: the MDI parent frame is a single Electron `BrowserWindow`; the workspace and child windows are React components with CSS chrome styled to look like Windows 95 windows. This choice is deliberate so that we control pixel-level fidelity (bevel widths, caption heights, button glyphs) across all three OSes.

### 1.2 Window model

```
+-------------------------------------------------------------------+
| [icon] Microsoft Word - [Document1]              [_] [□] [X]      |  <- Parent frame title bar
+-------------------------------------------------------------------+
| File  Edit  View  Insert  Format  Tools  Table  Window  Help      |  <- Menu bar
+-------------------------------------------------------------------+
| [Std toolbar icons........................................]       |  <- Toolbar row 1
| [Formatting toolbar icons.................................]       |  <- Toolbar row 2
+-------------------------------------------------------------------+
| Ruler (optional)                                                  |
+-------------------------------------------------------------------+
|  +-------------------------------------------------------+   [▲] |
|  | [ic] Document1                        [_] [□] [X]     |   [█] |
|  +-------------------------------------------------------+   [▼] |
|  |                                                       |       |
|  |                  MDI workspace area                   |       |
|  |  (contains one or more child document windows        |       |
|  |   arranged, overlapped, or minimized)                |       |
|  |                                                       |       |
|  |                                                       |       |
|  +-------------------------------------------------------+       |
|                                                                   |
+-------------------------------------------------------------------+
| Page 1 Sec 1 1/1 | At 1"  Ln 1  Col 1 | REC MRK EXT OVR | English |  <- Status bar
+-------------------------------------------------------------------+
```

- The outer frame hosts **menu bar, toolbars, ruler, status bar**, and **workspace**.
- Child document windows (class `MDIChild`) live inside the workspace and cannot move outside it.
- When **exactly one child** exists and is **maximized**, its caption is merged into the parent's title bar: the title reads `Microsoft Word - [Document1]`, and the child's minimize/restore/close buttons move into the **right end of the menu bar**, right-aligned, in that order: `[_] [□] [X]`.
- When the child is un-maximized (restored), the caption returns to the child window and the parent title bar reverts to `Microsoft Word`.

### 1.3 Child document window chrome

A child document window has, top to bottom:

1. **Child title bar** — 18 px high; background gradient (when active) or flat gray (when inactive). Contains:
   - **Control-box icon** at left (16×16). Left-click shows the system menu (see 1.4). Double-click closes the window.
   - **Title text** — `Document1` (untitled) or `Filename.docx` — Tahoma-substitute 8 pt, white when active, light gray when inactive.
   - **Minimize button** — 16×14 at right-1 (−3 from right edge of title bar). Glyph: a 7×2 horizontal line near the bottom.
   - **Maximize/Restore button** — 16×14, glyph shows either a single outlined rectangle (maximize) or two overlapped rectangles (restore).
   - **Close button** — 16×14, glyph shows a 7×7 "X".
   - Buttons are bevelled (raised 1 px light top+left, 1 px dark bottom+right on the outside; inverted 1 px inner).
2. **Vertical scroll bar** along the right edge of the child's client area.
3. **Horizontal scroll bar** along the bottom. The horizontal scroll bar hosts the **view switcher** (Normal / Outline / Page Layout icons) at its far left, in a 16×16 tri-button group.
4. **Client area** — white (or COLOR_WINDOW). Hosts the rendered document canvas (page-shaped white rectangles on a gray background in Page Layout view, or a single continuous text stream in Normal view).

Active vs inactive child:

- Active child title bar: system "active caption" gradient; text white.
- Inactive child title bar: flat COLOR_INACTIVECAPTION gray; text dark gray.

Focus indicator for the **document content** is the blinking caret in the client area; the title bar chrome alone does not indicate which child has text focus (focus always belongs to the active child in MDI).

### 1.4 Control-box system menu (per-window)

Clicking the control-box icon at the top-left of a window — either the parent frame or a child — opens a Win95-style system menu. Items:

- Restore (Alt+F5 in parent; Ctrl+F5 in child)
- Move (Alt+F7 in parent; Ctrl+F7 in child)
- Size (Alt+F8 in parent; Ctrl+F8 in child)
- Minimize (Alt+F9 in parent; Ctrl+F9 in child). Note: Alt+F9 in the document area conflicts with "toggle field codes"; the system menu is only reached via Alt+Space (parent) or Alt+Hyphen (child), so this is fine in practice.
- Maximize (Ctrl+F10 in child)
- Close (Alt+F4 in parent; Ctrl+F4 in child; Ctrl+W also closes the document)
- Next Window (Ctrl+F6 in child)

Keyboard to open: Alt+Space (parent) or Alt+Hyphen (Alt+`-`) (active child).

### 1.5 MDI workspace behaviors

- **Opening a new document** (`File → New`, Ctrl+N) creates a new child at the default size (roughly 80% of workspace, cascaded offset from the last).
- **Cascading new children**: each newly created or opened window is positioned 24 px right and 24 px down from the previous child's top-left, wrapping when it would go off the workspace bottom.
- **Arrange All** (`Window → Arrange All`): tiles all non-minimized children horizontally (side by side if workspace is wider than tall, otherwise vertically) filling the full workspace minus the horizontal strip at the bottom reserved for minimized icons (see 1.6). Each tile gets an equal share.
- **Cascade** (`Window → Cascade`, not in default Window menu in Word 95 — Word 95's Window menu has only New Window, Arrange All, Split, and the document list; we include Cascade as a v1 extension for parity with every other MDI app of the era). _Optional; if omitted, ensure Arrange All is present._
- **Maximize / minimize / restore** each child via its chrome buttons or the system menu.
- **Window list in Window menu**: the Window menu lists every open document, numbered 1–9, with a check by the active one. Keyboard: Alt+W, then digit.
- **Next / previous window**: Ctrl+F6 / Ctrl+Shift+F6 cycles forward / backward.
- **New Window** (`Window → New Window`): opens a second child viewing the **same document**; the title becomes `Filename:2` and the original becomes `Filename:1`. Edits in one reflect live in the other (same underlying model).
- **Split** (`Window → Split`) is an in-child pane split (see §16), not an MDI concept.

### 1.6 Minimized child icons in workspace

Minimized child windows dock as **160×18 caption-bar icons** along the **bottom of the workspace**, left to right, wrapping up if necessary. Each icon shows:

- Control-box icon (16×16) at left.
- Truncated title, ellipsized at ~120 px.
- Restore and Close buttons at the right, each 16×14.

Double-click the icon body restores the child. Right-click opens the system menu.

Minimized icons arrange themselves left-to-right bottom-row-first; when rearranged (via `Window → Arrange Icons`, if implemented, or automatically when a child is minimized/restored), they snap to a grid of 160×18.

### 1.7 Preferences — multi-window modes

Two preferences under `Tools → Options → General` govern shell mode:

- **"Use multiple document interface (MDI)"** — on by default. When **off**, each document opens in its own Electron `BrowserWindow` (native multi-window). This is v2-polished but v1-stubbed: the checkbox exists and toggles behavior, but native multi-window is an acknowledged v2 work item if pixel fidelity cannot be preserved.
- **"Single document per window (macOS default)"** — on by default on macOS, off otherwise. On macOS the Cocoa HIG expects one document per window; we respect that by defaulting to native multi-window there. MDI remains available via the preference for users who want fidelity.

Even in native multi-window mode, **menu bar, toolbars, ruler, and status bar** are per-window and identical to the MDI-frame layout (minus the workspace/child chrome).

### 1.8 State persisted across sessions

- Parent frame position/size (per monitor).
- Per-document zoom, view mode, and scroll position (by file path or document-id for unnamed docs).
- Which toolbars are visible and their docked positions.
- Whether the ruler is shown.
- Last-used Find and Replace state.

Not persisted: caret position (Word 95 **does** remember last three caret positions via Shift+F5; we implement that as runtime-only list, not across sessions).

---

## 2. Main Window Chrome

### 2.1 Title bar

Format: `Microsoft Word - [Document1]` when a child is maximized (or in native multi-window mode); `Microsoft Word` when no child is maximized or no document is open.

- Height: matches OS default (Windows 10: 30 px; macOS: 22 px; Linux: whatever the WM provides). **Do not** re-skin the OS title bar; we live with OS skin on the outer frame.
- Icon at left: Word app icon (16×16, blue W on white square with a small ribbon — our own redraw inspired by the Word 95 icon).
- Standard OS window buttons at right.
- The rest of the Word 95 "feel" is inside the client area.

On macOS, the title appears centered per the HIG; the menu bar is the OS global menu bar, not an in-window strip (see 3.6 for macOS menu quirks).

### 2.2 Menu bar

- Height: 20 px (Windows), same (Linux), N/A in-window on macOS.
- Background: `COLOR_MENU` (≈ `#C0C0C0`).
- Font: "MS Sans Serif" 8 pt (fallback: Tahoma 8 pt, then system-ui). See §19.
- Item padding: 6 px horizontal, 3 px vertical.
- Hover highlight: inverse (white text on `#000080`).
- When focused via Alt / F10: first item (`File`) shows a dotted focus rectangle inside its padding.

Menu items: File, Edit, View, Insert, Format, Tools, Table, Window, Help. Mnemonics are shown as underlined letters when the Alt key is held (Windows convention post-98 hid mnemonics by default; Word 95 **always** showed them — we follow Word 95 and **always** show mnemonics).

Mnemonic letters (underline shown **always**): F**ile, E**dit, V**iew, I**nsert, F**o**rmat, T**ools, T**a**ble, W**indow, H\*\*elp.

Note the non-first-letter mnemonics: "F**o**rmat" (because F is taken by File), "T**a**ble" (because T is taken by Tools).

### 2.3 Toolbar strip(s)

By default two toolbars — **Standard** and **Formatting** — are stacked below the menu. They are **docked** at the top edge of the workspace. See §4 for toolbar details.

### 2.4 Ruler

Optional, toggled by `View → Ruler` (no default shortcut in Word 95; we bind `Ctrl+Alt+R` only if it does not conflict with a Word 95 shortcut — it does not). The horizontal ruler sits below toolbars and above the workspace; the vertical ruler, when in Page Layout view, sits at the left edge of the workspace. See §6.

### 2.5 Status bar

Always present, 20 px tall, anchored at the bottom of the outer frame, spanning its full width. See §10.

### 2.6 Document area / workspace

The MDI workspace fills the space between toolbars/ruler at the top and the status bar at the bottom. Background: `COLOR_APPWORKSPACE` (≈ `#808080`) in Word 95. (Modern theme offers a lighter neutral.)

---

## 3. Menus

### 3.1 Menu structure

Top-level order is fixed and mirrors Word 95: File, Edit, View, Insert, Format, Tools, Table, Window, Help.

#### 3.1.1 File

```
File
├── New...                     Ctrl+N
├── Open...                    Ctrl+O
├── Close                      Ctrl+W (*Word 95 uses Ctrl+F4 on child; we bind both)
├── ───────────────
├── Save                       Ctrl+S
├── Save As...                 F12
├── Save All
├── ───────────────
├── Find File...
├── Summary Info...
├── Templates...
├── ───────────────
├── Page Setup...
├── Print Preview
├── Print...                   Ctrl+P
├── ───────────────
├── Send...
├── Add Routing Slip...
├── ───────────────
├── 1 C:\LastDoc1.doc
├── 2 C:\LastDoc2.doc
├── 3 ...
├── 4 ...                      (MRU list: 4 by default; 0–9 configurable)
├── ───────────────
└── Exit                       Alt+F4
```

#### 3.1.2 Edit

```
Edit
├── Undo <action>              Ctrl+Z
├── Redo <action>              Ctrl+Y        (*Word 95 labels this "Repeat" when there's nothing to redo)
├── Repeat <action>            F4            (*F4 repeats last action when redo stack empty)
├── ───────────────
├── Cut                        Ctrl+X
├── Copy                       Ctrl+C
├── Paste                      Ctrl+V
├── Paste Special...
├── ───────────────
├── Clear                      Del
├── Select All                 Ctrl+A
├── ───────────────
├── Find...                    Ctrl+F
├── Replace...                 Ctrl+H
├── Go To...                   Ctrl+G (also F5)
├── ───────────────
├── AutoText                   (submenu)
├── Bookmark...
├── ───────────────
└── Links...
    Object
```

The `Object` last entry is dynamic: replaced by "<Object Type> Object" when an embedded object is selected; hidden otherwise.

#### 3.1.3 View

```
View
├── ● Normal
├── ○ Outline
├── ○ Page Layout
├── ○ Master Document
├── ───────────────
├── ✓ Toolbars...    (opens submenu listing all toolbars with checks)
├── ✓ Ruler
├── ───────────────
├── Header and Footer
├── Footnotes
├── Annotations
├── ───────────────
├── Full Screen
├── Zoom...
```

Radio-group for views (Normal / Outline / Page Layout / Master) — exactly one is checked (shown with `●` / `○` markers).

Ruler and individual toolbars use check marks (`✓`).

#### 3.1.4 Insert

```
Insert
├── Break...
├── Page Numbers...
├── Date and Time...
├── Field...
├── Symbol...
├── ───────────────
├── Form Field...
├── Footnote...
├── Caption...
├── Cross-reference...
├── Index and Tables...
├── ───────────────
├── File...
├── Frame
├── Picture...
├── Object...
├── Database...
```

"Frame" is a toggle (inserts a frame around selection or current paragraph). Not a dialog.

#### 3.1.5 Format

```
Format
├── Font...
├── Paragraph...
├── Tabs...
├── Borders and Shading...
├── Columns...
├── ───────────────
├── Change Case...
├── Drop Cap...
├── Bullets and Numbering...
├── Heading Numbering...
├── ───────────────
├── AutoFormat...
├── Style Gallery...
├── Style...
├── ───────────────
├── Frame...
├── Picture...
└── Drawing Object...
```

The last three are only enabled when a frame/picture/drawing object is selected.

#### 3.1.6 Tools

```
Tools
├── Spelling...                F7
├── Grammar...
├── Thesaurus...               Shift+F7
├── Hyphenation...
├── Language...
├── Word Count...
├── ───────────────
├── AutoCorrect...
├── Mail Merge...
├── Envelopes and Labels...
├── Protect Document...
├── Revisions...
├── ───────────────
├── Macro...
├── Customize...
└── Options...
```

#### 3.1.7 Table

```
Table
├── Insert Table...
├── Delete Cells...            (disabled unless in table; label changes to Delete Columns/Rows contextually)
├── Merge Cells
├── Split Cells...
├── ───────────────
├── Select Row
├── Select Column
├── Select Table               Alt+Num5 (on numpad with NumLock off)
├── ───────────────
├── Table AutoFormat...
├── Cell Height and Width...
├── Headings
├── Convert Text to Table...   (label flips to "Convert Table to Text..." when in table)
├── Sort...
├── Formula...
├── Split Table
└── ✓ Gridlines                (toggle)
```

#### 3.1.8 Window

```
Window
├── New Window
├── Arrange All
├── Split                      (label becomes "Remove Split" when split is active)
├── ───────────────
├── 1 Document1                (● by the active one, unchecked otherwise; up to 9 entries)
├── 2 Document2
└── ...
```

If more than 9 windows are open, a tenth entry **More Windows...** appears and opens a dialog listing all windows.

#### 3.1.9 Help

```
Help
├── Microsoft Word Help Topics
├── Answer Wizard...            (the early Answer Wizard shipped with Word 95)
├── The Microsoft Network...    (stub — v1 does nothing; v2 opens our About/Support site)
├── ───────────────
├── WordPerfect Help...
├── ───────────────
└── About Microsoft Word
```

### 3.2 Menu visual spec

- Popped-up menu: drop shadow 2 px offset down-right (Win95 style: solid dark rectangle, **not** a gaussian blur).
- Border: 1 px outer dark, 1 px inner light (classic bevel).
- Background: `COLOR_MENU` (`#C0C0C0`).
- Item height: 18 px (16 px text + 2 px padding).
- Item left padding: 22 px (reserve space for check/bullet/icon glyph).
- Item right padding: 8 px.
- Separator: 1 px dark horizontal line at y-center with 1 px light line just below.
- Accelerator column: **right-aligned**, separated from item text by a minimum of 16 px; accelerator column shares a right margin of 16 px.
- Submenu arrow: a 4×7 right-pointing triangle glyph at the right edge.
- Mnemonic underline: **always visible** (one-pixel underline beneath the mnemonic character).
- Disabled text: `#808080` with a 1 px white offset shadow (classic etched look).
- Checked: `✓` (8×8) at the left 22 px slot, `COLOR_MENUTEXT`.
- Radio bullet: `●` (5×5) at the left 22 px slot.
- Icon (for items with toolbar-equivalent icons, e.g., Cut/Copy/Paste/Save): 16×16 at the left 22 px slot (overrides check/bullet).

### 3.3 Menu interaction

- **Mouse click** on a top-level label: opens the menu.
- **Mouse hover** over a different top-level label **while any menu is open**: instantly (no delay) closes the current and opens the hovered one.
- **Click outside**: closes the menu. (Clicking the active menu's own top-level label also closes.)
- **Enter / Space** on a focused item: activates.
- **Alt alone (press and release, no letter)**: toggles menu-bar focus. On the first Alt press, File gets the focus rectangle but is not opened.
- **F10**: same as Alt — toggles menu focus.
- **Arrow keys**:
  - Left/Right at top level: move between menus.
  - Down: open the focused top-level menu and focus the first enabled item.
  - Up at top level: open and focus the last item.
  - Up/Down inside a menu: move selection, wrapping.
  - Right inside a menu: open submenu of a cascading item, or if on a leaf, move to the next top-level menu and open it.
  - Left: close current submenu (if in submenu) or move to previous top-level menu and open it.
- **Escape**: close the innermost open menu / submenu. When the top-level is closed, Esc returns focus to the document.
- **Mnemonic letter** while a menu is open: activate the item whose mnemonic matches. If multiple match (should never happen in a well-authored menu), cycle through them.
- **Alt+letter** at the document level: open the top-level menu whose mnemonic matches.

### 3.4 Menu state rules

- **Disabled items** are drawn in the classic etched-disabled style. They do not respond to hover highlight and do not accept keyboard activation (pressing their mnemonic makes a beep — we emit an ARIA live-region "unavailable" announcement and the OS system beep if enabled).
- **Checked / radio** items: reflect live model state. Updates are synchronous (no animation).
- **Dynamic text** items update their label on open. E.g., "Undo" becomes "Undo Typing" after a typing action, "Undo" alone when nothing to undo.

### 3.5 Submenus

Cascading submenus used by Word 95:

- Edit → AutoText → (list of autotext entries and "New...").
- Insert → Break → (dialog — not a submenu actually; "Break" opens a modal. Some Win95 apps used a submenu; Word 95 uses a dialog. We follow Word 95 and open a dialog.)
- View → Toolbars → (list of toolbars with checks + "Customize..." at the bottom).
- Format → AutoFormat → (dialog, not a submenu).
- Help → ...

Where a submenu is used, its open delay is **400 ms after hover** on its parent item (Win95 `SPI_GETMENUSHOWDELAY` default).

### 3.6 macOS menu bar quirk

On macOS, menus live in the global menu bar (top of screen), not in the window. The Word 95 menu structure is mirrored 1:1, including mnemonics displayed via underlines (macOS menu bar does not underline mnemonics — we still pass the mnemonic metadata to the OS so VoiceOver announces it).

macOS "Application menu" (the app-named menu at position 0): contains the standard macOS items **About**, **Preferences...** (maps to `Tools → Options...`), **Hide**, **Hide Others**, **Show All**, **Quit**. Our `File → Exit` is suppressed on macOS (Cmd+Q = Quit in the App menu).

macOS-specific shortcut mappings: use **Cmd** in place of **Ctrl** for every entry in §7 unless the entry involves a function key or an explicit Alt/Option combo. Cmd+W closes the active document window; Cmd+Shift+W closes all.

### 3.7 Right-click (context) menus

Different context menus per object under the pointer. Triggered by right-click (Windows/Linux), two-finger tap or Ctrl-click (macOS), or Shift+F10 from keyboard (target is current selection / caret).

**Text context menu** (when right-click in body text, no special object):

```
├── Cut
├── Copy
├── Paste
├── ───────────────
├── Font...
├── Paragraph...
├── Bullets and Numbering...
├── ───────────────
├── Define
├── Synonyms →  (submenu listing up to 5 thesaurus synonyms + "Thesaurus...")
```

**Spelling error context menu** (right-click word underlined red):

```
├── <suggestion 1>
├── <suggestion 2>
├── <suggestion 3>
├── (No Spelling Suggestions)  [if none found]
├── ───────────────
├── Ignore All
├── Add
├── ───────────────
├── AutoCorrect →  (submenu of suggestions that create an AutoCorrect entry)
├── ───────────────
└── Spelling...                F7
```

**Grammar error** (green-underlined in v2; dialog-based only in v1): similar structure but starts with grammar advice.

**Table cell context menu**:

```
├── Cut / Copy / Paste
├── ───────────────
├── Insert Cells...
├── Delete Cells...
├── Merge Cells         (only if multi-cell selection)
├── Split Cells...
├── ───────────────
├── Select Row
├── Select Column
├── Select Table
├── ───────────────
├── Table AutoFormat...
├── Cell Height and Width...
├── Borders and Shading...
├── Text Direction...   (v2)
```

**Image / picture context menu**:

```
├── Cut / Copy / Paste
├── ───────────────
├── Edit Picture
├── Borders and Shading...
├── Caption...
├── ───────────────
├── Format Picture...
├── Hyperlink...        (v2)
```

**Hyperlink context menu** (v2 — Word 95 did not have them as a first-class construct but did have `HYPERLINK` fields we honor):

```
├── Open Hyperlink
├── Copy Hyperlink
├── Edit Hyperlink...
├── Remove Hyperlink
```

**Header / footer context menu** — switches to header/footer edit mode; includes standard text actions plus:

```
├── Page Setup...
├── Same as Previous     (section breaks only)
├── Link to Previous
```

### 3.8 Context menu rules

- Opens at the cursor location on right-click; on Shift+F10 opens at the caret location (screen coords).
- Same visual spec as drop-down menus (§3.2).
- Escape closes without action; clicking outside closes.
- Items obey the same accelerator-column and mnemonic rules as regular menus.

---

## 4. Toolbars

### 4.1 Toolbar catalog

Eight shipping toolbars (same as Word 95):

| Toolbar    | Default state            | Rows | Notes                                                 |
| ---------- | ------------------------ | ---- | ----------------------------------------------------- |
| Standard   | Docked top, row 1        | 1    | File/Edit/layout/zoom core icons                      |
| Formatting | Docked top, row 2        | 1    | Font, size, B/I/U, alignment, indents, bullets        |
| Borders    | Hidden                   | 1    | Shown when cursor is in a table (optional)            |
| Database   | Hidden                   | 1    | Database field insertion                              |
| Drawing    | Hidden                   | 1    | Shapes, text box, callouts                            |
| Forms      | Hidden                   | 1    | Form fields, form design                              |
| Mail Merge | Hidden                   | 1    | Mail merge helpers                                    |
| Microsoft  | Hidden                   | 1    | Launch other Office apps — v1 is a stub; v2 is hidden |
| TipWizard  | Hidden (toggled by user) | 1    | Shows a tip strip                                     |

### 4.2 Button and icon metrics

Word 95 toolbar button bitmaps are **16×15** pixels (height 15, not 16 — verified by inspecting the `.BMP` strips embedded in the Word 95 `WORDxx.DLL` resources). The button **chrome** — the visible bevel — is **22×22**, so each icon sits centered in 22 px with 3 px top / 4 px bottom and 3 px each side of clear space.

Our implementation:

- Icons are **16×16 SVGs**, but we render them at **16×15** at 100% zoom by cropping the bottom row (transparent in our authored icons).
- The bevel chrome is **22×22** with 1 px border outside and 1 px inside — i.e., the clickable hit region is 22×22.
- At OS scale > 100%, we switch to 2× (32×32) and 3× (48×48) raster renders of the SVG with crisp-edge image rendering.
- Gutter between buttons is 0 px (they sit flush).

Dropdown arrows on combo/split buttons: a 11×22 strip to the right of the 22×22 icon chrome, with a 7×4 down-pointing triangle centered.

### 4.3 Button states

| State            | Visual                                                             |
| ---------------- | ------------------------------------------------------------------ |
| Default (up)     | flat gray (`COLOR_3DFACE`), no bevel                               |
| Hover (hot)      | 1 px raised bevel (light top/left, dark bottom/right)              |
| Pressed          | 1 px sunken bevel                                                  |
| Toggled (sticky) | 1 px sunken bevel with slightly darker (1-shade-darker) background |
| Disabled         | grayscaled icon + flat, same as default                            |
| Disabled + hover | no bevel change                                                    |
| Focused (kbd)    | 1 px dotted rectangle inside the chrome                            |

Rendering details:

- Bevel colors: light = `COLOR_3DHILIGHT` (`#FFFFFF`), dark = `COLOR_3DSHADOW` (`#808080`).
- Disabled icon: replace all non-transparent pixels with two draws: (a) a 1 px white offset to the down-right, (b) the pixels themselves in `#808080`. This is the classic Win95 etched disabled glyph.

### 4.4 Tooltip behavior

- Tooltip appears **after 500 ms** of hover with no movement.
- Tooltip text: short label (e.g., "Bold").
- Font: Tahoma 8 pt (or MS Sans Serif 8 pt).
- Background: `COLOR_INFOBK` (`#FFFFE1`).
- Border: 1 px `COLOR_INFOTEXT` (black).
- Position: 16 px below the pointer; if that would clip the screen bottom, 16 px above.
- Dismissed on: mouse leaves button, mouse click, keyboard action.
- Second tooltip: reappearance after dismiss is **100 ms** if the pointer moves to a different button within 500 ms (rapid-tour behavior).

TipWizard tips (the extra one-line hints that appear in the TipWizard toolbar) are **not** tooltips — they are their own toolbar's content.

### 4.5 Docking

Each toolbar can be docked on any of the four edges — top, bottom, left, right — or float.

- **Drag gripper**: 4×22 strip at the leading edge of a docked toolbar, containing two 1-px-wide vertical bars with 1 px gap, centered. Cursor over gripper: `size-all` / move cursor.
- **Drag**: press on gripper and drag. A ghost outline (1 px dotted rectangle) follows the pointer. On release:
  - If pointer is within 16 px of an edge of the outer frame, the toolbar **snaps** to that edge, inserted into the next row.
  - Otherwise the toolbar **floats** at the pointer location.
- **Double-click gripper**: toggles between docked (at its last-known dock position) and floating.
- **Dock order**: multiple toolbars on the same edge stack outward from the client area. Their relative order is preserved when docked, and reordering is by dragging.

When two toolbars share a dock row (top or bottom), they can be side by side if total width fits; otherwise they wrap onto separate rows.

### 4.6 Floating toolbar window

A floating toolbar has a mini caption bar, 12 px tall:

- No icon, no menu.
- Title text (Tahoma 7 pt) at left, 2 px padding.
- Close button at right: 11×11, "X" glyph.
- Background: `COLOR_ACTIVECAPTION` (active) / `COLOR_INACTIVECAPTION`.

Body is the usual toolbar chrome.

Drag the caption to move. Cannot be resized in v1 (Word 95 allowed resize of floating toolbars to change layout to multi-row); v2 adds resize.

Double-click the caption bar: docks to the last known dock position.

### 4.7 Toolbar context menu

Right-click anywhere on a toolbar (not on a button) or on the menu bar:

```
├── ✓ Standard
├── ✓ Formatting
├── ○ Borders
├── ○ Database
├── ○ Drawing
├── ○ Forms
├── ○ Mail Merge
├── ○ Microsoft
├── ○ TipWizard
├── ───────────────
└── Customize...
```

(Checks `✓` reflect current visible state.)

Clicking a toolbar name toggles its visibility; Customize... opens the Customize dialog (§5.4).

### 4.8 Toolbar wrap

When the outer frame is narrower than the sum of visible toolbars on a dock row, toolbars wrap onto additional rows **within the same dock edge**. The Standard toolbar always takes a full row if it overflows; the Formatting toolbar often wraps its last-few controls onto a new row at narrower widths (typical at window widths < 900 px).

### 4.9 Toolbar component catalog

The `Standard` toolbar, left to right:

| #   | Control         | Type     | Tooltip                | Action                                                                  |
| --- | --------------- | -------- | ---------------------- | ----------------------------------------------------------------------- |
| 1   | New (blank doc) | button   | New                    | File → New (default template)                                           |
| 2   | Open            | button   | Open                   | File → Open...                                                          |
| 3   | Save            | button   | Save                   | File → Save                                                             |
| 4   | Print           | button   | Print                  | File → Print (immediate)                                                |
| 5   | Print Preview   | button   | Print Preview          | File → Print Preview                                                    |
| 6   | Spelling        | button   | Spelling               | Tools → Spelling...                                                     |
|     | ──sep──         |          |                        |                                                                         |
| 7   | Cut             | button   | Cut                    | Edit → Cut                                                              |
| 8   | Copy            | button   | Copy                   | Edit → Copy                                                             |
| 9   | Paste           | button   | Paste                  | Edit → Paste                                                            |
| 10  | Format Painter  | button   | Format Painter         | toggle; single-click = one-shot; double-click = sticky                  |
|     | ──sep──         |          |                        |                                                                         |
| 11  | Undo            | split    | Undo                   | left = undo; dropdown shows history stack                               |
| 12  | Redo            | split    | Redo                   | left = redo; dropdown shows redo stack                                  |
|     | ──sep──         |          |                        |                                                                         |
| 13  | AutoFormat      | button   | AutoFormat             | Format → AutoFormat (no dialog — immediate apply)                       |
| 14  | Insert Address  | button   | Insert Address         | open address picker                                                     |
| 15  | Insert Table    | dropdown | Insert Table           | grid popup; drag to choose rows/cols                                    |
| 16  | Insert MS Excel | dropdown | Insert Excel Worksheet | grid popup for worksheet dimensions                                     |
| 17  | Columns         | dropdown | Columns                | grid popup to choose 1–6 columns                                        |
| 18  | Drawing         | toggle   | Drawing                | show/hide Drawing toolbar                                               |
| 19  | Show ¶          | toggle   | Show/Hide ¶            | toggle nonprinting character display                                    |
|     | ──sep──         |          |                        |                                                                         |
| 20  | Zoom            | combo    | Zoom Control           | dropdown: 50%, 75%, 100%, 150%, 200%, Whole Page, Page Width, Two Pages |
| 21  | TipWizard       | toggle   | TipWizard              | show/hide TipWizard toolbar                                             |
| 22  | Help            | button   | Help                   | enters "help mode" cursor; click to query                               |

The `Formatting` toolbar, left to right:

| #   | Control         | Type   | Tooltip         | Action                                           |
| --- | --------------- | ------ | --------------- | ------------------------------------------------ |
| 1   | Style           | combo  | Style           | dropdown list of styles                          |
| 2   | Font            | combo  | Font            | dropdown of fonts (see §4.10)                    |
| 3   | Size            | combo  | Font Size       | dropdown of common sizes + free entry            |
|     | ──sep──         |        |                 |                                                  |
| 4   | Bold            | toggle | Bold            | Ctrl+B                                           |
| 5   | Italic          | toggle | Italic          | Ctrl+I                                           |
| 6   | Underline       | toggle | Underline       | Ctrl+U                                           |
|     | ──sep──         |        |                 |                                                  |
| 7   | Align Left      | radio  | Align Left      | Ctrl+L                                           |
| 8   | Align Center    | radio  | Center          | Ctrl+E                                           |
| 9   | Align Right     | radio  | Align Right     | Ctrl+R                                           |
| 10  | Justify         | radio  | Justify         | Ctrl+J                                           |
|     | ──sep──         |        |                 |                                                  |
| 11  | Numbered list   | toggle | Numbered List   | toggles list numbering                           |
| 12  | Bullet list     | toggle | Bulleted List   | toggles bullet                                   |
| 13  | Decrease Indent | button | Decrease Indent | Ctrl+Shift+M                                     |
| 14  | Increase Indent | button | Increase Indent | Ctrl+M                                           |
|     | ──sep──         |        |                 |                                                  |
| 15  | Borders         | toggle | Borders         | show/hide Borders toolbar                        |
| 16  | Highlight       | split  | Highlight       | main = apply last color; dropdown = color picker |
| 17  | Font Color      | split  | Font Color      | main = apply last; dropdown = color picker       |

### 4.10 Combo boxes in toolbars

Combos (Style, Font, Size, Zoom):

- Left part: edit field; free text input with type-ahead auto-complete against the list.
- Right part: 11×22 dropdown arrow; click opens list popup.
- List popup:
  - Width: at least as wide as the edit field; for Font, at least 220 px.
  - Height: up to 12 rows; scrollbar if more.
  - Each row: 18 px tall.
  - Selection highlight: `COLOR_HIGHLIGHT` (`#000080` by default) with white text.
  - Font combo: **each font name rendered in that font** (size 9 pt), TrueType marker icon (14×10, TT glyph) at the left of each row that's TrueType, a small printer icon for printer-only fonts.
- Enter in edit field: commit value.
- Esc: revert to previous value.
- Tab: move focus to next toolbar control.

### 4.11 Split buttons

Split button: main action on click of the primary 22×22 region, dropdown on click of the 11×22 arrow. Hover: the two regions highlight independently.

Examples: Undo (dropdown shows undo stack, selection of N items undoes N in one step), Redo, Highlight (color grid), Font Color (color grid).

Color grid popup: 5×5 of 15×15 color swatches with 1 px divider, preset palette. Bottom row: "Automatic" (uses style color), "More Colors..." (opens color dialog).

### 4.12 Focus and click-through

- Toolbar buttons are **keyboard focusable** via Alt+F10? No — Word 95 used a different convention: **Ctrl+Tab** or **Alt+V, T** to step focus around toolbars is **not** standard. We use:
  - **F10** focuses the menu bar; pressing **Ctrl+Tab** from the menu moves focus to the toolbar; **Tab** / **Shift+Tab** cycles buttons; **Enter** or **Space** activates.
  - **Esc** from the toolbar returns focus to the document.
- Mouse click on a toolbar button **does not change which window has focus** — the document retains its caret and selection. This is critical for commands like Bold that operate on selection.
- Clicking the edit field of a combo **does** take focus (text input there).

### 4.13 Customize dialog (overview)

`Tools → Customize...` opens a tabbed modal (see §5):

- **Toolbars** — list of toolbars with checkboxes; New, Reset, Rename, Delete buttons; drag a button off a live toolbar to remove while the dialog is open.
- **Menus** — similar for menu items.
- **Keyboard** — assign shortcuts.
- **Toolbars** and **Menus** tabs support drag-and-drop from the Categories/Commands list onto any visible toolbar or menu.

---

## 5. Dialogs

### 5.1 Dialog taxonomy

- **Modal**: Font, Paragraph, Page Setup, Break, Print, Tabs, Columns, Bullets and Numbering, Borders and Shading, Change Case, Drop Cap, Style, Style Gallery, Insert Table, Table Properties (Cell Height and Width), Options, Customize, AutoCorrect, AutoFormat, Word Count, Hyphenation, Language, Object, Field, Symbol, Date and Time, Page Numbers, File → Open, File → Save As, File → Print, File → Templates, File → Summary Info, Mail Merge Helper (modal with own world), Envelopes and Labels, Protect Document, Revisions, Macro, Organizer.
- **Modeless**: Find and Replace (tabbed: Find / Replace / Go To), Spelling (persistent dialog walking through errors), Thesaurus, Grammar, Comments/Annotations pane (v2), Insert Table drag-grid popup, all color/grid popups from toolbars.

### 5.2 Standard modal dialog layout

```
+-----------------------------------------------------------+
| Dialog Title                                       [?][X] |
+-----------------------------------------------------------+
| [Tab 1] [Tab 2] [Tab 3]                                   |
+-----------------------------------------------------------+
|                                                           |
|   Group 1                                                 |
|   ┌──────────────────────────────────────────────────┐    |
|   │ Label:   [________________________]              │    |
|   │ Label 2: [▼_____________]                        │    |
|   │ [x] Checkbox option 1                            │    |
|   │ ( ) Radio 1    ( ) Radio 2   ( ) Radio 3         │    |
|   └──────────────────────────────────────────────────┘    |
|                                                           |
|   Group 2                                                 |
|   ┌──────────────────────────────────────────────────┐    |
|   │ Preview:                                         │    |
|   │  ┌───────────────────────────────────────┐       │    |
|   │  │  Times New Roman sample paragraph     │       │    |
|   │  │  illustrating current settings...     │       │    |
|   │  └───────────────────────────────────────┘       │    |
|   └──────────────────────────────────────────────────┘    |
|                                                           |
|                         [OK]  [Cancel]  [Default]  [Help] |
+-----------------------------------------------------------+
```

Metrics:

- Title bar: 18 px, standard Win95 caption, gradient or flat per active/inactive.
- Help `?` button (16×14): to the **left** of the close `X` in the title bar (Win95 "context help" button). Clicking turns the cursor into `pointer+?`; the next click on a control shows its context help topic.
- Close `X` (16×14): cancels the dialog (same as Cancel). Keyboard: Esc.
- Tab strip: 22 px tall, tabs with a 3D chrome. Active tab extends 1 px into the pane body.
- Group boxes: classic 3D etched rectangle with a title label embedded in the top edge.
- Button strip: bottom-right aligned, 22 px tall buttons with 75 px minimum width, 8 px spacing.
- Button order: **OK, Cancel, [Apply], [Help]**; "Default" (reset to defaults) placed to the left of OK when present.
- Default button: OK (heavier border — 2 px outer dark border).
- Cancel button: Esc. Cancels and closes.

### 5.3 Dialog positioning

- First open in a session: centered on the parent frame.
- Subsequent opens: position and size remembered **per dialog class** for the life of the process (not persisted across sessions except for Page Setup and Print, which persist).
- If a remembered position would fall off-screen (monitor moved), re-center on the parent.

### 5.4 Control types and metrics

| Control   | Metric                                                                                    |
| --------- | ----------------------------------------------------------------------------------------- |
| Label     | Tahoma 8 pt; trailing `:`; right-padded by 8 px                                           |
| Text edit | 21 px tall; 1 px sunken border; white bg; black text                                      |
| Combobox  | 21 px tall; dropdown arrow 17×19 at right                                                 |
| Checkbox  | 13×13 box + 6 px gap + label                                                              |
| Radio     | 13×13 round + 6 px gap + label                                                            |
| Spin box  | text edit + 17×10 up and 17×10 down stacked at right                                      |
| Button    | 22 px tall, min width 75 px                                                               |
| List box  | 1 px sunken border; row height 16 px                                                      |
| Group box | 3D etched rect; label starts at x=8 on top edge                                           |
| Slider    | used rarely (Options → User Info doesn't use sliders); horizontal track 4 px, thumb 11×20 |

### 5.5 Tab order and mnemonics

- Tab order follows **top-to-bottom, left-to-right** visual order within the dialog.
- Tab: move forward; Shift+Tab: move backward.
- Arrow keys: navigate within a radio group; navigate within a listbox; do **not** move across groups.
- Mnemonic: one underlined letter per label/button; **Alt+letter** sets focus (or activates, for buttons) immediately.
- Focus ring: 1 px dotted rectangle outside the control's bounds (except for combos/text edits, which show a caret and highlight).

### 5.6 Live preview pane

Dialogs that show a preview (Font, Paragraph, Borders and Shading, Page Setup, Drop Cap, Change Case, Bullets and Numbering, Tabs, Columns):

- Preview bounds: ~200×90 px (Font), ~220×160 px (Page Setup).
- Samples a canonical string: Font uses "Times New Roman" or "AaBbYyZz" or "The quick brown fox jumps over the lazy dog" — Word 95 uses the **selected font name itself** when it contains letters, falling back to the pangram. We use "`<Font Name>` AaBbYyZz" when no selection; the current selection (first 60 chars) otherwise.
- Updates live (within ~100 ms) as the user edits controls.
- Page Setup preview: shows a miniature page with shaded margins, header/footer band markers, and the "Apply to" region highlighted.
- Paragraph preview: shows ~5 lines of dummy text with the settings applied — including leader and indent markers.

### 5.7 Specific dialog specs

#### 5.7.1 Font dialog (Format → Font)

Two tabs:

1. **Font**
   - Font: [combo, type-ahead]
   - Font Style: [list: Regular, Italic, Bold, Bold Italic]
   - Size: [combo with numeric entry]
   - Underline: [dropdown: None, Single, Words Only, Double, Dotted]
   - Color: [dropdown color grid]
   - Effects: [checkboxes: Strikethrough, Superscript, Subscript, Hidden, Small Caps, All Caps]
   - Preview pane at bottom.
   - Buttons: Default (set as default for Normal style), OK, Cancel, Help.

2. **Character Spacing**
   - Spacing: [dropdown: Normal, Expanded, Condensed] + [By: spin box in pt]
   - Position: [dropdown: Normal, Raised, Lowered] + [By: spin box in pt]
   - [x] Kerning for fonts: [spin box] Points and Above
   - Preview pane.

#### 5.7.2 Paragraph dialog

Two tabs:

1. **Indents and Spacing**
   - Indentation group: Left / Right / Special (dropdown: None, First Line, Hanging) + By.
   - Spacing group: Before / After / Line Spacing (dropdown: Single, 1.5 Lines, Double, At Least, Exactly, Multiple) + At.
   - Alignment: dropdown (Left, Centered, Right, Justified).
   - Preview pane.

2. **Text Flow**
   - Pagination: [x] Widow/Orphan Control, [x] Keep Lines Together, [x] Keep with Next, [x] Page Break Before.
   - Line Numbers: [x] Suppress Line Numbers.
   - Hyphenation: [x] Don't Hyphenate.

#### 5.7.3 Page Setup

Four tabs: **Margins**, **Paper Size**, **Paper Source**, **Layout**.

- Margins: top/bottom/left/right + header/footer distance + gutter + mirror margins + 2 pages per sheet.
- Paper Size: paper size dropdown + width + height + orientation radios.
- Paper Source: first page and other pages dropdowns.
- Layout: section start dropdown, headers/footers options, vertical alignment, line numbers, borders.
- Apply to: [dropdown: Whole Document / This Point Forward / Selected Sections] — appears at bottom.
- Default button applies current settings to Normal template.

#### 5.7.4 Break (Insert → Break)

Single-pane modal:

- Radio group: ( ) Page Break (Ctrl+Enter), ( ) Column Break (Ctrl+Shift+Enter), ( ) Section Breaks: ( ) Next Page, ( ) Continuous, ( ) Even Page, ( ) Odd Page.
- OK, Cancel, Help.

#### 5.7.5 Options (Tools → Options)

Twelve tabs (same as Word 95, same order): **View**, **General**, **Edit**, **Print**, **Revisions**, **User Info**, **Compatibility**, **File Locations**, **Save**, **Spelling**, **Grammar**, **AutoFormat**.

Each tab is a dense grid of checkboxes and dropdowns. Row heights 18–22 px.

#### 5.7.6 AutoCorrect (Tools → AutoCorrect)

Single pane:

- [x] Change 'Straight Quotes' to 'Smart Quotes'
- [x] Correct TWo INitial CApitals
- [x] Capitalize First Letter of Sentences
- [x] Capitalize Names of Days
- [x] Replace Text as You Type
- Replace/With pair of text edits + a grid listing current entries + Add/Delete buttons.

#### 5.7.7 Mail Merge Helper

A centered modal "wizard-like" window with three numbered buttons:

- **1 Main Document** — Create dropdown (Form Letters, Mailing Labels, Envelopes, Catalog)
- **2 Data Source** — Get Data dropdown (Create Data Source, Open Data Source, Use Address Book, Header Options)
- **3 Merge the Data with the Document** — Merge button; opens sub-dialog

Large status area between steps shows current selections.

Close button at bottom dismisses the dialog.

#### 5.7.8 Insert Table (dialog variant)

- Number of Columns: spin
- Number of Rows: spin
- Column Width: spin (Auto is a valid value)
- Table Format: [AutoFormat...] button opens Table AutoFormat dialog
- OK, Cancel, Wizard..., Help.

#### 5.7.9 Bullets and Numbering

Four tabs: **Bulleted**, **Numbered**, **Multilevel**, **Modify** (actually a button in Word 95, but we render as a button at the bottom of each tab).

Each tab shows a 2×4 grid of sample bullet/numbering styles. Click selects; OK applies.

#### 5.7.10 Borders and Shading

Two tabs: **Borders**, **Shading**.

- Borders: Preset group (None, Box, Shadow, 3-D) + Line group (Style list, Color, Width) + interactive preview (click edges to add/remove) + Apply To dropdown.
- Shading: Fill list (patterns) + Foreground/Background color + preview + Apply To.

#### 5.7.11 Columns

- Presets: One / Two / Three / Left / Right (visual thumbnails at top).
- Number of columns: spin.
- Col Width and Spacing grid (per column).
- [x] Line between.
- [x] Equal column width.
- Apply To dropdown.
- Preview.

#### 5.7.12 Change Case

- Radio: ( ) Sentence case. ( ) lowercase. ( ) UPPERCASE. ( ) Title Case. ( ) tOGGLE cASE.
- OK, Cancel.

(No preview — changes apply to current selection on OK.)

#### 5.7.13 Drop Cap

- Position: radio thumbnails ( ) None ( ) Dropped ( ) In Margin.
- Font: combo.
- Lines to Drop: spin (default 3).
- Distance from Text: spin.
- OK, Cancel.

#### 5.7.14 Style

Complex modal:

- Styles list (left, 40% width, scrolling list of style names — those matching the List filter).
- List filter dropdown (All Styles, Styles in Use, User-Defined Styles).
- Description pane (right, bottom) showing the composition of the selected style.
- Paragraph preview pane (right, top).
- Character preview pane (right, middle).
- Buttons: Apply (default), Cancel, New..., Modify..., Delete, Organizer..., Help.

### 5.8 Modeless dialogs — Find and Replace

`Edit → Find...` / `Edit → Replace...` / `Edit → Go To...` all open the **same** modeless dialog with the matching tab selected.

```
+-----------------------------------------------------------+
| Find and Replace                                 [?][X]   |
+-----------------------------------------------------------+
|  [ Find ] [Replace] [Go To]                               |
+-----------------------------------------------------------+
|  Find what:   [_______________________________]   [▼]   |
|  Replace with:[_______________________________]   [▼]   |
|                                                           |
|  Search: [All ▼]                                          |
|  [x] Match case     [x] Find whole words only             |
|  [ ] Use Pattern Matching  [ ] Sounds Like                |
|  [ ] Find All Word Forms                                  |
|                                                           |
|  [No Formatting]  [Format ▼]  [Special ▼]                 |
|                                                           |
|                [Find Next]  [Replace]  [Replace All]  [Cancel]
+-----------------------------------------------------------+
```

Modeless rules:

- The dialog stays open while the user interacts with the document.
- Focus can move to the document and back. Enter in the document does not close the dialog.
- Only one Find and Replace dialog exists per process — opening it when already open simply raises + selects the right tab.
- Pressing Esc with focus in the dialog closes it.
- Closing the dialog preserves its state (last Find/Replace strings and options) for the life of the process.

Go To tab:

- "Go to What" listbox: Page, Section, Line, Bookmark, Comment, Footnote, Endnote, Field, Table, Graphic, Equation, Object, Heading.
- Contextual entry field on the right: "Enter page number" etc.
- Supports `+N` / `-N` relative navigation and `N%` percent-of-document.
- Buttons: Go To (default), Previous, Next, Close.

### 5.9 Open / Save As dialogs

Use the OS native file dialogs with these extensions:

- Save As dropdown "Save File as Type" defaults to `Word Document (*.docx)`.
- Tools menu in the dialog offers: General Options (our own subdialog for password + read-only), Save Options (version mgmt), Network Options, Print.

If the user insists on a Word 95 visual we provide `View → Options → General → "Classic Open/Save dialog"` which renders our own Win95-style file picker (v2). v1 uses OS native.

### 5.10 Print dialog

- Printer group: Name dropdown (installed printers), Status, Type, Where, Comment + Properties button.
- Page Range: radios (All, Current Page, Selection, Pages: [_____]).
- Copies: spin + [x] Collate.
- Print What: dropdown (Document, Document Properties, Comments, Styles, AutoText Entries, Key Assignments).
- Print: dropdown (All Pages in Range, Odd Pages, Even Pages).
- Options... button — opens Tools → Options → Print tab.
- OK (labeled "OK" not "Print" in Word 95), Cancel.

### 5.11 Help dialog

Word 95's Help Topics viewer had three tabs: **Contents**, **Index**, **Find**. We stub it with a simple HTML-based help viewer (classless modeless window) for v1; v2 matches the tabbed layout.

---

## 6. Rulers

### 6.1 Horizontal ruler

- Always visible when `View → Ruler` is checked. Default: on.
- Appears directly below the toolbars, spanning the workspace width.
- Height: 18 px.
- Background: `#FFFFFF` with 1 px border bottom.
- Margin areas (outside page edges): dark gray `#808080`; hovering a margin boundary changes cursor to double-headed horizontal arrow.
- Page content area: white with tick marks — every unit (see 6.2), major ticks every N units (1" or 1 cm).
- Tick labels: every major unit, centered, Tahoma 7 pt.

### 6.2 Units

From `Tools → Options → General → Measurement units`:

- Inches (default en-US)
- Centimeters
- Millimeters
- Points
- Picas

Switching units immediately redraws all rulers and dialogs expressing measurements. Zero is at the **left margin** (ticks to the left of zero are in the margin area and labeled negatively).

### 6.3 Indent markers

At the top of the ruler, three markers:

- **First-line indent marker**: 7×7 downward triangle at top, at x = (first-line indent position).
- **Hanging indent marker**: 7×7 upward triangle at bottom, at x = (left indent position after first line).
- **Left indent marker**: 7×4 rectangle below the hanging indent triangle, at x = (left indent position).

Dragging the left indent rectangle moves **both** the hanging and left markers (preserving relative offset).

At the right edge:

- **Right indent marker**: 7×7 upward triangle, at x = (right indent from right margin).

### 6.4 Tab stops and tab-type selector

At the far left of the ruler area (in the 18-px gutter to the left of the zero mark) a **tab-type selector**:

- 15×15 button that cycles through tab types on click:
  - `L` — Left tab (default)
  - `⊥` — Center tab (shown as an inverted T)
  - `⊣` — Right tab
  - `.` — Decimal tab (shown as inverted T with a dot)
  - `|` — Bar tab

Cycling order: Left → Center → Right → Decimal → Bar → (repeat).

Setting tab stops:

- **Click** on the ruler horizontal face: inserts a tab stop of the current selected type at that x.
- **Drag** a tab: moves it.
- **Drag off** (pull downward more than 8 px below the ruler): removes the tab.
- **Double-click** an existing tab: opens `Format → Tabs` dialog pre-focused on that tab.

Hit tolerance on tab markers: **3 px** (pointer within 3 px horizontally is considered "on" the marker for drag).

Mixed tab types: each tab stop has its own type, drawn as its glyph at its x position; default tabs (every 0.5") are drawn as tiny `L` glyphs in a lighter gray (`#A0A0A0`).

### 6.5 Margins

The margin regions at the far left and far right of the ruler are darker gray. The boundary between margin and content area is draggable (cursor: double-arrow horizontal). Dragging updates `Format → Page Setup → Margins` live and redraws the document.

### 6.6 Column separators

When a section has multiple columns, the ruler shows:

- Each column as a white band.
- Gaps between columns as darker gray bands.
- Boundaries draggable to resize columns (only when "Equal column width" is off).

### 6.7 Vertical ruler

Shown only in **Page Layout** view when `View → Ruler` is on. Width 18 px, runs down the left side of the workspace.

- Displays top/bottom margins, header/footer distance.
- In tables: shows row heights. Drag the row boundary to resize (same hit tolerance as horizontal).
- Units match horizontal ruler.

### 6.8 Ruler interactions summary

| Target                   | Cursor           | Click           | Drag               | Double-click                 |
| ------------------------ | ---------------- | --------------- | ------------------ | ---------------------------- |
| Empty content ruler area | I-beam, normal   | Add tab of type | —                  | Open Tabs dialog             |
| Tab marker               | Horizontal arrow | Select          | Move; off = remove | Open Tabs dialog at that tab |
| Indent marker            | Horizontal arrow | Focus           | Move indent        | Open Paragraph dialog        |
| Margin boundary          | Horizontal arrow | —               | Move margin        | Open Page Setup → Margins    |
| Column separator         | Horizontal arrow | —               | Resize columns     | Open Format → Columns        |
| Tab-type selector        | Arrow            | Cycle tab type  | —                  | —                            |

---

## 7. Keyboard Shortcuts (Comprehensive Table)

All shortcuts use **Ctrl** on Windows/Linux and **Cmd** on macOS, unless the shortcut explicitly contains Alt (macOS: Option) or is a function key.

Where Word 95 published a shortcut, we list it. Where we add one for a modern feature (marked "(add)"), we pick values that do not conflict with Word 95's list.

### 7.1 File commands

| Action                    | Windows/Linux  | macOS         | Notes                                                                                             |
| ------------------------- | -------------- | ------------- | ------------------------------------------------------------------------------------------------- |
| New (default template)    | Ctrl+N         | Cmd+N         |                                                                                                   |
| New... (template chooser) | Ctrl+Shift+N   | Cmd+Shift+N   | (add) — Word 95 Ctrl+Shift+N is Normal style; we keep that there, move new-template to Ctrl+Alt+N |
| Open                      | Ctrl+O         | Cmd+O         |                                                                                                   |
| Open                      | Ctrl+F12       | Cmd+F12       | alt binding                                                                                       |
| Close                     | Ctrl+W         | Cmd+W         |                                                                                                   |
| Close (child)             | Ctrl+F4        | Cmd+F4        |                                                                                                   |
| Save                      | Ctrl+S         | Cmd+S         |                                                                                                   |
| Save                      | Shift+F12      | Shift+F12     | alt binding                                                                                       |
| Save As                   | F12            | F12           |                                                                                                   |
| Print                     | Ctrl+P         | Cmd+P         |                                                                                                   |
| Print                     | Ctrl+Shift+F12 | Cmd+Shift+F12 | alt binding                                                                                       |
| Print Preview             | Ctrl+F2        | Cmd+F2        |                                                                                                   |
| Exit                      | Alt+F4         | Cmd+Q         | OS standard                                                                                       |

### 7.2 Edit commands

| Action             | Windows/Linux | macOS                                                                   | Notes                |
| ------------------ | ------------- | ----------------------------------------------------------------------- | -------------------- |
| Undo               | Ctrl+Z        | Cmd+Z                                                                   |                      |
| Undo               | Alt+Backspace | Option+Delete                                                           | alt binding          |
| Redo               | Ctrl+Y        | Cmd+Y                                                                   |                      |
| Repeat last action | F4            | F4                                                                      | if no redo available |
| Cut                | Ctrl+X        | Cmd+X                                                                   |                      |
| Cut                | Shift+Del     | Shift+Del                                                               | alt binding          |
| Copy               | Ctrl+C        | Cmd+C                                                                   |                      |
| Copy               | Ctrl+Insert   | Cmd+Insert                                                              | alt binding          |
| Paste              | Ctrl+V        | Cmd+V                                                                   |                      |
| Paste              | Shift+Insert  | Shift+Insert                                                            | alt binding          |
| Paste Special      | Ctrl+Alt+V    | Cmd+Option+V                                                            | (add)                |
| Clear              | Del           | Delete                                                                  | selection only       |
| Select All         | Ctrl+A        | Cmd+A                                                                   |                      |
| Select All         | Ctrl+Num5     | Cmd+Num5                                                                | alt binding          |
| Find               | Ctrl+F        | Cmd+F                                                                   |                      |
| Replace            | Ctrl+H        | Cmd+H (conflict: macOS uses Cmd+H for Hide App; we use **Cmd+Shift+H**) |
| Go To              | Ctrl+G        | Cmd+G                                                                   |                      |
| Go To              | F5            | F5                                                                      | alt binding          |
| Find Next          | Shift+F4      | Shift+F4                                                                | repeats last find    |
| Find Next          | Ctrl+Alt+Y    | Cmd+Option+Y                                                            | alt binding          |

### 7.3 View commands

| Action                         | Windows/Linux | macOS        |
| ------------------------------ | ------------- | ------------ |
| Normal view                    | Ctrl+Alt+N    | Cmd+Option+N |
| Outline view                   | Ctrl+Alt+O    | Cmd+Option+O |
| Page Layout view               | Ctrl+Alt+P    | Cmd+Option+P |
| Master Document view           | (menu only)   | (menu only)  |
| Full Screen                    | (menu only)   | (menu only)  |
| Toggle field codes             | Alt+F9        | Option+F9    |
| Toggle selected field          | Shift+F9      | Shift+F9     |
| Update field                   | F9            | F9           |
| Insert empty field             | Ctrl+F9       | Cmd+F9       |
| Next field                     | F11           | F11          |
| Previous field                 | Shift+F11     | Shift+F11    |
| Lock field                     | Ctrl+F11      | Cmd+F11      |
| Unlink field (convert to text) | Ctrl+Shift+F9 | Cmd+Shift+F9 |

### 7.4 Insert commands

| Action                        | Windows/Linux     | macOS            |
| ----------------------------- | ----------------- | ---------------- |
| Page break                    | Ctrl+Enter        | Cmd+Enter        |
| Column break                  | Ctrl+Shift+Enter  | Cmd+Shift+Enter  |
| Line break (soft)             | Shift+Enter       | Shift+Enter      |
| Non-breaking space            | Ctrl+Shift+Space  | Cmd+Shift+Space  |
| Non-breaking hyphen           | Ctrl+Shift+Hyphen | Cmd+Shift+Hyphen |
| Optional hyphen               | Ctrl+Hyphen       | Cmd+Hyphen       |
| Em dash                       | Ctrl+Alt+Num-     | Cmd+Option+Num-  |
| En dash                       | Ctrl+Num-         | Cmd+Num-         |
| Copyright ©                   | Ctrl+Alt+C        | Cmd+Option+C     |
| Registered ®                  | Ctrl+Alt+R        | Cmd+Option+R     |
| Trademark ™                   | Ctrl+Alt+T        | Cmd+Option+T     |
| Ellipsis …                    | Ctrl+Alt+.        | Cmd+Option+.     |
| Footnote                      | Ctrl+Alt+F        | Cmd+Option+F     |
| Endnote                       | Ctrl+Alt+D        | Cmd+Option+D     |
| AutoText entry (expand)       | F3                | F3               |
| AutoText (new from selection) | Alt+F3            | Option+F3        |
| Date field                    | Alt+Shift+D       | Option+Shift+D   |
| Time field                    | Alt+Shift+T       | Option+Shift+T   |
| Page number field             | Alt+Shift+P       | Option+Shift+P   |
| Comment (annotation)          | Ctrl+Alt+A        | Cmd+Option+A     |
| Symbol dialog                 | (menu only)       | (menu only)      |

### 7.5 Format — Character

| Action                    | Windows/Linux | macOS                                                                                                        |
| ------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Font dialog               | Ctrl+D        | Cmd+D                                                                                                        |
| Bold                      | Ctrl+B        | Cmd+B                                                                                                        |
| Bold                      | Ctrl+Shift+B  | Cmd+Shift+B                                                                                                  |
| Italic                    | Ctrl+I        | Cmd+I                                                                                                        |
| Italic                    | Ctrl+Shift+I  | Cmd+Shift+I                                                                                                  |
| Underline                 | Ctrl+U        | Cmd+U                                                                                                        |
| Underline                 | Ctrl+Shift+U  | Cmd+Shift+U                                                                                                  |
| Word underline            | Ctrl+Shift+W  | Cmd+Shift+W                                                                                                  |
| Double underline          | Ctrl+Shift+D  | Cmd+Shift+D                                                                                                  |
| Subscript                 | Ctrl+=        | Cmd+=                                                                                                        |
| Superscript               | Ctrl+Shift+=  | Cmd+Shift+=                                                                                                  |
| Small caps                | Ctrl+Shift+K  | Cmd+Shift+K                                                                                                  |
| All caps                  | Ctrl+Shift+A  | Cmd+Shift+A                                                                                                  |
| Hidden text               | Ctrl+Shift+H  | (conflict with Replace; use Ctrl+Alt+Shift+H)                                                                |
| Change case               | Shift+F3      | Shift+F3                                                                                                     | cycles Sentence/lower/UPPER/Title/tOGGLE on each press |
| Increase font size 1 pt   | Ctrl+]        | Cmd+]                                                                                                        |
| Decrease font size 1 pt   | Ctrl+[        | Cmd+[                                                                                                        |
| Grow to next size in list | Ctrl+Shift+.  | Cmd+Shift+.                                                                                                  |
| Shrink to prev size       | Ctrl+Shift+,  | Cmd+Shift+,                                                                                                  |
| Symbol font               | Ctrl+Shift+Q  | Cmd+Shift+Q                                                                                                  |
| Reset character format    | Ctrl+Space    | Cmd+Space (macOS Spotlight conflict; we use **Cmd+Shift+Z** — no, conflict again — use **Cmd+Option+Space**) |
| Reset character format    | Ctrl+Shift+Z  | Cmd+Shift+Z                                                                                                  | alt binding                                            |
| Copy formatting           | Ctrl+Shift+C  | Cmd+Shift+C                                                                                                  | Format Painter                                         |
| Paste formatting          | Ctrl+Shift+V  | Cmd+Shift+V                                                                                                  |

### 7.6 Format — Paragraph

| Action                     | Windows/Linux | macOS                                               |
| -------------------------- | ------------- | --------------------------------------------------- | ------- |
| Align left                 | Ctrl+L        | Cmd+L                                               |
| Center                     | Ctrl+E        | Cmd+E                                               |
| Align right                | Ctrl+R        | Cmd+R                                               |
| Justify                    | Ctrl+J        | Cmd+J                                               |
| Single line spacing        | Ctrl+1        | Cmd+1                                               |
| Double line spacing        | Ctrl+2        | Cmd+2                                               |
| 1.5 line spacing           | Ctrl+5        | Cmd+5                                               |
| Add 12 pt before para      | Ctrl+0 (zero) | Cmd+0                                               | toggles |
| Increase indent (next tab) | Ctrl+M        | Cmd+M                                               |
| Decrease indent            | Ctrl+Shift+M  | Cmd+Shift+M                                         |
| Hanging indent             | Ctrl+T        | Cmd+T                                               |
| Reduce hanging indent      | Ctrl+Shift+T  | Cmd+Shift+T                                         |
| Reset paragraph format     | Ctrl+Q        | Cmd+Q (conflict: Cmd+Q quits; use **Cmd+Option+Q**) |

### 7.7 Format — Styles

| Action              | Windows/Linux | macOS        |
| ------------------- | ------------- | ------------ | ------------------------------------------------------------- |
| Style dialog        | Ctrl+Shift+S  | Cmd+Shift+S  | (conflict with Save As in some apps — Word uses Ctrl+Shift+S) |
| Normal style        | Ctrl+Shift+N  | Cmd+Shift+N  |
| Heading 1           | Ctrl+Alt+1    | Cmd+Option+1 |
| Heading 2           | Ctrl+Alt+2    | Cmd+Option+2 |
| Heading 3           | Ctrl+Alt+3    | Cmd+Option+3 |
| List bullet (style) | Ctrl+Shift+L  | Cmd+Shift+L  |

### 7.8 Navigation

| Action                            | Windows/Linux              | macOS                        |
| --------------------------------- | -------------------------- | ---------------------------- | ------------ |
| One char left/right               | ← →                        | ← →                          |
| One line up/down                  | ↑ ↓                        | ↑ ↓                          |
| One word left/right               | Ctrl+← Ctrl+→              | Option+← Option+→            |
| Beginning / end of line           | Home End                   | Cmd+← Cmd+→                  |
| Beginning / end of document       | Ctrl+Home Ctrl+End         | Cmd+Home Cmd+End             |
| One screen up / down              | PageUp PageDown            | PageUp PageDown              |
| Top / bottom of window            | Ctrl+Alt+PageUp / PageDown | Cmd+Option+PageUp / PageDown |
| Next / previous paragraph         | Ctrl+↑ Ctrl+↓              | Option+↑ Option+↓            |
| Previous caret position           | Shift+F5                   | Shift+F5                     | up to last 3 |
| Begin of next page (print layout) | Ctrl+PageDown              | Cmd+PageDown                 |
| Begin of previous page            | Ctrl+PageUp                | Cmd+PageUp                   |
| Go to next footnote               | (menu only)                | (menu only)                  |
| Go to next comment                | (menu only)                | (menu only)                  |

### 7.9 Selection

| Action                     | Windows/Linux           | macOS                     |
| -------------------------- | ----------------------- | ------------------------- | ------------------------------------------- |
| Extend right char          | Shift+→                 | Shift+→                   |
| Extend left char           | Shift+←                 | Shift+←                   |
| Extend right word          | Ctrl+Shift+→            | Option+Shift+→            |
| Extend left word           | Ctrl+Shift+←            | Option+Shift+←            |
| Extend to line end         | Shift+End               | Cmd+Shift+→               |
| Extend to line start       | Shift+Home              | Cmd+Shift+←               |
| Extend down line           | Shift+↓                 | Shift+↓                   |
| Extend up line             | Shift+↑                 | Shift+↑                   |
| Extend to para end         | Ctrl+Shift+↓            | Option+Shift+↓            |
| Extend to para start       | Ctrl+Shift+↑            | Option+Shift+↑            |
| Extend to doc end          | Ctrl+Shift+End          | Cmd+Shift+End             |
| Extend to doc start        | Ctrl+Shift+Home         | Cmd+Shift+Home            |
| Extend one screen down     | Shift+PageDown          | Shift+PageDown            |
| Extend one screen up       | Shift+PageUp            | Shift+PageUp              |
| Extend to window end       | Ctrl+Alt+Shift+PageDown | Cmd+Option+Shift+PageDown |
| Enter Extend Mode          | F8                      | F8                        |
| Grow in Extend Mode        | F8                      | F8                        | word / sentence / paragraph / section / doc |
| Shrink in Extend Mode      | Shift+F8                | Shift+F8                  |
| Column (block) select mode | Ctrl+Shift+F8           | Cmd+Shift+F8              |
| Cancel extend              | Esc                     | Esc                       |
| Whole document             | Ctrl+A / Ctrl+Num5      | Cmd+A                     |

### 7.10 Tables

| Action                  | Windows/Linux          | macOS                                                                                                             |
| ----------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Next cell               | Tab                    | Tab                                                                                                               |
| Previous cell           | Shift+Tab              | Shift+Tab                                                                                                         |
| Insert tab char in cell | Ctrl+Tab               | Cmd+Tab (OS conflict — we use **Ctrl+Tab** even on macOS since macOS does not reserve Ctrl+Tab for app switching) |
| Select entire table     | Alt+Num5 (NumLock off) | Option+Num5                                                                                                       |
| Select row              | (menu)                 | (menu)                                                                                                            |
| Select column           | (menu)                 | (menu)                                                                                                            |

### 7.11 Outline view

| Action                     | Windows/Linux   | macOS              |
| -------------------------- | --------------- | ------------------ |
| Promote                    | Alt+Shift+←     | Option+Shift+←     |
| Demote                     | Alt+Shift+→     | Option+Shift+→     |
| Demote to body text        | Ctrl+Shift+N    | Cmd+Shift+N        |
| Move up                    | Alt+Shift+↑     | Option+Shift+↑     |
| Move down                  | Alt+Shift+↓     | Option+Shift+↓     |
| Expand                     | Alt+Shift++     | Option+Shift++     |
| Collapse                   | Alt+Shift+-     | Option+Shift+-     |
| Expand all                 | Alt+Shift+A     | Option+Shift+A     |
| Show headings (levels 1–9) | Alt+Shift+1 … 9 | Option+Shift+1 … 9 |
| Show all levels            | Alt+Shift+A     | Option+Shift+A     |
| Show first line only       | Alt+Shift+L     | Option+Shift+L     |

### 7.12 Spelling, Thesaurus, Language

| Action       | Windows/Linux | macOS       |
| ------------ | ------------- | ----------- |
| Spelling     | F7            | F7          |
| Thesaurus    | Shift+F7      | Shift+F7    |
| Grammar      | (menu only)   | (menu only) |
| Set Language | (menu only)   | (menu only) |
| Word Count   | (menu only)   | (menu only) |

### 7.13 Help

| Action                     | Windows/Linux | macOS    |
| -------------------------- | ------------- | -------- |
| Context-sensitive help     | F1            | F1       |
| Help mode (click to query) | Shift+F1      | Shift+F1 |
| What's This? on dialog     | Shift+F1      | Shift+F1 |

### 7.14 Window management

| Action                   | Windows/Linux       | macOS                                                         |
| ------------------------ | ------------------- | ------------------------------------------------------------- |
| Next document window     | Ctrl+F6             | Cmd+`                                                         |
| Previous document window | Ctrl+Shift+F6       | Cmd+Shift+`                                                   |
| Active child system menu | Alt+Hyphen          | Control+Hyphen                                                |
| Parent frame system menu | Alt+Space           | Control+Space (macOS conflict — use **Control+Option+Space**) |
| Maximize child           | Ctrl+F10            | Cmd+Control+F                                                 |
| Restore child            | Ctrl+F5             | Cmd+Control+R                                                 |
| Move child (keyboard)    | Ctrl+F7 then arrows | Cmd+Control+M then arrows                                     |
| Size child (keyboard)    | Ctrl+F8 then arrows | Cmd+Control+S then arrows                                     |

### 7.15 Macro, Customize, Misc

| Action                              | Windows/Linux                  | macOS        |
| ----------------------------------- | ------------------------------ | ------------ |
| Run macro                           | Alt+F8                         | Option+F8    |
| Macro editor (VBA)                  | Alt+F11                        | Option+F11   |
| Stop recording macro                | (Tools menu)                   | (Tools menu) |
| Customize keyboard                  | (Tools → Customize → Keyboard) | (same)       |
| Open What's This? (Shift+F1 cursor) | Shift+F1                       | Shift+F1     |

This table totals **~220 entries**. A full machine-readable map is in `/src/config/shortcuts.ts` (to be authored by the implementing agent).

### 7.16 Shortcut visualization convention

In menus the shortcut is displayed right-aligned in the accelerator column using this rendering:

- Mod keys in order: Ctrl, Alt, Shift (Windows/Linux); Cmd, Option, Shift, Control (macOS with Apple glyphs ⌘ ⌥ ⇧ ⌃).
- Keys joined by `+`.
- Letters uppercase.
- Functions as `F1`–`F12`.
- Arrow keys as Unicode arrows `← ↑ → ↓`.
- Whitespace: `Space`, `Tab`, `Enter`.

---

## 8. Mouse Behaviors

### 8.1 In-document mouse actions

| Gesture                | Effect                                                          |
| ---------------------- | --------------------------------------------------------------- |
| Single left click      | Position caret at hit location; collapse selection              |
| Double left click      | Select word under pointer                                       |
| Triple left click      | Select paragraph under pointer                                  |
| Ctrl+left click        | Select sentence under pointer                                   |
| Shift+left click       | Extend selection from current anchor to click point             |
| Shift+double click     | Extend selection to word boundary past click point              |
| Left click + drag      | Make stream selection; auto-scroll if near edges                |
| Alt+left click + drag  | Column (block / rectangular) selection                          |
| Ctrl+left click + drag | (no-op except when on selected text — see drag-drop below)      |
| Right click            | Open context menu for object under pointer                      |
| Middle click           | v2: autoscroll mode (Win95 did not have this; IE did); v1 no-op |
| Scroll wheel           | Scroll document by N lines (config, default 3)                  |
| Shift+scroll           | Horizontal scroll by N columns                                  |
| Ctrl+scroll            | Zoom in/out by 10% per tick — our modern addition               |

### 8.2 Selection gutter (left margin)

The 16 px strip to the left of the body text but inside the page (the _selection bar_ or _gutter_). Cursor in the gutter: right-pointing arrow `►` (reflected — actually it is the standard Windows `IDC_ARROW` rotated, but Word 95 uses a specific selection-bar cursor which is the arrow pointing up-and-right; we faithfully redraw it).

| Gesture in gutter       | Effect                 |
| ----------------------- | ---------------------- |
| Single click            | Select that line       |
| Click + drag vertically | Select multiple lines  |
| Double click            | Select that paragraph  |
| Triple click            | Select entire document |
| Ctrl+click              | Select entire document |

### 8.3 Drag-and-drop text

- When the pointer is over a selected range, cursor is `move` (standard OS drag cursor).
- **Drag**: moves the selection. A drop caret (a thin vertical I-beam in darker color) tracks the pointer inside the document.
- **Ctrl+drag**: copies the selection (cursor shows `+` badge).
- Drop targets: within the same document, any other open document, or an external target (Notepad-compatible external drag of plain text).
- Sources from outside: dragging `.txt` / `.rtf` / `.docx` / `.bmp` / `.png` / image clipboard from OS file explorer drops the file (as inserted content, via Insert → File equivalent) at the drop caret.

### 8.4 Selection state semantics

- **Stream (default)**: a contiguous range of character offsets.
- **Column**: a rectangle over monospace-laid text. Rendering: same blue background but broken into per-line rectangles.
- **Extended (F8)**: a sticky-anchor mode; any caret movement extends the selection from the anchor. Status bar shows `EXT`.
- **Protected**: a range marked by `Tools → Protect Document` as read-only. Caret can enter but typing is rejected; selection includes a dashed darker-blue outline; attempts to edit emit a beep and a status bar message "This modification is not allowed because the selection is locked."

### 8.5 Selection rendering

- Active selection: background `COLOR_HIGHLIGHT` (`#000080`), text `COLOR_HIGHLIGHTTEXT` (`#FFFFFF`). (Modern theme: `accent` color.)
- Inactive selection (document lost focus): background `#C0C0C0`, text unchanged. (Word 95 dims selection when focus moves to the menu; we follow.)
- Column selection: same colors but rendered as a rectangle per line.

### 8.6 Cursors

| Cursor                           | Context                                                |
| -------------------------------- | ------------------------------------------------------ |
| I-beam                           | Over body text (default)                               |
| Left-pointing arrow up-and-right | Selection gutter                                       |
| Standard arrow                   | Over chrome (menus, toolbars, scrollbars)              |
| Crosshair                        | In drawing mode (after selecting a drawing tool)       |
| Move (4-arrow)                   | Over a selected range (drag-to-move)                   |
| Move with + badge                | Ctrl+drag over selection (drag-to-copy)                |
| No-drop (circle with slash)      | Drag over a read-only region                           |
| Double-arrow horizontal          | Column border, indent marker, margin boundary          |
| Double-arrow vertical            | Row border, split bar, horizontal scrollbar resize     |
| Help (arrow + ?)                 | In Shift+F1 help mode, until a target is clicked       |
| Wait (hourglass / spinner)       | During long operations (save, open, spellcheck of doc) |
| Progress (arrow + hourglass)     | Background work ongoing but UI responsive              |

---

## 9. Scrollbars, Splitters, Rulers — Misc

### 9.1 Vertical scrollbar (document)

- 16 px wide.
- **Up arrow** at top (16×16), **down arrow** at bottom (16×16). Arrow glyphs per Win95.
- **Thumb** proportional to visible viewport; draggable.
- Right-click: system menu (Scroll Here, Top, Bottom, Page Up, Page Down, Scroll Up, Scroll Down).
- Below the down arrow: **Previous Object** (16×16, `◂◂`), **Select Browse Object** (16×16, circular icon), **Next Object** (16×16, `▸▸`). These are the classic Word "browse by object" controls — Word 95 had them.
- **Split box** above the up arrow: 4 px tall bar; hover cursor is vertical double-arrow; drag down to create a split pane.

### 9.2 Horizontal scrollbar (document)

- 16 px tall.
- Left and right arrow buttons at each end.
- At the far left (before the left-arrow): **View switcher** — three 16×15 buttons for Normal, Page Layout, Outline views (these are flush with the scrollbar body).
- Thumb proportional; draggable.

### 9.3 Split bars (within a single document)

A split bar is a 4 px horizontal bar that, when dragged down from the scrollbar's split box, creates two vertical panes inside the document window, each with its own ruler and scroll bars. To remove, drag the split bar all the way to the top or bottom, or choose `Window → Remove Split`.

### 9.4 Double-click split box: toggles 50/50 split ↔ removed.

---

## 10. Status Bar

### 10.1 Layout

Status bar spans the full width of the outer frame. Height 20 px. Sections, left to right:

```
+--------+--------+--------+---------+-----------+--------+--------+------+-------+-------+-------+----------+----------+
| Page   | Sec    | x/y    | At 1"   | Ln 1      | Col 1  |        | REC  | MRK   | EXT   | OVR   | English  | ✓ Spell  |
| Page 1 | Sec 1  | 1/1    |         |           |        |        |      |       |       |       |          |          |
+--------+--------+--------+---------+-----------+--------+--------+------+-------+-------+-------+----------+----------+
```

- Each section has a 3D sunken border (1 px dark inside, 1 px light outside reversed — `SS_SUNKEN`).
- Text: Tahoma 8 pt, `COLOR_BTNTEXT`.
- Hover: no visual change, but tooltip after 500 ms.
- Double-click a section: invokes an action (see 10.3).

### 10.2 Section contents

1. **Page X** — current page number in the whole document.
2. **Sec Y** — current section number.
3. **x/y** — current page / total pages (e.g., "3/12").
4. **At N.N"** — distance from top of page to caret (in current unit).
5. **Ln L** — line number on current page (Word 95 counted only the visible line on screen — we follow).
6. **Col C** — column (character offset on the line, 1-based).
7. (blank spacer — grows to push right-aligned items to the right)
8. **REC** — present and **bold** when recording a macro; grayed otherwise.
9. **MRK** — present and bold when "Mark Revisions" is on (`Tools → Revisions → Mark Revisions While Editing`); grayed otherwise.
10. **EXT** — bold when Extend Selection Mode (F8) is on.
11. **OVR** — bold when Overtype mode is on (toggled by Insert key).
12. **Language** — current language tag for the selection/caret (default "English (US)").
13. **Spell status icon** — a 16×16 icon representing background spellcheck state:
    - Animated (pen writing in book) when a check is in progress.
    - Red X over book when errors exist in visible portion.
    - Green check when clean.
    - Gray when spellcheck disabled.

### 10.3 Double-click targets

| Section       | Double-click action              |
| ------------- | -------------------------------- |
| Page X        | Opens Go To dialog (Page tab)    |
| Sec Y         | Opens Go To dialog (Section tab) |
| x/y           | Opens Go To dialog               |
| At / Ln / Col | Opens Go To dialog               |
| REC           | Starts/stops macro recording     |
| MRK           | Toggles Mark Revisions           |
| EXT           | Toggles Extend Selection mode    |
| OVR           | Toggles Overtype mode            |
| Language      | Opens Language dialog            |
| Spell icon    | Opens Spelling dialog            |

### 10.4 Tooltips

Mouse-over a section shows a tooltip describing what it is and what double-click does:

- "Current page. Double-click to go to another page."
- "Current section. Double-click to go to another section."
- "Position of caret from top of page."
- "Line number."
- "Column number."
- "Recording a macro. Double-click to stop/start recording."
- etc.

### 10.5 Live updating

Every status region updates within 50 ms of the underlying state change — implemented via React state subscription with batching. The spell icon's animated frames advance at 6 fps (frame 0–5, 166 ms each) only while a check is running; otherwise it is static.

### 10.6 Accessibility

- The status bar is an ARIA `region` with `aria-label="Status"`.
- Each section is a `status` role live region with `aria-live="polite"`.
- Double-clickable sections expose `role="button"` with `aria-label` matching the tooltip text; they are keyboard-activatable via Tab + Enter from the F10-menu-focus chain (Tab cycles through menu → toolbars → status bar → document).

---

## 11. Print Preview UX

Print Preview is a **distinct view** replacing the normal document view while active. Entered via `File → Print Preview` or the Print Preview toolbar button (Ctrl+F2).

### 11.1 Chrome

Toolbar (replaces Standard toolbar while in preview):

```
[ Print ] [ Magnifier ] [ One Page ] [ Multiple Pages ▼ ] [ Zoom ▼ ]
[ View Ruler ] [ Shrink to Fit ] [ Full Screen ] [ Close ] [ Help ]
```

Menu bar: same bars are still present but many items are disabled (those not relevant to preview).

### 11.2 Cursors and pointer modes

- **Magnifier mode (default)**: cursor is a magnifying glass with `+` (zoom in) or `-` (zoom out). Click on the page to toggle between fit-width-zoom and 100%.
- **Edit mode**: toggled via the Magnifier button (it is a sticky toggle). Cursor becomes I-beam; direct text editing works on the preview pages.

### 11.3 Multi-page view

- `Multiple Pages` button opens a grid popup: 1×1, 1×2, 1×3, 2×2, 2×3, 2×4. Release selects that layout.
- Pages render side by side, wrapping when the workspace width is exhausted.

### 11.4 Shrink to fit

When the document's last page has only a few lines, pressing **Shrink to Fit** attempts to reduce font sizes (across the whole document) enough to eliminate the trailing nearly-empty page. An **Undo** is recorded with action description "Shrink to Fit".

### 11.5 Margin editing in preview

- When the ruler is shown (`View Ruler` button), margin boundaries are draggable as in normal view.
- Dragging shows live reflow.

### 11.6 Close

- `Close` button (or Esc) returns to the previous view (Normal, Page Layout, etc.).
- The previous view's scroll position is restored.

---

## 12. Find and Replace (Details)

### 12.1 Options panel — expand/collapse

The dialog's Options section (checkboxes and buttons) can be collapsed to shrink the dialog. An `Options >>` button (with the chevron) toggles the section. Default: collapsed for a small dialog.

### 12.2 Option meanings

- **Match case**: case-sensitive match.
- **Find whole words only**: matches only if both ends of the match sit at word boundaries (non-alphanumeric or start/end of paragraph).
- **Use Pattern Matching**: enables Word-style wildcards (NOT regex). Supported patterns:

  | Pattern  | Meaning                                      |
  | -------- | -------------------------------------------- |
  | `?`      | any single character                         |
  | `*`      | any sequence of characters (minimal match)   |
  | `[abc]`  | any of a, b, c                               |
  | `[a-z]`  | any in range                                 |
  | `[!abc]` | any not in the set                           |
  | `<`      | word start boundary                          |
  | `>`      | word end boundary                            |
  | `{n}`    | exactly n of previous                        |
  | `{n,}`   | n or more                                    |
  | `{n,m}`  | between n and m                              |
  | `@`      | one or more of previous                      |
  | `()`     | grouping, referenced by `\1`…`\9` in replace |

  Word's pattern matching is **not** POSIX regex. We implement Word's set exactly.

- **Sounds Like**: Soundex-based match (English only for v1; other languages v2).
- **Find All Word Forms**: morphological match (run/ran/running). Implement via a morphology dictionary; English only for v1.

### 12.3 Special menu (content)

The `Special >>` button menu lists meta-characters that get inserted into Find/Replace strings:

- Paragraph Mark `^p`
- Tab Character `^t`
- Any Character `^?`
- Any Digit `^#`
- Any Letter `^$`
- Caret `^^`
- Column Break `^n`
- Em Dash `^+`
- En Dash `^=`
- Endnote Mark `^e`
- Field `^d`
- Footnote Mark `^f`
- Graphic `^g`
- Manual Line Break `^l`
- Manual Page Break `^m`
- Non-breaking Hyphen `^~`
- Non-breaking Space `^s`
- Optional Hyphen `^-`
- Section Break `^b`
- White Space `^w`
- Clipboard Contents (Replace only) `^c`
- Find What Text (Replace only) `^&`

Replace-specific special codes are only shown when the Replace-with field is focused.

### 12.4 Format menu

The `Format >>` button presents a menu: Font..., Paragraph..., Tabs..., Language..., Frame..., Style..., Highlight. Selecting one opens a reduced variant of the corresponding Format dialog that sets **search criteria** (not modifying text). The criteria are displayed beneath the Find-what field as a small string (e.g., "Format: Font: Bold").

**No Formatting** button clears the format criteria for the currently focused (Find or Replace) field.

### 12.5 Buttons

- **Find Next** — advances search; re-enabled after each find.
- **Replace** — replaces current match and advances.
- **Replace All** — replaces all; shows a summary "N replacements made" on completion.
- **Cancel** — closes (Esc also closes).

### 12.6 Go To tab

Navigational tab. Controls:

- Left listbox: "Go to What" (entities).
- Right text field: label flips based on entity ("Enter page number", "Enter bookmark name", etc.).
- Previous and Next buttons traverse by the entity type.

Relative entries accepted: `+1` (next), `-1` (previous), `%50` (half), `5%` (5 percent into document).

### 12.7 Highlighting match in document

The match is highlighted with a strong blue selection (same as selection color), and the view scrolls so that the match is at least 15% away from top/bottom edges.

---

## 13. Spell Check

### 13.1 Word 95 baseline

Word 95 **did not** have inline squiggle underlines (that's Word 97's "spell-as-you-type"). Word 95 had only the modal dialog-based spellcheck (`Tools → Spelling`).

Our default matches Word 95: no inline squiggle. We expose two optional preferences:

- **"Check spelling as you type"** (Tools → Options → Spelling → Check spelling as you type) — when **on**, inline red squiggle underlines appear under misspelled words. Default: **off** (to match Word 95). Users who want the modern experience can turn it on.
- **"Hide spelling errors in current document"** — when on, suppress squiggles per-document.

### 13.2 Inline squiggle rendering (when enabled)

- A 1 px red zigzag (2 px peak-to-peak, 4 px period) beneath the misspelled word.
- Color: `#E81123` (Win95-ish red; modern tweak).
- Does not interfere with underline formatting — squiggle sits 2 px below the underline line.
- Right-click opens the spelling error context menu (§3.7).

### 13.3 Spelling dialog (F7)

```
+-----------------------------------------------------+
| Spelling: English (US)                    [?][X]    |
+-----------------------------------------------------+
| Not in Dictionary:                                  |
|  [receieve]                                         |
|                                                     |
| Change To:    [receive                    ]         |
| Suggestions:                                        |
|  ┌────────────────────────────┐                     |
|  │ receive                    │  [Ignore]           |
|  │ receiver                   │  [Ignore All]       |
|  │ receives                   │  [Change]           |
|  │ ...                        │  [Change All]       |
|  └────────────────────────────┘  [Add]              |
|                                   [Suggest]         |
|                                   [AutoCorrect]     |
|                                                     |
| Add Words To: [CUSTOM.DIC          ▼]               |
| [ ] Always Suggest                                  |
|                                                     |
|                 [Options...]  [Undo Last]  [Cancel] |
+-----------------------------------------------------+
```

- Dialog is **modeless** during the spellcheck walk; the document advances to each error; the dialog remains on top.
- "Change To" field is pre-populated with the top suggestion.
- Enter in the dialog triggers the default action (Change if Change To differs from the misspelled word; Ignore otherwise).
- Esc closes the dialog.

### 13.4 Flow

1. User triggers F7 / toolbar button / context menu.
2. App finds the first misspelling starting at the caret (or the whole document from start if no selection; or only within selection if a selection is non-empty — a prompt asks "Do you want to continue checking from the beginning?" at end of selection).
3. Dialog opens; user actions advance the pointer.
4. On completion: message "The spelling check is complete." with OK button.

### 13.5 Add to dictionary

- Custom dictionary list configurable in Tools → Options → Spelling.
- Default custom dictionary: `CUSTOM.DIC`.
- Changes persist to the selected custom dictionary file.

---

## 14. Grammar Check

### 14.1 Dialog-based (matches Word 95)

`Tools → Grammar` (no default keyboard shortcut; we add none — avoid overloading F7-family).

Dialog layout mirrors Spelling but with:

- "Sentence" box showing the problematic sentence with the offending portion highlighted (underlined).
- Grammar rule description pane ("Passive voice: Consider revising...").
- Change To field (where applicable).
- Buttons: Ignore, Ignore Rule, Change, Next Sentence, Options, Cancel.

### 14.2 Readability statistics

On completion of a grammar check, a dialog presents readability statistics:

```
Readability Statistics
  Counts:
    Words                 245
    Characters           1342
    Paragraphs              8
    Sentences              17
  Averages:
    Sentences per paragraph 2.1
    Words per sentence     14.4
    Characters per word     5.3
  Readability:
    Passive sentences       12%
    Flesch Reading Ease     63.2
    Flesch-Kincaid Grade    8.7
                  [OK]
```

Toggled by Tools → Options → Grammar → "Show readability statistics".

---

## 15. Zoom

### 15.1 Zoom dialog (View → Zoom)

```
Zoom
  Zoom To:
    ( ) 200%
    ( ) 150%
    ( ) 100%
    ( ) 75%
    (•) 50%
    ( ) Page Width
    ( ) Whole Page
    ( ) Many Pages    [thumbnail grid 1x1 … 2x4]
    Percent: [  50 ]%
  Preview:
    [tiny sample pane showing scale]
              [OK] [Cancel]
```

### 15.2 Zoom toolbar combo

Standard toolbar has a Zoom combo:

- Dropdown values: 50%, 75%, 100%, 150%, 200%, Whole Page, Page Width, Two Pages.
- Free numeric entry: 10–500 range; non-integer allowed to one decimal.
- `Ctrl+scroll` in document zooms by 10% per tick (our modern addition, see §8).

### 15.3 Zoom effects

- Affects only rendering, not actual document formatting.
- Persisted per-document.
- Ruler ticks rescale accordingly.
- In multi-page preview modes, zoom is computed from "fit to N pages".

---

## 16. Split Window (in-child)

### 16.1 Creation

- **From the split box**: drag the 4 px bar above the vertical scrollbar's up arrow downward. A horizontal split line follows the pointer. Release creates two panes.
- **Menu**: `Window → Split`. A movable split line attaches to the pointer; click to place.
- **Keyboard**: `Alt+Ctrl+S` — same as menu.

### 16.2 Panes

Each pane:

- Has its own ruler (when ruler is visible).
- Has its own vertical scrollbar.
- Shares the same horizontal scrollbar (single horizontal scroll for both panes).
- Shares the same view mode initially; `View → Normal/Page Layout/Outline` can be set per pane.
- Cursor in one pane blinks; the other pane's caret is static (not focus-follows — only the focused pane has an active caret).

### 16.3 Move and remove

- Drag the split line to resize panes.
- Double-click the split line: removes the split.
- `Window → Remove Split`: removes (menu label changes from Split to Remove Split when active).

### 16.4 Cross-pane navigation

- F6 (without Ctrl) moves focus between panes within the same child document.
- Ctrl+F6 moves between child windows.

---

## 17. Views and View Transitions

### 17.1 Views catalog

- **Normal (Draft)** — continuous text, no margins shown, fastest.
- **Outline** — structured headings with collapse/expand.
- **Page Layout (Print Layout)** — WYSIWYG, shows page edges and margins.
- **Master Document** — special outline with subdocument references.
- **Print Preview** — separate mode, see §11.
- **Full Screen** — hides all chrome.

### 17.2 Switcher

- At the **far left of the horizontal scrollbar** — three 16×15 buttons for Normal / Page Layout / Outline (Master Document via menu only).
- Menu: `View → Normal` / `Outline` / `Page Layout` / `Master Document`. Radio group.
- Keyboard: Ctrl+Alt+N / O / P (see §7.3).

### 17.3 View-specific chrome

- **Normal**: no page edges; horizontal ruler; no vertical ruler.
- **Page Layout**: page edges visible with gray between them; horizontal and vertical rulers.
- **Outline**: an Outlining toolbar appears (auto-opens when switching to Outline; hides when leaving). Vertical ruler hidden.
- **Master Document**: Outlining toolbar plus Master Document toolbar.

### 17.4 Full Screen

`View → Full Screen`:

- Hides menu bar, toolbars, ruler, status bar, scrollbars.
- Shows only the document and a tiny **Close Full Screen** floating button (16×16) at the lower-right.
- Esc exits full screen.
- All menu commands remain accessible via shortcuts and via F10 → menus (which auto-show when the Alt key is pressed, then auto-hide).

---

## 18. Accessibility

### 18.1 Baseline requirements

- **Keyboard access**: every interactive element reachable via keyboard. There is no mouse-only feature.
- **Tab order**: menu bar → toolbars → ruler (when present) → document → status bar. Within each region, left-to-right / top-to-bottom.
- **Focus indication**: 1 px dotted rectangle around focused chrome items; blinking caret for text.
- **F10** and **Alt** toggle menu focus identically.
- **Ctrl+Tab** from menu focus moves to toolbar focus; from toolbar focus moves to status bar focus; from status bar focus returns to the document.
- **Esc** from any chrome focus returns to the document.

### 18.2 Screen reader support (NVDA, JAWS, VoiceOver, Orca)

- Menu bar: `role="menubar"`; children `role="menu"` / `role="menuitem"`; submenus `role="menu"` with `aria-haspopup`.
- Toolbars: `role="toolbar"`; buttons `role="button"` with `aria-label` matching tooltip; toggle buttons expose `aria-pressed`.
- Status bar: `role="status"` (live region).
- Dialogs: `role="dialog"` with `aria-modal="true"` (modal) or `aria-modal="false"` (modeless); labelled by the title bar text.
- Document: `role="document"` with text content exposed via an internal accessibility tree that mirrors the document model (paragraphs as `role="paragraph"`, headings with `role="heading"` and `aria-level`, lists, tables).
- Live regions:
  - Status bar section changes announce via `aria-live="polite"`.
  - Error beeps and "This modification is not allowed" messages via `aria-live="assertive"`.

### 18.3 High-contrast mode

- Detect OS high-contrast (Windows: `prefers-contrast: high` via Electron's contrast query; macOS: Increase Contrast; Linux: varies).
- In high-contrast, replace:
  - `COLOR_3DFACE` with system window background.
  - Toolbar icons become monochrome silhouettes (use the OS high-contrast palette).
  - Selection uses `SystemHighlight` / `SystemHighlightText`.
- Chrome bevels may flatten: in HC modes, the 1 px light/dark bevels become a single 1 px border `ButtonText`.

### 18.4 Zoom and DPI

- Respects OS display scaling.
- Chrome scales crisply: SVG icons re-rasterize at each scale; font metrics use OS font sizes.
- Document zoom is independent of OS scale.

### 18.5 Mouse alternative support

- Compatible with Windows MouseKeys / macOS Mouse Keys.
- All drag-drop operations also have keyboard equivalents (e.g., cut + paste instead of drag-drop text; Format → Tabs dialog instead of ruler drag).
- Column select: Ctrl+Shift+F8 (keyboard column select), arrow keys to size.

### 18.6 Accessible naming conventions

- Toolbar buttons: `aria-label` = tooltip text (e.g., "Bold").
- Menu items with accelerators: the accelerator is announced as part of the accessible name (e.g., "Bold, Ctrl+B").
- Status bar sections: announced with their label and value ("Page 3 of 12").

---

## 19. Theming

### 19.1 Primary theme — Windows 95

**Font stack** (in order):

1. `"MS Sans Serif"`, 8 pt — authentic Win95. Not installed by default on modern systems; we bundle a freeware near-copy (`ms-sans-serif-webfont`) and fall back to Tahoma then system-ui.
2. Tahoma 8 pt — shipped with IE4/Win98; decent approximation.
3. System UI default.

We render **MS Sans Serif 8 pt** as the pixel-accurate default in the Win95 theme. Measure: cap-height 8 px, x-height 5 px, descender 2 px. Line height 13 px.

**Color palette (Win95 system colors)**:

| Alias                        | Value   | Uses                             |
| ---------------------------- | ------- | -------------------------------- |
| COLOR_3DFACE / COLOR_BTNFACE | #C0C0C0 | Chrome background, toolbar, menu |
| COLOR_3DSHADOW               | #808080 | Outer-bottom-right bevels        |
| COLOR_3DDKSHADOW             | #000000 | Inner dark bevel                 |
| COLOR_3DHILIGHT / BTNHILIGHT | #FFFFFF | Outer-top-left bevels            |
| COLOR_3DLIGHT                | #DFDFDF | Inner light bevel                |
| COLOR_WINDOW                 | #FFFFFF | Document client area             |
| COLOR_WINDOWTEXT             | #000000 | Document text                    |
| COLOR_APPWORKSPACE           | #808080 | MDI workspace bg                 |
| COLOR_MENU                   | #C0C0C0 | Menu bg                          |
| COLOR_MENUTEXT               | #000000 | Menu text                        |
| COLOR_HIGHLIGHT              | #000080 | Selection bg                     |
| COLOR_HIGHLIGHTTEXT          | #FFFFFF | Selection text                   |
| COLOR_INACTIVECAPTION        | #808080 | Inactive title bar               |
| COLOR_ACTIVECAPTION          | #000080 | Active title bar                 |
| COLOR_CAPTIONTEXT            | #FFFFFF | Active caption text              |
| COLOR_INACTIVECAPTIONTEXT    | #C0C0C0 | Inactive caption text            |
| COLOR_INFOBK                 | #FFFFE1 | Tooltip bg                       |
| COLOR_INFOTEXT               | #000000 | Tooltip text                     |
| COLOR_SCROLLBAR              | #C0C0C0 | Scrollbar track                  |

**Bevels**:

- "Raised" 3D button: 1 px light top+left outer, 1 px dark bottom+right outer; then 1 px light inner top+left, 1 px dark inner bottom+right.
- "Sunken": the inverse.
- Menu / drop-down panel: 1 px dark outer, 1 px light inner (simple 2-tone bevel).
- Drop shadow: 2 px solid `#808080` offset to bottom-right under popups.

### 19.2 Modern theme (optional, off by default in v1; default in v2)

- Flat design. No bevels. 1 px subtle separators `#E1E1E1`.
- System font (Segoe UI on Windows, San Francisco on macOS, Cantarell/Inter on Linux), 9 pt.
- Selection color: OS accent.
- Toolbar buttons: square flat icons, hover fill `#F0F0F0`, pressed fill `#D9D9D9`, toggled fill `accent @ 15%`.
- Dark mode supported: background `#1F1F1F`, chrome `#2A2A2A`, text `#FFFFFF`.

### 19.3 Theme switcher

- `Tools → Options → General → Appearance:`
  - Dropdown: "Windows 95 (classic)" / "Modern light" / "Modern dark" / "System".
- Applies live, no restart required.
- Dialogs and all chrome update within 50 ms.

---

## 20. Animation Policy

Word 95 was **not animated**. We do not add animations to menus, toolbars, dialogs, or window chrome in the Win95 theme.

- Menu opening: instant.
- Dialog opening: instant (no fade).
- Toolbar docking: instant snap.
- Tooltip appearance: instant after the 500 ms delay.
- Spell icon (status bar) is an exception: **it was animated in Word 95** — the pen-in-book graphic cycles when spellcheck is running. We match.
- Macro record indicator (red dot pulsing): Word 95 did not pulse; **REC** just appears bold. We match.

In the Modern theme, soft fade-in (120 ms) and menu-slide (80 ms) are enabled.

---

## 21. Cursor Shapes (Full Catalog)

| Cursor                     | Where shown                                                 |
| -------------------------- | ----------------------------------------------------------- |
| I-beam (`text`)            | Over body text                                              |
| Arrow (`default`)          | Over menus, toolbars, scrollbars, buttons                   |
| Selection arrow            | Selection gutter                                            |
| Crosshair                  | Drawing tools in drawing mode                               |
| Move (4-way arrow)         | Over selected text; over draggable frame; over drag gripper |
| Resize EW (`ew-resize`)    | Column border, margin boundary, indent marker               |
| Resize NS (`ns-resize`)    | Row border, split bar                                       |
| Resize NWSE                | Image/object lower-right corner                             |
| Resize NESW                | Image/object lower-left corner                              |
| Help (`help`)              | In Shift+F1 "What's this?" mode                             |
| Hand (`pointer`)           | Over hyperlinks in Ctrl+hover state                         |
| Not-allowed                | Drag over read-only region or invalid drop target           |
| Wait (hourglass)           | During synchronous long operations                          |
| Progress (arrow+hourglass) | Background operation ongoing but UI responsive              |
| Vertical I-beam            | For vertical text layouts (v2)                              |

Cursor bitmaps use the standard OS system cursors in the Win95 theme (Windows)/matching cursors (macOS, Linux). Custom cursors (selection arrow in gutter, help cursor) are our own 32×32 bitmaps with appropriate hotspots.

---

## 22. Drag Sources and Targets

### 22.1 Sources in our app

| Object                                      | MIME / type emitted                                                  |
| ------------------------------------------- | -------------------------------------------------------------------- |
| Text selection                              | `text/plain` + `text/html` + `application/vnd.ms-word.docx-fragment` |
| Selected image                              | `image/png` + internal image id                                      |
| Frame / drawing                             | Internal frame/drawing id                                            |
| Toolbar button (when Customize dialog open) | Internal command id                                                  |
| Menu item (when Customize dialog open)      | Internal command id                                                  |

### 22.2 Targets we accept

| Source                                          | Effect                                                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| External file drop (.doc/.docx/.rtf/.txt/.html) | Insert File at drop caret                                                                       |
| External image drop (.png/.jpg/.gif/.bmp/.tif)  | Insert Picture at drop caret                                                                    |
| External image from clipboard (paste)           | Insert Picture at caret                                                                         |
| External tabular data (Excel / CSV)             | Prompt: "Keep Source Formatting" / "Match Destination" / "Keep Text Only" — paste special popup |
| Plain text from another app                     | Insert Text at drop caret                                                                       |
| HTML from a browser                             | Insert as HTML via conversion pipeline                                                          |
| URL drag                                        | Insert as hyperlink (v2) or as plain text (v1)                                                  |
| Our own selection                               | Move (or Ctrl+drag = copy) to drop caret                                                        |

Visual feedback:

- Drop caret follows pointer within document.
- Drop-not-allowed cursor when over disallowed target (e.g., read-only region).

---

## 23. Click-through Focus (Critical Behavior)

Clicking a **toolbar button** or a **menu item** must **NOT steal text focus** from the document. This is the defining Word behavior that allows, for example, clicking Bold while the caret is in the middle of selected text.

Implementation note (for the engineer):

- Toolbars and menus, in our React tree, are **not** focusable roots by default.
- Their mouse-click handlers run the command against the current document selection without calling `.focus()` on any element.
- When a combo's edit field is clicked, focus **does** move to that edit (because typing is required there); after Enter or Escape, focus returns to the document (via an explicit `documentCanvas.focus()` call).
- Keyboard access via F10 / Alt moves focus into the menu bar; this is explicit and expected.

Test case: user selects text "hello" in a document. Moves mouse to the Bold toolbar button and single-clicks. After the click:

- Document still has focus (caret still blinks in the same selection).
- "hello" is now bold.
- Selection is preserved exactly.

Similar rule for Format Painter button, Zoom combo (after commit), etc.

---

## 24. Localization Readiness

### 24.1 v1

- All UI strings ship as English only but are stored in `src/i18n/en/*.json` bundles — NOT hard-coded in components.
- Keyboard shortcuts: Ctrl on Windows/Linux, Cmd on macOS — no localization of modifier names in the UI (menus show English labels "Ctrl+B" on all platforms).
- Numbers, dates, currencies in the status bar and date/time fields use the OS locale by default; configurable in `Tools → Options → User Info → Locale`.

### 24.2 v2 outlook

- RTL UI (Arabic, Hebrew): mirror toolbars, menus, and text flow.
- Translation bundles for top-10 languages.
- Locale-specific paper sizes in Page Setup defaults.

---

## 25. Visual Wireframes

This section provides ASCII wireframes for each major UI surface. These are illustrative, not pixel-perfect, but show structural layout and relative sizes.

### 25.1 Main window (one document open, maximized)

```
+-----------------------------------------------------------------------+
| [W] Microsoft Word - [Letter.docx]                       [_] [□] [X]  | 30 px
+-----------------------------------------------------------------------+
| File  Edit  View  Insert  Format  Tools  Table  Window  Help  [_][□][X]| 20 px  <- child's min/max/close merged to right
+-----------------------------------------------------------------------+
| [▫][▫][▫][▫][▫][▫] [▫][▫][▫][▫] [▫▼][▫▼] [▫][▫][▫][▫] [▫][▫][▫][▫]  | 22 px  <- Standard toolbar
| Normal▼ [Times New Roman ▼] [10▼] [B][I][U] [L][C][R][J] [▫][▫] ...  | 22 px  <- Formatting toolbar
+-----------------------------------------------------------------------+
| L .▮...|...1...|...2...|...3...|...4...|...5...|...6...|...7...| R   | 18 px  <- Horizontal ruler
+-----------------------------------------------------------------------+
|                                                                     [↑]|
|   +-----------------------------------------------------------+     [█]|
|   |                                                           |     [█]|
|   |   Lorem ipsum dolor sit amet, consectetur adipiscing      |     [█]|
|   |   elit. |                                                 |     [█]|
|   |                                                           |     [█]|
|   |                                                           |     [█]|
|   |                                                           |     [█]|
|   |                                                           |     [█]|
|   +-----------------------------------------------------------+     [█]|
|                                                                     [▼]|
|                                                                     [⤹]|  <- browse-prev
|                                                                     [●]|  <- browse-select
|                                                                     [⤸]|  <- browse-next
+-----------------------------------------------------------------------+
| [↕][◀][======████======][▶]                                           | 16 px  <- horizontal scrollbar
+-----------------------------------------------------------------------+
| Page 1 Sec 1  1/1 | At 1"  Ln 1  Col 1 | REC MRK EXT OVR | English |✓| 20 px
+-----------------------------------------------------------------------+
```

### 25.2 Main window with two child documents tiled

```
+-----------------------------------------------------------------------+
| [W] Microsoft Word                                       [_] [□] [X]  |
+-----------------------------------------------------------------------+
| File Edit View Insert Format Tools Table Window Help                  |
+-----------------------------------------------------------------------+
| [Standard toolbar]                                                    |
| [Formatting toolbar]                                                  |
+-----------------------------------------------------------------------+
| [H ruler]                     | [H ruler for right pane]              |
+-------------------------------+---------------------------------------+
| +---------------------------+ | +----------------------------------+  |
| | [▫] Doc1.docx   [_][□][X] | | | [▫] Doc2.docx      [_][□][X]     |  |
| +---------------------------+ | +----------------------------------+  |
| |                          ↑ | |                                  ↑|  |
| |  Document 1 content      █ | |  Document 2 content              █|  |
| |                          █ | |                                  █|  |
| |                          █ | |                                  █|  |
| |                          ▼ | |                                  ▼|  |
| +---------------------------+ | +----------------------------------+  |
+-----------------------------------------------------------------------+
| Status bar                                                            |
+-----------------------------------------------------------------------+
```

### 25.3 Main window with one minimized child

```
+-----------------------------------------------------------------------+
| [W] Microsoft Word                                       [_] [□] [X]  |
+-----------------------------------------------------------------------+
| File Edit View Insert Format Tools Table Window Help                  |
+-----------------------------------------------------------------------+
| Toolbars                                                              |
+-----------------------------------------------------------------------+
|                                                                       |
|   +---------------------------------------------------------+         |
|   | [▫] Doc2.docx (active, maximized)    [_][□][X]          |         |
|   +---------------------------------------------------------+         |
|   |                                                        ↑          |
|   |  ...                                                   █          |
|   |                                                        ▼          |
|   +---------------------------------------------------------+         |
|                                                                       |
|                                                                       |
|                                                                       |
|                                                                       |
|   [▫] Doc1.docx              [↑][X]                                   |  <- minimized icon strip
+-----------------------------------------------------------------------+
| Status bar                                                            |
+-----------------------------------------------------------------------+
```

### 25.4 Font dialog

```
+-------------------------------------------------------------+
| Font                                              [?] [X]   |
+-------------------------------------------------------------+
| [ Font ] [ Character Spacing ]                              |
+-------------------------------------------------------------+
|                                                             |
|   Font:                 Font Style:           Size:         |
|   [Times New Roman ▼]   [Regular      ▼]      [ 10 ▼]      |
|   ┌────────────────────┐┌─────────────┐      ┌─────┐       |
|   │ Symbol             ││ Regular     │      │  8  │       |
|   │ Tahoma             ││ Italic      │      │  9  │       |
|   │ Times New Roman  ◀ ││ Bold        │      │ 10  │       |
|   │ Trebuchet MS       ││ Bold Italic │      │ 11  │       |
|   │ Verdana            ││             │      │ 12  │       |
|   └────────────────────┘└─────────────┘      └─────┘       |
|                                                             |
|   Underline:            Color:                              |
|   [None ▼]              [■ ▼] Automatic                     |
|                                                             |
|   Effects:                                                  |
|   [ ] Strikethrough     [ ] Hidden                          |
|   [ ] Superscript       [ ] Small Caps                      |
|   [ ] Subscript         [ ] All Caps                        |
|                                                             |
|   Preview:                                                  |
|   +-------------------------------------------------+       |
|   |                                                 |       |
|   |     Times New Roman                             |       |
|   |                                                 |       |
|   +-------------------------------------------------+       |
|                                                             |
|                                                             |
|   [Default...]                       [OK]  [Cancel]  [Help] |
+-------------------------------------------------------------+
```

### 25.5 Find and Replace (Replace tab, options expanded)

```
+-------------------------------------------------------------+
| Find and Replace                                  [?] [X]   |
+-------------------------------------------------------------+
| [ Find ] [ Replace ] [ Go To ]                              |
+-------------------------------------------------------------+
| Find what:    [___________________________________] [▼]    |
| Replace with: [___________________________________] [▼]    |
|                                                             |
| Search: [All ▼]                                             |
| [x] Match case                                              |
| [x] Find whole words only                                   |
| [ ] Use Pattern Matching                                    |
| [ ] Sounds Like                                             |
| [ ] Find All Word Forms                                     |
|                                                             |
| [ No Formatting ]  [ Format ▼ ]  [ Special ▼ ]              |
|                                                             |
|            [Find Next] [Replace] [Replace All] [Cancel]     |
+-------------------------------------------------------------+
```

### 25.6 Paragraph dialog (Indents and Spacing tab)

```
+-------------------------------------------------------------+
| Paragraph                                         [?] [X]   |
+-------------------------------------------------------------+
| [ Indents and Spacing ] [ Text Flow ]                       |
+-------------------------------------------------------------+
|                                                             |
|   Indentation                                               |
|   ┌───────────────────────────────────────────────┐         |
|   │ Left:    [ 0" ▲▼]     Special:  [None      ▼] │         |
|   │ Right:   [ 0" ▲▼]     By:       [  ▲▼]        │         |
|   └───────────────────────────────────────────────┘         |
|                                                             |
|   Spacing                                                   |
|   ┌───────────────────────────────────────────────┐         |
|   │ Before:  [ 0 pt ▲▼]   Line Spacing: [Single ▼]│         |
|   │ After:   [ 0 pt ▲▼]   At:           [  ▲▼]    │         |
|   └───────────────────────────────────────────────┘         |
|                                                             |
|   Alignment: [Left ▼]                                       |
|                                                             |
|   Preview:                                                  |
|   ┌───────────────────────────────────────────────┐         |
|   │ Previous paragraph previous paragraph...     │         |
|   │ Sample text. Sample text. Sample text.       │         |
|   │ Sample text. Sample text. Sample text.       │         |
|   │ Following paragraph following paragraph...   │         |
|   └───────────────────────────────────────────────┘         |
|                                                             |
|   [Tabs...]                         [OK]  [Cancel]  [Help]  |
+-------------------------------------------------------------+
```

### 25.7 Options dialog (multi-tab)

```
+------------------------------------------------------------------+
| Options                                             [?] [X]      |
+------------------------------------------------------------------+
| [View] [General] [Edit] [Print] [Revisions] [User Info]          |
| [Compatibility] [File Locations] [Save] [Spelling] [Grammar]     |
| [AutoFormat]                                                     |
+------------------------------------------------------------------+
|                                                                  |
|   Show                                                           |
|   [x] Draft Font          [x] Status Bar                         |
|   [x] Wrap to Window      [x] Horizontal Scroll Bar              |
|   [x] Picture Placeholders[x] Vertical Scroll Bar                |
|   [x] Animated Text       [x] Style Area Width: [ 0" ▲▼]         |
|   [x] ScreenTips                                                 |
|                                                                  |
|   Nonprinting Characters                                         |
|   [ ] Tab Characters      [ ] Optional Hyphens                   |
|   [ ] Spaces              [ ] Hidden Text                        |
|   [ ] Paragraph Marks     [ ] All                                |
|                                                                  |
|                                              [OK]  [Cancel]      |
+------------------------------------------------------------------+
```

### 25.8 Insert Table grid popup (from toolbar)

```
      +---------------+
      |               |
      |   Insert      |
      |   Table       |
      |               |
      +---+-+-+-+-+-+-+
      |   | | | | | | |
      +---+-+-+-+-+-+-+
      |   | | | | | | |
      +---+-+-+-+-+-+-+
      |   | | | | | | |
      +---+-+-+-+-+-+-+
      |   | | | | | | |
      +---+-+-+-+-+-+-+
      |   3 x 4 Table |
      +---------------+
```

User drags over the grid; the pre-highlighted rectangle (e.g., 3 rows × 4 cols) updates live. Release creates the table.

### 25.9 Spelling dialog mid-check

```
+-------------------------------------------------------------+
| Spelling: English (US)                            [?] [X]   |
+-------------------------------------------------------------+
| Not in Dictionary:                                          |
| ┌─────────────────────────────────────────────────┐         |
| │ ...and then we recieved the message that the... │         |
| └─────────────────────────────────────────────────┘         |
|                                                             |
| Change To: [received                    ]                   |
|                                                             |
| Suggestions:                                                |
| ┌─────────────────────────────┐     [ Ignore      ]         |
| │ received                    │     [ Ignore All  ]         |
| │ receive                     │     [ Change      ]         |
| │ receiver                    │     [ Change All  ]         |
| │                             │     [ Add         ]         |
| │                             │     [ Suggest     ]         |
| │                             │     [ AutoCorrect ]         |
| └─────────────────────────────┘                             |
|                                                             |
| Add Words To: [ CUSTOM.DIC          ▼ ]                     |
| [ ] Always Suggest                                          |
|                                                             |
|                     [Options...]  [Undo Last]  [Cancel]     |
+-------------------------------------------------------------+
```

### 25.10 Print Preview

```
+-----------------------------------------------------------------------+
| [W] Microsoft Word - [Letter.docx (Preview)]          [_] [□] [X]     |
+-----------------------------------------------------------------------+
| File Edit View Insert Format Tools Table Window Help                  |
+-----------------------------------------------------------------------+
| [Print] [Mag] [1Pg] [MultiPg▼] [Zoom▼] [Ruler] [Shrink] [Full] [Close]|
+-----------------------------------------------------------------------+
|                                                                     [↑]|
|            +----------------------------+                           [█]|
|            |                            |                           [█]|
|            |                            |                           [█]|
|            |                            |                           [█]|
|            |    Page 1 of 3             |                           [█]|
|            |                            |                           [█]|
|            |                            |                           [█]|
|            |                            |                           [█]|
|            +----------------------------+                           [▼]|
+-----------------------------------------------------------------------+
| Page 1  Sec 1  1/3 | At 1"  Ln 1 ... | English                       |
+-----------------------------------------------------------------------+
```

### 25.11 Context menu on spelling error

```
     ...the recieved message...
             |      +---------------------------------+
             +---►  | received                        |
                    | recieve                         |
                    | receiver                        |
                    | receivers                       |
                    | ─────────────────────────────── |
                    | Ignore All                      |
                    | Add                             |
                    | ─────────────────────────────── |
                    | AutoCorrect                  ►  |
                    | ─────────────────────────────── |
                    | Spelling...                     |
                    +---------------------------------+
```

### 25.12 Toolbar being dragged (ghost outline)

```
Top-docked starting state:
+-----------------------------------------------------------------------+
| [::] [▫][▫][▫][▫][▫][▫] [▫][▫][▫][▫] ...                              |
+-----------------------------------------------------------------------+

During drag (user dragged gripper down into workspace):
+-----------------------------------------------------------------------+
| File Edit View Insert Format Tools Table Window Help                  |
+-----------------------------------------------------------------------+
|                                                                       |
|                                                                       |
|                 +.................................+                   |
|                 :  [ghost outline of toolbar]      :                   |
|                 +.................................+                   |
|                                                                       |
|                                                                       |
+-----------------------------------------------------------------------+
```

On release, the toolbar either snaps to an edge (if within 16 px) or becomes a floating window.

---

## 26. Error, Warning, and Confirmation Prompts

### 26.1 Message box types

Standard Win95-style message boxes with title, icon, message text, and buttons.

Icons:

- **Information** (blue i): "The spelling check is complete."
- **Warning** (yellow !): "This document contains macros. Do you want to enable them?"
- **Error** (red X): "Word cannot open this file. The file is damaged."
- **Question** (blue ?): "Do you want to save changes to Document1?"

Buttons on a question box: Yes / No / Cancel (in that order).

### 26.2 Save-on-close prompt

On close with unsaved changes:

```
+-------------------------------------------------+
| Microsoft Word                       [X]        |
+-------------------------------------------------+
|  [?] Do you want to save the changes you        |
|      made to Document1?                         |
|                                                 |
|                   [ Yes ] [ No ] [ Cancel ]     |
+-------------------------------------------------+
```

- Yes (default, Enter): save and close.
- No: discard and close.
- Cancel (Esc): abort close.

### 26.3 Beep vs. toast

We emit the OS system beep on invalid actions (e.g., Bold shortcut with empty selection and empty paragraph — actually valid, so no beep; but e.g., Tab in a read-only region). No toast notifications in the Win95 theme. Modern theme may show toasts at the bottom-right.

---

## 27. Keyboard Customize (Tools → Customize → Keyboard)

### 27.1 Dialog layout

```
+--------------------------------------------------------------+
| Customize Keyboard                                  [?] [X]  |
+--------------------------------------------------------------+
| Categories:                 Commands:                        |
| ┌──────────────────────┐   ┌────────────────────────────┐    |
| │ File                 │   │ FileOpen                   │    |
| │ Edit                 │   │ FileOpenExisting           │    |
| │ View                 │   │ FileSave                   │    |
| │ Insert               │   │ FileSaveAs                 │    |
| │ Format               │   │ FilePrint                  │    |
| │ Tools                │   │ ...                        │    |
| │ ...                  │   │                            │    |
| └──────────────────────┘   └────────────────────────────┘    |
|                                                              |
| Current Keys:              Press New Shortcut Key:           |
| ┌──────────────────────┐   [                            ]    |
| │ Ctrl+O               │   Currently Assigned To:            |
| │ Ctrl+F12             │   [                            ]    |
| └──────────────────────┘                                     |
|                                                              |
| Description:                                                 |
| ┌──────────────────────────────────────────────────────┐     |
| │ Opens an existing document or template.              │     |
| └──────────────────────────────────────────────────────┘     |
|                                                              |
| Save Changes In: [Normal.dot ▼]                              |
|                                                              |
| [Assign]  [Remove]  [Reset All...]           [Close] [Help]  |
+--------------------------------------------------------------+
```

### 27.2 Interaction

- Select a category → filters Commands list.
- Select a command → Current Keys populates with existing bindings; Description populates.
- Click "Press New Shortcut Key" field and press a key combination → the value appears as text (e.g., "Ctrl+Shift+G"); "Currently Assigned To" shows if that combo is already bound.
- "Assign" adds the new binding (warning if reassigning from another command).
- "Remove" removes the selected Current Key.
- "Reset All..." shows a confirmation and reverts all bindings to defaults for the selected template.

### 27.3 Storage

Keyboard bindings persist in the document template (`Normal.dot` by default). Per-document templates can override. Our runtime loads the merged binding map at doc open.

---

## 28. Mouse-Zoom Interaction Details (Ctrl+Scroll)

- Scroll up: zoom in by 10% (clamped to 500%).
- Scroll down: zoom out by 10% (clamped to 10%).
- Zoom center: the pointer position (the point under the cursor remains stationary during zoom).
- Debounce: 30 ms per step to avoid runaway on high-precision wheels.
- Updates the Zoom combo in the Standard toolbar live.

---

## 29. Implementation-relevant Notes (For the Engineer)

### 29.1 Bevel rendering

Use CSS borders, not images, to render 3D bevels — one class each for `.raised-2` and `.sunken-2`:

```css
.raised-2 {
  border-top: 1px solid #ffffff;
  border-left: 1px solid #ffffff;
  border-right: 1px solid #808080;
  border-bottom: 1px solid #808080;
  box-shadow:
    inset -1px -1px 0 #000,
    inset 1px 1px 0 #dfdfdf;
}
.sunken-2 {
  border-top: 1px solid #808080;
  border-left: 1px solid #808080;
  border-right: 1px solid #ffffff;
  border-bottom: 1px solid #ffffff;
  box-shadow:
    inset 1px 1px 0 #000,
    inset -1px -1px 0 #dfdfdf;
}
```

### 29.2 Icon authoring

- Author SVGs on a 16×16 grid.
- Pixel-snap strokes: paths placed on 0.5-offsets so 1 px strokes render sharp.
- Pure black silhouette + two gray shades (#808080 and #C0C0C0) plus accent colors limited to Win95 palette (red #800000, blue #000080, green #008000, yellow #FFFF00).
- Export as inline-SVG components; render with `image-rendering: pixelated` at 100% zoom.
- Provide 2× and 3× bitmap variants for HighDPI.

### 29.3 Font rendering

- Bundle `MS Sans Serif 8 pt`-compatible webfont (licensed replacement).
- Explicit text anti-aliasing disabled at 100% on the chrome, because the bitmap font is meant to be rendered without smoothing at 8 pt. Use `text-rendering: geometricPrecision; -webkit-font-smoothing: none; font-smoothing: none;`.
- Document body text uses the font picked by the style — anti-aliased normally.

### 29.4 Layout constraints

- Toolbar heights fixed at 22 px per row.
- Menu bar height fixed at 20 px.
- Status bar height fixed at 20 px.
- Ruler height fixed at 18 px.
- Scrollbars 16 px wide.
- Frame border (in-app-skinned) 1 px.

### 29.5 Double-click detection

- OS double-click threshold via `GetDoubleClickTime()` on Windows; 500 ms default.
- Triple-click: two double-clicks in sequence with each within threshold and pointer moved ≤ 4 px.
- Quadruple+ click: treated as triple (Word 95 semantics).

### 29.6 Tooltip debouncing

- 500 ms hover delay to first show.
- 100 ms hover delay to show the next tooltip within 500 ms of the previous one hiding (rapid-tour).
- 5000 ms auto-hide if the pointer is idle over the same element (Word 95 never auto-hid; we do for accessibility to avoid tooltips clogging the view).

### 29.7 Focus management invariants

- Document always has focus unless an explicit chrome element has taken it.
- When a menu / toolbar combo / dialog closes, focus returns to the last known document caret position.
- When a modeless dialog is open, focus can ping between dialog and document; neither blocks the other.

### 29.8 Z-order

1. Tooltips — top.
2. Popup menus / context menus.
3. Modeless dialogs (Find, Spelling).
4. Floating toolbars.
5. Modal dialogs (block underlying chrome).
6. Main frame chrome (menu bar, toolbars, status bar).
7. Child windows (in MDI workspace).
8. Workspace background.

### 29.9 Event bubbling rules

- Menu clicks do not reach the document.
- Toolbar button clicks reach their handler, which programmatically triggers the command on the document. Do NOT let the click bubble to the document.
- Scroll events in the chrome do not bubble into the document and vice versa.

---

## 30. Minimum Viable Specifications (v1 Cut List)

To keep the v1 scope manageable, the following UX items are **reduced or deferred** with specific guardrails:

| Item                                                | v1 state                                            | v2 adds                                     |
| --------------------------------------------------- | --------------------------------------------------- | ------------------------------------------- |
| Native multi-window preference                      | Preference exists, stubbed                          | Full native support                         |
| Customize dialog — drag buttons between toolbars    | Tabs exist; drag-drop may have cosmetic rough edges | Polished drag-drop across toolbars/menus    |
| Macro recording UI                                  | REC indicator works; recording saves to `.bas`      | Full VBA editor integration                 |
| Help topics viewer                                  | Simple HTML viewer                                  | Win95 Help Topics tabbed UI                 |
| Hyperlinks                                          | HYPERLINK field rendered; Ctrl+click activates      | First-class hyperlink object + context menu |
| Inline grammar squiggle                             | Disabled                                            | Dialog + optional inline underline          |
| Inline spelling squiggle                            | Off by default; preference on                       | On by default                               |
| Classic Open/Save dialog                            | OS native                                           | Custom Win95 file picker                    |
| Floating toolbar resize                             | Fixed size                                          | Drag to resize (changes row count)          |
| Outlining toolbar, Drawing toolbar full command set | Visible but reduced toolset                         | Complete                                    |
| Thesaurus dialog                                    | Implemented                                         | —                                           |
| Readability statistics                              | Implemented                                         | —                                           |
| Sounds Like (Soundex)                               | English only                                        | Multilingual                                |
| RTL UI                                              | Not available                                       | Full support                                |

---

## Appendix A — Source Citations

The specifications herein draw from the following identified sources (accessible at the time of writing):

1. **"Running Microsoft Word 7 for Windows 95"**, Russell Borland, Microsoft Press, 1995 (ISBN 1-55615-843-1). Chapters 1–6 describe window, menu, toolbar, dialog layout; chapter 27 enumerates keyboard shortcuts. Internet Archive mirror: <https://archive.org/details/runningmicrosoftword7forwindows95>.
2. **"The Windows Interface Guidelines for Software Design"**, Microsoft Press, 1995 (ISBN 1-55615-679-X). Control metrics, bevel specifications, font metrics, cursors.
3. **WinWorldPC — Microsoft Word 7.0 (Word 95)**: screenshots and the original CD image. <https://winworldpc.com/product/microsoft-word/70-w16>.
4. **Microsoft Support KB articles archived** covering Word 95 keyboard shortcuts and menu layout; search for KB115727, KB126449 (Word 95 Workgroup Kit), KB290938 (compiled shortcut list).
5. **Word 95 Help file** (`WINWORD.HLP`, shipped in the CD image at WinWorldPC). Extracted via `helpdeco` or `WinHlp32` for reference.
6. **Internet Archive 'Word Quick Preview'** — an interactive tour of Word 95 UI originally distributed with the product. <https://archive.org/details/winword_quickpreview>.

Where sources conflicted (e.g., icon dimensions 16×15 vs 16×16, Tahoma vs MS Sans Serif fonts), the decision was made based on direct inspection of the Word 95 binary resources and the Windows 95 Interface Guidelines; notes in-situ.

---

## Appendix B — Pixel Reference Table

Quick reference of critical pixel dimensions:

| Element                           | Size                 |
| --------------------------------- | -------------------- |
| Menu bar height                   | 20 px                |
| Menu item height                  | 18 px                |
| Menu left padding (glyph slot)    | 22 px                |
| Menu separator height             | 2 px                 |
| Toolbar row height                | 22 px                |
| Toolbar button chrome             | 22×22 px             |
| Toolbar icon bitmap               | 16×15 (centered)     |
| Toolbar gripper width             | 4 px                 |
| Toolbar split-button arrow        | 11×22 px             |
| Tooltip delay                     | 500 ms               |
| Tooltip background                | #FFFFE1              |
| Status bar height                 | 20 px                |
| Ruler height (horizontal)         | 18 px                |
| Ruler width (vertical)            | 18 px                |
| Scrollbar width                   | 16 px                |
| Scrollbar arrow                   | 16×16 px             |
| Child title bar height            | 18 px                |
| Child title bar button            | 16×14 px             |
| Child title bar icon              | 16×16 px             |
| Dialog title bar height           | 18 px                |
| Dialog button height              | 22 px                |
| Dialog button min width           | 75 px                |
| Text edit control height          | 21 px                |
| Combobox height                   | 21 px                |
| Combobox dropdown arrow           | 17×19 px             |
| Spinner up/down arrow             | 17×10 px (each)      |
| Checkbox                          | 13×13 px             |
| Radio button                      | 13×13 px             |
| Drag snap threshold               | 16 px                |
| Drop shadow offset                | 2 px                 |
| Menu submenu-open delay           | 400 ms               |
| Double-click threshold            | 500 ms (OS-provided) |
| Drag pointer dead zone            | 4 px                 |
| Tab / indent marker hit tolerance | 3 px                 |

---

## Appendix C — Acceptance Criteria Checklist

A reviewer evaluating "does this look like Word 95?" should be able to tick every box:

- [ ] Outer window chrome: skinned per OS; inside is Win95 gray.
- [ ] MDI workspace with cascading new children.
- [ ] Maximized child merges title into parent frame; min/restore/close buttons in menu bar right.
- [ ] Minimized child renders as 160×18 icon strip at workspace bottom.
- [ ] Menu bar labels match exactly: File Edit View Insert Format Tools Table Window Help.
- [ ] Mnemonic underlines shown always.
- [ ] Menus open on hover when any menu is open; close on click outside / Esc.
- [ ] Disabled menu items etched; checked items show ✓; radio items show ●.
- [ ] Accelerator column right-aligned.
- [ ] Standard + Formatting toolbars docked top by default.
- [ ] Toolbar buttons 22×22 chrome with 16×15 bitmap.
- [ ] Drag gripper on docked toolbars.
- [ ] Tooltip after 500 ms; cream bg; black border.
- [ ] Ruler horizontal with first-line / hanging / left / right indent markers.
- [ ] Tab-type selector cycles L / center / right / decimal / bar.
- [ ] Click to add tab; drag to move; drag off to remove.
- [ ] Status bar with all sections including REC / MRK / EXT / OVR.
- [ ] Spell status icon animates during check.
- [ ] Page / Sec / x/y / At / Ln / Col update live.
- [ ] Find & Replace modeless with tabs Find / Replace / Go To.
- [ ] Word 95 wildcards in Find (not regex).
- [ ] Font dialog with Font / Character Spacing tabs and preview.
- [ ] Paragraph dialog with Indents and Spacing / Text Flow tabs and preview.
- [ ] All ~220 keyboard shortcuts (§7) functional.
- [ ] Click on toolbar buttons does not steal focus from document.
- [ ] Triple-click selects paragraph; Ctrl+click selects sentence.
- [ ] Alt+drag for column selection.
- [ ] Shift+F5 cycles through last three caret positions.
- [ ] F8 enters Extend Mode; subsequent F8 grows to word / sentence / paragraph / section / doc; Shift+F8 shrinks; Esc cancels.
- [ ] F4 repeats last action.
- [ ] Split window via drag from split box; each pane has own ruler and scrollbar.
- [ ] View → Full Screen hides all chrome except a Close Full Screen button.
- [ ] Ctrl+scroll wheel zooms (our addition).
- [ ] All major dialogs have live preview panes.
- [ ] High-contrast mode detected and theming adjusted.
- [ ] Screen reader can navigate entire UI via keyboard + ARIA.
- [ ] No animation in Win95 theme (except animated spell icon).
