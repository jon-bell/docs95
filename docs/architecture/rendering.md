# Rendering and Layout Engine Architecture

> Status: draft v1. Owner: Rendering & Layout. Audience: engineers building
> the pagination/shaping/paint pipeline. This is the authoritative design for
> how the application converts a document model into pixels, caret positions,
> and printable pages with **true Microsoft Word 95 feature parity** on top of
> a **DOCX (ECMA-376 Transitional)** persistence layer.

---

## 0. Executive summary

The rendering subsystem answers one deceptively large question:

> Given an immutable snapshot of the document domain (sections, paragraphs,
> runs, tables, shapes, headers/footers, footnotes, styles, fonts) and a view
> state (zoom, view mode, selection), produce **(a)** a deterministic
> pagination with per-line and per-glyph coordinates, **(b)** an accessible
> DOM representation of that pagination, and **(c)** hit-testing utilities so
> that input, selection, and printing all agree on geometry.

We **do not** delegate this to the browser's layout engine. Chromium's paged
media support, while serviceable for simple articles, does not implement the
features a Word-grade editor requires: keep-with-next, widow/orphan control,
rows that cannot split, nested tables split across pages, footnotes pinned
to the page they reference, wrap-around floats that reflow through columns,
numbered lists that continue across page boundaries, section breaks with
differing page geometry, etc. We also need byte-for-byte stable pagination
across operating systems and print targets, which native layout does not
guarantee. The only way to get this is to own layout.

We **do** use the DOM as our paint surface. A fully custom Canvas renderer
would be smaller and faster, but would forfeit native selection (as a
fallback), accessibility tree, IME caret reporting, and built-in text-find
by assistive tech. The compromise we take: the DOM is a *dumb* output of our
layout — every glyph run is an absolutely positioned `<span>` inside an
absolutely positioned line box inside a page container. The browser does no
reflow inside pages (`contain: strict`).

The pipeline is six stages:

```
    [Domain Snapshot] ── Measure ──► [Shaped Runs]
                                        │
                                        ▼
                                    Line Break
                                        │
                                        ▼
                                     Block Flow
                                        │
                                        ▼
                                   Table Layout
                                        │
                                        ▼
                                    Pagination
                                        │
                                        ▼
                                  [Page Layouts] ──► DOM Commit
```

Each stage produces an immutable, cacheable artifact keyed by inputs. A
document edit dirty-marks a small set of artifacts and re-runs only the
affected portion, reusing the rest. Large re-layouts happen on worker
threads. Only the final commit touches the DOM, via a pre-built
`DocumentFragment` to avoid reflow thrash.

This document is long because rendering is the single largest risk area in
the project. Clarity here saves weeks of rework later.

---

## 1. Rendering philosophy

### 1.1 Authoritative layout, dumb paint

Word's visual model is **declarative, metric, and deterministic**. A
`\page` at a given position breaks to a new page on every machine, every
printer, every locale — provided fonts are available. Our engine must
preserve that determinism. That means:

* Layout is a **pure function** of
  `(domainSnapshot, sectionSnapshot, styleSnapshot, fontSnapshot, viewConfig)`.
  No randomness, no time-dependent behavior (no animations that change
  line widths), no device-dependent behavior beyond font-metric fallback
  when a font is not installed (where we log a diagnostic).
* Layout output is **serializable and diffable**. Two runs of the engine on
  the same inputs produce identical `PageLayout[]` structures (byte-equal
  after JSON-serialize). This is the basis for golden-image tests, print
  consistency, and collaborative co-editing future-proofing.
* The DOM is reconstructed from `PageLayout[]`. The DOM does not carry
  information that the layout model lacks. If something is in the DOM, it
  is either derivable from the layout or is ephemeral UI (caret blink).

This inverts the typical web-app model in which the DOM is the source of
truth and `useRef().getBoundingClientRect()` measures things. We instead
ask the layout model, which already knows.

### 1.2 Why DOM and not Canvas

Canvas would win on raw paint speed and memory. The reasons we stay on
DOM:

1. **Accessibility.** Screen readers enumerate the DOM tree. JAWS, NVDA,
   and VoiceOver read paragraph text by walking elements and their
   `aria-label` / text-node content. A Canvas surface is a visual blob
   with no semantics. We can emit an ARIA tree alongside a Canvas, but
   that doubles the model maintenance cost and is inevitably stale.
   Keeping the DOM as the paint surface means the DOM is *always*
   accessible, because it's the same data that renders pixels.
2. **Selection fallback.** Even though we own selection rendering, users
   triple-click, long-press, and use accessibility gestures that expect
   a selectable DOM. Having real text nodes lets those workflows work
   without special-casing. We override default mouse selection, but the
   text is still there.
3. **IME caret reporting.** On macOS and Windows, the IME asks the app
   for the "candidate window anchor" — the screen coordinates of the
   caret. Browsers compute this from the currently focused editable and
   selection. We exploit this by keeping an invisible editable element
   at the logical caret position, and the browser does the rest.
4. **Text find by AT / browser.** Ctrl-F in Electron can search DOM text.
   If we rendered to Canvas we would need to re-implement find.
5. **Zoom and accessibility zoom.** OS-level magnifiers and user CSS
   (`zoom`, `text-size-adjust`) degrade gracefully on DOM; Canvas does
   not get bigger fonts from OS settings, it gets upscaled pixels.
6. **Hit testing for dev tools.** Inspecting a specific word in DevTools
   aids debugging; Canvas is opaque to that.

Canvas remains in our toolbox for *opt-in* "huge document mode" (risk 23.3)
and for shape/SVG composition.

### 1.3 Why not HTML `contenteditable` with browser layout

The seductive alternative is to put a giant `<div contenteditable>` on the
page, style it with `@page` rules, and let the browser paginate. It would
ship faster. It would also be wrong:

* **Page breaking is unreliable.** `break-before`, `break-inside`, and
  friends are honored by Chromium only in print, inconsistently on screen,
  and they don't support keep-with-next, widow/orphan at Word fidelity,
  or "keep lines together" without workarounds that break other things.
* **Tables across pages are unpredictable.** Chromium's table algorithm
  does not split rows at Word-compatible boundaries, does not repeat
  header rows, and does not handle `cantSplit`.
* **Floats across pages.** A float declared in page 1 won't flow to page 2
  the way Word expects; wrap-around contours are approximate.
* **Footnotes.** The browser has no notion of footnotes anchored to the
  page.
* **Selection in nested editables is buggy.** Tables with editable cells
  inside an editable doc cause focus-jump issues; caret movement in
  bidi-mixed text is inconsistent browser-to-browser.
* **IME in complex `contenteditable`.** Composition events get dropped when
  DOM mutates mid-composition; we need fine control.
* **Print rendering drift.** `webContents.printToPDF` and screen rendering
  produce different results in corner cases.
* **Determinism across OSes.** Chromium line-breaks Latin/CJK differently
  from Word in some cases; we need to match Word.

The verdict: `contenteditable` is a liability. We use a *tiny* hidden
editable as an IME intake surface (see §11), not as the document model.

### 1.4 What we give up by owning layout

Honesty clause:

* **Text shaping.** Browser freely shapes complex scripts (Arabic, Indic,
  Thai) at paint time, with the system's HarfBuzz. We must reproduce this
  in our measurement layer. We plan a hybrid (Canvas `measureText` MVP,
  HarfBuzz WASM v1.1) and pre-test metric equivalence (see §7.3).
* **Automatic font fallback.** Browser falls back per glyph. We emulate
  this with per-script fallback chains (see §8.3).
* **Kerning, ligatures, OpenType features.** We ship these via shaped
  advances; the browser paints with `font-feature-settings` matching.
* **Browser performance.** The browser's C++ layout is fast. Ours is
  JS/WASM. We mitigate with caching, workers, and virtualization.

These costs are real but tractable. The payoff is exact Word-like
behavior.

### 1.5 Non-goals

* We are **not** re-implementing HTML/CSS. Our layout model is a
  word-processor layout model, not a general document layout model.
* We are **not** building a real-time collaborative OT/CRDT layer in this
  component. The layout engine accepts immutable snapshots; a future
  collab layer can feed it patches.
* We are **not** building a renderer for arbitrary rich text from the
  web; we render only what our domain model describes.

---

## 2. Units, coordinates, and geometry

### 2.1 Unit table

| Quantity    | Internal       | DOCX wire       | Rendering                    |
|-------------|----------------|-----------------|------------------------------|
| Length      | **twip** (1/1440 in) | twip (most) / EMU (drawingML) | CSS `px` via `twipsToPx` |
| Font size   | **half-point** (1/2 pt) | half-point | CSS `px` |
| Line weight | **eighth-point** (1/8 pt) | eighth-point | CSS `px` |
| Paper size  | twip            | twip           | px |
| Angles      | **60000ths of a degree** | ECMA-376 unit | `deg` |
| Colors      | ARGB 0xAARRGGBB | hex string / theme | CSS `#rrggbb` |

**EMU (English Metric Unit) = 914400 per inch = 12700 per point.** EMUs
appear in DrawingML (shapes, images). We convert EMU ↔ twip at the parser
boundary and never let EMUs into the layout engine.

**Twips as the lingua franca.** 1440 has every small prime we care about
(2, 3, 5) as factors, so inch-denominated Word fractions round-trip
exactly. Using float inches would introduce rounding noise that compounds
into off-by-one pixel drift across pages.

### 2.2 Coordinate system

* **Origin**: top-left corner of the physical page (not the content area).
* **X** increases rightward (logical leading edge in LTR; visually rightward
  in both LTR and RTL — bidi reorder happens within line boxes).
* **Y** increases downward. Matches CSS and Word.
* **Line box Y** references the line's **top** (not baseline). Baseline
  is derived as `top + ascent`.
* **Glyph run X** references the **leading edge** of the run (left edge
  in LTR, right edge in RTL). The logical order matches logical text;
  visual reordering is deferred to the line box's `runs[]` order.

```
   ─────────────── X ──────────────►
   ┌──────────────────────────────┐ ▲
   │          Header band         │ │
   ├──────┬────────────────┬──────┤ │
   │      │                │      │ │
   │  L   │     Content    │  R   │ │
   │  M   │     frame      │  M   │ Y
   │      │                │      │ │
   ├──────┴────────────────┴──────┤ │
   │         Footer band          │ │
   └──────────────────────────────┘ ▼
```

`L M` and `R M` are the left/right margins (mirrored on odd/even pages if
mirror-margins is on). The "content frame" height shrinks to accommodate
reserved footnote space.

### 2.3 Conversion helpers

```ts
// src/layout/units.ts

export const TWIPS_PER_INCH   = 1440;
export const POINTS_PER_INCH  = 72;
export const TWIPS_PER_POINT  = 20;   // 1440/72
export const EMUS_PER_INCH    = 914400;
export const EMUS_PER_POINT   = 12700;
export const EMUS_PER_TWIP    = 635;  // 914400/1440

export function twipsToPx(
  twips: number,
  zoom: number,
  dpr: number,
  cssPixelsPerInch = 96,
): number {
  return twips / TWIPS_PER_INCH * cssPixelsPerInch * zoom * dpr;
}

export function pxToTwips(
  px: number,
  zoom: number,
  dpr: number,
  cssPixelsPerInch = 96,
): number {
  return px * TWIPS_PER_INCH / (cssPixelsPerInch * zoom * dpr);
}

export function halfPointsToPx(
  hp: number,
  zoom: number,
  dpr: number,
): number {
  // hp/2 = points; points/72 = inches; inches*96 = CSS px
  return hp / 2 / POINTS_PER_INCH * 96 * zoom * dpr;
}
```

**Rounding policy.** All layout math is done in floating point internally,
but coordinates committed to the DOM are rounded to `0.25 px` increments
(sub-pixel positioning is acceptable on HiDPI; snapping avoids blurry text
on 1x). Specifically, `dom.x = Math.round(px * 4) / 4`. For caret and
selection rectangles (hit tests), we work in un-rounded pixel space and
round at the final commit.

### 2.4 DPR and zoom composition

* **`zoom`**: user-controlled (10%–500% in MVP; 10%–2000% eventually).
* **`dpr`** (`window.devicePixelRatio`): 1 on normal monitors, 2 on HiDPI,
  1.25/1.5 fractional on Windows at custom scaling.
* Effective CSS pixel density per inch = `96 * zoom * dpr`.
* Font size in CSS px = `halfPointsToPx(runFontHp, zoom, dpr)`.
* We render *actual size* — not zoomed-up 96dpi — because the browser then
  paints with the installed font's full hinting, which is what users
  expect in "100% zoom" WYSIWYG.

There is a subtle interaction: when `zoom` changes, line breaks don't
necessarily change (they are metric-based, not pixel-based; they use
twips and half-points, which are zoom-independent). But rendering
coordinates do. So: **line-break computations ignore `zoom` and `dpr`;
coordinate commit multiplies by them.** This is a deliberate invariant
that enables cheap zoom changes (no re-layout, only re-commit).

### 2.5 Clarifying "pixel" language

Throughout this doc:

* **"px"** without qualification means CSS px (1/96 inch), the thing you
  assign to `style.left`.
* **"device px"** means physical screen pixels. We almost never use this
  term; DPR handles it.
* **"logical px"** is synonymous with "CSS px".

---

## 3. High-level pipeline

### 3.1 Diagram

