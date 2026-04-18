# Microsoft Word 95 (Word for Windows 95, v7.0) — Exhaustive Feature Inventory

This document is the definitive reference for implementing true feature parity with Microsoft Word 95 (Word for Windows 95, internal version 7.0a, ship date August 24, 1995). Every feature described here is what our DOCX-based React/Electron word processor must match in visible behavior, even though the file format target is ECMA-376 OOXML Transitional (not the binary `.doc` format Word 95 actually wrote).

Where claims could not be verified against two primary sources, they are marked `[verify]`. Where a feature is commonly but incorrectly attributed to Word 95 and actually arrived later, the section explicitly calls that out under **NOT IN WORD 95**.

Throughout this document:

- `&X` denotes the underlined keyboard mnemonic in a menu label (e.g. `&File` = "F" underlined, access via Alt+F).
- Accelerators in `Ctrl+…` / `Alt+…` / `Shift+…` / `Fn` form are the default keyboard bindings.
- Dialog tab names are quoted verbatim in the Word 95 form (e.g. "User Info", not "General → Personalize").

## Document Conventions

### Version Identity

- **Product name on splash:** Microsoft Word for Windows 95.
- **Version number in About box:** 7.0 (Office 95 harmonized Word/Excel/PowerPoint/Schedule+/Access to version 7.0).
- **Executable:** `WinWord.exe`.
- **Binary format version:** Word 6.0/95 binary `.doc` (FIB nFib range typically 101–104). Our target is OOXML DOCX Transitional; we must lossless-round-trip a minimum profile that represents every Word 95 feature listed below.
- **Normal template:** `Normal.dot` — single global template stored in the user's Word startup folder.
- **Minimum hardware target quoted on box:** 386DX, 6 MB RAM, Windows 95 or Windows NT 3.51+, 28 MB disk.

### Terminology Caveats

- Word 95 uses the term **"Annotation"** for what Word 2002+ calls a "Comment". Our UI labels should read "Comment" (modern) but the feature behavior must mirror Word 95 annotations. [verify — confirmed via Microsoft Knowledge Base articles referencing Word 7.0 `AnnotationRef` field]
- Word 95 uses **"Revisions"** (verb: "Mark Revisions") for what Word 2002+ calls "Track Changes". Behavior is otherwise identical in intent.
- Word 95 uses **"Frame"** for a floating container. The generic `<textbox>` shape came in Word 97. Word 95 frames are anchored to a paragraph and hold either text or an inline graphic that has been "wrapped".
- Word 95's "AutoText" is the successor to Word 6.0's "Glossary"; both names appear in the UI and in help files.
- The Office 95 help system calls F1 help the "Answer Wizard"; this is not yet the animated Office Assistant (Clippit), which arrived with Word 97.

### What Word 95 Does NOT Have (hard exclusions)

These features are commonly confused as Word 95 capabilities. They arrived later:

| Feature                                           | First version | Notes                                                                                         |
| ------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------- |
| Ribbon / contextual tabs                          | 2007          | Menus and toolbars only in 95.                                                                |
| VBA for macros                                    | 97            | Word 95 uses WordBasic.                                                                       |
| Office Assistant (Clippit)                        | 97            | 95 has TipWizard (above the document) + Answer Wizard (in Help).                              |
| Character styles                                  | 97            | Word 95 supports paragraph styles only.                                                       |
| Draw Table tool                                   | 97            | Tables in Word 95 are created with Insert Table, Table Wizard, or Convert Text to Table.      |
| Online Layout view                                | 97            | 95 has Normal, Outline, Page Layout, Master Document, Full Screen, Print Preview.             |
| Document Map                                      | 97            | 95 relies on Outline view for navigation.                                                     |
| Browse Object selector (below vertical scrollbar) | 97            | 95's vertical scrollbar has only up/down arrows, thumb, and three view buttons at the bottom. |
| Horizontal scrollbar browse controls              | 97            | 95 horizontal scrollbar is plain.                                                             |
| Picture Toolbar                                   | 97            | 95 formats pictures via Format → Picture and Frame commands.                                  |
| Text Box shape (generic)                          | 97            | 95's floating text uses a Frame.                                                              |
| Real-time "as you type" grammar squiggles (green) | 2000          | 95 ships with background _spell_ check; grammar is modal, via Tools → Grammar.                |
| Comments-in-balloons (margin)                     | 2002          | 95 uses a split pane at the bottom of the window.                                             |
| Track Changes (name)                              | 2002          | 95 calls it "Revisions".                                                                      |
| Reading Layout / Full Screen Reading              | 2003          | —                                                                                             |
| Reviewing pane (sidebar)                          | 2003          | 95's annotation pane is a bottom split.                                                       |
| Research task pane                                | 2003          | —                                                                                             |
| Translation/Thesaurus pane                        | 2003          | 95 uses the modal Thesaurus dialog (Shift+F7).                                                |
| Quick Access Toolbar                              | 2007          | —                                                                                             |
| Mini Toolbar on selection                         | 2007          | —                                                                                             |
| Live Preview of formatting                        | 2007          | —                                                                                             |
| SmartArt                                          | 2007          | 95 has WordArt 2.0 and Organization Chart 2.0 as OLE objects.                                 |
| Content Controls                                  | 2007          | 95 form fields are Text/Checkbox/Dropdown only.                                               |
| Theme Colors / Theme Fonts                        | 2007          | —                                                                                             |
| Save as PDF natively                              | 2007          | 95 prints to file as `.prn`; PDF requires third-party printer.                                |
| Ink annotations                                   | —             | No pen input support in 95.                                                                   |
| Reflection / Glow / 3-D rotation text effects     | 2010          | —                                                                                             |
| Real-time co-authoring                            | 2013          | —                                                                                             |
| Tell Me / Search                                  | 2016          | 95 Help has its own "Answer Wizard" modal.                                                    |
| Dictation / Editor / Immersive Reader             | 365 era       | —                                                                                             |

## Startup, Windows, and the Workspace

### Application Shell

Word 95 is a **Multiple Document Interface (MDI)** application. A single `WinWord.exe` process owns one application frame (title bar, menu bar, toolbars, workspace, status bar) and zero or more MDI child windows, each displaying one open document. Maximizing a child window hides its caption bar and merges the child's name into the application title (`Microsoft Word - Document1`).

### Application Frame Elements, Top to Bottom

1. **Title Bar.** Style: Windows 95 title bar with the "two-tone gradient from black to dark blue" characteristic of Office 95. Contains application icon (small W), text `Microsoft Word - {docname}` (or just `Microsoft Word` when no doc is open), and the minimize / maximize-or-restore / close Windows 95 buttons on the right. Double-click toggles maximize/restore. System menu is on the left icon.
2. **Menu Bar.** Always present. Items: File, Edit, View, Insert, Format, Tools, Table, Window, Help. Also a "child window" system icon on the far left (W inside a gray square) when an MDI child is maximized, and the child's minimize/restore/close buttons on the far right of the menu bar. Disabled items are grayed. The "close" X on the far right of the menu bar closes only the active document, not the application. F10 activates the menu bar (first item highlighted). Alt releases or activates it. Escape cancels.
3. **Standard Toolbar.** Default on. Description in §Toolbars.
4. **Formatting Toolbar.** Default on. Description in §Toolbars.
5. **Horizontal Ruler.** Visible in Normal and Page Layout views. Shows margin boundaries, tab stops, indent markers. Drag interactions described in §Ruler.
6. **Document Workspace (MDI client area).** Each open document is an MDI child window.
7. **Status Bar.** Always visible unless turned off in Tools → Options → View. Regions described in §Status Bar.

### MDI Child Window Elements

1. **Caption bar** (only when not maximized): shows document filename. Controls: minimize, maximize, close for the child.
2. **Vertical Ruler** (Page Layout view only; Tools → Options → View toggles): on the left edge of the document pane, showing margin heights and vertical tab positions.
3. **Vertical Scrollbar** (right edge of child): ↑ arrow, thumb, ↓ arrow. Above the ↑ arrow is a **split handle** (a thin horizontal bar that can be dragged into the document area to split the window into two panes; see §Window Menu → Split). Below the ↓ arrow are **three view buttons** in this order: Normal View, Page Layout View, Outline View.
4. **Horizontal Scrollbar** (bottom of child): ← arrow, thumb, → arrow. Plain — no "browse objects" selector (that is Word 97). The horizontal scrollbar is suppressed when Word wraps to window (Tools → Options → View → "Wrap to window" turned on).
5. **Insertion Point** (text caret), **Selection Highlight**, **End-of-Document marker** (a small horizontal bar: "¶" representing the final paragraph mark, but rendered as a black horizontal stroke in Normal view).

### The Workspace Grid in Page Layout View

Page Layout view renders each physical page as a white rectangle against a gray background, separated by a gray gap. Margins appear as lines inside each page. Headers and footers are visible, editable inline (click to activate; header/footer toolbar appears). Text boundaries (if Tools → Options → View → "Text boundaries" is checked) appear as dotted lines marking the print area. Drawing objects can sit anywhere on the page, including in the margins.

## Menu Reference

All nine menus are listed below with complete item enumeration. `…` indicates the item opens a dialog. The mnemonic convention `&X` shows the underlined letter. Accelerators are listed at right.

### File Menu (`&File`, Alt+F)

| Item              | Mnemonic | Accelerator                      | Action                                                                                                                                                                                                                   |
| ----------------- | -------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| &New…             | N        | Ctrl+N                           | Opens **New** dialog listing templates organized by tab (General, Letters & Faxes, Memos, Reports, Publications, Other Documents). The Ctrl+N shortcut bypasses the dialog and creates a new document from `Normal.dot`. |
| &Open…            | O        | Ctrl+O                           | Opens **Open** dialog.                                                                                                                                                                                                   |
| &Close            | C        | (none; or Ctrl+F4 for the child) | Closes active document. If dirty, prompts to save.                                                                                                                                                                       |
| &Save             | S        | Ctrl+S (also Shift+F12)          | Saves active document. First-time save behaves like Save As.                                                                                                                                                             |
| Save &As…         | A        | F12                              | Opens **Save As** dialog.                                                                                                                                                                                                |
| Save A&ll         | L        | (none)                           | Saves all open documents; also all open templates if their "Prompt to save Normal.dot" is not set.                                                                                                                       |
| Find Fil&e…       | F        | (none)                           | Opens **Find File** dialog (see §Find File Dialog).                                                                                                                                                                      |
| &Templates…       | T        | (none)                           | Opens **Templates and Add-ins** dialog (attach template, load global templates, Organizer).                                                                                                                              |
| Page Set&up…      | U        | (none)                           | Opens **Page Setup** dialog (Margins / Paper Size / Paper Source / Layout tabs).                                                                                                                                         |
| Print Pre&view    | V        | Ctrl+F2                          | Enters Print Preview (see §Print Preview).                                                                                                                                                                               |
| &Print…           | P        | Ctrl+P (also Ctrl+Shift+F12)     | Opens **Print** dialog (§Print Dialog).                                                                                                                                                                                  |
| --- separator --- |          |                                  |                                                                                                                                                                                                                          |
| 1 {last file}     | 1        | Alt+F,1                          | Opens most-recently-used file.                                                                                                                                                                                           |
| 2 {second MRU}    | 2        | Alt+F,2                          |                                                                                                                                                                                                                          |
| 3 {third MRU}     | 3        | Alt+F,3                          |                                                                                                                                                                                                                          |
| 4 {fourth MRU}    | 4        | Alt+F,4                          | The default MRU length is 4, adjustable 0–9 in Options → General.                                                                                                                                                        |
| --- separator --- |          |                                  |                                                                                                                                                                                                                          |
| E&xit             | X        | Alt+F4                           | Quits Word. Prompts to save each dirty doc; prompts to save `Normal.dot` if it was modified (depends on "Prompt to save Normal.dot" option).                                                                             |

#### File → New Dialog

- **Tabs** (templates are grouped into tabs that correspond to subfolders of `Templates\`): **General**, **Letters & Faxes**, **Memos**, **Reports**, **Publications**, **Other Documents**, **Legal Pleadings** [verify — Office 95 Professional ships a Pleading Wizard].
- **List:** icons of templates and wizards in the selected tab. Wizards have a wand icon; templates have a document icon.
- **Preview pane** (right): renders thumbnail preview of template contents if the template was saved with "Save Preview Picture".
- **Radio group "New"**: ○ Document, ○ Template — choose output type. Selecting Template means the new file is saved as `.dot`.
- **Buttons:** OK, Cancel, Help.

#### File → Open Dialog

A Windows 95 Common Dialog–styled file chooser with Word extensions. Fields and controls:

- **File name** combo box (allows typing wildcard patterns like `*.doc`).
- **Files of type** combo: Word Documents (`*.doc`), Document Templates (`*.dot`), Rich Text Format (`*.rtf`), Text Files (`*.txt`), WordPerfect 5.x/6.x (`*.doc`, `*.wpd`), Word 2.x for Windows (`*.doc`), Word for MS-DOS 3.0–6.0, Works for Windows 3.0/4.0 (`*.wps`), Excel Worksheet (`*.xls`, `*.xlw`), Lotus 1-2-3 (`*.wk?`), All Files (`*.*`), Recover Text from Any File. Each filter invokes a graphics or text converter DLL.
- **Look in** folder chooser, drive combo.
- **Read Only** checkbox.
- **Commands and Settings** button (menu):
  - Search… (opens Search dialog — property-based search identical to Find File).
  - Save Search As…
  - Delete Search / Rename Search.
  - Print (prints selected files without opening).
  - Properties (shows Summary Info of selected file).
  - Sorting… (dialog; sort by name/size/type/last-modified, asc/desc).
- **Advanced Search** button (in Commands menu and in Find File) opens full property search form.
- Preview pane shows the first page of the selected document when "Preview Picture" is set.
- Buttons: Open, Cancel, Find Now (triggers search), New Search, Help.

#### File → Save As Dialog

Same look as Open plus:

- **Save file as type** combo: Word Document (`*.doc`), Document Template (`*.dot`), Rich Text Format, Text Only (`*.txt`), Text Only with Line Breaks, MS-DOS Text, MS-DOS Text with Line Breaks, Word 6.0/95 (the current format), Word 2.x for Windows, Word for Windows 95 and 6.0 (Word-RTF shared), WordPerfect 5.x/6.x, Works 3.0/4.0 for Windows, HTML Document (only if Internet Assistant add-on installed; else absent).
- **Options…** button — opens Save tab of Options dialog (Fast save, Always create backup copy, Allow fast saves, Prompt for document properties, Embed TrueType fonts, Save data only for forms, File-sharing options).
- **Password** subsection: Protection Password (write access), Write Reservation Password (read access), Read-only recommended checkbox.

### Edit Menu (`&Edit`, Alt+E)

| Item                                  | Mnemonic | Accelerator                                    | Action                                                                                                                                                                                                                                                         |
| ------------------------------------- | -------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| &Undo {command name}                  | U        | Ctrl+Z (also Alt+Backspace)                    | Undoes the last undoable action. Adjacent split-button dropdown (on the Standard toolbar) reveals the full undo stack.                                                                                                                                         |
| &Repeat {command name} / Can't Repeat | R        | Ctrl+Y (also F4, Alt+Enter in some contexts)   | Repeats last action. After an Undo, the menu label becomes "Redo {action}" and the dropdown on the toolbar shows the redo stack.                                                                                                                               |
| --- separator ---                     |          |                                                |                                                                                                                                                                                                                                                                |
| Cu&t                                  | T        | Ctrl+X (also Shift+Delete)                     | Cuts selection.                                                                                                                                                                                                                                                |
| &Copy                                 | C        | Ctrl+C (also Ctrl+Insert)                      | Copies selection.                                                                                                                                                                                                                                              |
| &Paste                                | P        | Ctrl+V (also Shift+Insert)                     | Pastes clipboard.                                                                                                                                                                                                                                              |
| Paste &Special…                       | S        | (none)                                         | Opens **Paste Special** dialog listing formats available on the clipboard (Formatted Text RTF, Unformatted Text, Picture, Bitmap, Word Document Object, Microsoft Excel Worksheet, Microsoft Word Document, etc.) with ○ Paste and ○ Paste Link radio choices. |
| --- separator ---                     |          |                                                |                                                                                                                                                                                                                                                                |
| Cl&ear                                | A        | Delete                                         | Deletes selection without clipboard.                                                                                                                                                                                                                           |
| Select A&ll                           | L        | Ctrl+A (also Ctrl+5 on numeric pad, Ctrl+Num5) | Selects the entire main story.                                                                                                                                                                                                                                 |
| --- separator ---                     |          |                                                |                                                                                                                                                                                                                                                                |
| &Find…                                | F        | Ctrl+F                                         | Opens **Find** dialog (with Replace and Go To as tabs; see §Find dialog).                                                                                                                                                                                      |
| R&eplace…                             | E        | Ctrl+H                                         | Opens Find dialog on the Replace tab.                                                                                                                                                                                                                          |
| &Go To…                               | G        | Ctrl+G (also F5)                               | Opens Find dialog on the Go To tab.                                                                                                                                                                                                                            |
| --- separator ---                     |          |                                                |                                                                                                                                                                                                                                                                |
| &AutoText…                            | X        | (none)                                         | Opens **AutoText** dialog (add/delete/insert AutoText entries, with preview).                                                                                                                                                                                  |
| Boo&kmark…                            | K        | Ctrl+Shift+F5                                  | Opens **Bookmark** dialog.                                                                                                                                                                                                                                     |
| Lin&ks…                               | I        | (none)                                         | Opens **Links** dialog for OLE-linked objects. Grayed if no links.                                                                                                                                                                                             |
| &Object                               | O        | (none; Alt+E,O)                                | Submenu for the selected OLE object: "Edit {Object Class} Object" / "Open {Object Class} Object" / "Convert…" — only present when an OLE object is selected.                                                                                                   |

#### Edit → Find / Replace / Go To Dialog

Single dialog with three tabs: **Find**, **Replace**, **Go To**.

**Find tab:**

- Find what: combobox (MRU).
- Search: Up / Down / All.
- Checkboxes: Match Case, Find Whole Words Only, Use Pattern Matching, Sounds Like.
- **Find All Word Forms** checkbox (Word 95 innovation; requires installed grammar files — finds inflected forms of a verb/noun). [verify — confirmed in Word 95 help]
- Buttons: Find Next, Cancel, Format ▸ (submenu: Font…, Paragraph…, Tabs…, Language…, Style…, Frame…), Special ▸ (menu: Paragraph Mark `^p`, Tab Character `^t`, Any Character `^?`, Any Digit `^#`, Any Letter `^$`, Caret `^^`, Column Break `^n`, Em Dash `^+`, En Dash `^=`, Endnote Mark `^e`, Field `^d`, Footnote Mark `^f`, Graphic `^g`, Manual Line Break `^l`, Manual Page Break `^m`, Nonbreaking Hyphen `^~`, Nonbreaking Space `^s`, Optional Hyphen `^-`, Section Break `^b`, White Space `^w`), No Formatting (clear formatting from Find field).

**Replace tab:** same as Find plus Replace with field, Replace, Replace All, Find Next buttons.

**Go To tab:**

- Go to what list: Page, Section, Line, Bookmark, Annotation, Footnote, Endnote, Field, Table, Graphic, Equation, Object, Heading.
- Enter text/number field (e.g. `+3` for "3 pages forward", `-2` for "2 back", or specific bookmark/number).
- Buttons: Previous, Next / Go To, Close.

### View Menu (`&View`, Alt+V)

| Item               | Mnemonic | Accelerator         | Action                                                                                                                                                                    |
| ------------------ | -------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| &Normal            | N        | Ctrl+Alt+N          | Switch to Normal view.                                                                                                                                                    |
| &Outline           | O        | Ctrl+Alt+O          | Switch to Outline view.                                                                                                                                                   |
| &Page Layout       | P        | Ctrl+Alt+P          | Switch to Page Layout view.                                                                                                                                               |
| &Master Document   | M        | Ctrl+Alt+M [verify] | Switch to Master Document view.                                                                                                                                           |
| --- separator ---  |          |                     |                                                                                                                                                                           |
| &Full Screen       | U        | (none)              | Hide all chrome (title, menu, toolbars, status, scrollbars). A single floating "Full Screen" toolbar with a single button (close full screen) appears. Escape also exits. |
| &Toolbars…         | T        | (none)              | Opens **Toolbars** dialog.                                                                                                                                                |
| &Ruler             | R        | (none)              | Toggle ruler(s) visibility.                                                                                                                                               |
| --- separator ---  |          |                     |                                                                                                                                                                           |
| &Header and Footer | H        | (none)              | Move focus into the header (Page Layout view is auto-entered; in Normal view, switches to Page Layout to edit). Opens "Header and Footer" floating toolbar.               |
| Foot&notes         | F        | (none)              | Open footnote pane (Normal view; in Page Layout goes to the footnote area). Grayed if no footnotes.                                                                       |
| &Annotations       | A        | (none)              | Open annotation pane. Grayed if no annotations.                                                                                                                           |
| --- separator ---  |          |                     |                                                                                                                                                                           |
| &Field Codes       | C        | Alt+F9              | Toggle between display of field codes and field results for all fields in the document.                                                                                   |
| --- separator ---  |          |                     |                                                                                                                                                                           |
| &Zoom…             | Z        | (none)              | Opens **Zoom** dialog (200%, 100%, 75%, Page Width, Whole Page, Two Pages, Many Pages, Percent).                                                                          |

### Insert Menu (`&Insert`, Alt+I)

| Item               | Mnemonic | Accelerator                                                            | Action                                                                                                                                                                                                       |
| ------------------ | -------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| &Break…            | B        | (none)                                                                 | Opens **Break** dialog: ○ Page Break (Ctrl+Enter), ○ Column Break (Ctrl+Shift+Enter), ○ Section Breaks: ○ Next Page, ○ Continuous, ○ Even Page, ○ Odd Page.                                                  |
| Page N&umbers…     | U        | (none)                                                                 | Opens **Page Numbers** dialog (Position: Top/Bottom of page, Alignment: Left/Center/Right/Inside/Outside, "Show Number on First Page" checkbox, Format… button opens Page Number Format dialog).             |
| &Date and Time…    | T        | (none)                                                                 | Opens **Date and Time** dialog: list of date/time formats; "Insert as field" checkbox; Language dropdown.                                                                                                    |
| &Field…            | F        | Ctrl+F9 inserts empty field braces; the dialog item has no accelerator | Opens **Field** dialog (§Field Dialog).                                                                                                                                                                      |
| &Symbol…           | S        | (none)                                                                 | Opens **Symbol** dialog (§Symbol Dialog).                                                                                                                                                                    |
| Form &Field…       | O        | (none)                                                                 | Opens **Form Field** dialog: Type (○ Text, ○ Check Box, ○ Drop-Down), with properties button.                                                                                                                |
| --- separator ---  |          |                                                                        |                                                                                                                                                                                                              |
| Foot&note…         | N        | (none)                                                                 | Opens **Footnote and Endnote** dialog (Insert: ○ Footnote, ○ Endnote; Numbering: ○ AutoNumber, ○ Custom Mark, Symbol picker; Options…).                                                                      |
| &Annotation        | A        | Ctrl+Alt+A [verify]                                                    | Inserts an annotation reference at the selection and opens the annotation pane.                                                                                                                              |
| &Caption…          | C        | (none)                                                                 | Opens **Caption** dialog (Caption text, Label, Position: Above/Below selected item, Numbering…, AutoCaption…).                                                                                               |
| Cross-&reference…  | R        | (none)                                                                 | Opens **Cross-reference** dialog (Reference type, Insert reference to, For which…, Insert as hyperlink [may be absent in 95 — the "Insert as hyperlink" checkbox is Word 97+; verify], Include above/below). |
| Inde&x and Tables… | X        | (none)                                                                 | Opens **Index and Tables** dialog with tabs: Index, Table of Contents, Table of Figures, Table of Authorities.                                                                                               |
| --- separator ---  |          |                                                                        |                                                                                                                                                                                                              |
| File…              | L        | (none)                                                                 | Opens **File** dialog (identical to File → Open) to insert another file's contents at cursor; checkbox "Range" for bookmark; Link option embeds as `INCLUDETEXT` field.                                      |
| Frame              | M        | (none)                                                                 | Inserts an empty frame anchored to the current paragraph. If text is selected, wraps it in a frame.                                                                                                          |
| &Picture…          | P        | (none)                                                                 | Opens **Insert Picture** dialog (§Insert Picture Dialog).                                                                                                                                                    |
| &Object…           | J        | (none)                                                                 | Opens **Object** dialog with tabs Create New / Create from File (§Object Dialog).                                                                                                                            |
| Data&base…         | D        | (none)                                                                 | Opens **Database** dialog — browse ODBC/Access/Excel/dBase sources, query options, insert data as a Word table; "Insert Data as Field" creates an auto-updating `DATABASE` field.                            |

#### Insert → Field Dialog

- **Categories** list box (left): (All), Date and Time, Document Automation, Document Information, Equations and Formulas, Index and Tables, Links and References, Mail Merge, Numbering, User Information.
- **Field names** list box (middle): updates based on category.
- **Field codes** text box (bottom): the editable raw field code; supports free text entry.
- **Description** strip: one-line description of the selected field.
- **Options…** button: opens **Field Options** dialog with tabs: General Switches (format `\*`, numeric `\#`, date `\@`, lock `\!`), Field Specific Switches (varies per field).
- **Preserve formatting during updates** checkbox (adds `\* MERGEFORMAT`).
- Buttons: OK, Cancel, Help.

#### Insert → Symbol Dialog

- Tabs: **Symbols**, **Special Characters**.
- Symbols tab: Font combo (lists all installed fonts including Symbol, Wingdings), subset combo, character grid, large preview cell, Shortcut Key button (assign), AutoCorrect… button (add to AutoCorrect replace list).
- Special Characters tab: static list — Em Dash (Ctrl+Alt+Num-), En Dash (Ctrl+Num-), Nonbreaking Hyphen (Ctrl+Shift+\_), Optional Hyphen (Ctrl+-), Em Space, En Space, Nonbreaking Space (Ctrl+Shift+Space), Copyright (Ctrl+Alt+C), Registered (Ctrl+Alt+R), Trademark (Ctrl+Alt+T), Section (none), Paragraph (none), Ellipsis (Ctrl+Alt+.), Single Opening Quote (Ctrl+`,`), Single Closing Quote (Ctrl+`','`), Double Opening Quote (Ctrl+`,"`), Double Closing Quote (Ctrl+`',"`).
- Buttons: Insert, Close.

#### Insert → Picture Dialog

Same layout as Open dialog. File types supported via graphics import filters (each a separate DLL in `MSOffice\Shared`):

- Windows Bitmap (`*.bmp`, `*.dib`, `*.rle`)
- Windows Metafile (`*.wmf`)
- Encapsulated PostScript (`*.eps`)
- CompuServe GIF (`*.gif`)
- JPEG File Interchange Format (`*.jpg`, `*.jpeg`)
- Kodak Photo CD (`*.pcd`)
- Macintosh PICT (`*.pct`, `*.pict`)
- PC Paintbrush (`*.pcx`)
- Tagged Image File Format (`*.tif`, `*.tiff`)
- Targa (`*.tga`)
- Computer Graphics Metafile (`*.cgm`)
- CorelDraw (`*.cdr`) [verify — ships with Office 95 Professional]
- Micrografx Designer/Draw (`*.drw`)
- HP Graphics Language (`*.hgl`, `*.hpgl`)
- WordPerfect Graphic (`*.wpg`)

Controls:

- **Link to File** checkbox — instead of embedding, store only a reference (`INCLUDEPICTURE` field).
- **Save with Document** checkbox — default on; when off plus Link to File on, only the link is saved.
- Preview pane on the right.

#### Insert → Object Dialog

- Tab **Create New**: list of registered OLE server types (populated from registry `\HKEY_CLASSES_ROOT\{ClassID}\InsertableObject`). Typical entries shipped with Office 95:
  - Microsoft Excel Chart
  - Microsoft Excel Worksheet
  - Microsoft Equation 2.0
  - Microsoft Graph 5.0
  - Microsoft Organization Chart 2.0
  - Microsoft WordArt 2.0
  - Microsoft Word Document
  - Microsoft Word Picture
  - Microsoft Note-It 2.0
  - MS Info
  - Package
  - Paintbrush Picture
  - Sound
  - Media Clip
  - Video Clip
  - Equation
  - WordPad Document (if Windows 95 installed)
  - Microsoft Schedule+ 7.0
  - Microsoft PowerPoint Slide / Presentation
  - Microsoft Access Form / Report (if Access 95 installed)
  - Microsoft Project ProjectView (if Project installed)
- **Display as Icon** checkbox; Change Icon… button.
- Tab **Create from File**: File text box, Browse… button, **Link to File** checkbox, Display as Icon checkbox.
- Buttons: OK, Cancel, Help.

### Format Menu (`&Format`, Alt+O)

| Item                    | Mnemonic | Accelerator                                                                                             | Action                                                                                                                 |
| ----------------------- | -------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| &Font…                  | F        | Ctrl+D                                                                                                  | Opens **Font** dialog.                                                                                                 |
| &Paragraph…             | P        | (none)                                                                                                  | Opens **Paragraph** dialog.                                                                                            |
| &Tabs…                  | T        | (none)                                                                                                  | Opens **Tabs** dialog.                                                                                                 |
| &Borders and Shading…   | B        | (none)                                                                                                  | Opens **Borders and Shading** dialog.                                                                                  |
| &Columns…               | C        | (none)                                                                                                  | Opens **Columns** dialog.                                                                                              |
| &Change Case…           | E        | (none; Shift+F3 toggles through cases without a dialog)                                                 | Opens **Change Case** dialog.                                                                                          |
| Drop Cap…               | D        | (none)                                                                                                  | Opens **Drop Cap** dialog.                                                                                             |
| --- separator ---       |          |                                                                                                         |                                                                                                                        |
| Bu&llets and Numbering… | N        | (none)                                                                                                  | Opens **Bullets and Numbering** dialog.                                                                                |
| &Heading Numbering…     | H        | (none)                                                                                                  | Opens **Heading Numbering** dialog (applies numbering schemes to built-in Heading 1–9 styles).                         |
| --- separator ---       |          |                                                                                                         |                                                                                                                        |
| Auto&Format…            | A        | Ctrl+K [verify — Word 95 binds Ctrl+K to "AutoFormat selection", Word 97+ binds it to Insert Hyperlink] | Opens **AutoFormat** dialog (Apply to entire document / current selection, Options…).                                  |
| Style &Gallery…         | G        | (none)                                                                                                  | Opens **Style Gallery** dialog (preview document in each available template).                                          |
| &Style…                 | S        | (none)                                                                                                  | Opens **Style** dialog (list of styles, modify, new, organizer).                                                       |
| --- separator ---       |          |                                                                                                         |                                                                                                                        |
| F&rame…                 | R        | (none)                                                                                                  | Opens **Frame** dialog; grayed unless current paragraph is framed.                                                     |
| Pict&ure…               | I        | (none)                                                                                                  | Opens **Picture** dialog (crop, size, reset, black-and-white toggle, fill color). Grayed unless picture selected.      |
| Dra&wing Object…        | O        | (none)                                                                                                  | Opens **Drawing Object** dialog (Fill, Line, Size and Position, Wrapping tabs). Grayed unless drawing object selected. |

#### Format → Font Dialog

Three tabs: **Font**, **Character Spacing**, **Animation** [verify — Animation tab is Word 97 addition; Word 95 has only Font and Character Spacing].

**Font tab:**

- Font (combobox of installed fonts; TrueType fonts marked with "TT" icon; printer fonts marked "PF").
- Font Style: Regular, Italic, Bold, Bold Italic.
- Size: points (4–1637.5 in 0.5 increments; can type arbitrary value).
- Underline (combo): None, Single, Words Only, Double, Dotted. [verify — Dashed and Wavy are Word 97 additions]. Word 95 underline styles are exactly: None, Single, Words Only, Double, Dotted.
- Color (combo with 16 fixed colors): Auto, Black, Blue, Cyan, Green, Magenta, Red, Yellow, White, Dark Blue, Dark Cyan, Dark Green, Dark Magenta, Dark Red, Dark Yellow, Dark Gray, Light Gray.
- Effects group (checkboxes): Strikethrough, Superscript, Subscript, Hidden, Small Caps, All Caps.
- Preview pane (large) showing "Times New Roman" or the current font name in its style.
- **Default…** button (saves changes as the default font for the attached template — prompts for confirmation).

**Character Spacing tab:**

- Spacing: Normal / Expanded / Condensed, By: points field (0.1 pt resolution).
- Position: Normal / Raised / Lowered, By: points field.
- Kerning for fonts: checkbox + Points and above field (Word kerns TrueType pairs automatically when text is at/above this size).

**Effects at the bottom:** Preview pane.

#### Format → Paragraph Dialog

Two tabs: **Indents and Spacing**, **Text Flow**.

**Indents and Spacing tab:**

- Alignment: Left, Centered, Right, Justified.
- Outline Level: does not exist in Word 95 [verify — it is Word 2000+]. Heading level is conveyed only by style in Word 95.
- Indentation: Left (inches), Right (inches).
- Special: None, First Line, Hanging; By: (inches).
- Spacing: Before (pts), After (pts).
- Line Spacing: Single, 1.5 Lines, Double, At Least, Exactly, Multiple; At: (pt value or multiplier).
- Preview of current paragraph with surrounding paragraphs (three-paragraph stacked mock).

**Text Flow tab:**

- Pagination: Widow/Orphan Control, Keep Lines Together, Keep with Next, Page Break Before.
- Suppress Line Numbers.
- Don't Hyphenate.
- Preview.

#### Format → Tabs Dialog

- Tab Stop Position: list of tab positions (inches).
- Default Tab Stops: (inches) — global default.
- Alignment radio: Left, Center, Right, Decimal, Bar.
- Leader radio: 1 None, 2 .... (dots), 3 ---- (dashes), 4 \_\_\_\_ (underline).
- Buttons: Set, Clear, Clear All.

#### Format → Borders and Shading Dialog

Three tabs depending on selection: **Borders**, **Page Border** (paragraph selected) or **Borders** (table cell selected → borders only), **Shading**. [verify — Word 95 has Borders and Shading tabs; Page Border tab was added in Word 97. In Word 95, page borders are applied via Page Setup → Layout → Page Borders (if present) or are absent; most primary sources say the Page Border feature itself arrived in Word 97. Word 95 applies paragraph borders only.]

- Corrected: **Word 95 Borders and Shading has two tabs: Borders, Shading.** There is no Page Border.

**Borders tab (for paragraphs):**

- Presets: None, Box, Shadow, 3-D [verify — 3-D preset may be 97+]. Word 95 presets: None, Box, Shadow.
- Line style list: (hairline, single 0.5 pt, 0.75, 1.0, 1.5, 2.25, 3.0, 4.5, 6.0, double, thick double, thick-thin, thin-thick, thin-thick-thin, dotted).
- Color: 16 standard colors.
- From Text: points (distance from text to border).
- Preview pane with four border buttons (top/bottom/left/right) and between paragraphs toggle.

**Borders tab (for tables):** adds Cell widget — same 4 borders plus inside vertical/horizontal; "Apply to:" combo: Cell / Table.

**Shading tab:**

- Fill: None, Clear, 5%…95% (17 discrete percentages), Solid.
- Foreground: 16 colors.
- Background: 16 colors.
- Preview.

#### Format → Columns Dialog

- Presets: One, Two, Three, Left, Right.
- Number of columns: spin.
- Width and spacing: per-column Width (inches) and Spacing (inches).
- Equal Column Width checkbox.
- Line Between checkbox.
- Apply to: Whole Document, This Section, This Point Forward.
- Start New Column checkbox (inserts a column break at insertion point).

#### Format → Change Case Dialog

- Radio group: ○ Sentence case., ○ lowercase, ○ UPPERCASE, ○ Title Case, ○ tOGGLE cASE.

#### Format → Drop Cap Dialog

- Position: ○ None, ○ Dropped, ○ In Margin.
- Font combo.
- Lines to Drop (spin, 1–10).
- Distance from Text (inches, 0–2 in 0.1 increments).
- Preview.

#### Format → Bullets and Numbering Dialog

Three tabs: **Bulleted**, **Numbered**, **Multilevel**.

- Bulleted tab: 7 preset bullet styles shown as large tiles. Buttons: Customize… (opens Customize Bulleted List), Remove, OK.
- Numbered tab: 7 preset numbering formats (1. 2. 3.; 1) 2) 3); I. II. III.; A. B. C.; a) b) c); i. ii. iii.; (1) (2) (3)). Options: Hanging Indent checkbox; Start At spin; Customize…
- Multilevel tab (Word 95 calls it "Multilevel"; in Word 97+ renamed "Outline Numbered"): 7 preset multi-level schemes; Customize.
- Customize dialogs let you set: Bullet character (from Symbol dialog), Size relative to text, Color, Distance from indent to text, Distance from bullet to text, Font… button.

