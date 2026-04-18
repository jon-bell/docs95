# DOCX File Format Specification — Word 95 Feature Parity Subset

> Authoritative mapping from Word for Windows 95 (v7.0) features to the
> ECMA-376 Transitional (ISO/IEC 29500-1:2016, 4th Edition) WordprocessingML
> constructs we must read, write, and round-trip. Audience: parser,
> serializer, model, and UI engineers. All XML examples are
> normative-by-example — copy from here when unsure.

---

## 1. Standards and Versions

### 1.1 What we target

- **Primary:** ECMA-376 4th Edition (December 2016), Part 1
  "Fundamentals and Markup Language Reference", Transitional conformance
  class. Equivalent to ISO/IEC 29500-1:2016 Transitional.
- **Supplement:** [MS-DOCX] "Word Extensions to the Office Open XML (.docx)
  File Format" (Microsoft Open Specifications, current revision). Covers
  `w14:`, `w15:`, Microsoft-specific element extensions, and documented
  deviations between Word and the standard.
- **Ancillary references:**
  - [MS-OE376] "Office Implementation Information for ECMA-376 Standards
    Support" — documents Word's interpretation of ambiguous clauses.
  - [MS-DOC] — only for cross-reference when Word 95 binary semantics
    inform DOCX-mapped meaning. We do **not** implement binary .doc.
  - [MS-OFFCRYPTO] — document-encryption (not v1 scope but referenced by
    protection fields we preserve).
  - [MS-OI29500] — documented Office interop deviations.

### 1.2 Why Transitional, not Strict

| Feature                              | Transitional | Strict |
|--------------------------------------|--------------|--------|
| VML (`v:`, `o:` namespaces)          | Allowed      | Banned |
| Legacy compat flags (`w:compat`)     | Rich set     | Reduced |
| `mc:AlternateContent` fallback to VML| Allowed      | Banned |
| Deprecated font scheme attrs         | Allowed      | Banned |
| `w:fldSimple`                        | Allowed      | Banned (must use complex) |

Word 95-era constructs (and Word's own output up through today) rely on VML
for legacy drawings and on complex compat flags. Strict is the wrong
target: it refuses to encode some of the very features we exist to
preserve. We **emit Transitional** and **accept both** on read. When we
read Strict, we normalize to Transitional on write.

### 1.3 ECMA-376 Parts we care about

| Part | Title                                        | Use |
|------|----------------------------------------------|-----|
| 1    | Fundamentals and Markup Language Reference   | Element/attribute semantics |
| 2    | Open Packaging Conventions (OPC)             | ZIP layout, relationships, content types |
| 3    | Markup Compatibility (MCE)                   | `mc:Ignorable`, `mc:AlternateContent` |
| 4    | Transitional Migration Features              | VML and deprecated-but-valid constructs |

Part 2 (OPC) is shared with XLSX/PPTX and is the single source of truth
for package-level concerns (relationships, content types, part naming
rules). Part 3 (MCE) governs forward/backward compatibility wrappers; we
use it when emitting any alternative rendering (e.g. DrawingML +
VML fallback).

### 1.4 [verify] items

- Exact revision date of [MS-DOCX] we pin to — pin to the version retrieved
  at project start and record the SHA in `docs/specs/ms-docx-rev.txt`.
- Whether Word 95 ever emitted `w:compat` flags newer than Word 97's
  default set — we will preserve all flags on read regardless.

---

## 2. Package Structure (OPC)

A DOCX is a ZIP (with deterministic part naming, relationship graph, and
content-type map) per ECMA-376 Part 2. The ZIP has no directory nesting
requirement beyond what part names impose, and part names are
case-insensitive but **we preserve case** on round-trip.

### 2.1 Part inventory (minimum + full set)

| Part path                               | Mandatory? | Content type                                                       | Purpose |
|-----------------------------------------|------------|--------------------------------------------------------------------|---------|
| `[Content_Types].xml`                   | Yes        | n/a (root of package)                                              | Maps file extensions and explicit part paths to content types. |
| `_rels/.rels`                           | Yes        | `application/vnd.openxmlformats-package.relationships+xml`        | Package-level relationships; names the main document part. |
| `word/document.xml`                     | Yes        | `application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml` | Main story: body, paragraphs, tables, sections. |
| `word/_rels/document.xml.rels`          | Yes        | `application/vnd.openxmlformats-package.relationships+xml`        | Document-scoped relationships: styles, numbering, images, hyperlinks, headers, footers, footnotes, endnotes, comments, settings, fontTable, theme, webSettings, glossary, etc. |
| `word/styles.xml`                       | Recommended | `...wordprocessingml.styles+xml`                                   | Style definitions (paragraph, character, table, numbering). |
| `word/settings.xml`                     | Recommended | `...wordprocessingml.settings+xml`                                 | Document-wide settings and `w:compat` flags. |
| `word/fontTable.xml`                    | Recommended | `...wordprocessingml.fontTable+xml`                                | Declared fonts with panose, pitch, family, charset, embedRegular, etc. |
| `word/numbering.xml`                    | If lists   | `...wordprocessingml.numbering+xml`                                | Abstract numbering definitions and concrete list instances. |
| `word/theme/theme1.xml`                 | Recommended | `...theme+xml`                                                     | DrawingML theme (font/color schemes). Required by Word when theme-referenced values appear. |
| `word/webSettings.xml`                  | Optional   | `...wordprocessingml.webSettings+xml`                              | HTML/web export hints; preserved on read. |
| `word/footnotes.xml`                    | If footnotes | `...wordprocessingml.footnotes+xml`                              | Footnote content parts. |
| `word/endnotes.xml`                     | If endnotes | `...wordprocessingml.endnotes+xml`                                 | Endnote content parts. |
| `word/comments.xml`                     | If comments | `...wordprocessingml.comments+xml`                                 | Comment bodies. |
| `word/commentsExtended.xml`             | Optional ([MS-DOCX]) | `...wordprocessingml.commentsExtended+xml`                | Parent/descendant relationships for threaded comments (w15). |
| `word/commentsIds.xml`                  | Optional (w16) | vendor CT                                                      | Durable GUIDs for comments ([verify]: we preserve only). |
| `word/people.xml`                       | Optional ([MS-DOCX]) | `...wordprocessingml.people+xml`                          | Author/reviewer identity records (`w15:person`). |
| `word/header1.xml`, `word/header2.xml`, ... | If headers | `...wordprocessingml.header+xml`                                | One part per distinct header (default/first/even, per section). |
| `word/footer1.xml`, `word/footer2.xml`, ... | If footers | `...wordprocessingml.footer+xml`                                | One part per distinct footer. |
| `word/glossary/document.xml`            | If AutoText | `...wordprocessingml.document.glossary+xml`                      | Glossary document (Building Blocks / AutoText). |
| `word/glossary/_rels/document.xml.rels` | If glossary | relationships CT                                                 | Glossary-scoped relationships. |
| `word/glossary/styles.xml`, `numbering.xml`, `fontTable.xml`, `webSettings.xml` | If glossary | as above | Parallel supporting parts. |
| `word/media/image1.png`, `image2.jpeg`, ... | If images | `image/png`, `image/jpeg`, `image/gif`, `image/x-wmf`, `image/x-emf` | Image binaries. |
| `word/embeddings/oleObject1.bin`, `.xlsx`, ... | If OLE | vendor-specific                                                | OLE and embedded documents. |
| `word/vbaProject.bin`                   | Only `.docm` | `application/vnd.ms-office.vbaProject`                            | VBA binary. Round-trip as opaque; never execute. |
| `customXml/item1.xml`, `itemProps1.xml` | Optional   | `application/xml`, `...customXmlProperties+xml`                     | Attached custom XML parts. |
| `docProps/core.xml`                     | Recommended | `application/vnd.openxmlformats-package.core-properties+xml`     | Dublin-Core-like author/title/subject metadata. |
| `docProps/app.xml`                      | Recommended | `...extended-properties+xml`                                       | Application-extended metadata (page count, company, etc.). |
| `docProps/custom.xml`                   | Optional   | `...custom-properties+xml`                                         | User-defined properties. |

### 2.2 `[Content_Types].xml`

Every ZIP entry must be addressable through this file. Use `<Default>`
for well-known extensions and `<Override>` for specific parts whose type
cannot be inferred from extension.

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"  ContentType="application/xml"/>
  <Default Extension="png"  ContentType="image/png"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Override PartName="/word/document.xml"
            ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml"
            ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml"
            ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/numbering.xml"
            ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/word/fontTable.xml"
            ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>
  <Override PartName="/word/theme/theme1.xml"
            ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/docProps/core.xml"
            ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml"
            ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>
```

**Rules we enforce:**
- Case-insensitive match on `Extension` attribute per Part 2 §10.1.2.2;
  we store the canonical lowercase form.
- An `Override` wins over `Default` for the same part path.
- If any enumerated part is missing its mapping, the package is invalid;
  our reader flags and repairs on write (we add the correct Override).

### 2.3 `_rels/.rels` (package-level)

The package-level relationships file identifies the main document and
common metadata.

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
                Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
                Target="word/document.xml"/>
  <Relationship Id="rId2"
                Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties"
                Target="docProps/core.xml"/>
  <Relationship Id="rId3"
                Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties"
                Target="docProps/app.xml"/>
  <Relationship Id="rId4"
                Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties"
                Target="docProps/custom.xml"/>
</Relationships>
```

**Notes:**
- Relationship IDs are opaque to us outside their containing part but
  **must be unique per part**. We generate `rId{n}` sequentially.
- The `officeDocument` relationship type (not `mainDocument`) is the one
  Word emits; Strict uses `...relationships/officeDocument` as well.
- Targets are part names **relative to the containing rels file's folder**.
  For `_rels/.rels` that is the package root: `word/document.xml`, not
  `/word/document.xml`.

### 2.4 `word/_rels/document.xml.rels`

Document-scoped rels. Every `r:id`/`r:embed`/`r:link` in `document.xml`
resolves here.

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type=".../styles"      Target="styles.xml"/>
  <Relationship Id="rId2" Type=".../settings"    Target="settings.xml"/>
  <Relationship Id="rId3" Type=".../fontTable"   Target="fontTable.xml"/>
  <Relationship Id="rId4" Type=".../webSettings" Target="webSettings.xml"/>
  <Relationship Id="rId5" Type=".../numbering"   Target="numbering.xml"/>
  <Relationship Id="rId6" Type=".../theme"       Target="theme/theme1.xml"/>
  <Relationship Id="rId7" Type=".../footnotes"   Target="footnotes.xml"/>
  <Relationship Id="rId8" Type=".../endnotes"    Target="endnotes.xml"/>
  <Relationship Id="rId9" Type=".../comments"    Target="comments.xml"/>
  <Relationship Id="rId10" Type=".../header"     Target="header1.xml"/>
  <Relationship Id="rId11" Type=".../footer"     Target="footer1.xml"/>
  <Relationship Id="rId12" Type=".../image"      Target="media/image1.png"/>
  <Relationship Id="rId13" Type=".../hyperlink"  Target="https://example.com/" TargetMode="External"/>
  <Relationship Id="rId14" Type=".../glossaryDocument" Target="glossary/document.xml"/>
</Relationships>
```

(Type URIs abbreviated; always use the full
`http://schemas.openxmlformats.org/officeDocument/2006/relationships/<kind>` form.)

**External targets** (hyperlinks, external images, remote data sources)
must set `TargetMode="External"`. We sanitize these (see §15).

### 2.5 Part-name rules (Part 2 §9.1.1.1)

Part names are segmented paths beginning with `/` **when used in OPC
relationship targets absolute form or in `[Content_Types].xml`'s
`PartName`**. Inside a ZIP entry name they have no leading `/`.

- Only ASCII; **no spaces** (percent-encode if unavoidable; Word never
  emits spaces).
- No segment ending in `.`; no `..`; no empty segments.
- Zip-slip: we reject any part whose normalized path escapes the package
  root (see §15).

### 2.6 Relationship graph (required edges)

```
[package root]
  └─ officeDocument ──▶ word/document.xml
     ├─ styles        ──▶ word/styles.xml
     ├─ settings      ──▶ word/settings.xml
     ├─ fontTable     ──▶ word/fontTable.xml
     ├─ numbering     ──▶ word/numbering.xml
     ├─ theme         ──▶ word/theme/theme1.xml
     ├─ webSettings   ──▶ word/webSettings.xml
     ├─ footnotes     ──▶ word/footnotes.xml         (if used)
     ├─ endnotes      ──▶ word/endnotes.xml          (if used)
     ├─ comments      ──▶ word/comments.xml          (if used)
     ├─ header        ──▶ word/header{N}.xml         (per section/kind)
     ├─ footer        ──▶ word/footer{N}.xml         (per section/kind)
     ├─ image         ──▶ word/media/image{N}.{ext}  (per embedded image)
     ├─ hyperlink     ──▶ external URL               (per hyperlink)
     └─ glossaryDocument ─▶ word/glossary/document.xml (if glossary)

  ├─ core-properties    ──▶ docProps/core.xml
  ├─ extended-props     ──▶ docProps/app.xml
  └─ custom-properties  ──▶ docProps/custom.xml      (if present)
```

Missing an expected edge on read = repair; emit a warning.

---

## 3. XML Namespaces

We maintain a single canonical prefix table. Emit declarations on the root
element of each part; never redeclare.

| Prefix | Namespace URI                                                                              | Use |
|--------|---------------------------------------------------------------------------------------------|-----|
| `w`    | `http://schemas.openxmlformats.org/wordprocessingml/2006/main`                              | Core WordprocessingML. |
| `w14`  | `http://schemas.microsoft.com/office/word/2010/wordml`                                      | Word 2010 extensions (text effects, glow, shadow). |
| `w15`  | `http://schemas.microsoft.com/office/word/2012/wordml`                                      | Word 2013 extensions (commentsExtended, people, collab). |
| `w16se`| `http://schemas.microsoft.com/office/word/2015/wordml/symex`                                | Symbol-entity extension (Word 2016). [verify] |
| `w16cid`| `http://schemas.microsoft.com/office/word/2016/wordml/cid`                                 | Comment durable IDs. [verify] |
| `w16`  | `http://schemas.microsoft.com/office/word/2018/wordml`                                      | Newer Word. Preserve on read. |
| `m`    | `http://schemas.openxmlformats.org/officeDocument/2006/math`                                | OMML (Office Math Markup). |
| `r`    | `http://schemas.openxmlformats.org/officeDocument/2006/relationships`                       | Relationship-ID attributes (`r:id`, `r:embed`, `r:link`). |
| `wp`   | `http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing`                    | WordprocessingML drawing anchors/inline. |
| `wp14` | `http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing`                       | Word 2010 positioning extensions. |
| `a`    | `http://schemas.openxmlformats.org/drawingml/2006/main`                                     | DrawingML shared. |
| `pic`  | `http://schemas.openxmlformats.org/drawingml/2006/picture`                                  | DrawingML picture (used inside `a:graphicData` for images). |
| `v`    | `urn:schemas-microsoft-com:vml`                                                              | VML (legacy vector markup). |
| `o`    | `urn:schemas-microsoft-com:office:office`                                                    | Office-shared VML extensions. |
| `w10`  | `urn:schemas-microsoft-com:office:word`                                                      | Word-specific VML extensions. |
| `mc`   | `http://schemas.openxmlformats.org/markup-compatibility/2006`                                | Markup Compatibility. |
| `mo`   | `http://schemas.microsoft.com/office/mac/office/2008/main`                                   | Mac Office extensions. [verify] |
| `sl`   | `http://schemas.openxmlformats.org/schemaLibrary/2006/main`                                  | Schema-library references (custom XML). |
| `xml`  | `http://www.w3.org/XML/1998/namespace`                                                       | Built-in (`xml:space`, `xml:lang`). |

**Important relationship URI:** in OPC rels files, the `r` prefix we use
inside `document.xml` is **not** used in rels files themselves;
relationships files use the package namespace
`http://schemas.openxmlformats.org/package/2006/relationships` on the root.

### 3.1 `mc:AlternateContent` usage

Markup Compatibility (ECMA-376 Part 3) lets authors ship preferred markup
with fallbacks that older consumers understand.

```xml
<mc:AlternateContent>
  <mc:Choice Requires="w14">
    <w:r>
      <w:rPr>
        <w14:glow w14:rad="63500">
          <w14:schemeClr w14:val="accent1"/>
        </w14:glow>
      </w:rPr>
      <w:t>Glowing text</w:t>
    </w:r>
  </mc:Choice>
  <mc:Fallback>
    <w:r><w:t>Glowing text</w:t></w:r>
  </mc:Fallback>
</mc:AlternateContent>
```

Our reader **always** prefers `Choice` branches whose `Requires` we can
satisfy, otherwise the `Fallback`. On write, we do not emit `mc:*`
wrappers in v1 (no proprietary extensions) but must **round-trip**
wrappers present in imported docs.

Root-level `mc:Ignorable="w14 w15"` on `w:document` (and other part roots)
tells consumers which prefixes to ignore if unknown. We always emit it
for every prefix we use beyond `w`.

---

## 4. Units and Measurement

Getting units right is the difference between "looks like Word" and
"looks nothing like Word." The spec mixes several unit systems.

### 4.1 Unit inventory

| Unit           | Definition                         | Typical use                                                          |
|----------------|-------------------------------------|----------------------------------------------------------------------|
| **twip**       | 1/1440 inch = 1/20 point            | Most `w:` length values: margins, indents, spacing, tab stops, page size, cell width (when `type="dxa"`). |
| **half-point** | 0.5 point                           | Font size (`w:sz`, `w:szCs`). `val="24"` = 12pt. Also border widths in some places. |
| **eighth-point** | 0.125 point                       | Paragraph/table/cell border widths (`w:sz` on `w:pBdr`/`w:tblBorders`). |
| **EMU**        | 1/914400 inch = 1/360000 cm = 1/12700 pt | All DrawingML positions, offsets, extents (`wp:extent`, `a:off`, `a:ext`). |
| **pct (fifths)** | Fiftieth-of-a-percent            | Widths when `type="pct"`. `val="5000"` = 100%. |
| **percent**    | Whole percent                       | Some newer attributes (e.g. `w:val="50%"` on measurements in post-2010 extensions). |
| **EMU-angle / 60000ths of a degree** | 1/60000°       | Rotations in DrawingML (`a:off` and `rot`). |
| **points**     | 1/72 inch                           | Rare in raw XML; used in UI rendering. |
| **pixels (Web)** | CSS px (96 DPI)                  | Web-only parts (`webSettings.xml`). |
| **chars**      | Character widths                    | Asian layout: `w:docGrid@w:charSpace`. |
| **lines**      | Default line height                 | Line spacing with `w:lineRule="atLeast"` or `"exact"` in twips, or `"auto"` where val is 240ths of a line. |

### 4.2 Conversion table

All values are inches unless noted.

| From              | Multiply by | To             |
|-------------------|-------------|----------------|
| inches            | 1440        | twips          |
| cm                | 567         | twips          |
| mm                | 56.6929...  | twips          |
| points            | 20          | twips          |
| twips             | 1/1440      | inches         |
| twips             | 1/20        | points         |
| inches            | 914400      | EMU            |
| cm                | 360000      | EMU            |
| points            | 12700       | EMU            |
| EMU               | 1/914400    | inches         |
| EMU               | 1/12700     | points         |
| pixels (96 DPI)   | 9525        | EMU            |
| percent           | 50          | fifths-of-percent |
| fifths-of-percent | 1/50        | percent        |

### 4.3 Representative attribute/value types

| Attribute              | Type              | Example                          |
|------------------------|-------------------|----------------------------------|
| `w:sz` (font)          | half-points (int) | `<w:sz w:val="24"/>` → 12pt      |
| `w:spacing@w:before`   | twips (int)       | `w:before="120"` → 6pt           |
| `w:spacing@w:line`     | lineRule-dependent | `w:line="240" w:lineRule="auto"` → single |
| `w:ind@w:left`         | twips (signed)    | `w:left="720"` → 0.5"            |
| `w:ind@w:firstLine`    | twips (>=0)       | `w:firstLine="360"` → 0.25"      |
| `w:ind@w:hanging`      | twips (>=0)       | `w:hanging="360"` → 0.25" hang   |
| `w:pgSz@w:w / w:h`     | twips             | Letter = `w="12240" h="15840"`   |
| `w:pgMar@w:top etc.`   | twips             | 1" = `top="1440"`                |
| `w:tblW@w:w`           | depends on `type` | `type="dxa"` → twips; `"pct"` → fifths-of-percent |
| `w:pBdr/w:top@w:sz`    | eighth-points     | `w:sz="8"` → 1pt                 |
| `wp:extent@cx / cy`    | EMU               | 1" = `cx="914400"`               |

### 4.4 Rounding rules

- When converting UI points → twips, round half-even. Do not truncate.
- When converting pixels → EMU, use integer multiplication by 9525; do
  not introduce floats.
- When reading, do not re-round; retain the exact integer from the XML.
  Only apply unit conversions at UI-presentation time.

---

## 5. Feature-by-feature mapping: Word 95 → OOXML

### 5.1 Text run properties (`w:rPr`)

A run (`w:r`) groups text with identical formatting. Properties are in a
child `w:rPr`. Order inside `w:rPr` is schema-fixed by ECMA-376 CT_RPr.

```xml
<w:r>
  <w:rPr>
    <w:rStyle w:val="Emphasis"/>
    <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"
              w:cs="Times New Roman" w:eastAsia="SimSun"/>
    <w:b/>
    <w:i/>
    <w:strike/>
    <w:dstrike/>
    <w:outline/>
    <w:shadow/>
    <w:emboss/>
    <w:imprint/>
    <w:caps/>
    <w:smallCaps/>
    <w:vanish/>
    <w:color w:val="FF0000"/>
    <w:spacing w:val="20"/>
    <w:kern w:val="28"/>
    <w:position w:val="-6"/>
    <w:sz w:val="24"/>
    <w:szCs w:val="24"/>
    <w:highlight w:val="yellow"/>
    <w:u w:val="single" w:color="auto"/>
    <w:effect w:val="blinkBackground"/>
    <w:vertAlign w:val="superscript"/>
    <w:em w:val="dot"/>
    <w:lang w:val="en-US" w:eastAsia="zh-CN" w:bidi="ar-SA"/>
  </w:rPr>
  <w:t xml:space="preserve">Hello, world </w:t>
</w:r>
```

**Word 95 feature coverage:**

| Word 95 UI                 | OOXML element      | Notes |
|----------------------------|--------------------|-------|
| Font name                  | `w:rFonts`         | Four slots: `ascii`, `hAnsi` (high-ANSI), `cs` (complex scripts), `eastAsia`. Word 95 Latin-only docs populate `ascii` and often `hAnsi` only. |
| Font size                  | `w:sz` (half-pt)   | `w:szCs` for complex-script size. |
| Bold                       | `w:b`              | Absent = off; `w:b/` = on; `<w:b w:val="false"/>` = explicit off (used in toggle overrides). |
| Italic                     | `w:i`              | |
| Underline                  | `w:u @w:val`       | Values: `single`, `double`, `thick`, `dotted`, `dash`, `dotDash`, `wave`, `words`, `none`, etc. Word 95 had single, double, words-only. |
| Strikethrough              | `w:strike`         | Single-strike. |
| Double strikethrough       | `w:dstrike`        | Word 97+; Word 95 lacked but we write. |
| Superscript / subscript    | `w:vertAlign`      | `superscript` / `subscript` / `baseline`. |
| Color                      | `w:color @w:val`   | `RRGGBB` hex or `auto`. Word 95 had 16 palette colors; we accept any. |
| Highlight                  | `w:highlight`      | 16 fixed names: `yellow`, `green`, `cyan`, `magenta`, `blue`, `red`, `darkBlue`, etc. |
| Hidden                     | `w:vanish`         | Omit from layout (not print) unless setting override. |
| All caps                   | `w:caps`           | |
| Small caps                 | `w:smallCaps`      | |
| Character spacing (expand/condense) | `w:spacing @w:val` | Twips; signed. |
| Kerning above N pt         | `w:kern @w:val`    | Half-points; 0 disables. |
| Position (raised/lowered)  | `w:position @w:val`| Half-points signed. |
| Effects: blink, outline, emboss, shadow, imprint | `w:effect`, `w:outline`, `w:emboss`, `w:shadow`, `w:imprint` | `w:effect` enumerates `blinkBackground`, `lights`, `antsBlack`, `antsRed`, `shimmer`, `sparkle`. |
| Emphasis marks (Asian)     | `w:em`             | Word 95 lacked; round-trip only. |
| Language                   | `w:lang`           | Three slots: Latin, east Asian, bidi. |
| Run style                  | `w:rStyle`         | References style by styleId. Note §5.3. |

#### 5.1.1 Toggle properties (`w:b`, `w:i`, `w:caps`, `w:smallCaps`,
`w:strike`, `w:dstrike`, `w:vanish`, `w:emboss`, `w:imprint`, `w:outline`,
`w:shadow`)

