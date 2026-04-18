# Editor Core Architecture

## 0. Preamble and Scope

The editor core is the beating heart of this Word-95-feature-parity word processor. It is a pure TypeScript library with **zero** dependencies on the DOM, the filesystem, Electron, or React. Its sole responsibilities are:

1. To represent the current document as an immutable, structurally-shared tree of typed entities (the **domain model**).
2. To transform that tree through atomic, invertible operations bundled into transactions (the **engine**).
3. To expose a plugin API that layered features (tables, lists, comments, fields, track changes, footnotes, etc.) hook into without touching the core.
4. To maintain the user's selection, undo/redo history, and a command registry that the UI and keymap can reference by stable string ID.
5. To handle the subtleties of text input — IME composition, dead keys, bidi, paste normalization — behind a clean input pipeline.

This document deliberately excludes rendering, pagination, DOCX (de)serialization, React bindings, and platform integration. Those concerns consume the core; they do not live inside it. See the sibling architecture documents for each of those layers.

The core is shipped as two npm packages inside a pnpm workspace:

* `@word/domain` — entities, value objects, and pure functions over them. No classes with mutable state, no side effects. Tree-shakeable.
* `@word/engine` — commands, transactions, selection, plugins, input pipeline, clock/random/id ports. Depends on `@word/domain`.

A third package, `@word/engine-testkit`, provides the scenario runner, property-based generators, and deterministic ID/clock seeds for downstream packages.

---

## 1. Layered Architecture Overview

The system is organized in the classic hexagonal-plus-layered style. The domain sits at the center; the application orchestrates; infrastructure and platform are adapters to the outside world.

```
+----------------------------------------------------------------------+
|                         PRESENTATION                                 |
|          React UI (views, ribbons, dialogs, caret, rulers)           |
|          react-editor bindings translate DOM events -> Intents       |
+-----------------------+----------------------+-----------------------+
                        |                      |
                        v                      |  (subscribes to
+----------------------------------------------+ stateChanged events)
|                         APPLICATION                                  |
|  Command dispatcher, Selection services, Plugin host, Clipboard      |
|  Intent mapper, Keymap resolver, Transaction manager, Undo/Redo      |
+-----------+----------------------------------------+-----------------+
            |                                        |
            v                                        ^
+----------------------+                 +-----------+----------------+
|       DOMAIN         |                 |      INFRASTRUCTURE        |
|  Document, Section,  |<----consumes----|  DOCX serializer           |
|  Paragraph, Run,     |   (ports:       |  (read/write adapters)     |
|  Table, Style,       |    Serializer,  |  IFileProvider             |
|  Numbering, ...      |    FontMetrics, |  Font loader, Spellcheck   |
|  Pure, no I/O.       |    Clock, Idp)  |  Image codec               |
+----------------------+                 +-----------+----------------+
                                                     |
                                                     v
                                         +---------------------------+
                                         |         PLATFORM          |
                                         |  Electron main / preload  |
                                         |  OS clipboard bridge      |
                                         |  IME bridge, AX bridge    |
                                         +---------------------------+

                           +---------------------------+
  Domain snapshots  +----->|    RENDERING / LAYOUT     |
  (read-only, via   |      |   (separate engine doc)   |
   structural share)|      |   paginator, shaper,      |
                    |      |   line-breaker, painter   |
                    |      +---------------------------+
```

Key rules:

* Presentation never touches Domain types directly — it goes through the Application layer's dispatcher (`editor.dispatch(intent)`) and subscribes to `editor.store` selectors that project domain state into render-ready shapes.
* Infrastructure implements domain-defined **ports** (interfaces). The domain has no knowledge of who fulfills them.
* Platform sits beside Infrastructure because some of its capabilities (clipboard, IME) flow through Application as intents, and some (DOCX read) flow through Infrastructure adapters.
* Rendering/Layout reads snapshots of the Document and produces a page model. It is read-only with respect to the domain.

### 1.1 Why hexagonal here?

A word processor spans many external systems: a filesystem, an OS clipboard, fonts, spellchecker dictionaries, print drivers, screen readers. If the domain knows about any of them, testing becomes impossible and feature plugins become coupled. The port/adapter split lets us:

1. Run the entire engine in a Node test environment with stub ports (no DOM, no Electron).
2. Swap spellcheck backends (hunspell, Apple NSSpellChecker, WinRT) without touching the core.
3. Ship the same core to a future web build by swapping Electron platform adapters for web equivalents.

### 1.2 Dependency rule

Dependencies point **inward**: Presentation → Application → Domain. Infrastructure and Platform depend on Domain (to implement its ports) but Domain depends on nothing. Enforced with `eslint-plugin-boundaries` and a `deps.json` that denies any import going the wrong way.

---

## 2. The Pure Domain Model

### 2.1 Identity: `NodeId`

Every persistent entity in the tree has a stable **`NodeId`**: a 21-character nanoid. IDs are opaque strings — no ordering information, no parent information, no type prefix. Ordering is always derived from tree position; parenthood is always derived from the tree edges.

```typescript
// packages/domain/src/identity.ts

/** Branded string for type safety. */
export type NodeId = string & { readonly __brand: "NodeId" };

/** Port — implementations live in infrastructure/engine. */
export interface IdGenPort {
  /** Generates a new NodeId. Must be collision-free across the process lifetime. */
  newId(): NodeId;
}

export const asNodeId = (s: string): NodeId => s as NodeId;
```

The default `IdGenPort` uses `nanoid` with a 21-char alphabet; tests supply a deterministic seeded generator so every snapshot is reproducible byte-for-byte.

### 2.2 Node base

Borrowing ProseMirror's insight that nodes share a common shape (attrs + children + marks) but not a common *closed* type, we declare a structural base that every concrete entity extends.

```typescript
// packages/domain/src/node.ts

export type NodeType =
  | "document" | "section"
  | "paragraph" | "run" | "fieldRun" | "hyperlinkRun" | "drawingRun"
  | "commentMarker" | "bookmarkMarker" | "footnoteMarker" | "endnoteMarker" | "break"
  | "table" | "row" | "cell"
  | "footnote" | "endnote" | "comment" | "bookmark" | "hyperlink"
  | "image" | "field";

export interface NodeBase<T extends NodeType = NodeType, A = unknown> {
  readonly id: NodeId;
  readonly type: T;
  readonly attrs: Readonly<A>;
}

/** Carries no children; content-free markers. */
export interface LeafNode<T extends NodeType = NodeType, A = unknown>
  extends NodeBase<T, A> {}

/** Holds a typed, ordered child array. */
export interface ParentNode<T extends NodeType = NodeType, A = unknown, C = NodeBase>
  extends NodeBase<T, A> {
  readonly children: readonly C[];
}

/** Carries inline "marks" — boolean/flag annotations layered over inline text. */
export interface MarkableNode<T extends NodeType = NodeType, A = unknown>
  extends NodeBase<T, A> {
  readonly marks?: readonly Mark[];
}
```

Marks (character-level annotations like "redaction" or "spelling-error" that are not quite RunProps) are explained in §11.

### 2.3 Inline-node union

Paragraph children are restricted to the inline union. The union is closed in the core; plugins extend it by registering new types with the schema (§11).

```typescript
// packages/domain/src/inline.ts

export type InlineNode =
  | Run
  | FieldRun
  | HyperlinkRun
  | DrawingRun
  | CommentMarker
  | BookmarkMarker
  | FootnoteMarker
  | EndnoteMarker
  | Break;

/** A contiguous run of characters sharing RunProps. */
export interface Run extends NodeBase<"run", { runPropsId: PropsId }> {
  readonly text: string; // UTF-16 content; see piece-table section for storage
}

/** A field instruction/result pair — Word fields like PAGE, DATE, MERGEFIELD. */
export interface FieldRun extends NodeBase<"fieldRun", FieldRunAttrs> {
  readonly children: readonly Run[]; // the displayed result
}

export interface FieldRunAttrs {
  readonly fieldId: NodeId;      // points into Document.fields
  readonly locked?: boolean;     // w:fldLock
  readonly dirty?: boolean;      // needs recalculation
}

export interface HyperlinkRun extends NodeBase<"hyperlinkRun", HyperlinkAttrs> {
  readonly children: readonly InlineNode[];
}

export interface HyperlinkAttrs {
  readonly hyperlinkId: NodeId;  // points into Document.hyperlinks
  readonly anchor?: string;      // internal anchor, if any
}

/** Embeds a drawing object (image, shape). Renderer owns the visual. */
export interface DrawingRun extends NodeBase<"drawingRun", DrawingAttrs> {}

export interface DrawingAttrs {
  readonly drawingId: NodeId;    // points into Document.drawings
  readonly anchorKind: "inline" | "floating";
  readonly behindText?: boolean;
  readonly wrap?: WrapKind;
}

export type WrapKind = "square" | "tight" | "through" | "topAndBottom" | "behind" | "inFront";

/** Zero-width comment range markers (start/end) plus reference (the bubble). */
export interface CommentMarker extends NodeBase<"commentMarker", CommentMarkerAttrs> {}
export interface CommentMarkerAttrs {
  readonly commentId: NodeId;
  readonly side: "start" | "end" | "reference";
}

/** Bookmark anchors. */
export interface BookmarkMarker extends NodeBase<"bookmarkMarker", BookmarkMarkerAttrs> {}
export interface BookmarkMarkerAttrs {
  readonly bookmarkId: NodeId;
  readonly side: "start" | "end";
}

export interface FootnoteMarker extends NodeBase<"footnoteMarker", { footnoteId: NodeId }> {}
export interface EndnoteMarker extends NodeBase<"endnoteMarker", { endnoteId: NodeId }> {}

/** Hard breaks inside a paragraph. */
export interface Break extends NodeBase<"break", BreakAttrs> {}
export interface BreakAttrs {
  readonly kind: "line" | "column" | "page" | "textWrapping";
  readonly clear?: "none" | "left" | "right" | "all";
}
```

### 2.4 Block-node union

Section boundaries are expressed in the ECMA-376 Transitional way: the **last paragraph** of a section carries a `sectPr` attribute. We expose a derived `SectionBreakMarker` for ergonomics, but the canonical storage is `sectPr` on a paragraph.

```typescript
// packages/domain/src/block.ts

export type BlockNode = Paragraph | Table;

export interface Paragraph
  extends ParentNode<"paragraph", ParagraphAttrs, InlineNode> {}

export interface ParagraphAttrs {
  readonly paraPropsId: PropsId;
  readonly sectPr?: SectionProps; // present iff this paragraph ends a section
}

export interface Table
  extends ParentNode<"table", TableAttrs, Row> {}

export interface TableAttrs {
  readonly tablePropsId: PropsId;
  readonly tblGrid: readonly number[];   // column widths in twips
}

export interface Row extends ParentNode<"row", RowAttrs, Cell> {}

export interface RowAttrs {
  readonly rowPropsId: PropsId;
  readonly heightTwips?: number;
  readonly heightRule?: "atLeast" | "exact" | "auto";
  readonly isHeader?: boolean;           // w:tblHeader
  readonly cantSplit?: boolean;
}

export interface Cell extends ParentNode<"cell", CellAttrs, BlockNode> {}

export interface CellAttrs {
  readonly cellPropsId: PropsId;
  readonly gridSpan?: number;            // w:gridSpan
  readonly vMerge?: "restart" | "continue"; // vertical merge
}
```

### 2.5 Top-level entities

```typescript
// packages/domain/src/document.ts

export interface Section extends ParentNode<"section", { sectionPropsId: PropsId }, BlockNode> {}

/** The root. Immutable. Every edit produces a new Document via structural sharing. */
export interface Document {
  readonly id: NodeId;
  readonly version: number; // monotonic; increments on every committed transaction
  readonly sections: readonly Section[];

  /** Ancillary node stores keyed by NodeId. Reduces tree size and permits
   *  references from inline markers (e.g. CommentMarker.commentId). */
  readonly footnotes: ReadonlyMap<NodeId, Footnote>;
  readonly endnotes: ReadonlyMap<NodeId, Endnote>;
  readonly comments: ReadonlyMap<NodeId, Comment>;
  readonly bookmarks: ReadonlyMap<NodeId, Bookmark>;
  readonly hyperlinks: ReadonlyMap<NodeId, Hyperlink>;
  readonly drawings: ReadonlyMap<NodeId, Drawing>;
  readonly images: ReadonlyMap<NodeId, Image>;
  readonly fields: ReadonlyMap<NodeId, Field>;

  /** Registries. */
  readonly styles: StyleRegistry;
  readonly numbering: NumberingRegistry;
  readonly fonts: FontRegistry;
  readonly props: PropsRegistry; // RunProps/ParaProps/... by PropsId

  /** Doc-level defaults. */
  readonly defaults: DocDefaults;

  /** Meta (title, author, etc.) — detailed in DOCX doc. */
  readonly meta: DocumentMeta;
}

export interface Footnote extends ParentNode<"footnote", { note: "sep" | "continuationSep" | "continuationNotice" | "regular" }, BlockNode> {}
export interface Endnote  extends ParentNode<"endnote",  { note: "sep" | "continuationSep" | "continuationNotice" | "regular" }, BlockNode> {}

export interface Comment extends NodeBase<"comment", CommentAttrs> {
  readonly children: readonly BlockNode[];
}
export interface CommentAttrs {
  readonly author: string;
  readonly initials?: string;
  readonly date: IsoDateTime;
  readonly parentId?: NodeId; // reply thread
  readonly resolved?: boolean;
}

export interface Bookmark extends NodeBase<"bookmark", { name: string }> {}

export interface Hyperlink extends NodeBase<"hyperlink", HyperlinkDefAttrs> {}
export interface HyperlinkDefAttrs {
  readonly kind: "external" | "internal";
  readonly target: string;
  readonly tooltip?: string;
  readonly targetFrame?: string;
}

export interface Drawing extends NodeBase<"drawing", DrawingDefAttrs> {
  readonly kind: "picture" | "shape" | "chart" | "diagram";
  readonly extentEMU: { cx: number; cy: number };
  readonly imageId?: NodeId;
}
export interface DrawingDefAttrs {
  readonly altText?: string;
  readonly title?: string;
  readonly locked?: boolean;
}

export interface Image extends NodeBase<"image", ImageAttrs> {
  readonly blobRef: BlobRef; // opaque; see Rendering doc for how bytes are loaded
}
export interface ImageAttrs {
  readonly mimeType: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly dpi?: number;
}

export interface Field extends NodeBase<"field", FieldAttrs> {
  readonly instrText: string;      // e.g. ' PAGE \\* MERGEFORMAT '
  readonly resultPlain?: string;   // cached computed result
}
export interface FieldAttrs {
  readonly code: string;           // normalized instruction name (PAGE, DATE, ...)
  readonly switches: readonly string[];
}

export interface DocumentMeta {
  readonly title?: string;
  readonly author?: string;
  readonly subject?: string;
  readonly keywords?: readonly string[];
  readonly created?: IsoDateTime;
  readonly modified?: IsoDateTime;
  readonly lastModifiedBy?: string;
  readonly revision?: number;
}

export type IsoDateTime = string & { readonly __brand: "IsoDateTime" };
export type BlobRef = string & { readonly __brand: "BlobRef" };
```

### 2.6 Why separate `ReadonlyMap`s?

The tree is traversed constantly during rendering and layout. Inline markers like `FootnoteMarker` only need to carry a 21-char `NodeId` — we do not want the entire footnote body inlined into every paragraph's children. Separate maps keep the hot path (paragraph→run) cheap, while references resolve in O(1).

This also enables two niceties:

* **Stable IDs across tree shape changes.** A comment attached to a range survives paragraph splits and joins without the engine having to rewrite it.
* **Round-trip fidelity.** DOCX stores comments, footnotes, etc. in separate parts; the domain mirrors that split.

### 2.7 Value objects: `PropsId` and the `PropsRegistry`

Storing the full `RunProps` object on every run would be wasteful — adjacent runs typically share formatting. Instead runs reference a `PropsId`, and a deduplicated registry hands out IDs.

```typescript
// packages/domain/src/props/registry.ts

export type PropsId = string & { readonly __brand: "PropsId" };

export interface PropsRegistry {
  readonly run: ReadonlyMap<PropsId, RunProps>;
  readonly para: ReadonlyMap<PropsId, ParaProps>;
  readonly section: ReadonlyMap<PropsId, SectionProps>;
  readonly table: ReadonlyMap<PropsId, TableProps>;
  readonly row: ReadonlyMap<PropsId, RowProps>;
  readonly cell: ReadonlyMap<PropsId, CellProps>;
}

export interface MutablePropsRegistry {
  internRun(p: RunProps): PropsId;
  internPara(p: ParaProps): PropsId;
  // ... one internXxx per kind
  freeze(): PropsRegistry;
}
```