```
 ┌──────────────────────────────────────────────────────────────────┐
 │                     DOMAIN SNAPSHOT                              │
 │  sections[]  paragraphs[]  tables[]  styles  fonts  footnotes    │
 └───────────────┬──────────────────────────────────────────────────┘
                 │ LayoutPort.snapshot()
                 ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │ STAGE 1  RUN MEASUREMENT                                         │
 │   split-by-script → split-by-bidi-level → shape → cache          │
 │   output: ShapedRun[] per paragraph                              │
 └───────────────┬──────────────────────────────────────────────────┘
                 ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │ STAGE 2  PARAGRAPH LINE-BREAK                                    │
 │   UAX #14 candidates → Knuth-Plass (or first-fit fast path) →    │
 │   bidi reorder → tab stops → hyphenation → justification         │
 │   output: Line[] per paragraph (ParaLayout)                      │
 └───────────────┬──────────────────────────────────────────────────┘
                 ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │ STAGE 3  BLOCK LAYOUT                                            │
 │   paragraphs, tables, floats, frames within the content frame    │
 │   vertical stacking; inline images; anchored shapes              │
 └───────────────┬──────────────────────────────────────────────────┘
                 ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │ STAGE 4  TABLE LAYOUT                                            │
 │   Pass A column widths → Pass B row heights                      │
 │   cantSplit; repeat-header; nested                               │
 └───────────────┬──────────────────────────────────────────────────┘
                 ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │ STAGE 5  PAGINATION                                              │
 │   flow lines into pages: widow/orphan, keep-with-next,           │
 │   columns, sections, footnotes, headers/footers                  │
 │   output: PageLayout[]                                           │
 └───────────────┬──────────────────────────────────────────────────┘
                 ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │ STAGE 6  POSITIONING                                             │
 │   absolute coords per line, run, glyph cluster;                  │
 │   margin guides, page borders, watermarks                        │
 └───────────────┬──────────────────────────────────────────────────┘
                 ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │                       DOM COMMIT                                 │
 └──────────────────────────────────────────────────────────────────┘
```

### 3.2 Immutability between stages

Each stage produces a new immutable object and consumes the previous
stage's immutable output. This lets us:

* cache aggressively — a `ParaLayout` is keyed by a hash of inputs;
* run stages in parallel for different paragraphs;
* reuse upstream outputs when only a downstream input changes (e.g.,
  changing page size does not invalidate shaped runs or line breaks at
  fixed widths, though it does invalidate block layout onward).

### 3.3 Which stages run where

| Stage                | Thread                | Frequency on edit                           |
|----------------------|-----------------------|---------------------------------------------|
| 1 Measure            | Worker (N)            | Only dirty runs                             |
| 2 Line break         | Worker (N)            | Only dirty paragraphs (+ width change)      |
| 3 Block layout       | Worker (N) per section| Dirty sections                              |
| 4 Table layout       | Worker (N)            | Dirty tables                                |
| 5 Pagination         | Main                  | Incremental from first dirty page           |
| 6 Positioning        | Main                  | Lazy per visible page                       |
| DOM commit           | Main (rAF)            | One commit per visible page per frame       |

Workers share a font cache (see §8) and an ICU4X WASM instance. See §6.

---

## 4. Stage 1 — Run measurement

### 4.1 Inputs

For each paragraph, a list of **Runs**, each carrying:

* `text: string` (logical order, NFC-normalized);
* `props: RunProps` (font family list, size in half-points, weight,
  italic, underline, color, features `{liga, kern, ss01…}`, language tag
  like `en-US` or `ja-JP`, OpenType script hint if explicit);
* `runId: RunId` (stable identity for caching);
* references to inline objects (images, fields, footnote refs).

### 4.2 Segmentation

Before shaping, we split each run into **shaping segments** so that each
segment has a single script, a single bidi level, a single font, and a
single language.

#### 4.2.1 Script segmentation (UAX #24)

We walk the string code-point by code-point and assign a script via the
Unicode Script property. Rules:

* `Common` and `Inherited` attach to the run they extend (look back, else
  look forward, else `Latin`).
* Script changes start a new segment.
* Digits (`Common`) inside, e.g., Arabic text inherit Arabic direction
  but retain Latin shaping — handled at bidi level not script.

Implementation: `icu4x::Script` mapper via WASM, or the smaller
`unicode-script` table shipped with our build.

#### 4.2.2 Bidi segmentation (UAX #9)

The Unicode Bidirectional Algorithm assigns an **embedding level** (0–125;
in practice 0–15) per character:

* Paragraph level is computed from the first strong character (or from
  `w:bidi`).
* Characters receive embedding levels after applying X1–X10 rules
  (explicit embeddings/overrides), N0/N1/N2 (neutral resolution), I1/I2
  (implicit levels).

We use the resolved levels during segmentation (same level within a
segment) and during line reordering (L1/L2 rules).

Shaping segments = maximal substrings with equal `(script, level, font)`.

#### 4.2.3 Font choice per segment

Input RunProps lists fonts in preference order. We iterate through the
chain and pick the first font that covers all code points in the segment.
If none covers, we split the segment further — the chain's fallback font
for the missing code points applies. We never paint with "tofu" boxes; we
always substitute.

### 4.3 Shaping

For each shaping segment, produce a **ShapedRun**:

```ts
interface ShapedRun {
  runId:        RunId;
  segmentIndex: number;
  script:       Script;
  level:        number;              // 0 LTR, 1 RTL, 2 LTR, …
  font:         ResolvedFont;
  sizeHp:       number;
  features:     OpenTypeFeatureSet;
  text:         string;              // logical
  clusters:     Cluster[];           // one per grapheme cluster
  width:        number;              // twips; sum of cluster advances
  ascent:       number;              // twips; from font at sizeHp
  descent:      number;              // twips
  lineGap:      number;              // twips
}

interface Cluster {
  logicalStart: number;              // code-point offset into `text`
  logicalEnd:   number;              // exclusive
  glyphs:       Glyph[];
  advance:      number;              // twips, sum of glyph advances
  isWhitespace: boolean;
  canBreakBefore: boolean;           // UAX #14
  hyphenatable:  boolean;            // can insert soft hyphen before
}

interface Glyph {
  gid:          number;              // font glyph index
  xAdvance:     number;              // twips
  yAdvance:     number;              // twips (usually 0)
  xOffset:      number;              // twips
  yOffset:      number;              // twips
}
```

### 4.4 Shaping implementations

We have two shapers. The choice per segment is driven by script:

#### 4.4.1 Fast path: Canvas `measureText`

For Latin, Cyrillic, Greek, and CJK (Han, Hiragana, Katakana, Hangul), the
browser's Canvas 2D `measureText` gives accurate advances matching what
the browser will paint. We run:

```ts
const ctx = sharedOffscreenCanvas.getContext('2d', { willReadFrequently: false });
ctx.font = cssFontShorthand(resolvedFont, sizeHp);
const m = ctx.measureText(clusterText);
const advance = m.width;            // CSS px at 1x; we convert to twips
```