Toggle properties XOR up the style chain. A paragraph with character
style bold, paragraph style bold, and direct `<w:b w:val="false"/>` ends
up bold (two inversions from base). Our runtime resolves this
deterministically:

```
effective = base XOR paraStyle XOR charStyle XOR direct
```

with missing levels contributing 0. Tests live under
`src/model/__tests__/rpr-toggle.test.ts` (see §9).

### 5.2 Paragraph properties (`w:pPr`)

```xml
<w:p>
  <w:pPr>
    <w:pStyle w:val="Heading1"/>
    <w:keepNext/>
    <w:keepLines/>
    <w:pageBreakBefore/>
    <w:widowControl w:val="true"/>
    <w:numPr>
      <w:ilvl w:val="0"/>
      <w:numId w:val="2"/>
    </w:numPr>
    <w:suppressLineNumbers/>
    <w:suppressAutoHyphens/>
    <w:pBdr>
      <w:top w:val="single" w:sz="4" w:space="1" w:color="auto"/>
    </w:pBdr>
    <w:shd w:val="clear" w:color="auto" w:fill="FFFF00"/>
    <w:tabs>
      <w:tab w:val="left"   w:pos="720"/>
      <w:tab w:val="center" w:pos="4680"/>
      <w:tab w:val="right"  w:pos="9360"  w:leader="dot"/>
    </w:tabs>
    <w:spacing w:before="240" w:after="120" w:line="360" w:lineRule="auto"/>
    <w:ind w:left="720" w:right="360" w:firstLine="360"/>
    <w:jc w:val="both"/>
    <w:textAlignment w:val="baseline"/>
    <w:outlineLvl w:val="0"/>
    <w:rPr><!-- mark (pilcrow) run properties --></w:rPr>
  </w:pPr>
  <w:r><w:t>Paragraph text</w:t></w:r>
</w:p>
```

**Word 95 feature coverage:**

| Word 95 UI                          | OOXML element            |
|-------------------------------------|--------------------------|
| Paragraph style                     | `w:pStyle`               |
| Alignment (left/right/center/justify) | `w:jc @w:val` (`left`, `center`, `right`, `both`, `distribute` not in 95, preserve only) |
| Left/right/first-line/hanging indent | `w:ind`                 |
| Space before/after                  | `w:spacing @w:before/@w:after` |
| Line spacing (single/1.5/double/at-least/exactly/multiple) | `w:spacing @w:line + @w:lineRule` (`auto` with 240/360/480; `atLeast`; `exact`) |
| Keep with next                      | `w:keepNext`             |
| Keep lines together                 | `w:keepLines`            |
| Page break before                   | `w:pageBreakBefore`      |
| Widow/orphan control                | `w:widowControl`         |
| Suppress line numbers               | `w:suppressLineNumbers`  |
| Suppress auto-hyphenation           | `w:suppressAutoHyphens`  |
| Borders (box, top, bottom, left, right, between, bar) | `w:pBdr`    |
| Shading                             | `w:shd`                  |
| Tabs (left/center/right/decimal/bar + leaders) | `w:tabs/w:tab`  |
| Bullets/numbering                   | `w:numPr`                |
| Outline level                       | `w:outlineLvl`           |
| Frame (Word 95 "Frame…" dialog)     | `w:framePr` (see §5.20)  |

#### 5.2.1 `w:spacing` permutations

| Word 95 choice         | XML                                                                 |
|------------------------|----------------------------------------------------------------------|
| Single                 | `<w:spacing w:line="240" w:lineRule="auto"/>`                       |
| 1.5 lines              | `<w:spacing w:line="360" w:lineRule="auto"/>`                       |
| Double                 | `<w:spacing w:line="480" w:lineRule="auto"/>`                       |
| At least N pt          | `<w:spacing w:line="{twips}" w:lineRule="atLeast"/>`                 |
| Exactly N pt           | `<w:spacing w:line="{twips}" w:lineRule="exact"/>`                   |
| Multiple (N lines)     | `<w:spacing w:line="{N*240}" w:lineRule="auto"/>`                    |

### 5.3 Styles (`word/styles.xml`)

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>
        <w:sz w:val="24"/>
        <w:szCs w:val="24"/>
        <w:lang w:val="en-US"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>
    </w:pPrDefault>
  </w:docDefaults>

  <w:latentStyles w:defLockedState="0" w:defUIPriority="99"
                  w:defSemiHidden="1" w:defUnhideWhenUsed="1"
                  w:defQFormat="0" w:count="267">
    <w:lsdException w:name="Normal" w:semiHidden="0" w:uiPriority="0"
                    w:unhideWhenUsed="0" w:qFormat="1"/>
    <w:lsdException w:name="heading 1" w:semiHidden="0" w:uiPriority="9"
                    w:unhideWhenUsed="0" w:qFormat="1"/>
    <!-- ...headings 2-9, etc... -->
  </w:latentStyles>

  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:link w:val="Heading1Char"/>
    <w:uiPriority w:val="9"/>
    <w:qFormat/>
    <w:pPr>
      <w:keepNext/>
      <w:spacing w:before="480" w:after="0"/>
      <w:outlineLvl w:val="0"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
      <w:b/>
      <w:kern w:val="32"/>
      <w:sz w:val="32"/>
    </w:rPr>
  </w:style>
  <w:style w:type="character" w:styleId="Heading1Char" w:customStyle="1">
    <w:name w:val="Heading 1 Char"/>
    <w:basedOn w:val="DefaultParagraphFont"/>
    <w:link w:val="Heading1"/>
    <w:rPr>
      <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
      <w:b/>
      <w:kern w:val="32"/>
      <w:sz w:val="32"/>
    </w:rPr>
  </w:style>
  <w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont">
    <w:name w:val="Default Paragraph Font"/>
    <w:uiPriority w:val="1"/>
    <w:semiHidden/>
    <w:unhideWhenUsed/>
  </w:style>
  <w:style w:type="table" w:default="1" w:styleId="TableNormal">
    <w:name w:val="Normal Table"/>
    <w:uiPriority w:val="99"/>
    <w:semiHidden/>
    <w:unhideWhenUsed/>
    <w:tblPr>
      <w:tblInd w:w="0" w:type="dxa"/>
      <w:tblCellMar>
        <w:top w:w="0" w:type="dxa"/>
        <w:left w:w="108" w:type="dxa"/>
        <w:bottom w:w="0" w:type="dxa"/>
        <w:right w:w="108" w:type="dxa"/>
      </w:tblCellMar>
    </w:tblPr>
  </w:style>
</w:styles>
```

**Style types:** `paragraph`, `character`, `table`, `numbering`.

**Attributes:**
- `@w:styleId` — opaque identifier (unique per part). Cross-referenced
  from `w:pStyle`, `w:rStyle`, `w:tblStyle`, `w:numStyleLink`.
- `@w:type` — one of the four above.
- `@w:default="1"` — marks the default style for its type. Exactly one
  per type in a well-formed `styles.xml`.
- `@w:customStyle="1"` — true when the style is user-created (distinct
  from built-in latent styles).
- `w:name` — the display name; localized names map to canonical English
  names in Word's UI.

**Inheritance/relationships:**
- `w:basedOn @w:val` — parent style. DAG, no cycles (we detect and break).
- `w:next @w:val` — style to apply to the following paragraph after Enter.
- `w:link @w:val` — companion character ↔ paragraph style link; Word uses
  this to support selecting part of a styled paragraph and applying the
  paragraph style to just that selection.
- `w:autoRedefine` — automatic style redefinition from direct formatting.
- `w:qFormat` — "Quick Format" (shown in gallery).
- `w:hidden`, `w:semiHidden`, `w:unhideWhenUsed` — UI visibility.
- `w:locked` — users can't modify.
- `w:personal`, `w:personalCompose`, `w:personalReply` — email-specific.
- `w:uiPriority` — sort order in the UI gallery.

**Latent styles (`w:latentStyles`):** declares properties for styles not
actually emitted in this document but that Word will materialize from
its built-in library on demand. Round-trip faithfully.

**Word 95 note.** Word 95 had paragraph and character-style slots
architecturally but exposed only paragraph styles in the UI. We emit
character styles because our UI supports them; we never **require** them
when reading. When reading a Word 95 DOCX (produced from old binary via
a converter), absence of character styles is normal.

### 5.4 Numbering (`word/numbering.xml`)

Numbering has two layers: `w:abstractNum` (definitions, shared template)
and `w:num` (concrete list instance, with optional level overrides).

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:multiLevelType w:val="hybridMultilevel"/>
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1."/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
      <w:rPr><w:rFonts w:hint="default"/></w:rPr>
    </w:lvl>
    <w:lvl w:ilvl="1">
      <w:start w:val="1"/>
      <w:numFmt w:val="lowerLetter"/>
      <w:lvlText w:val="%2)"/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="1440" w:hanging="360"/></w:pPr>
    </w:lvl>
    <!-- up to ilvl 8 -->
  </w:abstractNum>

  <w:abstractNum w:abstractNumId="1">
    <w:multiLevelType w:val="singleLevel"/>
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="&#61623;"/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
      <w:rPr>
        <w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/>
      </w:rPr>
    </w:lvl>
  </w:abstractNum>

  <w:num w:numId="1">
    <w:abstractNumId w:val="0"/>
    <w:lvlOverride w:ilvl="0">
      <w:startOverride w:val="5"/>
    </w:lvlOverride>
  </w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>
```

**Key attributes on `w:lvl`:**

| Attribute          | Values                                                                                         |
|--------------------|-------------------------------------------------------------------------------------------------|
| `w:ilvl`           | 0-8                                                                                             |
| `w:tplc`           | Template code (hex). Word uses to match gallery definitions.                                    |
| `w:tentative`      | "Tentative" level.                                                                              |
| `w:start`          | First value.                                                                                    |
| `w:numFmt`         | `decimal`, `upperRoman`, `lowerRoman`, `upperLetter`, `lowerLetter`, `bullet`, `ordinalText`, `cardinalText`, `decimalZero`, `none`, `chicago`, many Asian variants... |
| `w:lvlText`        | `%1`, `%2` substituted by current value at each level. E.g. `%1.%2` for "2.3". Can contain literal chars. |
| `w:lvlJc`          | `left`, `center`, `right`, `start`, `end`                                                       |
| `w:suff`           | `tab`, `space`, `nothing` — separator after number                                              |
| `w:isLgl`          | Legal numbering (convert upper levels to arabic)                                                |
| `w:lvlRestart`     | `N` → restart at level `N`                                                                       |
| `w:pStyle`         | Link level to paragraph style                                                                    |