Interning uses a structural-hash key (e.g. a deterministic JSON canonicalization) so that identical objects produce identical IDs across sessions. Save-time DOCX emission then walks the registry to assign `w:rPr` ids etc.

### 2.8 `RunProps`

The complete set of direct character formatting. Fields correspond 1:1 to ECMA-376 `w:rPr` children. Every field is optional — absence means "inherit from style chain".

```typescript
// packages/domain/src/props/runProps.ts

export interface RunProps {
  // Typeface
  readonly fontAscii?: string;
  readonly fontHAnsi?: string;
  readonly fontEastAsia?: string;
  readonly fontCs?: string;    // complex script
  readonly fontHint?: "default" | "eastAsia" | "cs";

  // Size (half-points to match w:sz)
  readonly sizeHalfPt?: number;
  readonly sizeHalfPtCs?: number;

  // Classic attributes
  readonly bold?: boolean;
  readonly boldCs?: boolean;
  readonly italic?: boolean;
  readonly italicCs?: boolean;
  readonly underline?: UnderlineSpec;
  readonly strike?: boolean;
  readonly doubleStrike?: boolean;

  // Color
  readonly color?: ColorRef;
  readonly highlight?: HighlightName;
  readonly shading?: ShadingSpec;

  // Vertical alignment / position / spacing
  readonly vAlign?: "baseline" | "superscript" | "subscript";
  readonly positionHalfPt?: number;
  readonly spacingTwips?: number;
  readonly kernHalfPt?: number;

  // Language
  readonly lang?: { value?: string; eastAsia?: string; bidi?: string };

  // Visibility / decoration
  readonly hidden?: boolean;
  readonly allCaps?: boolean;
  readonly smallCaps?: boolean;
  readonly emboss?: boolean;
  readonly imprint?: boolean;
  readonly outline?: boolean;
  readonly shadow?: boolean;
  readonly vanish?: boolean;
  readonly webHidden?: boolean;

  // Effects (animations — Word 95 blink etc. preserved for round-trip)
  readonly effect?: "none" | "blinkBackground" | "lights" | "antsBlack" | "antsRed" | "shimmer" | "sparkle";

  // Character style link
  readonly styleRef?: StyleId;

  // Character-level borders (Word 2010+; round-trip)
  readonly border?: BorderSpec;

  // East-Asian specialties
  readonly emphasis?: "none" | "dot" | "comma" | "circle" | "underDot";
  readonly fitText?: { id?: number; widthTwips: number };
}

export interface UnderlineSpec {
  readonly kind:
    | "none" | "single" | "words" | "double" | "thick" | "dotted"
    | "dottedHeavy" | "dash" | "dashedHeavy" | "dashLong" | "dashLongHeavy"
    | "dotDash" | "dashDotHeavy" | "dotDotDash" | "dashDotDotHeavy"
    | "wave" | "wavyHeavy" | "wavyDouble";
  readonly color?: ColorRef;
}

export type ColorRef =
  | { kind: "auto" }
  | { kind: "rgb"; rgb: `#${string}` }
  | { kind: "theme"; theme: ThemeColorName; tint?: number; shade?: number };

export type ThemeColorName =
  | "dark1" | "light1" | "dark2" | "light2"
  | "accent1" | "accent2" | "accent3" | "accent4" | "accent5" | "accent6"
  | "hyperlink" | "followedHyperlink" | "none" | "background1" | "text1";

export type HighlightName =
  | "yellow" | "green" | "cyan" | "magenta" | "blue" | "red"
  | "darkBlue" | "darkCyan" | "darkGreen" | "darkMagenta" | "darkRed"
  | "darkYellow" | "darkGray" | "lightGray" | "black" | "white" | "none";

export interface ShadingSpec {
  readonly val: string;            // w:val pattern e.g. "clear", "solid"
  readonly color?: ColorRef;
  readonly fill?: ColorRef;
}

export interface BorderSpec {
  readonly top?: Border;
  readonly right?: Border;
  readonly bottom?: Border;
  readonly left?: Border;
  readonly between?: Border;       // for paragraphs
  readonly bar?: Border;
}

export interface Border {
  readonly style: BorderStyle;
  readonly sizeEighthPt: number;
  readonly space?: number;
  readonly color?: ColorRef;
  readonly frame?: boolean;
  readonly shadow?: boolean;
}

export type BorderStyle =
  | "nil" | "none" | "single" | "thick" | "double" | "dotted" | "dashed"
  | "dotDash" | "dotDotDash" | "triple" | "thinThickSmallGap" | "thickThinSmallGap"
  | "thinThickThinSmallGap" | "thinThickMediumGap" | "thickThinMediumGap"
  | "thinThickThinMediumGap" | "thinThickLargeGap" | "thickThinLargeGap"
  | "thinThickThinLargeGap" | "wave" | "doubleWave" | "dashSmallGap"
  | "dashDotStroked" | "threeDEmboss" | "threeDEngrave" | "outset" | "inset";
```

### 2.9 `ParaProps`

```typescript
// packages/domain/src/props/paraProps.ts

export interface ParaProps {
  readonly styleRef?: StyleId;

  readonly justify?: "left" | "right" | "center" | "both" | "distribute"
                  | "mediumKashida" | "numTab" | "highKashida" | "lowKashida";

  readonly indent?: Indent;

  readonly spacing?: Spacing;

  readonly numPr?: NumPr;

  readonly pBdr?: BorderSpec;      // four-sided plus between/bar
  readonly shd?: ShadingSpec;

  readonly tabs?: readonly TabStop[];

  readonly pageBreakBefore?: boolean;
  readonly keepNext?: boolean;
  readonly keepLines?: boolean;
  readonly widowControl?: boolean;
  readonly suppressAutoHyphens?: boolean;
  readonly suppressLineNumbers?: boolean;
  readonly overflowPunct?: boolean;
  readonly kinsoku?: boolean;
  readonly wordWrap?: boolean;

  readonly outlineLvl?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  readonly textAlignment?: "top" | "center" | "baseline" | "bottom" | "auto";

  readonly bidi?: boolean;
  readonly textDirection?: "lrTb" | "tbRl" | "btLr" | "lrTbV" | "tbRlV" | "tbLrV";

  readonly frameProps?: FrameProps;

  readonly divId?: string;
  readonly cnfStyle?: ConditionalFormattingFlags;
}

export interface Indent {
  readonly leftTwips?: number;
  readonly rightTwips?: number;
  readonly firstLineTwips?: number;
  readonly hangingTwips?: number;
  readonly startTwips?: number;   // RTL analogue
  readonly endTwips?: number;
}

export interface Spacing {
  readonly beforeTwips?: number;
  readonly afterTwips?: number;
  readonly beforeAutospacing?: boolean;
  readonly afterAutospacing?: boolean;
  readonly lineTwips?: number;
  readonly lineRule?: "auto" | "exact" | "atLeast";
}

export interface NumPr {
  readonly numId: number;
  readonly ilvl: number;
  readonly ins?: TrackChangeRef; // track changes on list membership
}

export interface TabStop {
  readonly posTwips: number;
  readonly kind: "clear" | "start" | "center" | "end" | "decimal" | "bar" | "num";
  readonly leader?: "none" | "dot" | "hyphen" | "underscore" | "heavy" | "middleDot";
}

export interface FrameProps {
  readonly w?: number;
  readonly h?: number;
  readonly hAnchor?: "text" | "margin" | "page";
  readonly vAnchor?: "text" | "margin" | "page";
  readonly x?: number;
  readonly y?: number;
  readonly xAlign?: "left" | "center" | "right" | "inside" | "outside";
  readonly yAlign?: "inline" | "top" | "center" | "bottom" | "inside" | "outside";
  readonly wrap?: "auto" | "notBeside" | "around" | "tight" | "through" | "none";
  readonly lines?: number;
  readonly hSpace?: number;
  readonly vSpace?: number;
  readonly dropCap?: "none" | "drop" | "margin";
  readonly anchorLock?: boolean;
}

export interface ConditionalFormattingFlags {
  readonly firstRow?: boolean;
  readonly lastRow?: boolean;
  readonly firstColumn?: boolean;
  readonly lastColumn?: boolean;
  readonly oddVBand?: boolean;
  readonly evenVBand?: boolean;
  readonly oddHBand?: boolean;
  readonly evenHBand?: boolean;
  readonly firstRowFirstColumn?: boolean;
  readonly firstRowLastColumn?: boolean;
  readonly lastRowFirstColumn?: boolean;
  readonly lastRowLastColumn?: boolean;
}

export interface TrackChangeRef {
  readonly id: number;
  readonly author: string;
  readonly date: IsoDateTime;
}
```

### 2.10 `SectionProps`

```typescript
// packages/domain/src/props/sectionProps.ts

export interface SectionProps {
  readonly type?: "nextPage" | "oddPage" | "evenPage" | "continuous" | "nextColumn";
  readonly pgSz?: PageSize;
  readonly pgMar?: PageMargins;
  readonly cols?: Columns;
  readonly headerRefs?: readonly HeaderRef[];
  readonly footerRefs?: readonly FooterRef[];
  readonly titlePg?: boolean;
  readonly bidi?: boolean;
  readonly rtlGutter?: boolean;
  readonly pgNumType?: PageNumberType;
  readonly lnNumType?: LineNumberType;
  readonly vAlign?: "top" | "center" | "both" | "bottom";
  readonly formProt?: boolean;
  readonly docGrid?: DocGrid;
  readonly printerSettings?: { relId: string };
  readonly paperSrc?: { first?: number; other?: number };
  readonly footnotePr?: FootnotePr;
  readonly endnotePr?: EndnotePr;
  readonly textDirection?: ParaProps["textDirection"];
}

export interface PageSize {
  readonly wTwips: number;
  readonly hTwips: number;
  readonly orient?: "portrait" | "landscape";
  readonly code?: number;
}

export interface PageMargins {
  readonly topTwips: number;
  readonly rightTwips: number;
  readonly bottomTwips: number;
  readonly leftTwips: number;
  readonly headerTwips: number;
  readonly footerTwips: number;
  readonly gutterTwips: number;
}

export interface Columns {
  readonly count: number;
  readonly equalWidth: boolean;
  readonly spaceTwips?: number;
  readonly separator?: boolean;
  readonly cols?: readonly { widthTwips: number; spaceTwips?: number }[];
}

export interface HeaderRef { readonly type: "default" | "first" | "even"; readonly relId: string }
export interface FooterRef { readonly type: "default" | "first" | "even"; readonly relId: string }

export interface PageNumberType {
  readonly fmt?: "decimal" | "upperRoman" | "lowerRoman" | "upperLetter" | "lowerLetter"
              | "ordinal" | "cardinalText" | "ordinalText" | "hex" | "chicago" | "ideographDigital"
              | "japaneseCounting" | "aiueo" | "iroha" | "decimalFullWidth" | "decimalHalfWidth"
              | "japaneseLegal" | "japaneseDigitalTenThousand" | "decimalEnclosedCircle"
              | "decimalFullWidth2" | "aiueoFullWidth" | "irohaFullWidth";
  readonly start?: number;
  readonly chapStyle?: number;
  readonly chapSep?: "hyphen" | "period" | "colon" | "emDash" | "enDash";
}

export interface LineNumberType {
  readonly countBy?: number;
  readonly start?: number;
  readonly distanceTwips?: number;
  readonly restart?: "newPage" | "newSection" | "continuous";
}

export interface DocGrid {
  readonly type?: "default" | "lines" | "linesAndChars" | "snapToChars";
  readonly linePitch?: number;
  readonly charSpace?: number;
}

export interface FootnotePr {
  readonly pos?: "pageBottom" | "beneathText" | "sectEnd" | "docEnd";
  readonly numFmt?: PageNumberType["fmt"];
  readonly start?: number;
  readonly restart?: "continuous" | "eachSect" | "eachPage";
}

export interface EndnotePr {
  readonly pos?: "sectEnd" | "docEnd";
  readonly numFmt?: PageNumberType["fmt"];
  readonly start?: number;
  readonly restart?: "continuous" | "eachSect";
}
```

### 2.11 `TableProps`, `RowProps`, `CellProps`

```typescript
// packages/domain/src/props/tableProps.ts

export interface TableProps {
  readonly styleRef?: StyleId;
  readonly wTwips?: number;
  readonly wType?: "nil" | "pct" | "dxa" | "auto";
  readonly justify?: "left" | "center" | "right" | "start" | "end";
  readonly cellMargin?: TableCellMargins;
  readonly cellSpacingTwips?: number;
  readonly borders?: TableBorders;
  readonly shading?: ShadingSpec;
  readonly layout?: "fixed" | "autofit";
  readonly look?: TableLook;
  readonly indentTwips?: number;
  readonly overlap?: "never" | "overlap";
  readonly bidiVisual?: boolean;
  readonly caption?: string;
  readonly description?: string;
}

export interface RowProps {
  readonly cellMargin?: TableCellMargins;
  readonly cantSplit?: boolean;
  readonly hidden?: boolean;
  readonly tblHeader?: boolean;
  readonly wAfter?: number;
  readonly wBefore?: number;
  readonly gridBefore?: number;
  readonly gridAfter?: number;
  readonly jc?: "left" | "center" | "right";
  readonly tblCellSpacing?: number;
  readonly rowHeight?: { ruleKind?: "atLeast" | "exact" | "auto"; valTwips: number };
}

export interface CellProps {
  readonly wTwips?: number;
  readonly wType?: "nil" | "pct" | "dxa" | "auto";
  readonly borders?: TableBorders;
  readonly shading?: ShadingSpec;
  readonly margin?: TableCellMargins;
  readonly vAlign?: "top" | "center" | "bottom";
  readonly textDirection?: ParaProps["textDirection"];
  readonly noWrap?: boolean;
  readonly hideMark?: boolean;
  readonly fitText?: boolean;
  readonly gridSpan?: number;
  readonly vMerge?: "restart" | "continue";
  readonly hMerge?: "restart" | "continue";
  readonly styleHints?: ConditionalFormattingFlags;
}

export interface TableCellMargins {
  readonly topTwips?: number;
  readonly bottomTwips?: number;
  readonly startTwips?: number;
  readonly endTwips?: number;
}

export interface TableBorders {
  readonly top?: Border;
  readonly bottom?: Border;
  readonly start?: Border;
  readonly end?: Border;
  readonly insideH?: Border;
  readonly insideV?: Border;
  readonly tl2br?: Border;
  readonly tr2bl?: Border;
}

export interface TableLook {
  readonly firstRow?: boolean;
  readonly lastRow?: boolean;
  readonly firstColumn?: boolean;
  readonly lastColumn?: boolean;
  readonly noHBand?: boolean;
  readonly noVBand?: boolean;
}
```

### 2.12 Styles

```typescript
// packages/domain/src/styles/style.ts

export type StyleId = string & { readonly __brand: "StyleId" };

export type StyleKind = "paragraph" | "character" | "table" | "numbering";

export interface StyleBase {
  readonly id: StyleId;        // internal, stable
  readonly name: string;       // display name, e.g. "Heading 1"
  readonly aliases?: readonly string[];
  readonly kind: StyleKind;

  readonly basedOn?: StyleId;
  readonly next?: StyleId;
  readonly link?: StyleId;     // character ↔ paragraph style link
  readonly qFormat?: boolean;  // primary style (shown in gallery)
  readonly autoRedefine?: boolean;
  readonly hidden?: boolean;
  readonly uiPriority?: number;
  readonly semiHidden?: boolean;
  readonly unhideWhenUsed?: boolean;
  readonly locked?: boolean;
  readonly personal?: boolean;
  readonly customStyle?: boolean;
}

export interface ParagraphStyle extends StyleBase {
  readonly kind: "paragraph";
  readonly runProps?: RunProps;
  readonly paraProps?: ParaProps;
}

export interface CharacterStyle extends StyleBase {
  readonly kind: "character";
  readonly runProps?: RunProps;
}

export interface TableStyle extends StyleBase {
  readonly kind: "table";
  readonly runProps?: RunProps;
  readonly paraProps?: ParaProps;
  readonly tableProps?: TableProps;
  readonly conditionalProps?: ReadonlyMap<ConditionalTarget, ConditionalStyleEntry>;
}

export type ConditionalTarget =
  | "wholeTable" | "firstRow" | "lastRow" | "firstCol" | "lastCol"
  | "band1Vert" | "band2Vert" | "band1Horz" | "band2Horz"
  | "neCell" | "nwCell" | "seCell" | "swCell";