Cluster boundaries: Canvas can't report glyph indices, only widths. We
split at grapheme cluster boundaries (UAX #29) and `measureText` each
cluster. For runs of Latin text this is acceptably fast because we cache
aggressively at the *word* level (see §4.6).

We do **not** use Canvas for Arabic, Hebrew, Devanagari, Myanmar, Thai,
Khmer, Lao, Tibetan, Ethiopic, or any script requiring contextual shaping.
The widths it returns are not wrong, but we lose glyph substitution data,
and when the browser paints, we have no way to align our logical cluster
model to its glyph output.

#### 4.4.2 Correct path: HarfBuzz via WebAssembly

For complex scripts, and for all scripts in v1.1, we use
[HarfBuzz](https://harfbuzz.github.io/) compiled to WASM. The API:

```ts
interface HbShaper {
  createFontFace(data: Uint8Array, faceIndex?: number): HbFace;
  shape(
    face: HbFace,
    text: string,
    opts: {
      script: string;        // ISO 15924
      direction: 'ltr' | 'rtl' | 'ttb' | 'btt';
      language: string;      // BCP 47
      features: Record<string, boolean>;
      variations?: Record<string, number>;
    },
  ): HbShapingResult;
}

interface HbShapingResult {
  glyphInfos:   { codepoint: number; cluster: number; flags: number }[];
  glyphPositions: { xAdvance: number; yAdvance: number; xOffset: number; yOffset: number }[];
}
```

The cluster values let us reconstruct which logical code-point ranges
each glyph covers. That is what we store in `Cluster.logicalStart/End`.

**Painting** the shaped output in DOM is subtle. Two options:

1. Trust the browser to paint the same text with the same font and
   features, and let its shaper regenerate glyphs. This is the MVP path.
   We must confirm via regression tests that our widths (from HarfBuzz)
   match the browser's painted widths within `±0.5 px` at 12pt. We
   maintain a test suite of representative strings per script.
2. Paint glyphs by GID using SVG `<path>` per glyph, with `d` drawn from
   the font's outline tables. This is exact and independent of browser
   shaping, but 10× more DOM. We reserve this for v2 "strict mode".

In the MVP and v1, we use option 1. See §7.3 for the divergence test.

### 4.5 Font metrics

Each `ResolvedFont` carries cached metrics parsed from the font binary
using `opentype.js` (pure JS) or `fontkit-wasm` (faster):

```ts
interface FontMetrics {
  unitsPerEm: number;
  ascent:     number;   // hhea.ascent
  descent:    number;   // hhea.descent, negative
  lineGap:    number;   // hhea.lineGap
  capHeight:  number;
  xHeight:    number;
  strikeout:  { position: number; thickness: number };
  underline:  { position: number; thickness: number };
  // OS/2 typo metrics for preferred line-height matching Word
  typoAscent:  number;
  typoDescent: number;
  typoLineGap: number;
  winAscent:   number;
  winDescent:  number;
  useTypoMetrics: boolean; // OS/2 fsSelection bit 7
}
```

Conversion at a specific `sizeHp` (half-points):

```ts
export function scaleMetrics(
  m: FontMetrics,
  sizeHp: number,
): { ascent: number; descent: number; lineGap: number } {
  const px = halfPointsToPx(sizeHp, 1, 1);  // size in px at zoom=1, dpr=1
  const scale = px / m.unitsPerEm;
  // Word uses OS/2 typo metrics when useTypoMetrics is set;
  // otherwise uses hhea ascent/descent. We match.
  if (m.useTypoMetrics) {
    return {
      ascent:  m.typoAscent * scale,
      descent: -m.typoDescent * scale,
      lineGap: m.typoLineGap * scale,
    };
  }
  return {
    ascent:  m.ascent * scale,
    descent: -m.descent * scale,
    lineGap: m.lineGap * scale,
  };
}
```

We **convert the resulting px to twips** for storage in `ShapedRun`.

### 4.6 Cache keying

Measurement is the hot path for typing. Cache keys are interned:

```ts
type MeasureKey = string;  // hashed fingerprint

function makeMeasureKey(
  fontFamily: string,
  sizeHp: number,
  weight: number,
  italic: boolean,
  features: OpenTypeFeatureSet,
  language: string,
  script: Script,
  level: number,
  text: string,   // normalized
): MeasureKey {
  return `${fontFamily}|${sizeHp}|${weight}|${italic ? 1 : 0}|` +
         `${featureHash(features)}|${language}|${script}|${level}|${text}`;
}
```

Cache strategies:

* **Cluster cache** at the word level: for each measured word, we store
  `(clusters[], advance)` under the measure key. This hits 99%+ during
  repeated typing (words repeat; identical words → identical caches).
* **LRU** of bounded size (default 50k entries, ~50 MiB).
* **Invalidation** on style change: clear all cache entries for the
  affected `(fontFamily, weight, italic, features, sizeHp)` tuple.

The key includes the language because languages differ in letter forms
(Turkish `i` vs English `i` with `locl` feature; Serbian Cyrillic `б`
variants) and line-break behavior (which affects cluster bounds at word
boundaries).

### 4.7 Inline objects

Inline images, fields, and footnote references appear in the run stream
and must participate in measurement:

* **Inline image**: treated as a cluster of fixed advance equal to the
  image width in twips (scaled per its `docPr` extents); ascent/descent
  equal to full image height (typically treated as `ascent = height`,
  `descent = 0`, anchored at baseline). This matches Word; vertical
  alignment can be overridden.
* **Field (page number, date, etc.)**: text measured after expansion; the
  cluster set is marked `ephemeral` so we re-measure on context change
  (page number changes across pages).
* **Footnote reference marker**: a superscript glyph inserted by the
  engine; measurement uses the superscript metrics from the font (half
  size, raised by ~33% of ascent).

### 4.8 Edge cases in measurement

* **Zero-width joiners/non-joiners**: preserved; HarfBuzz handles them
  (our Canvas path punts and does not ligate — acceptable in MVP).
* **Tab character `\t`**: not measured in stage 1 (tabs get widths from
  tab stops in stage 2). Emits a special cluster `{ kind: 'tab' }`.
* **Soft hyphen `U+00AD`**: measured as zero-width invisible cluster, but
  marked `hyphenatable` (stage 2 may inject a visible hyphen at the
  break).
* **Non-breaking space `U+00A0`**: normal glyph, `canBreakBefore = false`.
* **Line feed in a run**: rare but possible in imported docs. We split
  the paragraph in the parser; measurement sees pre-split runs.

### 4.9 TypeScript surface

```ts
interface MeasurePort {
  measureParagraph(
    runs: Run[],
    paraProps: ParaProps,
    paraLanguage: string,
  ): ShapedRun[];
}

interface ShapingAdapter {
  readonly name: 'canvas' | 'harfbuzz';
  capableOf(script: Script): boolean;
  shape(seg: ShapingSegment, font: ResolvedFont): ShapedRun;
}
```

---

## 5. Stage 2 — Paragraph line-break

### 5.1 Inputs and outputs

Input:

* `ShapedRun[]` from stage 1 (logical order);
* `paraProps`: alignment, first-line indent, left/right indent, tab
  stops, line spacing rule, spacing-before/after, suppressAutoHyphens,
  keepLinesTogether, keepWithNext, widowControl, bidi flag, dropCap;
* `contentFrame`: width and exclusions (wraps) by Y.

Output: **ParaLayout**:

```ts
interface ParaLayout {
  paraId:  ParaId;
  width:   number;           // twips, the width used
  lines:   Line[];
  height:  number;           // twips, total incl. spacing-before/after
  hash:    string;           // for cache
  keepWithNext:      boolean;
  keepLinesTogether: boolean;
  widowControl:      boolean;
  bidiLevel:         number;
}

interface Line {
  // geometry
  yOffset:     number;   // twips, line top relative to paragraph top
  xOffset:     number;   // twips, line left relative to content frame left
  width:       number;   // twips; may be < frame width for centered/right
  maxWidth:    number;   // twips; the width budget actually available
  ascent:      number;
  descent:     number;
  leading:     number;
  // content
  segments:    LineSegment[];  // visually ordered L→R
  logicalFirst: number;        // code-point offset in paragraph
  logicalLast:  number;
  isFirst:     boolean;
  isLast:      boolean;
  // break metadata
  endsAt:      'softBreak' | 'paraEnd' | 'columnBreak' | 'pageBreak';
  hyphenated:  boolean;        // soft hyphen expanded to visible hyphen
  justifyExtraPerGap: number;  // twips added to each breakable space
}

interface LineSegment {
  shapedRun:   ShapedRunRef;
  clusterRange:{ start: number; end: number };
  xOffset:     number;   // twips, within line
  advance:     number;   // twips
  level:       number;   // bidi
}
```

### 5.2 Break candidates (UAX #14)

We run ICU4X's line-break iterator over the paragraph's concatenated
logical text:

```ts
const iter = icu4xLineSegmenter.segmenter({ strictness: paraProps.strictLineBreak ? 'strict' : 'loose' });
const breakPoints: number[] = [...iter.segment(logicalText)];
```

Each `breakPoint` is a code-point offset where a line break is allowed.
Mandatory breaks (e.g., `\n`, `U+2029`) are flagged separately (we don't
actually see these inside a paragraph because the parser splits on them,
but ICU handles them if present).

We attach `canBreakBefore` flags to clusters during stage 1 already; stage
2 uses the ICU results to set them definitively.

### 5.3 Algorithm choice: Knuth-Plass vs first-fit

We implement **both**:

* **First-fit (greedy)**: used in the typing hot path. O(n). The line
  accepts clusters until adding one would exceed the width; then breaks
  at the last `canBreakBefore` candidate. Fast; acceptable for left-aligned
  paragraphs and for interactive editing. About 5–20× faster than K-P.
* **Knuth-Plass (total-fit)**: used for justified paragraphs and for
  re-layout batches (document open, view mode change, print). Produces
  paragraphs with minimal total badness — consistent spacing across
  lines, fewer "river" artifacts. O(n²) worst case, O(n) in practice
  with pruning.

Word 95 uses a first-fit with per-line justification (not total-fit). For
**visual parity** with Word 95 we therefore default to first-fit even for
justified text, but we offer Knuth-Plass as an opt-in under
`app.rendering.justifyAlgorithm = 'knuthPlass'`. See §5.5 on
justification.

### 5.4 Knuth-Plass outline

Donald Knuth and Michael Plass (*Software — Practice and Experience*,
1981) frame line-breaking as a shortest-path problem over a graph where
nodes are break opportunities and edges are "lines", each with a
*badness* cost.

```
boxes    w_i           ideal text width
glue     w_i ± y_i/z_i stretchable/shrinkable whitespace
penalties p_i           cost of breaking here
```

Adjustment ratio `r = (L - sum(w)) / sum(y)` (or shrink) per candidate
line; badness = `100 * r^3` if `r > 0`, `-100 * r^3` if `r < 0`, infinite
if `|r| > 1` (unless `penalty == -∞`).

Total-fit picks the break sequence minimizing the sum of
`(badness + penalty)^2`.

Our implementation:

```ts
interface KPNode { index: number; line: number; fitness: 0|1|2|3;
                   total: number; prev?: KPNode; }

function breakKnuthPlass(
  items: KPItem[],
  lineWidths: number[],
  opts: KPOpts,
): number[] {
  // Active list, feasible lines, dynamic programming.
  // Omitted for brevity; see reference implementation in
  // src/layout/linebreak/knuthPlass.ts
}
```

Reference: Knuth & Plass, *Breaking Paragraphs into Lines*, 1981; also
see TeX's `par` algorithm and Bram Stein's linebreak.js for a JS
blueprint.

### 5.5 Justification

Word's `jc=both` distributes extra width across **breakable whitespace**:

```
extraWidth = lineMaxWidth - contentWidth
perGap     = extraWidth / numberOfBreakableGaps
```

We store `justifyExtraPerGap` on each line; the DOM commit adds it to the
`x-advance` of each whitespace cluster. We don't stretch letters (Word's
default). If `perGap` exceeds a threshold (2× space width), we fall back
to non-justified (Word does similarly in narrow columns).

CJK paragraphs: Word distributes extra across **ideographic spaces
between CJK characters** (kinsoku shori), not between words. Our
distribution logic switches mode based on the line's dominant script:

```ts
if (lineIsCJKDominant(line)) {
  const gaps = line.clusters.filter(c => c.isCJK && !c.isLastInRun);
  const perGap = extraWidth / gaps.length;
  gaps.forEach(g => g.advance += perGap);
} else {
  distributeAcrossWhitespace(line, extraWidth);
}
```

### 5.6 Bidi reordering

Per UAX #9 L1/L2 rules, after line-breaking we reverse runs of characters
whose embedding level is odd (LTR base) or even (RTL base) to produce
visual order.

Algorithm (L1/L2 simplified):

```
1. Reset levels of trailing whitespace to base.
2. From the highest level down to base+1:
   For each maximal contiguous run at >= that level, reverse its
   characters in place.
```

Our `LineSegment[]` ends up ordered by **visual X**. `LineSegment.level`
carries the bidi level for caret and selection logic.

We also handle L3 (combining marks stay with their base) implicitly via
cluster-level reordering — we reorder clusters, not code points, so
combining marks follow their base.

Mirrored glyphs (e.g., `(` ↔ `)` in RTL) are swapped at shape time per
UAX #9 L4 — HarfBuzz does this. The Canvas path uses a mirror lookup
table for common pairs.

### 5.7 Tab stops

Stage 1 emits tab clusters with `kind: 'tab'` and advance = 0. Stage 2
computes each tab's effective advance:

```
Given current cursor X after prior clusters:
  Let stops = paraProps.tabStops (sorted asc) plus default tabs
      (every defaultTabStop width starting from 0).
  Find first stop > X.
  If stop is a decimal tab: find next decimal separator in following
  clusters; advance X so the decimal lies on the tab.
  If stop is a center tab: measure from tab to next break; advance so the
  midpoint of following text lies on the tab.
  Else (left/right/bar): advance X to the stop (for right, align end of
  following text to stop).
  Advance = stop - X.
  If advance < 0, treat as a normal space.
  If stop has leader ('...'/'___'/'---'), emit a leader pseudo-cluster
  filling the gap.
```

### 5.8 Hyphenation

Word's auto-hyphenate uses Liang's hyphenation patterns (same family as
TeX). We ship patterns for common languages keyed by BCP 47:

```ts
const hyphenator = await loadHyphenator(paraLanguage);
const potential = hyphenator.hyphenate(word);  // ['hy', 'phen', 'ation']
```

When Knuth-Plass cannot find a feasible break, we re-run with soft-hyphen
candidates inserted inside words at `potential` boundaries, with a small
`penalty` for hyphenation (Word's default 50).

First-fit path: at the "last break candidate" lookup, if none, try soft
hyphens in the current word.

No hyphenation for CJK (no concept), Thai (word segmentation handles it),
Arabic (kashida justification instead — implemented partially in v1).

### 5.9 Drop cap

`pProps.dropCap = drop | margin` with `dropCapLines = N`:

* Measure the first character's glyph at `ceil(N * lineHeight)` pt size.
* Reserve a rectangle of that glyph's advance + ~0.125 in gutter.
* The first `N` lines of the paragraph have their `maxWidth` reduced by
  `capWidth + gutter`; their `xOffset` is pushed right (LTR) by that
  amount.
* Line 1's leading moves up so the cap's top aligns with line 1's ascent
  (drop style) or with the paragraph's top (margin style).
* Subsequent lines (>= N+1) use full width.

### 5.10 Spacing and line-height rules

Word's line-height rules:

* **Single**: `1 × (ascent + descent + lineGap)` of the line's dominant
  font at its size.
* **1.5 / Double**: `1.5 ×` / `2 ×` single.
* **Multiple(x)**: `x ×` single.
* **AtLeast(y)**: `max(singleLineHeight, y)` where `y` is in twips.
* **Exact(y)**: `y` twips exactly (content may clip).

Per line:

```ts
function computeLineMetrics(line: Line, rule: LineRule): { ascent, descent, leading } {
  const dominant = pickDominant(line.segments);
  const natural = dominant.ascent + dominant.descent + dominant.lineGap;
  switch (rule.kind) {
    case 'single':   return distribute(dominant, natural);
    case 'multiple': return distribute(dominant, natural * rule.factor);
    case 'atLeast':  return distribute(dominant, Math.max(natural, rule.twips));
    case 'exact':    return distribute(dominant, rule.twips);
  }
}
```

`distribute(dominant, total)` sets `ascent = dominant.ascent + extra/2`
and `descent = dominant.descent + extra/2` where `extra = total -
(dominant.ascent + dominant.descent)`. `leading = total - ascent -
descent` (typically 0 after distribution; stored for debug).

Spacing-before/after: added between paragraphs; suppressed at the top of
a page if `contextualSpacing` applies between same-style paragraphs.

### 5.11 First-fit pseudocode

```ts
function firstFit(
  runs: ShapedRun[],
  widths: number[],       // max width per visual line (wraps vary)
  para: ParaProps,
): Line[] {
  const lines: Line[] = [];
  let i = 0, lineIdx = 0;
  const clusters = flatten(runs);
  while (i < clusters.length) {
    const maxW = widths[Math.min(lineIdx, widths.length-1)]
                 - firstLineIndentIfApplicable(lineIdx, para);
    let x = 0, lastBreakable = -1;
    let j = i;
    while (j < clusters.length) {
      const c = clusters[j];
      const next = x + effectiveAdvance(c);
      if (c.canBreakBefore && j > i) lastBreakable = j;
      if (next > maxW && lastBreakable > i) break;
      if (next > maxW && lastBreakable === -1) {
        // overflow; break here (emergency break, no candidate)
        break;
      }
      x = next;
      j++;
    }
    const breakAt = (j < clusters.length && lastBreakable > i) ? lastBreakable : j;
    lines.push(buildLine(clusters.slice(i, breakAt), maxW, para));
    i = breakAt;
    // skip one trailing whitespace if any
    while (i < clusters.length && clusters[i].isWhitespace && clusters[i].canBreakBefore) i++;
    lineIdx++;
  }
  return lines;
}
```

### 5.12 ParaLayout cache

`ParaLayout.hash = SHA-1(contentFingerprint + propsFingerprint + widthBucket)`.
When the engine asks for a paragraph's layout, we look up in the cache
first. A `widthBucket` groups near-equal widths (e.g., rounded to 1/20
inch) so that trivial margin-drag interactions reuse layouts.

Invalidation: a style change on any run dirties the paragraph's hash via
fingerprint change.

---

## 6. Stage 3 — Block layout

### 6.1 Block list

A section's body is a sequence of **blocks**:

* paragraph
* table
* section break (marker; resolved to a new section frame)
* anchored shape (floating) — placed separately, reserves exclusions

We iterate blocks in order, stacking their laid-out heights vertically in
the current content frame, tracking current `y` and any active exclusion
rectangles (from floats).

### 6.2 Floats and exclusions

A `w:framePr`-positioned paragraph or a `wp:anchor`-positioned shape
declares:

* position: relative to (page | margin | column | paragraph | char);
* size: explicit or derived;
* wrap: `none | square | tight | through | topAndBottom | behindText |
  inFrontOfText`.

We resolve anchor to absolute coordinates, then add an **ExclusionZone**
to the section:

```ts
interface ExclusionZone {
  yTop: number; yBottom: number;    // twips, page-relative
  xLeft: number; xRight: number;
  wrapSide: 'both' | 'left' | 'right' | 'largest';
  contour?: Point2D[];              // for tight/through
}
```

When line-breaking (stage 2), the `widths[]` array per line is computed
by subtracting overlapping exclusions at the line's Y range from the
frame width. For non-rect wraps (contour), the leading/trailing indent at
each Y is derived from the contour polygon.

**Top-and-bottom** wraps push the following blocks' Y below the shape's
bottom.

**Behind/in front of text** wraps do not affect line widths.

### 6.3 Inline vs anchored images

* Inline: shows in the run stream; measured as a cluster with image
  dimensions; line height grows if image > line's natural height.
* Anchored: positioned by anchor; reserves exclusion zone per wrap; has
  its own Z order.

### 6.4 Output

Stage 3 emits `BlockLayout[]` for the section — essentially pointers to
`ParaLayout`/`TableLayout` entries with their resolved `y` and exclusion
zones. Pagination consumes this.

---

## 7. Stage 4 — Table layout

### 7.1 Table model recap

A table is a grid of rows × columns. Cells carry `gridSpan` (horizontal
merge), `vMerge = restart | continue` (vertical merge), padding, borders,
shading, vertical alignment, and a block list (paragraphs, nested
tables).

### 7.2 Pass A: column widths

Word supports:

* `tblLayout type=fixed`: use `tblGrid` column widths as declared; cells
  reuse those widths per gridSpan.
* `tblLayout type=autofit`: measure content's `minContentWidth` (longest
  word / inline) and `maxContentWidth` (unbroken content) per column,
  then distribute available width.

Algorithm for auto-fit:

```
1. For each cell, compute (minW, maxW) by laying out its blocks at
   unconstrained width (maxW) and min width = longest unbreakable cluster
   (minW). Span cells contribute to each of their columns weighted by
   share.
2. ColMin[c] = max over cells-in-c-only of cell.minW
              + max over spanning cells of span contribution.
3. ColMax[c] = similarly for maxW.
4. If sum(ColMax) <= tableWidth: use ColMax + distribute slack
   proportionally.
5. Else if sum(ColMin) <= tableWidth: distribute tableWidth - sum(ColMin)
   across columns proportionally to (ColMax - ColMin).
6. Else: use ColMin and clip content (or overflow).
```

### 7.3 Pass B: row heights

For each row, for each cell, lay out the cell's blocks in a content frame
of width `sum(ColWidths[col..col+gridSpan-1]) - padding`. Sum the block
heights (plus padding) → `cell.contentHeight`. Row height = `max over
cells of cell.contentHeight`, subject to `w:trHeight` rule (`auto`,
`atLeast`, `exact`).

Vertically merged cells: the "restart" cell's content is laid out once at
the merged span's total height. "Continue" cells are transparent for
content but participate in borders.

Vertical alignment within a cell (`top | center | bottom`) pads the cell
content to the cell height.

### 7.4 Row break behavior

Stored on each row:

* `cantSplit`: entire row must fit on one page.
* `tblHeader`: row is repeated at the top of each new page the table
  spans.

Pagination (stage 5) uses these.

### 7.5 Borders

Border resolution is per-edge (top, left, bottom, right, insideH,
insideV) with conflict resolution (cell overrides table, style overrides
direct — actually the reverse per ECMA-376; see DOCX doc). Each cell has
four computed edges. Adjacent cells share edges; we resolve the drawn
edge as the "stronger" one (higher weight > darker color > style ranking:
`double > thick > single > dashed > dotted > none`). We emit edge
segments tied to the grid.

### 7.6 Nested tables

Recursive. Nested tables are blocks within a cell. Their pass A/B runs
with the cell's width as "available". Infinite recursion prevented by
cycle detection on table IDs (parser should reject cycles too).

### 7.7 Output

```ts
interface TableLayout {
  tableId: TableId;
  columnWidths: number[];         // twips
  rows: TableRowLayout[];
  borders: BorderSegment[];
  width: number;
  height: number;
}

interface TableRowLayout {
  rowId: RowId;
  y: number;
  height: number;
  cells: TableCellLayout[];
  cantSplit: boolean;
  isHeader: boolean;
}

interface TableCellLayout {
  cellId: CellId;
  colStart: number; colSpan: number;
  rowStart: number; rowSpan: number;
  x: number; y: number; width: number; height: number;
  padding: { top: number; left: number; bottom: number; right: number };
  blocks: BlockLayoutRef[];       // paragraphs / nested tables
  vAlign: 'top' | 'center' | 'bottom';
  shading?: Color;
}
```

---

## 8. Stage 5 — Pagination

### 8.1 Page frame

A page is defined by the active section's properties:

```ts
interface PageFrame {
  sectionId: SectionId;
  pageSize:   { w: number; h: number; orientation: 'portrait' | 'landscape' };
  pageMargins:{ top: number; right: number; bottom: number; left: number;
                header: number; footer: number; gutter: number };
  headerRef?: HeaderId;   // default | first | evenPage
  footerRef?: FooterId;
  columns:    ColumnSpec[];  // [{ width, space }]
  lineNumbers?: LineNumberSpec;
  pageBorders?: PageBordersSpec;
  watermark?:   WatermarkSpec;
  vAlign:       'top' | 'center' | 'bottom' | 'both';
}
```

Content frame per page (per column):

```
contentX      = leftMargin (+ gutter if left-side binding)
contentY      = topMargin
contentWidth  = pageW - leftMargin - rightMargin - gutter
contentHeight = pageH - topMargin - bottomMargin
                - footnoteReserved (dynamic per page)
```

For multi-column sections, the content frame is divided horizontally by
column.space and column.width.

### 8.2 Flow algorithm

Pseudocode:

```ts
function paginate(
  sections: SectionLayout[],
  opts: PaginateOpts,
): PageLayout[] {
  const pages: PageLayout[] = [];
  let currentPage = newPageFor(sections[0]);
  let cursor = { column: 0, y: contentY(currentPage, 0) };

  for (const section of sections) {
    if (needsNewPage(section, currentPage)) {
      closeAndPush(currentPage, pages);
      currentPage = newPageFor(section);
      cursor = { column: 0, y: contentY(currentPage, 0) };
    }
    for (const block of section.blocks) {
      placeBlock(block, currentPage, cursor, pages);
    }
  }
  closeAndPush(currentPage, pages);
  return pages;
}

function placeBlock(block, page, cursor, pages) {
  switch (block.kind) {
    case 'paragraph': return placeParagraph(block, page, cursor, pages);
    case 'table':     return placeTable(block, page, cursor, pages);
    case 'sectEnd':   return handleSectionEnd(block, page, cursor, pages);
    case 'anchor':    return placeAnchor(block, page, cursor, pages);
  }
}
```

### 8.3 Widow/orphan control

For a paragraph broken across a page:

* Minimum 2 lines at the bottom of the outgoing page (orphan control —
  last line on its own is avoided).
* Minimum 2 lines at the top of the incoming page (widow control — first
  line on its own is avoided).

Algorithm: if placing a paragraph would leave only 1 line on one page,
we either (a) push the entire paragraph to the next page (if the
remaining page space is sufficient to force the break with ≥2 lines on
the next), or (b) pull one extra line to keep ≥2 on both sides.

This is a micro-backtracking step; we limit backtracking to the just
closed page.

### 8.4 Keep-with-next

If `para.keepWithNext = true`, we treat the paragraph plus the next
block as an atomic unit for page-break decisions. Practically: we lay
out paragraph N + first line of N+1; if that would split, we push both
to the next page. Transitive chains (3+ paragraphs linked) unroll
iteratively.

### 8.5 Keep-lines-together

If `para.keepLinesTogether = true`, the entire paragraph must fit on one
page. If it doesn't, push to next page. If it doesn't even fit on one
page alone (rare; huge paragraph), break anyway and log a diagnostic.

### 8.6 Page-break-before

If `para.pageBreakBefore = true`, start a new page before this paragraph.
(Overridden if already at the top of a page.)

### 8.7 Section breaks

Section break kinds:

* **nextPage**: close current page, start new with new section's
  geometry.
* **continuous**: same page, new section begins on the same Y. If the
  new section has different column count, we render a boundary here.
* **oddPage** / **evenPage**: close current page; if the next page's
  number is wrong parity, insert a blank page.
* **nextColumn**: jump to next column (intra-section only).

### 8.8 Columns

Multi-column flow:

```
while more lines and cursor.column <= lastColumn:
  place line at cursor
  cursor.y += line.height
  if cursor.y + nextLine.height > contentBottom:
    cursor.column++
    cursor.y = contentY
  if cursor.column > lastColumn:
    close page; new page; cursor.column = 0
```

Balanced columns on the last page of a section use a second pass that
redistributes lines for approximately equal column heights.

### 8.9 Footnotes

Two strategies; we implement the hybrid Word uses:

1. **Reserve-and-flow**: For each page, once we know which paragraph
   lines will be placed, gather footnote references on those lines. Sum
   the footnote bodies' heights. Reduce the page's content height by
   that sum. If content now overflows, push some lines — and their
   footnotes — to the next page. This may iterate 1–2 times until fixed
   point.
2. **Continuation notice**: if a footnote body doesn't fit, it splits; a
   "continuation separator" line is drawn at the top of the following
   page's footnote area.

The footnote zone is rendered at the bottom of the page, above the
footer, separated by a note separator (a short horizontal rule by
default; customizable via `footnotePr`).

### 8.10 Headers and footers

Each page's header/footer references are resolved by:

```
first-page-header if w:titlePg && pageIndex-in-section == 0
else even-page-header if w:evenAndOddHeaders && pageNumber % 2 == 0
else default header
```

The header and footer are themselves a block stream laid out in their
own frames (of width `contentWidth`, height = `topMargin - headerDist`
etc.).

Page number fields inside headers/footers are resolved during commit,
not here — we leave a placeholder and substitute at commit time.

### 8.11 Output

```ts
interface PageLayout {
  pageIndex:  number;
  sectionId:  SectionId;
  pageSize:   { w: number; h: number };
  contentFrames: ContentFrame[];    // one per column
  header?:    BlockStreamLayout;
  footer?:    BlockStreamLayout;
  footnotes?: BlockStreamLayout;
  decorations:{
    pageBorder?: BorderBox;
    watermark?:  DecorationLayout;
    gridLines?:  GridLineSpec[];
    margins?:    MarginGuideSpec;
  };
}

interface ContentFrame {
  columnIndex: number;
  x: number; y: number; w: number; h: number;
  placed: Array<ParaPlacement | TablePlacement | AnchorPlacement>;
}

interface ParaPlacement {
  paraId: ParaId;
  yOffset: number;          // twips, where within frame
  lineRange: { start: number; end: number };  // which lines of the ParaLayout
}
```

### 8.12 Determinism considerations

* Pagination is single-threaded and ordered: page N depends on page
  N-1's last line. We cannot parallelize across pages without
  sacrificing determinism for keep-with-next chains.
* We allow *speculative* parallel pagination where sections have hard
  `nextPage` section breaks — each section paginates independently.

---

## 9. Stage 6 — Positioning and decoration

### 9.1 Resolve fields

Page-dependent fields in headers/footers are resolved:

* `PAGE` → current page number (1-based, per section numbering format).
* `NUMPAGES` → total page count.
* `SECTIONPAGES` → page count within section.
* `DATE`/`TIME` → fixed at document last-save; `PRINTDATE` at print.

Resolved fields are substituted by re-measuring that run with the new
text — cheap because the surrounding run structure is stable.

### 9.2 Absolute coordinates

All positions are converted from twips to CSS px at commit time (not
earlier), so zoom changes are cheap.

```ts
const pxX = twipsToPx(line.xOffset + frame.x, zoom, dpr);
```

### 9.3 Page decorations

* **Margin guides**: faint lines at margin boundaries, view-only.
* **Page border**: rectangular or art-border (Word's ~150 art borders
  catalog). Art borders use 9-slice SVG.
* **Watermark**: image/text positioned behind content; fixed per section.
* **Grid lines** (normal view only): show implicit lines every
  `docGrid.linePitch`.

---

## 10. Incremental layout

### 10.1 Why incremental matters

Re-laying out a 500-page document on every keystroke is not acceptable.
Typical edits affect one paragraph. We want to re-layout that paragraph,
leave the rest alone, and update pagination minimally.

### 10.2 Dirty detection

The engine emits a **Patch** after each committed command:

```ts
type Patch =
  | { kind: 'runText';      paraId; runId; newText }
  | { kind: 'runProps';     paraId; runId; newProps }
  | { kind: 'paraProps';    paraId; newProps }
  | { kind: 'paraSplit';    paraId; at; newParaId }
  | { kind: 'paraMerge';    paraIds }
  | { kind: 'tableOp';      tableId; ... }
  | { kind: 'style';        styleId; ... }
  | { kind: 'sectionProps'; sectionId; ... }
  | { kind: 'insertPara';   at; paraId }
  | { kind: 'deletePara';   paraId };
```

Dirty sets per patch:

| Patch             | Dirty ShapedRun | Dirty ParaLayout | Dirty section flow | Re-paginate from  |
|-------------------|-----------------|------------------|--------------------|-------------------|
| runText           | that run        | that para        | if para height δ   | that page         |
| runProps          | that run        | that para        | likely             | that page         |
| paraProps         | —               | that para        | likely             | that page         |
| paraSplit/Merge   | —               | both paras       | yes                | that page         |
| style (used by N) | matching runs   | N paras          | yes                | first of N        |
| sectionProps      | —               | —                | yes (frame change) | first of section  |
| tableOp           | cells affected  | cells' paras     | yes                | that page         |
| insert/deletePara | —               | —                | yes                | that page         |

### 10.3 Fast path

"Edit inside a paragraph that doesn't change paragraph height" — we
re-shape only the dirty runs (measurement), re-run line-break for that
paragraph, compare `newParaLayout.height` to old:

* Heights equal → swap `ParaLayout` in place; no pagination change; DOM
  patch is a diff of that paragraph's DOM fragment.
* Heights differ → medium path.

### 10.4 Medium path

Paragraph height changed:

* All subsequent block placements on the same page may shift.
* Pages after this one may need re-pagination.

Strategy: re-run pagination starting from the current page. Stop as soon
as the post-pagination state equals the prior state at a page boundary
(i.e., no cumulative drift). This usually terminates within 1–3 pages.

### 10.5 Slow path

Style change, section property change, page size change: full
re-pagination, but ParaLayout caches are still valid for paragraphs not
touched by the style.

We run full re-pagination in a worker (the whole section) and commit the
result when ready; the viewport keeps showing the stale layout until
then (Word has a progress indicator for similar operations).

### 10.6 Per-paragraph hash

```ts
function paraHash(para: ParaSnapshot, widthBucket: number, styleId: StyleId): string {
  return sha1(
    para.runs.map(runFingerprint).join('|') + '|' +
    paraPropsFingerprint(para.props) + '|' +
    widthBucket + '|' + styleId
  );
}
```

`widthBucket = Math.round(availableWidthTwips / 20)` (i.e., bucketed to
1 point). Identical hash → identical ParaLayout.

### 10.7 Invalidation pool

`LayoutCache` keeps weak references; under memory pressure we evict
least-recently-accessed ParaLayouts. Evicted layouts are recomputed
lazily when the paragraph re-enters the viewport.

---

## 11. Virtualization and viewport

### 11.1 Principles

A document may have thousands of pages. Committing every page to the DOM
would be wasteful and slow. We virtualize: only pages intersecting the
viewport, plus a small overscan, are fully committed. Off-screen pages
are represented by empty divs with known height.

### 11.2 PageHost component

```tsx
const PageHost: React.FC<{ pages: PageMeta[]; viewport: Rect }> = ({ pages, viewport }) => {
  const visible = selectVisible(pages, viewport, { overscan: 2 });
  return (
    <div className="doc-scroll" style={{ height: totalHeight(pages) }}>
      {pages.map(p =>
        visible.has(p.pageIndex)
          ? <FullPage key={p.pageIndex} page={p} />
          : <PlaceholderPage key={p.pageIndex} height={p.height} />
      )}
    </div>
  );
};
```

`totalHeight` is the sum of `page.height + pageGap`. We know all page
heights from pagination (fixed per page-size section). Off-screen pages
contribute to scrollbar but are cheap divs.

### 11.3 Progressive pagination

On document open:

1. Parse DOCX → domain snapshot (parse doc covers this).
2. Start layout pipeline. Paginate first **N** pages on the main thread
   (N = 10). First paint happens.
3. Enqueue remaining paragraphs to workers in order.
4. As each batch of ParaLayouts arrives, continue pagination; emit
   `PageMeta` updates via event so `PageHost` extends its scroll height.
5. If the user scrolls past the frontier, we render "Computing…"
   placeholders and prioritize the worker queue to paginate that region
   next.

### 11.4 Jump-to-page

If target page not yet paginated:

* Estimate its Y from average paragraph heights so far (adaptive).
* Scroll to the estimated position (may be approximate).
* Prioritize paginating from the current cursor to the target; re-adjust
  scroll once done.

### 11.5 Scroll and resize

* Scroll is rAF-throttled; we recompute the visible set at most once
  per frame.
* Resize triggers a full re-pagination if page-width-affecting (e.g.,
  window width drives rem-based font — we don't support that, but
  content frame width depends on view mode).
* View mode change: may change content frame width (Normal view) →
  re-pagination.

### 11.6 Intersection strategy

We use a manual intersection pass (not `IntersectionObserver` — the
latter adds latency). Given `viewport.y` and `viewport.h`, binary-search
page top offsets for the first overlapping page, then iterate.

---

## 12. Worker architecture

### 12.1 Pool

```ts
class LayoutWorkerPool {
  constructor(size = Math.max(1, hardwareConcurrency - 1)) { … }
  dispatch(task: LayoutTask): Promise<LayoutResult>;
  cancelVersion(version: number): void;
}
```

Each worker boots with:

* ICU4X WASM (line break, script, normalization).
* HarfBuzz WASM (shaping).
* Hyphenation patterns (lazy-load per language).
* A shared font cache (Worker gets font binaries via `SharedArrayBuffer`
  on supported browsers; falls back to copies otherwise).
* An `OffscreenCanvas` for fast-path Canvas measurement.

### 12.2 Protocol

```ts
type LayoutRequest =
  | {
      kind: 'measureAndBreak';
      version: number;
      paragraphs: Array<{
        paraId: ParaId;
        runs: Run[];
        props: ParaProps;
        availableWidth: number;
        widthBucket: number;
        exclusions?: ExclusionZone[];
      }>;
      styles: StyleSnapshot;
      fonts: FontRefMap;
    }
  | {
      kind: 'tableLayout';
      version: number;
      table: TableSnapshot;
      columnWidths?: number[];
    };

type LayoutResponse =
  | { kind: 'paragraphs'; version: number; layouts: ParaLayout[] }
  | { kind: 'table';      version: number; layout:  TableLayout };
```

### 12.3 Versioning and cancellation

Every request carries a `version` equal to the domain snapshot version
at dispatch time. If a new snapshot is taken before the response
arrives, the main thread calls `cancelVersion(prev)`; workers discard
in-flight results with that version. A post-`version` request from the
main thread implicitly cancels prior versions.

### 12.4 Main-thread responsibilities

* Pagination (ordered; needs cumulative state).
* DOM commit.
* Input handling.
* Selection rendering.

Everything else is worker-eligible.

### 12.5 Fairness

Queueing policy:

* High priority: paragraphs in viewport.
* Medium: paragraphs within overscan.
* Low: rest of document.

On patch commit, dirty paragraphs move to high priority.

### 12.6 Backpressure

If workers queue grows beyond `N × 50` paragraphs, we throttle new
requests and emit a telemetry event. In practice, typical docs rarely
exceed this.

---

## 13. Text shaping — deep dive

### 13.1 Script-specific notes

* **Latin, Greek, Cyrillic, Armenian, Georgian**: Canvas fast path
  works; HarfBuzz for correctness of kerning, small caps (`smcp`),
  old-style figures, discretionary ligatures.
* **CJK (Han, Hangul, Kana)**: Canvas is accurate (mostly monospaced
  per-glyph); vertical text requires HarfBuzz in v2.
* **Arabic, Hebrew**: require HarfBuzz (contextual letter forms,
  ligatures, Hebrew cantillation marks).
* **Indic scripts (Devanagari, Bengali, Tamil, Telugu, Malayalam,
  Gurmukhi)**: HarfBuzz required (reordering, conjuncts).
* **SE Asian (Thai, Lao, Khmer, Myanmar)**: word segmentation is hard;
  ICU4X supplies dictionary-based segmentation; shaping via HarfBuzz.
* **Ethiopic, N'Ko, Tifinagh, etc.**: HarfBuzz.

### 13.2 Feature selection

Default features we enable: `ccmp, liga, clig, kern, mark, mkmk, rlig,
rclt`. Disabled by default but configurable: `dlig, salt, smcp, c2sc,
onum, lnum, tnum, pnum, frac, sups, subs, zero, locl, calt`.

`locl` (localized forms) is enabled per language (e.g., Turkish dotless
`ı`).

### 13.3 Vertical text

Word's vertical text layouts (`eastAsianLayout`, `tcy`, rotated CJK)
defer to v2. The architecture accommodates it: each Line has an `axis`
(`inline` x,y), currently only horizontal. Vertical would swap axes.

### 13.4 Shaping ↔ rendering divergence test

We maintain `tests/shaping/divergence.spec.ts` that, for each fontFamily
× script × sample string, compares HarfBuzz advances (in twips) to
Canvas advances (in twips). If any cluster differs by more than 0.5 px
at 12 pt, we flag the font and switch that family to HarfBuzz even for
its "fast-path" scripts (i.e., we accept a slower render for correctness).

---

## 14. Fonts

### 14.1 Registry

```ts
interface FontRegistry {
  resolve(family: string, weight: number, italic: boolean, script?: Script): ResolvedFont;
  register(source: FontSource): ResolvedFontId;
  load(source: FontSource): Promise<FontMetrics>;
  fallbackChain(script: Script, lang: string): string[];
}

type FontSource =
  | { kind: 'system'; family: string }            // local()
  | { kind: 'embedded'; family: string; bytes: Uint8Array; obfuscated?: boolean; obfuscationKey?: string };
```

Web-font fetching is disabled by policy (no network at render time).

### 14.2 Embedded fonts in DOCX

DOCX stores font subsets in `word/fonts/*.odttf` (obfuscated TTF). The
obfuscation: first 32 bytes are XORed with a rearranged GUID from
`fontTable.xml`. See ECMA-376 Part 2, §14.2.7.3.

```ts
export function deobfuscateFont(bytes: Uint8Array, guidHex: string): Uint8Array {
  const key = guidToBytes(guidHex); // 16 bytes
  const out = bytes.slice();
  for (let i = 0; i < 32 && i < out.length; i++) {
    out[i] ^= key[15 - (i % 16)];
  }
  return out;
}
```

The resulting TTF is installed in the in-memory FontRegistry via
`FontFace` API:

```ts
const face = new FontFace(family, bytes, { weight, style });
await face.load();
(document as any).fonts.add(face);
```

### 14.3 Fallback chain

Default chains:

```
Latin:          [requested, 'Arial', 'Helvetica', 'Liberation Sans', generic-sans-serif]
Latin-serif:    [requested, 'Times New Roman', 'Liberation Serif', generic-serif]
CJK-Japanese:   [requested, 'MS Mincho', 'Hiragino Mincho', 'Noto Serif JP']
CJK-Chinese-SC: [requested, 'SimSun', 'Microsoft YaHei', 'Noto Serif SC']
CJK-Chinese-TC: [requested, 'MingLiU', 'Microsoft JhengHei', 'Noto Serif TC']
CJK-Korean:     [requested, 'Batang', 'Malgun Gothic', 'Noto Serif KR']
Arabic:         [requested, 'Traditional Arabic', 'Arial', 'Noto Naskh Arabic']
Hebrew:         [requested, 'David', 'Arial', 'Noto Sans Hebrew']
Devanagari:     [requested, 'Mangal', 'Nirmala UI', 'Noto Sans Devanagari']
Thai:           [requested, 'Tahoma', 'Leelawadee UI', 'Noto Sans Thai']
```

Platform-specific adjustments loaded at startup from
`src/platform/fontInventory.ts`.

### 14.4 Metrics parsing

We parse `hhea`, `OS/2`, `cmap` tables via `opentype.js` on first load
per font. Metrics cached; font binary retained for HarfBuzz shaping.

### 14.5 Missing-font behavior

1. Resolve from fallback chain.
2. If resolved font differs from requested, emit a diagnostic.
3. Document-level toast: "Document uses fonts not available on this
   machine. Layout may differ from the original." (One-time per
   document open.)