**`w:num` / `w:lvlOverride`:**
- A document referencing `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>` resolves to `w:num@w:numId=1`, then to `w:abstractNum` via `w:abstractNumId`, then to `w:lvl@w:ilvl=0` inside that abstractNum.
- `w:lvlOverride` can override or restart at a given level for one concrete list.

**`w:multiLevelType`:** `singleLevel`, `multilevel`, `hybridMultilevel` (what Word emits for galleries).

**Word 95 bullets/numbering note.** Word 95 supported up to 9 levels.
Most migrated content is `decimal` or `bullet` with simple `hanging`
indent. We always emit all 9 levels in a definition even if unused; some
consumers require this.

### 5.5 Tables (`w:tbl`)

```xml
<w:tbl>
  <w:tblPr>
    <w:tblStyle w:val="TableGrid"/>
    <w:tblW w:w="5000" w:type="pct"/>
    <w:tblInd w:w="0" w:type="dxa"/>
    <w:tblLayout w:type="fixed"/>
    <w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0"
               w:firstColumn="1" w:lastColumn="0"
               w:noHBand="0" w:noVBand="1"/>
    <w:tblBorders>
      <w:top     w:val="single" w:sz="4" w:color="auto"/>
      <w:left    w:val="single" w:sz="4" w:color="auto"/>
      <w:bottom  w:val="single" w:sz="4" w:color="auto"/>
      <w:right   w:val="single" w:sz="4" w:color="auto"/>
      <w:insideH w:val="single" w:sz="4" w:color="auto"/>
      <w:insideV w:val="single" w:sz="4" w:color="auto"/>
    </w:tblBorders>
    <w:tblCellMar>
      <w:top w:w="0" w:type="dxa"/>
      <w:left w:w="108" w:type="dxa"/>
      <w:bottom w:w="0" w:type="dxa"/>
      <w:right w:w="108" w:type="dxa"/>
    </w:tblCellMar>
  </w:tblPr>
  <w:tblGrid>
    <w:gridCol w:w="3120"/>
    <w:gridCol w:w="3120"/>
    <w:gridCol w:w="3120"/>
  </w:tblGrid>
  <w:tr>
    <w:trPr>
      <w:trHeight w:val="500" w:hRule="atLeast"/>
      <w:tblHeader/>
      <w:cantSplit/>
    </w:trPr>
    <w:tc>
      <w:tcPr>
        <w:tcW w:w="3120" w:type="dxa"/>
        <w:gridSpan w:val="2"/>
        <w:vMerge w:val="restart"/>
        <w:tcBorders>
          <w:top w:val="single" w:sz="4" w:color="auto"/>
        </w:tcBorders>
        <w:shd w:val="clear" w:color="auto" w:fill="DDDDDD"/>
        <w:vAlign w:val="center"/>
        <w:noWrap/>
        <w:hideMark/>
      </w:tcPr>
      <w:p><w:r><w:t>Merged header</w:t></w:r></w:p>
    </w:tc>
    <w:tc>
      <w:tcPr><w:tcW w:w="3120" w:type="dxa"/></w:tcPr>
      <w:p/>
    </w:tc>
  </w:tr>
</w:tbl>
```

**`w:tblPr` children (selected):**

| Element        | Purpose |
|----------------|---------|
| `w:tblStyle`   | Style reference. |
| `w:tblW`       | Preferred width. `@w:type`: `auto`, `dxa`, `pct`, `nil`. |
| `w:jc`         | Table alignment on page (left/center/right). |
| `w:tblInd`     | Left indent of the table. |
| `w:tblBorders` | Table-level borders. Children: `top`, `left`, `bottom`, `right`, `insideH`, `insideV`. |
| `w:shd`        | Table-level shading (rarely used). |
| `w:tblLayout`  | `@w:type="fixed"` or `"autofit"`. Word 95 = autofit by default. |
| `w:tblCellMar` | Default cell margins (`top`, `left`, `bottom`, `right`). |
| `w:tblLook`    | Conditional-formatting mask for table style parts (hdrRow/totalRow/firstCol/lastCol/banding). |
| `w:tblOverlap` | `"never"` for absolutely positioned tables; keep apart. |
| `w:tblpPr`     | Floating table position (Word 95 had floating tables via frames; Word 2000+ via `w:tblpPr`). |

**`w:trPr`:** `w:trHeight` (`val` twips, `hRule` = `auto`/`atLeast`/`exact`),
`w:tblHeader` (repeat on each page), `w:cantSplit`, `w:jc` (row-level
alignment), `w:hidden`, `w:gridBefore`/`w:gridAfter`/`w:wBefore`/`w:wAfter`
(leading/trailing skipped grid columns).

**`w:tcPr`:** `w:tcW`, `w:gridSpan`, `w:vMerge` (`restart` or omitted
means continue), `w:tcBorders`, `w:shd`, `w:vAlign`, `w:textDirection`,
`w:noWrap`, `w:tcMar`, `w:hideMark`, `w:tcFitText`.