export interface ConditionalStyleEntry {
  readonly runProps?: RunProps;
  readonly paraProps?: ParaProps;
  readonly tableProps?: TableProps;
  readonly rowProps?: RowProps;
  readonly cellProps?: CellProps;
}

export interface NumberingStyle extends StyleBase {
  readonly kind: "numbering";
  readonly numId: number; // ref into NumberingRegistry
}

export type Style = ParagraphStyle | CharacterStyle | TableStyle | NumberingStyle;

export interface StyleRegistry {
  readonly byId: ReadonlyMap<StyleId, Style>;
  readonly defaults: {
    readonly paragraph?: StyleId;
    readonly character?: StyleId;
    readonly table?: StyleId;
    readonly numbering?: StyleId;
  };
  readonly latentStyles?: LatentStyles;
  readonly version: number; // bumped on any change; memoization key
}

export interface LatentStyles {
  readonly defLockedState?: boolean;
  readonly defUiPriority?: number;
  readonly defSemiHidden?: boolean;
  readonly defUnhideWhenUsed?: boolean;
  readonly defQFormat?: boolean;
  readonly count?: number;
  readonly exceptions?: ReadonlyMap<string, Partial<StyleBase>>;
}
```

### 2.13 Numbering definitions

```typescript
// packages/domain/src/styles/numbering.ts

export interface NumberingRegistry {
  readonly abstractNums: ReadonlyMap<number, AbstractNum>;
  readonly nums: ReadonlyMap<number, NumInstance>;
  readonly version: number;
}

export interface AbstractNum {
  readonly abstractNumId: number;
  readonly name?: string;
  readonly nsid?: string;
  readonly multiLevelType?: "singleLevel" | "multilevel" | "hybridMultilevel";
  readonly tmpl?: string;
  readonly levels: readonly NumLvl[];     // by ilvl 0..8
  readonly styleLink?: StyleId;
  readonly numStyleLink?: StyleId;
}

export interface NumLvl {
  readonly ilvl: number;
  readonly start?: number;
  readonly numFmt?: PageNumberType["fmt"] | "bullet" | "none";
  readonly restart?: number;
  readonly pStyle?: StyleId;
  readonly isLgl?: boolean;
  readonly suff?: "tab" | "space" | "nothing";
  readonly lvlText: string;
  readonly lvlJc?: "start" | "center" | "end" | "left" | "right";
  readonly runProps?: RunProps;
  readonly paraProps?: ParaProps;
  readonly legacy?: { legacy?: boolean; legacySpace?: number; legacyIndent?: number };
}

export interface NumInstance {
  readonly numId: number;
  readonly abstractNumId: number;
  readonly lvlOverrides?: readonly NumLvlOverride[];
}

export interface NumLvlOverride {
  readonly ilvl: number;
  readonly startOverride?: number;
  readonly lvl?: NumLvl;
}
```

### 2.14 `FontRegistry`, `DocDefaults`

```typescript
// packages/domain/src/styles/fonts.ts

export interface FontRegistry {
  readonly byName: ReadonlyMap<string, FontDef>;
  readonly version: number;
}

export interface FontDef {
  readonly name: string;
  readonly altName?: string;
  readonly charset?: number;
  readonly family?: "roman" | "swiss" | "modern" | "script" | "decorative" | "auto";
  readonly pitch?: "fixed" | "variable" | "default";
  readonly panose1?: string;
  readonly sig?: { usb0?: string; usb1?: string; usb2?: string; usb3?: string; csb0?: string; csb1?: string };
  readonly embedRegular?: string;
  readonly embedBold?: string;
  readonly embedItalic?: string;
  readonly embedBoldItalic?: string;
}

export interface DocDefaults {
  readonly runProps?: RunProps;
  readonly paraProps?: ParaProps;
}
```

---

## 3. Property Resolution

"Effective" properties on a run or paragraph are computed by layering:

1. **Document defaults** (`doc.defaults.runProps`, `doc.defaults.paraProps`).
2. **Style chain**, walked bottom-up from `styleRef` following `basedOn`, terminated by the root style or `undefined`. For paragraphs, the paragraph style contributes both paraProps *and* runProps (the paragraph's "mark run"). For runs, the run's direct style + the containing paragraph style's linked character style contribute.
3. **Table style conditional formatting** (for runs inside a cell): the cell's position (firstRow, lastCol, etc.) selects entries from `TableStyle.conditionalProps`.
4. **Direct formatting** from the run/paragraph's own `PropsId` registry entry.

Later layers override earlier layers, field-by-field (not object-by-object).

```typescript
// packages/domain/src/props/resolve.ts

export function resolveRunProps(
  run: Run,
  ctx: PropsResolutionContext
): RunProps {
  // Step 0 — cached?
  const key = hashKey(run.attrs.runPropsId, ctx.styles.version, ctx.containerKey);
  const cached = ctx.memoRun.get(key);
  if (cached) return cached;

  // Step 1 — doc defaults
  let acc: RunProps = ctx.docDefaults.runProps ?? {};

  // Step 2a — paragraph style's run properties (from the paragraph's styleRef chain)
  const paraStyleRuns = collectRunFromParaStyleChain(ctx.paragraph, ctx.styles);
  for (const s of paraStyleRuns) acc = mergeRunProps(acc, s);

  // Step 2b — character style chain on the run's direct PropsId (if any styleRef)
  const runStyleChain = collectCharStyleChain(ctx.directRunProps.styleRef, ctx.styles);
  for (const s of runStyleChain) acc = mergeRunProps(acc, s);

  // Step 3 — table conditional formatting, if applicable
  if (ctx.tableContext) {
    const condProps = collectTableConditional(ctx.tableContext, ctx.styles);
    for (const s of condProps) acc = mergeRunProps(acc, s);
  }

  // Step 4 — direct formatting
  acc = mergeRunProps(acc, ctx.directRunProps);

  // Step 5 — freeze and memoize
  const frozen = Object.freeze(acc);
  ctx.memoRun.set(key, frozen);
  return frozen;
}