4. Substituted font is used for layout; its metrics drive line heights.
5. We keep the original family name in the run (for DOCX round-trip); we
   only paint with the substitute.

---

## 15. Line height and leading — canonicalized

### 15.1 Rules matrix

| `w:lineRule`   | Value in twips `v`   | Effective line height |
|----------------|----------------------|-----------------------|
| `auto`         | multiplied by `v/240` | `naturalHeight * v / 240`  |
| `atLeast`      | minimum               | `max(naturalHeight, v)`    |
| `exact`        | exact                 | `v`                        |

`naturalHeight` = `max over line's clusters of (ascent + descent) + max
lineGap` per the **dominant** font's metrics (see §15.2), matching Word
95's behavior.

### 15.2 Dominant font

The dominant font of a line is the font of the **last** glyph cluster
before the line-end (Word's convention). Exception: for a line
containing only whitespace + end-of-line, the dominant font is the
paragraph's `rPr` default font, not the previous paragraph's.

This rule matters for mixed-size lines: a small-text line followed by
an image has the image's natural height, but a line of text with a
single larger character takes that character's metrics.

### 15.3 Leading distribution

Given `total = effectiveLineHeight`, `dominantAscent`, `dominantDescent`:

```
extra = total - (dominantAscent + dominantDescent)
line.ascent  = dominantAscent  + extra / 2
line.descent = dominantDescent + extra / 2
```

Word's actual distribution for `atLeast` and `auto` gives the *extra*
below the baseline (all in descent). We match that when feature flag
`rendering.lineLeading = 'wordCompatible'` is set (default true for
DOCX round-trip fidelity).

---

## 16. Selection and caret

### 16.1 Model

Selection is a range in **logical text positions**:

```ts
interface Position {
  paraId:  ParaId;
  offset:  number;   // code-point offset within paragraph
  bias:    'before' | 'after';  // for boundaries at line starts
}

interface Selection {
  anchor: Position;
  focus:  Position;
  rectangular?: { startCol: number; endCol: number };
}
```

### 16.2 Caret rendering

* 1px vertical DOM element `<div class="caret">` positioned at the
  logical caret's visual location.
* Height = ascent + descent of the current line.
* Blink via CSS animation (500ms on / 500ms off) toggled by `aria-hidden`
  when the app loses focus.
* Bidi caret: at a direction boundary, the caret can be at two visual
  positions for one logical position; we show the one matching the
  paragraph direction unless the user explicitly stepped into the other
  side (Word's "keyboard caret" behavior).

### 16.3 Selection highlights

Per page, per line covered by the selection, we emit a rectangle:

```
selection rectangle =
  union of visual x-ranges of clusters whose logical position ∈ selection
```

For bidi text, a single logical range can produce multiple disjoint
visual rectangles per line. We render each as a separate
`<div class="sel-rect">` positioned absolutely behind the line's glyph
runs (z-index below text, above page background).

### 16.4 Rectangular selection

Holding Alt while dragging produces a rectangular selection in pixel
space. We translate to a grid of (line, xStart, xEnd) per page and
render one rectangle per line, clipped to the drag rectangle. Typing
inserts at each row, Word-style.

### 16.5 Hit testing

Given a page-relative point `(x, y)`:

1. Binary-search pages by Y (we already have this from viewport).
2. Within page, binary-search lines by Y.
3. Within line, linear-scan visual segments by X (small N).
4. Within segment, walk clusters to find the cluster whose `[xLeft,
   xRight)` contains `x`. If `x < segment.xOffset`, snap to segment
   start; if `x >= segment.end`, snap to segment end.
5. Compute logical position: cluster's `logicalStart` plus a sub-cluster
   offset if we support intra-cluster caret (we do not for composed
   emoji / ZWJ sequences; we snap to cluster boundaries).

Result: a `Position`.

### 16.6 Cursor movement

* **Left/Right**: move one cluster visually. Logical position adjusts per
  bidi level (logical + 1 in LTR segments, logical − 1 in RTL segments
  of a bidi-wrapped paragraph).
* **Up/Down**: maintain a **caret X-goal** (pixel) across lines; find
  the line above/below and hit-test at the goal X.
* **Word left/right** (Ctrl-arrow): move by UAX #29 word boundaries.
* **Home/End**: move to line start/end (visual).
* **Ctrl-Home/End**: document start/end.
* **PgUp/PgDn**: previous/next page, same relative position.
* **F8 extend mode**: cycles word/sentence/paragraph/section/document.

### 16.7 Cross-page selection

Selection can span pages:

* Highlight rectangles computed per page.
* Auto-scroll: while dragging near viewport edges, scroll at 200 px/s
  proportional to edge distance; recompute selection on each rAF.
* On release, focus moves to the focus end.

---

## 17. Input integration

### 17.1 Invisible editable surface

We maintain a single off-screen `<div contenteditable>` of size 1×1 px
anchored at the caret's screen position:

```html
<div class="ime-surface"
     contenteditable="true"
     spellcheck="false"
     autocorrect="off"
     autocapitalize="off"
     style="position:fixed; left:Xpx; top:Ypx; width:1px; height:1px;
            overflow:hidden; outline:none; caret-color:transparent">
</div>
```

### 17.2 Event flow

1. User presses a key / inputs via IME.
2. `keydown`/`beforeinput`/`compositionstart`/`compositionupdate`/
   `compositionend` fire on the surface.
3. Our `InputAdapter` intercepts:
   - For simple keystrokes, calls `engine.insertText(ch)`.
   - For IME composition, inserts placeholder text with a
     `composition: true` marker; on `compositionend`, replaces with
     final text.
4. Engine emits a patch; pipeline commits; caret repositions; surface
   moves to new caret position.

### 17.3 Composition rendering

During composition, the composed text is injected into a temporary
**compositionRun** inside the paragraph. Stage 1 re-measures; stage 2
re-breaks if needed; the DOM renders the composition with a dotted
underline per platform convention. On commit, we swap to a permanent
run.

### 17.4 Clipboard

`copy`/`cut`/`paste` listeners on the IME surface (document-level if the
surface isn't focused — rare).

* Copy: assemble HTML (from layout DOM) + plain text + RTF (optional).
* Paste: parse HTML → domain fragment; run through domain-command
  pipeline. Plain-text fallback uses current paragraph props.

### 17.5 Focus

When the user clicks a page:

1. Hit-test to find logical position.
2. Move selection caret there.
3. Move IME surface under the caret.
4. Call `.focus()` on the surface.

When the app blurs, we hide the caret (accessibility cue) but keep the
selection visible (dimmed).

---

## 18. Drawing, shapes, and WordArt

### 18.1 SVG overlay per page

Each page has two SVG children:

* **Below text** SVG: page borders, watermark, below-text floats (wrap
  style `behindText`).
* **Above text** SVG: anchored shapes wrapped `inFrontOfText`, selection
  handles, revision marks.

### 18.2 Inline images

Rendered as `<img>` inside the appropriate `<span>` in the glyph-run
DOM. `alt` from `docPr.descr`.

### 18.3 Floating shapes

Rendered in the SVG layer as `<g transform="translate(...) rotate(...)">`
with inner `<path>` / `<rect>` / `<image>`. Coordinates in CSS px
(twips × conversion).

### 18.4 Wrap contours

For `wrapTight` / `wrapThrough`, the shape carries a polygonal contour
(in DrawingML EMUs). We convert to per-Y indent ranges:

```
For each line's Y range [lineTop, lineBottom]:
  indents = {left: 0, right: 0}
  intersect contour polygon with horizontal slabs
  reduce to left/right indent additions
Used by stage 2 to shrink maxWidth.
```

For `wrapTopAndBottom`, no intra-line indent; the shape's full horizontal
extent blocks lines with any Y overlap.

### 18.5 WordArt

WordArt envelopes are rendered as SVG path text (curve-fit). Fill,
stroke, shadow, 3-D bevel (Word's approximation) emitted as SVG
filters/gradients. v1 covers 30 "classic" WordArt presets; deferred the
full 2007 WordArt catalog to v2.

### 18.6 OLE embeddings and EMF

Legacy Word 95–2003 docs carry OLE embeddings with EMF previews. We:

* Parse EMF via a WASM port of `libEMF` (enhanced metafile) or
  convert-on-import via a background worker.
* Rasterize to PNG at 2× DPR for display.
* Fall back to placeholder (icon + label) if parsing fails.

### 18.7 Z-order

1. Page background (white).
2. Page border / watermark.
3. `behindText` floats.
4. Body text glyph runs.
5. `inFrontOfText` floats.
6. Selection highlights (above text background, below glyphs — actually
   we use negative-z mask: selection is behind text via stacking).
7. Caret.

---

## 19. Zoom and view modes

### 19.1 Zoom

Zoom is a CSS-level transform (`transform: scale(z)` on the page host)
for small/moderate zoom changes. Why not re-shape at the new size?

* Rendering is identical visually (browser scales glyph outlines).
* Line-break is in twips; unchanged.
* Caret/hit-test conversions include zoom; fine.

Exception: at extreme zoom (< 25% or > 400%), per-glyph grid snapping
drifts and text appears slightly off. At those extremes we **re-shape**
at an adjusted `sizeHp`:

```
effectiveSizeHp = baseSizeHp * zoom (capped to reasonable range)
```

and then scale the page host by `1/zoom` to compensate. Net: glyphs
render at their natural optical size, not stretched. This is gated by
`rendering.extremeZoomReshape = true`.

### 19.2 View modes

* **Page Layout** (default): pages are visible rectangles with margins;
  what prints is what shows.
* **Normal**: continuous vertical stream, narrow margin (0.5"),
  no page boundaries drawn, no headers/footers; faster scrolling.
  Uses a single `PageFrame` of `h = Infinity` effectively — pagination
  degenerates to a single "page".
* **Outline**: reduced styling, indented by heading outlineLvl,
  collapsible by heading. Built as a transformed view on top of the same
  ParaLayout model, skipping non-heading paragraphs below collapse.
* **Master Document**: outline with subdocument boundaries highlighted.
  Subdoc loading deferred.
* **Full Screen**: chrome hidden; content fills window with minimum
  decorations.
* **Print Preview**: page-layout scaled to fit window; multi-page grid
  toggle (2×2, 4×4). Shares layout output with Page Layout view.

### 19.3 Transitions

View mode changes invalidate stage-3 onward (content frame width
changes). Stages 1–2 survive (measurement and line-break at current
width cached). To make the transition cheap, we pre-layout Normal view
alongside Page Layout view when a document is open (optional; default
off for memory reasons, on for docs < 50 pages).

---

## 20. Print and PDF

### 20.1 Print surface

Print reuses `PageLayout[]`. We render into a print-specific DOM
container:

```html
<div class="print-root">
  <div class="print-page" style="width:8.5in;height:11in"> … </div>
  <div class="print-page"> … </div>
  …
</div>
```

No scroll container, no overflow clipping, one page per printed sheet
via CSS `page-break-after: always`.

### 20.2 Routes

* **Route 1 (MVP)**: `win.webContents.print({ silent, printBackground,
  deviceName, ... })` with an `onbeforeprint` handler that mounts
  `PrintRoot` and `onafterprint` that unmounts. Chromium paginates the
  DOM we gave it; since each `.print-page` is exactly one page size,
  Chromium honors our boundaries.
* **Route 2**: `win.webContents.printToPDF(options)` → PDF bytes.
  Useful for "Export to PDF" without involving a printer driver. Same
  mount/unmount dance.
* **Route 3 (v2)**: Direct PDF generation via `pdf-lib` from our
  `PageLayout[]`. Lets us embed fonts precisely, produce tagged PDF
  (accessible PDF), and avoid Chromium's quirks. Heavy lift; deferred.

### 20.3 Determinism at print

We ensure `zoom = 1` and `dpr` is taken from the print target (300 dpi
default; `deviceName`-reported where possible). Font metrics come from
the same registry as screen.

### 20.4 Page number fields at print

`NUMPAGES` fields need final page counts. At print, we freeze the
`PageLayout[]` and resolve fields; no further edits while printing.

### 20.5 Print preview

Print preview is in-app; uses the same `PrintRoot` scaled to fit. No
OS dialog.

---

## 21. Accessibility

### 21.1 Semantic DOM

* Each **page** is `<section role="document" aria-label="Page 3">`.
* Each **paragraph** is `<div role="paragraph">`. Paragraphs with
  `pStyle` set to a heading style get `role="heading" aria-level="N"`.
* Each **line** is a visual presentation node and should not surface to
  AT. We set `role="presentation"` on line divs.
* Each **glyph run** `<span>` is a text node; AT reads the contained
  text node.
* **Tables** use `<div role="table">` / `<div role="row">` /
  `<div role="cell">` (we don't use native `<table>` because cell
  positions are absolute, not browser-laid-out). `role="columnheader"`
  where applicable.
* **Images** `<img alt="...">`.
* **Footnotes** use `<a href="#fn-N" role="doc-noteref">` in body and
  `<aside role="doc-footnote" id="fn-N">` in footnote area.

### 21.2 Logical order vs visual order

AT must read **logical** text (logical paragraph order, logical run
order within paragraph). Bidi reordering is visual only. To reconcile:

* We emit `aria-label` on the paragraph `<div>` containing the full
  logical text. AT will announce the `aria-label` instead of walking
  visual children when present. This is slightly wasteful (duplicate
  text) but the simplest correct approach.
* For visible text children (enabling find/copy/select), we use
  `aria-hidden="true"` on the inner spans to avoid double reading, OR
  we rely on the browser picking `aria-label` over children. We go with
  the former explicitly.

Trade-off: the `aria-label` grows with the paragraph. For very long
paragraphs (> 4000 chars), we fall back to letting AT walk children (and
accept minor visual/logical order disagreement on bidi-heavy content).

### 21.3 Caret & selection reporting

We use `aria-activedescendant` on the page container pointing to a
synthetic `<span id="caret-N">` placed at the caret's logical position.
AT reports "caret moved to paragraph X, offset Y" via that mechanism.

### 21.4 High-contrast & reduce-motion

* Respect `prefers-contrast: more` by strengthening selection/caret
  contrast.
* Respect `prefers-reduced-motion` by disabling caret blink.

### 21.5 Keyboard navigation beyond caret

Full keyboard access to ribbons, panels, and dialogs is a UI concern
(separate doc), but the rendering layer ensures focus visuals are
keyboard-reachable and styled per OS convention.

---

## 22. Performance tactics

### 22.1 DOM commit strategy

* Build a `DocumentFragment` off-DOM for each dirty page.
* Populate line/glyph spans.
* Swap into the page container with one `replaceChildren(fragment)` call.
* One reflow per page per commit.

### 22.2 CSS containment

```css
.page { contain: strict; content-visibility: auto; }
.line { contain: layout paint; }
```

`contain: strict` isolates page layout from ancestors; the browser
skips ancestors' reflows if page size doesn't change. `content-visibility:
auto` lets the browser skip rendering offscreen pages that are still in
DOM (extra layer of virtualization; we still remove most offscreen
pages).

### 22.3 Typing hot path

* Debounce commits for 8 ms (one frame at 120 Hz, half a frame at 60 Hz)
  to coalesce keystroke bursts.
* Fast-path measurement (Canvas for known scripts) avoids HarfBuzz cost
  during typing of Latin/CJK text.
* Don't allocate on the hot path: reuse `Cluster` and `Line` pools.

### 22.4 Avoid layout thrash

* Never mix reads (`offsetTop`, `getBoundingClientRect`) and writes in
  the same micro-task. All reads happen before any write.
* Render pass schedules via `requestAnimationFrame`; input pass is
  synchronous but defers DOM writes to the rAF.

### 22.5 Worker batching

* Batch paragraphs in groups of 10–20 per worker message.
* Batch results back on rAF boundaries.

### 22.6 Cache sizing

* ParaLayout cache: 50k entries with LRU.
* Cluster measurement cache: 200k entries with LRU.
* Font metrics cache: unbounded per resolved font (small).

### 22.7 Numeric caveats

* Avoid `Number.prototype.toFixed`-based hashing — slow.
* Use integer math for cache keys where possible.

### 22.8 Target metrics

| Operation                            | Target (median) | Budget        |
|--------------------------------------|-----------------|---------------|
| Type one character                   | < 8 ms e2e      | 16 ms         |
| Paginate 100 paragraphs (Latin)      | < 50 ms worker  | 100 ms        |
| Open 100-page document               | < 1 s first paint, < 3 s fully paginated | 5 s |
| Zoom change (no re-shape)            | < 16 ms         | 33 ms         |
| Scroll 1 page                        | < 16 ms         | 33 ms         |
| Print 10 pages                       | < 500 ms pre    | 1 s           |

---

## 23. TypeScript interface reference

### 23.1 `LayoutEngine`

```ts
export interface LayoutEngine {
  /** Apply a domain snapshot. Returns a LayoutVersion. */
  setSnapshot(snapshot: DomainSnapshot): LayoutVersion;

  /** Apply a patch incrementally; returns the new version and dirty set. */
  applyPatch(patch: Patch): { version: LayoutVersion; dirty: DirtySet };

  /** Request page layouts; returned progressively via events. */
  paginate(range?: { from: PageIndex; to: PageIndex }): AsyncIterable<PageLayout>;

  /** Get the currently laid-out page (may return an in-progress placeholder). */
  getPage(index: PageIndex): PageLayout | PlaceholderPage;

  /** Hit-test: (pageIndex, pagePoint) → logical position. */
  hitTest(index: PageIndex, x: number, y: number): Position | null;

  /** Inverse: logical position → page-relative point + line. */
  layoutFor(pos: Position): PositionLayout | null;

  /** Resize viewport (affects virtualization priority, not layout). */
  setViewport(viewport: { x: number; y: number; w: number; h: number }): void;

  /** Set view mode. */
  setViewMode(mode: ViewMode): void;

  /** Zoom. */
  setZoom(zoom: number): void;

  /** Dispose; terminates workers, clears caches. */
  dispose(): void;

  /** Events */
  on<K extends keyof LayoutEvents>(ev: K, h: LayoutEvents[K]): Unsubscribe;
}

interface LayoutEvents {
  pageUpdated: (p: PageLayout) => void;
  pageRangeExtended: (count: number) => void;
  error: (err: LayoutError) => void;
  metrics: (m: LayoutMetrics) => void;
}
```

### 23.2 `ParaLayout`, `Line`, `GlyphRun`

```ts
export interface ParaLayout {
  paraId: ParaId;
  width: number; height: number;
  lines: Line[];
  hash: string;
  keepWithNext: boolean;
  keepLinesTogether: boolean;
  widowControl: boolean;
  bidiLevel: number;
}

export interface Line {
  yOffset: number; xOffset: number;
  width: number; maxWidth: number;
  ascent: number; descent: number; leading: number;
  segments: LineSegment[];
  logicalFirst: number; logicalLast: number;
  isFirst: boolean; isLast: boolean;
  endsAt: 'softBreak' | 'paraEnd' | 'columnBreak' | 'pageBreak';
  hyphenated: boolean;
  justifyExtraPerGap: number;
}

export interface GlyphRun {
  shapedRunRef: ShapedRunRef;
  clusterRange: { start: number; end: number };
  xOffset: number; advance: number;
  level: number;
  font: ResolvedFontId;
  sizeHp: number;
  color: Color;
  decorations: TextDecoration[];
}

export interface PageLayout {
  pageIndex: number;
  sectionId: SectionId;
  pageSize: { w: number; h: number };
  contentFrames: ContentFrame[];
  header?: BlockStreamLayout;
  footer?: BlockStreamLayout;
  footnotes?: BlockStreamLayout;
  decorations: PageDecorations;
  height: number;  // cached for virtualization
}

export interface FontMetrics {
  unitsPerEm: number;
  ascent: number; descent: number; lineGap: number;
  capHeight: number; xHeight: number;
  strikeout: { position: number; thickness: number };
  underline: { position: number; thickness: number };
  typoAscent: number; typoDescent: number; typoLineGap: number;
  winAscent: number; winDescent: number;
  useTypoMetrics: boolean;
}

export interface ShapedRun {
  runId: RunId;
  segmentIndex: number;
  script: Script;
  level: number;
  font: ResolvedFontId;
  sizeHp: number;
  features: OpenTypeFeatureSet;
  text: string;
  clusters: Cluster[];
  width: number;
  ascent: number; descent: number; lineGap: number;
}
```

### 23.3 `LayoutPort` — engine ↔ domain

```ts
export interface LayoutPort {
  getDomainSnapshot(): DomainSnapshot;
  getStyle(id: StyleId): ResolvedStyle;
  getSection(id: SectionId): SectionProps;
  getFont(name: string, weight: number, italic: boolean): ResolvedFontId;
  onDomainChange(handler: (patch: Patch) => void): Unsubscribe;
}
```

The engine is agnostic to the domain module's internals; this port is
the only contract.

### 23.4 Worker protocol

```ts
export type WorkerMessage =
  | { kind: 'boot'; font: FontSourceMap; icu4x: WasmUrl; harfbuzz: WasmUrl }
  | { kind: 'measureAndBreak'; version: number; paragraphs: ParaWorkInput[]; styles: StyleSnap }
  | { kind: 'tableLayout'; version: number; table: TableSnap }
  | { kind: 'cancel'; version: number }
  | { kind: 'dispose' };

export type WorkerResponse =
  | { kind: 'ready' }
  | { kind: 'paragraphs'; version: number; layouts: ParaLayout[] }
  | { kind: 'table'; version: number; layout: TableLayout }
  | { kind: 'error'; version: number; error: string };
```

### 23.5 `LayoutCache`

```ts
export interface LayoutCache {
  paraLayout(hash: string): ParaLayout | undefined;
  putParaLayout(hash: string, l: ParaLayout): void;
  invalidateByStyle(styleId: StyleId): void;
  invalidateByFont(fontId: ResolvedFontId): void;
  readonly stats: { hits: number; misses: number; size: number };
}
```

---

## 24. Edge cases catalog

### 24.1 Long unbreakable word

A Latin string with no break candidate overflowing the line. Strategies
from cheapest to costliest, matching Word:

1. **Overflow past margin** (Word's default on short margins) — the word
   renders past the right margin; widow/orphan is not violated; the next
   line starts normal.
2. **Forced break at cluster boundary** (`w:autoSpaceDE` analogue for
   Latin forces) — insert an artificial break at the last cluster that
   fits; leave the rest on the next line. This is the MVP default.
3. **Shrink to fit** (optional) — reduce font size by 1 px until fit.
   Not default; user opt-in.

CJK rarely hits this because every cluster is a break candidate (except
kinsoku chars).

### 24.2 Vertical text

Deferred to v2. Architecture: a `Line` has `axis: 'horizontal' | 'vertical'`;
the stage-2 algorithm is axis-agnostic (operates on `inlineAxis` and
`blockAxis`).

### 24.3 Huge table (≥ 10k rows)

* **Lazy row layout**: lay out only rows intersecting the viewport plus
  overscan.
* **Virtualize off-screen rows**: known-height placeholders.
* **Pagination integration**: pagination needs row heights to know where
  page breaks fall. For huge tables, we lay out on demand: pagination
  pauses after the last known-laid-out row, emits a "computing"
  placeholder page, continues once more rows are available.
* **Column widths** computed from first 1000 rows as a heuristic, then
  widened if later rows exceed.

### 24.4 Huge image

* Image dimensions respected; we never auto-resize.
* Preview rasterization at 2× viewport DPR max; full-resolution asset
  only loaded for print.
* Lazy-load off-screen image `<img>` via `loading="lazy"`.

### 24.5 Unsupported font

As §14.5.

### 24.6 Mixed-direction paragraph

Full UBA compliance. Test suite exercises each bidi pair class
combination.

### 24.7 Exact line rule with overflow

If `lineRule=exact` and content is taller than the line, content clips.
We apply CSS `overflow: hidden` on the line; AT still reads the full
logical text.

### 24.8 Tab past right margin

Tab stop beyond `contentWidth`: Word advances to the stop anyway (line
overflows). We match.

### 24.9 Empty paragraph

Zero runs. Renders as an empty line of height = paragraph's default
font's line height. Still has a caret position.

### 24.10 Paragraph with only a break

Handled as empty paragraph + break flag (page break, column break).

### 24.11 Nested frame inside a table cell

Frames inside table cells have their own exclusion zone local to the
cell. We support this fully.

### 24.12 Paragraph with numbering

The numbering label is a pseudo-run prepended at stage 1. Its advance is
part of the first line's first segment. For multi-line paragraphs,
subsequent lines indent by the label's width + `w:hanging`
(equivalently, `indent.firstLine = negative, indent.left = labelWidth`).

### 24.13 Hanging punctuation

Word supports hanging punctuation (full-width brackets in CJK). We
implement via a per-cluster `hanging: boolean` flag that reduces the
cluster's contribution to line width when it's the last cluster. Gated
by `docGrid.hanging` flag.

### 24.14 RTL first-line indent

In RTL paragraphs, first-line indent applies from the right edge. Line
`xOffset` becomes relative to the content frame's right edge.

### 24.15 Single character > line width

The character gets its own line; overflows the line width; we log a
diagnostic but do not fail.

### 24.16 Image height > page height

The image gets a page to itself; portion past page height clips. v2:
shrink-to-fit option.

### 24.17 Footnote reference at end of paragraph that page-breaks

The footnote body stays on the page of its first reference — even if
that reference's paragraph spills to a later page. Word semantic.

### 24.18 Cross-reference to page number

Resolved during stage 6 after pagination is stable; if it changes, the
affected paragraph is re-shaped and re-broken (measurement differs).

### 24.19 Conditional formatting in tables

Row/column conditional styling (first row, last row, banded) applied at
stage 4 before block layout inside cells.

### 24.20 Line numbers

Optional per section (`w:lnNumType`). Rendered in left margin; counted
per page/section/continuous per spec. One additional decoration pass at
stage 6.

---

## 25. Selection edge cases

### 25.1 Cross-page stream selection

Focus-following scroll; one or more highlight rects per page along the
path. Implementation: walk pages between anchor and focus, emit per-page
rectangle groups.

### 25.2 Caret at end-of-line vs start-of-next-line

Logical position at a soft break is ambiguous. `Position.bias = 'before'`
means "end of previous visual line"; `'after'` means "start of next
visual line". Default after moving with Right arrow: `'after'`. After
End key: `'before'`. Matches Word.

### 25.3 Caret in bidi neutral zone

Between an LTR and RTL run, the caret's visual X depends on which run
owns the boundary. Per UBA, we pick the caret side matching the
direction the user moved into. Arrow-right in an LTR paragraph crossing
into an RTL run places the caret at the visual right of the RTL run's
last character (which, logically, is its first character). Documented
visible caret jumps are acceptable (Word's behavior).

### 25.4 Extend selection modes

`F8` toggles through expand-by-unit modes. Each unit has a segmentation:

* word: UAX #29 word bounds;
* sentence: `.`/`!`/`?` + whitespace (locale-aware dictionary TBD);
* paragraph: paragraph bounds;
* section: section bounds;
* document: entire doc.

We maintain `selection.anchor` fixed; `selection.focus` jumps to the
next/previous unit boundary from its current position on each press.

### 25.5 Drag inside image

Selecting overlaps an inline image: the image is a single cluster; hit
tests return position "before" or "after" the image; selection includes
the image when the focus crosses it.

### 25.6 Click inside a wrap float

Floating shapes with wrap type `behindText` are non-selectable by
default (clicking "falls through" to the text behind). Alt-click
selects the shape. This is the Word behavior.

---

## 26. Diagrams

### 26.1 Class diagram (ASCII)

```
+-----------------+       +-----------------+       +-----------------+
|  LayoutEngine   |<>---->|   LayoutCache   |<>---->|   MeasureCache  |
+-----------------+       +-----------------+       +-----------------+
        |
        |                 +-----------------+       +-----------------+
        +---------------->| LayoutWorkerPool|<>---->|  LayoutWorker   |
        |                 +-----------------+       +-----------------+
        |
        |                 +-----------------+
        +---------------->|   FontRegistry  |
        |                 +-----------------+
        |
        v
+-----------------+       +-----------------+       +-----------------+
| SectionLayout[] |<>---->|   PageLayout    |<>---->|  ContentFrame   |
+-----------------+       +-----------------+       +-----------------+
                                 |                         |
                                 v                         v
                          +-------------+        +------------------+
                          | BlockLayout |<>----->|   ParaLayout     |
                          +-------------+        +------------------+
                                                          |
                                                          v
                                                  +-------------+
                                                  |    Line     |
                                                  +-------------+
                                                          |
                                                          v
                                                  +-------------+
                                                  | LineSegment |
                                                  +-------------+
                                                          |
                                                          v
                                                  +-------------+
                                                  | ShapedRun   |
                                                  +-------------+
                                                          |
                                                          v
                                                  +-------------+
                                                  |  Cluster    |
                                                  +-------------+
                                                          |
                                                          v
                                                  +-------------+
                                                  |   Glyph     |
                                                  +-------------+
```

### 26.2 State diagram (incremental layout)

```
            ┌─────────────────┐
            │     Clean       │
            └────────┬────────┘
                     │ patch
                     ▼
            ┌─────────────────┐
            │   DirtyMarked   │ (paras and pages marked dirty)
            └────────┬────────┘
                     │ rAF tick
                     ▼
            ┌─────────────────┐       ┌─────────────────┐
            │    Measuring    │──────▶│     Breaking    │
            └────────┬────────┘       └────────┬────────┘
                     │                         │
                     │ cancel(new version)     │
                     ▼                         ▼
            ┌─────────────────┐       ┌─────────────────┐
            │   Cancelled     │       │   Paginating    │
            └─────────────────┘       └────────┬────────┘
                                               │
                                               ▼
                                      ┌─────────────────┐
                                      │   Committing    │
                                      └────────┬────────┘
                                               │
                                               ▼
                                      ┌─────────────────┐
                                      │     Clean       │
                                      └─────────────────┘
```

### 26.3 Paginate with footnotes (sequence)

```
Engine                 Paginator              FootnoteArea
  │  placeBlock(para)  │                           │
  │──────────────────▶│                           │
  │                    │  discover fn refs         │
  │                    │─────────────────────────▶│
  │                    │◀── fn heights           │
  │                    │  reserve space            │
  │                    │  place lines remaining    │
  │                    │                           │
```

---

## 27. Testing

### 27.1 Stage-isolated tests

* **Measure**: given `runs[]` and font metrics, assert `ShapedRun[]`
  widths match a golden table. Separate tests for Canvas fast path and
  HarfBuzz path.
* **Line break**: given `ShapedRun[]` and widths, assert the break
  points on a corpus of paragraphs.
* **Justification**: given a target width, assert `justifyExtraPerGap`
  and post-justification widths.
* **Bidi**: exhaustive per UAX #9 test file (bidi-test.txt) against our
  L1/L2 reorder.
* **Table layout**: auto-fit on synthetic tables with known min/max
  widths.
* **Pagination**: keep-with-next chains, widow/orphan on synthetic
  paragraphs of known heights.

### 27.2 Golden documents

Reference corpus of DOCX files (ours and public) where we record the
expected `PageLayout[]` JSON. CI diffs against these; breakages require
updating goldens with reviewer sign-off.

### 27.3 Screenshot diffs

Per viewport at standard zooms (100%, 150%, 200%), render the first 10
pages of each reference doc to PNG via a headless Electron run; diff
against baseline using `pixelmatch` with 0.5% tolerance.

### 27.4 Cross-comparison

For ambiguity (e.g., table across pages with cantSplit in specific
configurations), we document the reference behavior and cross-check
against LibreOffice (`pdftocairo` a LibreOffice-rendered PDF at 300 dpi
and compare pagination boundaries to ours). LibreOffice is our tiebreak
when the Word spec is underspecified.

### 27.5 Fuzz tests

Random paragraph generator producing runs with varying scripts, sizes,
features, languages; line-break must always produce a valid ParaLayout
(invariant: every cluster appears in exactly one line) and pagination
must yield monotonic page Y coordinates.

### 27.6 Perf microbenchmarks

Per stage; recorded over time. Regressions flagged if > 15% slowdown
over 7-day median.

### 27.7 AT smoke tests

Automated NVDA+Firefox session (headless) reading a 3-page sample;
assert paragraph order and heading levels surfaced correctly.

---

## 28. Risks and mitigations

### 28.1 Complexity of custom layout

Risk: we underestimate the effort to reach Word parity.

Mitigation:

* **Incremental rollout**: Latin-only in sprint 1; CJK in 2; Arabic and
  Hebrew in 3; Indic in 4; remaining in 5. Each sprint ships a
  feature-gated milestone.
* **Reference implementation study**: LibreOffice's `sw/source/core/layout`
  is open source and is our reference for Word-like pagination corners.
  We document our divergences.
* **Test-driven**: golden docs from day 1; no feature merges without
  tests.

### 28.2 Font availability

Risk: target OS lacks a font used by the document; substitute looks
materially different.

Mitigation:

* **Core set**: ship a curated set of open-licensed fonts (Liberation
  Sans/Serif/Mono, Noto Sans CJK, Noto Naskh Arabic, Noto Sans
  Devanagari, etc.) installed by default with the app.
* **Per-document metric warning**: see §14.5.
* **Font substitution table**: per spec recommendations, substitute
  Calibri → Carlito, Cambria → Caladea, Times New Roman → Liberation
  Serif, Arial → Liberation Sans. Metric-compatible replacements.

### 28.3 DOM performance on massive docs

Risk: 10k-page docs overwhelm the DOM.

Mitigation:

* Virtualization (see §11).
* **Huge-doc mode**: opt-in Canvas renderer; loses AT but preserves
  interactivity for very large docs. Guide users with a prompt.
* Memory pressure evictions of ParaLayout (re-computed on return to
  viewport).

### 28.4 Shaping divergence

Risk: HarfBuzz advance ≠ Chromium's painted advance for the same font.

Mitigation: divergence test (§13.4); per-font override matrix; v2 SVG
glyph rendering if necessary.

### 28.5 Printer driver quirks

Risk: OS printer drivers alter margins or rasterization.

Mitigation: ship Route 2 PDF export as the "print source of truth";
print dialog offers "Print via PDF" for accuracy.

### 28.6 Electron worker availability

Risk: older Electron versions limit `SharedArrayBuffer` and
OffscreenCanvas.

Mitigation: require a minimum Electron version (32+) that supports both;
fall back to non-shared font data (extra copy, acceptable).

### 28.7 Accessibility regressions

Risk: custom caret/selection overrides native AT APIs incorrectly.

Mitigation: automated AT smoke tests; manual quarterly audit with NVDA,
JAWS, VoiceOver; expose a "Compatibility mode" that reverts to native
selection on demand.

---

## 29. Dependencies summary

| Dep                      | Purpose                     | License   | Alternative                     |
|--------------------------|-----------------------------|-----------|---------------------------------|
| `icu4x` (WASM)           | Line break, script, normalize | Apache-2 | self-hosted tables              |
| `harfbuzz-wasm`          | Text shaping                | MIT       | icu4x experimental shaper       |
| `opentype.js`            | Font metrics parsing        | MIT       | fontkit-wasm                    |
| `pdf-lib` (v2)           | Direct PDF generation       | MIT       | Chromium printToPDF             |
| `pixelmatch`             | Screenshot diffs            | ISC       | jest-image-snapshot             |
| Hyphenation patterns     | Auto-hyphenate              | LGPL/MIT  | none (disable auto-hyphen)      |

We pin versions and mirror binaries into our build.

---

## 30. Open questions

1. **Knuth-Plass default?** MVP: first-fit matching Word 95. Do we
   expose total-fit in Preferences for power users in v1 or wait v2?
2. **Soft hyphen on non-Latin?** We limit hyphenation to Latin-script
   languages. Arabic kashida (`U+0640`) is an alternative; we implement
   stretch-only in v1, algorithmic kashida insertion in v2.
3. **Re-shape at zoom**: default off; revisit after field data.
4. **Content-visibility reliance**: Electron 32 supports it; do we
   support older? Decision: minimum Electron 32.
5. **Bidi test coverage**: UBA test set is ~600k lines. Do we run the
   full suite or a sampled subset in CI? Proposal: full suite nightly,
   1k-sample on PR.
6. **Line-number for continuous sections**: Word's counting across
   continuous section breaks has ambiguity. We match LibreOffice.

---

## 31. Integration contract with sibling modules

Rendering consumes from:

* **Domain/Model**: `DomainSnapshot`, `Patch` stream, `ResolvedStyle`
  API.
* **DOCX Parser**: already-parsed `DomainSnapshot`; fonts registered;
  images decoded.
* **Platform (Electron)**: `dpr`, `printToPDF`, file access for embedded
  fonts.
* **UI (React)**: `PageHost` component host; toolbar/ribbon inject zoom
  and view mode via commands.

Rendering provides to:

* **Editor core**: `hitTest`, `layoutFor`, `PageLayout` for selection
  mechanics.
* **Commands**: layout-dependent commands (e.g., "Next Page") call
  `engine.getPage`.
* **Accessibility exporter**: walks the layout for alt tree generation.

Cross-module invariants:

* Domain `Patch` semantics do not depend on layout.
* Layout is read-only: it does **not** mutate the domain. Field updates
  that change text (e.g., NUMPAGES) are expressed as "resolved-field
  snapshots" applied only for display/print; the domain retains the
  field instruction.

---

## 32. Appendix A — pseudocode for the commit

```ts
function commitPage(page: PageLayout, container: HTMLElement, zoom: number, dpr: number) {
  const fragment = document.createDocumentFragment();
  const pageEl = document.createElement('section');
  pageEl.setAttribute('role', 'document');
  pageEl.setAttribute('aria-label', `Page ${page.pageIndex + 1}`);
  pageEl.className = 'page';
  pageEl.style.width  = cssPx(page.pageSize.w, zoom, dpr);
  pageEl.style.height = cssPx(page.pageSize.h, zoom, dpr);

  // decorations (SVG below)
  appendSvgLayer(pageEl, page.decorations.below, zoom, dpr);

  for (const frame of page.contentFrames) {
    const frameEl = document.createElement('div');
    frameEl.className = 'content-frame';
    styleAbs(frameEl, frame.x, frame.y, frame.w, frame.h, zoom, dpr);
    for (const placed of frame.placed) {
      if (placed.kind === 'para') appendPara(frameEl, placed, zoom, dpr);
      else if (placed.kind === 'table') appendTable(frameEl, placed, zoom, dpr);
      else if (placed.kind === 'anchor') appendAnchor(frameEl, placed, zoom, dpr);
    }
    pageEl.appendChild(frameEl);
  }

  if (page.header)    pageEl.appendChild(renderBlockStream(page.header, zoom, dpr, 'header'));
  if (page.footer)    pageEl.appendChild(renderBlockStream(page.footer, zoom, dpr, 'footer'));
  if (page.footnotes) pageEl.appendChild(renderBlockStream(page.footnotes, zoom, dpr, 'footnotes'));

  // decorations (SVG above)
  appendSvgLayer(pageEl, page.decorations.above, zoom, dpr);

  fragment.appendChild(pageEl);
  container.replaceChildren(fragment);
}

function appendPara(parent: HTMLElement, p: ParaPlacement, zoom: number, dpr: number) {
  const para = engine.getParaLayout(p.paraId);
  const el = document.createElement('div');
  el.setAttribute('role', 'paragraph');
  if (para.bidiLevel % 2 === 1) el.dir = 'rtl';
  el.setAttribute('aria-label', para.logicalText);
  el.style.position = 'absolute';
  el.style.top = cssPx(p.yOffset, zoom, dpr);
  el.style.left = '0';
  el.style.width = cssPx(para.width, zoom, dpr);
  el.style.height = cssPx(para.height, zoom, dpr);

  for (let i = p.lineRange.start; i < p.lineRange.end; i++) {
    el.appendChild(renderLine(para.lines[i], zoom, dpr));
  }
  parent.appendChild(el);
}
```

---

## 33. Appendix B — Knuth-Plass reference excerpt

Knuth & Plass define:

```
Badness b = 100 * |r|^3   (r = adjustment ratio)
Demerits d = (l + b)^2 + π            (π: penalty)
                                          + α if consecutive hyphenated
                                          + γ if fitness classes differ
```

Fitness classes partition lines into tightness tiers (0=tight, 1=normal,
2=loose, 3=very loose). The DP minimizes total demerits over all
possible break sequences.

Parameters in our default configuration:

* `l` (line penalty base) = 10
* `π` (hyphen penalty) = 50
* `α` (consecutive-hyphen) = 3000
* `γ` (fitness mismatch) = 100
* `widows/orphans` enforced at stage 5, not as K-P penalties

Reference implementation skeleton:

```ts
function kp(items: Item[], widths: (i: number)=>number): Break[] {
  const active: Node[] = [{ line: 0, index: 0, fitness: 1, total: 0 }];
  for (let i = 0; i < items.length; i++) {
    if (items[i].kind !== 'penalty' && !isBreakable(items[i])) continue;
    for (const a of active.slice()) {
      const r = adjustmentRatio(a.index, i, items, widths(a.line+1));
      if (r < -1 || isForbidden(items, a.index, i)) continue;
      const fit = fitnessOf(r);
      const d = demerits(r, items[i], a, fit);
      const total = a.total + d;
      pushCandidate(active, { line: a.line+1, index: i, fitness: fit, total, prev: a });
    }
    if (items[i].kind === 'penalty' && items[i].penalty === -Infinity) {
      // forced break: keep only best active node at this point
      keepBestAt(active, i);
    }
    pruneDominated(active);
  }
  return recoverBreaks(best(active));
}
```

We plan to open-source this module under the project's license.

---

## 34. Appendix C — UAX references used

* UAX #9 — Unicode Bidirectional Algorithm
* UAX #14 — Line Breaking Properties
* UAX #24 — Unicode Script Property
* UAX #29 — Text Segmentation (grapheme, word, sentence)
* UAX #31 — Identifier Syntax (for word boundaries)
* UTS #10 — Unicode Collation Algorithm (sort; indirectly)

All implemented via ICU4X. We don't hand-roll.

---

## 35. Appendix D — Glossary

* **ParaLayout** — result of stages 1+2 for one paragraph.
* **Line** — a visual line within a ParaLayout.
* **LineSegment** — a visually contiguous run of glyph clusters sharing
  a ShapedRun within a line.
* **ShapedRun** — stage-1 result for one shaping segment of a run.
* **Cluster** — grapheme cluster with width and breakability.
* **ContentFrame** — rectangular area on a page into which block content
  flows (one per column).
* **PageLayout** — result of stage 5 for one page.
* **Section** — contiguous range of paragraphs sharing page geometry.
* **Content frame** — drawable area inside margins on a page.
* **Exclusion zone** — rectangle/polygon blocking text flow (a float's
  wrap zone).
* **Dominant font** — the font used to determine line height (see §15.2).
* **Measurement key** — hash key for cluster-width cache.
* **Widow** — last line of a paragraph left alone at top of new page.
* **Orphan** — first line of a paragraph left alone at bottom of page.
* **Kinsoku shori** — Japanese line-breaking restrictions (certain
  punctuation may not start/end a line).

---

## 36. Appendix E — Why not delegate to browser paged media

The CSS `@page` and related rules (`break-before`, `break-after`,
`break-inside`) look tempting. They fail us on:

* Keep-with-next: Chromium supports `break-after: avoid`, but not
  reliably across table rows or when images are involved.
* Widow/orphan: supported for block text but ignored when text contains
  inline floats.
* Footnote anchoring: not supported.
* Repeat-header rows: implemented by Chromium but with glitches on row
  heights that change across pages.
* Cross-column flow: CSS columns don't split a single paragraph across
  columns in a predictable way when balanced columns are active.
* Printer-specific pagination: Chromium sometimes reflows differently
  when it knows the print target's margins (shrink-to-fit).

We'd end up patching around Chromium's behavior enough that we have
already written half of our own engine, plus live with residual
unpredictability. Full custom wins.

---

## 37. Appendix F — Sequence of a single keystroke

```
1. User presses 'a' while caret is in paragraph P, after offset K.
2. Hidden IME surface fires 'beforeinput' with data 'a'.
3. InputAdapter.onBeforeInput:
   - Cancel default.
   - Dispatch command insertText('a').
4. Engine.applyPatch({kind:'runText', paraId:P, runId:R, newText: 'old' + 'a' + rest}):
   - Emits patch.
5. LayoutEngine.applyPatch:
   - Dirty: paraLayouts[P] invalid; later pages possibly.
   - Schedule MeasureTask for runs in P (dirty runs only).
   - Schedule BreakTask for P once measure done.
6. rAF tick fires.
7. Measure completes (Canvas path for Latin; ~0.2 ms for one word).
8. Break completes (first-fit; ~0.3 ms).
9. Pagination:
   - New paraLayout.height compares to old:
     - Equal → main thread swaps ParaLayout, commits DOM patch to the
       one page.
     - Differ → re-paginate from P's page forward until fixed point.
10. DOM commit via replaceChildren of affected page(s).
11. Caret recalculated: new logical position = K+1.
12. IME surface moved to new caret screen pos.
13. Total budget consumed: ~4 ms.
14. rAF yields; frame paints.
```

---

## 38. Appendix G — Opinionated defaults

* Default justification: `first-fit` (Word 95 parity).
* Default hyphenation: `off` at document level (matches Word); style can
  enable.
* Default line rule: `auto` `240` (single).
* Default tab stop: `720` twips (0.5 in).
* Default zoom: `100%`.
* Default view: `Page Layout`.
* Default overscan pages: `2` each side of viewport.
* Default worker count: `hardwareConcurrency - 1`, min `1`, max `8`.
* Default cache sizes: see §22.6.

---

## 39. Closing

This engine is ambitious but tractable. The key insight is **strict
separation of model, layout, and paint**, with layout as the
authoritative middle tier. Every coordinate in the UI — caret position,
selection rect, print box — flows from the same `PageLayout`. Bugs
localize to one stage. Performance optimizations (caching, workers,
virtualization) attach at stage boundaries without leaking complexity
into stage internals.

Reviewers: please read §1 and §10 first (philosophy and incremental),
§5 and §8 next (line break and pagination — the algorithmic core), then
the rest as needed. Questions to `rendering-layout@team`.