#### Format → Heading Numbering Dialog

- Preset list of 6 heading-numbering schemes (I. A. 1.; 1. 1.1. 1.1.1.; Chapter 1 1.1 etc.; Article I. Section 1.01; etc.).
- Modify… button opens Customize Multilevel List.

#### Format → AutoFormat Dialog

- "AutoFormat {doc name}" radio: ○ AutoFormat now, ○ AutoFormat and review each change.
- Options… button — opens AutoCorrect/AutoFormat tabs (§AutoFormat settings).
- After completion, the Review Changes dialog lets the user accept/reject each change individually or accept all; Style Gallery… button applies a template's styles.

#### Format → Style Gallery Dialog

- Template list (pulls from the templates folder).
- Preview modes: ○ Document, ○ Example, ○ Style Samples.
- Preview pane shows the active document with the chosen template's styles applied.

#### Format → Style Dialog

- Styles list (paragraph styles only in Word 95).
- List filter: All Styles / Styles In Use / User-Defined Styles.
- Description pane: shows the style's formatting chain ("Normal + Font: Arial, 14 pt, Bold, Space Before 12 pt, Space After 6 pt, Keep With Next").
- Paragraph Preview and Character Preview panes.
- Buttons: Apply, Cancel, New…, Modify…, Delete, Organizer…

  **New / Modify Style dialog:**
  - Name text box.
  - Based On combo (parent style).
  - Next Style combo (applied to next paragraph after Enter).
  - Format ▸ menu: Font…, Paragraph…, Tabs…, Border…, Language…, Frame…, Numbering….
  - Shortcut Key… (opens Customize Keyboard).
  - Add to Template checkbox.
  - Automatically Update checkbox [verify — Auto-Update is Word 97+ for paragraph styles].
  - Description pane (read-only).

#### Format → Frame Dialog

- Text Wrapping: ○ None, ○ Around.
- Size: Width Exactly/Auto (inches), Height Exactly/At Least/Auto (inches).
- Horizontal: Position (combo: Left, Center, Right, Inside, Outside, Custom), Relative to (Column, Margin, Page), Distance from Text.
- Vertical: Position (combo: Top, Center, Bottom, Custom), Relative to (Margin, Page, Paragraph), Distance from Text.
- Move with Text checkbox.
- Lock Anchor checkbox.
- Remove Frame button.

### Tools Menu (`&Tools`, Alt+T)

| Item                   | Mnemonic | Accelerator | Action                                                                        |
| ---------------------- | -------- | ----------- | ----------------------------------------------------------------------------- |
| &Spelling…             | S        | F7          | Runs spelling check (§Spelling).                                              |
| &Grammar…              | G        | (none)      | Runs grammar check (§Grammar).                                                |
| &Thesaurus…            | T        | Shift+F7    | Opens Thesaurus dialog.                                                       |
| &Hyphenation…          | H        | (none)      | Opens Hyphenation dialog.                                                     |
| &Language…             | L        | (none)      | Opens Language dialog (mark selected text with a language for spell/grammar). |
| &Word Count…           | W        | (none)      | Opens Word Count dialog.                                                      |
| --- separator ---      |          |             |                                                                               |
| &AutoCorrect…          | A        | (none)      | Opens AutoCorrect dialog.                                                     |
| Mail Mer&ge…           | M        | (none)      | Opens Mail Merge Helper.                                                      |
| En&velopes and Labels… | E        | (none)      | Opens Envelopes and Labels dialog.                                            |
| Pro&tect Document…     | P        | (none)      | Opens Protect Document dialog.                                                |
| R&evisions…            | R        | (none)      | Opens Revisions dialog.                                                       |
| --- separator ---      |          |             |                                                                               |
| Macr&o…                | C        | Alt+F8      | Opens Macro dialog (list of macros, run/edit/create/delete/organizer).        |
| Cu&stomize…            | Z        | (none)      | Opens Customize dialog (Toolbars / Menus / Keyboard tabs).                    |
| &Options…              | O        | (none)      | Opens Options dialog (12 tabs — §Options Dialog).                             |

### Table Menu (`&Table`, Alt+A)

| Item                                             | Mnemonic | Accelerator                           | Action                                                                                                                                              |
| ------------------------------------------------ | -------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| &Insert Table…                                   | I        | (none)                                | Opens Insert Table dialog (rows, cols, column width, AutoFormat…).                                                                                  |
| &Delete Cells… / Delete Rows / Delete Columns    | D        | (none)                                | Opens Delete Cells dialog (Shift cells left, Shift cells up, Delete entire row, Delete entire column). Menu item label changes based on selection.  |
| &Merge Cells                                     | M        | (none)                                | Merges the selected adjacent cells into one.                                                                                                        |
| Sp&lit Cells…                                    | P        | (none)                                | Opens Split Cells dialog (columns, rows; "Merge cells before split" checkbox).                                                                      |
| Select &Row                                      | R        | (none)                                | Selects the row(s) containing the insertion point/selection.                                                                                        |
| Select &Column                                   | C        | (none)                                | Selects column(s).                                                                                                                                  |
| Select &Table                                    | A        | Alt+Num5 [verify — with Num Lock off] | Selects the entire table.                                                                                                                           |
| Table &AutoFormat…                               | F        | (none)                                | Opens Table AutoFormat dialog.                                                                                                                      |
| --- separator ---                                |          |                                       |                                                                                                                                                     |
| Cell &Height and Width…                          | W        | (none)                                | Opens Cell Height and Width dialog (tabs Row, Column — cell width, space between columns, row height At Least/Exactly/Auto, row span across pages). |
| &Headings                                        | H        | (none)                                | Toggles designation of selected rows as table heading (repeated at top of every page).                                                              |
| Con&vert Text to Table… / Convert Table to Text… | V        | (none)                                | Opens the appropriate conversion dialog. For Text-to-Table: Separator at (○ Paragraphs, ○ Commas, ○ Tabs, ○ Other).                                 |
| &Sort…                                           | S        | (none)                                | Opens Sort dialog (up to 3 keys, Field number, Type: Text/Number/Date, Ascending/Descending; "Header row" detection).                               |
| F&ormula…                                        | O        | (none)                                | Opens Formula dialog (=SUM(ABOVE), =AVERAGE(LEFT), etc.).                                                                                           |
| Split Ta&ble                                     | B        | Ctrl+Shift+Enter                      | Splits the table at the current row (inserts a paragraph between the two halves).                                                                   |
| Gridlines                                        | G        | (none)                                | Toggles display of non-printing table gridlines.                                                                                                    |

**NOT IN WORD 95 (Table menu):** "Draw Table" (pencil tool) and "Eraser" were added in Word 97. Word 95 tables are created exclusively via Insert Table, the Table Wizard, or Convert Text to Table.

#### Table → Insert Table Dialog

- Number of Columns (spin).
- Number of Rows (spin).
- Column Width (combo: Auto, or inches — Auto divides margins equally).
- AutoFormat… button (launches Table AutoFormat before the insert).
- Wizard… button (launches the Table Wizard).

#### Table Wizard

A 6-step wizard for complex tables (financial tables, calendar layouts, etc.). Steps: 1) pick style (six templates), 2) choose row labels, 3) column labels, 4) format heading/body styles, 5) number of rows and columns, 6) finish — with Back / Next / Cancel / Finish buttons.

#### Table → Table AutoFormat Dialog

- Formats list: 34+ named formats — Simple 1/2/3, Classic 1/2/3/4, Colorful 1/2/3, Columns 1/2/3/4/5, Grid 1/2/3/4/5/6/7/8, List 1/2/3/4/5/6/7/8, 3D Effects 1/2/3, Contemporary, Elegant, Professional, Subtle 1/2.
- Preview pane.
- Formats to Apply: Borders, Shading, Font, Color, AutoFit.
- Apply Special Formats To: Heading Rows, First Column, Last Row, Last Column.

### Window Menu (`&Window`, Alt+W)

| Item                  | Mnemonic | Accelerator | Action                                                                                                                                                                                                 |
| --------------------- | -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| &New Window           | N        | (none)      | Creates a second view onto the same document. Titles become `{doc}:1` and `{doc}:2`. Edits in either view appear in both; saving either writes the same file.                                          |
| &Arrange All          | A        | (none)      | Tiles all non-minimized MDI child windows.                                                                                                                                                             |
| &Split / Remove Split | S        | (none)      | Activates a horizontal split drag mode (or toggles off an existing split). Splits one document window into two panes that can be scrolled independently, showing different parts of the same document. |
| --- separator ---     |          |             |                                                                                                                                                                                                        |
| &1 {doc 1}            | 1        |             | Activate that child window.                                                                                                                                                                            |
| &2 {doc 2}            | 2        |             | Active window shown with `✓` before its name.                                                                                                                                                          |
| …                     |          |             |                                                                                                                                                                                                        |

Up to 9 windows can be listed by number; beyond that, "More Windows…" opens an Activate dialog.

### Help Menu (`&Help`, Alt+H)

| Item                        | Mnemonic | Accelerator                                             | Action                                                                                                                                              |
| --------------------------- | -------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Microsoft Word &Help Topics | H        | F1 (context-sensitive; else opens the main help topics) | Opens the Windows 95 HTML-help-predecessor help viewer (`*.hlp` WinHelp 4.0 format) with tabs Contents, Index, Find.                                |
| &Answer Wizard…             | A        | (none)                                                  | Opens the Answer Wizard pane — natural-language question box. Typing "How do I add a picture?" returns ranked list of help topics (Bayesian model). |
| &The Microsoft Network…     | N        | (none)                                                  | Launches MSN client (if installed); else dial-up sign-up. Present only if Windows 95 MSN components are installed.                                  |
| --- separator ---           |          |                                                         |                                                                                                                                                     |
| &WordPerfect Help…          | W        | (none)                                                  | Opens WordPerfect Help dialog (for WP 5.1/6.0 users): type a WP command and see the Word equivalent, optionally with navigation demo.               |
| --- separator ---           |          |                                                         |                                                                                                                                                     |
| &About Microsoft Word       | A        | (none)                                                  | Opens About dialog (version 7.0a, license name/org, System Info… button, Tech Support… button, Tip of the Day icon with Tips).                      |

## Toolbars

Word 95 ships with **10 toolbars** (Standard, Formatting, Borders, Database, Drawing, Forms, Mail Merge, Microsoft, TipWizard, Word for Windows 2.0 [verify]). In addition, context-specific toolbars appear when relevant: Header and Footer, Master Document, Outline, Full Screen, Print Preview.

### Toolbar Infrastructure

- Every toolbar can be docked (top, bottom, left, right) or floating (in a Windows 95 style tool palette with caption).
- Float by dragging off an edge; redock by dragging back or by double-clicking the title of a floating palette to snap it to its previous dock.
- Toolbars are shown/hidden via View → Toolbars or by right-clicking any toolbar to open the Toolbars popup (which lists every toolbar with checkmarks).
- View → Toolbars dialog offers: Checkbox list of all 10+ toolbars; Reset (per toolbar); Customize…; Large Buttons checkbox; Show ToolTips checkbox; With Shortcut Keys checkbox (append Ctrl+letter to tooltips); Color Buttons checkbox.

### Standard Toolbar

Default position: top, directly beneath menu bar. 22 buttons in default order:

| # | Button | Tooltip | Action |
| 1 | New | New | Create new doc from `Normal.dot`. (Ctrl+N) |
| 2 | Open | Open | File → Open. (Ctrl+O) |
| 3 | Save | Save | File → Save. (Ctrl+S) |
| 4 | Print | Print | Prints active document to default printer with no dialog. |
| 5 | Print Preview | Print Preview | View → Print Preview. (Ctrl+F2) |
| 6 | Spelling | Spelling | Tools → Spelling. (F7) |
| 7 | Cut | Cut | Edit → Cut. (Ctrl+X) |
| 8 | Copy | Copy | Edit → Copy. (Ctrl+C) |
| 9 | Paste | Paste | Edit → Paste. (Ctrl+V) |
| 10 | Format Painter | Format Painter | Single click copies formatting, one-shot paste; double click latches for multiple pastes; Esc or second click releases. |
| 11 | Undo | Undo | Split button: left click undoes one; dropdown shows up to N recent actions. (Ctrl+Z) |
| 12 | Redo | Redo | Split button equivalent. (Ctrl+Y) |
| 13 | AutoFormat | AutoFormat | Runs AutoFormat Now on the document. |
| 14 | Insert Address (from Schedule+/Personal Address Book) | Insert Address | Opens the Windows address picker; inserts selected contact as a mail-merge style block. Introduced in Word 95. [verify] |
| 15 | Insert Table | Insert Table | Click to drop a drag grid (column × rows) floating menu; selecting e.g. 3×4 inserts a table. |
| 16 | Insert Microsoft Excel Worksheet | Insert Microsoft Excel Worksheet | Click to drop a grid; selecting inserts an embedded Excel worksheet OLE object. |
| 17 | Columns | Columns | Click to drop a 1–4 column grid. |
| 18 | Drawing | Drawing | Toggles the Drawing toolbar. |
| 19 | Show/Hide ¶ | Show/Hide ¶ | Toggles display of non-printing characters. (Ctrl+Shift+8) |
| 20 | Zoom Control | Zoom Control | Drop-down combobox: 200%, 150%, 100%, 75%, 50%, 25%, 10%, Page Width, Whole Page, Two Pages; or type a value. |
| 21 | TipWizard | TipWizard | Toggles the TipWizard strip (between toolbars and ruler). |
| 22 | Help | Help | Enters context help mode: the pointer becomes an arrow-with-question-mark; next click reveals help for the clicked UI element. (Shift+F1) |

### Formatting Toolbar

Default position: below Standard toolbar. 17 controls:

| # | Control | Tooltip | Action |
| 1 | Style | Style | Dropdown combo listing paragraph styles in the current document. Typing a new name plus Enter creates a new style from the current paragraph. (Ctrl+Shift+S focuses). |
| 2 | Font | Font | Combo of installed fonts; shows MRU fonts at top. (Ctrl+Shift+F focuses). |
| 3 | Font Size | Font Size | Combo of sizes 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72. (Ctrl+Shift+P focuses). |
| 4 | Bold | Bold | (Ctrl+B). |
| 5 | Italic | Italic | (Ctrl+I). |
| 6 | Underline | Underline | Single underline. (Ctrl+U). |
| 7 | Align Left | Align Left | (Ctrl+L). |
| 8 | Center | Center | (Ctrl+E). |
| 9 | Align Right | Align Right | (Ctrl+R). |
| 10 | Justify | Justify | (Ctrl+J). |
| 11 | Numbering | Numbering | Apply/remove default numbered-list formatting (1., 2., 3.). |
| 12 | Bullets | Bullets | Apply/remove default bulleted-list formatting (•). |
| 13 | Decrease Indent | Decrease Indent | Left-indent by 0.5" or previous tab. |
| 14 | Increase Indent | Increase Indent | Left-indent by 0.5" or next tab. |
| 15 | Borders | Borders | Toggles the Borders toolbar. |
| 16 | Highlight | Highlight | Split button: pick a highlight color (yellow default); click to apply to selection; with no selection latches for drag-apply. [verify — Word 95 introduced Highlight as a new feature; Word 95 highlight palette has 15 colors + None]. |
| 17 | Font Color | Font Color | Split button with last-used color. |

### Borders Toolbar

Shown on toggle (Borders button on Formatting, or Format → Borders and Shading and toggling the "Show Toolbar" option in Options). Default 12 controls:

| # | Control | Tooltip | Action |
| 1 | Line Style | Line Style | Combo: hairline, 0.5, 0.75, 1.0, 1.5, 2.25, 3.0, 4.5, 6.0 pt, double, thick-double, thick-thin, thin-thick, thin-thick-thin, dotted. |
| 2 | Top Border | Top Border | Toggles top border on selection (paragraph or cell). |
| 3 | Bottom Border | Bottom Border | |
| 4 | Left Border | Left Border | |
| 5 | Right Border | Right Border | |
| 6 | Inside Border | Inside Border | For tables: apply to inside cell boundaries. |
| 7 | Outside Border | Outside Border | Applies all four outside borders. |
| 8 | No Border | No Border | Removes all borders. |
| 9 | (separator) | | |
| 10 | Shading | Shading | Combo: None, 5%, 10%, 12.5%, 15%, 20%, 25%, 30%, 35%, 40%, 45%, 50%, 55%, 60%, 65%, 70%, 75%, 80%, 85%, 87.5%, 90%, 95%, Solid, Red Solid, Red 25%, etc. |

### Database Toolbar

Appears when viewing a mail-merge data-source document (a Word table or CSV) or when the user toggles it. 8 controls:

| # | Control | Tooltip | Action |
| 1 | Data Form | Data Form | Opens a form-style view onto the data source records. |
| 2 | Manage Fields | Manage Fields | Add/remove/rename fields of a Word-table data source. |
| 3 | Add New Record | Add New Record | Append a row. |
| 4 | Delete Record | Delete Record | Delete current row. |
| 5 | Sort Ascending | Sort Ascending | Sort by the selected column. |
| 6 | Sort Descending | Sort Descending | |
| 7 | Insert Database | Insert Database | Opens Database dialog. |
| 8 | Update Fields | Update Fields | Refresh fields in the document (F9). |
| 9 | Find Record | Find Record | Find matching text in the data source. |
| 10 | Mail Merge | Mail Merge Main Document | Switch to the main merge document. |

### Drawing Toolbar

Shown on toggle (Drawing button on Standard). Default 18 controls:

| # | Control | Tooltip | Action |
| 1 | Line | Line | Draw straight line. |
| 2 | Rectangle | Rectangle | Draw rectangle. Shift-drag constrains to square. |
| 3 | Ellipse | Ellipse | Draw ellipse/circle. |
| 4 | Arc | Arc | Draw quarter-ellipse arc. |
| 5 | Freeform | Freeform | Polyline/freehand polygon tool — click to add vertex, drag for freehand segment, double-click to close. |
| 6 | Text Box | Text Box | In Word 95 this inserts a **frame** (the pre-textbox floating container) with text anchor. [verify — Some Word 95 references label this "Text Box" button as "Callout" or "Create Text Frame"; Word 97 introduces the distinct Text Box shape.] |
| 7 | Callout | Callout | Insert a callout (line with text bubble pointing to a target). |
| 8 | Format Callout | Format Callout | Opens Callout dialog. |
| 9 | Fill Color | Fill Color | Split button. |
| 10 | Line Color | Line Color | Split button. |
| 11 | Line Style | Line Style | Menu of line thicknesses. |
| 12 | Dashed Line | Dashed Line | Menu of dash patterns. |
| 13 | Arrow Style | Arrow Style | Menu of start/end arrowhead combinations. |
| 14 | Shadow | Shadow | Toggle drop shadow. |
| 15 | Bring to Front | Bring to Front | Z-order top. |
| 16 | Send to Back | Send to Back | |
| 17 | Bring in Front of Text | Bring in Front of Text | Move drawing layer above main text (default). |
| 18 | Send Behind Text | Send Behind Text | Below text as watermark. |
| 19 | Group | Group | Group selected objects. |
| 20 | Ungroup | Ungroup | |
| 21 | Flip Horizontal | Flip Horizontal | Mirror selection left-right. |
| 22 | Flip Vertical | Flip Vertical | |
| 23 | Rotate Right | Rotate Right 90° | Only 90° rotations in Word 95. |
| 24 | Reshape | Reshape | Enter vertex-edit mode for freeform. |
| 25 | Snap to Grid | Snap to Grid | Opens Snap to Grid dialog. |
| 26 | Align Drawing Objects | Align | Opens Align dialog. |
| 27 | Create Picture | Create Picture | Enter picture-editing mode (a separate picture window). |
| 28 | Insert Frame | Insert Frame | |

**NOT IN WORD 95 drawing layer:** arbitrary angle rotation, AutoShapes categories ribbon (Word 95 has individual shape tools only; Word 97 groups them under AutoShapes), SmartArt, curve-smoothing tool, 3-D styles.

### Forms Toolbar

6 controls, shown when Forms toolbar is toggled (used with Insert → Form Field):

| # | Control | Tooltip | Action |
| 1 | Text Form Field | Text Form Field | Inserts a text form field. |
| 2 | Check Box Form Field | Check Box Form Field | |
| 3 | Drop-Down Form Field | Drop-Down Form Field | |
| 4 | Form Field Options | Form Field Options | Opens Options for the selected form field (Type: Regular Text / Number / Date / Current Date / Current Time / Calculation; Default Text; Maximum Length; Text Format; Bookmark; Calculate on Exit; Help Text). |
| 5 | Insert Table | Insert Table | |
| 6 | Insert Frame | Insert Frame | |
| 7 | Form Field Shading | Form Field Shading | Toggles gray background on form fields (on-screen only). |
| 8 | Protect Form | Protect Form | Toggles Tools → Protect Document → Forms. |

### Mail Merge Toolbar

Appears after Mail Merge Helper configures the main document. 13 controls:

| # | Control | Tooltip | Action |
| 1 | Insert Merge Field | Insert Merge Field | Dropdown listing data source fields. |
| 2 | Insert Word Field | Insert Word Field | Dropdown listing Ask, Fill-in, If…Then…Else, Merge Record #, Merge Sequence #, Next Record, Next Record If, Set Bookmark, Skip Record If. |
| 3 | View Merged Data | View Merged Data | Toggle between showing merge field codes and merged data. |
| 4 | First Record | First Record | |
| 5 | Previous Record | Previous Record | |
| 6 | Go To Record | Go To Record | Spin control. |
| 7 | Next Record | Next Record | |
| 8 | Last Record | Last Record | |
| 9 | Mail Merge Helper | Mail Merge Helper | Reopens Mail Merge Helper. |
| 10 | Check for Errors | Check for Errors | Validate merge setup. |
| 11 | Merge to New Document | Merge to New Document | Generates merged docs in memory. |
| 12 | Merge to Printer | Merge to Printer | Merges directly to default printer. |
| 13 | Mail Merge… | Mail Merge… | Opens Merge dialog (options: which records, errors, query options). |
| 14 | Find Record | Find Record | Search for a record's field value. |
| 15 | Edit Data Source | Edit Data Source | Open the data source document. |

### Microsoft Toolbar

Office 95 integration. Shows icons for each Office 95 app that is installed on the machine. 9 icons:

1. Microsoft Excel
2. Microsoft PowerPoint
3. Microsoft Mail (Schedule+)
4. Microsoft Access
5. Microsoft FoxPro (if installed)
6. Microsoft Project (if installed)
7. Microsoft Schedule+
8. Microsoft Publisher (if installed)

Clicking launches the respective app (or brings it to foreground). Hidden by default; available via View → Toolbars.

### TipWizard Toolbar

A single-row strip showing a rotating Tip of the Day / usage suggestion based on recently used commands. 3 controls:

| # | Control | Tooltip | Action |
| 1 | Previous Tip | Previous Tip | Show previous tip in queue. |
| 2 | Next Tip | Next Tip | |
| 3 | Show Me | Show Me | (When present on a tip) runs a brief demo animation of the feature. |
| 4 | TipWizard Box | — | The current tip's text label. |

Hidden by default on clean install but re-opens when Word detects inefficient user interactions (typing many spaces instead of centering, etc.).

### Header and Footer Toolbar

Appears only when editing a header or footer (via View → Header and Footer or by double-clicking header area in Page Layout view). 11 controls:

| # | Control | Tooltip | Action |
| 1 | Insert AutoText ▸ | Insert AutoText | Menu with Page X of Y, Created by, Created on, Filename, Filename and path, Last printed, Last saved by, Page X, Confidential, Author/Page/Date. |
| 2 | Insert Page Number | Insert Page Number | |
| 3 | Insert Number of Pages | Insert Number of Pages | |
| 4 | Format Page Number | Format Page Number | Opens Page Number Format dialog. |
| 5 | Insert Date | Insert Date | |
| 6 | Insert Time | Insert Time | |
| 7 | Page Setup | Page Setup | Opens File → Page Setup. |
| 8 | Show/Hide Document Text | Show/Hide Document Text | Toggle visibility of body text while editing header/footer. |
| 9 | Same as Previous | Same as Previous | Toggle "link to previous section" for this header/footer. |
| 10 | Switch Between Header and Footer | Switch Between Header and Footer | |
| 11 | Show Previous | Show Previous | |
| 12 | Show Next | Show Next | |
| 13 | Close | Close | |

### Master Document Toolbar

Appears in Master Document view. 9 controls:

1. Outline (button): Collapse/Expand.
2. Promote / Demote / Demote to Body Text.
3. Move Up / Move Down.
4. Expand/Collapse Subdocs.
5. Master Document View button.
6. Outline View button.
7. Create Subdocument.
8. Remove Subdocument.
9. Insert Subdocument.
10. Merge Subdocument.
11. Split Subdocument.
12. Lock Document.

### Outline Toolbar

Appears in Outline view (and when editing the outline of a Master Document). 11 controls:

1. Promote (Alt+Shift+←).
2. Demote (Alt+Shift+→).
3. Demote to Body Text.
4. Move Up (Alt+Shift+↑).
5. Move Down (Alt+Shift+↓).
6. Expand (Alt+Shift+`+`).
7. Collapse (Alt+Shift+`-`).
8. Show Heading 1 (Alt+Shift+1).
9. Show Heading 2 (Alt+Shift+2).
10. … up through Show Heading 9 (Alt+Shift+9 shows heading 9).
11. Show All Headings (Alt+Shift+A).
12. Show First Line Only (Alt+Shift+L).
13. Show Formatting (`/`).
14. Master Document View button (jumps to MDV retaining the outline).

### Full Screen Toolbar

Shown when in View → Full Screen. Single button: "Full" (with monitor icon). Click to exit Full Screen and return to previous view.

### Print Preview Toolbar

Shown while in Print Preview. 9 controls:

1. Print.
2. Magnifier (toggle zoom-and-edit cursor).
3. One Page.
4. Multiple Pages (drops a grid to choose 1×1 up to 6×3).
5. Zoom Control (combobox).
6. View Ruler.
7. Shrink to Fit.
8. Full Screen.
9. Close.
10. Help (Shift+F1 context help).

## Views

### Normal View

The fastest view; designed for drafting. Page boundaries are represented by a horizontal dashed line (with a "Page Break" label if a manual break). Headers and footers are not visible; margins are not visible. Multi-column layouts are rendered as a single column to save rendering time (column breaks appear as the dashed line). Pictures and frames appear inline at approximately their final size. Drawing-layer objects from the drawing layer are **not shown** in Normal view (they exist but are hidden). Section breaks appear as double-dotted lines with "End of Section" label. Tab, paragraph, and space-dot characters shown per the Show/Hide ¶ setting.

### Outline View

Displays the document collapsed to heading levels. Each heading shows a [+] or [−] box to its left. The Outline toolbar appears at the top of the workspace. Drag-and-drop reordering: dragging a [+] handle moves the heading and all its subordinates. Promote/Demote change the heading level (Heading 1 ↔ 9, or "Body Text"). Indent reflects heading level. Collapsed branches are marked with a wavy underline under the heading text. Double-clicking the [+] box expands/collapses.

### Page Layout View

Shows each page as a white rectangle on a gray background, in a continuous vertical flow with a small gray gap between pages. Margins, headers, footers, page numbers all visible and editable. Frames and drawing objects shown at their actual positions. Multi-column layout is rendered accurately. The vertical ruler appears on the left. Page breaks are implicit (new page starts a new white rectangle). Slower than Normal view on large documents. Zoom combo controls page display size.

### Master Document View

A specialized Outline view with a Master Document toolbar that manages **subdocuments** — each subdocument is stored as a separate `.doc` file and linked into the master via `INCLUDETEXT` fields. A master document may be collapsed (showing only the subdoc filenames) or expanded. Subdocuments can be:

- **Created** from selected outline text (splits off a new `.doc`, names it by heading text).
- **Inserted** from an existing file.
- **Removed** (unlinked, content merged back into master).
- **Merged** (combine adjacent subdocs into one file).
- **Split** (break a subdoc at the current selection).
- **Locked** for read-only by other editors.

Concurrent multi-author editing is by file-lock: Word warns if someone else has a subdocument open. Known pitfalls: orphaned subdocument files if the master is moved; corruption risks on slow networks; hyperlinks across subdocs behave oddly.

### Full Screen

Hides title, menu, toolbars, status, scrollbars, and shows only document area plus a floating "Full Screen" toolbar. Keyboard shortcuts still work; right-click menus still work. Escape exits.

### Print Preview

A live WYSIWYG render of the document. Multi-page grid (1×1, 1×2, 1×3, 2×1, 2×2, 2×3, 3×3, 6×3). Magnifier tool toggles between zoom (click to zoom 100%, click again to shrink) and edit cursor (click to insert caret, type/edit in place). "Shrink to Fit" button: if the last page has only a few lines, Word reduces font sizes in 0.5-pt steps until the document fits on one fewer page.

## Ruler

Horizontal and vertical rulers; horizontal is always shown in Normal/Page Layout view unless hidden; vertical appears only in Page Layout view.

### Horizontal Ruler Contents

- Tick marks every 1/8 inch (unit configurable in Options → General: inches, cm, mm, points, picas).
- **Left margin** indicator: the gray bar at each end shows the printed margin extent. The white area between indicates printable width.
- **First-line indent marker** (the upper triangle ▽ on the left).
- **Hanging indent marker** (the lower triangle △ on the left).
- **Left indent marker** (the small square ▢ below the triangles) — drag it to move both first-line and hanging indent together.
- **Right indent marker** (the lower triangle △ on the right).
- **Tab stops** — L-shaped (Left tab), upside-down T (Center), backwards-L (Right), upside-down T with dot (Decimal), vertical bar (Bar).
- **Tab alignment selector** (far left of ruler): click to cycle through Left / Center / Right / Decimal / Bar.
- **Column gutter region** (in Page Layout view with columns): white column area, gray between columns.

### Horizontal Ruler Drag Interactions

- Drag any tab-stop icon: moves the tab stop. Holding Alt gives exact measurement in the ruler.
- Drag a tab stop off the ruler: removes it.
- Click the tab selector cycle, then click ruler at desired location: creates a new tab stop of that alignment.
- Drag first-line indent triangle: moves only first-line indent.
- Drag hanging indent triangle: moves hanging/left indent (not first-line).
- Drag left-indent square: moves both together.
- Drag right-indent triangle: sets right indent.
- Drag the gray-white boundary at the extreme left/right of the ruler: adjusts left/right page margin (not the paragraph indent).
- Double-click anywhere on the ruler: opens Tabs dialog (or Page Setup if in the margin area).

### Vertical Ruler Contents