/** Field-wise override; undefined in `b` does not clobber `a`. */
function mergeRunProps(a: RunProps, b: RunProps): RunProps {
  const out: any = { ...a };
  for (const k of Object.keys(b) as (keyof RunProps)[]) {
    const v = (b as any)[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export function resolveParaProps(
  para: Paragraph,
  ctx: PropsResolutionContext
): ParaProps {
  const key = hashKey(para.attrs.paraPropsId, ctx.styles.version, ctx.containerKey);
  const cached = ctx.memoPara.get(key);
  if (cached) return cached;

  let acc: ParaProps = ctx.docDefaults.paraProps ?? {};

  // Paragraph style chain (paraProps portion)
  const chain = collectParaStyleChain(ctx.directParaProps.styleRef, ctx.styles);
  for (const s of chain) acc = mergeParaProps(acc, s);

  // Table conditional paragraph props
  if (ctx.tableContext) {
    const condProps = collectTableConditionalPara(ctx.tableContext, ctx.styles);
    for (const s of condProps) acc = mergeParaProps(acc, s);
  }

  // Direct formatting
  acc = mergeParaProps(acc, ctx.directParaProps);

  const frozen = Object.freeze(acc);
  ctx.memoPara.set(key, frozen);
  return frozen;
}

export interface PropsResolutionContext {
  readonly docDefaults: DocDefaults;
  readonly styles: StyleRegistry;
  readonly paragraph: Paragraph;
  readonly directRunProps: RunProps;
  readonly directParaProps: ParaProps;
  readonly tableContext?: TableContextInfo;
  readonly containerKey: string; // memo key suffix
  readonly memoRun: Map<string, RunProps>;
  readonly memoPara: Map<string, ParaProps>;
}

export interface TableContextInfo {
  readonly tableStyleId: StyleId;
  readonly rowIdx: number;
  readonly colIdx: number;
  readonly rowCount: number;
  readonly colCount: number;
  readonly look: TableLook;
}
```

### 3.1 Memoization and invalidation

The resolution memo keys on `(directPropsId, stylesVersion, tableContextHash, docDefaultsHash)`. `stylesVersion` monotonically increments whenever the `StyleRegistry` changes (a style is added, edited, removed, or reordered). Because each `PropsId` is itself content-addressed, changes to direct formatting mint a new `PropsId`, which naturally invalidates the memo. Invalidation is thus **automatic** rather than manual.

The memo is a shared LRU per `EditorInstance` (default 4096 entries for run, 1024 for paragraph), sized to dominate working-set paragraphs on a long document.

### 3.2 Cycle detection

A misconfigured DOCX might set `basedOn` in a cycle. The style-chain walker caps depth at 64 and detects visited styles; on cycle, the walker stops and logs a warning. The domain never throws on malformed input because DOCX files in the wild are routinely malformed.

---

## 4. Positions and Ranges

### 4.1 Two representations, one canonical

We model positions in two equivalent ways:

* **Path form**: `{ blockPath: BlockPath; offsetInBlock: number }`. Fast to traverse during layout; ephemeral across edits.
* **ID form**: `{ leafId: NodeId; offset: number }`. Stable across most edits (the leaf paragraph or cell persists); required for collaboration, comments, bookmarks, and the undo stack.

The canonical, persisted form is **ID form**. Path form is re-derived on demand. A `PositionIndex` built incrementally during rendering provides O(1) id→path lookup for the current document version.

```typescript
// packages/domain/src/positions.ts

export interface PathPosition {
  readonly blockPath: BlockPath;     // path from Document root to the owning leaf container
  readonly offsetInBlock: number;    // UTF-16 offset into the text of that container
}

/** Sequence of indices describing descent into tables/cells/blocks. */
export type BlockPath = readonly PathStep[];

export type PathStep =
  | { readonly kind: "section"; readonly index: number }
  | { readonly kind: "block"; readonly index: number }
  | { readonly kind: "row"; readonly index: number }
  | { readonly kind: "cell"; readonly index: number };

export interface IdPosition {
  readonly leafId: NodeId;           // the owning Paragraph (or Cell, for at-start/at-end anchors)
  readonly offset: number;
  readonly bias?: "before" | "after"; // tiebreaker when two positions share (leafId, offset)
}

export type Position = IdPosition;

export interface Range {
  readonly anchor: Position;
  readonly focus: Position;
  readonly rect?: RectSelMeta;       // present iff rectangular/column mode
}

export interface RectSelMeta {
  readonly startCol: number;
  readonly endCol: number;
  readonly startLine: number;
  readonly endLine: number;
}
```

### 4.2 Conversions

```typescript
// packages/engine/src/positions/convert.ts

export interface PositionIndex {
  /** id -> path */
  pathForId(id: NodeId): BlockPath | undefined;
  /** path -> id at that step */
  idForPath(path: BlockPath): NodeId | undefined;
  /** version snapshot */
  readonly version: number;
}

export function toPath(p: IdPosition, idx: PositionIndex): PathPosition | undefined {
  const blockPath = idx.pathForId(p.leafId);
  if (!blockPath) return undefined;
  return { blockPath, offsetInBlock: p.offset };
}

export function toId(p: PathPosition, doc: Document): IdPosition {
  const leaf = resolvePath(doc, p.blockPath);
  return { leafId: leaf.id, offset: p.offsetInBlock };
}
```

### 4.3 Normalization

After every transaction, selections are **normalized**:

1. `anchor` and `focus` pointing into a deleted node are snapped to the nearest surviving position (biased toward the operation's `selectionAfter` hint, if provided).
2. Collapsed ranges where `anchor === focus` and `bias === "before"` against `"after"` at the same offset are canonicalized to `"before"`.
3. Rectangular selections are re-validated against the current table/column geometry.

### 4.4 Ordering

```typescript
// packages/engine/src/positions/order.ts

export function comparePositions(
  a: IdPosition, b: IdPosition,
  idx: PositionIndex
): -1 | 0 | 1 {
  if (a.leafId === b.leafId) {
    if (a.offset !== b.offset) return a.offset < b.offset ? -1 : 1;
    const ba = a.bias ?? "before";
    const bb = b.bias ?? "before";
    if (ba === bb) return 0;
    return ba === "before" ? -1 : 1;
  }
  const pa = idx.pathForId(a.leafId)!;
  const pb = idx.pathForId(b.leafId)!;
  return comparePaths(pa, pb);
}

function comparePaths(a: BlockPath, b: BlockPath): -1 | 0 | 1 {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const ai = (a[i] as any).index as number;
    const bi = (b[i] as any).index as number;
    if (ai !== bi) return ai < bi ? -1 : 1;
  }
  if (a.length === b.length) return 0;
  return a.length < b.length ? -1 : 1;
}
```

---

## 5. Data-Structure Strategy

### 5.1 The tree: immutable with structural sharing

Document → Section → Block → ... is a classic rose tree. On every edit we produce a **new** Document that shares every subtree not touched by the edit. Two implementation candidates:

**Option A — Immer:** Lets us write "mutating" code inside a producer callback; Immer freezes outputs and tracks structural sharing automatically. Ergonomic; moderate performance cost from draft tracking.

**Option B — Hand-rolled persistent tree:** We write helpers `replaceAt(path, newNode)`, `insertAt(path, node)`, `removeAt(path)` that do path-copying explicitly. Faster; more verbose; clearer about what sharing happens.

**Decision:** Use **Immer** in non-hot paths (style registry updates, plugin initialization, metadata changes) for developer ergonomics, and the **hand-rolled persistent tree** in hot paths (text insertion, paragraph splits, table-cell edits). We provide a shared helper module:

```typescript
// packages/domain/src/persistent/tree.ts

export function replaceBlockAt(
  doc: Document,
  path: BlockPath,
  make: (old: BlockNode) => BlockNode
): Document {
  // Walks path, rebuilding the spine; leaves untouched subtrees aliased.
  // Each level is produced via a readonly spread of children with the changed slot.
}

export function insertBlockAt(doc: Document, path: BlockPath, block: BlockNode): Document;
export function removeBlockAt(doc: Document, path: BlockPath): Document;
export function replaceInlineAt(doc: Document, path: BlockPath, inlineIdx: number, make: (old: InlineNode) => InlineNode): Document;
```

All helpers return a fresh `Document` with `version === prev.version + 1`. Subtrees untouched by the edit are preserved by reference.

### 5.2 Paragraph text: piece-table backing (per-paragraph)

Within a single paragraph, characters come and go millions of times during a writing session. A naïve "store as a string in each Run" breaks for two reasons: (1) each keystroke rebuilds a long string; (2) metadata (RunProps) is attached to ranges and would have to split/merge on every edit.

We borrow VS Code's text-buffer technique: **piece table** with a **rope-like balanced index**, and piggy-back RunProps on pieces.

```typescript
// packages/domain/src/text/pieceTable.ts

export type BufferId = "original" | `add:${number}`;

export interface Piece {
  readonly bufferId: BufferId;
  readonly start: number;     // offset into buffer (UTF-16 code units)
  readonly length: number;    // UTF-16 code units
  readonly runPropsId: PropsId;
  readonly styleRef?: StyleId; // character-style ref (optional; duplicate of runProps.styleRef)
  readonly marks?: readonly Mark[];
}

export interface PieceTree {
  /** Balanced (red-black / AVL) tree of pieces.
   *  Nodes carry subtree length for O(log n) offset -> piece lookup. */
  readonly root: PieceNode | null;
  readonly originalBuffer: string;
  readonly addBuffers: readonly string[];
  readonly version: number;
}

export interface PieceNode {
  readonly piece: Piece;
  readonly left: PieceNode | null;
  readonly right: PieceNode | null;
  readonly subtreeLength: number;
  readonly subtreeLineCount: number;
  readonly color: "red" | "black";
}
```

**Why piece table over alternatives?**

| Structure      | Random insert | Random delete | Metadata | Undo friendly | Memory |
| -------------- | ------------- | ------------- | -------- | ------------- | ------ |
| Flat string    | O(n)          | O(n)          | Hard     | Copy per edit | Low    |
| Gap buffer     | O(1)*         | O(1)*         | Hard     | Copy on gap-shift | Low |
| Rope           | O(log n)      | O(log n)      | Per-leaf | Good          | Medium |
| **Piece table**| O(log n)      | O(log n)      | **Per-piece** | **Excellent** | Low append-only buffers |

The piece-table wins three ways:

1. **Add buffer is append-only.** Typing is always at the end of the add buffer; undo and delete never erase bytes. This maps onto a copy-on-write undo log very naturally — an old Piece still references older bytes that were never overwritten.
2. **Per-piece metadata is free.** Character formatting is a property of the range, not the character; pieces already range-label. When the user selects a run of text and bolds it, we split affected pieces at the range boundaries and mint new pieces carrying the new `runPropsId`.
3. **Bulk import is cheap.** Pasting 1 MB of text appends 1 MB to an add buffer and creates O(n_pieces) pieces where n_pieces is the number of RunProps changes. A literal 1 MB paragraph with uniform formatting is one piece.

Relevant references (consulted to validate the design): the "Text Buffer Reimplementation" blog post by the VS Code team on piece-tree internals; Crowley's classic "Data structures for text sequences" paper comparing gap buffers, ropes, and piece tables; Boehm–Atkinson–Plass "Ropes: an alternative to strings".

### 5.3 Piece coalescing and fragmentation

Long sessions can fragment the tree. We coalesce aggressively:

* After any operation, adjacent pieces with identical `(bufferId, runPropsId, marks)` that abut in buffer offsets merge.
* After N edits (configurable; default 2048) we run a compaction pass that rebuilds the tree, optionally copying hot ranges into a fresh "compact" add buffer.
* On document save, we do not persist the piece table — DOCX output emits `w:r` runs with their final text. The piece table is purely an in-memory acceleration.

### 5.4 Piece-tree operations

```typescript
// packages/domain/src/text/ops.ts

export interface PieceOps {
  insert(tree: PieceTree, offset: number, text: string, runPropsId: PropsId): PieceTree;
  deleteRange(tree: PieceTree, start: number, end: number): PieceTree;
  formatRange(tree: PieceTree, start: number, end: number, nextRunPropsId: PropsId): PieceTree;
  readText(tree: PieceTree, start: number, end: number): string;
  readPieces(tree: PieceTree, start: number, end: number): readonly Piece[];
  length(tree: PieceTree): number;
  lineCount(tree: PieceTree): number;
  offsetOfLine(tree: PieceTree, lineIdx: number): number;
  lineOfOffset(tree: PieceTree, offset: number): number;
}
```

Every operation returns a new `PieceTree`. Implementation uses standard RB-tree persistent updates: nodes along the path from root to the split point are cloned; all other nodes are aliased.

### 5.5 Where pieces live

We embed the piece table inside the `Paragraph`:

```typescript
// packages/domain/src/block.ts (augmented)
export interface Paragraph extends ParentNode<"paragraph", ParagraphAttrs, InlineNode> {
  /** Canonical in-memory representation for the paragraph's inline content.
   *  Duplicated with `children: readonly InlineNode[]` for backward-compatible reads;
   *  the engine always writes via the piece tree and projects into children on snapshot boundary. */
  readonly piece?: PieceTree;
}
```

The `children` field remains canonical for **persistence** (DOCX) and for **non-text inline nodes** (markers, hyperlinks, fields, drawings). Text runs live in `piece`. A `projectParagraph(paragraph)` helper materializes `children` from `piece` plus the non-text inline markers at their stored offsets. Markers carry an `{ leafOffset: number }` attribute to re-anchor to the piece tree on every edit.

---

## 6. Commands, Transactions, Patches

### 6.1 Atomic operations (`Op`)

Operations are the smallest reversible units of change. Every op is pure: it takes a Document and produces a Document plus metadata. It is also invertible: every op has a matching inverse op.

```typescript
// packages/engine/src/ops.ts

export type Op =
  | OpInsertText
  | OpDeleteRange
  | OpSplitParagraph
  | OpJoinParagraphs
  | OpSetRunProps
  | OpSetParaProps
  | OpInsertBlock
  | OpRemoveBlock
  | OpReplaceBlockAttrs
  | OpInsertRow
  | OpRemoveRow
  | OpInsertColumn
  | OpRemoveColumn
  | OpMergeCells
  | OpSplitCell
  | OpSetCellAttrs
  | OpSetStyleRef
  | OpSetNumPr
  | OpSetSectionProps
  | OpInsertSection
  | OpRemoveSection
  | OpInsertInlineMarker
  | OpRemoveInlineMarker
  | OpUpsertSideStore;

export interface OpBase { readonly kind: string; }

export interface OpInsertText extends OpBase {
  readonly kind: "insertText";
  readonly at: IdPosition;
  readonly text: string;
  readonly runPropsId: PropsId;
}

export interface OpDeleteRange extends OpBase {
  readonly kind: "deleteRange";
  readonly range: Range;
}

export interface OpSplitParagraph extends OpBase {
  readonly kind: "splitParagraph";
  readonly at: IdPosition;
  readonly newParagraphId: NodeId;
  readonly newParaPropsId: PropsId;   // typically same as the original or its "next" style
}

export interface OpJoinParagraphs extends OpBase {
  readonly kind: "joinParagraphs";
  readonly firstId: NodeId;
  readonly secondId: NodeId;
}

export interface OpSetRunProps extends OpBase {
  readonly kind: "setRunProps";
  readonly range: Range;
  readonly patch: Partial<RunProps>;  // field-wise; null value means "remove that field"
}

export interface OpSetParaProps extends OpBase {
  readonly kind: "setParaProps";
  readonly paragraphIds: readonly NodeId[];
  readonly patch: Partial<ParaProps>;
}

export interface OpInsertBlock extends OpBase {
  readonly kind: "insertBlock";
  readonly at: BlockInsertPoint;
  readonly block: BlockNode;
}

export interface OpRemoveBlock extends OpBase {
  readonly kind: "removeBlock";
  readonly blockId: NodeId;
}

export interface OpReplaceBlockAttrs extends OpBase {
  readonly kind: "replaceBlockAttrs";
  readonly blockId: NodeId;
  readonly attrs: unknown; // type depends on blockId's node type
}

export interface OpInsertRow extends OpBase {
  readonly kind: "insertRow";
  readonly tableId: NodeId;
  readonly beforeRowIndex: number;     // -1 means "append"
  readonly row: Row;
}

export interface OpRemoveRow extends OpBase {
  readonly kind: "removeRow";
  readonly tableId: NodeId;
  readonly rowIndex: number;
}

export interface OpInsertColumn extends OpBase {
  readonly kind: "insertColumn";
  readonly tableId: NodeId;
  readonly beforeColIndex: number;
  readonly width: number;
}

export interface OpRemoveColumn extends OpBase {
  readonly kind: "removeColumn";
  readonly tableId: NodeId;
  readonly colIndex: number;
}

export interface OpMergeCells extends OpBase {
  readonly kind: "mergeCells";
  readonly tableId: NodeId;
  readonly rect: { top: number; left: number; bottom: number; right: number };
}

export interface OpSplitCell extends OpBase {
  readonly kind: "splitCell";
  readonly cellId: NodeId;
  readonly rows: number;
  readonly cols: number;
}

export interface OpSetCellAttrs extends OpBase {
  readonly kind: "setCellAttrs";
  readonly cellId: NodeId;
  readonly attrs: Partial<CellAttrs>;
}

export interface OpSetStyleRef extends OpBase {
  readonly kind: "setStyleRef";
  readonly target: "run" | "para" | "table";
  readonly targetIds: readonly NodeId[];
  readonly styleRef: StyleId | null;
}

export interface OpSetNumPr extends OpBase {
  readonly kind: "setNumPr";
  readonly paragraphIds: readonly NodeId[];
  readonly numPr: NumPr | null;
}

export interface OpSetSectionProps extends OpBase {
  readonly kind: "setSectionProps";
  readonly sectionId: NodeId;
  readonly props: SectionProps;
}

export interface OpInsertSection extends OpBase {
  readonly kind: "insertSection";
  readonly afterSectionIndex: number;
  readonly section: Section;
}

export interface OpRemoveSection extends OpBase {
  readonly kind: "removeSection";
  readonly sectionId: NodeId;
}

export interface OpInsertInlineMarker extends OpBase {
  readonly kind: "insertInlineMarker";
  readonly paragraphId: NodeId;
  readonly atOffset: number;
  readonly marker: InlineMarkerKind;
}

export type InlineMarkerKind =
  | CommentMarker | BookmarkMarker | FootnoteMarker | EndnoteMarker
  | DrawingRun | Break | FieldRun | HyperlinkRun;

export interface OpRemoveInlineMarker extends OpBase {
  readonly kind: "removeInlineMarker";
  readonly markerId: NodeId;
}

export interface OpUpsertSideStore extends OpBase {
  readonly kind: "upsertSideStore";
  readonly store: "footnotes" | "endnotes" | "comments" | "bookmarks" | "hyperlinks" | "drawings" | "images" | "fields" | "styles" | "numbering" | "fonts";
  readonly id: NodeId | StyleId | string;
  readonly value: unknown;  // fully typed at the store level
  readonly remove?: boolean;
}

export type BlockInsertPoint =
  | { readonly kind: "afterBlock"; readonly blockId: NodeId }
  | { readonly kind: "firstInSection"; readonly sectionId: NodeId }
  | { readonly kind: "firstInCell"; readonly cellId: NodeId };
```

### 6.2 Invertibility

```typescript
// packages/engine/src/ops/inverse.ts

/** Produces the inverse op(s) that undo `op` given the pre-state `doc`. */
export function invertOp(doc: Document, op: Op): readonly Op[] {
  switch (op.kind) {
    case "insertText":
      return [{
        kind: "deleteRange",
        range: {
          anchor: op.at,
          focus: { leafId: op.at.leafId, offset: op.at.offset + op.text.length }
        }
      }];
    case "deleteRange": {
      const removed = extractTextAndPropsForRange(doc, op.range);
      return removed.segments.map(seg => ({
        kind: "insertText",
        at: seg.at,
        text: seg.text,
        runPropsId: seg.runPropsId
      }));
    }
    case "splitParagraph":
      return [{ kind: "joinParagraphs", firstId: /* original */, secondId: op.newParagraphId }];
    case "joinParagraphs":
      return [{ kind: "splitParagraph", at: /* reconstructed */, newParagraphId: /* */, newParaPropsId: /* */ }];
    case "setRunProps": {
      const inverse = capturePriorRunProps(doc, op.range);
      return [{ kind: "setRunProps", range: op.range, patch: inverse }];
    }
    // ... and so on for every op kind
  }
}
```

Op inversion is **state-dependent** (needs the pre-state to capture what to restore). The engine invokes it once per op during transaction commit and stores the results on the transaction for later undo.

### 6.3 `Patch`, `Command`, `Transaction`

```typescript
// packages/engine/src/patches.ts

export type Patch = readonly Op[];

// packages/engine/src/commands.ts

export type CommandId = string & { readonly __brand: "CommandId" };

export interface CommandMeta {
  readonly id: CommandId;
  readonly title: string;
  readonly category?: string;
  readonly label?: string;         // shown in the undo stack UI
  readonly scope?: "doc" | "selection" | "view";
  readonly coalesceKey?: string;   // see §6.5
}

export interface Command<Params = void> {
  readonly meta: CommandMeta;
  canRun(ctx: CommandContext, params: Params): boolean;
  run(ctx: CommandContext, params: Params): Result<Patch, CommandError>;
  computeSelectionAfter?(
    ctx: CommandContext, params: Params, patch: Patch
  ): Range | undefined;
}

export interface CommandContext {
  readonly doc: Document;
  readonly selection: SelectionSet;
  readonly idGen: IdGenPort;
  readonly clock: ClockPort;
  readonly random: RandomPort;
  readonly plugins: PluginRegistry;
  readonly log: LogPort;
}

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export interface CommandError {
  readonly code: "constraint" | "invalidArgs" | "schema" | "plugin" | "internal";
  readonly message: string;
  readonly cause?: unknown;
}

// packages/engine/src/transactions.ts

export interface Transaction {
  readonly id: NodeId;
  readonly label: string;
  readonly timestamp: IsoDateTime;
  readonly author?: string;
  readonly atomic: boolean;

  readonly ops: Patch;
  readonly inverse: Patch;                 // pre-computed at commit
  readonly coalesceKey?: string;

  readonly selectionBefore: SelectionSet;
  readonly selectionAfter: SelectionSet;

  readonly docVersionBefore: number;
  readonly docVersionAfter: number;
}

export interface HistoryState {
  readonly undo: readonly Transaction[];
  readonly redo: readonly Transaction[];
  readonly maxEntries: number;
  readonly maxBytes: number;
  readonly approxBytes: number;
}
```

### 6.4 Commit pipeline

```
dispatch(command, params)
  -> canRun? no -> Result.error
  -> run(ctx, params) -> Patch
  -> validate(patch, schema) -> reject or accept
  -> apply(doc, patch) -> { doc', inverse }
  -> computeSelectionAfter(patch) -> nextSelection
  -> freeze into Transaction
  -> maybe coalesce with prev txn
  -> push to undo, clear redo (unless extending)
  -> emit stateChanged
```

### 6.5 Coalescing

Certain rapid edits should collapse into a single undo entry.

```typescript
// packages/engine/src/transactions/coalesce.ts

export interface CoalesceRule {
  readonly key: string;                              // e.g. "typing", "format-bold"
  readonly windowMs: number;                         // default 1000
  readonly maxOps?: number;                          // default Infinity
  canExtend(prev: Transaction, next: Transaction): boolean;
  merge(prev: Transaction, next: Transaction): Transaction;
}

export const rules: readonly CoalesceRule[] = [
  {
    key: "typing",
    windowMs: 1000,
    canExtend: (a, b) =>
      a.coalesceKey === "typing" && b.coalesceKey === "typing" &&
      sameParagraph(a, b) &&
      isContiguousInsertion(a, b) &&
      !containsWordBoundary(a) && !containsWordBoundary(b),
    merge: mergeTxns,
  },
  {
    key: "backspace",
    windowMs: 1000,
    canExtend: (a, b) =>
      a.coalesceKey === "backspace" && b.coalesceKey === "backspace" &&
      sameParagraph(a, b) &&
      isContiguousDeletion(a, b),
    merge: mergeTxns,
  },
  {
    key: "format",
    windowMs: 1000,
    canExtend: (a, b) =>
      a.coalesceKey?.startsWith("format-") &&
      b.coalesceKey === a.coalesceKey &&
      overlappingSelections(a, b),
    merge: mergeTxns,
  },
];
```

Empirically, coalescing decisions follow Word's heuristics:

* Typing coalesces up to a word boundary (space, punctuation, Enter, arrow key, cursor click). After a boundary, a new transaction begins.
* Holding `Backspace` coalesces indefinitely — but pressing arrow keys or clicking ends the run.
* Direct format toggles (`Ctrl+B`) on the same selection within 1s merge.
* Any **structural** operation (split paragraph, insert table, change style) ends coalescing.

### 6.6 Undo/redo

```typescript
// packages/engine/src/transactions/history.ts

export interface HistoryPort {
  push(txn: Transaction): HistoryState;
  undo(): { doc: Document; selection: SelectionSet; txn: Transaction } | null;
  redo(): { doc: Document; selection: SelectionSet; txn: Transaction } | null;
  clear(): void;
  snapshot(): HistoryState;
}

export function applyInverse(doc: Document, txn: Transaction): Document {
  return applyPatch(doc, txn.inverse).doc;
}
```

On undo, we replay the inverse ops against the current document; the redo stack receives the original transaction so a subsequent redo replays `txn.ops`. Selection transitions: undo restores `selectionBefore`; redo restores `selectionAfter`.

### 6.7 Error handling on dispatch

If `command.run` returns `{ ok: false }`, the engine does nothing — no transaction is pushed. The error bubbles through the dispatch return so the UI can display a toast. If `applyPatch` throws in dev mode, the engine logs and throws; in prod it rolls back to the previous document snapshot (already immutable) and emits a telemetry event.

---

## 7. Command Registry

```typescript
// packages/engine/src/registry.ts

export interface CommandRegistry {
  register<P>(cmd: Command<P>): () => void;     // returns unregister
  get<P>(id: CommandId): Command<P> | undefined;
  list(filter?: (c: Command<any>) => boolean): readonly Command<any>[];
  dryRun<P>(id: CommandId, params: P, ctx: CommandContext): boolean;
}
```

The registry keys on `CommandMeta.id`. IDs are namespaced strings; the convention is `<plugin>.<verb>` (e.g. `"doc.insertText"`, `"tables.insertTable"`, `"styles.applyByName"`).

### 7.1 Built-in command IDs

| ID | Params | Purpose |
| -- | ------ | ------- |
| `doc.insertText` | `{ text: string }` | Insert at selection, replacing non-empty range. |
| `doc.insertBreak` | `{ kind: "line" \| "page" \| "column" }` | Insert break inline. |
| `doc.deleteBackward` | `{ unit: "char" \| "word" \| "line" \| "para" }` | Backspace variants. |
| `doc.deleteForward` | `{ unit: "char" \| "word" \| "line" \| "para" }` | Delete variants. |
| `doc.splitParagraph` | `{}` | Enter key. |
| `doc.setBold` | `{ on?: boolean }` | Toggle or force bold. |
| `doc.setItalic` / `doc.setUnderline` / ... | identical shape | |
| `doc.setRunProps` | `{ patch: Partial<RunProps> }` | General character formatting. |
| `doc.setParaProps` | `{ patch: Partial<ParaProps> }` | Paragraph formatting. |
| `doc.setStyle` | `{ styleRef: StyleId }` | Apply paragraph/character style. |
| `doc.setAlignment` | `{ justify: ParaProps["justify"] }` | |
| `doc.increaseIndent` / `doc.decreaseIndent` | `{}` | |
| `doc.selectAll` | `{}` | |
| `doc.moveCaret` | `MoveParams` | Unified caret motion. |
| `doc.extendSelection` | `MoveParams` | Selection with shift. |
| `doc.insertSectionBreak` | `{ type: SectionProps["type"] }` | |
| `tables.insertTable` | `{ rows: number; cols: number }` | Provided by plugin-tables. |
| `styles.apply` | `{ name: string }` | Provided by plugin-styles. |
| ... | | |

### 7.2 `canRun` and dry run

Every command's `canRun` is a **pure predicate** over `CommandContext`. The UI calls `dryRun("tables.insertRow", ctx)` to enable/disable a toolbar button; because `canRun` has no side effects, it is safe to call on every render without performance concern.

---

## 8. Selection Model

```typescript
// packages/engine/src/selection.ts

export type SelectionKind = "stream" | "rect";

export interface SelectionSet {
  readonly primary: Range;
  readonly secondaries?: readonly Range[];
  readonly kind: SelectionKind;
  readonly extendMode?: ExtendMode;     // F8 state
  readonly preserveColumn?: boolean;     // for up/down motion
  readonly virtualColumn?: number;       // pixel x for line motion
}

export type ExtendMode =
  | { level: "off" }
  | { level: "char" }   // press F8 once
  | { level: "word" }
  | { level: "sentence" }
  | { level: "paragraph" }
  | { level: "section" }
  | { level: "document" };
```

### 8.1 Commands that transition selection

Each core command optionally implements `computeSelectionAfter(ctx, params, patch) -> Range`. The engine then passes the resulting selection through **normalization** (§4.3) and any applicable constraints:

* Stream selection cannot cross a table/cell boundary in the middle; if a motion would cross, the engine clamps to the cell edge unless the caller passed `{ crossTables: true }`.
* Rect selection is valid only within a single table or only within the body outside tables (line-rect).
* Extend-mode transitions are governed by the state machine in `ExtendMode`:

```typescript
// packages/engine/src/selection/extend.ts

export function advanceExtendMode(m: ExtendMode): ExtendMode {
  switch (m.level) {
    case "off":       return { level: "word" };
    case "word":      return { level: "sentence" };
    case "sentence":  return { level: "paragraph" };
    case "paragraph": return { level: "section" };
    case "section":   return { level: "document" };
    case "document":  return { level: "document" };
    default:          return { level: "off" };
  }
}
```

Escape cancels extend mode; any content command resets to `"off"`.

### 8.2 Mapping selections through patches

After every patch, selections must be remapped to the new document. The engine walks the selection's anchor and focus, and for each op in the patch, applies a position transform:

```typescript
// packages/engine/src/selection/remap.ts

export function remapPosition(p: IdPosition, op: Op): IdPosition {
  switch (op.kind) {
    case "insertText": {
      if (p.leafId !== op.at.leafId) return p;
      if (p.offset >= op.at.offset) return { ...p, offset: p.offset + op.text.length };
      return p;
    }
    case "deleteRange": {
      const { anchor, focus } = op.range;
      const [start, end] = orderedEndpoints(anchor, focus);
      if (comparePositions(p, start) < 0) return p;
      if (comparePositions(p, end) <= 0) return { ...start };
      // p is after deleted region
      if (p.leafId === end.leafId) return { ...p, offset: p.offset - (end.offset - start.offset) };
      return p;
    }
    case "splitParagraph": {
      if (p.leafId !== /* original paragraph id */) return p;
      if (p.offset >= op.at.offset) return { leafId: op.newParagraphId, offset: p.offset - op.at.offset };
      return p;
    }
    case "joinParagraphs": {
      if (p.leafId === op.secondId) return { leafId: op.firstId, offset: /* firstLength */ + p.offset };
      return p;
    }
    // ... remaining ops
  }
}
```

When the command provides its own `computeSelectionAfter`, the engine prefers that result over the generic remap (commands know best).

---

## 9. Event Loop and Input Handling

### 9.1 Input pipeline

```
DOM event (keydown, input, paste, drop, compositionstart, ...)
      │
      ▼
 input-mapper (keyboard layout aware; modifier-aware)
      │
      ▼
 Intent (discriminated union; serializable)
      │
      ▼
 editor.dispatch(intent)
      │
      ├──► intent hander (pure)
      │        │
      │        ▼
      │   CommandInvocation { id, params } (optional)
      │        │
      │        ▼
      │   commandRegistry.get(id).run(ctx, params)
      │        │
      │        ▼
      │   Patch ─► transaction pipeline ─► stateChanged event
      │
      └──► selection-only intents transition selection without a patch
```

### 9.2 Intents

```typescript
// packages/engine/src/intents.ts

export type Intent =
  | InputCharIntent
  | InsertTextIntent
  | DeleteBackwardIntent
  | DeleteForwardIntent
  | SplitParagraphIntent
  | InsertBreakIntent
  | MoveCaretIntent
  | ExtendSelectionIntent
  | SelectAllIntent
  | FormatIntent
  | SetStyleIntent
  | PasteIntent
  | CopyIntent
  | CutIntent
  | UndoIntent
  | RedoIntent
  | CompositionStartIntent
  | CompositionUpdateIntent
  | CompositionEndIntent
  | CompositionCancelIntent
  | ImeStateIntent
  | KeymapIntent            // resolved keymap lookup → CommandInvocation
  | CommandIntent           // direct invocation bypassing keymap
  | AccessibilityIntent;

export interface InputCharIntent {
  readonly kind: "inputChar";
  readonly text: string;     // post-layout string for the keystroke
}

export interface MoveParams {
  readonly direction: "left" | "right" | "up" | "down" | "home" | "end" | "pageUp" | "pageDown";
  readonly unit: "char" | "word" | "line" | "paragraph" | "document";
  readonly visualLine: boolean;  // true for up/down after wrap
}

export interface MoveCaretIntent { readonly kind: "moveCaret"; readonly params: MoveParams }
export interface ExtendSelectionIntent { readonly kind: "extendSelection"; readonly params: MoveParams }

export interface FormatIntent {
  readonly kind: "format";
  readonly property: keyof RunProps | keyof ParaProps;
  readonly value: unknown;
}

export interface PasteIntent {
  readonly kind: "paste";
  readonly data: ClipboardPayload;
  readonly mode?: "default" | "plainText" | "matchFormatting" | "keepSource";
}

export interface ClipboardPayload {
  readonly formats: ReadonlyMap<string, Uint8Array | string>;
  readonly timestamp: IsoDateTime;
}

export interface CompositionStartIntent { readonly kind: "compositionStart"; readonly anchor: IdPosition }
export interface CompositionUpdateIntent { readonly kind: "compositionUpdate"; readonly text: string; readonly candidateRange?: [number, number] }
export interface CompositionEndIntent { readonly kind: "compositionEnd"; readonly text: string }
export interface CompositionCancelIntent { readonly kind: "compositionCancel" }

// ... other intent types similarly
```

### 9.3 IME / composition

IME composition is the single most failure-prone part of a custom editor. We treat it as a small state machine hosted on the EditorInstance:

```typescript
// packages/engine/src/ime.ts

export interface ImeState {
  readonly active: boolean;
  readonly anchor?: IdPosition;
  readonly baseline?: Document;          // snapshot at start
  readonly pendingText?: string;
  readonly candidateRange?: readonly [number, number];
  readonly overlayDecorationId?: NodeId;
}

export interface ImeController {
  start(anchor: IdPosition): void;
  update(text: string, candidateRange?: [number, number]): void;
  end(text: string): void;
  cancel(): void;
  isActive(): boolean;
}
```

Rules:

1. **`compositionstart`** — snapshot the anchor position and the current Document. Mark the editor as composing. While composing, we gate other commands: any command whose `meta.allowDuringComposition !== true` is rejected or deferred. A small whitelist (cursor motion, escape, window focus) is allowed because they feel broken otherwise.
2. **`compositionupdate`** — we do *not* modify the document. Instead, we inject a **decoration** (UI-only, see §10) that renders the pending composition visually. This preserves the pristine Document for undo and avoids churning the piece tree on every IME keystroke.
3. **`compositionend`** — we commit exactly one transaction that inserts `event.text` at `anchor` with the coalesce key `"ime"` (so consecutive commits merge within a window like typing does).
4. **Cancel** (Esc during composition or focus loss) — drop the decoration; do not commit.
5. **Undo during composition** — we cancel the composition first, then process the undo. This matches Word's behavior: Ctrl+Z during active IME dismisses the candidates; a second Ctrl+Z pops the last transaction.

We have a dedicated test suite (~150 scenarios) exercising:

* Multi-character CJK composition with candidate selection.
* Input-method switching mid-composition (English → Japanese).
* Dead keys and OS-composed diacritics (where the OS delivers a single `compositionend`).
* Bidi composition (Hebrew, Arabic) where the visual cursor is to the left of the logical anchor.
* Composition across a selection (starts by replacing the selection).
* Composition inside a table cell, inside a hyperlink, inside a comment-anchor range.

### 9.4 Clipboard

```typescript
// packages/engine/src/clipboard.ts

export interface ClipboardFormats {
  readonly "text/plain"?: string;
  readonly "text/html"?: string;
  readonly "text/rtf"?: string;
  readonly "application/vnd.openxmlformats-officedocument.wordprocessingml.document"?: Uint8Array;
  readonly "image/png"?: Uint8Array;
  readonly "image/jpeg"?: Uint8Array;
  readonly "image/svg+xml"?: string;
  readonly [other: string]: Uint8Array | string | undefined;
}

export interface PasteNormalizer {
  /** Given a payload and context, return a Patch (or error). Should choose best format. */
  normalize(payload: ClipboardFormats, ctx: CommandContext, mode: PasteIntent["mode"]): Result<Patch, CommandError>;
}
```

Format priority (default paste):

1. `application/vnd.openxmlformats-officedocument.wordprocessingml.document` — use the DOCX serializer (via a port) to deserialize into domain and graft. Highest fidelity.
2. `text/html` — use a safe sanitizing HTML→domain converter (separate plugin; see infrastructure doc).
3. `text/rtf` — RTF→domain converter.
4. `image/*` — insert as `DrawingRun` with a new `Image`.
5. `text/plain` — last resort; insert as runs with `RunProps` inherited from caret's current style.

"Paste Special" dialog (plugin-UI) forces a specific format via `PasteIntent.mode === "keepSource" | "matchFormatting" | "plainText"`. "Match formatting" rewrites incoming runs to adopt caret style; "Keep source" preserves incoming RunProps verbatim.

Clipboard writes (copy/cut) generate all supported formats so external apps can pick the best.

---

## 10. Plugin API

Plugins are the **only** way the engine gets features beyond text and paragraphs. The core cannot even format bold if plugin-styles is disabled, because `RunProps.styleRef` resolution is a plugin. This keeps the core small and testable.

### 10.1 Plugin shape

```typescript
// packages/engine/src/plugins/api.ts

export interface Plugin {
  readonly id: string;                        // "tables", "lists", "styles", ...
  readonly version: string;                   // semver
  readonly dependsOn?: readonly string[];     // plugin ids
  readonly provides?: readonly string[];      // feature ids surfaced for other plugins

  init?(ctx: PluginContext): PluginHandle | Promise<PluginHandle>;
}

export interface PluginContext {
  readonly editor: EditorInstance;
  readonly schema: SchemaBuilder;
  readonly commands: CommandRegistry;
  readonly intents: IntentRegistry;
  readonly keymap: Keymap;
  readonly decorations: DecorationRegistry;
  readonly state: StateSliceHost;
  readonly serializers: SerializerRegistry;
  readonly log: LogPort;
  readonly clock: ClockPort;
  readonly idGen: IdGenPort;
}

export interface PluginHandle {
  dispose?(): void;
  onDocumentChange?(event: DocChangeEvent): void;
  onSelectionChange?(event: SelectionChangeEvent): void;
  onBeforeDispatch?(intent: Intent): Intent | null;  // filter/rewrite
  onAfterCommit?(txn: Transaction): void;
}

export interface DocChangeEvent {
  readonly prev: Document;
  readonly next: Document;
  readonly txn: Transaction;
}

export interface SelectionChangeEvent {
  readonly prev: SelectionSet;
  readonly next: SelectionSet;
}
```

### 10.2 Schema extensions

```typescript
// packages/engine/src/plugins/schema.ts

export interface SchemaBuilder {
  addNodeType(spec: NodeTypeSpec): void;
  addMark(spec: MarkSpec): void;
  addInlineKind(kind: string): void;
  addBlockKind(kind: string): void;
  buildSchema(): Schema;
}

export interface NodeTypeSpec {
  readonly name: NodeType;
  readonly category: "block" | "inline" | "meta";
  readonly content?: string;    // PM-like content expression, e.g. "run*"
  readonly atom?: boolean;
  readonly selectable?: boolean;
  readonly attrs?: Record<string, AttrSpec>;
  readonly marks?: readonly string[];
}

export interface AttrSpec {
  readonly default?: unknown;
  readonly validate?(v: unknown): boolean;
}

export interface MarkSpec {
  readonly name: string;
  readonly attrs?: Record<string, AttrSpec>;
  readonly inclusive?: boolean;   // extends when typing at boundary
  readonly excludes?: readonly string[];
  readonly spanning?: boolean;
}
```

### 10.3 Command and intent registration

```typescript
// packages/engine/src/plugins/commands.ts

export interface IntentRegistry {
  register<I extends Intent>(
    kind: I["kind"],
    handler: (intent: I, ctx: CommandContext) => CommandInvocation | null | Intent
  ): () => void;
}

export interface CommandInvocation {
  readonly id: CommandId;
  readonly params: unknown;
}
```

Intents funnel into handlers; handlers map them to command invocations (possibly deciding among several based on state). Plugins register handlers for their own intent kinds and may also override built-in handlers (e.g., plugin-autocomplete wraps `InputCharIntent` to optionally insert a suggestion).

### 10.4 Keymap

```typescript
// packages/engine/src/keymap.ts

export interface KeyBinding {
  readonly keys: string;                      // canonical, e.g. "Mod+Shift+B"
  readonly intent: IntentKind | CommandInvocation;
  readonly when?: WhenExpr;                   // predicate over state
  readonly priority?: number;
}

export type IntentKind = Intent["kind"];

export interface Keymap {
  bind(binding: KeyBinding): () => void;
  resolve(event: KeyEventLike, state: EditorState): KeyBinding | undefined;
  list(): readonly KeyBinding[];
}

export interface KeyEventLike {
  readonly key: string;
  readonly code: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly metaKey: boolean;
  readonly repeat: boolean;
}

export interface WhenExpr {
  evaluate(state: EditorState): boolean;
}
```

Key normalization: "Mod" maps to `Cmd` on macOS and `Ctrl` elsewhere; the keymap stores bindings in a normalized form and performs layout-aware lookup. Chords (two-step bindings like `Ctrl+K, Ctrl+C`) are supported via a pending-chord state on the editor instance with a timeout (default 1500ms).

### 10.5 Decorations

Decorations are **UI-only** annotations: spell-check underlines, comment highlights, match-highlight during Find, selection overlays for collaborators. They never change the domain.

```typescript
// packages/engine/src/plugins/decorations.ts

export type DecorationId = string & { readonly __brand: "DecorationId" };

export type Decoration =
  | InlineDecoration
  | BlockDecoration
  | WidgetDecoration;

export interface InlineDecoration {
  readonly id: DecorationId;
  readonly kind: "inline";
  readonly range: Range;
  readonly attrs: { class?: string; style?: Record<string, string>; title?: string };
  readonly marks?: readonly Mark[];
  readonly hoverable?: boolean;
}

export interface BlockDecoration {
  readonly id: DecorationId;
  readonly kind: "block";
  readonly blockId: NodeId;
  readonly attrs: { class?: string; style?: Record<string, string> };
}

export interface WidgetDecoration {
  readonly id: DecorationId;
  readonly kind: "widget";
  readonly at: IdPosition;
  readonly widget: WidgetFactory;
  readonly side?: -1 | 1;
}

export interface WidgetFactory {
  readonly type: string;
  readonly renderProps: unknown;  // props handed to the React renderer
}

export interface DecorationRegistry {
  add(dec: Decoration): () => void;
  update(id: DecorationId, patch: Partial<Decoration>): void;
  remove(id: DecorationId): void;
  query(range: Range): readonly Decoration[];
  all(): readonly Decoration[];
}
```

### 10.6 State slices

Plugins can carry their own state next to the Document. Find-in-document has a "current match" index; Track Changes has per-user pending-change counters. The engine exposes a typed `StateSliceHost`:

```typescript
// packages/engine/src/plugins/state.ts

export interface StateSliceHost {
  register<S>(key: string, initial: S, opts?: StateSliceOptions<S>): StateSlice<S>;
  get<S>(key: string): StateSlice<S> | undefined;
}

export interface StateSliceOptions<S> {
  readonly reducer?(state: S, txn: Transaction, prevDoc: Document, nextDoc: Document): S;
  readonly persist?(state: S): unknown;       // round-trip into DOCX where applicable
  readonly hydrate?(persisted: unknown): S;
}

export interface StateSlice<S> {
  read(): S;
  update(next: S | ((prev: S) => S)): void;
  subscribe(listener: (s: S) => void): () => void;
}
```

### 10.7 Serializers

```typescript
// packages/engine/src/plugins/serializers.ts

export interface SerializerRegistry {
  /** DOCX read hooks: plugins claim XML element namespaces. */
  registerXmlReader<T>(entry: XmlReaderEntry<T>): () => void;
  registerXmlWriter<T>(entry: XmlWriterEntry<T>): () => void;

  /** Internal snapshot serialization used for scenario tests. */
  registerSnapshotMapper<T>(entry: SnapshotMapperEntry<T>): () => void;
}

export interface XmlReaderEntry<T> {
  readonly namespace: string;
  readonly localName: string;
  readonly parent?: string;              // optional context-restriction
  read(ctx: XmlReadContext, element: XmlElement): T | null;
}

export interface XmlWriterEntry<T> {
  readonly match(node: T): boolean;
  write(ctx: XmlWriteContext, node: T): XmlElement;
}
```

DOCX serialization lives in the infrastructure package but the per-element logic for each plugin ships *with* the plugin so the core stays ignorant of w: namespaces.

### 10.8 Lifecycle

```
load    — plugin module discovered (from bundle or dynamic import)
register— Plugin record added, dependencies resolved, topologically ordered
init    — plugin.init(ctx) runs; may be async
         — schema extensions committed; commands/intents/keymap/decorations registered
validate— schema is frozen and validated (cycle-free; content expressions parse)
activate— editor begins dispatching intents to handlers
dispose — on editor close, handlers disposed in reverse order
```

### 10.9 Built-in plugin catalogue

| Plugin | Core responsibility |
| ------ | ------------------- |
| `plugin-styles` | Style registry edits, style commands, style gallery (via decorations). |
| `plugin-tables` | Table/Row/Cell schema, table commands, tab navigation, conversion text↔table. |
| `plugin-lists` | Numbering registry, list-level commands, Tab/Shift+Tab for indent, auto-number continuation. |
| `plugin-footnotes` | Footnote insertion, reference markers, numbering restart rules. |
| `plugin-endnotes` | Analogous to footnotes. |
| `plugin-comments` | Comment creation, threading, resolve/unresolve. |
| `plugin-track-changes` | Per-op revision recording (ins/del/pPrChange/rPrChange), accept/reject. |
| `plugin-fields` | Field insertion, result computation, code toggling, MERGEFIELD support. |
| `plugin-bookmarks` | Named range management; bookmark commands. |
| `plugin-hyperlinks` | Hyperlink insertion/edit; external & internal anchors. |
| `plugin-drawings` | Drawing object lifecycle; wrapping modes. |
| `plugin-images` | Image insertion via `BlobRef`; resize, crop, alt-text. |
| `plugin-frames` | Text frames and drop-caps. |
| `plugin-mailmerge` | Data-source binding and merge execution (preview + generate). |
| `plugin-spellcheck` | Async worker producing inline decorations; port-based backend. |
| `plugin-autocorrect` | Typing-intercept replacements; keeps a per-editor dictionary. |
| `plugin-autoformat` | On-type rules (dashes, smart quotes, bullet creation). |
| `plugin-macros-preserve` | Reads/writes `vbaProject.bin` untouched; does **not** execute. |

Plugins not required by Word 95 parity live in optional bundles (e.g., real-time collab, AI suggestions) and are disabled by default.

---

## 11. Schema

We adopt a ProseMirror-style schema: each node type declares what children it can contain, and each block declares what inline marks may attach. The schema is **closed** at plugin activation — after that, no further extensions.

```typescript
// packages/engine/src/schema.ts

export interface Schema {
  readonly nodes: ReadonlyMap<NodeType, NodeTypeSpec>;
  readonly marks: ReadonlyMap<string, MarkSpec>;
  readonly root: NodeType;               // always "document"

  /** Parses the content expression of `nodeType` into a matcher. */
  contentMatcher(nodeType: NodeType): ContentMatcher;
  validate(node: NodeBase): ReadonlyArray<SchemaViolation>;
}

export interface ContentMatcher {
  matches(children: readonly NodeBase[]): boolean;
  matchPrefix(children: readonly NodeBase[]): number;   // longest valid prefix
}

export interface Mark {
  readonly type: string;
  readonly attrs?: Readonly<Record<string, unknown>>;
}

export interface SchemaViolation {
  readonly code: "badContent" | "badAttr" | "missingAttr" | "orphanMark";
  readonly nodeId: NodeId;
  readonly detail: string;
}
```

Default content expressions:

* `document`: `section+`
* `section`: `(paragraph | table)+` terminated by a paragraph with `sectPr`.
* `paragraph`: `(run | fieldRun | hyperlinkRun | drawingRun | commentMarker | bookmarkMarker | footnoteMarker | endnoteMarker | break)*`
* `table`: `row+`
* `row`: `cell+`
* `cell`: `(paragraph | table)+`
* `run`: atom; no children

Plugin-tables augments `row` and `cell` with its own attr validations; plugin-footnotes inserts `footnote` at the root.

### 11.1 Validator hooks

In dev mode, after every transaction commit the engine runs the schema validator on all paragraphs touched by the transaction (tracked in `Transaction.touchedIds`). Violations `throw` so tests fail loudly. In prod, violations log telemetry and the engine rolls back to the pre-transaction document.

### 11.2 Schema-aware ops

`SplitParagraph` respects schema: in a paragraph inside a table cell, splitting creates a new paragraph inside that same cell (schema permits `paragraph+` in a cell). `JoinParagraphs` rejects joins across different containers (cell boundary, section boundary, table boundary). `InsertBlock` of a `Table` inside a paragraph is translated by the engine into split-then-insert-at-block-gap.

---

## 12. Undo/Redo Correctness

### 12.1 Property-based tests

With `fast-check`, we generate random command sequences (biased toward realistic ratios of insertion/deletion/format) and assert the invariants:

1. After applying N commands and then undoing all N, the document equals the initial document byte-for-byte (including `PropsRegistry`, after interning-stable canonicalization).
2. Redo after undo re-applies exactly what was undone.
3. Selection after undo matches `txn.selectionBefore`; selection after redo matches `txn.selectionAfter`.

### 12.2 Replay idempotency

Transactions include all data needed to replay without consulting the original pre-state (e.g., `OpInsertText` carries `runPropsId` rather than relying on the caret's current style). This means a transaction log is a complete reproducer of the session.

### 12.3 Memory bounds

```typescript
// packages/engine/src/transactions/history.ts (augmented)

export interface HistoryOptions {
  readonly maxEntries: number;          // default 500
  readonly maxBytes: number;            // default 50 MB
  readonly coalesceEnabled: boolean;
  readonly groupLabel?: string;          // used by external "begin group" APIs
}
```

When either cap is exceeded we drop oldest transactions. Because transactions reference domain snapshots by value (via the inverse patch), dropping a txn releases its references and its bytes.

### 12.4 External group boundaries

For multi-intent user actions (e.g., "Find and Replace All"), the plugin calls `history.beginGroup("Replace All")` and `history.endGroup()` to commit several transactions atomically to the undo stack. The group appears as a single undoable entry.

---

## 13. Concurrency Model

The authoritative editor state lives in the main renderer process. We do **not** run multiple authoritative writers. However we *do* run multiple readers:

* Layout worker (computes line breaks, pages)
* Spellcheck worker
* Search worker
* Thumbnail worker

Readers receive a Document snapshot via `structuredClone({ transfer: ... })` optimized path: because the Document is a persistent structure, we transfer a **version handle** and the worker uses a proxy accessor that fetches branches on demand (messagechannel-based). In practice, this is cheap because most branches are shared with the worker's previous version.

```typescript
// packages/engine/src/concurrency.ts

export interface Snapshot {
  readonly version: number;
  readonly doc: Document;
}

export interface WorkerResult<T> {
  readonly version: number;
  readonly result: T;
}

export interface WorkerCoordinator {
  submit<P, R>(worker: "layout" | "spellcheck" | "search" | "thumbnail", task: P): Promise<WorkerResult<R>>;
  cancelAllFor(version: number): void;
}
```

Stale results (where `result.version < current.version`) are discarded by the consumer, or the coordinator applies an incremental diff to the current state if the reader declares compatibility.

Workers never hold mutable references to Document. Their output types (e.g., `LineBreaks`, `SpellRanges`) are value types specific to the worker.

---

## 14. IME and Composition Edge Cases

Beyond the rules in §9.3, here are the edge cases we explicitly test and the strategy for each:

1. **CJK candidate list** — the user types `nihao` and the IME shows a candidate list. We never commit until `compositionend`. The underlying document is unchanged; only a widget decoration shows the candidate ghost text. On candidate selection, OS fires `compositionupdate` with the chosen text (still not committed to domain), then `compositionend` with the final string.

2. **Dead keys** (French, German) — the OS delivers a single `compositionend` with the composed character (e.g., "é"). We insert it as one `InsertText` op.

3. **Bidi composition** — when composing Arabic, the visual caret is to the left of the logical anchor. We render the decoration at the logical position; the renderer handles the visual flip based on the resolved direction of the surrounding run. The anchor stored in `ImeState` is logical.

4. **Composition across a selection** — `compositionstart` detects a non-empty selection and immediately issues a `deleteRange` op to collapse it; the anchor becomes the collapse point. On `compositionend` we commit the insert. The undo entry appears as two ops (delete + insert) rolled into one transaction labeled "Input".

5. **Undo during composition** — `undo` intent during composition first fires `compositionCancel` (clearing the decoration), then pops the last completed transaction.

6. **Undo of IME commit** — each `compositionend` commit is one transaction; undo rolls back the whole composed phrase. We do **not** allow undo to break in the middle of a multi-character CJK phrase.

7. **Focus lost during composition** — most OSes deliver an implicit `compositionend` before losing focus. Where they do not (older Linux IMs), we listen for focus-out and synthesize `compositionCancel`.

8. **Composition inside protected ranges** (e.g., track-changes rejected region, table heading row) — the `canRun` of `doc.insertText` returns false, so `compositionstart` is immediately canceled and the OS cursor is blocked.

---

## 15. Accessibility Tree Export

The engine exposes a live accessible tree for screen readers. The renderer consumes this tree via a port (the React UI hooks an ARIA treegrid / rowgroup; the OS AX layer uses IAccessible2 / NSAccessibility). The tree is itself immutable and structurally shared across versions.

```typescript
// packages/engine/src/accessibility.ts

export interface AccessibilityNode {
  readonly id: NodeId;
  readonly role: AxRole;
  readonly name?: string;               // accessible name
  readonly description?: string;
  readonly level?: number;              // heading level, list depth
  readonly positionInSet?: number;
  readonly setSize?: number;
  readonly value?: string;
  readonly state?: AxState;
  readonly children?: readonly AccessibilityNode[];
  readonly anchor: IdPosition;          // doc position for focus mapping
}

export type AxRole =
  | "document" | "group" | "paragraph" | "heading" | "list" | "listitem"
  | "table" | "row" | "columnheader" | "rowheader" | "cell"
  | "graphic" | "link" | "comment" | "note" | "footnote" | "endnote"
  | "textbox" | "button" | "region" | "header" | "footer";

export interface AxState {
  readonly selected?: boolean;
  readonly readonly?: boolean;
  readonly invalid?: "spelling" | "grammar" | false;
  readonly expanded?: boolean;
  readonly linkVisited?: boolean;
}

export interface AccessibilityPort {
  tree(doc: Document): AccessibilityNode;
  liveRegion(update: LiveRegionUpdate): void;
}

export interface LiveRegionUpdate {
  readonly politeness: "polite" | "assertive";
  readonly text: string;
  readonly source: "structural" | "selection" | "save" | "error";
}
```

Live-region triggers (announced by screen readers as transient notifications):

* Structural: "Inserted table, 3 rows by 4 columns."
* Navigation: "Heading 1 level 2: Chapter Two."
* Save: "Document saved."
* Errors: "Unable to apply formatting."

---

## 16. Deterministic IDs

```typescript
// packages/engine/src/ports/idgen.ts

export interface IdGenPort {
  newId(): NodeId;
  newDocChildId(doc: Document): NodeId;  // optional: allows ID generation that avoids collision
}

export class NanoIdGen implements IdGenPort {
  constructor(private readonly rng: () => number, private readonly alphabet: string = DEFAULT_ALPHABET) {}
  newId(): NodeId {
    let out = "";
    for (let i = 0; i < 21; i++) {
      out += this.alphabet[Math.floor(this.rng() * this.alphabet.length)];
    }
    return asNodeId(out);
  }
}

export function createSeededIdGen(seed: number): IdGenPort {
  const rng = mulberry32(seed);
  return new NanoIdGen(rng);
}

function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

In tests, `createSeededIdGen(42)` produces a deterministic stream. Snapshot tests use this seed so output is byte-identical across runs.

**Stability:** The engine treats a node ID as a permanent identifier from creation to deletion. Splitting a paragraph mints a *new* ID for the tail; the head retains its original ID. Joining preserves the first paragraph's ID. This rule is load-bearing for comments and bookmarks: a comment anchored to paragraph P survives unless P is removed, in which case the comment's range is normalized to the nearest surviving neighbor (or marked orphaned).

---

## 17. Purity and Effects

### 17.1 Pure domain

`@word/domain` has no imports outside TypeScript stdlib and `@word/id-alphabet` (a constant). It contains no classes with mutable fields (only `readonly`), no singletons, no async functions, and no I/O.

### 17.2 Ports

Services with effects are declared as **ports** — pure TypeScript interfaces defined in `@word/engine/ports`. The engine consumes them; infrastructure implements them.

```typescript
// packages/engine/src/ports/index.ts

export interface ClockPort {
  now(): IsoDateTime;
  monotonicMs(): number;
}

export interface RandomPort {
  next(): number;        // [0, 1)
  bytes(n: number): Uint8Array;
}

export interface LogPort {
  trace(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface SpellCheckPort {
  suggest(word: string, lang: string): Promise<readonly string[]>;
  check(text: string, lang: string): Promise<readonly SpellIssue[]>;
}

export interface FontMetricsPort {
  advance(family: string, sizeHalfPt: number, ch: string, attrs: Partial<RunProps>): number;
  ascent(family: string, sizeHalfPt: number): number;
  descent(family: string, sizeHalfPt: number): number;
  xHeight(family: string, sizeHalfPt: number): number;
  hasGlyph(family: string, codepoint: number): boolean;
}

export interface FieldRuntimePort {
  evaluate(code: string, ctx: FieldEvalContext): Promise<FieldEvaluation>;
}

export interface ClipboardPort {
  read(): Promise<ClipboardPayload>;
  write(formats: ClipboardFormats): Promise<void>;
}
```

Tests supply stub implementations (`FakeClock`, `FixedRandom`, `SilentLog`). Production supplies Electron-bridged implementations.

---

## 18. Plugin Example — `plugin-tables`

This is the shape of a feature plugin. It is self-contained; the engine's `@word/engine` package has no knowledge of tables.

```typescript
// packages/engine/src/plugins-built-in/tables/index.ts

export const tablesPlugin: Plugin = {
  id: "tables",
  version: "1.0.0",
  provides: ["schema:table", "commands:tables.*"],
  async init(ctx) {
    registerSchema(ctx);
    const unsubs = [
      registerCommands(ctx),
      registerKeymap(ctx),
      registerSerializer(ctx),
      registerDecorations(ctx),
    ];
    return {
      dispose() { unsubs.forEach(u => u()); },
    };
  },
};

function registerSchema(ctx: PluginContext): void {
  ctx.schema.addNodeType({
    name: "table",
    category: "block",
    content: "row+",
    attrs: { tblGrid: { validate: v => Array.isArray(v) && v.every(n => typeof n === "number") } },
  });
  ctx.schema.addNodeType({ name: "row", category: "block", content: "cell+" });
  ctx.schema.addNodeType({ name: "cell", category: "block", content: "(paragraph | table)+" });
}

function registerCommands(ctx: PluginContext): () => void {
  const unsub1 = ctx.commands.register(insertTableCommand);
  const unsub2 = ctx.commands.register(insertRowCommand);
  const unsub3 = ctx.commands.register(insertColumnCommand);
  const unsub4 = ctx.commands.register(deleteRowCommand);
  const unsub5 = ctx.commands.register(deleteColumnCommand);
  const unsub6 = ctx.commands.register(mergeCellsCommand);
  const unsub7 = ctx.commands.register(splitCellCommand);
  const unsub8 = ctx.commands.register(convertTextToTableCommand);
  const unsub9 = ctx.commands.register(autoFormatCommand);
  return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); unsub6(); unsub7(); unsub8(); unsub9(); };
}

export interface InsertTableParams {
  readonly rows: number;
  readonly cols: number;
  readonly widthTwips?: number;
  readonly styleRef?: StyleId;
}

const insertTableCommand: Command<InsertTableParams> = {
  meta: {
    id: asCommandId("tables.insertTable"),
    title: "Insert Table",
    label: "Insert Table",
    category: "tables",
    scope: "doc",
  },
  canRun(ctx) {
    // can't insert a table inside another table's cell if it would violate schema depth (we allow 1 level of nesting)
    return !isInsideDeeplyNestedTable(ctx.selection.primary, ctx.doc);
  },
  run(ctx, params) {
    if (params.rows <= 0 || params.cols <= 0 || params.rows > 500 || params.cols > 63) {
      return { ok: false, error: { code: "invalidArgs", message: "invalid table dimensions" } };
    }
    const tblGrid = evenlyDistributeColumns(params.widthTwips ?? DEFAULT_TABLE_WIDTH_TWIPS, params.cols);
    const tableId = ctx.idGen.newId();
    const rowsArr: Row[] = [];
    for (let r = 0; r < params.rows; r++) {
      const cells: Cell[] = [];
      for (let c = 0; c < params.cols; c++) {
        const paraId = ctx.idGen.newId();
        const para: Paragraph = {
          id: paraId,
          type: "paragraph",
          attrs: { paraPropsId: emptyParaPropsId(ctx.doc) },
          children: [],
        };
        cells.push({
          id: ctx.idGen.newId(),
          type: "cell",
          attrs: { cellPropsId: emptyCellPropsId(ctx.doc) },
          children: [para],
        });
      }
      rowsArr.push({
        id: ctx.idGen.newId(),
        type: "row",
        attrs: { rowPropsId: emptyRowPropsId(ctx.doc) },
        children: cells,
      });
    }
    const table: Table = {
      id: tableId,
      type: "table",
      attrs: {
        tablePropsId: mintTablePropsId(ctx.doc, { styleRef: params.styleRef }),
        tblGrid,
      },
      children: rowsArr,
    };

    const insertPoint = computeInsertPoint(ctx.selection.primary, ctx.doc);
    const patch: Patch = [
      { kind: "insertBlock", at: insertPoint, block: table },
    ];
    return { ok: true, value: patch };
  },
  computeSelectionAfter(ctx, params, patch) {
    // caret goes into the first cell's first paragraph
    const table = patch.find(o => o.kind === "insertBlock") as OpInsertBlock;
    const firstRow = (table.block as Table).children[0];
    const firstCell = firstRow.children[0];
    const firstPara = firstCell.children[0] as Paragraph;
    const pos: IdPosition = { leafId: firstPara.id, offset: 0 };
    return { anchor: pos, focus: pos };
  },
};

function registerKeymap(ctx: PluginContext): () => void {
  const u1 = ctx.keymap.bind({
    keys: "Tab",
    when: whenInsideTable,
    intent: { id: asCommandId("tables.nextCell"), params: {} },
  });
  const u2 = ctx.keymap.bind({
    keys: "Shift+Tab",
    when: whenInsideTable,
    intent: { id: asCommandId("tables.prevCell"), params: {} },
  });
  return () => { u1(); u2(); };
}

function registerSerializer(ctx: PluginContext): () => void {
  const r1 = ctx.serializers.registerXmlReader({
    namespace: W_NS, localName: "tbl",
    read: readTableElement,
  });
  const w1 = ctx.serializers.registerXmlWriter<Table>({
    match: n => n.type === "table",
    write: writeTableElement,
  });
  return () => { r1(); w1(); };
}

function registerDecorations(ctx: PluginContext): () => void {
  // gridlines when enabled in view settings; column-resize handles
  return ctx.editor.events.on("viewSettingsChanged", (settings) => {
    if (settings.showGridlines) addGridlineDecorations(ctx);
    else clearGridlineDecorations(ctx);
  });
}
```

Sample key behavior in `tables.nextCell`:

```typescript
const nextCellCommand: Command = {
  meta: {
    id: asCommandId("tables.nextCell"),
    title: "Next Cell",
    scope: "selection",
  },
  canRun: (ctx) => isInsideTable(ctx.selection.primary, ctx.doc),
  run(ctx) {
    const loc = locateCell(ctx.selection.primary, ctx.doc);
    if (!loc) return { ok: false, error: { code: "constraint", message: "not in table" } };
    const next = findNextCell(loc, ctx.doc);
    if (next) {
      return { ok: true, value: [] }; // selection-only transition via computeSelectionAfter
    }
    // we're in the last cell — insert a new row
    return insertRowCommand.run(ctx, { tableId: loc.tableId, after: loc.row });
  },
  computeSelectionAfter(ctx, _params, _patch) {
    const loc = locateCell(ctx.selection.primary, ctx.doc);
    if (!loc) return undefined;
    const next = findNextCell(loc, ctx.doc);
    if (!next) return undefined;
    const firstPara = next.cell.children[0] as Paragraph;
    const p: IdPosition = { leafId: firstPara.id, offset: 0 };
    return { anchor: p, focus: { ...p, offset: paragraphLength(firstPara) } };
  },
};
```

---

## 19. Library Comparison

We evaluated mainstream editor frameworks and concluded that none can meet Word-95 parity, especially for multi-page layout and tables-in-tables. Here is a fair assessment.

### 19.1 ProseMirror

Strengths:

* Beautiful schema/transaction design with transforms built from ops with well-defined inverses.
* Separate model from view; model is pure.
* Great docs; stable for years.

Weaknesses:

* View is DOM-centric; it leverages `contenteditable` on the top-level editor, inheriting the bug surface of `contenteditable` that Word cannot afford.
* No multi-page layout; no pagination; no headers/footers/footnotes at the renderer level.
* Tables plugin is famously fragile — nested tables, column merge, and row-merge have long-standing issues.
* No persistence-layer separation; serializers are DOM-based.

**We borrow:** schema design, transform/step pattern (our `Op`), selection remapping algorithms. **We reject:** DOM rendering.

### 19.2 Slate

Strengths: ergonomic, declarative, TS-first.

Weaknesses: perf at scale is uneven; consistent invariants are a recurring community complaint; table support is weak; DOM-editable; schema is permissive.

### 19.3 Lexical

Strengths: Facebook-backed; reconciler-based tree; good at diffing to the DOM.

Weaknesses: pagination is not a first-class concept; headless layout absent; plugin API less mature than PM's.

### 19.4 Draft.js

Deprecated.

### 19.5 Quill

Uses "Deltas" — a linear op-list format. Strong for simple rich text, weak for nested structures like tables, images with anchors, and anything that needs a tree. No pagination. Fine for a blog editor; insufficient for Word.

### 19.6 TipTap

A ProseMirror wrapper with a nicer API. Inherits PM's pagination limitations.

### 19.7 CKEditor 5 and TinyMCE

Mature, feature-rich, but DOM-`contenteditable`. CKEditor 5 has a nice model layer (also inspired by PM) but shares the renderer problem. Neither produces print-identical DOCX pages.

### 19.8 Why build our own

For Word-95 parity we *must* control:

* Pagination (exact line/page breaks that match Word's line breaker).
* Typography (kerning, grid snapping for East Asian layouts).
* Section model (columns, headers/footers, continuous/nextPage breaks).
* DOCX round-trip fidelity including obscure parts (VBA project, custom XML, mathML, OLE embeddings).

None of the frameworks above even attempt this. Building on top of them would leak their limitations into our product. Instead we borrow their best ideas (PM's schema+transform, VS Code's piece-tree, Lexical's reconciler spirit) and compose them in a domain-focused architecture.

### 19.9 Risks and mitigation

| Risk | Mitigation |
| ---- | ---------- |
| Custom editors notoriously break under IME | ~150-case IME test suite; explicit state machine; decoration-based preview |
| Accessibility regressions | AX tree as a first-class port; automated assertions on structure |
| Performance regressions | Property-based benchmarks; frame budget tests on 100-page documents |
| Spec ambiguity in DOCX/ECMA-376 | Reference implementations (Word, LibreOffice) compared on a corpus of ~5000 files |
| Selection and caret math bugs | Property-based tests; model/view separation |
| Complex coalescing behaviors diverging from Word | Record Word's behavior with instrumentation and mirror its heuristics |

---

## 20. Consolidated TypeScript Interfaces

This section collects the key interfaces for reference. Each has appeared earlier; gathering them here gives a reader the whole shape of the API at a glance.

```typescript
// =============================================================
// packages/engine/src/editor.ts
// =============================================================

export interface EditorInstance {
  readonly id: NodeId;
  readonly state: EditorState;

  dispatch(intent: Intent): DispatchResult;
  command<P>(id: CommandId, params: P): DispatchResult;
  dryRun<P>(id: CommandId, params: P): boolean;

  subscribe(fn: (state: EditorState, change: StateChange) => void): () => void;
  snapshot(): Snapshot;

  readonly history: HistoryPort;
  readonly plugins: PluginRegistry;
  readonly clipboard: ClipboardPort;
  readonly keymap: Keymap;
  readonly decorations: DecorationRegistry;
  readonly schema: Schema;
  readonly ports: PortsBundle;
  readonly events: EventBus;
}

export interface EditorState {
  readonly doc: Document;
  readonly selection: SelectionSet;
  readonly ime: ImeState;
  readonly pluginState: ReadonlyMap<string, unknown>;
  readonly version: number;
}

export interface StateChange {
  readonly kind: "commit" | "selectionOnly" | "imeOnly" | "pluginState";
  readonly transaction?: Transaction;
  readonly before: EditorState;
  readonly after: EditorState;
}

export type DispatchResult =
  | { readonly kind: "applied"; readonly txn: Transaction }
  | { readonly kind: "selectionOnly"; readonly next: SelectionSet }
  | { readonly kind: "rejected"; readonly error: CommandError }
  | { readonly kind: "deferred"; readonly reason: "composition" | "readonly" }
  | { readonly kind: "noop" };

// Bundled ports for wiring by the host
export interface PortsBundle {
  readonly idGen: IdGenPort;
  readonly clock: ClockPort;
  readonly random: RandomPort;
  readonly log: LogPort;
  readonly spellcheck?: SpellCheckPort;
  readonly fontMetrics?: FontMetricsPort;
  readonly fieldRuntime?: FieldRuntimePort;
  readonly clipboard?: ClipboardPort;
  readonly accessibility?: AccessibilityPort;
}

// =============================================================
// packages/engine/src/events.ts
// =============================================================

export interface EventBus {
  on<K extends keyof EngineEvents>(k: K, fn: (e: EngineEvents[K]) => void): () => void;
  emit<K extends keyof EngineEvents>(k: K, e: EngineEvents[K]): void;
}

export interface EngineEvents {
  stateChanged: StateChange;
  commandDispatched: { id: CommandId; result: DispatchResult };
  pluginActivated: { id: string };
  pluginDisposed: { id: string };
  viewSettingsChanged: ViewSettings;
}

export interface ViewSettings {
  readonly showGridlines?: boolean;
  readonly showFormatting?: boolean;
  readonly showBoundaries?: boolean;
  readonly zoom?: number;
  readonly ruler?: boolean;
  readonly formattingMarks?: boolean;
}

// =============================================================
// packages/engine/src/plugins/registry.ts
// =============================================================

export interface PluginRegistry {
  load(plugin: Plugin): Promise<void>;
  unload(id: string): Promise<void>;
  byId(id: string): PluginRecord | undefined;
  list(): readonly PluginRecord[];
}

export interface PluginRecord {
  readonly plugin: Plugin;
  readonly state: "registered" | "active" | "disposed" | "failed";
  readonly handle?: PluginHandle;
  readonly error?: unknown;
}
```

### 20.1 A worked lifecycle

```typescript
// Host construction (Application layer)
const ports: PortsBundle = {
  idGen: new NanoIdGen(Math.random),
  clock: new SystemClock(),
  random: new CryptoRandom(),
  log: new ConsoleLog(),
};

const editor = createEditor({
  ports,
  initialDoc: emptyDoc(ports.idGen),
  plugins: [
    stylesPlugin,
    listsPlugin,
    tablesPlugin,
    footnotesPlugin,
    endnotesPlugin,
    commentsPlugin,
    trackChangesPlugin,
    fieldsPlugin,
    bookmarksPlugin,
    hyperlinksPlugin,
    drawingsPlugin,
    imagesPlugin,
    framesPlugin,
    mailMergePlugin,
    spellcheckPlugin,
    autocorrectPlugin,
    autoformatPlugin,
    macrosPreservePlugin,
  ],
});

editor.subscribe((state, change) => {
  if (change.kind === "commit") view.repaint(state.doc);
});

editor.dispatch({ kind: "inputChar", text: "H" });
editor.dispatch({ kind: "inputChar", text: "i" });
editor.dispatch({ kind: "splitParagraph" });
editor.command(asCommandId("doc.setBold"), { on: true });
editor.dispatch({ kind: "inputChar", text: "world" });
```

---

## 21. Testing Hooks and Patterns

### 21.1 Scenario runner

A tiny DSL lets us write readable end-to-end tests:

```
start
    doc: empty
    seed: 42
scenes:
    - type "Hello"
    - key "Ctrl+B"
    - type "World"
    - key "Enter"
    - key "Ctrl+Z"
expect:
    doc.paragraphs.0.text === "HelloWorld"
    doc.paragraphs.0.runs.0.bold === false
    doc.paragraphs.0.runs.1.bold === true
```

Implementation:

```typescript
// packages/engine-testkit/src/scenario.ts

export interface Scenario {
  readonly start?: StartOptions;
  readonly scenes: readonly Scene[];
  readonly expect: readonly Assertion[];
}

export interface StartOptions {
  readonly doc?: "empty" | { readonly docxFixture: string } | Document;
  readonly seed?: number;
  readonly plugins?: readonly Plugin[];
}

export type Scene =
  | { readonly kind: "type"; readonly text: string }
  | { readonly kind: "key"; readonly chord: string }
  | { readonly kind: "click"; readonly at: IdPosition }
  | { readonly kind: "paste"; readonly formats: Record<string, string | Uint8Array> }
  | { readonly kind: "composition"; readonly steps: CompositionStep[] }
  | { readonly kind: "command"; readonly id: CommandId; readonly params?: unknown }
  | { readonly kind: "assert"; readonly expr: string };

export type CompositionStep =
  | { kind: "start" }
  | { kind: "update"; text: string }
  | { kind: "end"; text: string }
  | { kind: "cancel" };

export interface Assertion {
  readonly path: string;   // JSONPath-like into the state
  readonly expect: unknown;
}
```

### 21.2 Snapshot serialization (canonical)

```typescript
// packages/engine-testkit/src/canonical.ts

/** Produces a canonical representation of a Document for snapshot testing.
 *  - Sorts registry entries by their content-hash ids
 *  - Strips version numbers (recomputed per run)
 *  - Inlines RunProps/ParaProps by value to avoid registry drift
 */
export function canonicalize(doc: Document): CanonicalDoc;
export function diff(a: CanonicalDoc, b: CanonicalDoc): readonly Diff[];
```

Snapshots are stored as `.snap.json` next to tests; updates via `pnpm test -u`.

### 21.3 Property tests

```typescript
// packages/engine-testkit/src/property.ts

export function arbCommand(ctx: ArbContext): fc.Arbitrary<CommandInvocation>;
export function arbSequence(n: number): fc.Arbitrary<readonly CommandInvocation[]>;

test("undo-all restores initial", () =>
  fc.assert(fc.property(arbSequence(200), (seq) => {
    const editor = makeEditor({ seed: 123 });
    const initial = canonicalize(editor.state.doc);
    for (const c of seq) editor.command(c.id, c.params);
    for (let i = 0; i < seq.length; i++) editor.history.undo();
    const end = canonicalize(editor.state.doc);
    expect(diff(initial, end)).toEqual([]);
  }))
);
```

### 21.4 Micro-benchmarks

A `packages/engine-testkit/src/bench.ts` module runs timed scenarios (typing 10k chars, pasting 1MB, undo-all 1000 transactions) asserting p95 wall-clock against thresholds. Regressions fail CI.

---

## 22. Directory Layout

```
packages/
  domain/
    src/
      index.ts
      identity.ts
      node.ts
      block.ts
      inline.ts
      document.ts
      persistent/
        tree.ts
        rbtree.ts
      text/
        pieceTable.ts
        ops.ts
        buffers.ts
      props/
        registry.ts
        runProps.ts
        paraProps.ts
        sectionProps.ts
        tableProps.ts
        rowProps.ts
        cellProps.ts
        resolve.ts
      styles/
        style.ts
        numbering.ts
        fonts.ts
      positions.ts
    test/
      pieceTable.test.ts
      resolve.test.ts
      positions.test.ts
      persistent.test.ts
    package.json
    tsconfig.json
  engine/
    src/
      editor.ts
      schema.ts
      ops.ts
      patches.ts
      commands.ts
      registry.ts
      transactions.ts
      transactions/
        coalesce.ts
        history.ts
        replay.ts
      selection.ts
      selection/
        extend.ts
        remap.ts
      positions/
        convert.ts
        order.ts
      keymap.ts
      keymap/
        resolvers.ts
        chord.ts
      intents.ts
      clipboard.ts
      ime.ts
      accessibility.ts
      concurrency.ts
      events.ts
      ports/
        index.ts
        idgen.ts
        clock.ts
        random.ts
        fontMetrics.ts
        spellcheck.ts
        fieldRuntime.ts
        log.ts
        clipboard.ts
        accessibility.ts
      plugins/
        api.ts
        schema.ts
        registry.ts
        commands.ts
        state.ts
        decorations.ts
        serializers.ts
      plugins-built-in/
        tables/
          index.ts
          commands.ts
          keymap.ts
          xml.ts
          decorations.ts
        lists/
          index.ts
        styles/
          index.ts
        footnotes/
          index.ts
        endnotes/
          index.ts
        comments/
          index.ts
        track-changes/
          index.ts
        fields/
          index.ts
        bookmarks/
          index.ts
        hyperlinks/
          index.ts
        drawings/
          index.ts
        images/
          index.ts
        frames/
          index.ts
        mailmerge/
          index.ts
        spellcheck/
          index.ts
        autocorrect/
          index.ts
        autoformat/
          index.ts
        macros-preserve/
          index.ts
    test/
      editor.test.ts
      undo.property.test.ts
      ime.test.ts
      clipboard.test.ts
      selection.test.ts
      keymap.test.ts
    package.json
    tsconfig.json
  engine-testkit/
    src/
      scenario.ts
      canonical.ts
      property.ts
      bench.ts
      fixtures/
        smallDoc.json
        largeDoc.json
    package.json
```

---

## 23. Error Handling

### 23.1 Command errors

```typescript
export interface CommandError {
  readonly code: "constraint" | "invalidArgs" | "schema" | "plugin" | "internal";
  readonly message: string;
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;
}
```

A command that returns `{ ok: false, error }` leaves state untouched. The engine emits a `commandDispatched` event with the result; UI can show a toast.

### 23.2 Schema violations

In dev, a violation after op application throws; the transaction is **not** committed. In prod, the engine logs telemetry (sanitized) and reverts to the pre-transaction state. Neither case leaves the store in a mid-flight condition — the immutable tree guarantees atomicity.

### 23.3 Plugin failure

If a plugin's `onAfterCommit` handler throws, we catch and log; we do **not** roll back the commit (the document has already been updated and users see it). We mark the plugin as "failed" so the user sees an indicator; a subsequent user action can "restart" the plugin.

### 23.4 Port failures

Async ports (spellcheck, clipboard read) wrap in `Promise<Result<T, Error>>`. Consumers handle errors without throwing to the dispatch loop. The engine never swallows errors silently; every caught error goes through `LogPort.error`.

---

## 24. Performance in the Core

### 24.1 Hot paths

The following operations must remain O(log n) in document size, where n is characters in the affected paragraph (for insertions/deletions) or number of blocks (for structural edits):

* Typing one character: piece-tree insert + tree spine path-copy + memo lookup → O(log c) where c is the paragraph's character count.
* Formatting a selected range: two piece-tree splits + one format replacement → O(log c).
* Paragraph split: piece-tree split + two new Paragraph nodes + spine path-copy → O(log b + log c) where b is blocks.
* Table cell navigation: no document edit; O(1) selection update.
* Undo: apply the stored inverse patch; same complexity as the forward patch.

### 24.2 Budget targets

* Frame budget for steady-state typing at 120Hz: <= 3ms to produce a new state.
* Paste 1MB of text: <= 300ms.
* Apply style to all paragraphs in a 1000-paragraph document: <= 200ms.
* Undo all 1000 of the above: <= 400ms total (due to inverse-patch pooling and re-memoization cost).

### 24.3 Batching notifications

The engine emits **one** `stateChanged` event per commit, not one per op. Subscribers see a single "before/after" pair with the transaction attached. Renderers can use the transaction's `touchedIds` to limit re-paint to changed regions.

### 24.4 Structural sharing

Because our tree and piece-trees are persistent, the vast majority of memory references are shared between adjacent Document versions. A 500KB document after a single-character edit typically produces a new version with O(log n) fresh objects plus a handful of bytes in the add buffer.

### 24.5 Working with large documents

For documents larger than 10,000 paragraphs we enable:

* **Deferred layout paging:** the rendering engine only lays out pages in and near the viewport, consuming Document snapshots on demand.
* **Piece-tree compaction on idle:** idle-time callbacks rebuild a compact add buffer; undo stack is re-anchored.
* **Property-registry trimming:** unreferenced `PropsId`s are garbage-collected when their ref count drops to zero (maintained incrementally during dispatch).

### 24.6 Memoization details

The resolution memo uses a weak reference map where the key is a string built from `(PropsId + StyleRegistry.version + tableContextHash)`. Entries are LRU-capped. Profiling shows ~92% hit rate on realistic typing sessions because formatting rarely changes relative to stylesheet lookups.

---

## 25. Example: End-to-End Walkthrough of a Keystroke

To make the pipeline concrete, here is exactly what happens when the user presses `b` with `Caps Lock` off and `Shift` on. The key is `B`.

1. DOM emits `keydown { key: "B", shiftKey: true }`.
2. The React binding translates this into a `KeyEventLike` and sends it to the `Keymap.resolve`.
3. Keymap has no binding for `Shift+B` (default bindings are modifier-combinations like `Mod+B`). It returns `undefined`.
4. The React binding emits `{ kind: "inputChar", text: "B" }` as an Intent.
5. `editor.dispatch(intent)` calls the intent handler for `inputChar`.
6. The handler checks `ImeState.active`: false, so it proceeds.
7. The handler computes: selection is collapsed; there is no range to replace; the caret is at `paragraphP / offset 5`.
8. The handler resolves current RunProps from caret context (the "current input style" is resolved from the caret position plus any pending formatting toggles, §8).
9. The handler returns `CommandInvocation { id: "doc.insertText", params: { text: "B" } }`.
10. `commandRegistry.get("doc.insertText").canRun(ctx, params)`: true.
11. `.run(ctx, params)` returns `{ ok: true, value: [{ kind: "insertText", at: {leafId:P, offset:5}, text: "B", runPropsId: R }] }`.
12. Schema validator (dev only) checks the patch: `insertText` is always valid within a Paragraph.
13. `applyPatch(doc, patch)` walks to Paragraph P, invokes piece-tree `insert(5, "B", R)`, mints a new Paragraph node with the updated `piece`, then rebuilds the tree spine via `replaceBlockAt`. Returns `{ doc: doc', inverse: [{ kind: "deleteRange", range: {anchor:{leafId:P,offset:5}, focus:{leafId:P, offset:6}}}] }`.
14. `computeSelectionAfter` returns `{ anchor: {leafId:P, offset:6}, focus: {leafId:P, offset:6} }`.
15. Transaction is assembled: `{ id, label: "Input", timestamp, ops, inverse, selectionBefore, selectionAfter, coalesceKey: "typing" }`.
16. Coalesce step: previous transaction was also "typing" at `{leafId:P, offset:4}` within 1000ms — merge. New merged transaction's `ops` now include both inserts, `inverse` is the merged inverse.
17. History push replaces the head.
18. `events.emit("stateChanged", { kind: "commit", txn, before, after })`.
19. Plugins' `onAfterCommit` fires (spellcheck enqueues a check for paragraph P; autocorrect inspects the text for a rule match; track-changes records the insert as a revision if enabled).
20. React bindings recompute the part of the UI touched by P, including caret position.
21. Accessibility live region emits nothing for a single-character insert (rate-limited); the AX tree has been updated by the commit.

Wall-clock budget: ~1–2ms on commodity hardware.

---

## 26. Example: End-to-End Walkthrough of `Ctrl+Z`

1. DOM emits `keydown { key: "z", ctrlKey: true }`.
2. Keymap resolves to `CommandInvocation { id: "doc.undo", params: {} }`.
3. `canRun` checks that `history.undo` is non-empty; true.
4. `run` pops the last transaction, applies its `inverse` patch, and returns the resulting Patch (possibly plus a "restore selection" marker).
5. Engine commits a pseudo-transaction labeled "Undo" with `selectionBefore/After` swapped and pushes it onto the **redo** stack.
6. `stateChanged` fires with `kind: "commit"` and `txn.label === "Undo"`.
7. If the undone transaction was an IME commit, the engine also ensures `ImeState.active === false` (it should be; IME commits complete the composition).

---

## 27. Example: IME Composition of the Japanese Word "こんにちは"

Intent sequence:

```
1. { kind: "compositionStart", anchor: { leafId: P, offset: 12 } }
2. { kind: "compositionUpdate", text: "k" }
3. { kind: "compositionUpdate", text: "こ" }
4. { kind: "compositionUpdate", text: "こn" }
5. { kind: "compositionUpdate", text: "こん" }
6. { kind: "compositionUpdate", text: "こんに" }
7. { kind: "compositionUpdate", text: "こんにち" }
8. { kind: "compositionUpdate", text: "こんにちは" }
9. { kind: "compositionEnd", text: "こんにちは" }
```

Engine actions:

* Step 1: store `ImeState { active: true, anchor, baseline: doc }`; register a widget decoration at `anchor`.
* Steps 2–8: update the decoration's `renderProps.text`; the domain document is untouched.
* Step 9: dispatch `doc.insertText` with `text: "こんにちは"` and `coalesceKey: "ime"`; unset `ImeState.active`; remove decoration.

The undo stack records **one** transaction for the entire composed phrase. `Ctrl+Z` removes all five characters in a single step — consistent with Word 95's behavior.

---

## 28. Example: Pasting Word Content Between Documents

User copies a table from Document A and pastes into Document B.

1. On copy in Document A, the clipboard plugin serializes the selection into multiple formats:
   * `application/vnd.openxmlformats-officedocument.wordprocessingml.document` — a DOCX fragment containing just the selected table (plus required part references).
   * `text/html` — an HTML fallback.
   * `text/plain` — tab-separated values.
2. The OS clipboard holds all three formats.
3. On paste in Document B, `ClipboardPort.read()` returns a `ClipboardPayload`.
4. `PasteNormalizer` chooses the highest-fidelity format: DOCX fragment.
5. The DOCX serializer (infrastructure) deserializes the fragment, registering any new styles with fresh `StyleId`s if they collide, and produces a partial Document delta.
6. The normalizer emits a Patch that inserts the table's rows and styles into Document B with correctly re-keyed IDs (table gets a new NodeId; each row/cell too) while preserving text content and any `vMerge/gridSpan` attributes.
7. A single transaction is committed labeled "Paste Table"; `selectionAfter` points to the first cell's first paragraph.
8. Any style ID collisions are resolved: Document B's `StyleRegistry.merge(incoming)` detects by style name and basedOn chain; a new style is added for unmatched incoming styles.

---

## 29. Command Predicate Examples

Predicates used by the UI to enable/disable buttons.

```typescript
// packages/engine/src/predicates.ts

export function isBoldActive(ctx: CommandContext): boolean {
  const range = ctx.selection.primary;
  if (isCollapsed(range)) {
    const props = resolveRunPropsAtPosition(ctx.doc, range.anchor);
    return props.bold === true;
  }
  const runs = runsInRange(ctx.doc, range);
  return runs.every(r => resolveRunProps(r, /*...*/).bold === true);
}

export function canInsertTable(ctx: CommandContext): boolean {
  return !isInsideDeeplyNestedTable(ctx.selection.primary, ctx.doc)
      && !isInFootnote(ctx.selection.primary, ctx.doc);  // Word forbids tables in footnotes
}

export function canAcceptChange(ctx: CommandContext): boolean {
  const tc = ctx.plugins.byId("track-changes");
  return tc?.state === "active"
      && hasChangesIntersecting(ctx.selection.primary);
}
```

---

## 30. Glossary

**Block** — a paragraph or table (top-level direct child of a section or cell).

**Cell** — a table cell; contains blocks.

**Decoration** — UI-only annotation that does not change the document.

**Direct formatting** — properties on a run/paragraph themselves, not inherited via a style.

**Inline** — a child of a paragraph; a run or a marker or a hyperlink wrapper etc.

**Mark** — character-level annotation not expressed as RunProps (e.g., spelling-error indicator, deprecated-text tag). Stored on pieces.

**Op** — an atomic reversible operation.

**Patch** — an ordered list of ops.

**Piece** — a range in a buffer labeled with run properties; element of the piece table.

**Port** — an interface declared by the engine, implemented by infrastructure.

**PropsId** — content-hashed id of a `*Props` object; enables deduplication.

**Range** — an anchor/focus pair in positions.

**Run** — a contiguous sequence of characters sharing formatting.

**Section** — a top-level band of blocks with its own page/column properties.

**Snapshot** — an immutable view of the Document at a version.

**Style** — a named collection of formatting, possibly inherited.

**Transaction** — a committed group of ops with metadata (label, selection, inverse).

**Version** — a monotonically increasing integer on each commit.

---

## 31. Notes on Standards Compliance

* **UAX #14** (Line Breaking) is used by the layout engine; selection motion uses it only indirectly (for "extend selection to line"). The core itself is content-neutral.
* **UAX #29** (Text Segmentation) governs word and grapheme-cluster boundaries. Used by: `doc.deleteBackward { unit: "word" }`, `doc.moveCaret { unit: "word" }`, coalescing rules ("word boundary ends a typing group"), double-click word-select, F8 extend-to-word. Implementation lives in `packages/domain/src/text/segmentation.ts` and is pure TypeScript with an embedded UCD table generated at build time.
* **ECMA-376 Transitional** (Part 1) drives schema constraints and property enumerations — we deliberately include extra flags and values we do not use in our UI (e.g., the more obscure `numFmt` values, East-Asian specialties) so that round-trip files preserve their content.
* **Unicode normalization** — the piece-table stores raw code units as received; we do **not** normalize during insertion (would break undo reversibility), but we expose utilities for normalization that plugins may apply explicitly (e.g., paste normalization to NFC).

---

## 32. Concluding Remarks on Architecture Principles

Five principles guided every decision in this document:

1. **Purity at the center.** The domain is a pure function from events to states. Every effect is banished to a port.
2. **Plugins, not features.** If a feature can be removed without breaking the core, it is a plugin. Period.
3. **Immutability as a tool, not a burden.** Persistent data structures let us do time-travel (undo/redo), cheap snapshots (for workers), and safe concurrency (for layout).
4. **IDs before indices.** Tree positions are indexes; domain identity is IDs. We store IDs everywhere a reference could be invalidated by an edit.
5. **Small commits, composable ops.** Every editing gesture decomposes into reversible ops; transactions aggregate ops for the undo UI. The same machinery drives keyboard input, IME, paste, find/replace, track changes, and future collaboration.

Together these choices yield a core that is small, testable, extensible, and capable of supporting every Word 95 feature plus the plumbing we will need for future enhancements. The rest of the system — layout, rendering, DOCX, Electron, React — plugs into this core without reshaping it.