**Grid invariant.** Sum of `w:gridCol@w:w` must equal the table's
content area. Sum of (cell `w:tcW` + gridSpan allowances) per row must
align to grid boundaries. Our writer emits a consistent grid from the
model; our reader tolerates off-by-one (per Word's behavior).

### 5.6 Sections (`w:sectPr`)

A section groups page-layout properties. Every document body ends with
one `w:sectPr` (the "final" section). Additional sections are introduced
by placing `<w:sectPr>` inside a `w:pPr` at the end of a paragraph:

```xml
<w:p>
  <w:pPr>
    <w:sectPr>
      <w:type w:val="nextPage"/>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800"
               w:header="720" w:footer="720" w:gutter="0"/>
      <w:cols w:space="720"/>
      <w:docGrid w:linePitch="360"/>
      <w:pgNumType w:fmt="decimal" w:start="1"/>
      <w:lnNumType w:countBy="0" w:distance="0" w:restart="newSection"/>
      <w:titlePg/>
      <w:vAlign w:val="top"/>
      <w:headerReference w:type="default" r:id="rId10"/>
      <w:footerReference w:type="default" r:id="rId11"/>
    </w:sectPr>
  </w:pPr>
</w:p>

<!-- following paragraphs belong to the NEW section -->
<w:p>...</w:p>

<!-- terminal section lives at body level -->
<w:sectPr>
  <w:type w:val="continuous"/>
  <w:pgSz w:w="12240" w:h="15840"/>
  <w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800"
           w:header="720" w:footer="720" w:gutter="0"/>
  <w:cols w:num="2" w:space="720" w:equalWidth="0">
    <w:col w:w="4680" w:space="480"/>
    <w:col w:w="4680"/>
  </w:cols>
  <w:docGrid w:linePitch="360"/>
</w:sectPr>
```

**`w:type@w:val`:** `continuous`, `nextPage`, `nextColumn`, `oddPage`, `evenPage`.

**`w:cols`:** `@w:num` (count), `@w:sep` (vertical line), `@w:space`
(gap), `@w:equalWidth` (0 = explicit `w:col` widths). Word 95 had up to
9 columns.

**`w:pgNumType`:** `@w:fmt` = `decimal`, `upperRoman`, `lowerRoman`,
`upperLetter`, `lowerLetter`. `@w:start` starts numbering at value.
`@w:chapStyle`, `@w:chapSep` attach chapter numbers.

**`w:lnNumType`:** `@w:countBy`, `@w:start`, `@w:distance` (twips),
`@w:restart` (`newPage`, `newSection`, `continuous`).

**Header/footer references:** `@w:type` = `default`, `first`, `even`.
Word 95 had odd/even (Different Odd and Even Pages) and different first
page. Section has up to 6 references (default+first+even × header+footer).

**`w:vAlign`** for page vertical alignment: `top`, `center`, `bottom`,
`both` (justify).

**`w:docGrid`:** East-Asian grid: `@w:type`, `@w:linePitch`, `@w:charSpace`.

### 5.7 Headers/footers

Each header/footer lives in its own part. The root element is `w:hdr` or
`w:ftr`; contents are the same as `w:body`: paragraphs, tables, fields.

```xml
<!-- word/header1.xml -->
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr><w:pStyle w:val="Header"/></w:pPr>
    <w:r><w:t xml:space="preserve">Chapter </w:t></w:r>
    <w:fldSimple w:instr="PAGE">
      <w:r><w:t>1</w:t></w:r>
    </w:fldSimple>
  </w:p>
</w:hdr>
```

**Headers/footers are referenced per section** (`w:headerReference`,
`w:footerReference`) by `@w:type` and `r:id`. Multiple sections may share
a single header part (same `r:id`). Our writer generates unique part
files when a later section edits a previously shared header; we don't
try to keep shared references optimized.

### 5.8 Footnotes / endnotes

Two separate parts: `word/footnotes.xml`, `word/endnotes.xml`. Each part
contains `w:footnote` / `w:endnote` elements, each with a unique `@w:id`.

```xml
<!-- word/footnotes.xml -->
<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:footnote w:type="separator" w:id="-1">
    <w:p><w:r><w:separator/></w:r></w:p>
  </w:footnote>
  <w:footnote w:type="continuationSeparator" w:id="0">
    <w:p><w:r><w:continuationSeparator/></w:r></w:p>
  </w:footnote>
  <w:footnote w:id="1">
    <w:p>
      <w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr>
      <w:r>
        <w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr>
        <w:footnoteRef/>
      </w:r>
      <w:r><w:t xml:space="preserve"> This is a footnote.</w:t></w:r>
    </w:p>
  </w:footnote>
</w:footnotes>
```

```xml
<!-- inline reference inside document.xml -->
<w:r>
  <w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr>
  <w:footnoteReference w:id="1"/>
</w:r>
```

**Settings** in `settings.xml`:
```xml
<w:footnotePr>
  <w:pos w:val="pageBottom"/>
  <w:numFmt w:val="decimal"/>
  <w:numStart w:val="1"/>
  <w:numRestart w:val="continuous"/>
  <w:footnote w:id="-1"/>
  <w:footnote w:id="0"/>
</w:footnotePr>
<w:endnotePr>
  <w:pos w:val="sectEnd"/>
  <w:numFmt w:val="lowerRoman"/>
  <w:numStart w:val="1"/>
  <w:numRestart w:val="continuous"/>
  <w:endnote w:id="-1"/>
  <w:endnote w:id="0"/>
</w:endnotePr>
```

Word 95 supported both; we preserve the same four separator entries.

### 5.9 Comments (Word 95 "Annotations")

Word 95 "Annotations" became "Comments" in Word 97 XML.

```xml
<!-- word/comments.xml -->
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:comment w:id="0" w:author="Jon Bell" w:date="2026-04-17T12:34:56Z" w:initials="JB">
    <w:p>
      <w:pPr><w:pStyle w:val="CommentText"/></w:pPr>
      <w:r>
        <w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>
        <w:annotationRef/>
      </w:r>
      <w:r><w:t xml:space="preserve"> Please revise this sentence.</w:t></w:r>
    </w:p>
  </w:comment>
</w:comments>
```

```xml
<!-- inline in document.xml -->
<w:commentRangeStart w:id="0"/>
<w:r><w:t>This sentence has a comment.</w:t></w:r>
<w:commentRangeEnd w:id="0"/>
<w:r>
  <w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>
  <w:commentReference w:id="0"/>
</w:r>
```

**Threaded comments (w15 `commentsExtended.xml`):**
```xml
<w15:commentsEx xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml">
  <w15:commentEx w15:paraId="00000001" w15:done="0"/>
  <w15:commentEx w15:paraId="00000002" w15:paraIdParent="00000001" w15:done="1"/>
</w15:commentsEx>
```

Word 95 didn't support threading; we preserve on round-trip from newer
files and always emit top-level `w:comment` for our own output.

### 5.10 Fields

Two forms.

**Simple field** (entire instruction in one element):
```xml
<w:p>
  <w:r><w:t xml:space="preserve">Page </w:t></w:r>
  <w:fldSimple w:instr="PAGE \* MERGEFORMAT">
    <w:r><w:t>3</w:t></w:r>
  </w:fldSimple>
  <w:r><w:t xml:space="preserve"> of </w:t></w:r>
  <w:fldSimple w:instr="NUMPAGES \* MERGEFORMAT">
    <w:r><w:t>10</w:t></w:r>
  </w:fldSimple>
</w:p>
```

**Complex field** (supports nesting and runs inside instruction):
```xml
<w:r><w:fldChar w:fldCharType="begin"/></w:r>
<w:r><w:instrText xml:space="preserve">REF Bookmark1 \h \* MERGEFORMAT</w:instrText></w:r>
<w:r><w:fldChar w:fldCharType="separate"/></w:r>
<w:r><w:t>The referenced text</w:t></w:r>
<w:r><w:fldChar w:fldCharType="end"/></w:r>
```

**Word 95 fields we must implement (common list, not exhaustive):**

| Field code | Purpose | Notes |
|------------|---------|-------|
| `PAGE`     | Current page number | |
| `NUMPAGES` | Total pages | |
| `DATE`     | Today's date | `\@ "format"` |
| `TIME`     | Current time | |
| `CREATEDATE`, `SAVEDATE`, `PRINTDATE` | Metadata dates | |
| `AUTHOR`, `TITLE`, `SUBJECT`, `KEYWORDS` | Metadata | |
| `FILENAME` | File name | `\p` full path |
| `FILESIZE` | Kilobytes | |
| `TOC`      | Table of contents | `\o "1-9" \h \z \u` |
| `TOA`      | Table of authorities | |
| `TOF`      | Table of figures | |
| `INDEX`    | Index | |
| `XE`       | Index entry | |
| `TC`       | TOC entry | |
| `SEQ`      | Sequence / caption | |
| `REF`      | Cross-reference | |
| `PAGEREF`  | Cross-reference to page | |
| `STYLEREF` | Nearest paragraph of style | |
| `HYPERLINK`| Hyperlink field | Legacy form; modern uses `w:hyperlink`. |
| `MERGEFIELD`, `IF`, `NEXT`, `ASK`, `FILLIN`, `DATABASE` | Mail merge | |
| `DOCPROPERTY` | Core/extended property | |
| `FORMTEXT`, `FORMCHECKBOX`, `FORMDROPDOWN` | Form fields with `w:ffData` | |
| `EQ`       | Equation Editor 1.x inline | **Opaque** in v1. |
| `SYMBOL`   | Unicode symbol | |
| `PRIVATE`  | Private data holder (WP-era) | Preserve. |
| `LISTNUM`  | Inline numbering | |
| `GOTOBUTTON`, `MACROBUTTON` | Interactive jumps | Preserve; don't run macros. |

Field result is advisory; Word always reserves the right to recompute.
Our engine will recompute fields on open and before save unless
`w:settings/w:updateFields=false`.

### 5.11 Hyperlinks

**Modern element form:**
```xml
<w:hyperlink r:id="rId13" w:anchor="section2" w:history="1">
  <w:r>
    <w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr>
    <w:t>Click here</w:t>
  </w:r>
</w:hyperlink>
```

`r:id` points to an External relationship. `@w:anchor` for
within-document or appended-to-URL fragment. `@w:history="1"` adds to
recent links.

**Internal bookmark link:** omit `r:id`, use `@w:anchor="BookmarkName"`.

**Legacy field form** (Word 95 round-trip):
```xml
<w:r><w:fldChar w:fldCharType="begin"/></w:r>
<w:r><w:instrText xml:space="preserve">HYPERLINK "https://example.com/"</w:instrText></w:r>
<w:r><w:fldChar w:fldCharType="separate"/></w:r>
<w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>example</w:t></w:r>
<w:r><w:fldChar w:fldCharType="end"/></w:r>
```

Our writer emits the element form; reader handles both.

### 5.12 Bookmarks

```xml
<w:bookmarkStart w:id="0" w:name="Intro"/>
<w:r><w:t>Hello.</w:t></w:r>
<w:bookmarkEnd w:id="0"/>
```

**Rules:**
- `@w:id` is unique per document (any non-negative integer). Start and
  End must match by id.
- `@w:name` is display name; spaces not allowed in Word-style names but
  spec allows them (Word works around).
- Bookmarks can span across paragraphs and into tables (bookmark ranges
  may not be well-nested with paragraph structure — Start and End can
  appear at any block boundary).
- `_GoBack`, `_Hlk...`, `_Ref...`, `_Toc...` are Word-generated; preserve
  unless the containing range is edited away.

### 5.13 Breaks

- **Page break:** `<w:r><w:br w:type="page"/></w:r>` (also
  `w:pageBreakBefore` on a paragraph).
- **Column break:** `<w:r><w:br w:type="column"/></w:r>`.
- **Text wrap break (around floating object):** `<w:r><w:br w:type="textWrapping" w:clear="all"/></w:r>`.
- **Section break:** place `<w:sectPr>` in the `w:pPr` of the last
  paragraph of the previous section. The `w:type` inside determines the
  kind (`nextPage`, `continuous`, `nextColumn`, `oddPage`, `evenPage`).
  Word 95 had all five.

### 5.14 Tabs

Inside `w:pPr`:

```xml
<w:tabs>
  <w:tab w:val="clear" w:pos="720"/>
  <w:tab w:val="left"    w:pos="1440"/>
  <w:tab w:val="center"  w:pos="4680"/>
  <w:tab w:val="decimal" w:pos="6480" w:leader="dot"/>
  <w:tab w:val="right"   w:pos="9360" w:leader="underscore"/>
  <w:tab w:val="bar"     w:pos="10080"/>
</w:tabs>
```

`@w:val`: `clear`, `start`, `center`, `end`, `decimal`, `bar`, `num`,
`left`, `right`.
`@w:leader`: `none`, `dot`, `hyphen`, `underscore`, `heavy`, `middleDot`.
`@w:pos`: twips.

Inline tab character: `<w:r><w:tab/></w:r>`.

Default tabs (no `w:tabs` entries): `w:settings/w:defaultTabStop` (twips).

### 5.15 Lists (applied)

Apply a list to a paragraph through `w:numPr`:

```xml
<w:p>
  <w:pPr>
    <w:pStyle w:val="ListNumber"/>
    <w:numPr>
      <w:ilvl w:val="0"/>
      <w:numId w:val="1"/>
    </w:numPr>
  </w:pPr>
  <w:r><w:t>Item</w:t></w:r>
</w:p>
```

`@w:numId="0"` means "remove list formatting" (for styles with inherited
numbering).

### 5.16 Images (DrawingML)

Inline image, referencing an embedded binary via a relationship:

```xml
<w:r>
  <w:drawing>
    <wp:inline distT="0" distB="0" distL="0" distR="0">
      <wp:extent cx="3048000" cy="2286000"/>
      <wp:effectExtent l="0" t="0" r="0" b="0"/>
      <wp:docPr id="1" name="Picture 1" descr="A nebula"/>
      <wp:cNvGraphicFramePr>
        <a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>
      </wp:cNvGraphicFramePr>
      <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:nvPicPr>
              <pic:cNvPr id="1" name="nebula.png"/>
              <pic:cNvPicPr/>
            </pic:nvPicPr>
            <pic:blipFill>
              <a:blip r:embed="rId12"/>
              <a:stretch><a:fillRect/></a:stretch>
            </pic:blipFill>
            <pic:spPr>
              <a:xfrm>
                <a:off x="0" y="0"/>
                <a:ext cx="3048000" cy="2286000"/>
              </a:xfrm>
              <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
            </pic:spPr>
          </pic:pic>
        </a:graphicData>
      </a:graphic>
    </wp:inline>
  </w:drawing>
</w:r>
```

Anchored (floating) image:
```xml
<wp:anchor distT="0" distB="0" distL="114300" distR="114300"
           simplePos="0" relativeHeight="251658240"
           behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">
  <wp:simplePos x="0" y="0"/>
  <wp:positionH relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH>
  <wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>
  <wp:extent cx="3048000" cy="2286000"/>
  <wp:effectExtent l="0" t="0" r="0" b="0"/>
  <wp:wrapSquare wrapText="bothSides"/>
  <wp:docPr id="2" name="Picture 2"/>
  <!-- cNvGraphicFramePr, a:graphic as above -->
</wp:anchor>
```

Wrap elements: `wp:wrapNone`, `wp:wrapSquare`, `wp:wrapTight`,
`wp:wrapThrough`, `wp:wrapTopAndBottom`.

**VML fallback** (for older consumers / Word 95 legacy):
```xml
<mc:AlternateContent>
  <mc:Choice Requires="wps">
    <!-- DrawingML as above -->
  </mc:Choice>
  <mc:Fallback>
    <w:pict>
      <v:shape id="_x0000_i1025" type="#_x0000_t75" style="width:240pt;height:180pt">
        <v:imagedata r:id="rId12" o:title="nebula"/>
      </v:shape>
    </w:pict>
  </mc:Fallback>
</mc:AlternateContent>
```

**Our policy.** Emit DrawingML for new images. Round-trip VML if present.

### 5.17 Shapes and drawings

**DrawingML shape** (`wps:`) for textboxes, rectangles, connectors, etc.
Inside `a:graphicData@uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"`:

```xml
<mc:AlternateContent>
  <mc:Choice Requires="wps">
    <w:drawing>
      <wp:inline distT="0" distB="0" distL="0" distR="0">
        <wp:extent cx="2743200" cy="457200"/>
        <wp:docPr id="3" name="Rounded Rectangle 3"/>
        <a:graphic>
          <a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
            <wps:wsp xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
              <wps:cNvSpPr/>
              <wps:spPr>
                <a:xfrm><a:off x="0" y="0"/><a:ext cx="2743200" cy="457200"/></a:xfrm>
                <a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom>
                <a:solidFill><a:srgbClr val="FFD966"/></a:solidFill>
                <a:ln><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>
              </wps:spPr>
              <wps:txbx>
                <w:txbxContent>
                  <w:p><w:r><w:t>Label</w:t></w:r></w:p>
                </w:txbxContent>
              </wps:txbx>
              <wps:bodyPr rot="0" anchor="ctr"/>
            </wps:wsp>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>
  </mc:Choice>
  <mc:Fallback>
    <w:pict>
      <v:roundrect style="width:216pt;height:36pt" arcsize="10923f" fillcolor="#FFD966">
        <v:textbox><w:txbxContent><w:p><w:r><w:t>Label</w:t></w:r></w:p></w:txbxContent></v:textbox>
      </v:roundrect>
    </w:pict>
  </mc:Fallback>
</mc:AlternateContent>
```

Word 95 had rounded rectangles, textbox, connectors, etc. We implement
the common shapes as DrawingML + VML fallback; preserve unknown shape
types as opaque.

### 5.18 OLE objects

```xml
<w:r>
  <w:object>
    <v:shapetype id="_x0000_t75" coordsize="21600,21600" o:spt="75"
                 o:preferrelative="t" path="m@4@5l@4@11@9@11@9@5xe" filled="f"
                 stroked="f">
      <v:stroke joinstyle="miter"/>
      <v:formulas>
        <v:f eqn="if lineDrawn pixelLineWidth 0"/>
      </v:formulas>
      <v:path o:extrusionok="f" gradientshapeok="t" o:connecttype="rect"/>
      <o:lock v:ext="edit" aspectratio="t"/>
    </v:shapetype>
    <v:shape id="_x0000_i1026" type="#_x0000_t75" style="width:240pt;height:180pt"
             o:ole="">
      <v:imagedata r:id="rId20" o:title=""/>
    </v:shape>
    <o:OLEObject Type="Embed" ProgID="Equation.3" ShapeID="_x0000_i1026"
                 DrawAspect="Content" ObjectID="_1234567890" r:id="rId21"/>
  </w:object>
</w:r>
```

`r:id="rId20"` → image preview (EMF/WMF). `r:id="rId21"` →
`word/embeddings/oleObject1.bin`.

**Equation Editor 1.x** (Word 95 math) is stored as OLE with
`ProgID="Equation.2"` or `"Equation.3"`. We store the preview image and
`.bin`, preserve on round-trip, do not convert to OMML in v1. On newer
docs, `Equation.DSMT4` (MathType) or `m:oMath` OMML are both possible;
we display OMML and preserve MathType OLE.

### 5.19 Form fields

Form fields in Word 95 are text/checkbox/dropdown fields placed in
protected "forms" sections.

```xml
<!-- Text form field -->
<w:r><w:fldChar w:fldCharType="begin">
  <w:ffData>
    <w:name w:val="Text1"/>
    <w:enabled/>
    <w:calcOnExit w:val="0"/>
    <w:textInput>
      <w:type w:val="regular"/>
      <w:default w:val="Untitled"/>
      <w:maxLength w:val="0"/>
      <w:format w:val=""/>
    </w:textInput>
  </w:ffData>
</w:fldChar></w:r>
<w:r><w:instrText xml:space="preserve">FORMTEXT</w:instrText></w:r>
<w:r><w:fldChar w:fldCharType="separate"/></w:r>
<w:r><w:t>Untitled</w:t></w:r>
<w:r><w:fldChar w:fldCharType="end"/></w:r>
```

Checkbox: `w:checkBox/w:default` and `w:checkBox/w:checked`. Dropdown:
`w:ddList/w:result` + `w:listEntry`.

### 5.20 Frames (Word 95 feature)

Word 95 had true text frames (floating paragraph containers, distinct
from textboxes which were drawings). Stored inline in paragraph
properties:

```xml
<w:pPr>
  <w:framePr w:w="3600" w:h="2880" w:hRule="atLeast"
             w:vSpace="180" w:hSpace="180"
             w:wrap="around" w:hAnchor="page" w:vAnchor="text"
             w:x="1440" w:y="720" w:xAlign="center"/>
</w:pPr>
```

**Attributes:**
- `@w:w / @w:h` — size in twips; `@w:hRule` = `atLeast`/`exact`.
- `@w:hSpace / @w:vSpace` — distance from wrapped text (twips).
- `@w:wrap` — `auto`, `around`, `none`, `tight`, `through`, `notBeside`.
- `@w:hAnchor / @w:vAnchor` — `margin`, `page`, `text`.
- `@w:x / @w:y` — absolute offset twips; or…
- `@w:xAlign / @w:yAlign` — `left`/`center`/`right` / `top`/`center`/`bottom`/`inside`/`outside`.
- `@w:anchorLock` — lock to paragraph.
- `@w:dropCap` — `drop`/`margin` for drop caps.

Word 97+ deprecated frames for textboxes, but Word continues to read
`w:framePr`. We **preserve** on round-trip and **emit** when the user
explicitly uses the "Frame…" command in our UI.

### 5.21 Revisions (tracked changes)

Word 95 "Revisions" map directly to OOXML revision elements.

**Inserted runs/paragraphs:**
```xml
<w:p>
  <w:r><w:t xml:space="preserve">Original. </w:t></w:r>
  <w:ins w:id="1" w:author="Jon" w:date="2026-04-17T10:00:00Z">
    <w:r><w:t>Inserted text.</w:t></w:r>
  </w:ins>
</w:p>
```

**Deleted runs:**
```xml
<w:del w:id="2" w:author="Jon" w:date="2026-04-17T10:05:00Z">
  <w:r><w:delText xml:space="preserve">removed text </w:delText></w:r>
</w:del>
```

(`w:delText` replaces `w:t` inside `w:del`; preserves whitespace the same
way.)

**Move** (Word 2010+ but preserve on round-trip):
```xml
<w:moveFrom w:id="3" w:author="Jon" w:date="...">
  <w:r><w:t>moved text</w:t></w:r>
</w:moveFrom>
...
<w:moveTo w:id="3" w:author="Jon" w:date="...">
  <w:r><w:t>moved text</w:t></w:r>
</w:moveTo>
```

**Property changes (tracked formatting):**
- `w:rPrChange` inside `w:rPr` — stores previous rPr.
- `w:pPrChange` inside `w:pPr`.
- `w:sectPrChange` inside `w:sectPr`.
- `w:tblPrChange` inside `w:tblPr`.
- `w:tblGridChange`, `w:trPrChange`, `w:tcPrChange`.

Example:
```xml
<w:rPr>
  <w:b/>
  <w:rPrChange w:id="4" w:author="Jon" w:date="...">
    <w:rPr><w:i/></w:rPr>
  </w:rPrChange>
</w:rPr>
```

Meaning: "current bold; previously italic."

### 5.22 Document protection

In `settings.xml`:

```xml
<w:documentProtection
  w:edit="readOnly"
  w:formatting="1"
  w:enforcement="1"
  w:cryptProviderType="rsaAES"
  w:cryptAlgorithmClass="hash"
  w:cryptAlgorithmType="typeAny"
  w:cryptAlgorithmSid="14"
  w:cryptSpinCount="100000"
  w:hash="<base64>"
  w:salt="<base64>"/>
```

`@w:edit` values: `none`, `readOnly`, `comments`, `trackedChanges`, `forms`.

Word 95 supported `none`, `readOnly`, `trackedChanges`, `forms` (forms
sections). `comments`-only is Word 2000+. We preserve all.

Hash/salt follow the cryptographic parameters in the spec; we only
**verify** passwords; we never emit weak hashes for new docs.

### 5.23 AutoText / Building Blocks

Glossary document is a mini-document. Each entry is a `w:docPart`:

```xml
<!-- word/glossary/document.xml -->
<w:glossaryDocument xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docParts>
    <w:docPart>
      <w:docPartPr>
        <w:name w:val="Signature"/>
        <w:style w:val="Normal"/>
        <w:category>
          <w:name w:val="General"/>
          <w:gallery w:val="autoTxt"/>
        </w:category>
        <w:types><w:type w:val="autoTxt"/></w:types>
        <w:behaviors><w:behavior w:val="content"/></w:behaviors>
        <w:guid w:val="{A1B2C3D4-...}"/>
      </w:docPartPr>
      <w:docPartBody>
        <w:p><w:r><w:t>Jon Bell — jon@jonbell.net</w:t></w:r></w:p>
      </w:docPartBody>
    </w:docPart>
  </w:docParts>
</w:glossaryDocument>
```

Galleries include `autoTxt`, `coverPg`, `eq`, `ftrs`, `hdrs`, `pgNum`,
`tbls`, `watermarks`, `custom1..5`, etc. Word 95 had AutoText only;
we map Word 95 AutoText entries to `gallery="autoTxt"`.

### 5.24 Macros (VBA)

Word 95 used **WordBasic**, not VBA. WordBasic scripts do not exist in
modern DOCX and we do not have a WordBasic interpreter. If the source
material came from Word 95, any macros lived in a template (`.dot`)
binary — it would be either lost during conversion to DOCX, or preserved
as a `vbaProject.bin` by a later Word (Word 97+ auto-converted WordBasic
to VBA).

**Our policy:**
- New documents are `.docx`, macro-free.
- If input is `.docm` or contains `vbaProject.bin`: preserve the binary
  as opaque bytes; change the package content type to
  `application/vnd.ms-word.document.macroEnabled.main+xml` on write
  (extension `.docm`).
- Never execute VBA.
- Round-trip relationship:
  ```xml
  <Relationship Id="rId50"
                Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject"
                Target="vbaProject.bin"/>
  ```
- Sign off: show UI warning "Macros preserved but disabled."

### 5.25 Math

OMML (`m:` namespace) for modern math:

```xml
<m:oMathPara>
  <m:oMath>
    <m:f>
      <m:fPr/>
      <m:num><m:r><m:t>a + b</m:t></m:r></m:num>
      <m:den><m:r><m:t>c</m:t></m:r></m:den>
    </m:f>
  </m:oMath>
</m:oMathPara>
```

**Word 95 math.** Equation Editor 1.x is stored as OLE (see §5.18).
Content is a proprietary binary (MathType `.mtef` format). We round-trip
as opaque and display the EMF preview. **We do not convert EE 1.x to
OMML in v1.**

For new math composed in our app, emit OMML.

---

## 6. Built-in style table

Complete mapping from Word 95 UI names to canonical OOXML styleIds. The
styleId is the `@w:styleId` attribute value on the `<w:style>`; it is
language-neutral. The `@w:name` is the locale-neutral canonical name
("heading 1" lower-case) used by Word for latent-style lookup; localized
names are attached via `w:aliases`.

| Word 95 name         | styleId           | Type      | Notes |
|----------------------|-------------------|-----------|-------|
| Normal               | `Normal`          | paragraph | `w:default="1"` |
| Heading 1            | `Heading1`        | paragraph | `outlineLvl=0`, `basedOn=Normal`, `next=Normal`, `link=Heading1Char` |
| Heading 2            | `Heading2`        | paragraph | `outlineLvl=1` |
| Heading 3            | `Heading3`        | paragraph | `outlineLvl=2` |
| Heading 4            | `Heading4`        | paragraph | `outlineLvl=3` |
| Heading 5            | `Heading5`        | paragraph | `outlineLvl=4` |
| Heading 6            | `Heading6`        | paragraph | `outlineLvl=5` |
| Heading 7            | `Heading7`        | paragraph | `outlineLvl=6` |
| Heading 8            | `Heading8`        | paragraph | `outlineLvl=7` |
| Heading 9            | `Heading9`        | paragraph | `outlineLvl=8` |
| Default Paragraph Font | `DefaultParagraphFont` | character | `w:default="1"` |
| Header               | `Header`          | paragraph | Used in `w:hdr` |
| Footer               | `Footer`          | paragraph | Used in `w:ftr` |
| Footnote Text        | `FootnoteText`    | paragraph | |
| Footnote Reference   | `FootnoteReference` | character | Superscript char style |
| Endnote Text         | `EndnoteText`     | paragraph | |
| Endnote Reference    | `EndnoteReference`| character | |
| Comment Text         | `CommentText`     | paragraph | (was "Annotation Text" in Word 95) |
| Comment Reference    | `CommentReference`| character | (was "Annotation Reference") |
| Comment Subject      | `CommentSubject`  | paragraph | (was "Annotation Subject") |
| Page Number          | `PageNumber`      | character | |
| Line Number          | `LineNumber`      | character | |
| Caption              | `Caption`         | paragraph | |
| Table of Figures     | `TableofFigures`  | paragraph | |
| Table of Authorities | `TableofAuthorities` | paragraph | |
| TOA Heading          | `TOAHeading`      | paragraph | |
| TOC 1..9             | `TOC1`..`TOC9`    | paragraph | One per level |
| Table Grid           | `TableGrid`       | table     | |
| Normal Table         | `TableNormal`     | table     | `w:default="1"` |
| Normal (Web)         | `NormalWeb`       | paragraph | |
| Hyperlink            | `Hyperlink`       | character | Blue underline |
| FollowedHyperlink    | `FollowedHyperlink` | character | Purple underline |
| List                 | `List`            | paragraph | |
| List 2..5            | `List2`..`List5`  | paragraph | |
| List Bullet          | `ListBullet`      | paragraph | |
| List Bullet 2..5     | `ListBullet2`..`ListBullet5` | paragraph | |
| List Number          | `ListNumber`      | paragraph | |
| List Number 2..5     | `ListNumber2`..`ListNumber5` | paragraph | |
| List Continue        | `ListContinue`    | paragraph | |
| List Continue 2..5   | `ListContinue2`..`ListContinue5` | paragraph | |
| Body Text            | `BodyText`        | paragraph | |
| Body Text 2          | `BodyText2`       | paragraph | |
| Body Text 3          | `BodyText3`       | paragraph | |
| Body Text Indent     | `BodyTextIndent`  | paragraph | |
| Body Text Indent 2   | `BodyTextIndent2` | paragraph | |
| Body Text Indent 3   | `BodyTextIndent3` | paragraph | |
| Body Text First Indent | `BodyTextFirstIndent` | paragraph | |
| Body Text First Indent 2 | `BodyTextFirstIndent2` | paragraph | |
| Salutation           | `Salutation`      | paragraph | Letter-writing |
| Closing              | `Closing`         | paragraph | |
| Signature            | `Signature`       | paragraph | |
| Date                 | `Date`            | paragraph | |
| Subtitle             | `Subtitle`        | paragraph | |
| Title                | `Title`           | paragraph | |
| Document Map         | `DocumentMap`     | paragraph | |
| Plain Text           | `PlainText`       | paragraph | Mono |
| Message Header       | `MessageHeader`   | paragraph | |
| Envelope Address     | `EnvelopeAddress` | paragraph | |
| Envelope Return      | `EnvelopeReturn`  | paragraph | |
| Index 1..9           | `Index1`..`Index9`| paragraph | |
| Index Heading        | `IndexHeading`    | paragraph | |
| TOA Heading          | `TOAHeading`      | paragraph | |
| Block Text           | `BlockText`       | paragraph | |
| Emphasis             | `Emphasis`        | character | Italic |
| Strong               | `Strong`          | character | Bold |
| HTML Address         | `HTMLAddress`     | paragraph | |
| HTML Cite            | `HTMLCite`        | character | |
| HTML Code            | `HTMLCode`        | character | |
| HTML Definition      | `HTMLDefinition`  | character | |
| HTML Keyboard        | `HTMLKeyboard`    | character | |
| HTML Preformatted    | `HTMLPreformatted`| paragraph | |
| HTML Sample          | `HTMLSample`      | character | |
| HTML Typewriter      | `HTMLTypewriter`  | character | |
| HTML Variable        | `HTMLVariable`    | character | |
| Macro Text           | `MacroText`       | paragraph | |

**Rules for our writer:**
- StyleId is derived from the locale-neutral name by concatenating words
  (PascalCase-ish): "heading 1" → `Heading1`, "List Bullet" →
  `ListBullet`.
- Never localize the styleId. Localize via `w:aliases` only.
- The default paragraph style (`Normal`) and default character style
  (`DefaultParagraphFont`) and default table style (`TableNormal`) must
  always exist, even if unreferenced.

---

## 7. Round-trip strategy

### 7.1 Principle

Do not lose information we don't understand.

### 7.2 Parse phase

- We maintain a typed in-memory document model (see
  `src/model/document.ts` — external module).
- Every XML subtree that does not match a known element on our model
  becomes an `UnknownElement` node attached to the nearest known
  ancestor. `UnknownElement` stores:
  - `namespaceURI`
  - `localName`
  - attributes (as verbatim map, preserving prefix hints)
  - children (verbatim; text preserved with original whitespace)
  - original byte span (for debugging; optional)
- `mc:AlternateContent` is resolved at parse time: we follow the highest
  `Requires` we satisfy and attach each `mc:Fallback` (as
  `UnknownElement`) so we can re-emit on write.
- Comments and processing instructions are ignored except in the
  `<?xml?>` prolog and the `xml-stylesheet` (preserve the latter if
  present).

### 7.3 Emit phase

- Every known model node emits its canonical XML.
- `UnknownElement` children are emitted verbatim at their original
  position (relative to siblings present in the model).
- When we modify a subtree containing unknown children and cannot
  determine the correct insertion point, we fall back to appending
  unknowns at the end of the nearest known parent's children, in
  encounter order.

### 7.4 Extension mechanism (not used in v1)

Should we introduce a proprietary element `wordjb:foo` in a future
version, wrap it in `mc:AlternateContent`:

```xml
<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
  <mc:Choice Requires="wordjb" xmlns:wordjb="urn:jonbell:word:2027">
    <wordjb:foo wordjb:attr="1"/>
  </mc:Choice>
  <mc:Fallback>
    <!-- equivalent standard markup -->
  </mc:Fallback>
</mc:AlternateContent>
```

Add `wordjb` to `mc:Ignorable` on the containing part root.

### 7.5 Round-trip tests

`src/serialize/__tests__/round-trip.test.ts` must:
- Open every fixture in `test/fixtures/docx/`.
- Parse, then emit, then parse the emitted bytes.
- Assert the two parse trees are structurally equal modulo known
  normalizations (default-value fill, ordered attrs, default styles,
  namespace prefix consolidation).
- Special fixtures in `test/fixtures/docx/verbatim/` must round-trip to
  byte-exact output after one normalization pass (the second pass must
  emit the same bytes as the first).

---

## 8. Canonical output

### 8.1 XML-level normalization

- UTF-8 encoding. BOM **not** emitted. Some MS consumers expect BOM on
  `.rels` — [verify] ([MS-DOCX] hints Word always emits UTF-8 no-BOM for
  `.xml`; for `.rels` it is similarly no-BOM in current Word versions).
- XML prolog: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
  on every XML part (Word emits this exactly; some parsers rely on
  `standalone="yes"`).
- LF line endings inside XML; no BOM inside; no trailing whitespace.
- Pretty-printing: **off** by default (emit single-line compact form).
  Word emits compact; keep diffs tractable by ordering (see below) not
  by whitespace.

### 8.2 Attribute ordering

Per element, emit attributes in the order specified by the ECMA-376
schema (CT_* complex types). When multiple attributes have the same
logical group (e.g. `w:val` then decorators), put `w:val` first.

Namespace declarations first on the element that introduces them.

### 8.3 Whitespace in text

Runs with leading/trailing whitespace require `xml:space="preserve"`:

```xml
<w:t xml:space="preserve"> Hello, world </w:t>
```

Rules:
- Emit `xml:space="preserve"` on `w:t` **whenever** the text contains
  leading or trailing whitespace, or any U+0009/U+000A/U+000D characters.
- The same rule applies to `w:delText`, `w:instrText`.
- Inside `<w:instrText>` we always emit `xml:space="preserve"` (field
  codes are whitespace-sensitive and brittle).

### 8.4 Element ordering inside `w:rPr` / `w:pPr`

ECMA-376 Part 1 §17.3.1.29 / §17.3.2.28 etc. specify a **sequence** for
property elements. Our writer enforces this order exactly; our reader
tolerates any order.

Canonical `w:rPr` order (abridged):
1. `w:rStyle`
2. `w:rFonts`
3. `w:b`, `w:bCs`
4. `w:i`, `w:iCs`
5. `w:caps`, `w:smallCaps`
6. `w:strike`, `w:dstrike`
7. `w:outline`, `w:shadow`, `w:emboss`, `w:imprint`
8. `w:noProof`
9. `w:snapToGrid`
10. `w:vanish`, `w:webHidden`
11. `w:color`
12. `w:spacing`
13. `w:w` (text scale)
14. `w:kern`
15. `w:position`
16. `w:sz`, `w:szCs`
17. `w:highlight`
18. `w:u`
19. `w:effect`
20. `w:bdr`
21. `w:shd`
22. `w:fitText`
23. `w:vertAlign`
24. `w:rtl`, `w:cs`
25. `w:em`
26. `w:lang`
27. `w:eastAsianLayout`
28. `w:specVanish`
29. `w:oMath`

Canonical `w:pPr` order (abridged):
1. `w:pStyle`
2. `w:keepNext`
3. `w:keepLines`
4. `w:pageBreakBefore`
5. `w:framePr`
6. `w:widowControl`
7. `w:numPr`
8. `w:suppressLineNumbers`
9. `w:pBdr`
10. `w:shd`
11. `w:tabs`
12. `w:suppressAutoHyphens`
13. `w:kinsoku`, `w:wordWrap`, `w:overflowPunct`, `w:topLinePunct`, `w:autoSpaceDE`, `w:autoSpaceDN`
14. `w:bidi`
15. `w:adjustRightInd`
16. `w:snapToGrid`
17. `w:spacing`
18. `w:ind`
19. `w:contextualSpacing`
20. `w:mirrorIndents`
21. `w:suppressOverlap`
22. `w:jc`
23. `w:textDirection`
24. `w:textAlignment`
25. `w:textboxTightWrap`
26. `w:outlineLvl`
27. `w:divId`
28. `w:cnfStyle`
29. `w:rPr` (paragraph mark's run properties)
30. `w:sectPr`
31. `w:pPrChange`

### 8.5 Deterministic IDs

- Relationship IDs: `rId{n}` sequential per rels part, 1-based.
- Numbering IDs: `w:abstractNumId` and `w:numId` sequential.
- Comment/footnote/endnote IDs: sequential starting at 1 (with -1 and
  0 reserved for separators).
- Bookmark IDs: sequential per document.
- `w:id` on `w:ins`/`w:del`/`w:moveFrom`/`w:moveTo` and property-change
  elements: sequential per document.
- DrawingML `docPr@id` and `cNvPr@id`: must be positive 32-bit integer;
  sequential per document.
- `w14:paraId` and `w14:textId`: 8-hex-digit IDs. In tests we seed a
  nanoid with the fixture path + a counter for reproducibility.

In test mode we pin `Math.random` / `performance.now` stand-ins; in
production we seed from a cryptographic source.

### 8.6 ZIP canonicalization

- Fixed central-directory ordering: `[Content_Types].xml` first, then
  `_rels/.rels`, then `word/document.xml`, then other parts in
  lexicographic order.
- Fixed compression level (Deflate, level 9).
- Fixed timestamps in test mode (1980-01-01 00:00:00 — the minimum DOS
  date, as used by some package tools).
- No file comments or extra fields.
- UTF-8 flag set for entry names.
- No zip64 unless required.

---

## 9. Validation

### 9.1 Dev-mode validator

`src/validate/` ships an ECMA-376 XSD-based validator wired to the
bundled schemas:
- `vendor/ecma-376/wml.xsd`
- `vendor/ecma-376/dml-main.xsd`
- `vendor/ecma-376/dml-wordprocessingDrawing.xsd`
- `vendor/ecma-376/shared-commonSimpleTypes.xsd`
- `vendor/ecma-376/shared-relationshipReference.xsd`
- `vendor/ecma-376/shared-math.xsd`
- (and the OPC schemas in `vendor/opc/`)

In development mode, every emitted part is validated. Warnings log, not
errors. In release builds validation is off to keep save fast.

### 9.2 Known Word tolerances

Word is famously permissive on read. Examples where we must be equally
permissive:
- Integer attributes accept leading `+`.
- Boolean attributes accept any of `1`, `true`, `on`, `t`, and their
  negations. We normalize on write.
- Hex color with or without `#` prefix — accept both, emit without.
- `w:val` omitted where the schema requires it: infer boolean "on" for
  toggles.
- `w:rFonts` with mismatched slots (e.g. `ascii` but no `hAnsi`): we fill
  the missing slot on write.
- Elements emitted in wrong order inside `w:rPr`/`w:pPr`: read in any
  order; emit canonical.
- Duplicate `w:b` etc. inside same `w:rPr`: use the last occurrence
  (matches Word).

### 9.3 Strict-read, tolerant-fallback

Unrecognized elements: preserve as unknown, log warning, continue.
Broken relationships (missing target): log error, strip inline
reference, continue.
XML not well-formed: attempt byte-level recovery (remove stray `&` etc.);
if that fails, abort the open with an actionable error.

---

## 10. Compatibility (`w:compat`)

`settings.xml`'s `<w:compat>` block holds feature-compat flags. Word
injects many flags to reproduce older Word's layout bugs.

```xml
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:zoom w:percent="100"/>
  <w:defaultTabStop w:val="720"/>
  <w:characterSpacingControl w:val="doNotCompress"/>
  <w:compat>
    <w:compatSetting w:name="compatibilityMode"          w:uri="http://schemas.microsoft.com/office/word" w:val="11"/>
    <w:compatSetting w:name="overrideTableStyleFontSizeAndJustification" w:uri="http://schemas.microsoft.com/office/word" w:val="0"/>
    <w:compatSetting w:name="enableOpenTypeFeatures"     w:uri="http://schemas.microsoft.com/office/word" w:val="1"/>
    <w:compatSetting w:name="doNotFlipMirrorIndents"     w:uri="http://schemas.microsoft.com/office/word" w:val="0"/>
    <w:compatSetting w:name="useWord2013TrackBottomHyphenation" w:uri="http://schemas.microsoft.com/office/word" w:val="0"/>
    <w:useFELayout/>
    <w:balanceSingleByteDoubleByteWidth/>
    <w:spacingInWholePoints/>
    <w:splitPgBreakAndParaMark/>
    <w:doNotExpandShiftReturn/>
    <w:doNotSnapToGridInCell/>
    <w:selectFldWithFirstOrLastChar/>
    <w:doNotAutofitConstrainedTables/>
    <w:doNotBreakWrappedTables/>
    <w:growAutofit/>
    <w:useSingleBorderforContiguousCells/>
    <w:wpJustification/>
    <w:noTabHangInd/>
    <w:noLeading/>
    <w:spaceForUL/>
    <w:noColumnBalance/>
    <w:balanceSingleByteDoubleByteWidth/>
    <w:noExtraLineSpacing/>
    <w:doNotLeaveBackslashAlone/>
    <w:ulTrailSpace/>
    <w:doNotExpandShiftReturn/>
    <w:spacingInWholePoints/>
    <w:lineWrapLikeWord6/>
    <w:printBodyTextBeforeHeader/>
    <w:printColBlack/>
    <w:wpSpaceWidth/>
    <w:showBreaksInFrames/>
    <w:subFontBySize/>
    <w:suppressBottomSpacing/>
    <w:suppressTopSpacing/>
    <w:suppressSpacingAtTopOfPage/>
    <w:suppressTopSpacingWP/>
    <w:suppressSpBfAfterPgBrk/>
    <w:swapBordersFacingPages/>
    <w:convMailMergeEsc/>
    <w:truncateFontHeightsLikeWP6/>
    <w:mwSmallCaps/>
    <w:usePrinterMetrics/>
    <w:doNotSuppressParagraphBorders/>
    <w:wrapTrailSpaces/>
    <w:footnoteLayoutLikeWW8/>
    <w:shapeLayoutLikeWW8/>
    <w:alignTablesRowByRow/>
    <w:forgetLastTabAlignment/>
    <w:adjustLineHeightInTable/>
    <w:autoSpaceLikeWord95/>
    <w:noSpaceRaiseLower/>
    <w:doNotUseHTMLParagraphAutoSpacing/>
    <w:layoutRawTableWidth/>
    <w:layoutTableRowsApart/>
    <w:useWord97LineBreakRules/>
    <w:doNotBreakConstrainedForcedTable/>
    <w:doNotVertAlignCellWithSp/>
    <w:doNotBreakWrappedTables/>
    <w:doNotVertAlignInTxbx/>
    <w:useAnsiKerningPairs/>
    <w:cachedColBalance/>
  </w:compat>
</w:settings>
```

### 10.1 Flag reference (selected)

| Flag                                  | Meaning                                                                                           | Word 95 era? | v1 action |
|---------------------------------------|---------------------------------------------------------------------------------------------------|--------------|-----------|
| `useFELayout`                         | East-Asian layout emulation.                                                                      | N (FE=Far East; 97+)  | Preserve only. |
| `balanceSingleByteDoubleByteWidth`    | SBCS/DBCS width balancing.                                                                        | N            | Preserve only. |
| `spacingInWholePoints`                | Round paragraph spacing to whole points (Word 6/95 behavior).                                     | Y            | **Implement** when set. |
| `splitPgBreakAndParaMark`             | Keep mandatory page break separate from paragraph mark.                                           | Y            | **Implement**. |
| `doNotExpandShiftReturn`              | Don't expand Shift+Enter line break in justified text.                                            | Y            | **Implement**. |
| `doNotSnapToGridInCell`               | Skip grid snap in table cells.                                                                    | Y            | Preserve only. |
| `selectFldWithFirstOrLastChar`        | Selecting near field boundary includes the field.                                                 | Y            | Implement. |
| `noTabHangInd`                        | Hanging indent does not add leading tab.                                                          | Y            | Implement. |
| `noLeading`                           | Don't add leading to line height (Word 6/95).                                                     | Y            | **Implement**. |
| `spaceForUL`                          | Underline spaces at end of line.                                                                  | Y            | Implement. |
| `noColumnBalance`                     | Don't balance columns on last page.                                                               | Y            | Implement. |
| `noExtraLineSpacing`                  | Suppress extra spacing above first line.                                                          | Y            | Implement. |
| `doNotLeaveBackslashAlone`            | Translate `\` in field codes.                                                                      | Y            | Preserve only. |
| `ulTrailSpace`                        | Underline trailing spaces.                                                                         | Y            | Implement. |
| `lineWrapLikeWord6`                   | Word 6 line-wrap rules.                                                                            | Y            | **Implement**. |
| `printBodyTextBeforeHeader`           | Print order: body before header (WordPerfect compat).                                              | Y            | Preserve only. |
| `printColBlack`                       | Print color as black.                                                                              | Y            | Preserve only. |
| `wpSpaceWidth`                        | WordPerfect space width semantics.                                                                 | Y            | Preserve only. |
| `showBreaksInFrames`                  | Show page-break markers inside frames.                                                             | Y            | Implement. |
| `subFontBySize`                       | Pick substitute font by size.                                                                      | Y            | Preserve only. |
| `suppressBottomSpacing`               | Suppress bottom paragraph spacing on page end.                                                     | Y            | Implement. |
| `suppressTopSpacing`                  | Suppress top paragraph spacing on page start.                                                      | Y            | Implement. |
| `suppressSpacingAtTopOfPage`          | Similar; newer flag.                                                                              | N            | Preserve only. |
| `suppressTopSpacingWP`                | WordPerfect-style suppression.                                                                     | Y            | Preserve only. |
| `suppressSpBfAfterPgBrk`              | Suppress space-before after page break.                                                            | Y            | Implement. |
| `swapBordersFacingPages`              | Mirror borders on facing pages.                                                                    | Y            | Implement. |
| `convMailMergeEsc`                    | Mail-merge escape handling.                                                                        | Y            | Preserve only. |
| `truncateFontHeightsLikeWP6`          | WordPerfect 6 font metrics.                                                                        | Y            | Preserve only. |
| `mwSmallCaps`                         | Mac Word small-caps rules.                                                                         | Y            | Preserve only. |
| `usePrinterMetrics`                   | Layout against printer metrics.                                                                    | Y            | Preserve only. |
| `doNotSuppressParagraphBorders`       | Don't suppress paragraph borders between consecutive paragraphs of same border.                    | Y            | Implement. |
| `wrapTrailSpaces`                     | Wrap trailing spaces.                                                                              | Y            | Implement. |
| `footnoteLayoutLikeWW8`               | Word 97 (WW8) footnote layout.                                                                     | Y (upgrade path) | Implement. |
| `shapeLayoutLikeWW8`                  | WW8 shape layout.                                                                                  | Y            | Preserve only. |
| `alignTablesRowByRow`                 | Align each row independently.                                                                      | Y            | Implement. |
| `forgetLastTabAlignment`              | Legacy tab alignment bug.                                                                          | Y            | Implement. |
| `adjustLineHeightInTable`             | Adjust line height inside cells.                                                                   | Y            | Implement. |
| `autoSpaceLikeWord95`                 | Word 95 auto-spacing rules.                                                                        | **Y**        | **Implement**. |
| `noSpaceRaiseLower`                   | No extra space for raised/lowered text.                                                            | Y            | Implement. |
| `doNotUseHTMLParagraphAutoSpacing`    | Disable HTML-style auto-spacing.                                                                   | Y            | Implement. |
| `layoutRawTableWidth`                 | Use raw (un-autofit) table width.                                                                  | Y            | Preserve only. |
| `layoutTableRowsApart`                | Lay out table rows independently.                                                                  | Y            | Implement. |
| `useWord97LineBreakRules`             | Word 97 line breaking.                                                                             | Y            | Implement. |
| `doNotBreakConstrainedForcedTable`    | Keep forced-width table unbroken.                                                                  | Y            | Implement. |
| `doNotVertAlignCellWithSp`            | Don't vertically align a cell containing a floating shape.                                         | Y            | Implement. |
| `doNotBreakWrappedTables`             | Don't break across page if wrapped.                                                                | Y            | Implement. |
| `doNotVertAlignInTxbx`                | Don't vertically align text box.                                                                   | Y            | Preserve only. |
| `useAnsiKerningPairs`                 | Apply ANSI kerning pairs.                                                                          | Y            | Implement. |
| `cachedColBalance`                    | Cache column balance.                                                                              | Y            | Preserve only. |

**`w:compatSetting`** (namespaced kv) are newer; we preserve all. The
most load-bearing is `compatibilityMode`:
- `11` — Word 2003
- `12` — Word 2007
- `14` — Word 2010
- `15` — Word 2013+

When reading a Word 95-origin converted doc, expect `11` or lower (Word
sets this based on the oldest known compat target). We emit `15` for
new documents, `11` when the user chooses "Word 95 compatibility".

### 10.2 Settings we also read

- `w:defaultTabStop` (twips)
- `w:autoHyphenation` (`w:val="true/false"`)
- `w:hyphenationZone` (twips)
- `w:consecutiveHyphenLimit`
- `w:characterSpacingControl` (`compressPunctuation`, `compressPunctuationAndJapaneseKana`, `doNotCompress`)
- `w:evenAndOddHeaders`
- `w:mirrorMargins`
- `w:bookFoldPrinting`, `w:bookFoldRevPrinting`, `w:bookFoldPrintingSheets`
- `w:displayBackgroundShape`
- `w:printPostScriptOverText`, `w:printFractionalCharacterWidth`, `w:printFormsData`
- `w:embedSystemFonts`, `w:embedTrueTypeFonts`, `w:doNotEmbedSmartTags`
- `w:saveFormsData`, `w:saveInvalidXML`
- `w:ignoreMixedContent`, `w:alwaysShowPlaceholderText`
- `w:updateFields`
- `w:hdrShapeDefaults`, `w:footnotePr`, `w:endnotePr`, `w:documentType`
- `w:rsids` (Word's revision save IDs). We preserve; we emit new rsids
  for our own changes in a deterministic scheme (`0x10000000 + n`).

---

## 11. Library survey

We hand-roll parser/serializer, but studying existing implementations
saves us months.

### 11.1 Surveyed libraries

| Name             | Language | Strengths                                                      | Weaknesses                                 | For us |
|------------------|----------|---------------------------------------------------------------|--------------------------------------------|--------|
| `docx` (npm)     | TS       | Ergonomic write API; popular                                  | Writer-only; opinionated defaults; does not preserve unknown content | Don't adopt; cross-check our writer. |
| `mammoth`        | JS       | Simple reader; DOCX → HTML                                     | Lossy; opinionated                         | Don't adopt; useful for HTML export comparisons. |
| `docx4j`         | Java     | Reference-quality; schema-bound POJOs generated from XSD       | Java deployment; bloat                      | **Study for correctness.** |
| `python-docx`    | Python   | Widely deployed; good style/numbering coverage                 | Missing many features (tracked changes mostly absent) | Cross-reference for common paths. |
| `Apache POI`     | Java     | Broad format coverage (all OOXML + binary)                     | Sprawling API                               | Consult for binary-era semantics. |
| `Open-XML-SDK`   | C# .NET  | Microsoft-official; schema-complete                            | Windows-ish deployment                      | **Study for correctness and defaults.** |
| `oox` (LibreOffice) | C++   | Industrial reader/writer; deep quirks knowledge                | Non-trivial to read                         | Study for quirks and Word tolerances. |
| `SimpleOOXML`, various niche libs | various | point solutions             | Incomplete                                  | — |

### 11.2 Recommendation

- **Study** `docx4j` (for typed model discipline) and `Open-XML-SDK` (for
  defaults, ordering, and "what Word does").
- **Do not adopt** `docx` or `mammoth`: both shed information we need.
- Hand-roll the TS parser/serializer for (a) round-trip fidelity, (b)
  perf, (c) zero runtime dependency on GPL/LGPL libs, (d) tight coupling
  with our typed model.

---

## 12. Parsing strategy

### 12.1 Packaging

- `fflate` (MIT, fast, TS types) for ZIP decompression/compression.
- Streaming reader: yield part entries as (name, type, stream) tuples
  so we can avoid buffering very large parts in memory.
- Zip-bomb guard: cap decompressed size at 512 MB default (configurable).
  Abort with `ZipSizeLimitExceeded` if exceeded. Track compression ratio
  cumulatively; abort if ratio > 200× on any part > 1 MB input.
- Zip-slip guard: normalize each entry name; reject absolute paths, `..`
  segments, Windows drive letters, NUL bytes, and any entry whose
  normalized name doesn't start with a known package-valid prefix
  (alphanumerics + `-_./`).

### 12.2 XML parsing

- **`document.xml`** uses a streaming SAX-style parser
  (`saxes`, TS-friendly, pull API available via wrapper).
  - State machine tracks the current path of open elements; we consume
    tokens into our model one paragraph/table/row at a time.
  - For very large documents (thousands of pages) this keeps memory
    bounded to the current paragraph plus shared lookup tables.
- **All other parts** use a DOM parser (`linkedom` or a minimal built-in)
  for ergonomic access. Styles/numbering/settings are small; DOM is
  simpler.

### 12.3 No entity expansion

We **disable**:
- DOCTYPE entirely (`<!DOCTYPE` triggers an error; many XML parsers
  default to allowing it, which is a security risk).
- External entity resolution.
- Network access of any kind during parse.

If a legacy DOCX ships with a DOCTYPE (invalid per spec anyway), we log
and strip.

### 12.4 Encoding

UTF-8 only. If the declaration says otherwise, we still decode as UTF-8
and log a warning (matching Word's real behavior).

### 12.5 Identity preservation across parse→emit

- Preserve original namespace prefixes when unknown. Normalize known
  prefixes to our canonical table.
- Preserve original attribute values verbatim (integers as written) on
  unknown elements. On known elements, normalize to canonical form.

---

## 13. Writing strategy

### 13.1 Streaming emission

Emit to a ZIP writer entry-by-entry. For each part:
1. Open a deflate stream for the entry.
2. Emit the XML prolog.
3. Walk the model, writing XML token-by-token; hold no large in-memory
   buffer beyond a small chunk cache.
4. Close the entry; record final CRC32 and size.

### 13.2 Attribute serialization

- Strings: XML-escape `&`, `<`, `>`, `"`, `'` as `&amp;`, `&lt;`, `&gt;`,
  `&quot;`, `&#39;`.
- Booleans on toggles: omit the attribute when true (`<w:b/>`); emit
  `w:val="false"` only to explicitly negate.
- Numbers: emit integer form; never scientific, never trailing zeros.

### 13.3 Part ordering

See §8.6.

### 13.4 Deterministic output

- All ID allocators reset per document.
- All timestamps use the model's `createdAt` / `modifiedAt`; in tests,
  use a fixed injected clock.
- All pseudo-random IDs (w14:paraId etc.) use a seeded generator keyed
  on the document's canonical path.

### 13.5 Minimum viable document

The smallest valid `.docx` we emit:

```
[Content_Types].xml
_rels/.rels
word/document.xml
word/_rels/document.xml.rels
word/styles.xml
docProps/core.xml
docProps/app.xml
```

`word/document.xml`:

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p/>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"
               w:header="720" w:footer="720" w:gutter="0"/>
      <w:cols w:space="720"/>
      <w:docGrid w:linePitch="360"/>
    </w:sectPr>
  </w:body>
</w:document>
```

---

## 14. Error modes (defensive handling)

| Condition                               | Reader action                                                                     | Writer action |
|------------------------------------------|------------------------------------------------------------------------------------|---------------|
| Corrupt ZIP central directory            | Try best-effort recovery (scan for local headers); if that fails, abort with `CorruptPackage`. | — |
| XML parse error (well-formedness)        | Attempt entity-repair once; else abort that part with `PartParseError`; for non-critical parts (e.g. `webSettings`), skip and continue.  | Never emit invalid XML; validator in dev mode catches. |
| Schema violation (valid XML, wrong schema) | Log `SchemaViolation`; use default; continue.                                     | Reject in dev mode; accept in release. |
| Missing required part (`document.xml`)   | Abort `MissingMainDocument`.                                                       | Always emit. |
| Missing optional part                    | Log, continue.                                                                     | Omit when unused; always emit `styles.xml`, `settings.xml`, `fontTable.xml`. |
| Broken relationship (target missing)     | Remove inline reference, log `BrokenRelationship`.                                 | Never emit dangling rels. |
| Circular relationships                   | Detect via DFS with visited set; log `CircularRelationship`; break cycle.          | Never create. |
| Invalid unicode (surrogates, non-characters) | Replace with U+FFFD; log.                                                       | Reject input text; must be valid UTF-16 converted to UTF-8. |
| Huge values (DoS)                        | Clamp: font size ≤ 1638 (half-pt max = 819pt), cell width ≤ page width × 100, numbering restart ≤ 1e9. Log. | Never emit beyond clamps. |
| Zip-slip (path escape)                   | Reject entire package.                                                             | — |
| Zip-bomb (ratio/size)                    | Abort after threshold.                                                             | — |
| Extreme nesting (>1000 element levels)   | Abort with `DepthLimitExceeded`.                                                   | — |
| Token explosion (>10M tokens in one part) | Abort.                                                                            | — |
| Content-types mismatch                   | Log, trust the actual root element name.                                           | Always emit matching Override. |
| Duplicate part                           | Keep first, log subsequent.                                                        | Never emit duplicates. |
| Part not referenced but present          | Keep as-is on round-trip; attach to a "detached parts" bucket for emit.            | — |
| Relationship references unknown type     | Preserve opaquely; do not try to parse target.                                     | — |
| Unknown namespace on a root we recognize | Parse what we recognize; preserve rest as UnknownElement.                          | — |

Every error carries a `DocumentDiagnostic` with `severity`, `code`,
`partName`, `location` (line/col when available), and a suggested fix.

---

## 15. Security

### 15.1 Zip-bomb defense

- Decompressed-size cap (default 512 MB). Streaming accumulator; abort
  mid-extraction when exceeded.
- Per-entry size cap (default 128 MB).
- Ratio guard: abort if `decompressed/compressed > 200` for any entry
  whose compressed size ≥ 1 MB.
- Entry-count cap (default 10 000).
- Path-nesting cap (default 16 segments).

### 15.2 XML external entity (XXE)

- Disable DOCTYPE parsing entirely.
- No `xinclude`.
- No `xml-stylesheet` fetch (we recognize the PI but never act on it).
- No network access during parse under any circumstance.

### 15.3 Relationship target sanitization

- External targets must be URLs with scheme `http`, `https`, `mailto`,
  `file` (file: only when `TargetMode="Internal"` and we never resolve
  it — we just preserve).
- Reject `javascript:`, `data:` (we preserve opaquely if present in
  imported files, but never emit; we also surface a security warning in
  the UI when these are found).
- Internal targets: validate they resolve to actual parts; reject
  dangling.

### 15.4 Macro-free by default

- New documents emit `.docx` (content type without `macroEnabled`).
- `.docm` only allowed when opening an imported macro-enabled document.
- Macros never execute inside our app. We show a non-dismissible
  yellow-banner notice when the document contains `vbaProject.bin`.

### 15.5 Path validation

- Normalize every ZIP entry name (resolve `.`/`..`, collapse slashes).
- Reject: leading `/`, any `..`, absolute paths, paths containing `\`,
  paths with control characters (U+0000–U+001F), reserved Windows names
  (CON, PRN, AUX, NUL, COM1..9, LPT1..9).
- Case sensitivity: ZIP is case-sensitive but OPC content types are
  case-insensitive for part names. Normalize to lower-case for
  deduplication checks; preserve original case on round-trip.

### 15.6 Crypto

- Password-protect: we read Agile Encryption (Word 2010+) and verify
  passwords via [MS-OFFCRYPTO]. We preserve encrypted-package structure
  on write only if password unchanged.
- We do not emit our own newly-encrypted docs in v1. [verify]

---

## 16. Worked examples

### 16.1 Full minimal `document.xml`

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>Hello, world.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:rPr><w:b/><w:color w:val="0070C0"/></w:rPr>
        <w:t xml:space="preserve">Bold blue </w:t>
      </w:r>
      <w:r>
        <w:rPr><w:i/></w:rPr>
        <w:t>italic</w:t>
      </w:r>
      <w:r>
        <w:t>.</w:t>
      </w:r>
    </w:p>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"
               w:header="720" w:footer="720" w:gutter="0"/>
      <w:cols w:space="720"/>
      <w:docGrid w:linePitch="360"/>
    </w:sectPr>
  </w:body>
</w:document>
```

### 16.2 A paragraph with a bulleted list and a footnote

```xml
<w:p>
  <w:pPr>
    <w:pStyle w:val="ListBullet"/>
    <w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>
  </w:pPr>
  <w:r><w:t xml:space="preserve">Item with a footnote</w:t></w:r>
  <w:r>
    <w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr>
    <w:footnoteReference w:id="1"/>
  </w:r>
  <w:r><w:t>.</w:t></w:r>
</w:p>
```

### 16.3 A two-column section with different first-page header

```xml
<w:p>
  <w:pPr>
    <w:sectPr>
      <w:headerReference w:type="first" r:id="rId20"/>
      <w:headerReference w:type="default" r:id="rId21"/>
      <w:footerReference w:type="default" r:id="rId22"/>
      <w:type w:val="nextPage"/>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"
               w:header="720" w:footer="720" w:gutter="0"/>
      <w:cols w:num="2" w:space="720"/>
      <w:titlePg/>
      <w:docGrid w:linePitch="360"/>
    </w:sectPr>
  </w:pPr>
</w:p>
```

### 16.4 A hyperlink (element form)

```xml
<w:p>
  <w:r><w:t xml:space="preserve">Visit </w:t></w:r>
  <w:hyperlink r:id="rId13" w:history="1">
    <w:r>
      <w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr>
      <w:t>our site</w:t>
    </w:r>
  </w:hyperlink>
  <w:r><w:t>.</w:t></w:r>
</w:p>
```

And in `word/_rels/document.xml.rels`:
```xml
<Relationship Id="rId13"
              Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"
              Target="https://example.com/"
              TargetMode="External"/>
```

### 16.5 A table with merged cells

```xml
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="5000" w:type="pct"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:color="auto"/>
      <w:left w:val="single" w:sz="4" w:color="auto"/>
      <w:bottom w:val="single" w:sz="4" w:color="auto"/>
      <w:right w:val="single" w:sz="4" w:color="auto"/>
      <w:insideH w:val="single" w:sz="4" w:color="auto"/>
      <w:insideV w:val="single" w:sz="4" w:color="auto"/>
    </w:tblBorders>
  </w:tblPr>
  <w:tblGrid>
    <w:gridCol w:w="2500"/>
    <w:gridCol w:w="2500"/>
    <w:gridCol w:w="2500"/>
  </w:tblGrid>
  <w:tr>
    <w:tc>
      <w:tcPr>
        <w:tcW w:w="5000" w:type="dxa"/>
        <w:gridSpan w:val="2"/>
      </w:tcPr>
      <w:p><w:r><w:t>Spanning two columns</w:t></w:r></w:p>
    </w:tc>
    <w:tc>
      <w:tcPr>
        <w:tcW w:w="2500" w:type="dxa"/>
        <w:vMerge w:val="restart"/>
      </w:tcPr>
      <w:p><w:r><w:t>Spanning two rows</w:t></w:r></w:p>
    </w:tc>
  </w:tr>
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="2500" w:type="dxa"/></w:tcPr><w:p/></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="2500" w:type="dxa"/></w:tcPr><w:p/></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="2500" w:type="dxa"/><w:vMerge/></w:tcPr><w:p/></w:tc>
  </w:tr>
</w:tbl>
```

### 16.6 Tracked insert and delete in the same paragraph

```xml
<w:p>
  <w:r><w:t xml:space="preserve">The quick </w:t></w:r>
  <w:del w:id="10" w:author="Jon" w:date="2026-04-17T10:00:00Z">
    <w:r><w:delText xml:space="preserve">brown </w:delText></w:r>
  </w:del>
  <w:ins w:id="11" w:author="Jon" w:date="2026-04-17T10:01:00Z">
    <w:r><w:t xml:space="preserve">red </w:t></w:r>
  </w:ins>
  <w:r><w:t>fox.</w:t></w:r>
</w:p>
```

### 16.7 A bookmark around a phrase

```xml
<w:p>
  <w:r><w:t xml:space="preserve">Go to </w:t></w:r>
  <w:bookmarkStart w:id="3" w:name="Destination"/>
  <w:r><w:t>this point</w:t></w:r>
  <w:bookmarkEnd w:id="3"/>
  <w:r><w:t>.</w:t></w:r>
</w:p>
```

### 16.8 A PAGE field inside a footer

```xml
<!-- word/footer1.xml -->
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr>
      <w:pStyle w:val="Footer"/>
      <w:jc w:val="center"/>
    </w:pPr>
    <w:r><w:t xml:space="preserve">Page </w:t></w:r>
    <w:fldSimple w:instr="PAGE \* Arabic \* MERGEFORMAT">
      <w:r><w:t>1</w:t></w:r>
    </w:fldSimple>
    <w:r><w:t xml:space="preserve"> of </w:t></w:r>
    <w:fldSimple w:instr="NUMPAGES \* Arabic \* MERGEFORMAT">
      <w:r><w:t>1</w:t></w:r>
    </w:fldSimple>
  </w:p>
</w:ftr>
```

### 16.9 A comment with a range

```xml
<!-- document.xml -->
<w:p>
  <w:commentRangeStart w:id="0"/>
  <w:r><w:t>Please revise this sentence.</w:t></w:r>
  <w:commentRangeEnd w:id="0"/>
  <w:r>
    <w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>
    <w:commentReference w:id="0"/>
  </w:r>
</w:p>
```

### 16.10 A drop-cap frame (Word 95 style)

```xml
<w:p>
  <w:pPr>
    <w:framePr w:dropCap="drop" w:lines="3" w:hSpace="0" w:vSpace="0"
               w:wrap="around" w:vAnchor="text" w:hAnchor="text"/>
    <w:spacing w:line="360" w:lineRule="exact"/>
    <w:rPr><w:position w:val="-12"/><w:sz w:val="120"/></w:rPr>
  </w:pPr>
  <w:r>
    <w:rPr><w:position w:val="-12"/><w:sz w:val="120"/></w:rPr>
    <w:t>T</w:t>
  </w:r>
</w:p>
<w:p>
  <w:r><w:t>he rest of the paragraph flows around the dropped T.</w:t></w:r>
</w:p>
```

### 16.11 A complex TOC field

```xml
<w:p>
  <w:pPr><w:pStyle w:val="TOCHeading"/></w:pPr>
  <w:r><w:t>Table of Contents</w:t></w:r>
</w:p>
<w:p>
  <w:pPr><w:pStyle w:val="TOC1"/></w:pPr>
  <w:r><w:fldChar w:fldCharType="begin"/></w:r>
  <w:r><w:instrText xml:space="preserve">TOC \o "1-3" \h \z \u</w:instrText></w:r>
  <w:r><w:fldChar w:fldCharType="separate"/></w:r>
  <w:hyperlink w:anchor="_Toc101" w:history="1">
    <w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>Introduction</w:t></w:r>
    <w:r><w:tab/></w:r>
    <w:r>
      <w:fldChar w:fldCharType="begin"/>
      <w:instrText xml:space="preserve">PAGEREF _Toc101 \h</w:instrText>
      <w:fldChar w:fldCharType="separate"/>
      <w:t>1</w:t>
      <w:fldChar w:fldCharType="end"/>
    </w:r>
  </w:hyperlink>
  <w:r><w:fldChar w:fldCharType="end"/></w:r>
</w:p>
```

(Note the nested complex field inside a complex field — this is legal
and Word frequently emits it for TOC entries.)

### 16.12 A form-protected section with a text field

```xml
<w:sectPr>
  <w:formProt w:val="true"/>
  <w:type w:val="continuous"/>
  <w:pgSz w:w="12240" w:h="15840"/>
  <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"
           w:header="720" w:footer="720" w:gutter="0"/>
</w:sectPr>
```

and the form field as in §5.19.

### 16.13 A DrawingML rounded rectangle with VML fallback

See §5.17.

### 16.14 OLE object (equation)

See §5.18.

### 16.15 A tab with leader

```xml
<w:p>
  <w:pPr>
    <w:tabs>
      <w:tab w:val="right" w:leader="dot" w:pos="9360"/>
    </w:tabs>
  </w:pPr>
  <w:r><w:t>Chapter 1</w:t></w:r>
  <w:r><w:tab/></w:r>
  <w:r><w:t>1</w:t></w:r>
</w:p>
```

### 16.16 A page number with suppression for the first page

```xml
<w:sectPr>
  <w:footerReference w:type="default" r:id="rId22"/>
  <w:footerReference w:type="first" r:id="rId23"/>
  <w:titlePg/>
  <!-- ... -->
</w:sectPr>
```

`footer1.xml` shows `PAGE` field; `footer_first.xml` is empty.

### 16.17 Embedded image with alt text

See §5.16. `wp:docPr@descr` holds alt text (accessibility).

### 16.18 Paragraph with border and shading

```xml
<w:p>
  <w:pPr>
    <w:pBdr>
      <w:top    w:val="single" w:sz="4"  w:space="1" w:color="auto"/>
      <w:left   w:val="single" w:sz="4"  w:space="4" w:color="auto"/>
      <w:bottom w:val="single" w:sz="4"  w:space="1" w:color="auto"/>
      <w:right  w:val="single" w:sz="4"  w:space="4" w:color="auto"/>
    </w:pBdr>
    <w:shd w:val="clear" w:color="auto" w:fill="FFFFCC"/>
  </w:pPr>
  <w:r><w:t>Bordered paragraph with yellow shading.</w:t></w:r>
</w:p>
```

### 16.19 Complete `docProps/core.xml`

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
                   xmlns:dc="http://purl.org/dc/elements/1.1/"
                   xmlns:dcterms="http://purl.org/dc/terms/"
                   xmlns:dcmitype="http://purl.org/dc/dcmitype/"
                   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Example</dc:title>
  <dc:subject>Spec example</dc:subject>
  <dc:creator>Jon Bell</dc:creator>
  <cp:keywords>word, docx</cp:keywords>
  <dc:description>Demo document.</dc:description>
  <cp:lastModifiedBy>Jon Bell</cp:lastModifiedBy>
  <cp:revision>2</cp:revision>
  <dcterms:created xsi:type="dcterms:W3CDTF">2026-04-17T00:00:00Z</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">2026-04-17T00:00:00Z</dcterms:modified>
</cp:coreProperties>
```

### 16.20 Complete `docProps/app.xml`

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
            xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>WordJB</Application>
  <AppVersion>1.0.0</AppVersion>
  <Template>Normal.dotm</Template>
  <TotalTime>0</TotalTime>
  <Pages>1</Pages>
  <Words>12</Words>
  <Characters>60</Characters>
  <CharactersWithSpaces>72</CharactersWithSpaces>
  <Lines>1</Lines>
  <Paragraphs>1</Paragraphs>
  <Company>Jon Bell</Company>
  <DocSecurity>0</DocSecurity>
  <HyperlinksChanged>false</HyperlinksChanged>
  <LinksUpToDate>false</LinksUpToDate>
  <ScaleCrop>false</ScaleCrop>
  <SharedDoc>false</SharedDoc>
  <HeadingPairs>
    <vt:vector size="2" baseType="variant">
      <vt:variant><vt:lpstr>Title</vt:lpstr></vt:variant>
      <vt:variant><vt:i4>1</vt:i4></vt:variant>
    </vt:vector>
  </HeadingPairs>
  <TitlesOfParts>
    <vt:vector size="1" baseType="lpstr">
      <vt:lpstr>Example</vt:lpstr>
    </vt:vector>
  </TitlesOfParts>
</Properties>
```

### 16.21 Complete `settings.xml` for a Word 95-era document

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:zoom w:percent="100"/>
  <w:defaultTabStop w:val="720"/>
  <w:characterSpacingControl w:val="doNotCompress"/>
  <w:footnotePr>
    <w:footnote w:id="-1"/>
    <w:footnote w:id="0"/>
  </w:footnotePr>
  <w:endnotePr>
    <w:endnote w:id="-1"/>
    <w:endnote w:id="0"/>
  </w:endnotePr>
  <w:evenAndOddHeaders w:val="false"/>
  <w:compat>
    <w:spacingInWholePoints/>
    <w:noLeading/>
    <w:autoSpaceLikeWord95/>
    <w:lineWrapLikeWord6/>
    <w:truncateFontHeightsLikeWP6/>
    <w:useWord97LineBreakRules/>
    <w:doNotExpandShiftReturn/>
    <w:splitPgBreakAndParaMark/>
    <w:footnoteLayoutLikeWW8/>
    <w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="11"/>
  </w:compat>
</w:settings>
```

---

## 17. Transitional vs Strict differences

The few differences that matter to us:

| Concern                              | Transitional                                                  | Strict                                                            |
|--------------------------------------|---------------------------------------------------------------|-------------------------------------------------------------------|
| VML (`v:`, `o:`, `w10:`)             | Allowed, as fallback or primary.                              | Banned entirely. Must use DrawingML or omit.                      |
| `w:pict` element                     | Allowed (wraps VML).                                          | Not allowed.                                                      |
| `mc:AlternateContent` with VML fallback | Allowed.                                                    | Not allowed (no VML).                                             |
| `w:fldSimple`                        | Allowed.                                                      | Not allowed — all fields must be complex.                         |
| `w:noProof` and spelling toggles     | Allowed.                                                      | Same.                                                             |
| Legacy compat flags (Word 6/95-era)  | Allowed, many.                                                | Many removed; only "modern" set remains.                          |
| `w:compatSetting@uri` values         | Must be a canonical set but w:name unchecked.                 | Stricter validation.                                              |
| Deprecated font-scheme attributes    | Accepted.                                                     | Rejected.                                                         |
| Namespace URIs for core parts        | Same (`...2006/main`).                                        | Strict uses `...2006/main` for WordprocessingML; the transitional vs strict distinction is inside schemas, not root namespace. |
| Content type of main document        | `...document.main+xml`                                        | Same (the CT does not encode Transitional vs Strict; conformance class is declared via schemas used).                    |

**Our target.** Transitional, Section 4 compliance class W3ML. We emit
legal Transitional markup only. We accept Strict on read by mapping it
into our Transitional-capable model (no normalization needed — Strict is
a subset).

---

## 18. `docProps` details

### 18.1 `core.xml`

Uses Dublin Core. Common properties: `dc:creator`, `dc:title`,
`dc:subject`, `cp:keywords`, `dc:description`, `cp:category`,
`cp:contentStatus`, `cp:lastModifiedBy`, `cp:revision`, `cp:version`,
`cp:lastPrinted`, `dcterms:created`, `dcterms:modified`.

Dates are W3CDTF (`xsi:type="dcterms:W3CDTF"`). We always emit Z-suffixed
UTC.

### 18.2 `app.xml`

Extended properties: `Application`, `AppVersion`, `Template`,
`TotalTime` (minutes edited), `Pages`, `Words`, `Characters`,
`CharactersWithSpaces`, `Lines`, `Paragraphs`, `Company`, `Manager`,
`DocSecurity` (0-8 bitmask), `LinksUpToDate`, `ScaleCrop`, `SharedDoc`,
`HyperlinksChanged`, `HeadingPairs`, `TitlesOfParts`.

`DocSecurity` values:
- 0: none
- 1: password-protected
- 2: read-only recommended
- 4: read-only enforced
- 8: locked for annotations

### 18.3 `custom.xml`

User-defined KV pairs with typed values (vt:lpwstr, vt:i4, vt:bool,
vt:filetime, vt:decimal, vt:r8, etc.).

```xml
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties"
            xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="Project">
    <vt:lpwstr>WordJB</vt:lpwstr>
  </property>
  <property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="3" name="Reviewed">
    <vt:bool>true</vt:bool>
  </property>
</Properties>
```

`fmtid` is fixed to `{D5CDD505-2E9C-101B-9397-08002B2CF9AE}` for
document-scoped customs. `pid` starts at 2 and increments.

---

## 19. Settings and theme interactions

### 19.1 Theme

`word/theme/theme1.xml` is DrawingML theme data: font and color
schemes. Referenced by `a:fontScheme`-aware attributes and by
`w:rFonts@w:asciiTheme="minorHAnsi"` etc.

Minimal theme our writer emits:

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office">
  <a:themeElements>
    <a:clrScheme name="Office">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="44546A"/></a:dk2>
      <a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
      <a:accent1><a:srgbClr val="4472C4"/></a:accent1>
      <a:accent2><a:srgbClr val="ED7D31"/></a:accent2>
      <a:accent3><a:srgbClr val="A5A56C"/></a:accent3>
      <a:accent4><a:srgbClr val="FFC000"/></a:accent4>
      <a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>
      <a:accent6><a:srgbClr val="70AD47"/></a:accent6>
      <a:hlink><a:srgbClr val="0563C1"/></a:hlink>
      <a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Office">
      <a:majorFont>
        <a:latin typeface="Calibri Light"/>
        <a:ea typeface=""/>
        <a:cs typeface=""/>
      </a:majorFont>
      <a:minorFont>
        <a:latin typeface="Calibri"/>
        <a:ea typeface=""/>
        <a:cs typeface=""/>
      </a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Office">
      <a:fillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:gradFill rotWithShape="1">
          <a:gsLst>
            <a:gs pos="0"><a:schemeClr val="phClr"><a:lumMod val="110000"/></a:schemeClr></a:gs>
          </a:gsLst>
          <a:lin ang="5400000" scaled="0"/>
        </a:gradFill>
        <a:gradFill rotWithShape="1">
          <a:gsLst>
            <a:gs pos="0"><a:schemeClr val="phClr"/></a:gs>
          </a:gsLst>
          <a:lin ang="5400000" scaled="0"/>
        </a:gradFill>
      </a:fillStyleLst>
      <a:lnStyleLst>
        <a:ln w="6350" cap="flat" cmpd="sng" algn="ctr">
          <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
          <a:prstDash val="solid"/>
        </a:ln>
        <a:ln w="12700" cap="flat" cmpd="sng" algn="ctr">
          <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
          <a:prstDash val="solid"/>
        </a:ln>
        <a:ln w="19050" cap="flat" cmpd="sng" algn="ctr">
          <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
          <a:prstDash val="solid"/>
        </a:ln>
      </a:lnStyleLst>
      <a:effectStyleLst>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
      </a:effectStyleLst>
      <a:bgFillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
      </a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>
```

Word 95-origin documents don't use theme-referenced fonts; we still emit
a minimal theme so Word opens without warnings.

### 19.2 `fontTable.xml`

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:font w:name="Times New Roman">
    <w:panose1 w:val="02020603050405020304"/>
    <w:charset w:val="00"/>
    <w:family w:val="roman"/>
    <w:pitch w:val="variable"/>
    <w:sig w:usb0="E0002EFF" w:usb1="C000785B" w:usb2="00000009"
           w:usb3="00000000" w:csb0="000001FF" w:csb1="00000000"/>
  </w:font>
  <w:font w:name="Arial">
    <w:panose1 w:val="020B0604020202020204"/>
    <w:charset w:val="00"/>
    <w:family w:val="swiss"/>
    <w:pitch w:val="variable"/>
    <w:sig w:usb0="E0002EFF" w:usb1="C000785B" w:usb2="00000009"
           w:usb3="00000000" w:csb0="000001FF" w:csb1="00000000"/>
  </w:font>
  <w:font w:name="Symbol">
    <w:panose1 w:val="05050102010706020507"/>
    <w:charset w:val="02"/>
    <w:family w:val="roman"/>
    <w:pitch w:val="variable"/>
    <w:sig w:usb0="00000000" w:usb1="10000000" w:usb2="00000000"
           w:usb3="00000000" w:csb0="80000000" w:csb1="00000000"/>
  </w:font>
</w:fonts>
```

`w:family`: `roman`, `swiss`, `modern`, `script`, `decorative`, `auto`.
`w:pitch`: `fixed`, `variable`, `default`.
`w:sig`: Unicode/codepage coverage bitmasks (from the font's OS/2 table).
Word uses these to pick substitutes.

Font embedding (optional): `w:embedRegular`, `w:embedBold`,
`w:embedItalic`, `w:embedBoldItalic` each reference a subsetted `.ttf`
part via `r:id`. We do not emit embedded fonts in v1.

### 19.3 `webSettings.xml`

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:webSettings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:optimizeForBrowser/>
  <w:relyOnVML/>
  <w:allowPNG/>
  <w:doNotRelyOnCSS/>
  <w:doNotUseLongFileNames/>
  <w:pixelsPerInch w:val="96"/>
</w:webSettings>
```

Preserve; we don't implement HTML export in v1 but we keep the settings
round-tripping.

---

## 20. Schema reference snapshots

Below are abridged versions of the key complex types we implement (not
the full XSDs — pin to `vendor/ecma-376/` for authoritative definitions).

### 20.1 `CT_Document`

```
CT_Document := (
  w:background?,
  w:body
)
attrs:
  w:conformance = transitional | strict
```

### 20.2 `CT_Body`

```
CT_Body := (
  BlockLevelElts*,
  w:sectPr?
)

BlockLevelElts := w:p | w:tbl | w:customXml | w:sdt | w:bookmarkStart | w:bookmarkEnd | w:moveFromRangeStart | ... | mc:AlternateContent
```

### 20.3 `CT_P` (paragraph)

```
CT_P := (
  w:pPr?,
  ParagraphContent*
)

ParagraphContent := w:r | w:hyperlink | w:fldSimple | w:customXml | w:sdt
                  | w:bookmarkStart | w:bookmarkEnd
                  | w:commentRangeStart | w:commentRangeEnd
                  | w:permStart | w:permEnd
                  | w:ins | w:del | w:moveFrom | w:moveTo
                  | w:proofErr | w:oMath | w:oMathPara
                  | mc:AlternateContent | ...
attrs:
  w:rsidR, w:rsidDel, w:rsidP, w:rsidRDefault, w:rsidRPr
  w14:paraId, w14:textId (Word 2010+)
```

### 20.4 `CT_R` (run)

```
CT_R := (
  w:rPr?,
  RunContent*
)

RunContent := w:t | w:delText | w:instrText | w:delInstrText
            | w:noBreakHyphen | w:softHyphen | w:dayShort | ...
            | w:br | w:tab | w:cr
            | w:sym | w:pgNum | w:yearLong | ...
            | w:fldChar | w:drawing | w:object | w:pict
            | w:footnoteReference | w:endnoteReference
            | w:footnoteRef | w:endnoteRef
            | w:separator | w:continuationSeparator
            | w:annotationRef | w:commentReference
            | w:ruby | w:ptab | mc:AlternateContent
attrs:
  w:rsidR, w:rsidDel, w:rsidRPr
```

### 20.5 `CT_Tbl`

```
CT_Tbl := (
  w:tblPr,
  w:tblGrid,
  (w:tr | w:customXml | w:sdt | w:bookmarkStart | w:bookmarkEnd | ...
  | w:ins | w:del | mc:AlternateContent)*
)
```

### 20.6 `CT_SectPr`

```
CT_SectPr := (
  (w:headerReference | w:footerReference)*,
  w:footnotePr?,
  w:endnotePr?,
  w:type?,
  w:pgSz?,
  w:pgMar?,
  w:paperSrc?,
  w:pgBorders?,
  w:lnNumType?,
  w:pgNumType?,
  w:cols?,
  w:formProt?,
  w:vAlign?,
  w:noEndnote?,
  w:titlePg?,
  w:textDirection?,
  w:bidi?,
  w:rtlGutter?,
  w:docGrid?,
  w:printerSettings?,
  w:sectPrChange?
)
attrs:
  w:rsidR, w:rsidDel, w:rsidRPr, w:rsidSect
```

### 20.7 `CT_Style`

```
CT_Style := (
  w:name?,
  w:aliases?,
  w:basedOn?,
  w:next?,
  w:link?,
  w:autoRedefine?,
  w:hidden?,
  w:uiPriority?,
  w:semiHidden?,
  w:unhideWhenUsed?,
  w:qFormat?,
  w:locked?,
  w:personal?,
  w:personalCompose?,
  w:personalReply?,
  w:rsid?,
  w:pPr?,
  w:rPr?,
  w:tblPr?,
  w:trPr?,
  w:tcPr?,
  w:tblStylePr*
)
attrs:
  w:type = paragraph | character | table | numbering
  w:styleId (ST_String)
  w:default (ST_OnOff)
  w:customStyle (ST_OnOff)
```

### 20.8 `CT_AbstractNum` / `CT_Num`

```
CT_AbstractNum := (
  w:nsid?,
  w:multiLevelType?,
  w:tmpl?,
  w:name?,
  w:styleLink?,
  w:numStyleLink?,
  w:lvl{1,9}
)
attrs:
  w:abstractNumId (int)
  w15:restartNumberingAfterBreak?

CT_Num := (
  w:abstractNumId,
  w:lvlOverride*
)
attrs:
  w:numId (int)
```

---

## 21. Detailed element reference (additional notable items)

### 21.1 `w:sym` — symbol

```xml
<w:r>
  <w:sym w:font="Symbol" w:char="F0B1"/>
</w:r>
```

Renders U+F0B1 from Symbol font (→ ± in Symbol's mapping). For Unicode
symbols, prefer a normal `w:t` with the character.

### 21.2 `w:noBreakHyphen`, `w:softHyphen`

```xml
<w:r><w:t>non</w:t><w:noBreakHyphen/><w:t>breaking</w:t></w:r>
<w:r><w:t>optional</w:t><w:softHyphen/><w:t>break</w:t></w:r>
```

U+2011 and U+00AD in text content also work; we prefer the elements in
output for clarity.

### 21.3 `w:cr`, `w:tab`, `w:br`

- `w:cr` — end-of-line (carriage return).
- `w:tab` — horizontal tab.
- `w:br` — soft line break (`w:type` omitted), page break, column break,
  or text-wrap break.

### 21.4 `w:ruby` — ruby text (Asian pronunciation annotation)

```xml
<w:r>
  <w:ruby>
    <w:rubyPr>
      <w:rubyAlign w:val="distributeSpace"/>
      <w:hps w:val="10"/>
      <w:hpsRaise w:val="18"/>
      <w:hpsBaseText w:val="24"/>
      <w:lid w:val="ja-JP"/>
    </w:rubyPr>
    <w:rt><w:r><w:t>かん</w:t></w:r></w:rt>
    <w:rubyBase><w:r><w:t>漢</w:t></w:r></w:rubyBase>
  </w:ruby>
</w:r>
```

Word 95 did not support ruby; preserve on round-trip.

### 21.5 `w:sdt` — Structured Document Tags (content controls)

Word 2007+ content controls. Word 95 had no equivalent. Round-trip on
read; we do not author new `w:sdt` in v1 beyond what form-field
migrations produce.

### 21.6 `w:proofErr` — proofing-error markers

```xml
<w:proofErr w:type="spellStart"/>
<w:r><w:t>teh</w:t></w:r>
<w:proofErr w:type="spellEnd"/>
```

Types: `spellStart`, `spellEnd`, `gramStart`, `gramEnd`.
Non-persistent in principle; Word recomputes. We preserve on round-trip;
strip before emit if our spellchecker has rescanned.

### 21.7 `w:permStart` / `w:permEnd` — editable regions

For protected-section edit permissions, references user/group id.

### 21.8 `w:customXml` — custom XML markup

```xml
<w:customXml w:uri="urn:example" w:element="para" w:id="1">
  <w:customXmlPr>
    <w:attr w:uri="urn:example" w:name="class" w:val="note"/>
  </w:customXmlPr>
  <w:p><w:r><w:t>Custom-marked paragraph.</w:t></w:r></w:p>
</w:customXml>
```

Preserve as-is; ignore semantics.

### 21.9 `w:drawing` — see §5.16.

### 21.10 `w:object` — see §5.18.

### 21.11 `w:pict` — legacy drawing container (Transitional only)

Contents: VML (`v:`).

---

## 22. ID and cross-reference conventions

| Kind                              | Attribute            | Allocator policy                                                   |
|-----------------------------------|----------------------|--------------------------------------------------------------------|
| Relationships                     | `@Id`                | `rId{n}` sequential per rels file.                                  |
| Bookmark                          | `@w:id`              | Sequential non-negative int per document. `_GoBack` etc. are names, still with id. |
| Comment                           | `@w:id`              | Sequential non-negative int per document.                           |
| Footnote/endnote                  | `@w:id`              | Sequential int. `-1` separator, `0` continuation separator.         |
| Revision (`w:ins`/`w:del`/etc.)   | `@w:id`              | Sequential int per document.                                        |
| Paragraph rsid                    | `@w:rsidR` etc.      | Hex, 8 chars; we emit deterministic values.                         |
| `w14:paraId` / `w14:textId`       | attribute            | 8 hex chars. Seeded PRNG per document.                              |
| DrawingML `docPr@id`              | attribute            | Sequential positive int per document.                               |
| DrawingML `cNvPr@id`              | attribute            | Sequential positive int per document.                               |
| `w:abstractNumId` / `w:numId`     | attribute            | Sequential int per doc; independent counters.                       |
| Style id                          | `@w:styleId`         | Canonical name → styleId transform (see §6).                        |
| OLE ObjectID                      | `@ObjectID`          | `_{digits}` (we mint deterministic decimals).                       |
| VML shape id                      | `@id`                | `_x0000_i{kind}{n}` (Word's pattern). Preserve on round-trip.       |

---

## 23. Field code reference (selected)

Fields are text streams with a short syntax. Common switches:
- `\* MERGEFORMAT` — preserve formatting on update
- `\* Upper`, `\* Lower`, `\* Caps`, `\* FirstCap` — case
- `\* Arabic`, `\* Roman`, `\* alphabetic`, `\* ordinal`, etc. — number fmt
- `\@ "format"` — date/time format string
- `\# "format"` — numeric format string
- `\h` — insert hyperlink
- `\f`, `\l` — flag switches

We implement a field engine that recognizes and computes:
- `PAGE`, `NUMPAGES`, `SECTION`, `SECTIONPAGES`
- `DATE`, `TIME`, `CREATEDATE`, `SAVEDATE`, `PRINTDATE`
- `AUTHOR`, `TITLE`, `SUBJECT`, `KEYWORDS`, `FILENAME`, `FILESIZE`,
  `DOCPROPERTY`
- `TOC`, `TOA`, `TOF`, `XE`, `TC`
- `SEQ`
- `REF`, `PAGEREF`, `STYLEREF`, `NOTEREF`
- `HYPERLINK`
- `MERGEFIELD` (display of merge-field name only; we do not implement
  data-source binding in v1)
- `FORMTEXT`, `FORMCHECKBOX`, `FORMDROPDOWN`
- `IF`, `=`  (simple expressions)
- `SYMBOL`, `LISTNUM`, `GOTOBUTTON`, `MACROBUTTON` (button text only)

Unrecognized fields are preserved verbatim; the displayed "result" runs
are preserved, and we do not attempt to update.

---

## 24. East-Asian / bidi concerns

Even though Word 95 was predominantly Latin-first, the OOXML constructs
we must read/write include:

- `w:rFonts@w:eastAsia` / `w:hint="eastAsia"` slot selection.
- `w:bidi` in `w:pPr` (RTL paragraph direction).
- `w:rtl`, `w:cs` toggles in `w:rPr` (RTL + complex-script direction).
- `w:lang@w:val`, `@w:eastAsia`, `@w:bidi` slots.
- `w:docGrid@w:type`, `@w:linePitch`, `@w:charSpace`.
- Asian number formats in `w:numFmt`: `japaneseCounting`, `aiueo`,
  `hindiNumbers`, `thaiCounting`, many more.

Preserve and render when present; our UI need not offer all variants.

---

## 25. [verify] collected

1. Exact [MS-DOCX] revision to pin.
2. BOM policy for `.rels` parts — current Word output.
3. `w16se` / `w16cid` namespace URIs — confirm against latest
   [MS-DOCX] / Office 365 output.
4. `mo:` namespace URI — Mac Office 2008 sources vary.
5. Whether Word 95 ever emitted Word 97+ compat flags (for the one case
   we'd encounter a genuine WD95-only DOCX, which only arises via
   conversion anyway).
6. Agile Encryption emission policy in v1.

---

## 26. Test fixture plan (summary; detail lives in test spec)

- `minimal.docx` — smallest valid doc.
- `hello-styled.docx` — Normal + a Heading1.
- `lists.docx` — bulleted + numbered + multi-level.
- `table-basic.docx`, `table-merged.docx`, `table-nested.docx`,
  `table-borders-shading.docx`.
- `sections-columns.docx`, `sections-mixed-orient.docx`.
- `hdr-ftr.docx`, `hdr-ftr-first-even.docx`.
- `footnote-endnote.docx`.
- `comments-basic.docx`, `comments-threaded.docx`.
- `fields-basic.docx`, `fields-toc.docx`, `fields-nested.docx`.
- `hyperlinks-element.docx`, `hyperlinks-field.docx`.
- `bookmarks.docx`.
- `images-inline.docx`, `images-anchor-wrap.docx`, `images-vml.docx`.
- `shapes-drawingml.docx`, `shapes-vml.docx`.
- `ole-equation.docx`, `ole-worksheet.docx`.
- `form-fields.docx`.
- `frames.docx`, `dropcap.docx`.
- `revisions.docx` (ins, del, rPrChange, pPrChange).
- `protection-readonly.docx`, `protection-forms.docx`.
- `autotext.docx` (glossary).
- `vba.docm` (round-trip opaque).
- `math-omml.docx`, `math-ee1x-ole.docx`.
- `compat-word95.docx` with all relevant flags.
- `ea-bidi.docx` with Asian/RTL mixed.
- `corrupt-zip.docx`, `corrupt-xml.docx`, `zip-slip.docx`, `zip-bomb.docx`,
  `xxe.docx`, `broken-rels.docx` — defensive cases.
- `strict.docx` — a Strict conformance sample (read-only test).

Every fixture has a golden normalized-output file (`.golden.xml` per
part) used by the round-trip tests (see §7.5).

---

## 27. File paths (internal)

- Spec (this file): `/home/jon/word/docs/requirements/docx-format.md`
- Vendor schemas: `/home/jon/word/vendor/ecma-376/`, `/home/jon/word/vendor/opc/`
- MS-DOCX pin: `/home/jon/word/docs/specs/ms-docx-rev.txt`
- Parser: `/home/jon/word/src/parse/`
- Serializer: `/home/jon/word/src/serialize/`
- Model: `/home/jon/word/src/model/`
- Validator: `/home/jon/word/src/validate/`
- Fixtures: `/home/jon/word/test/fixtures/docx/`
- Round-trip tests: `/home/jon/word/src/serialize/__tests__/round-trip.test.ts`
- Toggle tests: `/home/jon/word/src/model/__tests__/rpr-toggle.test.ts`

---

## 28. Checklist for implementers

For each Word 95 feature we ship, the implementer confirms:

1. The feature's OOXML element(s) parse into the model.
2. The model serializes back to canonical OOXML.
3. `round-trip` test fixture exists and passes.
4. Validator (dev mode) accepts the output.
5. Unknown siblings are preserved across parse→emit.
6. The compat flag(s) this feature depends on are correctly read.
7. Error modes listed in §14 are handled (fuzz or golden tests).
8. Security: input does not allow XXE, zip-slip, or uncapped size.
9. ID allocation is deterministic (test harness seeds PRNG).
10. Canonical element/attribute ordering is enforced by writer.

---

## 29. Open questions / parking lot

- Do we emit `w14:paraId`/`w14:textId` on every paragraph unconditionally
  (matching Word) or only when tracked-change identity is needed? Leaning
  "unconditionally" to minimize diff noise against Word output.
- How aggressive is our Strict-on-read normalization? Leaning "minimal":
  swap `w:fldSimple` for complex-field sequences; accept remainder as-is.
- Do we round-trip `mc:Ignorable` additions verbatim, or recompute them
  based on our actual usage? Leaning "recompute": guarantees correctness
  even when callers mutate the tree without tracking.
- For glossary documents whose entries reference styles not in the main
  document: do we merge on read or keep the glossary's parallel
  `styles.xml`? Leaning "keep parallel" per spec; we will resolve
  references at insert-time.

---

## 30. Changelog (this spec)

- **v0.1 (2026-04-17)** — Initial draft. Target: ECMA-376 4th Ed.
  Transitional; [MS-DOCX] extensions; Word 95 feature parity. Authored by
  Claude (Opus 4.7) per assignment.