- Tick marks every 1/8 inch.
- Top and bottom margin gray bars.
- Header area indicator (a mini gray bar at top-of-page showing header height).
- Footer area indicator at bottom.
- In a table: row-height dividers can be dragged on the vertical ruler.

### Vertical Ruler Drag

- Drag top-margin boundary: changes top margin.
- Drag bottom-margin boundary: changes bottom margin.
- Drag header/footer edge: resizes header/footer frame.
- In a table: drag row divider to resize row.

## Editing

### Selection Modes

**Stream selection (default):**

- Click to place caret.
- Shift+click to extend selection from caret to click point.
- Drag to select a contiguous range.
- Double-click to select a word.
- Triple-click to select a paragraph.
- Ctrl+click to select a sentence.
- Click in left margin ("selection bar") to select a line; double-click to select a paragraph; triple-click to select the entire document; Ctrl+click to select a sentence.
- Shift+arrow keys extend one unit; Ctrl+Shift+arrow extends one word (left/right) or one paragraph (up/down).

**Column selection (block/rectangle):**

- Hold Alt while dragging: selects a rectangular block spanning rows and columns of text (inside a non-table region).
- Alt+drag gives a column (block) selection.
- Within a column block, copy/cut/type-replaces operate on the rectangle. Pasting a column block into a single insertion point inserts the block at that location (each original line becomes a new line).

**Extend Selection Mode (F8):**

Press F8 to enter Extend mode (status bar shows `EXT`). Successive F8 keypresses progressively extend:

1. First F8: turn on EXT (no visible change).
2. Second F8: select current word.
3. Third F8: select current sentence.
4. Fourth F8: select current paragraph.
5. Fifth F8: select current section.
6. Sixth F8: select entire document.

**Shift+F8** shrinks back through these levels. Once in EXT mode, clicking extends to the click point; arrow keys extend by the arrow unit. Escape leaves EXT mode preserving selection.

### Typing Replaces Selection

When text is selected and a printable character or Enter is pressed, the selection is replaced by the typed character. Controlled by Tools → Options → Edit → "Typing replaces selection" (default on).

### Drag-and-Drop Text

- When enabled (Options → Edit → "Drag-and-drop text editing"; default on), dragging a selection moves it to the drop target.
- Ctrl+drag copies instead of moves.
- Right-drag: on release, offers a context menu (Move Here, Copy Here, Link Here, Create Hyperlink Here, Cancel). [verify — right-drag in Word 95 may not include "Create Hyperlink Here" option; that is 97+.]
- Drop across windows (MDI children or applications) moves/copies between documents.

### Smart Cut and Paste

When "Use smart cut and paste" is on (Options → Edit; default on):

- Cutting the first word of a sentence automatically removes the space that would otherwise be orphaned.
- Pasting before an existing word automatically inserts a space.
- Cutting a whole word at end of sentence leaves a single period.

### Overtype Mode

- Insert key toggles overtype mode on/off. Status bar `OVR` is dark when on, dim when off.
- Can be disabled (the Insert key won't toggle) via Options → Edit → "Use the INS key for paste" — when this is on, Insert becomes a paste shortcut instead of toggle.

### Undo and Redo Stacks

- Every editing operation (typing, deletion, formatting, insertion, structural) pushes an entry onto the undo stack.
- Stack depth is dynamically limited by memory; typical practical depth 100+ actions. [verify — Word 95 KB articles cite 100-action limit for some operations]
- Undo button (Standard toolbar) is a split button: main click undoes one; dropdown shows the last N actions, and selecting an entry N-down undoes N actions.
- Redo button mirrors this for the redo stack.
- A Save does **not** clear the undo stack in Word 95 — unlike some predecessors. [verify]
- Certain operations are "undoable sequences" (e.g., AutoFormat's many changes can be undone with one Undo).

### Keyboard Navigation Reference

| Shortcut | Action |
| Left/Right | One character. |
| Up/Down | One line (tries to maintain column). |
| Home | Beginning of line. |
| End | End of line. |
| Ctrl+Left/Right | One word. |
| Ctrl+Up/Down | One paragraph. |
| Ctrl+Home | Top of document. |
| Ctrl+End | Bottom of document. |
| PageUp/PageDown | One screen. |
| Ctrl+PageUp/Down | Top of previous/next screen. |
| Alt+Ctrl+PageUp/Down | Top/bottom of window. |
| F5 | Go To dialog. |
| Shift+F5 | Go back to previous edit position (cycles through last 3). |
| Ctrl+G | Go To dialog (alt). |
| F6 | Next pane (if split). |
| Shift+F6 | Previous pane. |

## Character Formatting

### Properties

- **Font family** — any installed TrueType or printer font. Non-TrueType fonts marked with printer icon. TrueType fonts marked "TT".
- **Font size** — 1 pt to 1638 pt in 0.5 pt increments. Direct entry in Formatting toolbar or Font dialog.
- **Bold** — Ctrl+B.
- **Italic** — Ctrl+I.
- **Underline styles** — None (Ctrl+U toggles Single), Single (Ctrl+U), Words Only (Ctrl+Shift+W), Double (Ctrl+Shift+D), Dotted (via Font dialog only). **Only these 5** in Word 95. [verify — Dashed and Wavy came in Word 97]
- **Strikethrough** — via Font dialog only; no default keyboard shortcut.
- **Hidden text** — via Font dialog or Ctrl+Shift+H. Hidden text optionally displayed on screen (Options → View) and printed (Options → Print).
- **Small Caps** — Ctrl+Shift+K.
- **All Caps** — Ctrl+Shift+A.
- **Superscript** — Ctrl+Shift+= (equals sign).
- **Subscript** — Ctrl+= (equals sign).
- **Font color** — 16 colors (Auto, Black, Blue, Cyan, Green, Magenta, Red, Yellow, White, and 8 darker/lighter variants).
- **Highlight color** — 15 colors + None (new in Word 95).
- **Character spacing** — Expanded or Condensed By N points (0.1 pt resolution).
- **Character position** — Raised or Lowered By N points (relative to baseline).
- **Kerning** — TrueType pair-kerning enabled for fonts at or above the user-specified point threshold.

### Shortcut Summary

| Shortcut | Effect |
| Ctrl+B | Toggle bold |
| Ctrl+I | Toggle italic |
| Ctrl+U | Toggle single underline |
| Ctrl+Shift+W | Toggle words-only underline |
| Ctrl+Shift+D | Toggle double underline |
| Ctrl+Shift+H | Toggle hidden |
| Ctrl+Shift+K | Toggle small caps |
| Ctrl+Shift+A | Toggle all caps |
| Ctrl+= | Subscript |
| Ctrl+Shift+= | Superscript |
| Ctrl+Space | Clear character formatting (restore to style default) |
| Ctrl+Shift+F | Activate Font family combo |
| Ctrl+Shift+P | Activate Font Size combo |
| Ctrl+Shift+> | Increase font to next "grow" size |
| Ctrl+Shift+< | Decrease font to previous "shrink" size |
| Ctrl+] | Grow by 1 pt |
| Ctrl+[ | Shrink by 1 pt |
| Ctrl+Shift+Q | Symbol font |
| Shift+F3 | Cycle case (lowercase → Title Case → UPPERCASE → lowercase) |

## Paragraph Formatting

### Properties

- **Alignment** — Left (Ctrl+L), Centered (Ctrl+E), Right (Ctrl+R), Justified (Ctrl+J).
- **Left indent** — inches (negative permitted down to the print margin).
- **Right indent** — inches.
- **Special indent** — none, first-line (by N), hanging (by N).
- **Line spacing** — Single (Ctrl+1), 1.5 Lines (Ctrl+5), Double (Ctrl+2), At Least, Exactly, Multiple.
- **Space before** — points.
- **Space after** — points.
- **Widow/Orphan Control** — default on; prevents single lines of a paragraph stranded at top/bottom of page.
- **Keep Lines Together** — entire paragraph must fit on one page.
- **Keep with Next** — paragraph must appear on the same page as the one following.
- **Page Break Before** — always starts on a new page.
- **Suppress Line Numbers** — if line numbering is on at section/page level, this paragraph is excluded.
- **Don't Hyphenate** — excluded from auto-hyphenation.

### Paragraph Shortcut Summary

| Shortcut | Effect |
| Ctrl+L | Left align |
| Ctrl+E | Center |
| Ctrl+R | Right align |
| Ctrl+J | Justify |
| Ctrl+M | Increase left indent by one tab |
| Ctrl+Shift+M | Decrease left indent by one tab |
| Ctrl+T | Create hanging indent (or increase hanging) |
| Ctrl+Shift+T | Reduce hanging indent |
| Ctrl+1 | Single spacing |
| Ctrl+2 | Double spacing |
| Ctrl+5 | 1.5 line spacing |
| Ctrl+0 (zero) | Toggle 12-pt space before |
| Ctrl+Q | Remove all direct paragraph formatting (restore to style default) |
| Ctrl+Shift+S | Focus Style combo |
| Ctrl+Shift+N | Apply Normal style |
| Ctrl+Alt+1 | Apply Heading 1 style |
| Ctrl+Alt+2 | Apply Heading 2 style |
| Ctrl+Alt+3 | Apply Heading 3 style |
| Ctrl+Shift+L | Apply List Bullet style |

## Tabs

- Five tab types: Left, Center, Right, Decimal, Bar (Bar draws a vertical line at the tab position).
- Leader characters: None, Dots (`…`), Dashes (`----`), Underscores (`____`).
- Default tab stops: at N inches (user-configurable) when no explicit tab stop is set at or before the insertion column.
- Set tabs via Format → Tabs or the ruler click-to-create gesture.
- Individual paragraphs can override the default tab stops; an individual tab stop set on a paragraph supersedes the default tab grid at positions up through that stop.
- Tabs are stored per paragraph (part of paragraph formatting). When a style carries tabs, the style's tabs apply unless overridden on an individual paragraph.
- Clear All in the Tabs dialog removes all paragraph-local tabs (falls back to default grid). The `Clear` button removes the selected stop.
- A Bar tab does not advance the insertion point — it draws a vertical line at that position spanning the paragraph's line height. Useful for ruled lists.
- Decimal tabs align the decimal point of the next typed number with the tab stop. If no decimal is typed, the tab behaves like a Right tab.
- Tab stops are stored in twips in the underlying format (1/1440 inch); the Tabs dialog shows values in the user-selected unit (Options → General → Measurement units).

## Borders and Shading Details

### Paragraph Borders

- Applied per paragraph; can surround a single paragraph (all four sides), or appear between successive paragraphs that share the same border definition (Word renders as a continuous box around the group unless "Between" borders are disabled).
- Four sides: Top, Bottom, Left, Right. Plus a "Between" border that appears between two consecutive same-bordered paragraphs.
- Border styles (15 total in Word 95): Hairline (effective single thin), Single 1/2 pt, Single 3/4 pt, Single 1 pt, Single 1 1/2 pt, Single 2 1/4 pt, Single 3 pt, Single 4 1/2 pt, Single 6 pt, Double, Thick-Thin, Thin-Thick, Thin-Thick-Thin, Thick-Double, Dotted.
- Border color: same 16-color palette as font color.
- From Text: distance in points from text to inner edge of border (0 pt to 31 pt).
- Shadow preset: adds a gray drop shadow on right and bottom.
- Box preset: four equal borders, no shadow.
- None preset: removes all borders.

### Table Borders

- Four outside sides plus two inside (horizontal and vertical) borders.
- Apply To combo: Cell (borders on selected cells only) or Table (borders on all cells in the table).
- Each cell can also carry individual side borders overriding the table-wide setting.
- Same 15 line styles and 16 colors.

### Shading

- Fill percentages: None, Clear (transparent), Solid (100%), plus 5% through 95% in 5% increments (plus 12.5%, 37.5%, 62.5%, 87.5% for compatibility with dithered rendering).
- Foreground color: 16 colors (for the pattern's foreground if non-solid).
- Background color: 16 colors.
- Patterns shown in a preview combo: solid, 5%, 10%, 20%, ... 90%, cross-hatch, diagonal hatches, etc.
- Applied to: selected paragraphs, selected table cells, or a frame.

## Columns (Section Columns)

- 1 to 6 columns supported in Word 95 (practical; the format allows more but UI presets go 1–4).
- Presets: One, Two, Three, Left (narrow left + wide right), Right (wide left + narrow right).
- Equal Column Width checkbox: when on, specifying one column's width applies to all.
- Line Between: draws a thin vertical line centered in each gutter.
- Column width and gutter (space between columns) in inches.
- Start New Column checkbox: inserts a column break at the insertion point.
- Column breaks (Ctrl+Shift+Enter) force text to the next column (or next page if it is the last column on the page).
- Apply To combo: Whole Document, This Section, This Point Forward (creates a new section break at the insertion point).
- Balanced columns: the last page of a column section is balanced (columns of equal length) by inserting a Continuous section break at the end of the columnar content.

## Drop Cap

- Positions: None (remove drop cap), Dropped (inside paragraph, wrapping text), In Margin (in left margin, text does not wrap).
- Lines to Drop: integer 1–10 (default 3).
- Distance from Text: inches (default 0).
- Font: any installed font (default same as body font).
- Implementation: a frame is placed around the first character, set to 1 inch width × N lines height; font size is auto-computed so the character's cap-height spans the N lines.
- Removing the drop cap unframes the character.

## Change Case

- Invoked from Format → Change Case or via Shift+F3 cycle.
- Radio options: **Sentence case.** (capitalize first letter of each sentence; lowercase elsewhere), **lowercase**, **UPPERCASE**, **Title Case** (capitalize first letter of each word; preserves already-capitalized interior letters), **tOGGLE cASE** (flip case of every letter).
- Shift+F3 cycles through lowercase → Title Case → UPPERCASE → lowercase (3 states). Does not include Sentence case or tOGGLE cASE.
- Applied to: the current selection; if no selection, the current word.
- Sentence boundaries: period, exclamation mark, question mark followed by space or end-of-paragraph.

## Bullets and Numbering

### Bulleted Lists

- 7 preset bullet tiles on the Bulleted tab: round bullet (•), open round bullet (○), square (■), diamond (◆), arrow (➤), checkmark (✓), four-pointed star (✦).
- Customize: choose any character from any font as the bullet; size as percent of text or absolute points; color; indent-to-bullet distance; bullet-to-text distance; font of bullet (can differ from paragraph font).
- Remove button: clears bullet format from selected paragraphs.

### Numbered Lists

- 7 preset numbering tiles on the Numbered tab:
  1. `1.` `2.` `3.` (Arabic with period)
  2. `1)` `2)` `3)` (Arabic with right paren)
  3. `I.` `II.` `III.` (Roman upper)
  4. `A.` `B.` `C.` (Letter upper)
  5. `a)` `b)` `c)` (Letter lower with right paren)
  6. `i.` `ii.` `iii.` (Roman lower)
  7. `(1)` `(2)` `(3)` (Arabic in parens)
- Customize options: Bullet/Number format string (template with `%1` placeholder for the current-level number), font, position of number (indent from text), distance number-to-text, Start At (renumbering).
- Hanging Indent checkbox: creates a hanging indent matching the number width.

### Multilevel Numbering

- Tab called "Multilevel" in Word 95 (renamed "Outline Numbered" in Word 97).
- 7 preset multilevel schemes (9 levels each):
  1. `1.` / `1.1.` / `1.1.1.` / ... (all Arabic, dot-separated)
  2. `1)` / `a)` / `i)` / ...
  3. `I.` / `A.` / `1.` / `a)` / `(1)` / `(a)` / `(i)` / ...
  4. `Article I.` / `Section 1.01` / `(a)` / `(i)` / ...
  5. `Chapter 1` / heading style 1 / 2 / 3 / ...
  6. `1.` / `1.1.` / `1.1.1.` through nine levels.
  7. Legal: `1.` / `1.1` / `1.1.1` (no trailing dot).
- Customize Multilevel List dialog: 9 levels, per-level settings — Number format, Previous Level Number (insert preceding level's number into this level's format), Font…, Start At, Tab space after, Indent at.
- Restart numbering: per-level option to restart when a higher level advances.

### Heading Numbering (Format → Heading Numbering)

- Applies a numbering scheme to built-in Heading 1–9 styles en masse, without affecting paragraph-level numbering.
- 6 preset schemes (same as multilevel preset index 1–6).
- Modify… opens Customize Multilevel List targeted at the Headings 1–9 sequence.

## AutoFormat

### AutoFormat Now (full)

- Invoked via Format → AutoFormat or the AutoFormat button on the Standard toolbar.
- Options dialog (AutoFormat tab): Apply — Headings, Lists, Other Paragraphs, Borders, Automatic Numbered Lists; Replace — "Straight Quotes" with "Smart Quotes", Ordinals (1st) with Superscript, Fractions (1/2) with Fraction character (½), Symbol characters (-->, (c), etc.) with proper symbols, _bold_ and _underline_ with Real Formatting, Internet and Network Paths with Hyperlinks [verify — hyperlink autoformat exists in 95 only if Internet Assistant is installed], Preserve Styles, Plain Text Wordmail Documents.
- Always AutoFormat ▸ WordMail: in WordMail contexts, applies different rules.
- After running, opens Review Changes dialog: lists each change with accept/reject; Style Gallery button; Accept All / Reject All / Cancel.
- AutoFormat analyzes paragraph length and position (short → heading; list-start → list; quoted blockquote → indent) and assigns styles.

### AutoFormat As You Type

- Subset of the same rules, applied in real time:
  - Auto bulleted lists (typing `*` + Tab, or `-` + Tab).
  - Auto numbered lists (typing `1.` + Tab).
  - Borders (typing three or more `-` + Enter creates a single thin border; three `=` = double; three `~` = wavy; three `#` = thick; three `*` = thick with shadow).
  - Smart quotes replacement.
  - Ordinal superscripts.
  - Fractions.
  - Hyperlinks from typed URLs [verify — depends on Internet Assistant].
  - Headings (two blank lines before a short line → Heading 1; one blank line → Heading 2, heuristic) [verify — some Word 95 docs say this is full-AutoFormat only, not as-you-type].
  - Indent on Tab at start of line (first Tab converts to left indent; second Tab to second-tab indent).

## Styles

### Paragraph Styles

- Word 95 supports only **paragraph styles**. Character styles are a Word 97 addition. Our implementation must respect this limitation when round-tripping to Word 95 behavior; however, underlying OOXML will store character styles if we author them, and we should either surface them as paragraph-plus-direct-formatting or confine ourselves to paragraph styles for full fidelity.
- Every paragraph has exactly one assigned paragraph style (default: Normal).
- Styles have a Based On parent (forming a tree rooted at Normal, which is based on "no style").
- Styles have a Next Style (the style applied to a new paragraph after pressing Enter).
- Styles have an Add to Template checkbox: changes to the style are saved back into the attached template on Save.
- Automatically Update checkbox [verify — exists in Word 95 on Style dialog; when on, direct-formatting applied to any paragraph of that style updates the style definition].
- Styles can carry tab stops, borders, shading, language, numbering, frame, and all font/paragraph properties.

### Built-in Styles (always present in every document)

Partial list (the Style dialog's "All Styles" filter shows many more):

- Normal
- Heading 1 through Heading 9
- Default Paragraph Font (a virtual style; the text's inherited font chain)
- Footer
- Header
- Page Number
- Footnote Reference
- Footnote Text
- Endnote Reference
- Endnote Text
- Annotation Reference
- Annotation Text
- Caption
- Table of Contents 1 through 9 (TOC 1..9)
- Table of Figures
- Table of Authorities
- Index 1 through 9
- Index Heading
- TOA Heading
- List Bullet
- List Bullet 2 through 5
- List Number
- List Number 2 through 5
- List Continue, List Continue 2 through 5
- List 2 through 5 (plain list)
- Body Text
- Body Text 2, 3
- Body Text Indent
- Body Text First Indent
- Body Text First Indent 2
- Block Text
- Macro Text
- Hyperlink
- FollowedHyperlink
- Envelope Address
- Envelope Return
- Line Number
- Message Header
- Plain Text
- Date
- Signature
- Document Map [verify — may not exist in Word 95; was added with Document Map feature in Word 97]
- E-mail Signature
- E-mail Reply
- Normal Indent
- Salutation
- Closing
- Title
- Subtitle

### Style Dialog

- List of styles with a filter combo: All Styles / Styles In Use / User-Defined Styles.
- Description pane shows the composition chain ("Normal + Font: Arial 12 pt, Bold, Centered, Space After 6 pt, Keep With Next").
- Preview panes (paragraph + character) — the paragraph preview shows a three-paragraph stack with the selected style's paragraph highlighted.
- Buttons:
  - Apply: apply selected style to current selection and close.
  - Cancel: discard changes.
  - New…: New Style dialog (below).
  - Modify…: Modify Style dialog (same layout as New).
  - Delete: remove style (user-defined only; prompts).
  - Organizer…: open Organizer dialog.

### New/Modify Style Dialog

- Name: text entry (must be unique within the document).
- Style Type: Paragraph (no Character option in Word 95).
- Based On: combo listing existing paragraph styles; selecting "(no style)" breaks inheritance.
- Next Style: combo listing paragraph styles (default: self).
- Format menu (button with ▼):
  - Font… opens Font dialog.
  - Paragraph… opens Paragraph dialog.
  - Tabs… opens Tabs dialog.
  - Border… opens Borders and Shading dialog.
  - Language… opens Language dialog.
  - Frame… opens Frame dialog.
  - Numbering… opens Bullets and Numbering dialog.
- Shortcut Key… opens Customize Keyboard dialog pre-filtered to style.
- Description: read-only full composition string.
- Add to Template: checkbox.
- Automatically Update: checkbox [verify].

### Style Gallery

- Format → Style Gallery… opens a modal dialog with:
  - Template list (left): all `.dot` files from the user template folder plus workgroup template folder.
  - Preview radio: Document (apply styles to current doc, show result), Example (show template's sample document with its styles), Style Samples (show one-line sample of each of the template's styles).
  - Preview pane (right): large WYSIWYG.
- OK applies the template's styles (overlaying the document's existing paragraph style names with the template's definitions).
- Cancel reverts.

### Style Area

- When Tools → Options → View → "Style Area" width is set to > 0 (inches), the Normal and Outline views display each paragraph's style name in a left column of that width. Useful for drafting; disabled by default.
- Style area is resizable by dragging its right edge.
- Clicking a style name selects that paragraph; double-clicking opens Style dialog for that style.

## Frame (Word 95's Floating Container)

Frames are the pre-textbox mechanism for floating a block of content (text, table, picture) over the page. Unlike Word 97+ text boxes, frames are **anchored to a paragraph** and can participate in text flow as "wrapped" content.

### Creating a Frame

- Insert → Frame inserts an empty frame at cursor.
- Select content first, then Insert → Frame to wrap that content in a frame.
- Can also be inserted from the Drawing toolbar's Insert Frame button.
- Picture wrapping: selecting a picture and using Format → Frame converts the inline picture to a wrapped, framed picture.

### Frame Dialog (Format → Frame)

- Text Wrapping: None (text above and below the frame, frame takes full column width) or Around (text wraps around the frame).
- Size:
  - Width: Exactly (inches) or Auto (as-wide-as-content).
  - Height: Exactly, At Least, or Auto.
- Horizontal:
  - Position combo: Left, Center, Right, Inside (odd-page gutter-side), Outside (odd-page away-from-gutter), or absolute inches.
  - Relative To: Column, Margin, Page.
  - Distance from Text: inches.
- Vertical:
  - Position combo: Top, Center, Bottom, or absolute inches.
  - Relative To: Margin, Page, Paragraph.
  - Distance from Text: inches.
- Move with Text checkbox: frame repositions when its anchor paragraph moves.
- Lock Anchor checkbox: prevents the anchor from being dragged to another paragraph.
- Remove Frame button: unwrap the frame; content returns to inline in the anchor paragraph.

### Frame Behavior

- Frame anchor: a small anchor icon appears in the left margin next to the paragraph the frame is anchored to.
- Frames can be dragged in Page Layout view — both the frame content and the anchor update.
- Shift+drag constrains to vertical/horizontal-only move.
- Drag the frame's border handles to resize.
- Frames print and paginate; content inside a frame is part of the paragraph that anchors it (same section settings).
- Nesting: frames can contain tables, but cannot contain another frame directly.

### NOT IN WORD 95 Frames

- Rotation of frames (Word 95 frames can be flipped but not rotated).
- "Break-through" wrap styles from Word 2007+.
- Connection arrows between frames (Word 97 Text Box feature).

## Sections and Page Setup

### Sections

- A Word document is divided into one or more sections. Each section has its own page setup, headers/footers, page numbering, columns, line numbering, endnote positioning, and footnote options.
- A single document with no explicit section break has exactly one section (spanning the whole document).
- Section breaks are inserted via Insert → Break with one of four radio options:
  - **Next Page**: the next section starts on the next page.
  - **Continuous**: the next section starts on the same page; useful for changing columns mid-page.
  - **Even Page**: next section on the next even-numbered page (may leave a blank odd page).
  - **Odd Page**: next section on the next odd-numbered page.
- Section breaks are represented as a paragraph-end mark at the end of the section; viewing non-printing characters shows `=============== End of Section ===============` or `:::::::::::::::: End of Section (Continuous) ::::::::::::::::`.

### Page Setup Dialog (File → Page Setup)

Four tabs: **Margins**, **Paper Size**, **Paper Source**, **Layout**.

**Margins tab:**

- Top, Bottom, Left, Right margins in inches (or Cm if metric unit selected).
- Gutter: additional left margin (or top margin, if Mirror Margins off and gutter is bound at top) for binding.
- From Edge: distance from paper edge to Header (top) and Footer (bottom).
- Mirror Margins checkbox: when on, left/right margins become Inside/Outside (book-style).
- 2 Pages per Sheet checkbox: folds page in half for printing two logical pages on one physical.
- Apply To combo: Whole Document / This Section / This Point Forward / Selected Text.
- Default… button: sets these margins in the attached template.
- Preview pane.

**Paper Size tab:**

- Paper Size combo: Letter 8.5 × 11 in, Legal 8.5 × 14 in, A4 210 × 297 mm, A5 148 × 210 mm, B5 176 × 250 mm, Executive 7.25 × 10.5 in, Envelope #10 4.125 × 9.5 in, Envelope DL 110 × 220 mm, Envelope C5, C6, Custom Size.
- Width, Height: inches (auto-populated; editable if Custom Size).
- Orientation: Portrait, Landscape.
- Apply To combo (same as Margins).

**Paper Source tab:**

- First Page: combo listing the installed printer's paper trays (Auto Tray, Tray 1, Upper Tray, Lower Tray, Manual Feed, Envelope Feeder, etc.).
- Other Pages: same combo.
- Useful for letterhead (first page from a letterhead tray, subsequent from plain-paper tray).

**Layout tab:**

- Section Start combo: Continuous, New Column, New Page, Even Page, Odd Page. Determines how the section begins.
- Headers and Footers group:
  - Different Odd and Even checkbox: enables separate headers/footers for odd and even pages.
  - Different First Page checkbox: enables a distinct first-page header/footer per section.
- Vertical Alignment combo: Top, Center, Justified, Bottom. Affects how text fits vertically on a page with short content.
- Line Numbers… button: opens Line Numbers dialog (Add Line Numbering checkbox; Start At; From Text: inches; Count By; Numbering: Restart Each Page / Restart Each Section / Continuous).
- Suppress Endnotes checkbox: in the Footnote and Endnote dialog, endnotes for this section can be suppressed so they appear at the end of the document rather than at the end of this section.
- Apply To combo (same).

## Headers and Footers

- Each section has up to three header variants and three footer variants: Primary, First Page, Even.
- View → Header and Footer enters Header/Footer edit mode in Page Layout view.
- Header and Footer toolbar buttons (enumerated earlier) control insertion of Page Number, Number of Pages, Date, Time, plus AutoText entries.
- Same as Previous button: toggles `LinkToPrevious` for this section's header — when linked, the header is a duplicate of the previous section's.
- Switch Between Header and Footer: moves caret between header area and footer area within the current page.
- Show Previous / Show Next: navigate to the previous/next section's headers.
- Close: returns to document body.

### Header and Footer Areas

- Located inside the top/bottom margin at a distance from the paper edge controlled by Page Setup → Margins → From Edge.
- If the header content exceeds that distance, Word expands the top margin to fit (affecting the document body's starting Y position).
- Can contain: text, inline fields (page number, date, filename, etc.), images, frames, and tables.
- Auto-hyphenation respects the language of the header content.

### AutoText Gallery for Headers/Footers

- Predefined AutoText entries available from the Header/Footer toolbar's Insert AutoText menu:
  - PAGE
  - Page X of Y
  - Created by
  - Created on
  - Filename
  - Filename and path
  - Last printed
  - Last saved by
  - Author, Page #, Date
  - Confidential, Page #, Date

## Footnotes and Endnotes

### Insert Footnote Dialog (Insert → Footnote)

- Insert: ○ Footnote (with Placement: Bottom of Page, Beneath Text), ○ Endnote (with Placement: End of Section, End of Document).
- Numbering: ○ AutoNumber (1, 2, 3…), ○ Custom Mark (free-form symbol or type character).
- Options… button opens Note Options dialog (two tabs: All Footnotes, All Endnotes):
  - Place At: Bottom of Page / Beneath Text (footnotes) or End of Section / End of Document (endnotes).
  - Number Format: 1, 2, 3 / A, B, C / a, b, c / I, II, III / i, ii, iii / \*, †, ‡, § (symbol cycle).
  - Start At: starting number.
  - Numbering: Continuous / Restart Each Section / Restart Each Page.

### Footnote/Endnote Pane

- In Normal view, View → Footnotes opens a split pane at the bottom showing all footnotes/endnotes.
- The pane has its own dropdown: All Footnotes / Footnote Separator / Footnote Continuation Separator / Footnote Continuation Notice / All Endnotes / Endnote Separator / Endnote Continuation Separator / Endnote Continuation Notice.
- **Separators** are the horizontal rules above footnotes/endnotes on each page. Default: short horizontal line at the left margin.
- **Continuation Separator**: if a footnote's text continues onto the next page, this line appears at the top of the continuation on that page. Default: line spanning the column width.
- **Continuation Notice**: optional text appearing below a footnote that continues onto the next page. Default: empty.
- Users can edit these four regions (separator, continuation separator, continuation notice for both footnotes and endnotes).
- "Reset" button returns to default separator.

### Footnote Reference and Text

- In the body, a footnote reference is rendered in the current font's superscript variant using the Footnote Reference character style (but remember: Word 95 has no character styles; the superscript is direct formatting applied to the reference mark).
- In Page Layout view, footnotes appear at the bottom of each page (within the bottom margin region).
- In Normal view, footnotes appear only in the footnote pane.
- Double-clicking a footnote reference opens the footnote pane (Normal) or scrolls to the footnote (Page Layout).
- Delete the reference character in the body to remove the entire footnote.

### Continuous Endnotes

- Endnotes can be placed at end-of-section (if "End of Section" in Note Options) or end-of-document (default).
- Suppress Endnotes per-section option in Page Setup → Layout pushes endnotes to the next section.

## Page Numbers

### Insert → Page Numbers Dialog

- Position combo: Top of Page (Header) / Bottom of Page (Footer).
- Alignment combo: Left / Center / Right / Inside / Outside.
- Show Number on First Page checkbox.
- Format… button opens Page Number Format dialog.

### Page Number Format Dialog

- Number Format combo: 1, 2, 3… / -1-, -2-, -3-… / a, b, c / A, B, C / i, ii, iii / I, II, III.
- Include Chapter Number checkbox: includes the heading level N number in the page number, separated by a character chosen from the Chapter Starts With Style dropdown and Use Separator combo (hyphen, period, colon, em dash, en dash).
- Page Numbering: Continue from previous section / Start at: (specific number).

## Document Properties (Summary Info)

### Summary Info Dialog

Accessed by File → Properties… or by the **Properties** button in File → Save As. Not a separate menu item per se, but available through File dialogs. Tabs:

- **General**: displays file info — Type, Location, Size, MS-DOS Name, Created, Modified, Last Accessed, Attributes.
- **Summary**: Title, Subject, Author (pre-filled from Tools → Options → User Info), Manager, Company, Category, Keywords, Comments, Hyperlink Base, Template. [verify — Hyperlink Base may be 97+.]
- **Statistics**: Created, Modified, Accessed, Printed, Last Saved By, Revision Number, Total Editing Time, Number of Pages, Words, Characters, Paragraphs, Lines.
- **Contents**: displays heading structure if the template's "Save Preview Picture" is on.
- **Custom**: user-defined named properties with Name, Type (Text, Date, Number, Yes or No), Value, and Link to Content checkbox (link the property to a bookmark in the document).

### Prompt for Summary Info on First Save

- Tools → Options → Save → "Prompt for Document Properties" checkbox: when on, saving a new document opens the Summary dialog first.
- Templates can suppress this (template-level setting).

## Objects and Embeds

### Insert Picture Dialog

- Same Windows 95 common dialog layout as Open.
- **Files of type** combo: the long list enumerated earlier plus "All Graphics Files".
- **Link to File** checkbox: stores only a reference (`INCLUDEPICTURE` field with a `\d` "don't save with document" switch omitted if Save with Document is checked).
- **Save with Document** checkbox (only meaningful when Link to File is checked): controls whether a cached copy is stored with the document.
- Preview pane on the right.

### Picture File Formats Supported

Listed in order of prevalence in the Office 95 filters folder:

- Windows Bitmap: `*.bmp`, `*.dib`, `*.rle`. Filter: `bmpimp32.flt`. Supports 1, 4, 8, 24 bits per pixel. RLE compression for 4/8 bpp.
- Windows Metafile: `*.wmf`. Filter: `wmfimp32.flt`. Placeable metafiles and enhanced metafiles (EMF).
- Encapsulated PostScript: `*.eps`. Filter: `epsimp32.flt`. Relies on a TIFF preview for screen display; prints to PostScript printers directly.
- CompuServe GIF: `*.gif`. Filter: `gifimp32.flt`. 87a and 89a; animated GIFs use only the first frame.
- JPEG: `*.jpg`, `*.jpeg`. Filter: `jpegim32.flt`. Baseline and progressive.
- Kodak Photo CD: `*.pcd`. Filter: `pcdimp32.flt`. Multiresolution; choose import resolution.
- Macintosh PICT: `*.pct`, `*.pict`. Filter: `pictim32.flt`. Limited QuickDraw support.
- PC Paintbrush: `*.pcx`. Filter: `pcximp32.flt`. 1, 4, 8, 24 bit.
- Tagged Image File: `*.tif`, `*.tiff`. Filter: `tiffimp32.flt`. Uncompressed, LZW, CCITT G3/G4, PackBits.
- Truevision Targa: `*.tga`. Filter: `tgaimp32.flt`. 16, 24, 32 bit.
- Computer Graphics Metafile: `*.cgm`. Filter: `cgmimp32.flt`. ANSI/ISO CGM.
- CorelDraw: `*.cdr`. Filter: `cdrimp32.flt`. CorelDraw 3, 4, 5 [verify].
- Micrografx Designer/Draw: `*.drw`. Filter: `drwimp32.flt`.
- HP Graphics Language: `*.hgl`, `*.hpgl`, `*.plt`. Filter: `hpglim32.flt`. HPGL, HPGL/2.
- WordPerfect Graphic: `*.wpg`. Filter: `wpgimp32.flt`. WPG 1.0 and 2.0.

Each filter is a 16-bit or 32-bit DLL conforming to the Office 95 Graphics Import Filter Specification (exports `FilterOpen`, `FilterInfo`, `FilterConvert` functions).

### Insert Object Dialog

- Tab **Create New**: list of insertable OLE server ClassIDs. Office 95 built-in registrations (with names as shown in the list):
  - Microsoft Equation 2.0 (Equation Editor)
  - Microsoft Graph 5.0
  - Microsoft Organization Chart 2.0
  - Microsoft WordArt 2.0
  - Microsoft Excel Chart
  - Microsoft Excel Worksheet
  - Microsoft Word Document
  - Microsoft Word Picture
  - Microsoft Note-It
  - Package
  - Paintbrush Picture (from Windows 95 accessories)
  - Sound (Windows Sound Recorder)
  - Media Clip (Windows Media Player)
  - Video Clip
  - Bitmap Image
  - Wordpad Document
  - Microsoft Access Form / Table / Query / Report (if Access 95 installed)
  - Microsoft Powerpoint Slide / Presentation (if PowerPoint 95 installed)
  - Microsoft Schedule+ 7.0 Contact / Task / Appointment (if Schedule+ installed)
  - Microsoft Project 4.0 ProjectView (if Project installed)
  - Microsoft FoxPro (if FoxPro installed)
  - ACDSee Image (if ACDSee installed)
  - Adobe Photoshop Image (if Photoshop installed)
- Display as Icon checkbox: show the object as a registered icon instead of rendered content.
- Change Icon… button: pick from the OLE server's registered icons or specify an icon file.
- Tab **Create from File**: File text box, Browse… button, Link to File checkbox, Display as Icon checkbox.
- OK creates/inserts the object; double-clicking the object later opens the OLE server for in-place or out-of-place edit.

### In-Place Activation (OLE 2.0)

- When an OLE 2 object is double-clicked, Word negotiates in-place activation: the server's menus and toolbars are merged into Word's.
- The server gets its own "inner frame" with its own menu bar contribution.
- Escape or click-outside deactivates.
- For OLE 1 objects (legacy), the server opens in its own window; changes are synced on close.

### Equation Editor 1.x/2.x (Design Science MathType Lite)

- Equation Editor 2.0 ships with Office 95.
- Equations are OLE objects (ClassID: `Equation.2`).
- Editing opens Equation Editor in-place: custom menus (File, Edit, View, Format, Style, Size, Help) and a symbol palette (Greek letters, operators, relations, arrows, spacing, embellishments, fences, integrals, sums, matrices, labeled arrows).
- Template palette: fraction, radical, subscript/superscript, integral, sum, matrix, fence.
- Style menu: Math, Text, Function, Variable, Greek, Matrix-Vector, User 1, User 2 — each maps to a font/italic combination.
- Size menu: Full (12 pt), Subscript (7 pt), Sub-Subscript (5 pt), Symbol (18 pt), Sub-Symbol (12 pt).
- Saved as an object inside the host document; renders as a picture when the object is not active.

### Microsoft Graph 5.0

- OLE server shipped with Office 95 (ClassID: `MSGraph.5`).
- Used for quick chart insertion without a full Excel worksheet.
- Launched via Insert → Object → Microsoft Graph 5.0 or by inserting a pre-built gallery chart.
- Has its own datasheet window (like a small Excel grid) and a chart window.
- Chart types: Column (clustered, stacked, 100% stacked, 3-D), Bar, Line, Pie, Area, Doughnut, Radar, XY (Scatter), Combination, 3-D Area, 3-D Column, 3-D Line, 3-D Pie.
- Persisted as an OLE object inside the host document.

### Microsoft Organization Chart 2.0

- OLE server (ClassID: `OrgPlusWOPX.4` or `MSOrgChart.2` depending on installation).
- Simple org chart editor.
- Edit nodes with Name, Title, Comments 1, Comments 2 fields (all optional).
- Box styles (Rectangle, Rounded Rectangle, Shadow Box, 3D), connector styles, group styles.
- Persisted as an OLE object.

### Microsoft WordArt 2.0

- OLE server (ClassID: `MSWordArt.2`).
- Applies text effects: curve text along a shape, stretch, rotate, 3-D effect, shadow, color fill.
- Has 15 preset shapes (Arch Up, Arch Down, Button, Circle, Wave 1, Wave 2, Slant Up, Slant Down, Cascade Up, Cascade Down, Triangle Up, Triangle Down, Fade Up, Fade Down, Plain Text).
- Persisted as an OLE object.

## Symbol Dialog

### Symbols Tab

- Font combo: lists every installed font. Defaults to "(normal text)" which uses the current font.
- Subset combo [verify — Subsets may be 97+]: Word 95 Symbol dialog may not have a Subset combo; it shows the entire character map of the selected font.
- Character grid: 8 columns × 12 rows = 96 cells visible at once, scrollable to show all 256 (ANSI) or all BMP (Unicode) characters.
- Preview cell: shows the currently-focused character at large size.
- Shortcut Key… button: opens Customize Keyboard with the selected character as the target command.
- AutoCorrect… button: adds the selected character to the AutoCorrect replace list.

### Special Characters Tab

- List of 16 special characters with their keyboard shortcuts:
  - Em Dash (—) — Ctrl+Alt+NumMinus
  - En Dash (–) — Ctrl+NumMinus
  - Nonbreaking Hyphen — Ctrl+Shift+\_
  - Optional Hyphen — Ctrl+-
  - Em Space — (no default)
  - En Space — (no default)
  - Nonbreaking Space — Ctrl+Shift+Space
  - Copyright © — Ctrl+Alt+C
  - Registered ® — Ctrl+Alt+R
  - Trademark ™ — Ctrl+Alt+T
  - Section § — (no default)
  - Paragraph ¶ — (no default)
  - Ellipsis … — Ctrl+Alt+.
  - Single Opening Quote ' — Ctrl+`
  - Single Closing Quote ' — Ctrl+'
  - Double Opening Quote " — Ctrl+`,"
  - Double Closing Quote " — Ctrl+',"

### Insertion

- Insert button: inserts the character and keeps the dialog open so multiple characters can be inserted.
- Close button: closes the dialog.
- Double-click a character: insert and keep dialog open.

## Field Dialog (Insert → Field)

### Field Dialog Layout

- Categories list (left panel): (All), Date and Time, Document Automation, Document Information, Equations and Formulas, Index and Tables, Links and References, Mail Merge, Numbering, User Information.
- Field Names list (middle panel): filtered by category.
- Field Codes text box (bottom): the raw field code string, freely editable.
- Description strip: one-line description of the selected field.
- Options… button: opens Field Options dialog (switches).
- Preserve Formatting During Updates checkbox (appends `\* MERGEFORMAT`).
- Buttons: OK, Cancel, Help.

### Field Options Dialog

Tabs vary per field; general tabs:

- **General Switches**:
  - Format (`\*`): Upper, Lower, FirstCap, Caps, Roman, Arabic, CardText, DollarText, Hex, Ordinal, OrdText, Alphabetic, AlphaLower, ChrOnly [verify — some codes may differ], MERGEFORMAT.
  - Numeric Picture (`\#`): format string for numeric result (`0.00`, `$#,##0.00;($#,##0.00)`, etc.).
  - Date-Time Picture (`\@`): format string for date result (`MMMM d, yyyy`, `dddd`, `HH:mm:ss`, etc.).
  - Lock Result (`\!`): prevents field from updating.
- **Field Specific Switches**: per-field switches (e.g., INCLUDEPICTURE `\d` don't save, `\c` converter name; SEQ `\c` count, `\h` hide, `\r` reset, `\n` next).

### Field Behavior

- **Alt+F9** toggles display of all field codes vs field results globally.
- **Shift+F9** toggles display on the selected field only.
- **F9** updates the selected fields (re-evaluates).
- **Ctrl+F9** inserts empty field braces `{ }` at cursor (a blank field).
- **Ctrl+F11** locks a field (prevents updates).
- **Ctrl+Shift+F11** unlocks.
- **Ctrl+Shift+F9** unlinks a field (replaces with its current result as plain text).
- **F11** goes to next field; Shift+F11 previous field.

### Field Code Syntax

- `{ FIELDNAME [arguments] [switches] }` — curly braces are NOT typed literal braces but field-delimiter characters (inserted via Ctrl+F9).
- Arguments can be quoted strings, bookmarks, nested fields.
- Comments inside a field: `{ FIELDNAME `"literal"` [switches] }` — comment support varies by field [verify].

## Complete Field Taxonomy

### Date and Time Category

- **CREATEDATE** — Date document was created. Syntax: `{ CREATEDATE [\@ "picture"] [\h] [\s] }` where `\h` forces Hijri calendar, `\s` forces Saka era [verify — Hijri/Saka are 97+ additions; Word 95 has only `\@`]. Example: `{ CREATEDATE \@ "MMMM d, yyyy" }` → "August 15, 1995".
- **DATE** — Current date when the field is updated. Syntax: `{ DATE [\@ "picture"] [\h] [\s] }`. Example: `{ DATE \@ "dddd, MMMM d, yyyy" }` → "Tuesday, August 15, 1995".
- **EDITTIME** — Total editing time in minutes. Syntax: `{ EDITTIME }`. Example: `{ EDITTIME }` → "47".
- **PRINTDATE** — Last print date. Example: `{ PRINTDATE \@ "M/d/yy h:mm am/pm" }`.
- **SAVEDATE** — Last save date. Example: `{ SAVEDATE \@ "MMM d, yyyy" }`.
- **TIME** — Current time when field is updated. Example: `{ TIME \@ "h:mm:ss am/pm" }` → "2:47:15 pm".

Date-time picture codes:

- `M` month (1–12), `MM` month (01–12), `MMM` abbreviated month name, `MMMM` full month name.
- `d` day (1–31), `dd` day (01–31), `ddd` abbreviated day of week, `dddd` full day of week.
- `yy` two-digit year, `yyyy` four-digit year.
- `h` hour (1–12), `hh` hour (01–12), `H` hour (0–23), `HH` hour (00–23).
- `m` minute, `mm` minute (leading zero).
- `s` second, `ss` second (leading zero).
- `am/pm` or `AM/PM` or `a/p` or `A/P`.
- `tt` AM/PM (Word 95 may only support `am/pm`).

### Document Automation Category

- **GOTOBUTTON** — Clickable button (in form-enabled docs) that jumps to a bookmark. Syntax: `{ GOTOBUTTON bookmark "display text" }`.
- **MACROBUTTON** — Clickable button that runs a WordBasic macro. Syntax: `{ MACROBUTTON MacroName "display text" }`. Double-click runs; display text can include images if the macro has a registered picture.
- **IF** — Conditional result. Syntax: `{ IF expression op value "truetext" "falsetext" }`. Used in mail merge and conditional text. Example: `{ IF { MERGEFIELD Country } = "USA" "Domestic" "International" }`.

### Document Information Category

- **AUTHOR** — Author name from Summary Info. `{ AUTHOR }` or `{ AUTHOR "new name" }` to set.
- **COMMENTS** — Comments from Summary Info.
- **DOCPROPERTY** [verify — may be 97+] — Arbitrary property. `{ DOCPROPERTY "PropName" }`.
- **FILENAME** — Document's filename. Switches: `\p` include full path. Example: `{ FILENAME \p }` → "C:\\Docs\\Report.doc".
- **FILESIZE** — File size in bytes. Switches: `\k` in KB, `\m` in MB.
- **INFO** — Generic info lookup. Syntax: `{ INFO InfoType ["NewValue"] }` — InfoType is Author, Subject, Keywords, Title, CreateDate, Comments, LastSavedBy, RevisionNumber, EditTime, LastPrinted, LastSavedDate, NumChars, NumWords, NumPages, Template, FileName, FileSize.
- **KEYWORDS** — Keywords from Summary Info.
- **LASTSAVEDBY** — User name from last save.
- **NUMCHARS** — Character count.
- **NUMPAGES** — Total pages.
- **NUMWORDS** — Word count.
- **REVNUM** — Revision number (incremented each save).
- **SUBJECT** — Subject from Summary Info.
- **TEMPLATE** — Attached template's name.
- **TITLE** — Title from Summary Info.

### Equations and Formulas Category

- **= (Formula)** — Evaluates an arithmetic expression. Syntax: `{ = expression [\# "picture"] [\* format] }`. Expression can include cell refs in tables (A1, B2:C4, ABOVE, BELOW, LEFT, RIGHT), functions SUM, AVERAGE, COUNT, MIN, MAX, PRODUCT, MOD, INT, SIGN, ABS, ROUND, IF, AND, OR, NOT, FALSE, TRUE, DEFINED. Example in a table cell: `{ = SUM(ABOVE) }`.
- **ADVANCE** — Moves the insertion point in the rendered page. Switches: `\u` up, `\d` down, `\l` left, `\r` right, `\x` absolute X, `\y` absolute Y (in points).
- **EQ** — Legacy equation (pre-Equation Editor). Complex composite syntax for fractions, radicals, integrals. Example: `{ EQ \f(1,2) }` renders ½.
- **SYMBOL** — Inserts a symbol by character code. Syntax: `{ SYMBOL code [\f "fontname"] [\s points] [\h] [\u] }`. Example: `{ SYMBOL 174 \f "Symbol" \s 12 }` → ↑ in 12-pt Symbol.

### Index and Tables Category

- **INDEX** — Generates index from XE fields. Switches: `\e` entry separator, `\h` heading separator, `\l` page number list separator, `\p` range (`A-D`), `\r` run-in format, `\y` language/collation, `\z` language id, `\b` bookmark range, `\c` columns, `\d` cross-reference separator, `\f` entry type filter, `\g` page range separator, `\k` cross-reference to entry, `\s` include Sequence, `\t` cross-reference text.
- **RD** (Referenced Document) — Include other documents when building an index/TOC. Syntax: `{ RD "filename" [\f] }`.
- **TA** (Table of Authorities Entry) — Marks a citation. Switches: `\c` category, `\l` long citation, `\r` range, `\s` short citation, `\b` bold, `\i` italic.
- **TC** (Table of Contents Entry) — Custom TOC entry. Switches: `\f` entry type, `\l` level, `\n` omit page number.
- **TOA** (Table of Authorities) — Generates TOA. Switches: `\b` bookmark, `\c` category, `\d` sequence, `\e` entry separator, `\f` remove formatting, `\g` page range separator, `\h` heading separator, `\l` long citation, `\p` passim replaces 5+, `\s` sequence.
- **TOC** (Table of Contents) — Generates TOC. Switches: `\a` figure caption label, `\b` bookmark range, `\c` caption label, `\d` field separator, `\e` TC entry-page separator, `\f` TC entry field type, `\h` hyperlink [97+, verify], `\l` levels, `\n` omit page numbers, `\o` outline levels (headings), `\p` TOC entry-page separator, `\s` sequence, `\t` styles (custom list), `\u` use outline levels [verify], `\w` preserve tab, `\x` preserve newlines, `\z` hide in Web Layout [97+].
- **XE** (Index Entry) — Marks an index entry. Syntax: `{ XE "entry text" [\b] [\i] [\r bookmark] [\t "text"] [\f "type"] [\y "yomi"] }`.

### Links and References Category

- **AUTOTEXT** — Inserts an AutoText entry's content. Syntax: `{ AUTOTEXT EntryName }`.
- **AUTOTEXTLIST** [verify — may be 97+] — Inserts a pop-up list of AutoText entries.
- **BIBLIOGRAPHY** [not in 95; added in 2007].
- **CITATION** [not in 95].
- **HYPERLINK** — Creates a hyperlink. Syntax: `{ HYPERLINK "URL" [\l "bookmark"] [\t "target"] [\o "tip"] }`. In base Word 95, only Internet Assistant add-on produces HYPERLINK fields.
- **INCLUDEPICTURE** — Embeds or links a picture. Switches: `\d` don't save with document, `\c` converter to use.
- **INCLUDETEXT** — Embeds or links another document's content. Switches: `\c` converter, `\n` namespace map, `\t` XSLT [97+], `\x` XPath [97+], `\!` don't update if bookmark defined.
- **LINK** — Embeds/links an OLE object. Syntax: `{ LINK "ClassName" "filepath" [\a auto-update] [\b bitmap] [\d don't save] [\f format] [\h HTML-only for Web] [\p placement] [\r RTF only] [\t text only] [\u Unicode only] }`.
- **NOTEREF** — Cross-reference to a footnote/endnote. Switches: `\f` format as in original, `\h` hyperlink, `\p` relative position.
- **PAGEREF** — Cross-reference to page number of a bookmark. Switches: `\h` hyperlink, `\p` relative position.
- **QUOTE** — Literal quoted text (used as a placeholder in user-entry macros). Syntax: `{ QUOTE "text or embedded field" }`.
- **REF** — Inserts contents of a bookmark. Syntax: `{ REF BookmarkName [\f] [\h] [\n] [\p] [\r] [\t] [\w] }`.
- **STYLEREF** — Inserts text of the nearest paragraph with the given style. Syntax: `{ STYLEREF StyleName [\l] [\n] [\p] [\r] [\t] [\w] }`. Used in headers to show current heading.

### Mail Merge Category

- **ADDRESSBLOCK** [not in 95; added in 2002].
- **ASK** — Prompts user for input, stores to bookmark. Syntax: `{ ASK BookmarkName "prompt text" [\d "default"] [\o] [\o prompt once] }`.
- **COMPARE** [verify — may be 97+] — Compares two values.
- **DATABASE** — Inserts table from database. Switches: `\b`, `\c`, `\d`, `\f`, `\h`, `\l`, `\o`, `\s`, `\t`.
- **FILLIN** — Prompts user for input at each merge record. Syntax: `{ FILLIN "prompt" [\d "default"] [\o prompt once per merge] }`.
- **MERGEFIELD** — Inserts a data field from the data source. Syntax: `{ MERGEFIELD FieldName }`.
- **MERGEREC** — Current record number.
- **MERGESEQ** — Current merged record sequence.
- **NEXT** — Advance to next record without ending current output.
- **NEXTIF** — Advance to next record if condition true.
- **SET** — Sets a bookmark to a value. Syntax: `{ SET BookmarkName "value" }`.
- **SKIPIF** — Skip current record if condition true.

### Numbering Category

- **AUTONUM** — Auto-incrementing number (per paragraph).
- **AUTONUMLGL** — Legal-style auto number (N.N.N.N).
- **AUTONUMOUT** — Outline-style auto number.
- **BARCODE** — Inserts a POSTNET barcode for a ZIP code. Syntax: `{ BARCODE "12345" \u } `.
- **LISTNUM** — Inserts a list number. Syntax: `{ LISTNUM [ListName] [\l level] [\s startAt] }`.
- **PAGE** — Current page number.
- **REVNUM** — Revision number.
- **SECTION** — Current section number.
- **SECTIONPAGES** — Total pages in current section.
- **SEQ** — User-defined sequence. Syntax: `{ SEQ identifier [\c current] [\h hide] [\n next] [\r resetTo] [\s heading level restart] }`. Example for figure captions: `{ SEQ Figure }`.

### User Information Category

- **USERADDRESS** — From Options → User Info → Address.
- **USERINITIALS** — From Options → User Info → Initials.
- **USERNAME** — From Options → User Info → Name.

### Field Codes vs Field Results

- Alt+F9: toggle global display of field codes ↔ field results.
- Shift+F9: toggle display on selected field.
- A locked field (`\!` switch or Ctrl+F11) is immune to F9 updates; shown with a slightly different shading in Normal view when "Field shading" is set to "Always" or "When selected".
- Field shading: Tools → Options → View → Field Shading combo (Never / Always / When Selected).
- Print fields as codes: Tools → Options → Print → "Field codes" checkbox.

## Insert → Break Dialog

- Break Type radios:
  - ○ Page Break (Ctrl+Enter): forces content below to start on a new page.
  - ○ Column Break (Ctrl+Shift+Enter): forces content below to start in the next column (or page if last column).
  - Section Breaks group:
    - ○ Next Page
    - ○ Continuous
    - ○ Even Page
    - ○ Odd Page
- OK inserts the break.

## Insert → Form Field Dialog and Form Field Options

### Text Form Field Options

- Type: Regular Text, Number, Date, Current Date, Current Time, Calculation.
- Default Text: initial content.
- Maximum Length: character limit (or Unlimited).
- Text Format: for Number/Date, a picture string (e.g., `0.00`, `MMMM d, yyyy`).
- Run Macro On: Entry / Exit — WordBasic macro to run.
- Field Settings: Bookmark (bookmark name), Calculate on Exit checkbox, Fill-in enabled checkbox.
- Add Help Text… button: opens Form Field Help Text dialog (Status Bar and Help Key tabs, each with a text area up to 255 characters).

### Check Box Form Field Options

- Check Box Size: Auto or Exactly N pt.
- Default Value: Not Checked / Checked.
- Run Macro On: Entry / Exit.
- Field Settings: Bookmark, Calculate on Exit, Check Box enabled checkbox.
- Help Text…

### Drop-Down Form Field Options

- Drop-Down Item: add / remove / reorder list of items.
- Items in Drop-Down List: list box.
- Run Macro On: Entry / Exit.
- Field Settings: Bookmark, Calculate on Exit, Drop-Down enabled checkbox.
- Help Text…

### Protect Form

- Tools → Protect Document → Forms (with optional password) locks the document so only form fields are editable.
- The Forms toolbar's Protect Form button toggles the same.

## Insert → Caption

### Caption Dialog

- Caption text box (editable; default "Figure 1" or "Table 1" with an automatically-updating SEQ field).
- Label combo: Figure, Table, Equation, or Custom (from New Label…).
- Position combo: Above Selected Item / Below Selected Item.
- Numbering… button opens Caption Numbering dialog (Format 1,2,3 / A,B,C / a,b,c / I,II,III / i,ii,iii; Include Chapter Number with a Style combo and Separator).
- AutoCaption… button opens AutoCaption dialog: pick object types (Microsoft Excel Worksheet, Microsoft Graph, Pictures, Tables, etc.) to receive an automatic caption on insert.
- New Label… lets user add a new label name (stored in template).

## Cross-reference Dialog (Insert → Cross-reference)

- Reference Type combo: Numbered Item, Heading, Bookmark, Footnote, Endnote, Equation (captions), Figure (captions), Table (captions), Custom.
- Insert Reference To combo: varies per type — Page Number, Paragraph Number, Paragraph Number (full context), Paragraph Number (no context), Paragraph Text, Heading Text, Above/Below, Footnote Number, Footnote Number (formatted), etc.
- For Which (list): shows numbered items, headings, bookmarks, etc.
- Insert as Hyperlink checkbox [verify — Word 97+].
- Include Above/Below checkbox (inserts "above" or "below" based on direction of reference).
- Insert, Close.

## Insert → Index and Tables Dialog

Four tabs: **Index**, **Table of Contents**, **Table of Figures**, **Table of Authorities**.

### Index Tab

- Type: Indented or Run-in.
- Columns: 1–4 (default 2).
- Language: language/sorting rules.
- Format combo: From Template, Classic, Fancy, Modern, Bulleted, Formal, Simple.
- Right Align Page Numbers checkbox.
- Tab Leader combo.
- Mark Entry… button (opens Mark Index Entry dialog: Main Entry, Subentry, Options: Cross-reference / Current Page / Page Range with bookmark; Page Number Format: Bold, Italic).
- AutoMark… (reads a concordance file and marks every occurrence of listed terms).
- Modify… (opens Style dialog for Index 1–9 styles).

### Table of Contents Tab

- Format combo: From Template, Classic, Distinctive, Fancy, Modern, Formal, Simple.
- Show Levels: 1–9.
- Show Page Numbers checkbox.
- Right Align Page Numbers checkbox.
- Tab Leader combo.
- Use Hyperlinks Instead of Page Numbers [97+, verify].
- Options… button: per-style, assign TOC level; include TC fields of specified types.
- Modify… opens Style dialog for TOC 1–9 styles.

### Table of Figures Tab

- Caption Label combo: Figure, Table, Equation, or any custom label.
- Format, Show Page Numbers, Right Align, Tab Leader, Include Label and Number, Options, Modify.

### Table of Authorities Tab

- Category combo: All, Cases, Statutes, Other Authorities, Rules, Treatises, Regulations, Constitutional Provisions, 9 custom categories.
- Format, Use Passim, Keep Original Formatting, Tab Leader.
- Mark Citation… (Shift+Alt+I) opens Mark Citation dialog: Selected Text (pre-filled), Category, Short Citation, Long Citation, Mark / Mark All / Next Citation.
- Modify…

## Tables Comprehensive

### Table Model

- A table is a grid of rows; each row has cells. Cells can span multiple rows (vmerge) or columns (hmerge).
- Every cell contains zero or more paragraphs.
- Table is always block-level; cannot float (use a Frame to achieve floating).
- A single table cannot span sections.
- Maximum practical: 31 columns × 32767 rows [verify — older docs cite 32 columns].

### Creating a Table

- **Table → Insert Table…** opens Insert Table dialog (rows, columns, column width, AutoFormat, Wizard).
- **Table → Insert Table** via drag-grid on the Standard toolbar's Insert Table button.
- **Table Wizard** (6-step wizard): style, row labels, column labels, heading/body styles, rows/cols, finish.
- **Convert Text to Table** (Table → Convert Text to Table): select text with delimiters (paragraph/comma/tab/other), dialog picks number of columns from delimiter count or text; applies the selected delimiter.
- **Drag grid** on Standard toolbar's Insert Table: pops a 5×4 grid that can be dragged to extend up to (per source) 20×20.
- **NOT IN WORD 95**: Draw Table (pencil tool) — that is Word 97.

### Insert Cells / Rows / Columns

- Table → Insert Cells… opens Insert Cells dialog (Shift Cells Right, Shift Cells Down, Insert Entire Row, Insert Entire Column).
- Toolbar and menu labels change dynamically based on selection: if rows selected, menu says "Insert Rows"; if columns, "Insert Columns"; if cells, "Insert Cells…".
- Tab at the last cell of the last row inserts a new row below.

### Delete Cells / Rows / Columns

- Table → Delete Cells… opens Delete Cells dialog (Shift Cells Left, Shift Cells Up, Delete Entire Row, Delete Entire Column).
- Menu label changes to "Delete Rows" / "Delete Columns" if the whole row/column is selected.

### Merge Cells

- Table → Merge Cells: combines the selected adjacent cells into one. Content of all cells is concatenated with paragraph marks.
- Unmerge: Table → Split Cells with Columns=1, Rows=1, and "Merge cells before split" unchecked [verify].

### Split Cells

- Table → Split Cells…: dialog with Number of Columns, Number of Rows, "Merge Cells Before Split" checkbox.
- If merge-before-split on, the selected cells are first merged then divided into the specified grid. If off, each selected cell is independently split.

### Convert Text to Table / Table to Text

- Text to Table delimiter: Paragraph / Comma / Tab / Other (single character).
- Table to Text delimiter: same options, plus "Convert Nested Tables" checkbox [verify — nested tables are Word 97+].
- Word 95 does **not** support nested tables (tables inside cells).

### Table AutoFormat Dialog

- Formats list (34+): Simple 1/2/3, Classic 1/2/3/4, Colorful 1/2/3, Columns 1/2/3/4/5, Grid 1/2/3/4/5/6/7/8, List 1/2/3/4/5/6/7/8, 3D Effects 1/2/3, Contemporary, Elegant, Professional, Subtle 1/2.
- Preview pane.
- Formats to Apply checkboxes: Borders, Shading, Font, Color, AutoFit.
- Apply Special Formats To: Heading Rows, First Column, Last Row, Last Column.

### Cell Height and Width Dialog

Two tabs: **Row**, **Column**.

**Row tab:**

- Height of Row: Auto, At Least, Exactly (with point value).
- Indent from Left: inches.
- Alignment: Left, Center, Right.
- Allow Row to Break Across Pages checkbox.
- Previous Row / Next Row buttons.

**Column tab:**

- Width of Column N: inches.
- Space Between Columns: inches (gutter; Word 95 adds half this value to the left and right of each cell's content).
- AutoFit button: resize columns to fit content.
- Previous Column / Next Column buttons.

### Table Headings

- Table → Headings toggles the selected row(s) as repeated table headings. At the top of every page the table spans, the heading rows are automatically repeated.
- Only contiguous top rows can be headings (no discontinuous headings).

### Sort Dialog (Table → Sort)

- Up to 3 keys: Sort By / Then By / Then By.
- Each key: Field number (Column 1..N, or "Paragraphs" for text sort), Type: Text / Number / Date, Ascending / Descending.
- Header Row radio: Yes / No (whether top row is a header to keep at top).
- Options… button: Sorting Language, Case Sensitive, Separator (for non-table sorting: tab, comma, other), Sort Only Columns.

### Formula Dialog (Table → Formula)

- Formula text box: editable formula string starting with `=`.
- Number Format combo: format strings like `#,##0.00`, `$#,##0.00;($#,##0.00)`.
- Paste Function combo: inserts function name at cursor. Functions: ABS, AND, AVERAGE, COUNT, DEFINED, FALSE, IF, INT, MAX, MIN, MOD, NOT, OR, PRODUCT, ROUND, SIGN, SUM, TRUE.
- Paste Bookmark combo: inserts bookmark name.
- Cell references: A1 (column-A row-1), B2:D4 (range), ABOVE (cells above current cell), BELOW, LEFT, RIGHT.
- Result displayed as a `{ = formula }` field.

### Split Table

- Table → Split Table (Ctrl+Shift+Enter): inserts a paragraph break at the current row, splitting one table into two.

### Gridlines

- Table → Gridlines toggles display of non-printing gridlines. Gridlines are shown only in Normal and Page Layout views, never printed.
- If the table has no borders, gridlines are essential for editing.

### Table Selection Shortcuts

- Click inside a cell: place caret.
- Drag across cells: select range of cells.
- Click just inside the left edge of a cell (cursor becomes right-pointing arrow): select the cell.
- Double-click the cell selector: select the whole row.
- Triple-click the cell selector: select the whole table.
- Alt+5 (numeric keypad, NumLock off): select whole table.
- Table → Select Row / Select Column / Select Table menu items.

### Table Move Handle and Resize Handle [verify — Word 97+]

- The four-headed table move handle (top-left) and the resize handle (bottom-right) appear only in Word 97+. Word 95 does not have them.

## Tools Comprehensive

### Spelling (Tools → Spelling, F7)

- Runs through document sequentially, stopping on each unrecognized word.
- Spelling dialog:
  - Not in Dictionary text box (the misspelled word, highlighted in context).
  - Change To text box (suggested correction).
  - Suggestions list (ranked).
  - Buttons: Ignore, Ignore All, Change, Change All, Add (to custom dictionary), Suggest (re-generate suggestions), AutoCorrect (add pair to AutoCorrect list), Undo Last, Options…, Cancel.
  - Custom dictionaries… combobox for the current add-target.
- **Background spelling** (Tools → Options → Spelling → "Automatic Spell Checking"): squiggly red underline under misspelled words as you type. Right-click to get suggestions menu. (Grammar squiggles are NOT in Word 95 — grammar is modal only.)
- Custom dictionaries: stored as `.dic` text files in `MSOffice\ProofFold`; each line one word. Default: `CUSTOM.DIC`. User can add multiple via Options → Spelling → Custom Dictionaries… (Add, Remove, Edit; Language per dictionary).
- Exclude dictionaries (suffixed `.exc`): words to flag even if in the main dictionary.

### Grammar (Tools → Grammar)

- Modal dialog. Iterates through grammar and style issues.
- Grammar dialog:
  - Sentence text box with highlighted issue.
  - Suggestions list.
  - Buttons: Ignore, Ignore Rule, Next Sentence, Change, Explain… (opens explanation window), Options…, Cancel.
- Grammar rules organized into sets (Writing Style combo): Casual, Standard, Formal, Technical, Custom 1, Custom 2, Custom 3.
- Each rule set enables/disables specific rules. Rules include:
  - Grammar: Capitalization, Commonly Confused Words, Fragments and Run-ons, Misused Words, Negation, Noun Phrase, Possessives and Plurals, Pronouns, Punctuation, Questions, Relative Clauses, Subject-Verb Agreement, Verb Phrase.
  - Style: Clichés, Colloquialisms, Contractions, Gender-Specific Words, Jargon Words, Passive Voice, Sentence Length, Sentences Beginning With "And", "But", or "Hopefully", Successive Nouns, Successive Prepositional Phrases, Unclear Phrasing, Use of First Person, Wordiness, Split Infinitive, Sentences Structure.
- **Show Readability Statistics** checkbox: after grammar check, shows:
  - Counts: Words, Characters, Paragraphs, Sentences.
  - Averages: Sentences per Paragraph, Words per Sentence, Characters per Word.
  - Readability: Passive Sentences (%), Flesch Reading Ease (0–100, higher = easier), Flesch-Kincaid Grade Level (US school grade), Coleman-Liau Grade Level, Bormuth Grade Level, Gunning Fog Index [verify — Word 95 shows Flesch and Flesch-Kincaid at minimum; other indices vary].
- Grammar checker uses the CIRRUS engine (Inso Corporation / Houghton Mifflin grammar library).

### Thesaurus (Tools → Thesaurus, Shift+F7)

- Modal dialog.
- Looked Up combobox (current word; can type another).
- Meanings list: senses of the word with their part of speech.
- Replace With Synonym: selected synonym; Antonyms (if meaning supports).
- Buttons: Replace, Look Up (for selected synonym), Previous (back in history), Cancel.
- Look Up repeatedly to navigate. History stack of recent lookups.

### Hyphenation (Tools → Hyphenation)

- Hyphenation dialog:
  - Automatically Hyphenate Document checkbox.
  - Hyphenate Words in CAPS checkbox.
  - Hyphenation Zone (inches) — maximum distance from the right margin the last character of a line may be (default 0.25").
  - Limit Consecutive Hyphens To: integer or Unlimited (default Unlimited).
  - Manual… button: runs Manual Hyphenation walking through each proposed break with Yes / No / Cancel.
- Auto hyphenation: computed during layout; suggestions respect Don't Hyphenate paragraph flag.

### Language (Tools → Language)

- Language list: ~50 languages (Afrikaans, Arabic, Basque, Bulgarian, Catalan, Chinese, Croatian, Czech, Danish, Dutch, English (UK), English (US), English (Australian), English (Canadian), Finnish, French, French Canadian, German, Greek, Hebrew, Hungarian, Indonesian, Italian, Japanese, Korean, Malay, Nynorsk, Polish, Portuguese, Brazilian, Romanian, Russian, Slovakian, Slovenian, Spanish, Swedish, Turkish, Ukrainian, …).
- Do Not Check Spelling or Grammar checkbox: excludes the selected range from proofing.
- Default… button: sets the language as the default for this document (stored in template if Save checked).

### Word Count (Tools → Word Count)

- Shows: Pages, Words, Characters (no spaces), Characters (with spaces) [verify — Word 95 may only show Characters without splitting], Paragraphs, Lines.
- Include Footnotes and Endnotes checkbox.
- Close button.

### AutoCorrect (Tools → AutoCorrect)

- Checkboxes at top:
  - Correct TWo INitial CApitals.
  - Capitalize First Letter of Sentences.
  - Capitalize Names of Days.
  - Replace Text as You Type (enables the replace list).
- Replace and With text boxes.
- Two format radios: Plain Text / Formatted Text (preserves the With text's formatting).
- Replacement list: scrollable table of (Replace, With) pairs.
- Buttons: Add, Delete.
- Default replacements (partial list):
  - `(c)` → ©
  - `(r)` → ®
  - `(tm)` → ™
  - `--` → —
  - `...` → …
  - `:)` → ☺
  - `:(` → ☹
  - `teh` → the
  - `adn` → and
  - `acheive` → achieve
  - `accomodate` → accommodate
  - many hundreds more (dictionary typos).

### Mail Merge

See §Mail Merge Comprehensive below.

### Envelopes and Labels (Tools → Envelopes and Labels)

Two tabs: **Envelopes**, **Labels**.

**Envelopes tab:**

- Delivery Address text box.
- Omit Return Address checkbox.
- Return Address text box (pre-filled from Options → User Info → Mailing Address).
- Buttons: Print, Add to Document (insert at top of document as a pre-section), Cancel, Options…, Add Electronic Postage [verify — may require E-Postage add-on].
- Feed preview pane showing envelope orientation in the printer.

**Envelope Options dialog:**

- Envelope Options tab: Envelope Size (Size 10, Size 11, Size 12, DL, C5, Custom…), Delivery Address Font, From Left/Top, Return Address Font, From Left/Top, FIM-A Courtesy Reply Mail checkbox, Delivery Point Barcode checkbox.
- Printing Options tab: Feed method (6 visual icons), Face Up / Face Down, Clockwise Rotation, Feed From combo (printer tray).

**Labels tab:**

- Address text box (or Use Return Address checkbox).
- Print: Full Page of the Same Label / Single Label with Row/Column spin controls.
- Buttons: Print, New Document (creates a document of labels), Cancel, Options….

**Label Options dialog:**

- Printer Information: ○ Dot Matrix ○ Laser and Ink Jet, Tray combo.
- Label Products combo: Avery Standard, Avery Pan European, Other, Custom.
- Product Number list (e.g., 5160 Address, 5162 Address, 5163 Shipping, 5164 Shipping, 5165 Full-Sheet, 5166 File Folder, 5167 Return Address, 5168 Shipping, 5195 Return Address, 5196 Diskette, 5197 Diskette).
- Label Information: Type, Height, Width, Page Size.
- Details… button: label measurements (Top Margin, Side Margin, Vertical Pitch, Horizontal Pitch, Label Height, Label Width, Number Across, Number Down, Page Size).
- New Label… button for custom.

### Protect Document (Tools → Protect Document)

- Protect Document For radios:
  - ○ Revisions: document is editable but every change is tracked as a revision, cannot be accepted without removing protection.
  - ○ Annotations: document is read-only except for inserting annotations.
  - ○ Forms: document is read-only except for form field input. Additional Section button: choose which sections are protected.
- Password text box.
- OK prompts for password confirmation.

### Revisions (Tools → Revisions)

Word 95 calls this feature **Revisions**, not Track Changes.

- Revisions dialog:
  - Document Revisions group:
    - Mark Revisions While Editing checkbox (turn tracking on/off; status bar shows `MRK` when on).
    - Show Revisions on Screen checkbox.
    - Show Revisions in Printed Document checkbox.
  - Options… button: Revisions tab of Options dialog (§Options Dialog).
  - Review… button: opens Accept or Reject Revisions dialog (see below).
  - Accept All, Reject All buttons.
  - Compare Versions… button: opens Compare Versions dialog (pick another file to compare).
  - Merge Revisions… button: opens Merge Revisions dialog (merge another file's revisions into current).

### Accept or Reject Revisions Dialog

- Shows a single revision at a time (insert / delete / formatting).
- Buttons: Accept, Reject, Find Next, Find Previous, Undo, Accept All, Reject All, Cancel.
- Mini-preview shows the revision in context.

### Compare Versions

- Tools → Revisions → Compare Versions… prompts for a second file.
- Differences are marked in the current document as revisions relative to the selected file.

### Merge Revisions

- Tools → Revisions → Merge Revisions… prompts for a revised-by-another-user file.
- Revisions from that file are applied to the current doc as unresolved revisions.

### Macro (Tools → Macro, Alt+F8)

- Macro dialog:
  - Macro Name list (macros from the current doc, global templates, Normal.dot).
  - Macros Available In combo: All Active Templates and Document / {Template name} / {Doc name}.
  - Description pane: the macro's comment (`;` line at top of the WordBasic macro).
  - Buttons: Run, Record… / Stop (opens Record Macro), Edit, Delete, Organizer…, Create (new macro), Cancel.

### Record New Macro Dialog

- Record Macro Name text box.
- Assign Macro To: Toolbars button (opens Customize → Toolbars with the new macro as a draggable command), Menus button, Keyboard button.
- Store Macro In combo: All Documents (Normal.dot) / Active Document / {Template name}.
- Description: auto-filled with "Macro recorded M/D/YY by UserName".
- OK starts recording; status bar shows `REC`; recording toolbar appears with Pause and Stop buttons.

### Macro Editor

- Word 95 macros are WordBasic. The Macro Editor is a specialized document window with a `Macro` menu and syntax coloring [verify].
- Uses a `.bas` or embedded-in-template macro storage.
- Debug commands: Step (F8), Trace, Breakpoint, Show Variables, Go (continue), End.

### Customize (Tools → Customize)

Three tabs: **Toolbars**, **Menus**, **Keyboard**.

**Toolbars tab:**

- Categories list (left): File, Edit, View, Insert, Format, Tools, Table, Window and Help, Drawing, Borders, Mail Merge, Forms, AutoText, Fonts, AllCommands, Macros, Styles, Built-in Menus.
- Buttons list (right): the icons for the selected category.
- Drag a button from the dialog onto any toolbar to add it.
- Drag a button off any toolbar to remove it.
- Drag a button between toolbars to move it.
- Description box at bottom: describes the selected button.
- Save Changes In combo: which template to save changes to.
- Close button.

**Menus tab:**

- Categories and commands list (similar to Toolbars).
- Change What Menu: combo of all menus (&File, &Edit, …).
- Position on Menu: combo of items within the selected menu.
- Name on Menu: text box; `&` prefix sets the mnemonic; `--` creates a separator.
- Add / Remove / Add Below / Reset All buttons.
- Menu Bar combo: Built-in Menu Bar / Shortcut Menus / Custom.

**Keyboard tab:**

- Categories list (same as Toolbars).
- Commands list (right).
- Current Keys list: shortcuts already assigned to the selected command.
- Press New Shortcut Key text box.
- Currently Assigned To display: shows what command (if any) is using the pressed shortcut.
- Save Changes In combo.
- Description box.
- Buttons: Assign, Remove, Reset All, Close.

### Options Dialog (Tools → Options)

**Twelve tabs in Word 95:**

1. **View**
2. **General**
3. **Edit**
4. **Print**
5. **Revisions**
6. **User Info**
7. **Compatibility**
8. **File Locations**
9. **Save**
10. **Spelling**
11. **Grammar**
12. **AutoFormat**

#### Options → View Tab

- **Show** group:
  - Draft Font checkbox: render all text as plain monospaced font for speed.
  - Picture Placeholders checkbox: draw pictures as empty rectangles with an X.
  - Animated Text checkbox [verify — 97+].
  - ScreenTips checkbox.
  - Highlight checkbox: honor highlight color.
  - Bookmarks checkbox: show [bookmark] brackets around bookmarked ranges.
  - Field Codes checkbox: globally show codes instead of results (same as Alt+F9).
  - Field Shading combo: Never / Always / When Selected.
- **Window** group:
  - Status Bar checkbox.
  - Horizontal Scrollbar checkbox.
  - Vertical Scrollbar checkbox.
  - Style Area Width: inches (0 = hidden).
  - Wrap to Window checkbox (Normal view only; wrap at window edge rather than margin).
- **Nonprinting Characters** group:
  - Tab Characters checkbox.
  - Spaces checkbox.
  - Paragraph Marks checkbox.
  - Optional Hyphens checkbox.
  - Hidden Text checkbox.
  - All checkbox (convenience).

#### Options → General Tab

- **General Options** group:
  - Background Repagination checkbox (for Normal view).
  - Help for WordPerfect Users checkbox.
  - Navigation Keys for WordPerfect Users checkbox (remaps PageUp/PageDown to WP behavior).
  - Blue Background, White Text checkbox (reverse-video for long writing sessions).
  - Beep on Error Actions checkbox.
  - Confirm Conversion at Open checkbox.
  - Update Automatic Links at Open checkbox.
  - Mail as Attachment checkbox (for File → Send).
  - Recently Used File List checkbox and Entries spin (0–9).
  - TipWizard Active checkbox.
  - Measurement Units combo: Inches / Centimeters / Points / Picas.

#### Options → Edit Tab

- **Editing Options** group:
  - Typing Replaces Selection checkbox.
  - Drag-and-Drop Text Editing checkbox.
  - Automatic Word Selection checkbox (when dragging, snaps to word boundaries).
  - Use the INS Key for Paste checkbox.
  - Overtype Mode checkbox.
  - Use Smart Cut and Paste checkbox.
  - Allow Accented Uppercase in French checkbox.
  - Picture Editor combo: Microsoft Word / Microsoft Draw 2.0 / Windows Paint / (registered picture editor).

#### Options → Print Tab

- **Printing Options** group:
  - Draft Output checkbox (fastest; skips images).
  - Reverse Print Order checkbox.
  - Update Fields checkbox (update all fields before printing).
  - Update Links checkbox.
  - Background Printing checkbox.
- **Include with Document** group:
  - Summary Info checkbox.
  - Field Codes checkbox.
  - Annotations checkbox.
  - Hidden Text checkbox.
  - Drawing Objects checkbox.
- **Options for Current Document Only** group:
  - Print Data Only for Forms checkbox.
- Default Tray combo.

#### Options → Revisions Tab

- **Inserted Text** group: Mark combo (None / Bold / Italic / Underline / Double Underline), Color combo (By Author / Auto / 16 colors).
- **Deleted Text** group: Mark combo (Hidden / Strikethrough / Caret `^` / Pipe `|` / None), Color combo.
- **Revised Lines** group: Mark combo (None / Left / Right / Outside Border), Color combo.
- **Revised Formatting** [verify — may be 97+]: Mark, Color.
- Preview pane: sample text showing the current marks.

#### Options → User Info Tab

- Name: text.
- Initials: text (up to 5 chars).
- Mailing Address: text area.
- Used for: annotation author, revision author, envelope return address, Summary Info Author field default.

#### Options → Compatibility Tab

- Font Substitution… button: shows a dialog mapping each missing font in the document to a substitute for display.
- Recommended Options For combo: Microsoft Word for Windows 2.0, Microsoft Word for Windows 6.0, Word for the Macintosh 5.1, Word for the Macintosh 6.0, WordPerfect 5.x, WordPerfect 6.x, Custom.
- Options list (checkboxes, ~20 options): Don't Add Automatic Tab Stop for Hanging Indent, Don't Add Leading (Extra Space) for Raised/Lowered Characters, Don't Add Space for Underlines, Don't Balance SBCS Characters and DBCS, Don't Blank the Area Behind Metafile Pictures, Don't Center "Exact Line Height" Lines, Draw Underlines Under Tab Characters, Expand/Condense by Whole Number of Points, Forget Last Tab Alignment, Lay Out AutoShapes Like Word 95, Leave Backslash Alone, No Extra Space for Raised/Lowered Characters, Print Colors as Black on Noncolor Printers, Print Body Text Before Header/Footer, Show Hard Page or Column Breaks in Frames, Substitute Fonts Based on Font Size, Suppress Extra Line Spacing at Top of Page, Suppress Extra Line Spacing at Top of Page Like WP, Suppress Space Before After Hard Page or Column Break, Swap Left and Right Borders on Odd Facing Pages, Treat `\"`as Straight Quotes in Mail Merge Data Sources, Truncate Font Height, Use Larger Small Caps Like Word 5.x for the Macintosh, Use Printer Metrics to Lay Out Document, Word 6.x/95/97 for Windows Text Effects [verify — per-setting list varies; this is approximate].
- Default… button.

#### Options → File Locations Tab

- **File Types** list: Documents, Clipart Pictures, User Templates, Workgroup Templates, User Options (INI), AutoSave Files, Tools, Startup.
- For each: Location (a path).
- Modify… button: opens a folder picker.

#### Options → Save Tab

- **Save Options** group:
  - Always Create Backup Copy checkbox (saves the previous version as `.bak`).
  - Allow Fast Saves checkbox (saves only changes, not whole doc; faster but grows file).
  - Prompt for Document Properties checkbox.
  - Prompt to Save Normal Template checkbox.
  - Save Native Picture Formats Only checkbox.
  - Embed TrueType Fonts checkbox.
  - Save Data Only for Forms checkbox.
  - Automatic Save Every: N minutes (0 = off).
- **File-Sharing Options for {doc}** group:
  - Protection Password text box.
  - Write Reservation Password text box.
  - Read-Only Recommended checkbox.

#### Options → Spelling Tab

- **Options** group:
  - Automatic Spell Checking checkbox.
  - Always Suggest checkbox (show suggestions as you type).
  - From Main Dictionary Only checkbox.
  - Words in UPPERCASE checkbox (ignore uppercase words).
  - Words with Numbers checkbox (ignore).
- **Custom Dictionaries…** button opens Custom Dictionaries dialog (Add, Remove, Edit, Language per dictionary).
- Reset Ignore All button.

#### Options → Grammar Tab

- Use Grammar and Style Rules combo: Strictly (All Rules), For Casual Writing, For Business Writing, For Technical Writing, Custom 1, Custom 2, Custom 3.
- Check Spelling checkbox (combine spell check with grammar).
- Show Readability Statistics checkbox.
- Customize Settings… button opens Customize Grammar Settings (list of rules with checkboxes).

#### Options → AutoFormat Tab

- **Apply** group:
  - Headings checkbox.
  - Lists checkbox.
  - Other Paragraphs checkbox.
  - Borders checkbox.
  - Automatic Numbered Lists checkbox.
- **Replace** group:
  - "Straight Quotes" with "Smart Quotes" checkbox.
  - Ordinals (1st) with Superscript checkbox.
  - Fractions (1/2) with Fraction Character checkbox.
  - Symbol Characters (-->) with Symbols checkbox.
  - _Bold_ and _Italic_ with Real Formatting checkbox.
  - Internet and Network Paths with Hyperlinks checkbox [verify — depends on IA add-on].
- **Preserve** group:
  - Styles checkbox.
- **Plain Text Wordmail Documents** checkbox.
- Show Options For radios: AutoFormat / AutoFormat As You Type.
- Same fields shown twice, once per mode.

## Mail Merge Comprehensive

### Mail Merge Helper Dialog

The centerpiece of Word 95 mail merge. Accessed via Tools → Mail Merge.

A modal dialog with three numbered steps, each with a sub-dialog:

1. **Main Document** — Create / Edit / Get Data button cluster.
2. **Data Source** — Get Data / Edit / Open Data Source.
3. **Merge the Data with the Document** — Query Options / Merge / Check for Errors.

Each step is enabled only when the previous is complete; a status line shows the current main doc and data source paths.

### Step 1: Main Document

- **Create** button drops a menu:
  - Form Letters
  - Mailing Labels
  - Envelopes
  - Catalog (a.k.a. Directory — prints all records consecutively on a single page rather than one per page).
  - Restore to Normal Word Document (removes merge info).
- After selecting, a prompt: Active Window / New Main Document.
- **Edit** button: open the main document for editing (closes the Helper, adds the Mail Merge toolbar).

### Step 2: Data Source

- **Get Data** menu:
  - Create Data Source… — opens Create Data Source dialog (pre-populated field list; Add Field Name, Remove Field Name, Move Up, Move Down). Default fields: Title, FirstName, LastName, JobTitle, Company, Address1, Address2, City, State, PostalCode, Country, HomePhone, WorkPhone. Save… creates a new Word table document as the data source.
  - Open Data Source… — pick an existing data source: Word document (table or text with delimiters), Access database, Excel workbook, dBase, FoxPro, ODBC source, Schedule+ Contact List, Paradox, SQL Server [via ODBC], Rich Text, Text Only.
  - Use Address Book… — Schedule+ / Exchange / Personal Address Book.
  - Header Options… — specifies which file provides header row (when the data source lacks one or has a different header than the merge fields).
- **Edit** button: if the data source is a Word doc, opens it; if Access, launches Access; etc.

### Step 3: Merge

- **Query Options…** opens Query Options dialog:
  - Filter Records tab: up to 6 rule rows, each with Field, Comparison (Equal To, Not Equal To, Less Than, Greater Than, Less Than Or Equal, Greater Than Or Equal, Is Blank, Is Not Blank), Compare To. Joined by And/Or.
  - Sort Records tab: up to 3 keys (Sort By, Then By, Then By) each with Ascending/Descending.
- **Merge…** opens the Merge dialog:
  - Merge To combo: New Document, Printer, Electronic Mail, Electronic Fax.
  - Records to be Merged: All / From-To range.
  - When Merging Records: Don't Print Blank Lines When Data Fields Are Empty / Print Blank Lines.
  - Check Errors… button opens Checking and Reporting Errors dialog (Simulate merge and report errors in a new document / Complete the merge, pausing on errors / Complete the merge without pausing).
  - Buttons: Merge, Check Errors, Query Options…, Cancel.
- **Check for Errors** button on Helper: equivalent.

### Mail Merge Main Document Features

- **Merge fields** inserted via Insert Merge Field button on the Mail Merge toolbar — inserts `{ MERGEFIELD FieldName }` at cursor.
- **Insert Word Field** button: inserts a Word field that conditionally alters the merge output:
  - Ask: prompts user once per merge; sets a bookmark.
  - Fill-in: prompts user once per record; inserts the input.
  - If…Then…Else: conditional inclusion.
  - Merge Record #: the current record's number.
  - Merge Sequence #: the current merged record's position in the output sequence (honors Skip).
  - Next Record: advance to the next record without finishing this output (for labels/catalogs).
  - Next Record If: advance if condition true.
  - Set Bookmark: set a bookmark to a value for use later.
  - Skip Record If: skip this record if condition true.
- **View Merged Data** toggle: replaces merge fields with sample data from the first record.

### Data Source Formats

**Word Table Data Source:**

- A Word document whose first paragraph is a table.
- First row is the header row (field names).
- Subsequent rows are records.
- Field names must not contain spaces or special characters other than underscore.

**Word Delimited Data Source:**

- A Word document (or text file) where the first line is the header with field names.
- Subsequent lines are records, with fields separated by a delimiter (tab, comma, or other).
- Records separated by paragraph marks.

**Excel Workbook:**

- Select a worksheet or named range.
- First row = header.

**Access Database:**

- Select a table or query.
- Field names from the table.

**dBase/FoxPro/ODBC:**

- DBase: `.dbf` files.
- FoxPro: `.dbf` via Microsoft Query.
- ODBC: any registered ODBC source.

**Schedule+ Contact List:**

- Uses Schedule+ 7.0 contact properties as fields.

### Mailing Labels Main Document

- After choosing Mailing Labels, a Label Options dialog opens (same as Tools → Envelopes and Labels → Labels → Options).
- After selecting the label product and number, a Create Labels dialog inserts a table with the correct label geometry.
- Each cell contains: insertion point for the first label; user inserts merge fields; clicking "Update Labels" propagates the pattern to all cells (adding a `{ NEXT }` field between each pair of cells).

### Envelopes Main Document

- Envelope Options dialog opens (size, font, feed).
- The main document has one envelope page with a return-address zone and a delivery-address zone.
- Merge fields are inserted in the delivery-address zone.

### Catalog (Directory) Main Document

- Merges all records onto a single continuous document. No page break between records.
- Useful for directories, phonebooks, price lists.

### Merge Error Checking

- "Check Errors…" runs a simulation:
  - Reports any merge field that references a missing data field.
  - Reports unresolvable IF conditions.
  - Reports unmatched `{ NEXT }` fields.
- Errors go into a new document or a log.

## WordBasic and Macros

### WordBasic Language Overview

- Flat procedural BASIC dialect (not object-oriented).
- ~900 commands, each either a **statement** or a **function**.
- Statements perform an action (InsertPara, FileSaveAs).
- Functions return a value (GetText$, CurDate$, SelInfo).
- String functions end with `$`; numeric functions do not.
- Variables: untyped by default (dynamic); can be declared with `Dim` of types String, Integer, Long, Single, Double.
- Arrays: `Dim myArr(10)` (0-indexed); dynamic redim with `ReDim`.
- Control flow: `If…Then…Else…End If`, `While…Wend`, `For…Next`, `Select Case`, `Goto label:`, `GoSub…Return`, `On Error Goto`.
- Dialog boxes: built-in dialogs accessed via command with `.` syntax (e.g., `Dim dlg As FileOpen: GetCurValues dlg: Dialog dlg`). Custom dialogs built with the DialogEditor tool (ships with Office 95 Developer Kit).
- I/O: `Open "file" For Input As #1: Input #1, var: Close #1`.
- Comments: `;` at start of line (full-line) or `'` (trailing). Rem statement also works.

### Macro Storage

- Macros are stored in templates (`.dot` files) and in the active document (`.doc` with macros).
- Each template has a macro module section (a list of named macros).
- A macro is a procedure: `Sub MacroName` through `End Sub`.
- Automatic macros with reserved names fire on events:
  - **AutoExec**: runs when Word starts (must be in Normal.dot or a Startup global template).
  - **AutoExit**: runs when Word exits.
  - **AutoOpen**: runs when a document (containing this macro) opens.
  - **AutoClose**: runs when the document closes.
  - **AutoNew**: runs when a new document is created from the template containing this macro.

### Common WordBasic Commands (~120 frequently used)

**File operations:**

- `FileNew` — new document from template.
- `FileOpen [.Name = "path"]` — open file.
- `FileSave` — save active doc.
- `FileSaveAs [.Name = "path"] [.Format = n]` — save as.
- `FileClose` — close active doc.
- `FileExit` — quit Word.
- `FilePrint [.Copies = n] [.Range = "s"] [.From = "p"] [.To = "p"]` — print.
- `FilePrintPreview` — enter Print Preview.
- `FilePageSetup [.TopMargin = "1.0"]` — set page setup.
- `FileFind` — opens Find File.

**Edit:**

- `EditUndo`, `EditRedo`, `EditRepeat` — undo/redo/repeat.
- `EditCut`, `EditCopy`, `EditPaste`, `EditPasteSpecial` — clipboard.
- `EditClear` — delete selection.
- `EditFind [.Find = "s"] [.MatchCase = 0/1]` — find.
- `EditReplace [.Find = "s"] [.Replace = "t"] [.ReplaceAll = 1]` — replace.
- `EditGoTo [.Destination = "p1"]` — go to.
- `EditBookmark [.Name = "bm"] [.Add = 1]` — add/go to bookmark.
- `EditAutoText [.Name = "entry"]` — insert AutoText.

**Insert:**

- `InsertBreak [.Type = 0]` — page/column/section break (0 = page, 1 = column, 2 = next page section, 3 = continuous, 4 = even, 5 = odd).
- `InsertPara` — insert paragraph mark.
- `Insert [text$]` — insert text at caret.
- `InsertDateTime [.DateTimePic = "format"] [.InsertAsField = 1]` — insert date/time.
- `InsertField [.Field = "fieldcode"]` — insert field.
- `InsertFootnote` / `InsertEndnote`.
- `InsertPicture [.Name = "path"] [.LinkToFile = 1]`.
- `InsertObject [.ClassType = "Equation.2"] [.IconNumber = 0] [.DisplayIcon = 0]`.
- `InsertSymbol [.Font = "Symbol"] [.CharNum = 174]`.
- `InsertTable [.NumColumns = 3] [.NumRows = 4]`.
- `InsertPageNumbers`.

**Format:**

- `FormatFont [.Font = "Arial"] [.Points = "12"] [.Bold = 1]` — apply font.
- `Bold`, `Italic`, `Underline`, `WordUnderline`, `DoubleUnderline`, `DottedUnderline` — toggle each.
- `Strikethrough`, `Hidden`, `SmallCaps`, `AllCaps`.
- `Superscript`, `Subscript`.
- `GrowFont`, `ShrinkFont`, `GrowFontOnePoint`, `ShrinkFontOnePoint`.
- `FormatParagraph [.LeftIndent = "1.0"] [.Alignment = 0]` — apply paragraph formatting (0 = left, 1 = center, 2 = right, 3 = justify).
- `FormatTabs [.Position = "2.0"] [.Alignment = 1]`.
- `FormatBordersAndShading [.ApplyTo = 0]`.
- `FormatColumns [.Columns = 2] [.EvenlySpaced = 1]`.
- `FormatChangeCase [.Type = 2]` — 0 = sentence, 1 = lower, 2 = upper, 3 = title, 4 = toggle.
- `FormatBulletsAndNumbering [.Number = 1]`.
- `FormatStyle [.Name = "Heading 1"] [.Apply = 1]`.
- `FormatAutoFormat [.ApplyNow = 1]`.
- `FormatStyleGallery [.Template = "Report"]`.
- `FormatFrame [.Horizontal = "Left"] [.Vertical = "Top"]`.

**Table:**

- `TableInsertTable [.NumColumns = 3] [.NumRows = 4]`.
- `TableInsertRow`, `TableInsertColumn`, `TableInsertCells`.
- `TableDeleteRow`, `TableDeleteColumn`, `TableDeleteCells`.
- `TableMergeCells`, `TableSplitCells`.
- `TableSort [.FieldNum = 1] [.Type = 0] [.Order = 0]`.
- `TableFormula [.Formula = "=SUM(ABOVE)"]`.
- `TableAutoFormat [.Format = "Grid 1"]`.
- `TableSelectTable`, `TableSelectRow`, `TableSelectColumn`.
- `TableConvertTextToTable`, `TableConvertTableToText`.

**Tools:**

- `ToolsSpelling`, `ToolsGrammar`, `ToolsThesaurus`.
- `ToolsHyphenation [.Auto = 1]`.
- `ToolsLanguage [.Language = "English (US)"]`.
- `ToolsWordCount`.
- `ToolsAutoCorrect`.
- `ToolsMacro [.Name = "MyMacro"] [.Run = 1]`.
- `ToolsOptionsSave [.AutoSave = 10]`.
- `ToolsOptionsView [.Draft = 0]`.

**View:**

- `ViewNormal`, `ViewOutline`, `ViewPage`, `ViewMasterDocument`.
- `ViewZoom [.ZoomPercent = 100]`.
- `ViewFullScreen`.
- `ViewToolbars [.Toolbar = "Standard"] [.Show = 1]`.
- `ViewRuler`.
- `ViewHeader`, `ViewFooter`.
- `ViewFieldCodes [.On = 1]`.

**Window:**

- `DocClose`, `DocMaximize`, `DocMinimize`, `DocRestore`, `DocSize`, `DocMove`.
- `NextWindow`, `PrevWindow`.
- `WindowArrangeAll`.
- `WindowNewWindow`.
- `DocSplit`, `DocRemoveSplit`.

**Selection and Caret:**

- `CharLeft [n]`, `CharRight [n]`.
- `WordLeft`, `WordRight`.
- `LineUp`, `LineDown`.
- `StartOfLine`, `EndOfLine`, `StartOfDocument`, `EndOfDocument`.
- `ParaUp`, `ParaDown`.
- `SentLeft`, `SentRight`.
- `ExtendSelection`, `ShrinkSelection`.
- `SelectCurWord`, `SelectCurSent`, `SelectCurPara`.

**String/Data:**

- `Asc(char$)` → integer code.
- `Chr$(code)` → character string.
- `Left$(s$, n)`, `Right$(s$, n)`, `Mid$(s$, start, length)`.
- `Len(s$)` — length.
- `UCase$(s$)`, `LCase$(s$)`.
- `InStr(start, s$, find$)` — find substring.
- `Val(s$)` — parse number.
- `Str$(n)` — number to string.
- `Format$(value, "format")` — formatted string.

**Dialogs and UI:**

- `MsgBox "prompt" [, type%] [, "title$"]` — modal message (OK, Yes/No, etc.).
- `InputBox$("prompt", "title", "default")` — modal input.
- `Beep` — system beep.
- `Dialog dlg$` — show a built-in dialog.
- `GetCurValues dlg$` — populate dialog record with current values.

**System:**

- `Today$` — today's date.
- `Now` — current date/time.
- `Time$` — current time string.
- `CurDir$` — current directory.
- `ChDir dir$`, `ChDrive drive$`.
- `Kill file$` — delete a file.
- `Name old$ As new$` — rename.
- `MkDir`, `RmDir`.
- `Files$("pattern")` — list files (first call with pattern, subsequent with empty string for next match).

### Round-tripping WordBasic

- Our DOCX implementation will NOT execute WordBasic. DOCX containers do not embed `.wll`/`.wbt` macro blobs that are compatible with Word 95's WordBasic.
- On import of a Word 95 `.doc` (which we will not do natively — only via intermediary conversion), we must preserve macro code text so that round-trip through binary `.doc` is lossless.
- DOCX has no native WordBasic container; macros in modern DOCX are VBA (vbaProject.bin). We will NOT auto-convert WordBasic to VBA.
- Document must warn: "This document contained WordBasic macros which will not run in {AppName}."

## Templates

### Template File Format (`.dot`)

- Same binary format as `.doc` with a flag bit indicating template.
- Contains: styles, AutoText entries, macros, toolbars, custom menus, custom keyboard shortcuts, default page setup, default paragraph and character formatting, default language.
- A template does NOT contain document content itself by default — but a template may have prepopulated content that becomes the initial content of a new document created from it (e.g., letterhead in a Letter template).

### Normal.dot

- The global template. Every Word 95 installation has exactly one Normal.dot per user (stored in the user's Word template folder).
- Modifications to Normal.dot affect all future documents (unless a specific other template overrides).
- When Word exits, if Normal.dot was modified, user is prompted to save (controlled by Options → Save → "Prompt to save Normal Template").

### Global Templates

- Templates loaded at startup (automatically or via File → Templates → Add).
- Provide commands (macros, styles, toolbars) to all documents without being the attached template.
- Ship with Office 95: MACRO60.DOT (Word 6 migration), LETTERS.DOT, FAXES.DOT, MEMOS.DOT, REPORTS.DOT, PUBLICAT.DOT, OTHRDOCS.DOT, LEGAL.DOT.
- User can add custom globals via File → Templates → Add…

### File → Templates and Add-ins Dialog

- Document Template text box: the path of the attached template for this document.
- Attach… button: browse for a new template.
- Global Templates and Add-ins list:
  - Each entry: filename (e.g., `MACRO60.DOT`) with a checkbox (load at startup).
  - Buttons: Add…, Remove.
- Organizer… button: opens Organizer dialog.
- Automatically Update Document Styles checkbox: on next open, styles in the document are refreshed from the attached template.

### Organizer Dialog

Four tabs: **Styles**, **AutoText**, **Toolbars**, **Macros**.

- Two panes (left, right), each showing a list of items in a chosen file.
- Each pane has a file picker: "In {filename}" combo; "Styles available in" list.
- Copy → / ← Copy buttons move selected items between panes.
- Delete removes from selected pane.
- Rename prompts for new name.
- Close Files button releases the selected file; Open File… loads a different file.

### Built-in Templates

Office 95 ships with these document templates:

- Normal
- Blank Document
- Contemporary Letter, Elegant Letter, Professional Letter.
- Contemporary Memo, Elegant Memo, Professional Memo.
- Contemporary Fax, Elegant Fax, Professional Fax.
- Contemporary Report, Elegant Report, Professional Report.
- Contemporary Resume, Elegant Resume, Professional Resume.
- Brochure.
- Directory.
- Invoice.
- Manual.
- Newsletter (Contemporary, Elegant, Professional).
- Press Release.
- Thesis.
- Weekly Timesheet.
- Purchase Order.
- Pleading (Legal Pleading Paper, 28-line).

### Built-in Wizards

Office 95 ships these wizards (each a `.wiz` template with a full-screen interactive UI):

- **Letter Wizard** — 6 steps: style, recipient, date, subject, letter type, closing; outputs a ready-to-customize letter.
- **Memo Wizard** — 5 steps.
- **Fax Wizard** — 5 steps.
- **Resume Wizard** — 6 steps: resume style (Entry-level, Chronological, Functional, Professional), personal info, experience, education, skills, format.
- **Newsletter Wizard** — 7 steps.
- **Agenda Wizard** — 4 steps.
- **Pleading Wizard** — 5 steps (court, parties, case number).
- **Award Wizard** — 4 steps.
- **Table Wizard** — 6 steps (for complex tables).
- **Calendar Wizard** — 5 steps (month layout).

### Wizard UI

- Full-screen (hides the main document).
- Left side: outline of steps with a marker on the current step.
- Center: current step's controls.
- Right: live preview (mini representation of the doc-in-progress).
- Bottom: Back, Next, Finish, Cancel, Help buttons.
- Each Next validates and advances; Finish generates the document and closes the wizard.

## Customization

### Toolbar Customization

- Toolbars can be added, removed, or created from scratch.
- View → Toolbars dialog lists all and offers New…, Reset, Delete, Rename, Customize buttons.
- New Toolbar: prompt for name; empty toolbar docked at top.
- Rename: user-created toolbars only.
- Delete: user-created only.
- Reset: restores built-in toolbar to factory defaults.

### Menu Customization

- Tools → Customize → Menus: drag commands onto menus.
- Can create entirely new menus (Menu Bar combo → Custom).
- Can set the mnemonic by including `&` in the menu item name.
- Separator lines: add item with name `--`.
- Built-in Menu Bar combo: switch between Normal Menu Bar and WordMail Menu Bar (a simplified set for email contexts).

### Keyboard Customization

- Tools → Customize → Keyboard tab.
- Assign any key combination to any command.
- Save Changes In combo: choose template.
- Reset All: restore defaults.
- Shortcuts recognized: Ctrl+X, Ctrl+Shift+X, Ctrl+Alt+X, Ctrl+Alt+Shift+X, Alt+X, Alt+Shift+X (for any X alphanumeric or function key). Not all combinations are user-assignable (e.g., Alt+F4 is reserved by Windows).
- Chorded shortcuts (Ctrl+Shift+Letter1, Letter2): Word 95 supports two-key sequences like Ctrl+K, A (for styles) [verify — Word 95 may not support two-key chord shortcuts for general commands].

### Customize Keyboard Dialog

- Categories list (same as toolbars).
- Commands list (varies per category).
- Current Keys list (existing shortcuts for selected command).
- Press New Shortcut Key text box: live capture of pressed keys.
- Currently Assigned To: shows which command (if any) currently uses that shortcut. Empty if free.
- Save Changes In combo (which template to update).
- Description pane.
- Buttons: Assign, Remove, Reset All, Close.

## AutoText and AutoCorrect

### AutoText

- AutoText is the successor to Word 6.0's "Glossary"; the underlying storage name in the binary format is still `glossary`.
- An AutoText entry is a named snippet of formatted content (text, fields, images, tables) stored in a template.
- Insert via:
  - Type the name + F3.
  - Type the name + Ctrl+Enter [verify — F3 only is canonical Word 95].
  - Edit → AutoText… dialog.
- Dialog layout:
  - Name text box (auto-filled from selection when pre-Add).
  - Preview pane showing the selected entry.
  - Make AutoText Entry Available To combo: All Documents (Normal.dot) / {current template}.
  - Buttons: Add, Delete, Insert, Show All.
- **Built-in AutoText entries** (in Normal.dot):
  - Attention:
  - Attention Line:
  - Best regards,
  - Best wishes,
  - BY HAND
  - Cc:
  - CERTIFIED MAIL
  - CONFIDENTIAL
  - Dear Mom and Dad,
  - Dear Sir or Madam:
  - Encl:
  - PERSONAL
  - Reference:
  - REGISTERED MAIL
  - Regards,
  - Respectfully yours,
  - Salutation
  - Signature (block of UserName + UserAddress)
  - Signature Company
  - Subject:
  - Thank you,
  - To Whom It May Concern:
  - Yours sincerely,
  - Yours truly,
  - VIA AIRMAIL
  - VIA FACSIMILE
  - VIA OVERNIGHT MAIL
  - PAGE
  - Page X of Y
  - Created by (field block)
  - Created on
  - Filename
  - Filename and path
  - Last printed
  - Last saved by
  - Author, Page #, Date
  - Confidential, Page #, Date

### AutoCorrect vs AutoText

- AutoCorrect applies on typing a space/punctuation after the replace-key (automatic).
- AutoText requires explicit invocation (F3 or menu).
- AutoCorrect is designed for small typographic fixes (1–3 word phrases).
- AutoText is designed for larger reusable content blocks (paragraphs, blocks with fields).

### AutoCorrect Dictionary

- Shipped Word 95 AutoCorrect dictionary: ~1100 common typos with corrections.
- Loaded from a template; user additions go to Normal.dot by default.

## Annotations (called "Annotations" in Word 95)

- What Word 2002+ calls "Comments", Word 95 calls "Annotations".
- Insert: Insert → Annotation or Ctrl+Alt+A [verify].
- Each annotation has:
  - A reference mark in the body (initials + sequence number, e.g., "[JB1]" for user Jon Bell's first annotation).
  - Text stored in an annotation pane (split window at bottom).
- View → Annotations shows/hides the annotation pane.
- Each annotation's author is the current user's Name from Options → User Info.
- In the annotation pane, each annotation is prefaced by the user's initials and a bookmark `_an1`, `_an2`, etc.
- Annotations can contain text with formatting; cannot contain footnotes.
- Print: Tools → Options → Print → "Annotations" checkbox; printed as an appendix at the end of the document.
- Voice annotations: Insert → Annotation with the sound icon [verify — this is Word 6.0; Word 95 may still support voice annotations via OLE Sound object]. Requires sound card and `sndrec32.exe`.

### Annotation Pane Behavior

- Split horizontally at the bottom of the window.
- Show all annotations or filter by author via combo at top of pane.
- Right-click an annotation for context: Insert Annotation, Edit Annotation, Delete Annotation.
- Navigate with next/previous annotation buttons.
- Delete an annotation: delete its reference in the body (or use the pane's right-click Delete).

### Protect for Annotations

- Tools → Protect Document → Annotations: document is read-only except for inserting new annotations. Existing annotations and body remain.
- Password-protected.

## Hyperlinks and Internet Assistant

### Base Word 95 Hyperlinks

- Base Word 95 has NO hyperlink creation UI.
- The HYPERLINK field type exists and can be inserted via Insert → Field → HYPERLINK, but the field is dormant without Internet Assistant.
- `GOTOBUTTON bookmark "text"` field works as an intra-document link.

### Internet Assistant Add-on

- Free downloadable add-on from Microsoft (circa 1995–96).
- Installs:
  - HTML file converter (Open/Save HTML Document format).
  - Insert Hyperlink dialog (Insert → Hyperlink menu item added).
  - "Web Authoring" toolbar.
  - Custom styles for HTML: H1, H2, H3, H4, H5, H6 (mapped to Heading 1–6), Address, Blockquote, Definition Term / Data, List Bullet / Number, Keyboard, Sample, Typewriter, Variable, Code, Definition List, Definition Term, Strong, Emphasis, Cite, HTML Markup.
  - HYPERLINK field activation (Ctrl+click to follow).
  - Browse Web document capability (viewing HTML in Word).
- When Internet Assistant is installed:
  - Insert → Hyperlink opens Hyperlink dialog (file path or URL, bookmark within, display text).
  - AutoFormat rule "Internet and Network Paths with Hyperlinks" is available.
  - Typed URLs (http://, ftp://, mailto:, file://) auto-convert to hyperlink fields.
  - Ctrl+K inserts a hyperlink (conflicts with the pre-IA AutoFormat Selection shortcut) [verify].

## Drawing Layer

### Drawing Objects Overview

- Drawing objects live in a separate layer from the text.
- Each drawing object has a position, size, and Z-order.
- Objects can be placed in front of text or behind text (watermark).
- Drawing layer not visible in Normal view; visible in Page Layout and Print Preview.
- Objects are anchored to a paragraph (like frames).

### Drawing Shapes (Word 95)

Note: Word 95 has individual shape tools (not the grouped AutoShapes categories of Word 97+).

- **Line**: straight line segment.
- **Arrow**: line with an arrowhead at one end.
- **Rectangle**: axis-aligned rectangle; Shift-drag for square.
- **Ellipse**: axis-aligned ellipse; Shift-drag for circle.
- **Arc**: quarter-ellipse arc.
- **Freeform**: a polyline or freehand polygon; click for vertices or drag for freehand; double-click closes the shape.
- **Text Box / Frame**: inserts a frame (Word 95's version of the Word 97 text box).
- **Callout**: a line leading to a bounded text region — the label can be aligned to the line in various ways.

### Formatting Drawing Objects

- Select the object (single click) or multiple (Shift+click).
- Format → Drawing Object… opens Format Drawing Object dialog with tabs:
  - **Fill** tab: Fill Color (16 colors + None + More Colors… for custom), Semi-Transparent checkbox, Pattern… button (opens Pattern dialog: 48 patterns with choice of foreground and background color), Gradient… [verify — gradients may be Word 97+; Word 95 has only solid and pattern fills].
  - **Line** tab: Color, Weight (hairline, 0.5, 0.75, 1.0, 1.5, 2.25, 3.0, 4.5, 6.0 pt, or custom), Style (solid, round-dot, square-dot, dash, dash-dot, dash-dot-dot, long-dash, long-dash-dot), Arrow Begin Style, Arrow Begin Size, Arrow End Style, Arrow End Size.
  - **Size and Position** tab: Width, Height, Horizontal From (Margin, Page, Column), Vertical From (Margin, Page, Paragraph), Position, Lock Aspect Ratio checkbox, Move with Text checkbox, Lock Anchor checkbox.
  - **Wrapping** tab: None (text overlaps), Square (text wraps around bounding box), Tight (text wraps to shape outline — for polygons), Through (text flows through transparent regions), No Wrap (object is inline).
- Shadow: toggle drop shadow (fixed 5 pt offset, gray color).
- Fill Color split button: last-used color.
- Line Color split button.
- Line Style menu: common thicknesses.
- Dashed Line menu.
- Arrow Style menu.
- Shadow toggle.

### Grouping

- Select multiple objects (Shift+click each or drag a selection rectangle with the pointer tool).
- Drawing toolbar: Group button combines them into one logical object.
- Ungroup reverses.
- Regroup: restore the last-used group after ungroup.

### Z-Order

- Bring to Front: move selected above all others.
- Send to Back: below all others.
- Bring Forward: up one.
- Send Backward: down one.
- Bring in Front of Text: drawing layer above text.
- Send Behind Text: drawing layer below text (watermark).

### Rotation and Flip

- Rotate Right 90°: rotates selection 90° clockwise.
- Rotate Left 90° [verify — may not be in 95, only Right].
- Flip Horizontal: mirror left-right.
- Flip Vertical: mirror top-bottom.
- Word 95 does NOT support arbitrary-angle rotation (that is Word 97+).

### Alignment

- Drawing toolbar: Align button opens Align dialog.
- Align relative to: Each Other / Page / Margin.
- Horizontal: Left, Center, Right, Distribute.
- Vertical: Top, Middle, Bottom, Distribute.

### Snap to Grid

- Snap to Grid dialog (from Drawing toolbar):
  - Snap to Grid checkbox.
  - Snap to Shapes checkbox [verify — 97+].
  - Horizontal Spacing, Vertical Spacing (inches, default 0.1").
  - Horizontal Origin, Vertical Origin (inches from top-left of page).

### Reshape

- Polygon/Freeform objects can be edited vertex-by-vertex.
- Select + Drawing toolbar → Reshape enters vertex-edit mode.
- Drag vertices to move.
- Right-click a vertex for context menu: Delete Point, Add Point, Open Path / Close Path, Make Curve / Make Straight, Set as Default.

### Create Picture

- Drawing toolbar's Create Picture button opens a separate picture-editing window.
- Acts like a mini Draw application; content is saved as a Word Picture OLE object in the host document.

## Status Bar Regions

### Left Section (page and location)

- **Page X**: current page number (as it appears to the reader, respecting page number format).
- **Sec X**: current section number.
- **X/Y**: current logical page of total logical pages.
- **At X.X"**: vertical distance from top of the page to the current caret (or top of selection).
- **Ln X**: line number from the top of the page.
- **Col X**: column number from the left margin.

### Right Section (mode indicators)

Each is an abbreviation in a text panel; clicking it toggles the mode (except REC which opens the Record Macro dialog).

- **REC**: recording macro. Light means off, dark means recording. Click to open Record New Macro dialog.
- **MRK**: Revision marking. Click toggles Tools → Revisions → Mark Revisions.
- **EXT**: Extend selection mode. Click toggles.
- **OVR**: Overtype mode. Click toggles (same as Insert key).
- **WPH**: WordPerfect Help mode. Click toggles Options → General → Help for WordPerfect Users.

### Rightmost Section

- **Book icon**: Background spell check. Icon shows a book with:
  - Red X: errors present and background check is on.
  - Pencil: currently checking.
  - Plain book: no errors, background check on.
  - No icon: background check off.
- **Diskette icon**: saving (briefly visible during save operations).
- **Clock icon** [verify — in 97+ is where AutoSave lives; 95 may have this also].
- **Language indicator** [verify — may be 97+].

## Scrollbars and View Buttons

### Vertical Scrollbar

- At the top: ↑ arrow button.
- **Split handle**: a thin horizontal bar above the ↑ arrow. Drag it down to split the window into two independent panes.
- Thumb and track.
- At the bottom: ↓ arrow.
- Below ↓: **three view buttons** (left to right):
  - Normal View.
  - Page Layout View.
  - Outline View.
- No Browse Object selector (that is Word 97+).

### Horizontal Scrollbar

- At the left: ← arrow.
- Thumb and track.
- At the right: → arrow.
- The horizontal scrollbar is hidden if Tools → Options → View → Horizontal Scrollbar is unchecked OR if Normal view has Wrap to Window on.

### Split Window Behavior

- Dragging the split handle splits the window into two horizontally stacked panes.
- Each pane has its own vertical scrollbar.
- Both panes show the same document.
- Resize the split by dragging the split bar.
- Remove split by double-clicking the split bar or dragging it off the window (to top or bottom edge).

## Right-click Context Menus

Word 95 has context-sensitive right-click menus that vary by clicked object type.

### Context: Text (no selection or plain text selection)

- Cut (if selection)
- Copy (if selection)
- Paste (if clipboard has content)
- Font…
- Paragraph…
- Bullets and Numbering…

### Context: Spelling error (background spellcheck red squiggle)

- Suggestions list (up to 5 at top)
- Ignore All
- Add (to current custom dictionary)
- AutoCorrect (submenu with each suggestion; selecting adds to AutoCorrect list)
- Spelling… (opens modal dialog)

### Context: Paragraph (right-click in the paragraph)

- Cut, Copy, Paste, Paste Special…
- Font…
- Paragraph…
- Bullets and Numbering…
- Borders and Shading…
- Style Gallery… [verify]

### Context: Table cell

- Cut, Copy, Paste, Paste Special…
- Cell Height and Width…
- Borders and Shading…
- Insert Cells…, Delete Cells…, Merge Cells, Split Cells…
- Select Row, Select Column, Select Table
- Table AutoFormat…

### Context: Image or inline picture

- Cut, Copy, Paste
- Borders and Shading…
- Picture… (opens Format Picture dialog)
- Frame… (convert to framed)
- Create Text Box [verify]

### Context: Drawing object

- Cut, Copy, Paste
- Format Drawing Object…
- Cut, Paste, Bring to Front, Send to Back, Group, Ungroup
- Edit Points (for freeform)

### Context: Field

- Toggle Field Codes
- Update Field (F9)
- Edit Field… (opens Field dialog for this field)
- Lock / Unlock Field
- Unlink Fields (Ctrl+Shift+F9)

### Context: Hyperlink (IA add-on only)

- Open Hyperlink
- Copy Hyperlink
- Edit Hyperlink…
- Remove Hyperlink

### Context: Footnote/Endnote reference

- Cut, Copy, Paste
- Note Options…
- Go to Footnote (jumps to the footnote text)
- Delete (deletes the reference and the note)

### Context: Annotation reference

- Edit Annotation
- Delete Annotation
- Annotation Options

## Comprehensive Keyboard Shortcut Reference

Below is the complete Word 95 default keyboard map. Shortcuts are grouped by function. Flag `[Custom?]` means a user can reassign in Customize → Keyboard. Items in the default set that differ from Word 97+ are noted.

### File Operations

| Shortcut       | Command                                        |
| -------------- | ---------------------------------------------- |
| Ctrl+N         | FileNewDefault (new blank doc from Normal.dot) |
| Ctrl+O         | FileOpen                                       |
| Ctrl+F4        | Close active document (DocClose)               |
| Ctrl+S         | FileSave                                       |
| Shift+F12      | FileSave (alternate)                           |
| F12            | FileSaveAs                                     |
| Ctrl+P         | FilePrint                                      |
| Ctrl+Shift+F12 | FilePrint (alternate)                          |
| Ctrl+F2        | FilePrintPreview                               |
| Alt+F4         | FileExit                                       |

### Editing

| Shortcut       | Command                                               |
| -------------- | ----------------------------------------------------- |
| Ctrl+Z         | EditUndo                                              |
| Ctrl+Y         | EditRedo (also EditRepeat before an undo)             |
| F4             | EditRepeat                                            |
| Alt+Backspace  | EditUndo (alt)                                        |
| Ctrl+X         | EditCut                                               |
| Shift+Delete   | EditCut (alt)                                         |
| Ctrl+C         | EditCopy                                              |
| Ctrl+Insert    | EditCopy (alt)                                        |
| Ctrl+V         | EditPaste                                             |
| Shift+Insert   | EditPaste (alt)                                       |
| Delete         | EditClear (also delete character to right)            |
| Backspace      | EditClear (delete character to left)                  |
| Ctrl+Delete    | Delete next word                                      |
| Ctrl+Backspace | Delete previous word                                  |
| Ctrl+A         | EditSelectAll                                         |
| Ctrl+Num5      | EditSelectAll (alt — numeric pad 5 with Num Lock off) |
| Ctrl+F         | EditFind                                              |
| Ctrl+H         | EditReplace                                           |
| Ctrl+G         | EditGoTo                                              |
| F5             | EditGoTo (alt)                                        |
| Shift+F5       | GoBack (cycle through last 3 edit positions)          |
| Ctrl+Shift+F5  | EditBookmark                                          |

### Selection Extension

| Shortcut                   | Action                                               |
| -------------------------- | ---------------------------------------------------- |
| Shift+← / →                | Extend by one character                              |
| Ctrl+Shift+← / →           | Extend by one word                                   |
| Shift+↑ / ↓                | Extend by one line                                   |
| Ctrl+Shift+↑ / ↓           | Extend by one paragraph                              |
| Shift+Home / End           | Extend to line start/end                             |
| Ctrl+Shift+Home / End      | Extend to document start/end                         |
| Shift+PageUp / PageDown    | Extend by one screen                                 |
| Alt+Ctrl+PageUp / PageDown | Top/bottom of window                                 |
| F8                         | Turn on Extend mode (then F8 to progressively widen) |
| Shift+F8                   | Shrink selection (reverse progressive)               |
| Esc                        | Exit Extend mode                                     |
| Ctrl+Shift+F8              | Enter column selection mode                          |
| Alt+drag                   | Column selection                                     |

### Navigation (no selection)

| Shortcut                   | Action                       |
| -------------------------- | ---------------------------- |
| ← / →                      | One character                |
| Ctrl+← / →                 | One word                     |
| ↑ / ↓                      | One line                     |
| Ctrl+↑ / ↓                 | One paragraph                |
| Home                       | Beginning of line            |
| End                        | End of line                  |
| Ctrl+Home                  | Beginning of document        |
| Ctrl+End                   | End of document              |
| PageUp / PageDown          | One screen                   |
| Ctrl+PageUp / PageDown     | Top of previous/next page    |
| Alt+Ctrl+PageUp / PageDown | Top/bottom of visible window |
| F6                         | Next pane (if split)         |
| Shift+F6                   | Previous pane                |
| Ctrl+F6                    | Next document window         |
| Ctrl+Shift+F6              | Previous document window     |

### Character Formatting

| Shortcut     | Effect                                      |
| ------------ | ------------------------------------------- |
| Ctrl+B       | Bold toggle                                 |
| Ctrl+I       | Italic toggle                               |
| Ctrl+U       | Single underline toggle                     |
| Ctrl+Shift+W | Words-only underline toggle                 |
| Ctrl+Shift+D | Double underline toggle                     |
| Ctrl+Shift+H | Hidden text toggle                          |
| Ctrl+Shift+K | Small caps toggle                           |
| Ctrl+Shift+A | All caps toggle                             |
| Ctrl+=       | Subscript toggle                            |
| Ctrl+Shift+= | Superscript toggle                          |
| Ctrl+Space   | Clear character formatting                  |
| Ctrl+Shift+F | Activate Font combo (on Formatting toolbar) |
| Ctrl+Shift+P | Activate Font Size combo                    |
| Ctrl+Shift+> | Grow font to next preset size               |
| Ctrl+Shift+< | Shrink font to previous preset size         |
| Ctrl+]       | Grow font by 1 pt                           |
| Ctrl+[       | Shrink font by 1 pt                         |
| Ctrl+Shift+Q | Apply Symbol font                           |
| Shift+F3     | Cycle case (lowercase / Title / UPPERCASE)  |
| Ctrl+D       | Open Font dialog                            |

### Paragraph Formatting

| Shortcut     | Effect                            |
| ------------ | --------------------------------- |
| Ctrl+L       | Left align                        |
| Ctrl+E       | Center                            |
| Ctrl+R       | Right align                       |
| Ctrl+J       | Justify                           |
| Ctrl+M       | Increase left indent one tab      |
| Ctrl+Shift+M | Decrease left indent one tab      |
| Ctrl+T       | Hanging indent (increase)         |
| Ctrl+Shift+T | Hanging indent (decrease)         |
| Ctrl+1       | Single line spacing               |
| Ctrl+2       | Double line spacing               |
| Ctrl+5       | 1.5 line spacing                  |
| Ctrl+0       | Toggle 12 pt Space Before         |
| Ctrl+Q       | Clear direct paragraph formatting |

### Styles

| Shortcut     | Effect                                  |
| ------------ | --------------------------------------- |
| Ctrl+Shift+S | Focus Style combo on Formatting toolbar |
| Ctrl+Shift+N | Apply Normal style                      |
| Ctrl+Alt+1   | Apply Heading 1                         |
| Ctrl+Alt+2   | Apply Heading 2                         |
| Ctrl+Alt+3   | Apply Heading 3                         |
| Ctrl+Shift+L | Apply List Bullet style                 |

### View Switching

| Shortcut   | View                                                        |
| ---------- | ----------------------------------------------------------- |
| Ctrl+Alt+N | Normal                                                      |
| Ctrl+Alt+O | Outline                                                     |
| Ctrl+Alt+P | Page Layout                                                 |
| Ctrl+Alt+M | Master Document [verify]                                    |
| Ctrl+Alt+F | Full Screen [verify — may not have a default binding in 95] |

### Outline Navigation

| Shortcut              | Action                              |
| --------------------- | ----------------------------------- |
| Alt+Shift+←           | Promote one level                   |
| Alt+Shift+→           | Demote one level                    |
| Alt+Shift+↑           | Move up                             |
| Alt+Shift+↓           | Move down                           |
| Alt+Shift++           | Expand                              |
| Alt+Shift+-           | Collapse                            |
| Alt+Shift+1..9        | Show headings up through level 1..9 |
| Alt+Shift+A           | Show all                            |
| Alt+Shift+L           | Show first line only                |
| / (on numeric keypad) | Show formatting                     |

### Fields

| Shortcut       | Action                                |
| -------------- | ------------------------------------- |
| Ctrl+F9        | Insert empty field braces             |
| F9             | Update selected field                 |
| Shift+F9       | Toggle field code / result (selected) |
| Alt+F9         | Toggle all fields' codes / results    |
| Ctrl+F11       | Lock field                            |
| Ctrl+Shift+F11 | Unlock field                          |
| Ctrl+Shift+F9  | Unlink field (convert to result text) |
| F11            | Next field                            |
| Shift+F11      | Previous field                        |

### Proofing

| Shortcut | Action                                                         |
| -------- | -------------------------------------------------------------- |
| F7       | Spelling                                                       |
| Shift+F7 | Thesaurus                                                      |
| Alt+F7   | Find next spelling error (for background spell check) [verify] |

### Insertions

| Shortcut          | Insertion                                                    |
| ----------------- | ------------------------------------------------------------ |
| Ctrl+Enter        | Page break                                                   |
| Ctrl+Shift+Enter  | Column break                                                 |
| Shift+Enter       | Line break (soft return, no new paragraph)                   |
| Enter             | New paragraph                                                |
| Ctrl+Tab          | Tab character in a table cell (since Tab moves to next cell) |
| Ctrl+Alt+.        | Ellipsis (…)                                                 |
| Ctrl+Alt+C        | Copyright (©)                                                |
| Ctrl+Alt+R        | Registered (®)                                               |
| Ctrl+Alt+T        | Trademark (™)                                                |
| Ctrl+Alt+Hyphen   | Em dash (—) (on numeric keypad hyphen)                       |
| Ctrl+Hyphen       | En dash (–)                                                  |
| Ctrl+Shift+Hyphen | Nonbreaking hyphen                                           |
| Ctrl+Shift+Space  | Nonbreaking space                                            |
| Ctrl+Alt+A        | Insert annotation [verify]                                   |
| Ctrl+Alt+F        | Insert footnote [verify]                                     |
| Ctrl+Alt+D        | Insert endnote [verify]                                      |

### Macros

| Shortcut | Action                                                                |
| -------- | --------------------------------------------------------------------- |
| Alt+F8   | Macro dialog                                                          |
| Alt+F11  | Macro editor [verify — Alt+F11 in 95 may open WordBasic Macro Editor] |

### Tables

| Shortcut         | Action                            |
| ---------------- | --------------------------------- |
| Tab              | Next cell (or add new row at end) |
| Shift+Tab        | Previous cell                     |
| Ctrl+Tab         | Tab character inside cell         |
| Alt+Home         | First cell in row                 |
| Alt+End          | Last cell in row                  |
| Alt+PageUp       | First cell in column              |
| Alt+PageDown     | Last cell in column               |
| Ctrl+Shift+Enter | Split table                       |

### Help

| Shortcut | Action                                            |
| -------- | ------------------------------------------------- |
| F1       | Help Topics (or contextual help)                  |
| Shift+F1 | What's This? cursor (click next element for help) |

### Windows / Misc

| Shortcut | Action                            |
| -------- | --------------------------------- |
| Esc      | Cancel menu / dialog / selection  |
| F10      | Activate menu bar                 |
| Alt      | Activate/deactivate menu bar      |
| Alt+F7   | Find next spelling error [verify] |
| Ctrl+F10 | Maximize document window          |
| Ctrl+F5  | Restore document window size      |

## MDI Behavior

### Multiple Document Interface

- One `WinWord.exe` process hosts zero-to-many document windows (MDI children).
- Each child is a sibling inside the application frame.
- Child windows can be minimized (icon in the workspace), maximized (fills workspace, takes over the menu-bar's close button), or restored.
- Switching between children: Ctrl+F6 (next), Ctrl+Shift+F6 (previous); or Window menu.

### Window Menu

- New Window: creates a second view onto the same doc (title `{name}:1`, `{name}:2`).
- Arrange All: tiles non-minimized children vertically.
- Split: horizontal split handle drag into the current child window.
- Numbered list of open windows (up to 9 numbered; more via More Windows…).

### New Window (Two Windows on Same Document)

- Creates a second MDI child showing the same document.
- Edits in either are reflected in the other (shared document model).
- Closing either window reduces the title suffix; closing the last closes the document.
- Useful for viewing two different sections (e.g., body and an appendix) side by side with Arrange All.

### Split Window

- Window → Split: activates split-bar drag mode; a horizontal bar attaches to the cursor.
- Click to drop the bar.
- Two panes with independent scrolling on the same document.
- Unsplit: Window → Remove Split; or double-click the bar; or drag it off the top/bottom.
- The active pane is where typing/selection happens; F6 toggles between panes.

## File Features

### MRU List

- File menu shows up to N most-recently-used files.
- Default N = 4.
- Configurable 0–9 via Options → General → Recently Used File List.
- When N = 0, the MRU section is hidden from the File menu.

### Find File Dialog (File → Find File)

- Full-featured file search with properties-based filtering.
- Components:
  - **File Name** text box (with wildcards).
  - **Location** combo: drive / folder selector (Include Subfolders checkbox).
  - **Files of Type** combo (same as Open).
  - **Search Criteria** expandable list:
    - Text or Property: find files by text content or by a property.
    - Date Last Saved: before/after/on.
    - Date Created: before/after/on.
    - Last Saved By: username.
    - Any property from Summary Info.
    - Multiple criteria joined by And/Or.
  - **Search Options**:
    - Match All Word Forms (inflected variants).
    - Match Case.
  - **Results List**: filename, size, last modified, folder.
  - **Preview Pane**: renders the first page of the selected document (if "Save Preview Picture" is enabled in the target doc).
  - **View**: List / Preview / File Info combo.
  - **Command and Settings** menu: Open Read Only, Open Copy, Save Search As (stores query for reuse), Delete, Rename, Print, Summary Info.

### Summary Info Dialog

- Fields: Title, Subject, Author, Manager, Company, Category, Keywords, Comments, Hyperlink Base, Template.
- "Template" shows the attached template's filename (read-only).
- Author, Manager, Company pre-populated from User Info.
- "Save preview picture" checkbox (in Save As dialog, Options section): when set, the first page's bitmap is embedded in the doc for use in Find File and Style Gallery preview.

## Printing

### Print Dialog (File → Print, Ctrl+P)

- **Printer** group:
  - Name combo (all installed printers).
  - Status: Idle / Printing / Offline / Out of Paper.
  - Type: driver name.
  - Where: port.
  - Comment: printer description.
  - Properties… button (opens printer-specific driver dialog: paper size, resolution, orientation, color, duplex, etc.).
  - Print to File checkbox (prompts for `.prn` output path).
- **Page Range** group:
  - ○ All
  - ○ Current Page
  - ○ Selection (grayed unless there is a selection)
  - ○ Pages: text field accepting page numbers and ranges separated by commas (e.g., `1,3-5,8-10`).
- **Copies** group:
  - Number of Copies spin.
  - Collate checkbox (default on): when on, prints sets 1-N then 1-N; when off, prints all copies of page 1 then page 2 etc.
- **Print What** combo:
  - Document
  - Summary Info
  - Annotations (a list of annotation texts)
  - Styles (every style's name and description)
  - AutoText Entries
  - Key Assignments (custom keyboard shortcuts)
- **Print** combo:
  - All Pages in Range
  - Odd Pages
  - Even Pages
- **Options…** button: opens Print tab of Options dialog.

### Print Preview

- View → Print Preview (Ctrl+F2).
- Shows pages as they will print.
- Print Preview toolbar:
  - Print button.
  - Magnifier toggle (arrow cursor with + / arrow cursor with text-edit).
  - One Page button.
  - Multiple Pages dropdown (pick grid: 1×1, 1×2, 1×3, 2×1, 2×2, 2×3, 3×3, 6×3).
  - Zoom combo.
  - View Ruler toggle.
  - Shrink to Fit button: reduces document's font sizes to eliminate the last partial page if it has < 1/3 of a full page of content.
  - Full Screen toggle.
  - Close button.
  - Help button.
- **Margin Edit in Preview**: drag the page margins directly on the rulers (appearing as gray bars on the page edges).
- **Caret Edit in Preview**: with Magnifier off, click in text to place caret and type.

### Shrink to Fit

- Attempts to fit the document on one fewer page.
- Reduces font sizes uniformly in 0.5 pt increments.
- If it cannot achieve the goal, no change.
- Reversible via Edit → Undo.

## "Personal" Features

### TipWizard

- A single-row strip that appears between toolbars and ruler when enabled.
- Toggled on via the TipWizard button on the Standard toolbar or Options → General → TipWizard Active.
- Shows one tip at a time; tips rotate automatically or can be advanced/rewound manually.
- Tips are context-aware: Word monitors user actions for "inefficient" patterns and offers a tip.
  - Typing many spaces to center? Tip: "Use the Center button or Ctrl+E."
  - Using Enter to force spacing? Tip: "Use Space Before/After."
  - Repeated cut-paste within a paragraph? Tip: "Use Format Painter."
- **Show Me** button (appears on certain tips): plays a brief animated demo of the suggested feature.
- Tips database: a set of ~150 tips in the Tips.doc file.

### Answer Wizard (Microsoft Word Help)

- Help menu → Answer Wizard…
- Natural language question box: "How do I make a table?", "How do I insert a page number?"
- Bayesian model ranks help topics by relevance to the query.
- Results list opens the top-ranked help topic with links to alternatives.
- Uses Office 95's shared help engine (WinHelp 4.0 + the Answer Wizard DLL).

### WordPerfect Help

- Help menu → WordPerfect Help…
- Opens a dialog for WordPerfect 5.1/6.x users.
- Command list: common WP commands (Block, Center, Flush Right, Format, List Files, Merge, Spell, Thesaurus, Underline, Bold, Italic, Font, Retrieve, Save, Exit, …).
- Click a WP command to see:
  - The Word equivalent (command name, menu path, keyboard shortcut).
  - Optional "Demo" button (plays animated demo of the Word way).
- Options → General → Help for WordPerfect Users: when on, pressing a WP-style key sequence (like `/` for menu) displays instructions for the Word way.
- Options → General → Navigation Keys for WordPerfect Users: when on, PageUp/PageDown use WP semantics (screens, not document-relative), Esc behaves like WP.

### Examples and Demos

- Help menu → Examples and Demos…
- A separate document listing guided tours of Word features (Creating a Letter, Mail Merge, Tables, Styles).
- Each demo is a pre-recorded sequence with voice-over (if sound card installed) and on-screen annotations.

### Tip of the Day (startup)

- On startup, unless disabled, a "Tip of the Day" dialog shows a random tip.
- "Show Tips at Startup" checkbox.
- Browse tips with Previous/Next buttons.

## Compatibility Modes

### Saving in Prior Formats

- File → Save As → Save file as type → Word 2.x for Windows: saves in Word 2.0 format (loses features not in 2.0).
- Save file as type → Word 6.0/95: saves in Word 6/95 format (the current format).
- Save file as type → Word for Windows 95 and 6.0: same as above.
- Save file as type → WordPerfect 5.x: uses the WP converter.
- Save file as type → Rich Text Format: converts to RTF.
- Save file as type → Text Only: strips all formatting.

### Font Substitution

- When opening a document that uses a font not installed locally, Word offers substitution.
- Options → Compatibility → Font Substitution… dialog:
  - Missing Document Font list.
  - Substituted Font combo (defaults to the best match).
  - "Convert Permanently" button: replaces the font in the document's storage.

### Compatibility Options

- Options → Compatibility tab: ~20 compatibility flags controlling layout behavior.
- "Recommended Options For" combo: one-click presets per old Word version.

## Open File Formats

Word 95 opens the following formats via its converter DLLs:

- **Word documents**: `.doc` (6.0/95), `.dot` (6.0/95 template), `.doc` (2.0), `.doc` (5.x).
- **Mac Word**: Word 5.1 / 6.0 for Macintosh (converts via Mac/Win Word file format compatibility).
- **Rich Text Format**: `.rtf`.
- **Plain text**: `.txt` (with line breaks or without).
- **MS-DOS text**: `.txt` with CR/LF endings.
- **WordPerfect 5.x for DOS/Windows**: `.wpd`, `.doc`.
- **WordPerfect 6.x**: `.wpd`.
- **Works for Windows 3.0/4.0**: `.wps`.
- **Excel Worksheet**: `.xls`, `.xlw` (imports as a table, cells as cells).
- **Lotus 1-2-3**: `.wk1`, `.wk3`, `.wk4` (imports as a table).
- **HTML**: `.htm`, `.html` (only with Internet Assistant add-on installed).
- **Recover Text from Any File**: extracts printable characters from any file.
- **AmiPro 2.0/3.0**: `.sam` [verify — may require optional converter].

## Open and Save Conversion

### Confirm Conversion at Open

- Options → General → "Confirm Conversion at Open" checkbox: when on, Word shows a Convert dialog each time it auto-detects a non-Word format.
- Convert File dialog: lists all known file types; user selects which one to use for the open.

## Save Formats (detailed)

- **Word 6.0/95** (default): the binary `.doc` format shared with Word 6.
- **Word 2.0**: legacy binary.
- **Word for Macintosh 5.1, 6.0**: Mac-specific binary variants.
- **Rich Text Format**: `.rtf` per RTF 1.5 spec with Word 95 extensions.
- **Text Only**: ASCII, no formatting, one paragraph = one line.
- **Text Only with Line Breaks**: preserves soft line breaks as CRLF.
- **MS-DOS Text**: CP437-ish encoding, CRLF.
- **MS-DOS Text with Line Breaks**: above with soft line breaks.
- **WordPerfect 5.x / 6.x**: via converter.
- **Works 3.0/4.0 for Windows**: via converter.
- **Document Template** (`.dot`): same as Word 6.0/95 but flagged template.
- **HTML Document** (only with IA installed).

## Startup Behavior

### Application Startup Sequence

1. Load and initialize `WinWord.exe`.
2. Display splash screen with Office 95 logo.
3. Load Normal.dot from user template folder.
4. Load startup global templates (from `Office\Startup` folder and any `Office\Shared\Startup`).
5. Load Options (from registry: `HKEY_CURRENT_USER\Software\Microsoft\Office\7.0\Word\Options`).
6. Load custom dictionaries.
7. Execute AutoExec macro (if defined in Normal.dot or any loaded global template).
8. Present empty Document1 (or the file specified on command line).
9. Show Tip of the Day (if enabled).

### Command-Line Arguments

- `WinWord.exe [file] [/n] [/m] [/t] [/f] [/q] [/mMacroName] [/pxprintername]`:
  - file: document to open on startup.
  - `/n`: start with no new document (show empty workspace).
  - `/m`: disable AutoExec macros.
  - `/t`: open as template (for edit, not as new-doc).
  - `/f`: force Options dialog first.
  - `/q`: quiet startup (suppress Tip of Day).
  - `/m{MacroName}`: run named macro after startup.
  - `/p{PrinterName}`: set default printer for session.

### AutoRecover / AutoSave

- Options → Save → Automatic Save Every N minutes.
- Saves a recovery file (`.asd`) in the AutoRecover location (Options → File Locations → AutoSave Files).
- On next launch, Word detects recovery files and offers to restore.
- AutoSave does NOT write to the document's own path — it writes to a separate recovery file.
- Word 95 may only support "Automatic Save" which writes to the document itself [verify — AutoRecover is a 97 addition; Word 95 has Automatic Save and the behavior is configurable to write to the doc or to a recovery file].

## Persistence: What Word 95 Stores

For each document, the `.doc` file contains:

- **FIB (File Information Block)** — per-file metadata: version (nFib), character encoding, feature flags.
- **Text stream** — Unicode or ANSI run of characters for body, headers, footers, footnotes, endnotes, annotations.
- **CHP runs** — character property runs (font, bold, etc.).
- **PAP runs** — paragraph property runs (alignment, indent, etc.).
- **Section runs** — section boundaries and properties.
- **Style Sheet (STSH)** — all styles.
- **Bookmarks** — named ranges.
- **Fields** — field code runs.
- **Tables** — tab stops, table information.
- **List tables** — numbered/bulleted list definitions.
- **Frames (FRD)** — frame placements.
- **OLE/embeds** — ObjectPool sub-streams.
- **Pictures** — inline metadata + bitmap/metafile data.
- **Summary Info** — stored in the OLE storage's SummaryInformation stream.

Our target is DOCX — we map each of these to the corresponding ECMA-376 part (word/document.xml, word/styles.xml, word/numbering.xml, word/settings.xml, word/fontTable.xml, word/media/_, word/embeddings/_, etc.) and preserve the semantics.

## Feature Availability Flags (for our implementation checklist)

The following table summarizes whether each feature is a must-have ("M"), nice-to-have ("N"), or can be deferred ("D") for our Word 95 parity implementation.

| Feature                                             | Priority                   |
| --------------------------------------------------- | -------------------------- |
| Menu bar with all 9 menus                           | M                          |
| Standard toolbar                                    | M                          |
| Formatting toolbar                                  | M                          |
| Ruler (horizontal)                                  | M                          |
| Ruler (vertical)                                    | M                          |
| Normal view                                         | M                          |
| Page Layout view                                    | M                          |
| Outline view                                        | M                          |
| Master Document view                                | N                          |
| Full Screen view                                    | M                          |
| Print Preview                                       | M                          |
| Status bar with all regions                         | M                          |
| Right-click context menus (all 8 kinds)             | M                          |
| MDI with New Window / Split / Arrange               | M                          |
| Undo/Redo with history dropdown                     | M                          |
| Find/Replace/Go To (tabbed)                         | M                          |
| Bookmarks                                           | M                          |
| Styles (paragraph)                                  | M                          |
| Templates (.dot equivalent in our format)           | M                          |
| Sections (with per-section page setup)              | M                          |
| Headers/footers (3 variants per section)            | M                          |
| Footnotes / Endnotes                                | M                          |
| Page numbers (all formats)                          | M                          |
| Tables (all features except Draw Table)             | M                          |
| Convert Text ⇌ Table                                | M                          |
| Table AutoFormat                                    | M                          |
| Table Sort                                          | M                          |
| Table Formula                                       | M                          |
| Frames (floating, wrapping)                         | M                          |
| Insert Picture (all 15 formats)                     | M                          |
| OLE 2.0 Insert Object                               | M                          |
| Equation Editor 1.x/2.x                             | M                          |
| WordArt 2.0                                         | M                          |
| Organization Chart 2.0                              | N                          |
| Microsoft Graph 5.0                                 | N                          |
| Symbol dialog                                       | M                          |
| Field dialog + all field codes                      | M                          |
| Field codes toggle (Alt+F9)                         | M                          |
| Form fields (Text, Checkbox, Drop-Down)             | M                          |
| Protect Document                                    | M                          |
| Break dialog (all 4 section types + page + column)  | M                          |
| Spelling (modal and background)                     | M                          |
| Grammar                                             | N                          |
| Thesaurus                                           | M                          |
| Hyphenation (auto + manual)                         | M                          |
| Language marking                                    | M                          |
| Word Count                                          | M                          |
| AutoCorrect                                         | M                          |
| AutoText                                            | M                          |
| AutoFormat (now + as-you-type)                      | M                          |
| Mail Merge Helper (all sources, all output)         | M                          |
| Envelopes and Labels                                | M                          |
| Revisions (Mark, Accept/Reject, Compare, Merge)     | M                          |
| Annotations (with pane)                             | M                          |
| WordBasic macro execution                           | D (read-only preservation) |
| Customize (Toolbars, Menus, Keyboard)               | M                          |
| Options dialog (12 tabs)                            | M                          |
| File → New (with template picker)                   | M                          |
| Find File                                           | N                          |
| Summary Info                                        | M                          |
| Print dialog (all options)                          | M                          |
| TipWizard                                           | N                          |
| Answer Wizard                                       | N                          |
| WordPerfect Help                                    | D                          |
| Tip of the Day on startup                           | N                          |
| Drawing layer (all shapes, fill/line/shadow, group) | M                          |
| Rotate 90° / Flip                                   | M                          |
| Snap to Grid                                        | M                          |
| Freeform/polyline reshape                           | M                          |
| 3-D effects on shapes                               | D                          |
| Pattern fills                                       | N                          |
| Gradient fills (Word 95 only has solid + pattern)   | —                          |
| Drop Cap                                            | M                          |
| Columns (up to 6)                                   | M                          |
| Bullets and Numbering (7 styles each)               | M                          |
| Multilevel / Outline numbered                       | M                          |
| Heading numbering                                   | M                          |
| Borders and Shading (paragraph + table)             | M                          |
| Style Gallery                                       | N                          |
| Organizer                                           | M                          |
| Global templates                                    | M                          |
| MRU list                                            | M                          |
| Confirm Conversion at Open                          | M                          |
| AutoSave to recovery file                           | M                          |
| Fast Saves                                          | D                          |
| Backup copies                                       | M                          |
| Blue background, white text                         | N                          |
| Style area                                          | N                          |
| Print preview shrink-to-fit                         | N                          |
| Insert Database                                     | N                          |
| Table Wizard                                        | N                          |
| Built-in wizards (Letter, Memo, Fax, Resume, ...)   | N                          |
| Calendar wizard                                     | D                          |
| Internet Assistant (hyperlinks + HTML)              | D                          |
| The Microsoft Network                               | D                          |

## Appendix A: Dialog Box Layout Conventions

- Dialogs follow Windows 95 Common Controls Conventions: Sans Serif 8-point system font; 3D inset group boxes; radio/checkbox left-aligned with labels; OK/Cancel/Help rightmost column; tabbed dialogs use Tab control (Version 1, not Version 4).
- All dialogs are **modal**; no modeless palette dialogs except the floating toolbars.
- Dialog tab controls support Ctrl+Tab / Ctrl+Shift+Tab to cycle tabs.
- Dialogs are resizable only if explicitly allowed (rare; most Word 95 dialogs are fixed-size).
- Context help (Shift+F1 on a control, or `?` title-bar button) opens a balloon explaining the control.

## Appendix B: Typographic and Layout Constants

- **Default unit**: inches (configurable to cm, mm, points, picas).
- **Default margins**: Top 1", Bottom 1", Left 1.25", Right 1.25", Gutter 0", Header 0.5", Footer 0.5".
- **Default page size**: US Letter (8.5 × 11 in) or A4 (210 × 297 mm) depending on installation locale.
- **Default font**: Times New Roman 10 pt (US English installation); Arial 10 pt on some locales.
- **Default paragraph**: Normal style (Times New Roman 10 pt, Left align, single line spacing, 0 space before/after, widow/orphan control on).
- **Default tab stops**: 0.5" intervals.
- **Default line numbers**: off; when on, count by 1, from text 0.13".
- **Twips**: underlying measure unit. 1 inch = 1440 twips. 1 point = 20 twips. 1 cm ≈ 567 twips.
- **Minimum font size**: 1 pt.
- **Maximum font size**: 1638 pt (Word 95); 1637.5 pt effective (0.5 pt resolution).
- **Maximum document size**: 32 MB (practical before performance becomes unacceptable on 1995-era hardware).
- **Maximum paragraph length**: 32767 characters (signed short field in binary format).
- **Maximum paragraphs per doc**: practically unbounded (>1M possible on beefy hardware).

## Appendix C: Color Palette (16-color)

The standard 16-color palette used for font color, highlight color, line/fill colors:

| Index | Name         | RGB               |
| ----- | ------------ | ----------------- |
| 0     | Auto         | (defer to system) |
| 1     | Black        | 00 00 00          |
| 2     | Blue         | 00 00 FF          |
| 3     | Cyan         | 00 FF FF          |
| 4     | Green        | 00 FF 00          |
| 5     | Magenta      | FF 00 FF          |
| 6     | Red          | FF 00 00          |
| 7     | Yellow       | FF FF 00          |
| 8     | White        | FF FF FF          |
| 9     | Dark Blue    | 00 00 80          |
| 10    | Dark Cyan    | 00 80 80          |
| 11    | Dark Green   | 00 80 00          |
| 12    | Dark Magenta | 80 00 80          |
| 13    | Dark Red     | 80 00 00          |
| 14    | Dark Yellow  | 80 80 00          |
| 15    | Dark Gray    | 80 80 80          |
| 16    | Light Gray   | C0 C0 C0          |

Highlight palette (15 colors + None; introduced Word 95):

| Index | Name         | RGB      |
| ----- | ------------ | -------- |
| 1     | Yellow       | FF FF 00 |
| 2     | Bright Green | 00 FF 00 |
| 3     | Turquoise    | 00 FF FF |
| 4     | Pink         | FF 00 FF |
| 5     | Blue         | 00 00 FF |
| 6     | Red          | FF 00 00 |
| 7     | Dark Blue    | 00 00 80 |
| 8     | Teal         | 00 80 80 |
| 9     | Green        | 00 80 00 |
| 10    | Violet       | 80 00 80 |
| 11    | Dark Red     | 80 00 00 |
| 12    | Dark Yellow  | 80 80 00 |
| 13    | Gray 50%     | 80 80 80 |
| 14    | Gray 25%     | C0 C0 C0 |
| 15    | Black        | 00 00 00 |

## Appendix D: Numbered List Format Strings

The Customize Numbered List dialog and related allow a format string with `%N` placeholders (where N is the level number). Examples:

- `%1.` → `1.`, `2.`, `3.` (simple Arabic period)
- `%1)` → `1)`, `2)`, `3)` (Arabic right-paren)
- `(%1)` → `(1)`, `(2)`, `(3)` (Arabic in parens)
- `%1-%2)` → `1-1)`, `1-2)`, `2-1)` (multilevel with dash)
- `Step %1:` → `Step 1:`, `Step 2:` (labeled)
- `Chapter %1` → `Chapter 1`, `Chapter 2` (chapter numbering)
- `§ %1.%2` → `§ 1.1`, `§ 1.2`, `§ 2.1` (section numbering)

Supported number formats within placeholders:

- `1`, `2`, `3` (Arabic; default)
- `A`, `B`, `C` (uppercase letter)
- `a`, `b`, `c` (lowercase letter)
- `I`, `II`, `III` (uppercase Roman)
- `i`, `ii`, `iii` (lowercase Roman)
- `01`, `02`, `03` (Arabic with leading zero — multi-digit)
- `001`, `002`, `003` (Arabic with two leading zeros)
- `One`, `Two`, `Three` (cardinal text) [verify — may not all be in 95]
- `First`, `Second`, `Third` (ordinal text) [verify]

## Appendix E: Known Edge Cases and Quirks

### Quirks to replicate

- **AutoFormat can't undo fully**: some users find that AutoFormat's applied styles persist after Edit → Undo because only the final document state is undone, and subsequent actions may have committed to the stack. Our implementation should replicate this: AutoFormat creates a single undo entry that reverses all its changes atomically.

- **Save changes to Normal.dot prompt**: every time Normal.dot is modified (e.g., adding an AutoCorrect entry, creating a macro), Word tracks "dirty" on Normal. On exit, if Options → Save → "Prompt to save Normal Template" is on (default), a separate dialog prompts to save or discard Normal changes.

- **Style-based AutoFormat**: when a paragraph is AutoFormatted to a style, the underlying paragraph's direct formatting is cleared. Paragraphs that already had direct formatting lose it unless the style happens to match. This is important to document in our UI warnings.

- **Frame anchors can drift**: if the anchor paragraph is deleted, the frame reparents to the nearest paragraph (often unexpected).

- **Footnote separators per section**: changing the separator in one section applies globally (all footnotes, not per-section). There is a single separator pair for footnotes and endnotes.

- **Line number continuity**: line numbering "Continuous" actually does not renumber across section breaks even if "Continue from previous section" is selected, unless Page Setup → Layout → Line Numbers → Continuous is explicitly set on every section. Common source of confusion.

- **Tab stops at left margin**: Word silently adds default tab stops at the current paragraph's left indent when it has a hanging indent; this can surprise users who set custom tab stops.

- **Header/footer Same as Previous**: toggling this off for one section's header does NOT affect the footer, and vice versa. Must be set separately.

- **Revisions across Undo**: if Revisions marking is on, Undo may not reverse the revision marks themselves (only the edit). Our implementation should match this precisely.

- **Mail merge and Word fields**: NEXT and SKIP in mail merge interact subtly with NEXTIF/SKIPIF. Our implementation should document and replicate.

## Appendix F: WordBasic Compatibility Mapping (selected)

For round-tripping purposes, when a WordBasic macro appears in a document, we record the text verbatim but do not execute. We also maintain a mapping from WordBasic command names to our internal command IDs for documentation/user-facing warnings:

| WordBasic Command         | Our Internal Command       |
| ------------------------- | -------------------------- |
| FileNewDefault            | file.new                   |
| FileOpen                  | file.open                  |
| FileSave                  | file.save                  |
| FileSaveAs                | file.saveAs                |
| FileClose                 | file.close                 |
| FilePrint                 | file.print                 |
| FileExit                  | app.exit                   |
| EditUndo                  | edit.undo                  |
| EditRedo                  | edit.redo                  |
| EditCut                   | edit.cut                   |
| EditCopy                  | edit.copy                  |
| EditPaste                 | edit.paste                 |
| EditClear                 | edit.clear                 |
| EditSelectAll             | edit.selectAll             |
| EditFind                  | edit.find                  |
| EditReplace               | edit.replace               |
| EditGoTo                  | edit.goTo                  |
| EditBookmark              | edit.bookmark              |
| EditAutoText              | edit.autoText              |
| InsertPara                | insert.paragraph           |
| InsertBreak               | insert.break               |
| InsertDateTime            | insert.dateTime            |
| InsertField               | insert.field               |
| InsertFootnote            | insert.footnote            |
| InsertPicture             | insert.picture             |
| InsertObject              | insert.object              |
| InsertSymbol              | insert.symbol              |
| InsertTable               | insert.table               |
| FormatFont                | format.font                |
| FormatParagraph           | format.paragraph           |
| FormatBordersAndShading   | format.bordersAndShading   |
| FormatColumns             | format.columns             |
| FormatChangeCase          | format.changeCase          |
| FormatBulletsAndNumbering | format.bulletsAndNumbering |
| FormatStyle               | format.style               |
| FormatAutoFormat          | format.autoFormat          |
| FormatFrame               | format.frame               |
| Bold                      | format.bold                |
| Italic                    | format.italic              |
| Underline                 | format.underline           |
| WordUnderline             | format.underline.word      |
| DoubleUnderline           | format.underline.double    |
| DottedUnderline           | format.underline.dotted    |
| Strikethrough             | format.strikethrough       |
| Hidden                    | format.hidden              |
| SmallCaps                 | format.smallCaps           |
| AllCaps                   | format.allCaps             |
| Superscript               | format.superscript         |
| Subscript                 | format.subscript           |
| TableInsertTable          | table.insert               |
| TableInsertRow            | table.insertRow            |
| TableDeleteRow            | table.deleteRow            |
| TableMergeCells           | table.mergeCells           |
| TableSplitCells           | table.splitCells           |
| TableSort                 | table.sort                 |
| TableFormula              | table.formula              |
| TableAutoFormat           | table.autoFormat           |
| ToolsSpelling             | tools.spelling             |
| ToolsGrammar              | tools.grammar              |
| ToolsThesaurus            | tools.thesaurus            |
| ToolsHyphenation          | tools.hyphenation          |
| ToolsWordCount            | tools.wordCount            |
| ToolsAutoCorrect          | tools.autoCorrect          |
| ToolsMacro                | tools.macro                |
| ViewNormal                | view.normal                |
| ViewOutline               | view.outline               |
| ViewPage                  | view.pageLayout            |
| ViewMasterDocument        | view.masterDocument        |
| ViewZoom                  | view.zoom                  |
| ViewFullScreen            | view.fullScreen            |
| ViewFieldCodes            | view.fieldCodes            |
| CharLeft                  | nav.charLeft               |
| CharRight                 | nav.charRight              |
| WordLeft                  | nav.wordLeft               |
| WordRight                 | nav.wordRight              |
| LineUp                    | nav.lineUp                 |
| LineDown                  | nav.lineDown               |
| StartOfLine               | nav.startOfLine            |
| EndOfLine                 | nav.endOfLine              |
| StartOfDocument           | nav.startOfDocument        |
| EndOfDocument             | nav.endOfDocument          |
| ParaUp                    | nav.paragraphUp            |
| ParaDown                  | nav.paragraphDown          |
| ExtendSelection           | nav.extendSelection        |
| ShrinkSelection           | nav.shrinkSelection        |
| SelectCurWord             | nav.selectWord             |
| SelectCurSent             | nav.selectSentence         |
| SelectCurPara             | nav.selectParagraph        |

(Full mapping: all ~900 commands catalogued in a separate `wordbasic-commands.json` reference to be produced during implementation. The list above is representative of the top 100 most commonly macro'd commands.)

## Appendix G: Status Bar Visuals (pixel-exact)

The status bar is 22 pixels tall, using the default Windows 95 system font (Small Fonts 8-point, or Microsoft Sans Serif depending on display DPI). Dividers between regions are 1-pixel-wide 3D-inset bars.

Left to right (typical Page Layout view):

| Region            | Typical Width | Text                         |
| ----------------- | ------------- | ---------------------------- |
| Page number       | 60 px         | `Page 3`                     |
| Section number    | 50 px         | `Sec 1`                      |
| Total pages       | 40 px         | `3/12`                       |
| Vertical position | 60 px         | `At 4.5"`                    |
| Line number       | 30 px         | `Ln 17`                      |
| Column number     | 30 px         | `Col 42`                     |
| REC               | 25 px         | gray/dark `REC`              |
| MRK               | 25 px         |                              |
| EXT               | 25 px         |                              |
| OVR               | 25 px         |                              |
| WPH               | 25 px         |                              |
| Book icon         | 18 px         | background spellcheck status |
| (flexible space)  | \*            |                              |

All regions are clickable (REC opens Record Macro dialog; MRK/EXT/OVR/WPH toggle; position regions open Go To; book icon toggles background spelling).

## Appendix H: Menu Mnemonic Collisions (disambiguation)

To avoid mnemonic conflicts across the 9 menus, Word 95 assigns unique access letters within each submenu. Cross-submenu duplicates are allowed (e.g., `&File` vs `&Format` — F is used in File, O in Format).

Menu-bar mnemonics:

| Menu   | Mnemonic |
| ------ | -------- |
| File   | F        |
| Edit   | E        |
| View   | V        |
| Insert | I        |
| Format | O        |
| Tools  | T        |
| Table  | A        |
| Window | W        |
| Help   | H        |

Note Format uses "O" because "F" is taken by File.

## Appendix I: Error Messages to Replicate

Exact text of commonly-seen Word 95 error dialogs:

- "The disk is full. Save the document to a different disk or remove unneeded files." (title: "Microsoft Word")
- "This action cannot be completed because the {filename} file is in use. Close the file and try again." (title: "Microsoft Word")
- "Word cannot save or create this file. The disk may be full or write-protected. Try one or more of the following: _ Free more memory. _ Make sure the disk you want to save the file on is not full, write-protected, or damaged. (Save)"
- "Do you want to save the changes you made to {filename}?" — Yes / No / Cancel.
- "Changes have been made that affect the global template, Normal.dot. Do you want to save those changes?" — Yes / No.
- "Word cannot open this document. The file may be damaged or in a format Word cannot open." (title: "Microsoft Word")
- "The selection contains revision marks. Do you want to accept all of the revisions before continuing?" (when running Mail Merge or certain conversions).
- "This password is too long. Passwords can be up to 15 characters long."
- "The password is incorrect. Word cannot open the document."
- "This feature is not available on computers with the minimum installation of Word. To use this feature, install Word from the Office CD-ROM." (for features in a non-Compact installation).

## Appendix J: Zoom Levels

Preset zoom values in the Zoom combobox and in the View → Zoom dialog:

- 200%, 150%, 100%, 75%, 50%, 25%, 10%
- Page Width (fits page width to visible area)
- Whole Page (Page Layout view; fits entire page in window)
- Two Pages (Page Layout view)
- Many Pages (Page Layout view; drop-down to choose grid up to 6×3)

Allowed range: 10% to 500% (type a value to zoom within the range).

## Appendix K: Keyboard Modifier Pattern

Word 95 uses a consistent modifier scheme for command patterns:

- **No modifier**: base action (e.g., arrow keys = navigate).
- **Shift**: extend selection.
- **Ctrl**: act on larger unit (word instead of character; paragraph instead of line).
- **Ctrl+Shift**: extend selection at larger-unit scale.
- **Alt**: menu invocation, column selection, special operations.
- **Ctrl+Alt**: miscellaneous special operations (apply heading style, switch view, special characters).
- **Ctrl+Shift+Alt**: reserved mostly for user-defined.

Function keys:

- **F1**: help.
- **F2**: start selection move (press to enter move mode; arrows to position; Enter to drop).
- **F3**: AutoText expand.
- **F4**: Repeat last action.
- **F5**: Go To.
- **F6**: next pane.
- **F7**: Spelling.
- **F8**: Extend selection.
- **F9**: Update field.
- **F10**: activate menu bar.
- **F11**: next field.
- **F12**: Save As.

Each function key can be modified by Shift (reverse/alt), Ctrl (bigger), Alt (menu-like), or combinations for specialized commands.

## Appendix L: Default File Locations

On a standard Office 95 Professional installation (Windows 95):

- **Program files**: `C:\MSOffice\Winword\` (WinWord.exe and internal DLLs).
- **Shared components**: `C:\MSOffice\Shared\` (graphics filters, OLE servers, converters).
- **Proofing tools**: `C:\MSOffice\Shared\Proof\` (spelling dictionaries, thesaurus, grammar).
- **Templates (per-user)**: `C:\Windows\MSApps\Templates\` (under Windows 95's MSApps folder).
- **Global templates**: in the Startup folder under the templates folder.
- **User dictionaries**: `C:\MSOffice\ProofFold\CUSTOM.DIC`.
- **Registry root**: `HKEY_CURRENT_USER\Software\Microsoft\Office\7.0\Word\Options`.
- **Word macros/config**: stored inside Normal.dot.

## Appendix M: Printer Driver Interaction

Word 95 uses the Windows 95 GDI printing API. Features depending on the driver:

- Paper size list: driver-provided.
- Trays and manual feed options: driver-provided (in Page Setup → Paper Source and Print → Properties).
- Duplex printing: driver-dependent.
- Color/B&W modes: driver choice.
- Resolution (dpi): driver reports; some Word features (e.g., 1-pt hairline rendering) depend on resolution.
- TrueType font embedding: Word 95 supports embedding TTF into printer spool (Options → Save → Embed TrueType Fonts for doc; Print driver also needs to support this).

## Appendix N: Error-Recovery UX

### File Open Error

- If Word cannot parse a file (wrong format, corrupted), shows a dialog offering "Recover Text from Any File" as a fallback.
- If the document has a protection password, prompts for it twice.

### Save Error

- Disk full: error with options to try alternate path.
- Read-only file: "The file {name} is read-only. Save as another name?"
- File in use: "The file {name} is in use by another user. Save as another name or notify you when available."

### Crash Recovery

- AutoSave files (`.asd`) written periodically during editing.
- On relaunch after unclean shutdown, Word detects them and opens with a "Document1 (Recovered)" state.
- User accepts (save as) or discards.

## Appendix O: Accessibility (Word 95)

Word 95 offered limited accessibility compared to modern apps:

- High Contrast mode: honors Windows 95 high-contrast theme colors.
- Sticky Keys / Mouse Keys: honors Windows 95 accessibility options.
- Screen readers: requires add-on (Microsoft Accessibility Utility); Word 95 does not speak content natively.
- Keyboard-only operation: fully supported via menu mnemonics and function keys.
- Magnifier: system magnifier works; Word has its own Zoom.
- Cursor blink rate: honors system setting.

Our implementation should exceed Word 95's accessibility: ARIA roles on all interactive regions, full keyboard navigation with visible focus indicators, screen reader announcements for caret movement and selection changes, live regions for status bar updates.

## Appendix P: Internationalization

Word 95 was localized to ~40 languages. Internationalization features:

- UI language determined by installation (one language per install).
- Document language determined by paragraph-level Language setting; multiple languages per document supported.
- Regional number formats: honored in fields (`DATE`, currency in `=` fields) based on the paragraph's language.
- Direction: Word 95 is LTR-only. Right-to-left (Hebrew/Arabic) requires a separate RTL version of Word (distinct SKU).
- Unicode: Word 95 supports Unicode internally in most code paths, but saves to a Code-Page-tagged binary (Win 1252, CP932, etc.) depending on language.
- Far East Features: Word 95 (Asian editions) supports ruby text, vertical text, 2-byte character sets, IMEs, furigana — but not in the US/European edition.

Our implementation should support Unicode throughout and offer a minimum of LTR + RTL layout, multiple UI languages, proper Asian-language line-breaking (optional phase).

## Appendix Q: Performance Expectations (1995 hardware baseline)

Word 95 target performance on a 486DX-66 with 8 MB RAM:

- Startup: ≤ 8 seconds.
- Open a 50-page document: ≤ 3 seconds.
- Scroll page-up/page-down: ≤ 0.5 seconds response.
- Switch Normal → Page Layout: ≤ 2 seconds.
- Save: ≤ 2 seconds for a 50-page document.
- Print spool (to printer): ≤ 10 seconds.
- Spelling check (1000 words): ≤ 3 seconds.
- Background repagination: runs in idle time; completes within 10 seconds after major edits.

Our implementation targets significantly better performance on 2025+ hardware — document size up to 1000 pages should not noticeably slow down the editor.

## Appendix R: Concurrency and Locking (Word 95)

- Word 95 is single-threaded (Win32 apartment).
- While modal dialogs are open, the document is non-interactive.
- Background spell-check is "cooperative" (runs during idle; pauses on user input).
- File locks: Word 95 uses Windows 95 share-mode "deny-write" to prevent two users from editing the same file concurrently. If a second user opens a locked file, they see a read-only notification.
- No real-time collaboration.

Our implementation will support multiple concurrent editors via CRDT or OT layers, but base behavior for a single-user session must match Word 95's responsiveness and single-active-document feel.

## Appendix S: Event Model and Hooks (for round-trip fidelity)

When parsing a document containing WordBasic macros, we record:

- Each macro's name and full source.
- Its "auto" qualifier (AutoExec/AutoOpen/AutoClose/AutoNew/AutoExit).
- Its assignment to key combinations, toolbar buttons, or menu items.
- Its storage location (Normal.dot vs document vs attached template).

On export, these are preserved as-is. Modern users of the exported document will not see macros running — only the stored text is preserved.

## Appendix T: Summary Info vs Document Properties

Word 95 uses the term **Summary Info** consistently. The dialog is labeled "Summary Info". The term "Document Properties" is a Word 97+ label we must suppress in UI elements intended to reflect Word 95 behavior.

Fields (exact list, Word 95):

- Title
- Subject
- Author
- Keywords
- Comments

Additional read-only statistics (shown on the Statistics tab):

- Created date/time
- Modified date/time
- Printed date/time
- Last saved by
- Revision number
- Total editing time
- Number of pages
- Number of words
- Number of characters
- Number of paragraphs
- Number of lines

## Appendix U: Specific Word 95 Behaviors Worth Mentioning

- **Repagination hint**: while typing, Word 95 does a "fast" repagination of just the paragraphs near the insertion point. Full repagination runs in idle time; status bar's MRK/REC/EXT/OVR region shows a small "Repaginating" text briefly when this happens.

- **Smart quote conversion** respects the current language's quote style (US: "double" and 'single'; French: « guillemets »; German: „double").

- **AutoText F3 behavior**: type the name, press F3. If ambiguous (multiple entries share a prefix), the most recent is inserted; user can undo and try typing more characters.

- **Paste default**: paste from Word preserves all formatting. Paste from other apps usually pastes as Formatted Text (RTF). Paste Special offers explicit control.

- **Drag-to-move vs drag-to-copy**: default drag moves text; Ctrl+drag copies. This is the reverse of Windows' default for files, a common source of confusion.

- **Format Painter latch**: single-click the paintbrush copies formatting from the current selection and latches for one paste. Double-click latches for multiple pastes until the user presses Esc or clicks the paintbrush again.

- **Undo depth**: effectively unlimited within available memory (tested ~10,000 actions on a beefy 486). Not cleared by Save.

- **Fields auto-update on print**: if Options → Print → Update Fields is on, fields are refreshed before each print.

- **Hyperlink navigation**: Ctrl+click follows a hyperlink field. Click without Ctrl places caret inside the field's display text — does NOT navigate (this is safety-first design).

- **Section break markers**: in Normal view, section breaks render as a double-dotted horizontal rule with text `End of Section` or `End of Section (Continuous)`. In Page Layout, section breaks are not visible — the new page (or continued page) just appears at the right moment.

- **Table column lines**: non-printing gridlines are a different color from actual borders. Gridlines are always thin gray; borders are as-set by the user.

## Appendix V: A Note on OOXML Round-Trip

Several Word 95 features have no native OOXML element and require careful mapping:

- **WordBasic macros**: there is no `vbaProject.bin` equivalent for WordBasic. We preserve the text in a custom XML part (`word/macros/wordbasic.xml`) that we read on re-open and emit as inert data. Not executable.

- **OLE 1.x servers**: some Word 95 OLE objects are OLE 1 (not OLE 2). DOCX supports OLE 2 objects via `word/embeddings/*.bin`. We must upgrade OLE 1 to OLE 2 "packager" objects for round-trip.

- **Custom binary fields**: a few `{ PRIVATE }` fields carry version-specific data. We preserve these as-is via a `custom-field` extension element.

- **Word 95 compatibility flags**: store under `w:compat` with `w:customCompatibilityFlags` extension.

- **Frame properties**: map to `w:framePr` within `w:pPr`. Most Word 95 frame semantics preserve cleanly.

- **Annotations (Word 95) vs Comments (modern)**: OOXML calls them Comments. Preserve initials and author.

- **Revisions (Word 95) vs Tracked Changes**: OOXML calls them `w:ins`, `w:del`, `w:rPrChange`, `w:pPrChange`. Word 95 revisions lacked "Revised Formatting" — we must not emit `w:rPrChange` for documents that are Word 95-only.

Our binding layer must document every mapping and test round-trip on a corpus of sample Word 95 documents.

## Appendix W: The Default Toolbar Configuration (pixel visual)

Illustrated default toolbar arrangement on a 1024×768 display:

```
[Menu Bar: File Edit View Insert Format Tools Table Window Help    _ ⊡ X]
[Standard: [New][Open][Save][Print][PrintPrev][Spelling] | [Cut][Copy][Paste][FormatPainter] | [Undo▼][Redo▼] | [AutoFormat][InsAddress][InsTable][InsExcel][Columns][Drawing] | [ShowHide¶][Zoom▼][TipWiz][Help]]
[Formatting: [Style▼: Normal][Font▼: Times New Roman][Size▼: 10] | [B][I][U] | [Left][Center][Right][Justify] | [Numbering][Bullets][DecIndent][IncIndent] | [Borders] | [Highlight▼][FontColor▼]]
[ Ruler: |L|.....│.....│.....│.....│.....│.....│   with margin bars ]
```

## Appendix X: Command Catalog

Every command in Word 95's Customize → Commands category list. Organized by category matching the Customize dialog:

### Categories (from Customize → Toolbars/Menus/Keyboard tabs)

- File
- Edit
- View
- Insert
- Format
- Tools
- Table
- Window and Help
- Drawing
- Borders
- Mail Merge
- Forms
- AutoText
- Fonts
- AllCommands
- Macros
- Styles
- Built-in Menus

Each category contains commands matching the menu structure described earlier, plus additional commands not on the default menus (reachable only via Customize or Alt+X keyboard assignments).

### AllCommands Category (partial — the complete list is ~1100 commands)

This is the "expert" category showing every named command. Examples include:

- AcceptAllChangesInDoc
- AcceptAllChangesShown
- AcceptChangesSelected
- AlignDrawingObjectsBottom
- AlignDrawingObjectsCenter
- AlignDrawingObjectsLeft
- AlignDrawingObjectsMiddle
- AlignDrawingObjectsRight
- AlignDrawingObjectsTop
- AllCaps
- AnnotationDelete
- AppActivate
- AppClose
- AppInfo
- AppMaximize
- AppMinimize
- AppMove
- AppRestore
- AppSize
- Assistant
- AutoCaption
- AutoCorrect
- AutoCorrectExceptions
- AutoFormat
- AutoFormatBegin
- AutoFormatDocument
- AutoFormatEnd
- AutoFormatRejectAllChanges
- AutoMark
- AutoScroll
- AutoSum
- AutoText
- Backspace
- Bold
- BookmarkDelete
- BookmarkGoto
- BorderAll
- BorderBottom
- BorderInside
- BorderLeft
- BorderNone
- BorderOutside
- BorderRight
- BorderTop
- BottomBorder
- BreakParagraph
- CancelSpellingAndGrammar
- Cascade
- ChangeCase
- CharLeft
- CharRight
- CheckErrors
- CheckGrammar
- CheckSyntax
- ClearFormatting
- ClosePane
- ColumnBreak
- ColumnSelect
- CommaAccent
- ContextHelp
- CopyFormat
- CopyText
- CountWords
- CreateSubDocument
- CrossReference
- Ctrl+Enter key synonym (InsertPageBreak)
- CurrencyAccent
- CustomColor
- CustomizeAddMenuShortcut
- CustomizeKeyboardShortcut
- CustomizeRemoveMenuShortcut
- Cut
- DashLinesStyle
- DateField
- DefaultFileOptions
- DeleteAllComments
- DeleteAnnotation
- DeleteBackWord
- DeleteSubDocument
- DeleteWord
- DemoteList
- DeselectAll
- DisableMacros
- DistributeHorizontally
- DistributeVertically
- DocClose
- DocMaximize
- DocMinimize
- DocMove
- DocRestore
- DocSize
- DocSplit
- DoFieldClick
- DottedUnderline
- DoubleUnderline
- Down
- DoYellowFill
- DrawAlign
- DrawBringInFrontOfText
- DrawBringToFront
- DrawCallout
- DrawDuplicate
- DrawEllipse
- DrawExtendSelect
- DrawFlipHorizontal
- DrawFlipVertical
- DrawFreeform
- DrawGridOptions
- DrawGroup
- DrawLine
- DrawMovePoint
- DrawRectangle
- DrawRegroup
- DrawRotateLeft
- DrawRotateRight
- DrawSendBackward
- DrawSendBehindText
- DrawSendToBack
- DrawSetFillTransparent
- DrawSetInsertAnchor
- DrawSetLineTransparent
- DrawShadow
- DrawSnapToGrid
- DrawTextBox
- DrawUngroup
- DrawUnselectSelectedObjects
- EarlierDisplayScroll
- EditAutoText
- EditBookmark
- EditClear
- EditCopy
- EditCopyAsPicture
- EditCut
- EditDataSource
- EditFind
- EditGoTo
- EditLinks
- EditObject
- EditPaste
- EditPasteAsHyperlink
- EditPasteSpecial
- EditPicture
- EditRedo
- EditRepeat
- EditReplace
- EditSelectAll
- EditSwapAllNotes
- EditTOACategory
- EditUndo
- ElementFormatFont
- ElementFormatParagraph
- ElementFormatTabStops
- EndOfColumn
- EndOfDocExtend
- EndOfDocument
- EndOfLine
- EndOfLineExtend
- EndOfRow
- EndOfRowExtend
- EndOfWindow
- EndOfWindowExtend
- EnhVerticalLineUp
- EnvelopeSetup
- EquationZoom
- EscKey
- Examples
- ExchangeSendMessage
- ExitEqMode
- ExtendSelection
- FieldShading
- FileClose
- FileCloseAll
- FileCloseOrCloseAll
- FileConfirmConversions
- FileExit
- FileFind
- FileNew
- FileNewDefault
- FileOpen
- FilePageSetup
- FilePost
- FilePrint
- FilePrintDefault
- FilePrintPreview
- FilePrintPreviewFullScreen
- FilePrintSetup
- FileRoutingSlip
- FileSave
- FileSaveAll
- FileSaveAs
- FileSendMail
- FileSummaryInfo
- FileTemplates
- FileVersions
- FindFont
- FindHyperlink
- FitText
- FontSizeSelect
- FootnoteReferenceMark
- FootnoteSepChangeMode
- FootnotesEndnotes
- FormatAutoFormat
- FormatAutoFormatBegin
- FormatAutoFormatEnd
- FormatBordersAndShading
- FormatBullet
- FormatBulletDefault
- FormatBulletsAndNumbering
- FormatCallout
- FormatChangeCase
- FormatColumns
- FormatDefineChar
- FormatDefineStyle
- FormatDefineStyleBorders
- FormatDefineStyleFont
- FormatDefineStyleFrame
- FormatDefineStyleLang
- FormatDefineStyleNumbers
- FormatDefineStylePara
- FormatDefineStyleTabs
- FormatDrawingObject
- FormatDropCap
- FormatFont
- FormatFontName
- FormatFontNameSelect
- FormatFontSize
- FormatFontSizeSelect
- FormatFrame
- FormatHeadingNumber
- FormatMultilevel
- FormatNumber
- FormatNumberDefault
- FormatPage
- FormatPageNumber
- FormatPagesetupLayout
- FormatPagesetupMargins
- FormatPagesetupPaper
- FormatPagesetupPaperSource
- FormatParagraph
- FormatPicture
- FormatRetAddrFonts
- FormatStyle
- FormatStyleGallery
- FormatStyleSelect
- FormatTabs
- FrameProperties
- FreeformStyleEditBegin
- FreeformStyleEditEnd
- Go
- GoBack
- GoToFirstMergeRecord
- GoToHeaderFooter
- GoToLastMergeRecord
- GoToMergeRecord
- GoToNextMergeRecord
- GoToNextPage
- GoToNextSection
- GoToPreviousMergeRecord
- GoToPreviousPage
- GoToPreviousSection
- GoToRecord1
- GrowFont
- GrowFontOnePoint
- HangingIndent
- HanjaDict
- HeaderFooterInsertAutoText
- HeaderFooterLink
- HelpAbout
- HelpAnswerWizard
- HelpContextHelp
- HelpContents
- HelpIndex
- HelpMSN
- HelpMSNetwork
- HelpQuickPreview
- HelpSearch
- HelpTechSupport
- HelpTipOfTheDay
- HelpTool
- HelpUsingHelp
- HelpWordPerfectHelp
- HelpWordPerfectHelpOptions
- HiddenText
- HideSpellingErrors
- HideTitle
- Highlight
- HighlightWord
- HomeKey
- HTML tag (variants…)
- Hyphenation
- IndentChar
- InsertAddCaption
- InsertAddress
- InsertAnnotation
- InsertAutoCaption
- InsertAutoText
- InsertAutoTextList
- InsertBookmark
- InsertBreak
- InsertCaption
- InsertCaptionNumbering
- InsertCells
- InsertChartTitle
- InsertColumn
- InsertColumns
- InsertColumnBreak
- InsertCrossReference
- InsertDatabase
- InsertDateField
- InsertDateTime
- InsertEndnote
- InsertEndnoteNow
- InsertEquation
- InsertExcelTable
- InsertField
- InsertFieldChars
- InsertFile
- InsertFootnote
- InsertFootnoteNow
- InsertFormField
- InsertFrame
- InsertHeaderAutoText
- InsertHyperlink
- InsertIndex
- InsertIndexAndTables
- InsertLink
- InsertListNumField
- InsertMergeField
- InsertNumber
- InsertObject
- InsertPageBreak
- InsertPageField
- InsertPageNumbers
- InsertPara
- InsertPicture
- InsertPictureBullet
- InsertRow
- InsertRows
- InsertSectionBreak
- InsertSubdocument
- InsertSymbol
- InsertTable
- InsertTableOfAuthorities
- InsertTableOfContents
- InsertTableOfFigures
- InsertTimeField
- InsertVoiceAnnotation
- InsertWordField
- InsertWordArt
- Italic
- JumpHyperlink
- Justify
- LabelOptions
- LeftPara
- LicenseInfo
- LineDown
- LineDownExtend
- LineUp
- LineUpExtend
- ListCommands
- ListCommandsCurrent
- Lowercase
- MailMerge
- MailMergeAskToConvertChevrons
- MailMergeCheck
- MailMergeConvertChevrons
- MailMergeCreateDataSource
- MailMergeCreateHeaderSource
- MailMergeCreateMainDocument
- MailMergeDataForm
- MailMergeDataSource
- MailMergeEditDataSource
- MailMergeEditMainDocument
- MailMergeFindRecord
- MailMergeFirstRecord
- MailMergeGoToRecord
- MailMergeHelper
- MailMergeInsertAsk
- MailMergeInsertFillIn
- MailMergeInsertIf
- MailMergeInsertMergeRec
- MailMergeInsertMergeSeq
- MailMergeInsertNext
- MailMergeInsertNextIf
- MailMergeInsertSet
- MailMergeInsertSkipIf
- MailMergeLastRecord
- MailMergeNextRecord
- MailMergeOpenDataSource
- MailMergeOpenHeaderSource
- MailMergePreviousRecord
- MailMergePropagateLabel
- MailMergeQueryOptions
- MailMergeResults
- MailMergeState
- MailMergeToDoc
- MailMergeToPrinter
- MailMergeUseAddressBook
- MailMergeViewData
- MailMergeWizard
- MakeSubDoc
- MarkCitation
- MarkIndexEntry
- MarkTableOfContentsEntry
- MenuMode
- MenuModeExit
- Merge
- MergeSubDoc
- MicrosoftAccess
- MicrosoftExcel
- MicrosoftFoxPro
- MicrosoftMail
- MicrosoftPowerPoint
- MicrosoftProject
- MicrosoftPublisher
- MicrosoftSchedule
- MicrosoftSystemInfo
- MoveText
- NewDefault
- NewPageOrColumnBreak
- NextCell
- NextChangeOrComment
- NextField
- NextMisspelling
- NextObject
- NextPage
- NextPane
- NextSection
- NextWindow
- NormalFontPosition
- NormalFontSpacing
- NormalStyle
- NormalViewHeaderArea
- OfficeOnMicrosoftCom
- OK
- OpenOrCloseUpPara
- OpenUpPara
- OptionsAutoFormat
- OptionsCompatibility
- OptionsEdit
- OptionsFileLocations
- OptionsGeneral
- OptionsGrammar
- OptionsPrint
- OptionsRevisions
- OptionsSave
- OptionsSpelling
- OptionsUserInfo
- OptionsView
- OtherPane
- OutlineCollapse
- OutlineDemote
- OutlineDemoteBody
- OutlineExpand
- OutlineMoveDown
- OutlineMoveUp
- OutlineOrSubDoc
- OutlinePromote
- OutlineShowAllHeadings
- OutlineShowFirstLine
- OutlineShowFormat
- OutlineShowHeading1
- OutlineShowHeading2
- OutlineShowHeading3
- OutlineShowHeading4
- OutlineShowHeading5
- OutlineShowHeading6
- OutlineShowHeading7
- OutlineShowHeading8
- OutlineShowHeading9
- Overtype
- PageBreak
- PageDown
- PageDownExtend
- PageSetup
- PageUp
- PageUpExtend
- ParaDown
- ParaDownExtend
- ParaKeepLinesTogether
- ParaKeepWithNext
- ParaPageBreakBefore
- ParaUp
- ParaUpExtend
- ParaWidowOrphanControl
- Paste
- PasteAsHyperlink
- PasteAsPicture
- PasteAsSpecialFormat
- PasteFormat
- PauseRecorder
- Preview
- PrevCell
- PrevChangeOrComment
- PrevField
- PrevObject
- PrevPane
- PrevSection
- PrevWindow
- Print
- PrintDefault
- PrintPreview
- PrintPreviewFullScreen
- PrintPreviewPage
- PromoteList
- ProtectCurSection
- ProtectDocument
- PrtPrvwBarClose
- PrtPrvwBarHelp
- PrtPrvwBarMagnifier
- PrtPrvwBarMultiPage
- PrtPrvwBarOnePage
- PrtPrvwBarPrint
- PrtPrvwBarRuler
- PrtPrvwBarShrinkToFit
- PrtPrvwBarViewFullScreen
- PrtPrvwBarViewZoomPercent
- ProofreadDialog
- Redo
- RedoOrRepeat
- RejectAllChangesInDoc
- RejectAllChangesShown
- RejectChangesSelected
- RemoveAllConditionalPrompts
- RemoveBulletsNumbers
- RemoveFrames
- RemoveSubdocument
- Repaginate
- Repeat
- RepeatFind
- ReplaceAll
- ResetChar
- ResetNoteSepOrNotice
- ResetPara
- ResetStyle
- ResetTOA
- ResetTOC
- ReSizePicture
- RevealFormatting
- ReviewAcceptChange
- ReviewAcceptChangeAll
- ReviewChange
- ReviewChangeAll
- ReviewRejectChange
- ReviewRejectChangeAll
- Revisions
- RevisionsAcceptAll
- RevisionsAcceptRejectDialog
- RevisionsCompareDocuments
- RevisionsCompareMerge
- RevisionsMark
- RevisionsOption
- RevisionsRejectAll
- RightPara
- RulerMode
- RunExcelWorkbook
- Save
- SaveAll
- SaveAs
- SaveTemplate
- SavePropertiesWithFile
- ScrollDown
- ScrollLeft
- ScrollRight
- ScrollUp
- SearchListBox
- SectionBreakContinuous
- SectionBreakEvenPage
- SectionBreakNextPage
- SectionBreakOddPage
- SectionBreaks
- SelectAll
- SelectCurAlignment
- SelectCurColor
- SelectCurFont
- SelectCurIndent
- SelectCurSentence
- SelectCurSpacing
- SelectCurTabs
- SelectCurWord
- SelectCurrentHeading
- SelectDrawingObjects
- SelectSimilarFormatting
- SelectTable
- SendBehindText
- SendBy
- SendInFrontOfText
- SendToBack
- SentLeft
- SentLeftExtend
- SentRight
- SentRightExtend
- SettingsAudioVisual
- ShadingPattern
- ShiftTab
- ShowAll
- ShowAllHeadings
- ShowClipboard
- ShowFieldCodes
- ShowFormatting
- ShowHeading1
- ShowHeading2
- ShowHeading3
- ShowHeading4
- ShowHeading5
- ShowHeading6
- ShowHeading7
- ShowHeading8
- ShowHeading9
- ShowHelp
- ShowHideTableGridlines
- ShowNextHeaderFooter
- ShowPageOrColumnBreaks
- ShowPrevHeaderFooter
- ShowRepeatCommand
- ShowRevisions
- ShowRevisionsOnScreen
- ShowRevisionsWhenPrinting
- ShowSpelling
- ShrinkFont
- ShrinkFontOnePoint
- SmallCaps
- SortColumn
- SortAscending
- SortDescending
- SortHeadings
- SortList
- SortText
- SortTable
- Space1
- Space15
- Space2
- SpacePara1
- SpacePara15
- SpacePara2
- SplitTableRow
- SplitSubDoc
- StartOfColumn
- StartOfDoc
- StartOfDocExtend
- StartOfLine
- StartOfLineExtend
- StartOfRow
- StartOfRowExtend
- StartOfWindow
- StartOfWindowExtend
- StopRecorder
- Strikethrough
- Style
- StyleArea
- StyleByExample
- StyleDialog
- StyleGallery
- StyleSeparator
- Subscript
- Superscript
- SupportForOutlook
- SwapAllNotes
- SwitchMergeIn
- SymbolDocument
- SymbolFont
- SymbolFontSelect
- TabControl
- TabKey
- TableAutoFit
- TableAutoFormat
- TableColumnWidth
- TableDeleteCells
- TableDeleteColumn
- TableDeleteRow
- TableDeleteTable
- TableDistributeColumnsEvenly
- TableDistributeRowsEvenly
- TableFormula
- TableGridlines
- TableHeadings
- TableInsertCells
- TableInsertColumn
- TableInsertColumnRight
- TableInsertRow
- TableInsertRowBelow
- TableInsertTable
- TableMergeCells
- TableProperties
- TableRowHeight
- TableSelectColumn
- TableSelectRow
- TableSelectTable
- TableSort
- TableSortAToZ
- TableSortZToA
- TableSplit
- TableSplitCells
- TableText
- TableToOrFromText
- TableWizard
- TextBox
- TextBoxAutoFit
- TextBoxLinkBreak
- TextBoxLinkSet
- TextFormField
- Thesaurus
- TileH
- TileV
- Time
- ToggleCharacterCode
- ToggleFieldDisplay
- ToggleFull
- ToggleHeaderFooterLink
- ToggleMainTextLayer
- ToggleMasterSubDocs
- ToggleMax
- ToolsAddressBook
- ToolsAutoCorrect
- ToolsAutoManage
- ToolsCalculate
- ToolsCompareDocuments
- ToolsCreateEnvelope
- ToolsCreateLabels
- ToolsCustomize
- ToolsCustomizeKeyboard
- ToolsCustomizeMenuBar
- ToolsCustomizeMenus
- ToolsCustomizeToolbars
- ToolsDevOnline
- ToolsEnvelopesAndLabels
- ToolsGrammar
- ToolsGrammarHide
- ToolsHyphenation
- ToolsHyphenationManual
- ToolsLanguage
- ToolsMacro
- ToolsManageFields
- ToolsMergeRevisions
- ToolsMergeRevisionsOpen
- ToolsOptions
- ToolsOptionsAutoFormat
- ToolsOptionsCompatibility
- ToolsOptionsEdit
- ToolsOptionsFileLocations
- ToolsOptionsGeneral
- ToolsOptionsGrammar
- ToolsOptionsPrint
- ToolsOptionsRevisions
- ToolsOptionsSave
- ToolsOptionsSpelling
- ToolsOptionsUserInfo
- ToolsOptionsView
- ToolsProtectDocument
- ToolsProtectSection
- ToolsProtectUnprotectDocument
- ToolsReviewRevisions
- ToolsRevisionMarks
- ToolsRevisionMarksAccept
- ToolsRevisionMarksNext
- ToolsRevisionMarksPrev
- ToolsRevisionMarksReject
- ToolsRevisionMarksToggle
- ToolsShrinkToFit
- ToolsSpelling
- ToolsSpellingHide
- ToolsSpellingRecheckDocument
- ToolsThesaurus
- ToolsUnprotectDocument
- ToolsWordCount
- ToolsWordRecords
- TopAlign
- TopLine
- TranslateChinese
- TranslateCJK
- TypeBackward
- TypeDbcs
- TypeEnter
- TypeLineBreak
- TypeParagraph
- UlinedTabs
- Underline
- UnHide
- UnLink
- Unthread
- UpBar
- Update
- UpdateIndex
- UpdateSource
- Uppercase
- UseCanonicalOrder
- VerticalLineDown
- VerticalLineUp
- VerticalPageDown
- VerticalPageUp
- VerticalParaDown
- VerticalParaUp
- ViewAll
- ViewAnnotations
- ViewBorderToolbar
- ViewDatabaseToolbar
- ViewDraft
- ViewDrawingToolbar
- ViewFieldCodes
- ViewFooter
- ViewFormsToolbar
- ViewFullScreen
- ViewHeader
- ViewMailMergeDataSource
- ViewMailMergeToolbar
- ViewMasterDocument
- ViewMicrosoftToolbar
- ViewMenus
- ViewNormal
- ViewOnline [not in 95]
- ViewOutline
- ViewPage
- ViewRuler
- ViewShowAll
- ViewStandardToolbar
- ViewStatusBar
- ViewTipWizard
- ViewToggleMasterDocument
- ViewToggleToolbar
- ViewToolbars
- ViewZoom
- ViewZoom100
- ViewZoom200
- ViewZoom75
- ViewZoomPageWidth
- ViewZoomWholePage
- VoiceAnnotation
- WebAddHyperlink
- WebGoBack
- WebGoForward
- WebGoHyperlink
- WebHomePage
- WebOpenHyperlink
- WebOpenSearchPage
- WebOpenStartPage
- WebOptions
- WebQueryEditing [not in 95]
- WindowArrangeAll
- WindowList
- WindowNewWindow
- WindowSplitNoDialog
- WordCount
- WordLeft
- WordLeftExtend
- WordRight
- WordRightExtend
- WordUnderline
- WrapToWindow

(The AllCommands category in Word 95 contains additional commands not listed here. The complete list is accessible via the Customize dialog and via the macro `ListCommands` which outputs a document of all commands and their current keyboard assignments.)

## Appendix Y: Specific "What's Different" Notes vs Word 6.0

To help separate Word 95 from its predecessor Word 6.0:

| Feature                                      | Word 6.0                     | Word 95                                |
| -------------------------------------------- | ---------------------------- | -------------------------------------- |
| Platform                                     | 16-bit Windows 3.1           | 32-bit Windows 95 / NT                 |
| Long filename support                        | No (8.3 DOS names)           | Yes (Windows 95 VFAT)                  |
| TipWizard                                    | No                           | Yes                                    |
| Answer Wizard                                | No                           | Yes                                    |
| Background spell check (red squiggle)        | No                           | Yes                                    |
| Automatic Save (recovery)                    | No (only File → Save)        | Yes (N-minute AutoSave)                |
| AutoCorrect                                  | Yes                          | Yes (expanded dictionary, new options) |
| AutoText                                     | Glossary (renamed AutoText)  | AutoText (still allows legacy term)    |
| Find All Word Forms                          | No                           | Yes                                    |
| Address Book / Insert Address                | No                           | Yes                                    |
| Highlight (character highlighting)           | No                           | Yes                                    |
| Style Gallery                                | No                           | Yes                                    |
| Template Wizards (Letter, Fax, Memo, Resume) | Some                         | Comprehensive                          |
| WordMail                                     | No                           | Yes (integration with Exchange)        |
| Shrink to Fit in Print Preview               | No                           | Yes                                    |
| Large document threshold                     | Slower                       | Faster via 32-bit                      |
| Multiple font sizes per paragraph            | Yes                          | Yes                                    |
| Drawing layer                                | Yes                          | Yes (improved; WordArt 2.0)            |
| Mail Merge                                   | Yes (simpler)                | Yes (full Helper with query options)   |
| WordBasic                                    | Yes                          | Yes (backwards compatible)             |
| OLE                                          | OLE 1.x mostly               | OLE 2.0 (in-place activation)          |
| MDI                                          | Yes                          | Yes                                    |
| Print Preview                                | Basic                        | Enhanced (margin-edit)                 |
| Spelling engine                              | Inso Houghton Mifflin        | Same (updated lexicon)                 |
| Grammar                                      | No (pre-release or optional) | Yes (CIRRUS by Inso)                   |
| Thesaurus                                    | Inso                         | Same                                   |

## Appendix Z: Final Checklist for Implementation

- [ ] All 9 menus with exact item labels and mnemonics.
- [ ] All standard toolbar buttons.
- [ ] All formatting toolbar controls.
- [ ] Each of the 10 toolbars (Standard, Formatting, Borders, Database, Drawing, Forms, Mail Merge, Microsoft, TipWizard, plus context toolbars Header/Footer, Outline, Master Document, Full Screen, Print Preview).
- [ ] 6 views (Normal, Outline, Page Layout, Master Document, Full Screen, Print Preview) with per-view rendering.
- [ ] 12-tab Options dialog with every control.
- [ ] All dialog boxes enumerated above with their exact controls.
- [ ] All field codes with switches.
- [ ] Selection modes (stream, column, F8 progressive, Shift+F8 shrink).
- [ ] All keyboard shortcuts from Appendix.
- [ ] Full AutoCorrect + AutoText behavior.
- [ ] Mail Merge with all data sources and output types.
- [ ] Tables with all 34+ AutoFormats.
- [ ] Drawing layer with all shapes and Z-order.
- [ ] Frame (floating) with all alignment options.
- [ ] Footnotes/endnotes with separators and continuation notices.
- [ ] Annotations with author/initials.
- [ ] Revisions with Mark, Accept/Reject, Compare Versions, Merge Revisions.
- [ ] Customize dialog (toolbars, menus, keyboard).
- [ ] Organizer (styles, AutoText, toolbars, macros).
- [ ] WordBasic round-trip preservation (no execution).
- [ ] Printing with all Print dialog options.
- [ ] Print Preview with Shrink-to-Fit.
- [ ] Summary Info.
- [ ] Find File.
- [ ] Tip of the Day.
- [ ] TipWizard context-aware suggestions.
- [ ] Answer Wizard (natural-language help).
- [ ] WordPerfect Help.
- [ ] Ruler (horizontal + vertical) with drag interactions.
- [ ] Style area in Normal/Outline views.
- [ ] Two-pane split window.
- [ ] New Window (multiple views of same doc).
- [ ] Arrange All.
- [ ] MDI children with per-child caption and icon.
- [ ] Status bar with all 7 regions (REC/MRK/EXT/OVR/WPH/book/clock).
- [ ] Right-click context menus per object type.
- [ ] 16-color palette + 15-color highlight.
- [ ] All 8 wizards (Letter, Memo, Fax, Resume, Newsletter, Agenda, Pleading, Award, Calendar, Table).
- [ ] Built-in templates (Contemporary/Elegant/Professional × letter/memo/fax/report/resume).
- [ ] 15 picture filters (BMP, WMF, EPS, GIF, JPEG, PCX, TGA, CGM, EPS, PICT, DRW, CDR, TIFF, HPGL, WPG).
- [ ] OLE 2 in-place activation for Equation Editor, Graph, Org Chart, WordArt.
- [ ] Drop Cap.
- [ ] Columns (1–6).
- [ ] Bullets and Numbering (7 bullet styles, 7 number styles, 7 multilevel schemes).
- [ ] Heading Numbering (6 schemes).
- [ ] Borders and Shading (15 line styles, 16 colors, 17 shading percentages).
- [ ] Drawing shapes with full Format Drawing Object dialog.
- [ ] Snap to Grid.
- [ ] Group/Ungroup/Regroup.
- [ ] Z-order all 6 operations.
- [ ] Flip Horizontal/Vertical + 90° rotation.
- [ ] Frame with wrap and anchor.
- [ ] Break dialog (page, column, 4 section types).
- [ ] Date and Time insertion dialog.
- [ ] Symbol dialog with Special Characters tab.
- [ ] Field dialog with all categories and switches.
- [ ] Form fields (3 types).
- [ ] Caption dialog with AutoCaption.
- [ ] Cross-reference dialog.
- [ ] Index and Tables dialog (4 tabs: Index, TOC, Figures, Authorities).
- [ ] Mark Index Entry / Mark Citation.
- [ ] Concordance AutoMark.
- [ ] Hyphenation (auto + manual + zone).
- [ ] Language marking per range.
- [ ] Word Count with footnote inclusion option.
- [ ] Protect Document (Revisions, Annotations, Forms).
- [ ] Compare Versions / Merge Revisions.
- [ ] Macro dialog + Record Macro + Macro Editor (for viewing WordBasic).
- [ ] Customize (Toolbars, Menus, Keyboard).
- [ ] Options (12 tabs each with full set of controls).
- [ ] Save formats (Word 6.0/95, RTF, Text, Template, HTML via IA).
- [ ] Open formats (above plus WordPerfect, Works, Excel, Lotus, Text, Recover Text).
- [ ] Font Substitution.
- [ ] Compatibility Options.
- [ ] File Locations (8 types).
- [ ] Always Create Backup Copy.
- [ ] Allow Fast Saves (optional; opt-in).
- [ ] Embed TrueType Fonts.
- [ ] Save Data Only for Forms.
- [ ] Automatic Save (N minutes).
- [ ] AutoRecover file.
- [ ] Prompt for Document Properties.
- [ ] Prompt to Save Normal Template.
- [ ] MRU list (0–9 entries).
- [ ] File → Versions [verify — not in 95].
- [ ] Full keyboard-only operation.

Every checklist item above must be verified against Word 95 behavior via source, user guide, or live VM session before we sign off.

---

**End of document.** This feature inventory will be updated as verification progresses; uncertainties flagged `[verify]` should each be resolved via one of: Microsoft Word 95 User Guide (paper), Microsoft Press "Running Microsoft Word for Windows 95" (Michael Halvorson and Chris Kinata), Que "Using Word for Windows 95", or Internet Archive scans of the Word 95 UI.
