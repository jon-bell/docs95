# Persistence Layer Architecture

Author: Persistence Architect
Status: Baseline (targeting Word-95 feature parity via DOCX ECMA-376 Transitional)
Scope: DOCX read/write, round-trip fidelity, alternative formats (RTF, TXT, HTML), import adapters (.doc), package layout, module boundaries.

---

## 0. Executive summary

The persistence layer is a sealed, dependency-isolated package (`@word/docx` plus sibling codec packages) that is responsible for _all_ file I/O. Its three goals are, in order:

1. **Bit-preserving round-trip.** A DOCX opened and saved without user edits must be byte-identical, save for the canonical transforms we document in Section 30.
2. **Faithful domain mapping.** Everything Word 95 could express (frames, fields, section properties, numbering, embedded drawings) is lowered from OOXML into a typed domain model without loss of semantically meaningful detail.
3. **Format pluggability.** The domain model is agnostic of OOXML; every I/O format conforms to a single `DocumentSerializer<Format>` port. Adding `.odt` or exporting EPUB later is a new codec module, not a refactor.

The implementation is a two-stage pipeline. On read: `ZIP → OPC → XML parts → AST → Domain`. On write: `Domain → AST → XML parts → OPC → ZIP`. The intermediate AST is faithful to ECMA-376 (each OOXML element type has a node shape) and captures _unknown_ subtrees verbatim for passthrough. The domain layer is the model actually consumed by the renderer, editor, and layout engine; it is smaller and more uniform than the AST.

All code is TypeScript strict mode. No eval, no DOM in the parse path (document parses in a utility process), no runtime schema introspection. ZIP streaming uses `fflate`; XML streaming uses `saxes`. Neither dependency reaches the renderer process; they are wrapped in our own interface surface so a swap is a single PR.

---

## 1. Goals, non-goals, and guiding invariants

### 1.1 Goals

- **Round-trip any DOCX produced by Word 95 (via the official converter), Word 97-2003, Word 2007 SP0+, Word 2016, Word 365, LibreOffice 7.x, Google Docs, Pages, Apple Pages, Apache POI, docx4j, python-docx, OnlyOffice.**
- Round-trip RTF 1.9.1 without losing features we can express.
- Read and write UTF-8/UTF-16 TXT with BOM handling and line-ending normalization.
- Import sanitized HTML fragments (clipboard, Save-as-Web-Page) and export clean HTML5 output.
- Accept `.doc` legacy binaries via an external converter; never parse them in-process.
- Preserve unknown elements verbatim for forward-compat.

### 1.2 Non-goals

- `.doc` binary internals. (We call out to LibreOffice headless or Apache Tika.)
- Live macro execution. `.docm` is read-only; macros round-trip as opaque bytes but are never executed.
- Real-time co-authoring and CRDT persistence (future work).
- Rendering. The persistence layer exposes a `Document` — rendering is a separate concern.

### 1.3 Invariants

- **No information loss on the read path** for any element we recognize.
- **No silent rewrite on the write path.** Every transform is either a no-op, documented in Section 30, or triggered by explicit user edits.
- **No cross-layer imports.** `@word/docx` does not import from `@word/renderer`, `@word/editor`, `@word/ui`, Electron APIs, or Node `fs`. It consumes bytes and produces bytes.
- **Deterministic output.** Given identical input and identical user edits, output bytes are identical (entry order, attribute order, relationship IDs, namespace prefixes).
- **Errors are values, not throws.** Read returns `Result<Document, DocxReadError[]>`. Fatal errors (not-a-zip, not-a-WordprocessingML package) are the only exceptions.

---

## 2. Supported formats

| Format                       | Mode                   | Primary   | Notes                                                                                                                                                  |
| ---------------------------- | ---------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DOCX (ECMA-376 Transitional) | read/write             | yes       | Word 2007+ default. All 37 feature categories covered.                                                                                                 |
| DOTX                         | read/write             | derived   | Template variant of DOCX. Differs in `[Content_Types].xml` override and `app.xml` Template field.                                                      |
| DOCM                         | read-only + round-trip | derived   | Macro-enabled. `vbaProject.bin` and related parts preserved verbatim. We never execute macros. Re-save as `.docm` requires explicit user confirmation. |
| DOTM                         | read-only + round-trip | derived   | Macro-enabled template. Same rules as DOCM.                                                                                                            |
| RTF 1.9.1                    | read/write             | secondary | Separate codec. Pragmatic feature subset, documented.                                                                                                  |
| TXT                          | read/write             | secondary | Encoding detection; line-ending normalization on write.                                                                                                |
| HTML5                        | read/write             | secondary | Sanitized on import. Clean semantic export.                                                                                                            |
| MHTML                        | write (v2)             | optional  | Save as Web Page.                                                                                                                                      |
| `.doc` binary                | read (external)        | adapter   | External converter: LibreOffice headless or Tika. Never parsed in-process.                                                                             |
| ODT (OpenDocument Text)      | planned                | future    | Same `DocumentSerializer` port, separate codec package.                                                                                                |
| EPUB3                        | planned                | future    | Export-only.                                                                                                                                           |

Every format adapter implements the same port:

```ts
export interface DocumentSerializer<FormatTag extends string> {
  readonly format: FormatTag;
  readonly capabilities: SerializerCapabilities;
  read(bytes: Uint8Array, opts?: ReadOptions): Promise<Result<Document, DocReadError[]>>;
  write(doc: Document, opts?: WriteOptions): Promise<Result<Uint8Array, DocWriteError[]>>;
}

export interface SerializerCapabilities {
  readonly reads: boolean;
  readonly writes: boolean;
  readonly preservesUnknown: boolean; // can round-trip opaque elements
  readonly lossyFeatures: ReadonlyArray<FeatureId>; // features this format cannot represent
}
```

No caller of the persistence layer ever instantiates a concrete serializer directly. A `SerializerRegistry` maps MIME types, extensions, and magic bytes to a serializer:

```ts
export interface SerializerRegistry {
  forExtension(ext: string): DocumentSerializer<string> | null;
  forMime(mime: string): DocumentSerializer<string> | null;
  detect(
    bytes: Uint8Array,
    hint?: { ext?: string; mime?: string },
  ): DocumentSerializer<string> | null;
  register<F extends string>(s: DocumentSerializer<F>): void;
}
```

Magic-byte detection lives in `@word/docx/src/detect.ts` and covers: ZIP (0x50 0x4B 0x03 0x04), Compound File Binary for `.doc` (D0 CF 11 E0), RTF (`{\rtf`), UTF-8/16 BOM, and plain ASCII heuristics.

---

## 3. High-level pipeline

### 3.1 Read pipeline (DOCX)

```
 +----------+     +-------+     +-----+     +---------+     +------+     +----------+     +----------+
 | Uint8Array |->| ZIP  |---->| OPC |---->| XML     |---->| AST  |---->| Domain   |---->| Document |
 | (bytes)  |   | demux|     | parts|     | stream  |     | tree |     | mapper   |     | (typed)  |
 +----------+   +------+     +-----+     +---------+     +------+     +----------+     +----------+
                              |                                              |
                              v                                              v
                        Content_Types.xml,                             PreservedExtensions
                        _rels/.rels,                                   (unknown OOXML retained)
                        word/_rels/document.xml.rels
```

### 3.2 Write pipeline (DOCX)

```
 +----------+     +----------+     +------+     +---------+     +-------+     +------+     +----------+
 | Document |---->| Domain   |---->| AST  |---->| XML     |---->| OPC  |---->| ZIP  |---->| Uint8Array |
 | (typed)  |     | demapper |     | tree |     | emitter |     | pack |     | mux  |     | (bytes)  |
 +----------+     +----------+     +------+     +---------+     +-------+     +------+     +----------+
                      |                                              |
                      v                                              v
                 Inject preserved                            Recompute relationship IDs,
                 extensions back into                        Content_Types overrides,
                 AST as opaqueXml nodes                      deterministic entry order
```

### 3.3 Why two stages (AST + Domain)?

A one-stage mapping (parsed XML → domain directly) is tempting but fails three ways:

1. **Unknown elements.** OOXML grows. SmartArt, structured document tags (SDT v2), checkbox content controls, Math Ink, 3D models — these and more did not exist when we wrote the mapper. A one-stage mapping drops what it doesn't know. The AST layer captures them as `unknownChildren`/`unknownAttrs` for bytewise re-emit.
2. **Fidelity gap between AST and Domain.** The AST is where we record sibling ordering of `w:rPr` children, attribute ordering, and canonical whitespace. The Domain doesn't care, but the writer does — the AST is what the writer consumes. If we lowered straight to Domain, we'd lose this on write.
3. **Local format upgrades.** When ECMA-376 Strict becomes a larger market, we add a Strict AST variant and re-use most of the domain mapper. Or we add `.odt`: that codec writes its own AST/IDF, but re-uses the domain.

The AST is not a tree we edit. Editing happens on the Domain. The AST exists only for the brief windows during read (until domain is built) and write (after domain-to-ast lowering).

---

## 4. Module boundaries

```
packages/
  docx/                       # @word/docx — DOCX/DOTX/DOCM
    package.json
    src/
      index.ts                # public API surface
      detect.ts               # magic-byte sniffers
      result.ts               # Result<T, E> helpers
      errors.ts               # DocReadError/DocWriteError hierarchy
      zip/
        index.ts              # ZipReader, ZipWriter
        fflate-reader.ts      # fflate integration (hidden behind ZipReader interface)
        fflate-writer.ts
        defenses.ts           # bomb, traversal, charset normalization
        types.ts
      opc/
        package-reader.ts     # parses [Content_Types].xml and _rels/
        package-writer.ts
        content-types.ts      # map ext/override → MIME
        relationships.ts      # Rel parse/emit
        part.ts               # Part interface
        types.ts
      xml/
        reader.ts             # saxes-based streaming parser
        writer.ts             # hand-written streaming emitter
        dom.ts                # tiny custom DOM for smaller parts
        names.ts              # canonical namespace prefix tables
        entities.ts           # XML-safe escaping
        whitespace.ts         # xml:space="preserve" helpers
      ast/
        index.ts              # AST node type union
        nodes/
          document.ts
          body.ts
          paragraph.ts
          run.ts
          text.ts
          table.ts
          table-row.ts
          table-cell.ts
          section-properties.ts
          drawing.ts
          ole-object.ts
          math.ts
          sdt.ts
          bookmark.ts
          comment-range.ts
          field.ts
          hyperlink.ts
          revision.ts
          numbering.ts
          styles.ts
          settings.ts
          font-table.ts
          theme.ts
          header-footer.ts
          footnote-endnote.ts
          glossary.ts
          unknown.ts          # opaque passthrough
        attrs.ts              # typed attribute decoders
        ids.ts                # ID scoping rules
      reader/
        index.ts              # DocxReader (orchestrator)
        document-reader.ts    # streaming document.xml parser
        styles-reader.ts
        numbering-reader.ts
        settings-reader.ts
        font-table-reader.ts
        theme-reader.ts
        comments-reader.ts
        footnotes-reader.ts
        endnotes-reader.ts
        header-footer-reader.ts
        doc-props-reader.ts
        glossary-reader.ts
      writer/
        index.ts              # DocxWriter (orchestrator)
        document-writer.ts
        styles-writer.ts
        numbering-writer.ts
        settings-writer.ts
        font-table-writer.ts
        theme-writer.ts
        comments-writer.ts
        footnotes-writer.ts
        endnotes-writer.ts
        header-footer-writer.ts
        doc-props-writer.ts
        glossary-writer.ts
        id-allocator.ts       # deterministic relationship/bookmark IDs
      mappers/
        paragraph.ts
        run.ts
        text.ts
        tab-break.ts
        table.ts
        row.ts
        cell.ts
        section.ts
        style.ts
        numbering.ts
        field.ts
        image.ts
        ole.ts
        comment.ts
        revision.ts
        hyperlink.ts
        bookmark.ts
        drawing.ts
        math.ts
        frame.ts
        sdt.ts
      validators/
        ecma-376.ts           # XSD validation in dev builds
        disabled-in-release.ts
      resolve/
        style-chain.ts        # inheritance resolver
        theme-color.ts
        numbering-runtime.ts
      registry/
        index.ts              # serializer registry
      docx-serializer.ts      # DocxSerializer implements DocumentSerializer<'docx'>
    test/
      fixtures/docx/          # git-lfs for binaries
      unit/
      integration/
      property/
      corpus/                 # 5000+ DOCX files

  docx-rtf/                   # @word/docx-rtf — separate codec
    src/
      rtf-reader.ts
      rtf-writer.ts
      control-words.ts
      tables.ts
      images.ts
      fields.ts
      rtf-serializer.ts

  docx-html/                  # @word/docx-html
    src/
      html-reader.ts          # HTML → Document
      html-writer.ts          # Document → HTML
      sanitize.ts             # DOMPurify wrapper
      element-map.ts
      css-parser.ts
      html-serializer.ts

  docx-txt/                   # @word/docx-txt
    src/
      txt-reader.ts
      txt-writer.ts
      encoding.ts             # BOM/heuristic sniffers
      line-endings.ts
      txt-serializer.ts

  docx-converters/            # external adapters
    src/
      libreoffice.ts          # spawn soffice --headless --convert-to
      tika.ts
      detect-tools.ts
      converter.ts            # IConverter interface
```

Every module above is either:

- An interface (`*-reader.ts`, `*-writer.ts`, `*-serializer.ts`) exposing a minimal surface.
- An implementation kept behind the interface so swap is a single file.

The persistence package exposes only:

```ts
export { DocxSerializer } from './docx-serializer';
export type { Document, DocumentNode, Paragraph, Run /* ... */ } from './ast';
export { SerializerRegistry } from './registry';
export type {
  DocumentSerializer,
  SerializerCapabilities,
  ReadOptions,
  WriteOptions,
} from './types';
```

Nothing else is re-exported. Internal paths are not in the `exports` map of `package.json`.

---

## 5. ZIP handling (`src/zip/`)

### 5.1 Library choice

We use `fflate`:

- ~8KB gzipped; fast JS-native DEFLATE.
- Stream API (`Unzip`) supports push-parsing without buffering the full archive.
- TypeScript types included.
- No native dependencies (portable across utility process, worker, web).

Alternatives evaluated:

- `jszip`: convenient but buffers in memory and has higher overhead.
- `zip.js`: good streaming support; heavier. Keeps sync and async paths.
- Node native (`node:zlib`): fine for write; we'd still write our own ZIP framing.

### 5.2 Interface

All `fflate` calls are hidden behind:

```ts
// src/zip/types.ts
export interface ZipReader {
  /** List all entries (headers only). Does not decompress. */
  list(): Promise<ZipEntry[]>;
  /** Fetch uncompressed bytes for one entry by path. */
  read(path: string): Promise<Uint8Array>;
  /** Stream an entry in chunks. Use for large parts (document.xml, media). */
  readStream(path: string): AsyncIterable<Uint8Array>;
  dispose(): void;
}

export interface ZipEntry {
  readonly path: string;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly crc32: number;
  readonly modTime: number; // DOS time (we clamp on write)
  readonly compression: 'store' | 'deflate';
}

export interface ZipWriter {
  /** Add an entry. Bytes are stored as-is (we deflate inside the writer). */
  add(
    path: string,
    bytes: Uint8Array,
    opts?: { compression?: 'store' | 'deflate'; modTime?: number },
  ): void;
  /** Finalize and return the ZIP bytes. */
  finish(): Promise<Uint8Array>;
}
```

`fflate` types never leak out of `src/zip/fflate-*.ts`.

### 5.3 Read strategy

1. Open the archive. Read the central directory only — no content yet.
2. Parse `[Content_Types].xml` and `_rels/.rels` eagerly (small, always needed).
3. Parse `word/_rels/document.xml.rels` eagerly (to know which parts exist).
4. Stream `word/document.xml` on demand — the document reader is a consumer of a push-parser (Section 6).
5. Other parts (styles, numbering, settings, theme, font table, headers, footers, comments, footnotes, endnotes, docProps, glossary, media) are loaded lazily. Many rendering paths don't need comments or endnotes on first paint.

We wrap all byte-returning operations in `DataView`/`Uint8Array`; we never pass around `Buffer` (keeps the package browser-compatible for future embeddings).

### 5.4 Write strategy

1. Accept entries in the order we emit them (deterministic).
2. Compress small rels/Content_Types entries with `deflate`; compress `document.xml` with `deflate`; store media as-is unless they are non-compressed formats where deflate would bloat.
3. DOS timestamps normalized to a configurable epoch (default: 1980-01-01 for deterministic output when the user has not edited content; when user-edited, use real mtime of last edit).
4. Entry order:
   1. `[Content_Types].xml`
   2. `_rels/.rels`
   3. `word/_rels/document.xml.rels`
   4. `word/document.xml`
   5. `word/styles.xml`
   6. `word/numbering.xml`
   7. `word/settings.xml`
   8. `word/webSettings.xml`
   9. `word/fontTable.xml`
   10. `word/theme/theme1.xml`
   11. `word/header*.xml`, `word/footer*.xml`
   12. `word/comments.xml`, `word/commentsExtended.xml`, `word/people.xml`
   13. `word/footnotes.xml`, `word/endnotes.xml`
   14. `word/glossary/document.xml` and glossary rels
   15. `word/embeddings/*`
   16. `word/media/*`
   17. `docProps/core.xml`, `docProps/app.xml`, `docProps/custom.xml`

This matches Word's own output so our output is diff-friendly against Word's.

### 5.5 Defenses (`src/zip/defenses.ts`)

Every ZIP we open goes through these checks _before_ we decompress a byte:

- **Entry count cap.** Default 10000. Configurable via `ReadOptions.limits.maxEntries`.
- **Uncompressed total cap.** Default 2 GiB.
- **Compression ratio cap.** Per entry 200x; if an entry's declared uncompressed size exceeds 200 × compressed size, we reject it (or we truncate and mark the doc as unsafe). Zip bomb defense.
- **Path sanitization.**
  - Reject entries with `..`, absolute paths, backslashes (we normalize to `/` first).
  - Reject entries with embedded NULs.
  - Reject paths not encodable as UTF-8.
  - Reject names that would collide after case-normalization (DOCX part URIs are case-sensitive but Windows filesystems aren't; we never write to disk directly, but some tests do).
- **Charset normalization.** DOCX part URIs are ASCII-only per OPC. We reject non-ASCII. For user data we read inside XML, charset is UTF-8 always.
- **Descriptor handling.** ZIP data descriptors (bit 3 of general purpose flag) are supported; we use `fflate`'s streaming behavior.

When a defense triggers, we produce a `DocReadError` with severity either `fatal` (refuse to open) or `warning` (skip the bad entry, continue). The caller decides on `ReadOptions.onBomb`:

```ts
export type BombPolicy = 'fatal' | 'skip' | 'warn';
```

Default `fatal`.

### 5.6 Concrete TS interface

```ts
// src/zip/index.ts
import { Unzip, UnzipInflate, zip as fflateZip } from 'fflate';

export interface ZipLimits {
  readonly maxEntries: number; // default 10000
  readonly maxUncompressedBytes: number; // default 2 * 1024 * 1024 * 1024
  readonly maxRatio: number; // default 200
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxEntries: 10000,
  maxUncompressedBytes: 2 * 1024 * 1024 * 1024,
  maxRatio: 200,
};

export class ZipReaderImpl implements ZipReader {
  /* hides fflate */
}

export class ZipWriterImpl implements ZipWriter {
  /* hides fflate */
}
```

---

## 6. OPC (Open Packaging Conventions) (`src/opc/`)

### 6.1 What OPC gives us

- `[Content_Types].xml` at package root maps file extensions and specific parts to MIME types.
- `_rels/.rels` at package root: top-level relationships — usually `docProps/core`, `docProps/app`, `word/document`, optionally a custom-properties part.
- `word/_rels/document.xml.rels`: part-level relationships from `document.xml` to everything it references (styles, numbering, settings, fontTable, theme, webSettings, header*, footer*, footnotes, endnotes, comments, glossary, images, hyperlinks, embeddings).
- Each part with outgoing references has its own `<partDir>/_rels/<partName>.rels` (e.g., `word/_rels/header1.xml.rels`).

### 6.2 Part URI

Part URIs are absolute-ish paths inside the ZIP, starting with `/`. We normalize to leading-slash form internally and strip the slash when writing as a ZIP entry.

### 6.3 `PackageReader`

```ts
export interface PackageReader {
  /** Return the MIME type for a part URI (looks at overrides, then extension defaults). */
  contentTypeOf(partUri: string): string | null;
  /** Fetch a part. */
  get(partUri: string): Promise<Part>;
  /** Fetch part-level relationships. */
  rels(partUri: string): Promise<ReadonlyArray<Relationship>>;
  /** Enumerate all part URIs. */
  parts(): ReadonlyArray<string>;
  /** Resolve a relationship target (handles External targets). */
  resolveRel(partUri: string, rel: Relationship): ResolvedRel;
}

export interface Part {
  readonly uri: string;
  readonly contentType: string;
  readonly bytes: Uint8Array;
}

export interface Relationship {
  readonly id: string; // rId1, rId2, ...
  readonly type: string; // http://schemas.openxmlformats.org/officeDocument/2006/relationships/image
  readonly target: string; // relative URI, or absolute URL when External
  readonly targetMode: 'Internal' | 'External';
}

export type ResolvedRel =
  | { mode: 'Internal'; partUri: string; rel: Relationship }
  | { mode: 'External'; url: string; rel: Relationship };
```

### 6.4 `PackageWriter`

```ts
export interface PackageWriter {
  /** Register the part's MIME; may update Content_Types overrides. */
  addPart(partUri: string, bytes: Uint8Array, contentType: string): void;
  /** Add a part-level relationship. Allocates an id if none provided. */
  addRel(ownerPartUri: string, rel: Omit<Relationship, 'id'> & { id?: string }): string;
  /** Emit the full ZIP bytes. */
  finish(): Promise<Uint8Array>;
}
```

Internally the writer batches relationships, writes `_rels` files last, and serializes `[Content_Types].xml` with deterministic attribute order.

### 6.5 Relationship types we care about

| Purpose                | Type URI (abbreviated)                                           |
| ---------------------- | ---------------------------------------------------------------- |
| Main document          | `.../officeDocument/2006/relationships/officeDocument`           |
| Styles                 | `.../relationships/styles`                                       |
| Numbering              | `.../relationships/numbering`                                    |
| Settings               | `.../relationships/settings`                                     |
| Web settings           | `.../relationships/webSettings`                                  |
| Font table             | `.../relationships/fontTable`                                    |
| Theme                  | `.../relationships/theme`                                        |
| Header                 | `.../relationships/header`                                       |
| Footer                 | `.../relationships/footer`                                       |
| Footnotes              | `.../relationships/footnotes`                                    |
| Endnotes               | `.../relationships/endnotes`                                     |
| Comments               | `.../relationships/comments`                                     |
| CommentsExtended (w15) | `.../2012/06/relationships/commentsExtensible` (extensible link) |
| People (w15)           | `.../2011/relationships/people`                                  |
| Glossary document      | `.../relationships/glossaryDocument`                             |
| Hyperlink              | `.../relationships/hyperlink`                                    |
| Image                  | `.../relationships/image`                                        |
| Chart                  | `.../relationships/chart`                                        |
| OLE object             | `.../relationships/oleObject`                                    |
| Embedded package       | `.../relationships/package`                                      |
| Core properties        | `.../package/2006/relationships/metadata/core-properties`        |
| Extended properties    | `.../officeDocument/2006/relationships/extended-properties`      |
| Custom properties      | `.../officeDocument/2006/relationships/custom-properties`        |
| VBA project (DOCM)     | `.../officeDocument/2006/relationships/vbaProject`               |
| Custom XML             | `.../officeDocument/2006/relationships/customXml`                |

We constant-fold these into an enum and use `Rel.kind` internally:

```ts
export type RelKind =
  | 'officeDocument'
  | 'styles'
  | 'numbering'
  | 'settings'
  | 'webSettings'
  | 'fontTable'
  | 'theme'
  | 'header'
  | 'footer'
  | 'footnotes'
  | 'endnotes'
  | 'comments'
  | 'commentsExtensible'
  | 'people'
  | 'glossaryDocument'
  | 'hyperlink'
  | 'image'
  | 'chart'
  | 'oleObject'
  | 'package'
  | 'coreProperties'
  | 'extendedProperties'
  | 'customProperties'
  | 'vbaProject'
  | 'customXml'
  | 'unknown';
```

Unknown relationships are retained verbatim in the AST (`Document.unknownRels`) so the writer re-emits them.

### 6.6 Example `[Content_Types].xml`

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/webSettings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.webSettings+xml"/>
  <Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>
  <Override PartName="/word/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
  <Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>
  <Override PartName="/word/endnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml"/>
  <Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>
```

### 6.7 Example `_rels/.rels`

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>
```

### 6.8 Example `word/_rels/document.xml.rels`

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type=".../relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type=".../relationships/settings" Target="settings.xml"/>
  <Relationship Id="rId3" Type=".../relationships/webSettings" Target="webSettings.xml"/>
  <Relationship Id="rId4" Type=".../relationships/fontTable" Target="fontTable.xml"/>
  <Relationship Id="rId5" Type=".../relationships/theme" Target="theme/theme1.xml"/>
  <Relationship Id="rId6" Type=".../relationships/numbering" Target="numbering.xml"/>
  <Relationship Id="rId7" Type=".../relationships/header" Target="header1.xml"/>
  <Relationship Id="rId8" Type=".../relationships/footer" Target="footer1.xml"/>
  <Relationship Id="rId9" Type=".../relationships/footnotes" Target="footnotes.xml"/>
  <Relationship Id="rId10" Type=".../relationships/endnotes" Target="endnotes.xml"/>
  <Relationship Id="rId11" Type=".../relationships/comments" Target="comments.xml"/>
  <Relationship Id="rId12" Type=".../relationships/image" Target="media/image1.png"/>
  <Relationship Id="rId13" Type=".../relationships/hyperlink" Target="https://example.com" TargetMode="External"/>
</Relationships>
```

---

## 7. XML parser (`src/xml/reader.ts`)

### 7.1 Library choice

`saxes`:

- Namespace-aware.
- Event-driven SAX — no in-memory DOM.
- Good TypeScript types.
- Strict XML 1.0; mirrors libxml2 errors.
- Disable DOCTYPE parsing (XXE guard).

Alternatives evaluated:

- `fast-xml-parser`: builds a JS object tree. Fine for small parts. We use it _only_ in tests.
- `ltx`: smaller but less robust.
- `@xmldom/xmldom`: full DOM, memory-hungry. Only appropriate for our small parts via a custom wrapper.

We use `saxes` for `document.xml`, `header*.xml`, `footer*.xml`, `comments.xml`, `footnotes.xml`, `endnotes.xml`, and `glossary/document.xml`. Smaller parts (styles, numbering, settings, font table, theme, docProps) go through a tiny custom DOM (`src/xml/dom.ts`) because random access is more convenient for their mappers and their size is bounded.

### 7.2 Event-driven parser

The streaming parser converts saxes events into element-boundary events annotated with our canonical namespace short names:

```ts
export type XmlEvent =
  | { kind: 'startElement'; qname: QName; attrs: ReadonlyMap<QName, string>; selfClosing: boolean }
  | { kind: 'endElement'; qname: QName }
  | { kind: 'text'; value: string; preserveWhitespace: boolean }
  | { kind: 'cdata'; value: string }
  | { kind: 'pi'; target: string; value: string }
  | { kind: 'comment'; value: string }
  | { kind: 'error'; error: XmlError };

export interface QName {
  readonly ns: string; // namespace URI
  readonly local: string; // local name
  readonly prefix: string; // original prefix (for lenient round-trip of unknown namespaces)
}
```

### 7.3 Canonical namespaces

| Prefix  | URI                                                                                  |
| ------- | ------------------------------------------------------------------------------------ |
| `w`     | `http://schemas.openxmlformats.org/wordprocessingml/2006/main`                       |
| `r`     | `http://schemas.openxmlformats.org/officeDocument/2006/relationships`                |
| `m`     | `http://schemas.openxmlformats.org/officeDocument/2006/math`                         |
| `wp`    | `http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing`             |
| `wp14`  | `http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing`                |
| `a`     | `http://schemas.openxmlformats.org/drawingml/2006/main`                              |
| `pic`   | `http://schemas.openxmlformats.org/drawingml/2006/picture`                           |
| `w14`   | `http://schemas.microsoft.com/office/word/2010/wordml`                               |
| `w15`   | `http://schemas.microsoft.com/office/word/2012/wordml`                               |
| `w16se` | `http://schemas.microsoft.com/office/word/2015/wordml/symex`                         |
| `wne`   | `http://schemas.microsoft.com/office/word/2006/wordml`                               |
| `mc`    | `http://schemas.openxmlformats.org/markup-compatibility/2006`                        |
| `ve`    | `http://schemas.openxmlformats.org/markup-compatibility/2006` (legacy prefix for mc) |
| `v`     | `urn:schemas-microsoft-com:vml`                                                      |
| `o`     | `urn:schemas-microsoft-com:office:office`                                            |
| `w10`   | `urn:schemas-microsoft-com:office:word`                                              |
| `xml`   | `http://www.w3.org/XML/1998/namespace`                                               |

Canonicalization: on parse we normalize prefixes to the canonical table above; we remember original prefixes (in the original `QName.prefix`) only for elements in namespaces we don't understand so we can emit them back out verbatim if needed.

### 7.4 Document reader state machine

`document.xml` is huge and must stream. We implement a hand-coded state machine:

```ts
type DocState =
  | { kind: 'start' }
  | { kind: 'inDocument' }
  | { kind: 'inBody' }
  | { kind: 'inParagraph'; para: ParagraphBuilder }
  | { kind: 'inRun'; para: ParagraphBuilder; run: RunBuilder }
  | { kind: 'inRunContent'; para: ParagraphBuilder; run: RunBuilder; tagStack: string[] }
  | { kind: 'inPPr'; para: ParagraphBuilder; builder: PPrBuilder }
  | { kind: 'inRPr'; run: RunBuilder; builder: RPrBuilder }
  | { kind: 'inTable'; table: TableBuilder }
  | { kind: 'inRow'; table: TableBuilder; row: RowBuilder }
  | { kind: 'inCell'; table: TableBuilder; row: RowBuilder; cell: CellBuilder }
  | { kind: 'inSectPr'; target: ParagraphBuilder | BodyBuilder }
  | { kind: 'inSdt'; sdt: SdtBuilder }
  | { kind: 'inField'; field: FieldBuilder }
  | { kind: 'inUnknown'; depth: number; buffer: string[] }; // passthrough for unknown elements
```

When we enter an unknown element (no mapper), we buffer its textual form (including attributes and children) back into a string and attach it as `unknownChildren: Array<OpaqueXml>` to the nearest ancestor AST node. On write, opaque XML is emitted verbatim.

### 7.5 Whitespace

OOXML uses `xml:space="preserve"` to preserve whitespace in `w:t` and related elements. We apply the XML 1.0 rule:

- When the element or any ancestor has `xml:space="preserve"`, all whitespace is significant.
- Otherwise, whitespace between element tags is stripped (we treat `w:t` text content as preserve-by-default because the surrounding structure is mixed-content, but we still respect the explicit attribute).

The writer inverts this: any `w:t` whose content has leading/trailing whitespace or is entirely whitespace gets `xml:space="preserve"` added.

### 7.6 Lenient mode

Word and other producers emit documents that fail XSD validation in non-fatal ways. Our parser has a `strict` flag (default `false`):

- Unknown elements retained as opaque.
- Unknown attributes retained as opaque.
- Elements closing in wrong order → log and recover by emitting synthetic closers.
- Invalid numeric attributes → coerce to default, log warning.
- Duplicate bookmark IDs → re-allocate on load, map preserved.

In `strict: true` (used in tests), we throw.

### 7.7 XXE / security

- `saxes` does not resolve external entities. We also reject `<!DOCTYPE>` explicitly.
- No XML Parametric Entities allowed.
- No `xml:base`.
- No XInclude.

### 7.8 CDATA

Rare in WordprocessingML but legal. We collapse CDATA to plain text on read. On write we emit text as escaped characters (never CDATA) unless a round-trip annotation marks a section as having originally been CDATA (the annotation is stored in the AST for perfect bytewise round-trip of pathological inputs).

---

## 8. XML writer (`src/xml/writer.ts`)

### 8.1 Design

Streaming emitter; we don't materialize the full XML string before writing to the ZIP. The emitter implements:

```ts
export interface XmlWriter {
  /** Start a document, emit XML declaration. */
  startDocument(opts?: { standalone?: boolean }): void;
  /** Start an element. Namespaces are auto-declared on the root element. */
  startElement(qname: QName, attrs?: ReadonlyArray<[QName, string]>): void;
  /** Self-closing element. */
  emptyElement(qname: QName, attrs?: ReadonlyArray<[QName, string]>): void;
  /** Text node, with proper escaping and xml:space handling. */
  text(value: string, opts?: { preserveWhitespace?: boolean }): void;
  /** End the current element. */
  endElement(): void;
  /** Emit raw XML (opaque passthrough for unknown elements). */
  raw(xml: string): void;
  /** Finish and return bytes. */
  finish(): Uint8Array;
}
```

### 8.2 Namespace declarations

We declare all namespaces our emitted parts use on the root element; we never add `xmlns:` declarations on nested elements (Word doesn't either).

For `document.xml`, the root declaration block is:

```xml
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
            xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
            xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"
            xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
            xmlns:v="urn:schemas-microsoft-com:vml"
            xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:w10="urn:schemas-microsoft-com:office:word"
            xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
            xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
            xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
            xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
            xmlns:w16se="http://schemas.microsoft.com/office/word/2015/wordml/symex"
            mc:Ignorable="w14 w15 w16se wp14">
```

We always emit `mc:Ignorable` to list our declared but not-required namespaces. This matches Word's output and keeps us interoperable with older readers.

### 8.3 Attribute ordering

Word is anal-retentive about attribute order, and our golden tests show that changing order causes apparent diffs even when semantically identical. We precompute the canonical attribute order per element and sort accordingly:

```ts
export const PARAGRAPH_PR_ATTR_ORDER = ['w:val'] as const;
export const RUN_PR_ATTR_ORDER = ['w:val'] as const; // most run props are child elements
export const RPR_CHILD_ORDER = [
  'rStyle',
  'rFonts',
  'b',
  'bCs',
  'i',
  'iCs',
  'caps',
  'smallCaps',
  'strike',
  'dstrike',
  'outline',
  'shadow',
  'emboss',
  'imprint',
  'noProof',
  'snapToGrid',
  'vanish',
  'webHidden',
  'color',
  'spacing',
  'w',
  'kern',
  'position',
  'sz',
  'szCs',
  'highlight',
  'u',
  'effect',
  'bdr',
  'shd',
  'fitText',
  'vertAlign',
  'rtl',
  'cs',
  'em',
  'lang',
  'eastAsianLayout',
  'specVanish',
  'oMath',
] as const;
```

(This is the canonical child order of `w:rPr` per the ECMA-376 schema.)

### 8.4 Self-closing

Empty elements are emitted self-closing: `<w:b/>` not `<w:b></w:b>`. Empty elements with children-absent-but-attrs-present are also self-closing: `<w:rFonts w:ascii="Times"/>`.

### 8.5 Pretty-printing

Disabled. We emit on a single line per part unless we stream-newline after blocks for memory reasons; Word doesn't pretty-print. Pretty-printing is available as an option for developer inspection (`WriteOptions.prettyPrint: true`) but never used in shipped output.

### 8.6 Entity escaping

- `<` → `&lt;`
- `>` → `&gt;` (only in text content; not strictly required but matches Word)
- `&` → `&amp;`
- `"` → `&quot;` in attribute values
- `'` → `&#39;` in attribute values (Word uses numeric entity)
- Control characters 0x00–0x08, 0x0B, 0x0C, 0x0E–0x1F rejected (XML 1.0 disallows). If a user pastes one, we strip and log.
- Tabs, LFs, CRs in attribute values escaped as `&#x9;`, `&#xA;`, `&#xD;`.

### 8.7 Determinism

- Relationship IDs re-sequenced from rId1 on write. Preserved map lets external references (by rId in embedded XML like SDT) be rewritten consistently.
- Bookmark IDs re-sequenced from 0 if `WriteOptions.renumberIds=true` (default on save; off on "Save without normalization").
- Comment IDs preserved verbatim (they appear in `commentsExtended.xml` and round-tripped via paraId).
- Style IDs never renumbered (style IDs are user-visible in some cases and locale-specific).

---

## 9. Intermediate AST (`src/ast/`)

### 9.1 Philosophy

The AST mirrors OOXML shape for shape. If there's a `w:p` element, there's a `Paragraph` node. If there's a `w:pPr`, there's a `ParagraphProperties` node. No domain abstractions, no collapsing.

### 9.2 Base node shape

```ts
export interface AstNode<Kind extends string = string> {
  readonly kind: Kind;
  /** Typed, decoded attributes. */
  readonly attrs?: Readonly<Record<string, AttrValue>>;
  /** Typed child nodes. */
  readonly children?: ReadonlyArray<AstNode>;
  /** Unknown attributes we saw but don't understand, kept for round-trip. */
  readonly unknownAttrs?: ReadonlyArray<OpaqueAttr>;
  /** Unknown children we saw but don't understand, kept for round-trip. */
  readonly unknownChildren?: ReadonlyArray<OpaqueXml>;
  /** Annotations from the parser (line number, byte offset) in dev mode. */
  readonly __loc?: SourceLocation;
}

export type AttrValue =
  | string
  | number
  | boolean
  | { kind: 'measure'; value: number; unit: Unit }
  | { kind: 'enum'; value: string };

export type Unit =
  | 'twip' // 1/1440 inch
  | 'pt' // point; usually ×2 for half-points (font size)
  | 'dxa' // twip (alias used in OOXML)
  | 'emu' // English Metric Unit (DrawingML); 914400 per inch
  | 'pct' // percentage ×50 (w:w is ×50 pct in some contexts)
  | 'ea' // each (integer count)
  | 'raw'; // verbatim string

export interface OpaqueAttr {
  readonly qname: QName;
  readonly value: string;
}

export interface OpaqueXml {
  readonly kind: 'opaque';
  readonly raw: string; // valid XML subtree
}
```

### 9.3 Core node types

```ts
export interface Document extends AstNode<'document'> {
  readonly children: ReadonlyArray<Body>;
}

export interface Body extends AstNode<'body'> {
  readonly children: ReadonlyArray<BodyChild>;
  readonly sectPr?: SectionProperties; // body-level sectPr only present when last section has no wrapper paragraph
}

export type BodyChild = Paragraph | Table | Sdt | BookmarkStart | BookmarkEnd | CustomXmlInsert;

export interface Paragraph extends AstNode<'p'> {
  readonly pPr?: ParagraphProperties;
  readonly children: ReadonlyArray<ParagraphChild>;
  readonly paraId?: string; // w14:paraId
  readonly textId?: string; // w14:textId
}

export type ParagraphChild =
  | Run
  | Hyperlink
  | BookmarkStart
  | BookmarkEnd
  | CommentRangeStart
  | CommentRangeEnd
  | CommentReference
  | FieldStart
  | FieldSeparate
  | FieldEnd
  | FieldSimple
  | InsRun
  | DelRun
  | MoveFromRun
  | MoveToRun
  | Sdt
  | CustomXmlInsert
  | ProofErr
  | PermissionStart
  | PermissionEnd
  | OpaqueNode;

export interface Run extends AstNode<'r'> {
  readonly rPr?: RunProperties;
  readonly children: ReadonlyArray<RunChild>;
}

export type RunChild =
  | Text
  | Tab
  | Break
  | NoBreakHyphen
  | SoftHyphen
  | Symbol
  | PageNumber
  | LastRenderedPageBreak
  | Drawing
  | OleObject
  | Picture
  | FootnoteReference
  | EndnoteReference
  | FieldChar
  | InstrText
  | DayLong
  | DayShort
  | MonthLong
  | MonthShort
  | YearLong
  | YearShort
  | AnnotationRef
  | CommentReference
  | ContentPart
  | Ruby
  | OpaqueNode;

export interface Text extends AstNode<'t'> {
  readonly value: string;
  readonly preserveWhitespace: boolean;
}

export interface RunProperties extends AstNode<'rPr'> {
  readonly rStyle?: string;
  readonly rFonts?: Fonts;
  readonly bold?: ToggleVal;
  readonly boldCs?: ToggleVal;
  readonly italic?: ToggleVal;
  readonly italicCs?: ToggleVal;
  readonly caps?: ToggleVal;
  readonly smallCaps?: ToggleVal;
  readonly strike?: ToggleVal;
  readonly doubleStrike?: ToggleVal;
  readonly outline?: ToggleVal;
  readonly shadow?: ToggleVal;
  readonly emboss?: ToggleVal;
  readonly imprint?: ToggleVal;
  readonly vanish?: ToggleVal;
  readonly webHidden?: ToggleVal;
  readonly color?: Color;
  readonly spacing?: TwipValue; // char spacing
  readonly characterWidth?: Percent;
  readonly kerning?: HalfPoint; // w:kern
  readonly position?: HalfPoint;
  readonly fontSize?: HalfPoint;
  readonly fontSizeCs?: HalfPoint;
  readonly highlight?: HighlightColor;
  readonly underline?: Underline;
  readonly effect?: TextEffect;
  readonly border?: Border;
  readonly shading?: Shading;
  readonly fitText?: FitText;
  readonly verticalAlign?: 'baseline' | 'superscript' | 'subscript';
  readonly rtl?: ToggleVal;
  readonly emphasis?: 'dot' | 'circle' | 'underDot' | 'comma' | 'none';
  readonly lang?: Lang;
  readonly rPrChange?: RunPropertiesChange; // revision
}

export type ToggleVal = boolean | { kind: 'toggle'; value: boolean };
export interface Color {
  readonly val: string;
  readonly themeColor?: string;
  readonly themeTint?: string;
  readonly themeShade?: string;
}
export interface TwipValue {
  readonly twip: number;
}
export interface Percent {
  readonly pct: number;
}
export interface HalfPoint {
  readonly halfPt: number;
}
export type HighlightColor =
  | 'black'
  | 'blue'
  | 'cyan'
  | 'darkBlue'
  | 'darkCyan'
  | 'darkGray'
  | 'darkGreen'
  | 'darkMagenta'
  | 'darkRed'
  | 'darkYellow'
  | 'green'
  | 'lightGray'
  | 'magenta'
  | 'none'
  | 'red'
  | 'white'
  | 'yellow';
export interface Underline {
  readonly val:
    | 'single'
    | 'double'
    | 'thick'
    | 'dotted'
    | 'dash'
    | 'dotDash'
    | 'dotDotDash'
    | 'wave'
    | 'wavyHeavy'
    | 'wavyDouble'
    | 'words'
    | 'none';
  readonly color?: string;
  readonly themeColor?: string;
}
export type TextEffect =
  | 'blinkBackground'
  | 'lights'
  | 'antsBlack'
  | 'antsRed'
  | 'shimmer'
  | 'sparkle'
  | 'none';
export interface Border {
  readonly val: BorderStyle;
  readonly color?: string;
  readonly size?: number;
  readonly space?: number;
}
export type BorderStyle =
  | 'nil'
  | 'none'
  | 'single'
  | 'thick'
  | 'double'
  | 'dotted'
  | 'dashed'
  | 'dotDash'
  | 'dotDotDash'
  | 'triple'
  | 'thinThickSmallGap'
  | 'thickThinSmallGap'
  | 'thinThickThinSmallGap'
  | 'thinThickMediumGap'
  | 'thickThinMediumGap'
  | 'thinThickThinMediumGap'
  | 'thinThickLargeGap'
  | 'thickThinLargeGap'
  | 'thinThickThinLargeGap'
  | 'wave'
  | 'doubleWave'
  | 'dashSmallGap'
  | 'dashDotStroked'
  | 'threeDEmboss'
  | 'threeDEngrave'
  | 'outset'
  | 'inset'
  | 'apples'
  | 'archedScallops'
  | 'babyPacifier'
  | 'babyRattle'
  | 'balloons3Colors'
  | 'balloonsHotAir'
  | 'basicBlackDashes'
  | 'basicBlackDots'
  | 'basicBlackSquares'
  | 'basicThinLines'
  | 'basicWhiteDashes'
  | 'basicWhiteDots'
  | 'basicWhiteSquares'
  | 'basicWideInline'
  | 'basicWideMidline'
  | 'basicWideOutline'
  | 'bats'
  | 'birds'
  | 'birdsFlight'
  | 'cabins'
  | 'cakeSlice'
  | 'candyCorn'
  | 'celticKnotwork'
  | 'certificateBanner'
  | 'chainLink'
  | 'champagneBottle'
  | 'checkedBarBlack'
  | 'checkedBarColor'
  | 'checkered'
  | 'christmasTree'
  | 'circlesLines'
  | 'circlesRectangles'
  | 'classicalWave'
  | 'clocks'
  | 'compass'
  | 'confetti'
  | 'confettiGrays'
  | 'confettiOutline'
  | 'confettiStreamers'
  | 'confettiWhite'
  | 'cornerTriangles'
  | 'couponCutoutDashes'
  | 'couponCutoutDots'
  | 'crazyMaze'
  | 'creaturesButterfly'
  | 'creaturesFish'
  | 'creaturesInsects'
  | 'creaturesLadyBug'
  | 'crossStitch'
  | 'cup'
  | 'decoArch'
  | 'decoArchColor'
  | 'decoBlocks'
  | 'diamondsGray'
  | 'doubleD'
  | 'doubleDiamonds'
  | 'earth1'
  | 'earth2'
  | 'eclipsingSquares1'
  | 'eclipsingSquares2'
  | 'eggsBlack'
  | 'fans'
  | 'film'
  | 'firecrackers'
  | 'flowersBlockPrint'
  | 'flowersDaisies'
  | 'flowersModern1'
  | 'flowersModern2'
  | 'flowersPansy'
  | 'flowersRedRose'
  | 'flowersRoses'
  | 'flowersTeacup'
  | 'flowersTiny'
  | 'gems'
  | 'gingerbreadMan'
  | 'gradient'
  | 'handmade1'
  | 'handmade2'
  | 'heartBalloon'
  | 'heartGray'
  | 'hearts'
  | 'heebieJeebies'
  | 'holly'
  | 'houseFunky'
  | 'hypnotic'
  | 'iceCreamCones'
  | 'lightBulb'
  | 'lightning1'
  | 'lightning2'
  | 'mapPins'
  | 'mapleLeaf'
  | 'mapleMuffins'
  | 'marquee'
  | 'marqueeToothed'
  | 'moons'
  | 'mosaic'
  | 'musicNotes'
  | 'northwest'
  | 'ovals'
  | 'packages'
  | 'palmsBlack'
  | 'palmsColor'
  | 'paperClips'
  | 'papyrus'
  | 'partyFavor'
  | 'partyGlass'
  | 'pencils'
  | 'people'
  | 'peopleWaving'
  | 'peopleHats'
  | 'poinsettias'
  | 'postageStamp'
  | 'pumpkin1'
  | 'pushPinNote1'
  | 'pushPinNote2'
  | 'pyramids'
  | 'pyramidsAbove'
  | 'quadrants'
  | 'rings'
  | 'safari'
  | 'sawtooth'
  | 'sawtoothGray'
  | 'scaredCat'
  | 'seattle'
  | 'shadowedSquares'
  | 'sharksTeeth'
  | 'shorebirdTracks'
  | 'skyrocket'
  | 'snowflakeFancy'
  | 'snowflakes'
  | 'sombrero'
  | 'southwest'
  | 'stars'
  | 'starsTop'
  | 'stars3D'
  | 'starsBlack'
  | 'starsShadowed'
  | 'sun'
  | 'swirligig'
  | 'tornPaper'
  | 'tornPaperBlack'
  | 'trees'
  | 'triangleParty'
  | 'triangles'
  | 'tribal1'
  | 'tribal2'
  | 'tribal3'
  | 'tribal4'
  | 'tribal5'
  | 'tribal6'
  | 'twistedLines1'
  | 'twistedLines2'
  | 'vine'
  | 'waveline'
  | 'weavingAngles'
  | 'weavingBraid'
  | 'weavingRibbon'
  | 'weavingStrips'
  | 'whiteFlowers'
  | 'woodwork'
  | 'xIllusions'
  | 'zanyTriangles'
  | 'zigZag'
  | 'zigZagStitch';
```

(The `BorderStyle` enumeration is verbatim the ECMA-376 `ST_Border` simple type. We include the full set so the mapper round-trips every value.)

### 9.4 Paragraph properties

```ts
export interface ParagraphProperties extends AstNode<'pPr'> {
  readonly pStyle?: string;
  readonly keepNext?: ToggleVal;
  readonly keepLines?: ToggleVal;
  readonly pageBreakBefore?: ToggleVal;
  readonly frame?: FrameProperties;
  readonly widowControl?: ToggleVal;
  readonly numbering?: NumberingReference;
  readonly suppressLineNumbers?: ToggleVal;
  readonly suppressAutoHyphens?: ToggleVal;
  readonly kinsoku?: ToggleVal;
  readonly wordWrap?: ToggleVal;
  readonly overflowPunct?: ToggleVal;
  readonly topLinePunct?: ToggleVal;
  readonly autoSpaceDE?: ToggleVal;
  readonly autoSpaceDN?: ToggleVal;
  readonly bidi?: ToggleVal;
  readonly adjustRightInd?: ToggleVal;
  readonly snapToGrid?: ToggleVal;
  readonly spacing?: ParagraphSpacing;
  readonly indent?: Indent;
  readonly contextualSpacing?: ToggleVal;
  readonly mirrorIndents?: ToggleVal;
  readonly suppressOverlap?: ToggleVal;
  readonly jc?:
    | 'start'
    | 'end'
    | 'center'
    | 'both'
    | 'mediumKashida'
    | 'distribute'
    | 'numTab'
    | 'highKashida'
    | 'lowKashida'
    | 'thaiDistribute'
    | 'left'
    | 'right';
  readonly textDirection?: 'lrTb' | 'tbRl' | 'btLr' | 'lrTbV' | 'tbRlV' | 'tbLrV';
  readonly textAlignment?: 'top' | 'center' | 'baseline' | 'bottom' | 'auto';
  readonly outlineLvl?: number;
  readonly divId?: string;
  readonly cnfStyle?: ConditionalFormatting;
  readonly rPr?: RunProperties; // paragraph mark run properties
  readonly sectPr?: SectionProperties; // section break at this paragraph
  readonly pPrChange?: ParagraphPropertiesChange;
  readonly tabs?: ReadonlyArray<Tab>;
  readonly borders?: ParagraphBorders;
  readonly shading?: Shading;
}

export interface ParagraphSpacing {
  readonly before?: TwipValue;
  readonly beforeLines?: number;
  readonly beforeAutospacing?: ToggleVal;
  readonly after?: TwipValue;
  readonly afterLines?: number;
  readonly afterAutospacing?: ToggleVal;
  readonly line?: TwipValue;
  readonly lineRule?: 'auto' | 'exact' | 'atLeast';
}

export interface Indent {
  readonly start?: TwipValue;
  readonly end?: TwipValue;
  readonly hanging?: TwipValue;
  readonly firstLine?: TwipValue;
  readonly left?: TwipValue; // legacy alias
  readonly right?: TwipValue; // legacy alias
}

export interface NumberingReference {
  readonly ilvl: number;
  readonly numId: number;
}

export interface Tab {
  readonly val: 'clear' | 'start' | 'center' | 'end' | 'decimal' | 'bar' | 'num' | 'left' | 'right';
  readonly leader?: 'none' | 'dot' | 'hyphen' | 'underscore' | 'heavy' | 'middleDot';
  readonly pos: TwipValue;
}
```

### 9.5 Table model

```ts
export interface Table extends AstNode<'tbl'> {
  readonly tblPr?: TableProperties;
  readonly tblGrid: TableGrid;
  readonly rows: ReadonlyArray<TableRow>;
}

export interface TableGrid {
  readonly cols: ReadonlyArray<{ w: TwipValue }>;
}

export interface TableRow extends AstNode<'tr'> {
  readonly trPr?: TableRowProperties;
  readonly cells: ReadonlyArray<TableCell>;
}

export interface TableCell extends AstNode<'tc'> {
  readonly tcPr?: TableCellProperties;
  readonly children: ReadonlyArray<BodyChild>;
}

export interface TableProperties extends AstNode<'tblPr'> {
  readonly tblStyle?: string;
  readonly tblW?: TblWidth;
  readonly jc?: 'start' | 'end' | 'center' | 'left' | 'right';
  readonly tblInd?: TblWidth;
  readonly tblBorders?: TableBorders;
  readonly tblShd?: Shading;
  readonly tblLayout?: 'fixed' | 'autofit';
  readonly tblCellMar?: TableCellMargins;
  readonly tblLook?: TableLook;
  readonly tblCaption?: string;
  readonly tblDescription?: string;
  readonly bidiVisual?: ToggleVal;
  readonly tblpPr?: TablePositionProperties;
  readonly tblOverlap?: 'never' | 'overlap';
}

export interface TblWidth {
  readonly type: 'auto' | 'dxa' | 'nil' | 'pct';
  readonly w: number;
}

export interface TableLook {
  readonly firstRow?: boolean;
  readonly lastRow?: boolean;
  readonly firstCol?: boolean;
  readonly lastCol?: boolean;
  readonly noHBand?: boolean;
  readonly noVBand?: boolean;
}
```

### 9.6 Section properties

```ts
export interface SectionProperties extends AstNode<'sectPr'> {
  readonly type?: 'nextPage' | 'oddPage' | 'evenPage' | 'continuous' | 'nextColumn';
  readonly pageSize?: PageSize;
  readonly pageMargins?: PageMargins;
  readonly paperSrc?: PaperSource;
  readonly pageBorders?: PageBorders;
  readonly lineNumType?: LineNumType;
  readonly pageNumType?: PageNumType;
  readonly cols?: Columns;
  readonly formProt?: ToggleVal;
  readonly vAlign?: 'top' | 'center' | 'both' | 'bottom';
  readonly noEndnote?: ToggleVal;
  readonly titlePg?: ToggleVal;
  readonly textDirection?: ParagraphProperties['textDirection'];
  readonly bidi?: ToggleVal;
  readonly rtlGutter?: ToggleVal;
  readonly docGrid?: DocGrid;
  readonly printerSettings?: string; // relationship id
  readonly footnotePr?: FootnoteProperties;
  readonly endnotePr?: EndnoteProperties;
  readonly headerReferences: ReadonlyArray<HeaderFooterReference>;
  readonly footerReferences: ReadonlyArray<HeaderFooterReference>;
  readonly sectPrChange?: SectionPropertiesChange;
}

export interface PageSize {
  readonly w: TwipValue;
  readonly h: TwipValue;
  readonly orient?: 'portrait' | 'landscape';
  readonly code?: number; // paper size code
}

export interface PageMargins {
  readonly top: TwipValue;
  readonly right: TwipValue;
  readonly bottom: TwipValue;
  readonly left: TwipValue;
  readonly header: TwipValue;
  readonly footer: TwipValue;
  readonly gutter: TwipValue;
}

export interface Columns {
  readonly equalWidth: boolean;
  readonly num?: number;
  readonly space?: TwipValue;
  readonly sep?: ToggleVal;
  readonly cols: ReadonlyArray<{ w: TwipValue; space?: TwipValue }>;
}

export interface HeaderFooterReference {
  readonly type: 'default' | 'first' | 'even';
  readonly relId: string;
}

export interface PageNumType {
  readonly format?:
    | 'decimal'
    | 'upperRoman'
    | 'lowerRoman'
    | 'upperLetter'
    | 'lowerLetter'
    | 'ordinal'
    | 'cardinalText'
    | 'ordinalText'
    | 'hex'
    | 'chicago'
    | 'ideographDigital'
    | 'japaneseCounting'
    | 'aiueo'
    | 'iroha'
    | 'decimalFullWidth'
    | 'decimalHalfWidth'
    | 'japaneseLegal'
    | 'japaneseDigitalTenThousand'
    | 'decimalEnclosedCircle'
    | 'decimalFullWidth2'
    | 'aiueoFullWidth'
    | 'irohaFullWidth'
    | 'decimalZero'
    | 'bullet'
    | 'ganada'
    | 'chosung'
    | 'decimalEnclosedFullstop'
    | 'decimalEnclosedParen'
    | 'decimalEnclosedCircleChinese'
    | 'ideographEnclosedCircle'
    | 'ideographTraditional'
    | 'ideographZodiac'
    | 'ideographZodiacTraditional'
    | 'taiwaneseCounting'
    | 'ideographLegalTraditional'
    | 'taiwaneseCountingThousand'
    | 'taiwaneseDigital'
    | 'chineseCounting'
    | 'chineseLegalSimplified'
    | 'chineseCountingThousand'
    | 'koreanDigital'
    | 'koreanCounting'
    | 'koreanLegal'
    | 'koreanDigital2'
    | 'vietnameseCounting'
    | 'russianLower'
    | 'russianUpper'
    | 'none'
    | 'numberInDash'
    | 'hebrew1'
    | 'hebrew2'
    | 'arabicAlpha'
    | 'arabicAbjad'
    | 'hindiVowels'
    | 'hindiConsonants'
    | 'hindiNumbers'
    | 'hindiCounting'
    | 'thaiLetters'
    | 'thaiNumbers'
    | 'thaiCounting'
    | 'bahtText'
    | 'dollarText'
    | 'custom';
  readonly start?: number;
  readonly chapStyle?: number;
  readonly chapSep?: 'hyphen' | 'period' | 'colon' | 'emDash' | 'enDash';
}
```

### 9.7 Unknown and opaque

```ts
export interface OpaqueNode extends AstNode<'opaque'> {
  readonly raw: string; // full XML subtree as read
  readonly originalQName: QName;
}

export interface PreservedExtension {
  readonly kind: 'ext';
  readonly uri: string;
  readonly raw: string;
}
```

On the domain side, every node has an optional `preservedExtensions: ReadonlyArray<PreservedExtension>` so the mapper can stash foreign subtrees that survive untouched.

---

## 10. Domain mapper (`src/mappers/`)

### 10.1 Mapper interface

```ts
export interface Mapper<DomainNode, AstNode> {
  /** Map from AST → domain. */
  in(ast: AstNode, ctx: MapInContext): DomainNode;
  /** Map from domain → AST. */
  out(node: DomainNode, ctx: MapOutContext): AstNode;
}

export interface MapInContext {
  readonly pkg: PackageReader;
  readonly stylesIndex: StyleIndex;
  readonly numberingIndex: NumberingIndex;
  readonly settings: AppSettings;
  readonly relResolver: RelResolver;
  readonly warn: (code: string, detail: string) => void;
  readonly options: ReadOptions;
}

export interface MapOutContext {
  readonly pkg: PackageWriter;
  readonly idAllocator: IdAllocator;
  readonly settings: AppSettings;
  readonly options: WriteOptions;
}
```

### 10.2 File layout

Each feature has its own file. Each file exports exactly one mapper.

```
mappers/
  paragraph.ts     // export const paragraphMapper: Mapper<Paragraph, AstParagraph>
  run.ts
  text.ts
  tab-break.ts
  table.ts
  row.ts
  cell.ts
  section.ts
  style.ts
  numbering.ts
  field.ts
  image.ts
  ole.ts
  comment.ts
  revision.ts
  hyperlink.ts
  bookmark.ts
  drawing.ts
  math.ts
  frame.ts
  sdt.ts
  footnote.ts
  endnote.ts
  header-footer.ts
  glossary.ts
  doc-props.ts
  settings.ts
  font-table.ts
  theme.ts
```

### 10.3 Paragraph mapper skeleton (full)

```ts
// src/mappers/paragraph.ts
import type { AstParagraph, AstParagraphProperties } from '../ast/nodes/paragraph';
import type { Paragraph as DomainParagraph, ParagraphProps as DomainPProps } from '@word/domain';
import { runMapper } from './run';
import { hyperlinkMapper } from './hyperlink';
import { bookmarkMapper } from './bookmark';
import { fieldMapper } from './field';
import { sdtMapper } from './sdt';
import { commentRangeMapper } from './comment';
import { sectionMapper } from './section';
import { revisionMapper } from './revision';
import type { Mapper, MapInContext, MapOutContext } from '../types';

export const paragraphMapper: Mapper<DomainParagraph, AstParagraph> = {
  in(ast, ctx): DomainParagraph {
    const props = ast.pPr ? paragraphPropsIn(ast.pPr, ctx) : undefined;
    const children: DomainParagraph['children'] = [];

    for (const child of ast.children) {
      switch (child.kind) {
        case 'r':
          children.push(runMapper.in(child, ctx));
          break;
        case 'hyperlink':
          children.push(hyperlinkMapper.in(child, ctx));
          break;
        case 'bookmarkStart':
        case 'bookmarkEnd':
          children.push(bookmarkMapper.in(child, ctx));
          break;
        case 'fldSimple':
        case 'fldChar':
        case 'instrText':
          children.push(fieldMapper.in(child, ctx));
          break;
        case 'sdt':
          children.push(sdtMapper.in(child, ctx));
          break;
        case 'commentRangeStart':
        case 'commentRangeEnd':
        case 'commentReference':
          children.push(commentRangeMapper.in(child, ctx));
          break;
        case 'ins':
        case 'del':
        case 'moveFrom':
        case 'moveTo':
          children.push(revisionMapper.in(child, ctx));
          break;
        case 'opaque':
          children.push({
            kind: 'preservedExtension',
            ext: { kind: 'ext', uri: child.originalQName.ns, raw: child.raw },
          });
          break;
        default:
          ctx.warn('paragraph.unexpectedChild', `unexpected child ${child.kind}`);
      }
    }

    const domain: DomainParagraph = {
      kind: 'paragraph',
      paraId: ast.paraId,
      textId: ast.textId,
      props,
      sectionBreak: ast.pPr?.sectPr ? sectionMapper.in(ast.pPr.sectPr, ctx) : undefined,
      children,
      preservedExtensions: gatherPreservedExtensions(ast),
    };
    return domain;
  },

  out(node, ctx): AstParagraph {
    const pPr = buildParagraphPropertiesAst(node, ctx);
    const children: AstParagraph['children'] = [];

    for (const child of node.children) {
      switch (child.kind) {
        case 'run':
          children.push(runMapper.out(child, ctx));
          break;
        case 'hyperlink':
          children.push(hyperlinkMapper.out(child, ctx));
          break;
        case 'bookmarkStart':
        case 'bookmarkEnd':
          children.push(bookmarkMapper.out(child, ctx));
          break;
        case 'field':
          children.push(...fieldMapper.outMany(child, ctx));
          break;
        case 'sdt':
          children.push(sdtMapper.out(child, ctx));
          break;
        case 'commentRange':
          children.push(...commentRangeMapper.outMany(child, ctx));
          break;
        case 'revision':
          children.push(revisionMapper.out(child, ctx));
          break;
        case 'preservedExtension':
          children.push({
            kind: 'opaque',
            raw: child.ext.raw,
            originalQName: { ns: child.ext.uri, local: '', prefix: '' },
          });
          break;
      }
    }

    return {
      kind: 'p',
      paraId: node.paraId,
      textId: node.textId,
      pPr,
      children,
      unknownChildren:
        node.preservedExtensions?.filter((e) => isUnknownChild(e)).map(asOpaque) ?? [],
    };
  },
};

function paragraphPropsIn(ast: AstParagraphProperties, ctx: MapInContext): DomainPProps {
  return {
    styleId: ast.pStyle,
    alignment: ast.jc,
    numbering: ast.numbering
      ? { listId: ast.numbering.numId, level: ast.numbering.ilvl }
      : undefined,
    spacing: ast.spacing
      ? {
          before: ast.spacing.before?.twip,
          after: ast.spacing.after?.twip,
          line: ast.spacing.line?.twip,
          lineRule: ast.spacing.lineRule,
        }
      : undefined,
    indent: ast.indent
      ? {
          start: ast.indent.start?.twip ?? ast.indent.left?.twip,
          end: ast.indent.end?.twip ?? ast.indent.right?.twip,
          firstLine: ast.indent.firstLine?.twip,
          hanging: ast.indent.hanging?.twip,
        }
      : undefined,
    keepNext: ast.keepNext === true,
    keepLines: ast.keepLines === true,
    pageBreakBefore: ast.pageBreakBefore === true,
    widowControl: ast.widowControl !== false,
    outlineLevel: ast.outlineLvl,
    tabs: ast.tabs?.map((t) => ({ position: t.pos.twip, alignment: t.val, leader: t.leader })),
    borders: ast.borders ? mapParagraphBordersIn(ast.borders) : undefined,
    shading: ast.shading ? mapShadingIn(ast.shading) : undefined,
    frame: ast.frame ? mapFrameIn(ast.frame) : undefined,
    paraMarkRunProps: ast.rPr ? mapRunPropsIn(ast.rPr, ctx) : undefined,
    change: ast.pPrChange ? mapPPrChangeIn(ast.pPrChange, ctx) : undefined,
  };
}
```

---

## 11. Styles (`src/reader/styles-reader.ts`, `src/resolve/style-chain.ts`)

### 11.1 `styles.xml` contents

Three flavors of `w:style`:

- `type="paragraph"` — default for paragraphs
- `type="character"` — run-level
- `type="table"` — table styles
- `type="numbering"` — bundle numbering with paragraph

Each style has:

- `@w:styleId`: the invariant style identifier
- `@w:default="1"`: there's exactly one default per type
- `@w:customStyle="1"`: user-created
- `<w:name w:val="..."/>`: locale-translated display name
- `<w:basedOn w:val="..."/>`: inheritance (max chain depth 10 enforced)
- `<w:next w:val="..."/>`: next paragraph style (Enter behavior)
- `<w:link w:val="..."/>`: pair link between a paragraph style and a linked character style
- `<w:uiPriority w:val="9"/>`: UI ordering
- `<w:qFormat/>`, `<w:hidden/>`, `<w:semiHidden/>`, `<w:unhideWhenUsed/>`, `<w:locked/>`
- `<w:rsid w:val="..."/>`, `<w:autoRedefine/>`
- `<w:pPr>...`/`<w:rPr>...`/`<w:tblPr>...`/`<w:trPr>...`/`<w:tcPr>...` — the style's properties
- Table style exceptions: `<w:tblStylePr w:type="firstRow|lastRow|firstCol|lastCol|band1Vert|band2Vert|band1Horz|band2Horz|neCell|nwCell|seCell|swCell|wholeTable">...</w:tblStylePr>`

### 11.2 In-memory representation

```ts
export interface StyleIndex {
  readonly latentStyles?: LatentStyles;
  readonly docDefaults?: DocDefaults;
  readonly styles: ReadonlyMap<string, Style>;
  /** Resolve a style ID to its effective (merged through basedOn) properties. */
  resolve(styleId: string, kind: StyleKind): ResolvedStyle;
}

export interface Style {
  readonly id: string;
  readonly kind: StyleKind;
  readonly name: string;
  readonly aliases: ReadonlyArray<string>;
  readonly basedOn?: string;
  readonly next?: string;
  readonly link?: string;
  readonly customStyle: boolean;
  readonly default: boolean;
  readonly semiHidden: boolean;
  readonly hidden: boolean;
  readonly uiPriority?: number;
  readonly pPr?: ParagraphProperties;
  readonly rPr?: RunProperties;
  readonly tblPr?: TableProperties;
  readonly trPr?: TableRowProperties;
  readonly tcPr?: TableCellProperties;
  readonly tblStylePr?: ReadonlyArray<TableStyleException>;
}

export type StyleKind = 'paragraph' | 'character' | 'table' | 'numbering';
```

### 11.3 Inheritance resolution

We resolve lazily, memoized by styleId+kind:

```ts
class StyleIndexImpl implements StyleIndex {
  private cache = new Map<string, ResolvedStyle>();

  resolve(styleId: string, kind: StyleKind): ResolvedStyle {
    const key = `${kind}:${styleId}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const chain: Style[] = [];
    let current = this.styles.get(styleId);
    const seen = new Set<string>();
    while (current && !seen.has(current.id) && chain.length < 10) {
      seen.add(current.id);
      chain.push(current);
      current = current.basedOn ? this.styles.get(current.basedOn) : undefined;
    }
    // Merge from root-most (end of chain) outward
    const merged = this.mergeChain(chain.reverse(), kind);
    this.cache.set(key, merged);
    return merged;
  }
  // ...
}
```

Domain never materializes resolved styles; we keep style IDs as references and resolve at render time. This preserves the fact that "Heading 1 bold" may come from the style or direct formatting, distinguishable on save.

### 11.4 Built-in styles

`Normal`, `Heading1..9`, `HyperLink`, `Strong`, `Emphasis`, etc. If `styles.xml` is missing or a referenced style is missing, we substitute built-in defaults (bundled with the package).

### 11.5 Locale-specific IDs

Some producers (notably Microsoft Word in German locales) write `Überschrift1` instead of `Heading1`. We preserve the ID _verbatim_. We maintain a normalization table that maps common locale-specific IDs to a semantic identity (`heading-1`), used only when the UI needs to show a canonical name or when exporting to HTML (where we pick `h1`).

---

## 12. Numbering (`src/reader/numbering-reader.ts`, `src/resolve/numbering-runtime.ts`)

### 12.1 Parsed structure

```ts
export interface NumberingIndex {
  readonly abstractNums: ReadonlyMap<number, AbstractNum>;
  readonly nums: ReadonlyMap<number, NumInstance>;
  readonly numIdMacAtCleanup?: number; // w:numIdMacAtCleanup
}

export interface AbstractNum {
  readonly abstractNumId: number;
  readonly nsid?: string;
  readonly multiLevelType?: 'singleLevel' | 'multilevel' | 'hybridMultilevel';
  readonly tmpl?: string; // hash Word uses for template identity
  readonly name?: string;
  readonly styleLink?: string;
  readonly numStyleLink?: string;
  readonly levels: ReadonlyArray<NumLevel>; // exactly 9 levels allowed (0..8)
}

export interface NumLevel {
  readonly ilvl: number;
  readonly start?: number;
  readonly numFmt: NumFmt;
  readonly lvlText: string; // e.g., "%1.%2."
  readonly lvlJc?: 'start' | 'end' | 'center' | 'left' | 'right';
  readonly restart?: number;
  readonly suff?: 'tab' | 'space' | 'nothing';
  readonly lvlPicBulletId?: number;
  readonly pPr?: ParagraphProperties;
  readonly rPr?: RunProperties;
  readonly isLgl?: ToggleVal;
  readonly legacy?: { legacy: boolean; legacyIndent?: number; legacySpace?: number };
  readonly pStyle?: string;
}

export type NumFmt =
  | 'decimal'
  | 'upperRoman'
  | 'lowerRoman'
  | 'upperLetter'
  | 'lowerLetter'
  | 'bullet'
  | 'ordinal'
  | 'cardinalText'
  | 'ordinalText'
  | 'hex'
  | 'decimalZero'
  | 'decimalFullWidth'
  | 'decimalHalfWidth'
  | 'japaneseCounting'
  | 'japaneseDigitalTenThousand'
  | 'aiueo'
  | 'iroha'
  | 'japaneseLegal'
  | 'chineseCounting'
  | 'chineseCountingThousand'
  | 'chineseLegalSimplified'
  | 'koreanCounting'
  | 'koreanDigital'
  | 'koreanLegal'
  | 'vietnameseCounting'
  | 'russianLower'
  | 'russianUpper'
  | 'hebrew1'
  | 'hebrew2'
  | 'arabicAlpha'
  | 'arabicAbjad'
  | 'hindiVowels'
  | 'hindiConsonants'
  | 'hindiNumbers'
  | 'hindiCounting'
  | 'thaiLetters'
  | 'thaiNumbers'
  | 'thaiCounting'
  | 'bahtText'
  | 'dollarText'
  | 'ganada'
  | 'chosung'
  | 'decimalEnclosedCircle'
  | 'decimalEnclosedCircleChinese'
  | 'decimalEnclosedFullstop'
  | 'decimalEnclosedParen'
  | 'decimalFullWidth2'
  | 'aiueoFullWidth'
  | 'irohaFullWidth'
  | 'taiwaneseCounting'
  | 'ideographEnclosedCircle'
  | 'ideographTraditional'
  | 'ideographZodiac'
  | 'ideographZodiacTraditional'
  | 'ideographLegalTraditional'
  | 'taiwaneseCountingThousand'
  | 'taiwaneseDigital'
  | 'numberInDash'
  | 'none'
  | 'custom';

export interface NumInstance {
  readonly numId: number;
  readonly abstractNumId: number;
  readonly lvlOverrides: ReadonlyArray<LvlOverride>;
}

export interface LvlOverride {
  readonly ilvl: number;
  readonly startOverride?: number;
  readonly lvl?: NumLevel;
}
```

### 12.2 Runtime iteration

We build counters per `numId` (not per abstractNum — overrides diverge):

```ts
export class NumberingRuntime {
  private counters = new Map<number, number[]>(); // numId → counter per ilvl

  /** Given a paragraph referencing numId+ilvl, return the number text to render. */
  format(numId: number, ilvl: number, index: NumberingIndex): string {
    const counters = this.counters.get(numId) ?? this.initCounters(numId, index);
    // Increment counter at ilvl; reset deeper levels if lvl.restart allows
    counters[ilvl] = (counters[ilvl] ?? 0) + 1;
    for (let i = ilvl + 1; i < counters.length; i++) {
      const level = this.levelFor(numId, i, index);
      if (level.restart === undefined || level.restart <= ilvl + 1) {
        counters[i] = (level.start ?? 1) - 1;
      }
    }
    const level = this.levelFor(numId, ilvl, index);
    return formatLvlText(level.lvlText, counters, level, index);
  }
}
```

`formatLvlText` expands `%1`, `%2`, …, `%9` placeholders in `lvlText` using the formatted values of counters 0..8 with their respective NumFmt.

Example: `"%1.%2."` with `decimal` at both levels and counters `[3, 2]` → `"3.2."`

Roman numerals use a lookup table; letters wrap for Lotus-style A..Z, AA..ZZ, AAA…; Chinese/Japanese/Korean formats use character tables; ordinals/cardinals use English word tables (localized via `w:lang`).

### 12.3 Bullet vs. number

When `numFmt="bullet"`, we ignore counters and emit `lvlText` literally. The text typically contains a single character from a symbol font (e.g., Wingdings). We preserve the rFonts on the level's rPr so the symbol renders correctly.

### 12.4 Picture bullets

`w:lvlPicBulletId` references a `<w:numPicBullet>` top-level element that contains a `<w:pict>` with the bullet image. We treat these as images keyed by `numPicBulletId`.

---

## 13. Fields (`src/mappers/field.ts`)

### 13.1 Simple fields

```xml
<w:p>
  <w:r><w:t xml:space="preserve">Today is </w:t></w:r>
  <w:fldSimple w:instr=" DATE \@ &quot;MMMM d, yyyy&quot; ">
    <w:r><w:t>April 17, 2026</w:t></w:r>
  </w:fldSimple>
</w:p>
```

Parsed into:

```ts
interface FieldSimple {
  kind: 'field';
  mode: 'simple';
  instruction: string;
  cachedRuns: ReadonlyArray<Run>;
}
```

### 13.2 Complex fields

State machine walks:

```
w:fldChar fldCharType="begin"
w:instrText  → collect into instruction string
(optional) w:fldChar fldCharType="separate"
[result runs]
w:fldChar fldCharType="end"
```

Fields can be nested; we maintain a stack.

```ts
class FieldStateMachine {
  private stack: FieldBuilder[] = [];

  onFldCharBegin(): void {
    this.stack.push({ instruction: '', result: [], nested: [] });
  }
  onInstrText(text: string): void {
    const top = this.stack.at(-1);
    if (!top) throw new ParseError('instrText outside field');
    top.instruction += text;
  }
  onFldCharSeparate(): void {
    const top = this.stack.at(-1);
    if (!top) throw new ParseError('separate outside field');
    top.phase = 'result';
  }
  onFldCharEnd(): Field {
    const top = this.stack.pop();
    if (!top) throw new ParseError('end outside field');
    const parent = this.stack.at(-1);
    const field = buildField(top);
    parent?.nested.push(field);
    return field;
  }
  onRun(run: Run): void {
    const top = this.stack.at(-1);
    if (!top || top.phase !== 'result') return; // not in a field: handled elsewhere
    top.result.push(run);
  }
}
```

### 13.3 Supported field types

Full list with parser and optional recomputer:

| Field                                                     | Parse     | Recompute   | Notes                                                                                                                |
| --------------------------------------------------------- | --------- | ----------- | -------------------------------------------------------------------------------------------------------------------- |
| `DATE`                                                    | yes       | yes         | `\@ format` for date format; `\l` last-used locale                                                                   |
| `TIME`                                                    | yes       | yes         | same format codes                                                                                                    |
| `CREATEDATE`, `SAVEDATE`, `PRINTDATE`, `EDITTIME`         | yes       | yes         | use docProps timestamps                                                                                              |
| `PAGE`                                                    | yes       | yes         | page counter at render                                                                                               |
| `NUMPAGES`, `SECTIONPAGES`                                | yes       | yes         |                                                                                                                      |
| `SECTION`                                                 | yes       | yes         |                                                                                                                      |
| `AUTHOR`, `USERNAME`, `USERINITIALS`, `USERADDRESS`       | yes       | yes         | from settings                                                                                                        |
| `FILENAME`                                                | yes       | yes         | `\p` with path                                                                                                       |
| `FILESIZE`                                                | yes       | yes         |                                                                                                                      |
| `TITLE`, `SUBJECT`, `KEYWORDS`, `DOCPROPERTY`, `COMMENTS` | yes       | yes         | from core.xml                                                                                                        |
| `TOC`                                                     | yes       | yes         | builds from headings; switches `\o "1-3" \h \z \u`                                                                   |
| `TC`                                                      | yes       | -           | TOC entry marker                                                                                                     |
| `PAGEREF`                                                 | yes       | yes         | resolve bookmark → page                                                                                              |
| `REF`                                                     | yes       | yes         | resolve bookmark → text                                                                                              |
| `HYPERLINK`                                               | yes       | -           | preserved; clickable                                                                                                 |
| `SEQ`                                                     | yes       | yes         | figure/table captions                                                                                                |
| `LISTNUM`                                                 | yes       | yes         |                                                                                                                      |
| `INCLUDEPICTURE`, `INCLUDETEXT`                           | yes       | partial     | we fetch with user consent                                                                                           |
| `SYMBOL`                                                  | yes       | yes         | character code                                                                                                       |
| `EQ`                                                      | yes       | render-only | Word 95 equation editor; we parse enough to render                                                                   |
| `IF`                                                      | yes       | yes         | conditional                                                                                                          |
| `=formula`                                                | yes       | yes         | table formulas: SUM(ABOVE), AVERAGE, COUNT, PRODUCT, MAX, MIN, IF, AND, OR, NOT, SIGN, ABS, ROUND, INT, MOD, DEFINED |
| `STYLEREF`                                                | yes       | yes         |                                                                                                                      |
| `NOTEREF`                                                 | yes       | yes         |                                                                                                                      |
| `MERGEFIELD`                                              | yes       | -           | preserved for data-merge v2                                                                                          |
| `MACROBUTTON`, `GOTOBUTTON`                               | yes       | -           | preserved                                                                                                            |
| `SET`, `ASK`, `FILLIN`                                    | yes       | partial     |                                                                                                                      |
| `QUOTE`                                                   | yes       | yes         |                                                                                                                      |
| `FORMCHECKBOX`, `FORMTEXT`, `FORMDROPDOWN`                | yes       | yes         | legacy form fields                                                                                                   |
| others                                                    | as opaque | -           | preserved instruction + result                                                                                       |

Field recompute is controlled by:

```ts
export interface WriteOptions {
  updateFields?: 'none' | 'onSave' | 'always'; // matches w:updateFields setting
}
```

### 13.4 Domain representation

```ts
export interface Field {
  readonly kind: 'field';
  readonly instruction: string;
  readonly switches: ReadonlyRecord<string, string | true>;
  readonly fieldType: FieldType; // parsed from instruction
  readonly arguments: ReadonlyArray<string>;
  readonly cachedResult: ReadonlyArray<RunLike>;
  readonly nested: ReadonlyArray<Field>;
  readonly preservedInstruction?: string; // verbatim, for unknown fields
}
```

Writer emits the preserved instruction when the parser couldn't understand it and no recompute ran.

---

## 14. Images (`src/mappers/image.ts`)

### 14.1 Discovery

Images live under `word/media/` and are referenced by relationships of type `image`. The in-line reference is either:

- DrawingML: `<w:drawing><wp:inline>...<a:blip r:embed="rId12"/>...</wp:inline></w:drawing>`
- VML: `<w:pict><v:shape><v:imagedata r:id="rId12"/></v:shape></w:pict>`

### 14.2 Formats

| Format             | Display                   | Notes                            |
| ------------------ | ------------------------- | -------------------------------- |
| PNG                | yes                       | direct                           |
| JPEG               | yes                       | direct                           |
| GIF                | yes                       | animated: first frame            |
| BMP                | yes                       | decoded via bmp-js               |
| TIFF               | yes                       | decoded via utif-wasm            |
| WMF                | rasterized preview        | emf2svg-wasm or our converter    |
| EMF                | rasterized preview        | emf2svg-wasm                     |
| PICT               | rasterized preview        | pict-wasm                        |
| EPS                | placeholder with filename | rarely appears                   |
| CGM                | placeholder with filename | legacy                           |
| SVG (via SVG blip) | yes                       | `<asvg:svgBlip r:embed="rIdN"/>` |

### 14.3 Storage

```ts
export interface DocumentImage {
  readonly relId: string;
  readonly partUri: string; // e.g., /word/media/image1.png
  readonly contentType: string; // image/png
  readonly bytes: Uint8Array; // original, never re-encoded
  readonly altText?: string;
  readonly title?: string;
  readonly cropLeft?: Percent;
  readonly cropTop?: Percent;
  readonly cropRight?: Percent;
  readonly cropBottom?: Percent;
  readonly effects?: ImageEffects;
}
```

### 14.4 Writer

We re-emit bytes verbatim; we never transcode on save. File names are preserved when practical (`image1.png` stays `image1.png`); when we add a new image, we allocate `imageN.ext` where `N` is the next integer.

### 14.5 WMF/EMF decoder

The WMF/EMF records we support for preview are:

- `EMR_HEADER`, `EMR_EOF`
- `EMR_SETMAPMODE`, `EMR_SETWINDOWEXTEX`, `EMR_SETVIEWPORTEXTEX`, `EMR_SETWINDOWORGEX`, `EMR_SETVIEWPORTORGEX`
- `EMR_CREATEPEN`, `EMR_CREATEBRUSHINDIRECT`, `EMR_SELECTOBJECT`, `EMR_DELETEOBJECT`
- `EMR_MOVETOEX`, `EMR_LINETO`, `EMR_POLYGON`, `EMR_POLYGON16`, `EMR_POLYLINE`, `EMR_POLYLINE16`, `EMR_POLYPOLYGON16`, `EMR_POLYPOLYLINE16`
- `EMR_RECTANGLE`, `EMR_ELLIPSE`, `EMR_ROUNDRECT`
- `EMR_BITBLT`, `EMR_STRETCHBLT`, `EMR_STRETCHDIBITS`
- `EMR_EXTTEXTOUTW`, `EMR_POLYTEXTOUTW`
- `EMR_CREATEFONTINDIRECTW`, `EMR_EXTCREATEFONTINDIRECTW`

Anything else → fall back to embedding the raw WMF/EMF and showing a placeholder rectangle. (This covers the overwhelming majority of Word-95-era WMFs.)

---

## 15. OLE objects (`src/mappers/ole.ts`)

### 15.1 Representation

In the document:

```xml
<w:object>
  <v:shape ... type="_x0000_t75">
    <v:imagedata r:id="rId15" o:title=""/>
  </v:shape>
  <o:OLEObject Type="Embed" ProgID="Excel.Sheet.8" ShapeID="_x0000_i1025"
               DrawAspect="Content" ObjectID="_1234567890" r:id="rId16"/>
</w:object>
```

- `r:id="rId15"` on `v:imagedata` references a preview image (WMF/EMF).
- `r:id="rId16"` on `o:OLEObject` references the embedded file (a `bin` part under `word/embeddings/`).

### 15.2 Domain

```ts
export interface OleEmbed {
  readonly kind: 'ole';
  readonly progId: string; // e.g., Excel.Sheet.8
  readonly drawAspect: 'Content' | 'Icon';
  readonly objectId: string;
  readonly previewImage: DocumentImage;
  readonly embeddedBytes: Uint8Array;
  readonly embeddedContentType: string;
}
```

We store `embeddedBytes` intact. On save we re-emit at `/word/embeddings/oleObject{N}.bin` with the original name preserved.

### 15.3 No execution

We never launch an OLE server. We never instantiate a COM object. We display only the preview image. The user can "Edit in external application" which invokes the OS handler for the embedded file type — and that's a UI-layer concern, not persistence.

---

## 16. Comments (`src/mappers/comment.ts`)

### 16.1 Parts involved

- `word/comments.xml` — comment bodies
- `word/commentsExtended.xml` (w15) — `done`, `parentId` for threading
- `word/people.xml` (w15) — author metadata (initials, name, presence IDs)
- `word/commentsIds.xml` (w16cid) — durable IDs across saves (newer)

### 16.2 In-line markers

Inside `document.xml`:

- `<w:commentRangeStart w:id="N"/>` begins the selection
- `<w:commentRangeEnd w:id="N"/>` ends it
- `<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="N"/></w:r>` is the reference marker (the floating bubble)

### 16.3 Domain shape

```ts
export interface Comment {
  readonly id: string;
  readonly author: string;
  readonly initials: string;
  readonly date: string; // ISO
  readonly bodyParagraphs: ReadonlyArray<Paragraph>;
  readonly parentId?: string; // from commentsExtended
  readonly done?: boolean; // from commentsExtended
  readonly durableId?: string; // from commentsIds
  readonly rangeStart?: RangeAnchor; // resolved to a document position
  readonly rangeEnd?: RangeAnchor;
}
```

### 16.4 Round-trip

Even parts we don't fully model (commentsIds for some Microsoft builds) are preserved as opaque parts and re-emitted.

---

## 17. Revisions / Track Changes (`src/mappers/revision.ts`)

### 17.1 Inline revisions

```xml
<w:ins w:id="1" w:author="Jon" w:date="2026-04-17T10:15:00Z">
  <w:r><w:t>new text</w:t></w:r>
</w:ins>
<w:del w:id="2" w:author="Jon" w:date="2026-04-17T10:16:00Z">
  <w:r><w:delText>old text</w:delText></w:r>
</w:del>
<w:moveFrom w:id="3" ...>
  <w:r><w:t>moved out</w:t></w:r>
</w:moveFrom>
<w:moveTo w:id="4" ...>
  <w:r><w:t>moved in</w:t></w:r>
</w:moveTo>
```

### 17.2 Property-level revisions

Attached to the property parent:

- `<w:rPrChange>` inside `<w:rPr>` — prior run properties
- `<w:pPrChange>` inside `<w:pPr>` — prior paragraph properties
- `<w:sectPrChange>` inside `<w:sectPr>` — prior section props
- `<w:tblPrChange>`, `<w:tcPrChange>`, `<w:trPrChange>`, `<w:tblGridChange>`, `<w:tblPrExChange>` — table variants
- `<w:numberingChange>` — legacy numbering change marker (Word 95/97)
- `<w:rPrChange>` on paragraph mark run properties is allowed

### 17.3 Domain

```ts
export interface Revision<T extends RevisionTarget = RevisionTarget> {
  readonly kind: 'revision';
  readonly op: RevisionOp;
  readonly id: number;
  readonly author: string;
  readonly date: string;
  readonly target: T;
}

export type RevisionOp =
  | 'insert'
  | 'delete'
  | 'moveFrom'
  | 'moveTo'
  | 'rPrChange'
  | 'pPrChange'
  | 'sectPrChange'
  | 'tblPrChange'
  | 'tcPrChange'
  | 'trPrChange'
  | 'tblGridChange'
  | 'tblPrExChange';
```

### 17.4 Accept/reject

`acceptRevisions(doc: Document, ids?: number[]): Document` produces a new domain tree with revisions applied. `rejectRevisions` reverts. Both funnel through a single `applyRevision` operator that understands each op type; the resulting tree is a normal `Document` with no revision metadata.

---

## 18. Headers and footers (`src/mappers/header-footer.ts`)

### 18.1 Parts

`word/header1.xml`, `word/header2.xml`, …, `word/footer1.xml`, `word/footer2.xml`, …

### 18.2 References

In `sectPr`:

```xml
<w:headerReference r:id="rId7" w:type="default"/>
<w:headerReference r:id="rId8" w:type="first"/>
<w:headerReference r:id="rId9" w:type="even"/>
<w:footerReference r:id="rId10" w:type="default"/>
```

### 18.3 Content

Same structure as body: paragraphs, tables, SDTs. The header/footer part root is `<w:hdr>` or `<w:ftr>`.

### 18.4 Domain

```ts
export interface Section {
  // ...
  readonly headers: {
    readonly default?: HeaderFooter;
    readonly first?: HeaderFooter;
    readonly even?: HeaderFooter;
  };
  readonly footers: {
    readonly default?: HeaderFooter;
    readonly first?: HeaderFooter;
    readonly even?: HeaderFooter;
  };
}

export interface HeaderFooter {
  readonly relId: string;
  readonly children: ReadonlyArray<BodyChild>;
}
```

### 18.5 Shared parts

Multiple sections can point to the same header/footer part via the same relId. We preserve the sharing on save.

---

## 19. Footnotes and endnotes (`src/mappers/footnote.ts`, `src/mappers/endnote.ts`)

### 19.1 Part contents

`word/footnotes.xml` contains a sequence of `<w:footnote>`:

- `w:id="0"` `w:type="separator"`
- `w:id="1"` `w:type="continuationSeparator"`
- `w:id="2"` `w:type="continuationNotice"`
- `w:id>=3` user footnotes

Each footnote has body content (paragraphs).

### 19.2 Reference

In body:

```xml
<w:r>
  <w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr>
  <w:footnoteReference w:id="3"/>
</w:r>
```

### 19.3 Endnotes

Same shape in `word/endnotes.xml` with `w:endnote`/`w:endnoteReference`.

### 19.4 Properties

Section-level properties control style, numbering format, and position:

```xml
<w:footnotePr>
  <w:pos w:val="pageBottom"/>
  <w:numFmt w:val="lowerRoman"/>
  <w:numStart w:val="1"/>
  <w:numRestart w:val="eachSect"/>
</w:footnotePr>
```

---

## 20. Hyperlinks (`src/mappers/hyperlink.ts`)

### 20.1 OOXML element form

```xml
<w:hyperlink r:id="rId13" w:history="1">
  <w:r>
    <w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr>
    <w:t>Example</w:t>
  </w:r>
</w:hyperlink>
```

Relationship:

```xml
<Relationship Id="rId13" Type=".../relationships/hyperlink"
              Target="https://example.com" TargetMode="External"/>
```

### 20.2 Internal anchors

```xml
<w:hyperlink w:anchor="MyBookmark">
  <w:r><w:t>Jump</w:t></w:r>
</w:hyperlink>
```

### 20.3 Field form

The older `HYPERLINK` field is also supported:

```xml
<w:fldSimple w:instr=" HYPERLINK &quot;https://example.com&quot; ">
  <w:r><w:t>Example</w:t></w:r>
</w:fldSimple>
```

### 20.4 Tooltip and target frame

`<w:hyperlink w:tooltip="..." w:tgtFrame="_blank">` — we preserve both.

### 20.5 Sanitization on write

On save, hyperlink targets are checked against a sanitizer. Allowed schemes: `http`, `https`, `mailto`, `ftp`, `tel`, `file` (with warning). Schemes like `javascript:`, `vbscript:`, `data:` are rejected (return a write warning and emit the link as plain text). The editor UI enforces this on input too, but persistence is the enforcement boundary we cannot bypass.

---

## 21. Bookmarks (`src/mappers/bookmark.ts`)

### 21.1 Markers

```xml
<w:bookmarkStart w:id="0" w:name="_Toc1"/>
...
<w:bookmarkEnd w:id="0"/>
```

Multiple bookmarks can overlap; IDs match starts with ends.

### 21.2 Hidden bookmarks

Names starting with `_` are hidden from UI. We preserve them; they are often generated by TOC and heading cross-references.

### 21.3 Nested/overlapping

Our domain model stores bookmarks as a set of intervals keyed by ID. Text positions are resolved as "content addresses" — pointer into the paragraph/run tree — to survive edits in the editor.

---

## 22. Drawings (`src/mappers/drawing.ts`)

### 22.1 DrawingML path

```xml
<w:drawing>
  <wp:inline distT="0" distB="0" distL="0" distR="0">
    <wp:extent cx="2000000" cy="1500000"/>
    <wp:docPr id="1" name="Picture 1"/>
    <wp:cNvGraphicFramePr>
      <a:graphicFrameLocks xmlns:a=".../drawingml/2006/main" noChangeAspect="1"/>
    </wp:cNvGraphicFramePr>
    <a:graphic xmlns:a=".../drawingml/2006/main">
      <a:graphicData uri=".../drawingml/2006/picture">
        <pic:pic xmlns:pic=".../drawingml/2006/picture">
          <pic:nvPicPr>
            <pic:cNvPr id="1" name="image1.png"/>
            <pic:cNvPicPr/>
          </pic:nvPicPr>
          <pic:blipFill>
            <a:blip r:embed="rId12"/>
            <a:stretch><a:fillRect/></a:stretch>
          </pic:blipFill>
          <pic:spPr>
            <a:xfrm><a:off x="0" y="0"/><a:ext cx="2000000" cy="1500000"/></a:xfrm>
            <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
          </pic:spPr>
        </pic:pic>
      </a:graphicData>
    </a:graphic>
  </wp:inline>
</w:drawing>
```

Anchored form uses `<wp:anchor>` with position offsets and wrap modes (`wrapNone`, `wrapSquare`, `wrapTight`, `wrapThrough`, `wrapTopAndBottom`).

### 22.2 VML path (legacy)

```xml
<w:pict>
  <v:shape id="..." o:spid="_x0000_i1025" style="width:150pt;height:100pt" type="#_x0000_t75">
    <v:imagedata r:id="rId12" o:title="image1"/>
  </v:shape>
</w:pict>
```

We parse VML enough to extract `r:id` and position; we preserve the rest of the shape XML as opaque children of the domain `Picture` node so round-trip is complete.

### 22.3 Alternate content

```xml
<mc:AlternateContent>
  <mc:Choice Requires="wps">
    <w:drawing>... shape ...</w:drawing>
  </mc:Choice>
  <mc:Fallback>
    <w:pict>... VML fallback ...</w:pict>
  </mc:Fallback>
</mc:AlternateContent>
```

On read, we prefer `mc:Choice` content when we can handle it (`wps`, `wpg`, `wpi`). When we can't, we fall back to `mc:Fallback`. **Both branches are preserved** for re-emit.

### 22.4 Shape types we implement

- Picture (`pic:pic`)
- TextBox (`wps:wsp` with `wps:txbx` → `w:txbxContent` → paragraphs)
- Line, Rectangle, Ellipse, RoundRect, PrstGeom preset shapes (rect, roundRect, ellipse, line, triangle, rtTriangle, parallelogram, trapezoid, diamond, pentagon, hexagon, heptagon, octagon, decagon, dodecagon, star4, star5, …star32, …)
- Group (`wpg:wgp`)
- Ink (`wpi:inkContentPart`)

---

## 23. Frames (`src/mappers/frame.ts`)

### 23.1 What a frame is

Word 95 had floating paragraphs via `w:framePr`. A paragraph with a frame is positioned absolutely and other text flows around it. Pre-dates DrawingML text boxes.

### 23.2 Element

```xml
<w:pPr>
  <w:framePr w:w="3000" w:h="2000" w:hRule="exact"
             w:x="1000" w:y="1000" w:xAlign="left" w:yAlign="top"
             w:hAnchor="page" w:vAnchor="page"
             w:wrap="around" w:hSpace="180" w:vSpace="180"
             w:dropCap="none" w:lines="0"/>
</w:pPr>
```

### 23.3 Domain

```ts
export interface FrameProperties {
  readonly width?: TwipValue;
  readonly height?: TwipValue;
  readonly heightRule?: 'atLeast' | 'exact' | 'auto';
  readonly x?: TwipValue;
  readonly y?: TwipValue;
  readonly xAlign?: 'left' | 'center' | 'right' | 'inside' | 'outside';
  readonly yAlign?: 'top' | 'center' | 'bottom' | 'inside' | 'outside';
  readonly hAnchor?: 'page' | 'margin' | 'text';
  readonly vAnchor?: 'page' | 'margin' | 'text';
  readonly wrap?: 'around' | 'none' | 'notBeside' | 'auto' | 'tight' | 'through';
  readonly hSpace?: TwipValue;
  readonly vSpace?: TwipValue;
  readonly dropCap?: 'none' | 'drop' | 'margin';
  readonly lines?: number;
  readonly anchorLock?: ToggleVal;
}
```

Layout engine implements frame positioning following Word's rules (see `packages/layout` architecture, out of scope here).

---

## 24. Settings (`src/reader/settings-reader.ts`)

### 24.1 Representative `settings.xml`

```xml
<w:settings xmlns:w="...">
  <w:zoom w:percent="100"/>
  <w:proofState w:spelling="clean" w:grammar="clean"/>
  <w:defaultTabStop w:val="720"/>
  <w:characterSpacingControl w:val="doNotCompress"/>
  <w:hdrShapeDefaults><o:shapedefaults v:ext="edit" spidmax="1026"/></w:hdrShapeDefaults>
  <w:footnotePr>...</w:footnotePr>
  <w:endnotePr>...</w:endnotePr>
  <w:compat>
    <w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/>
    <w:compatSetting w:name="overrideTableStyleFontSizeAndJustification" w:uri="..." w:val="1"/>
    <w:compatSetting w:name="enableOpenTypeFeatures" w:uri="..." w:val="1"/>
    <w:compatSetting w:name="doNotFlipMirrorIndents" w:uri="..." w:val="1"/>
    <w:compatSetting w:name="differentiateMultirowTableHeaders" w:uri="..." w:val="1"/>
    <w:compatSetting w:name="useWord2013TrackBottomHyphenation" w:uri="..." w:val="0"/>
  </w:compat>
  <w:rsids>...</w:rsids>
  <w:mathPr>
    <m:mathFont m:val="Cambria Math"/>
    <m:brkBin m:val="before"/>
    <m:brkBinSub m:val="--"/>
    <m:smallFrac m:val="0"/>
    <m:dispDef/>
  </w:mathPr>
  <w:themeFontLang w:val="en-US" w:eastAsia="ja-JP" w:bidi="ar-SA"/>
  <w:clrSchemeMapping w:bg1="light1" w:t1="dark1" ... />
  <w:shapeDefaults>...</w:shapeDefaults>
  <w:decimalSymbol w:val="."/>
  <w:listSeparator w:val=","/>
  <w:updateFields w:val="false"/>
  <w:documentProtection w:edit="readOnly" w:enforcement="0"/>
  <w:autoHyphenation w:val="true"/>
  <w:hyphenationZone w:val="360"/>
  <w:consecutiveHyphenLimit w:val="2"/>
  <w:doNotHyphenateCaps w:val="true"/>
</w:settings>
```

### 24.2 Domain

```ts
export interface AppSettings {
  readonly zoom?: Zoom;
  readonly defaultTabStopTwip: number;
  readonly characterSpacingControl:
    | 'doNotCompress'
    | 'compressPunctuation'
    | 'compressPunctuationAndJapaneseKana';
  readonly autoHyphenation: boolean;
  readonly hyphenationZoneTwip: number;
  readonly consecutiveHyphenLimit: number;
  readonly doNotHyphenateCaps: boolean;
  readonly decimalSymbol: string;
  readonly listSeparator: string;
  readonly updateFields: boolean;
  readonly documentProtection?: DocumentProtection;
  readonly compat: ReadonlyArray<CompatSetting>;
  readonly mathProperties?: MathProperties;
  readonly themeFontLang?: ThemeFontLang;
  readonly proofState?: ProofState;
  readonly footnoteProperties?: FootnoteProperties;
  readonly endnoteProperties?: EndnoteProperties;
  readonly rsids?: RsidsSet;
  readonly extensionProperties: ReadonlyArray<PreservedExtension>;
}
```

The writer emits exactly what the settings had plus our updates; we never drop unknown children.

---

## 25. Font table (`src/reader/font-table-reader.ts`)

### 25.1 Part shape

```xml
<w:fonts xmlns:w="...">
  <w:font w:name="Calibri">
    <w:panose1 w:val="020F0502020204030204"/>
    <w:charset w:val="00"/>
    <w:family w:val="swiss"/>
    <w:pitch w:val="variable"/>
    <w:sig w:usb0="..." w:usb1="..." w:usb2="..." w:usb3="..." w:csb0="..." w:csb1="..."/>
    <w:embedRegular r:id="rId1"/>
    <w:embedBold r:id="rId2"/>
    <w:embedItalic r:id="rId3"/>
    <w:embedBoldItalic r:id="rId4"/>
    <w:altName w:val="Candara"/>
  </w:font>
  ...
</w:fonts>
```

### 25.2 Domain

```ts
export interface FontTableEntry {
  readonly name: string;
  readonly panose?: string;
  readonly charset?: number;
  readonly family?: 'auto' | 'decorative' | 'modern' | 'roman' | 'script' | 'swiss';
  readonly pitch?: 'default' | 'fixed' | 'variable';
  readonly signature?: FontSignature;
  readonly altName?: string;
  readonly embedRegularRelId?: string;
  readonly embedBoldRelId?: string;
  readonly embedItalicRelId?: string;
  readonly embedBoldItalicRelId?: string;
}
```

### 25.3 Embedded font obfuscation

Embedded TrueType/OpenType fonts in DOCX are XOR-obfuscated with a GUID. The algorithm per ECMA-376 Part 2:

1. Take the relationship's `Target` URI, extract the last path segment (`fontData01.odttf`).
2. The GUID for the obfuscation comes from the `w:font`'s sibling metadata (Word-assigned GUID). In Microsoft's obfuscation (a.k.a. "Mace" protection), the 16 bytes of the GUID are used to XOR the first 32 bytes of the font file in two 16-byte blocks.
3. GUID parsing: bytes 0..3 little-endian DWORD, 4..5 and 6..7 little-endian WORDs, 8..15 big-endian. So the byte order of the GUID bytes for XOR is `{3,2,1,0,5,4,7,6,8,9,10,11,12,13,14,15}`.
4. XOR block 0 of the font file (bytes 0..15) with the re-ordered GUID bytes.
5. XOR block 1 (bytes 16..31) with the same GUID bytes.
6. Bytes 32+ are unaltered.
7. The result is the clean TTF/OTF file.

Implementation:

```ts
export function deobfuscateFont(bytes: Uint8Array, obfuscationGuid: string): Uint8Array {
  const guid = parseGuidBytes(obfuscationGuid); // 16 bytes in re-order
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    if (i < 32) {
      out[i] = bytes[i] ^ guid[i % 16];
    } else {
      out[i] = bytes[i];
    }
  }
  return out;
}
```

On write, we re-obfuscate with the same GUID (we preserve it per-font) so output fonts are byte-identical when unedited.

### 25.4 FontFace registration

The renderer uses the Web Font API (`new FontFace`) to register deobfuscated fonts. Registration is keyed by the font's internal `name` table (we parse it with a minimal TTF reader to avoid name collisions).

### 25.5 Substitution

`w:altName` is honored only as a fallback suggestion; we still look up the primary name first in the system font table.

---

## 26. Theme (`src/reader/theme-reader.ts`)

### 26.1 Part shape

```xml
<a:theme xmlns:a="..." name="Office">
  <a:themeElements>
    <a:clrScheme name="Office">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="44546A"/></a:dk2>
      <a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
      <a:accent1><a:srgbClr val="4472C4"/></a:accent1>
      <a:accent2><a:srgbClr val="ED7D31"/></a:accent2>
      <a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>
      <a:accent4><a:srgbClr val="FFC000"/></a:accent4>
      <a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>
      <a:accent6><a:srgbClr val="70AD47"/></a:accent6>
      <a:hlink><a:srgbClr val="0563C1"/></a:hlink>
      <a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Office">
      <a:majorFont>
        <a:latin typeface="Calibri Light" panose="020F0302020204030204"/>
        <a:ea typeface=""/>
        <a:cs typeface=""/>
        <!-- script overrides -->
      </a:majorFont>
      <a:minorFont>
        <a:latin typeface="Calibri" panose="020F0502020204030204"/>
        <a:ea typeface=""/>
        <a:cs typeface=""/>
      </a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Office">
      <a:fillStyleLst>...</a:fillStyleLst>
      <a:lnStyleLst>...</a:lnStyleLst>
      <a:effectStyleLst>...</a:effectStyleLst>
      <a:bgFillStyleLst>...</a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
  <a:objectDefaults/>
  <a:extraClrSchemeLst/>
</a:theme>
```

### 26.2 Domain

```ts
export interface Theme {
  readonly name: string;
  readonly colorScheme: ColorScheme;
  readonly fontScheme: FontScheme;
  readonly formatScheme?: FormatScheme; // preserved
  readonly raw: string; // verbatim for round-trip
}
```

We parse color scheme and font scheme for rendering; the `raw` field is what we emit to preserve fidelity exactly.

### 26.3 Application

When run/paragraph properties reference `themeColor`, we resolve from the color scheme. When they use `rFonts` with `asciiTheme="majorHAnsi"`, we resolve from `majorFont.latin.typeface`.

---

## 27. docProps (`src/mappers/doc-props.ts`)

### 27.1 `core.xml` (Dublin Core subset)

```xml
<cp:coreProperties xmlns:cp="..." xmlns:dc="..." xmlns:dcterms="..." xmlns:dcmitype="..." xmlns:xsi="...">
  <dc:title>My document</dc:title>
  <dc:subject>Course paper</dc:subject>
  <dc:creator>Jon</dc:creator>
  <cp:keywords>words parity</cp:keywords>
  <dc:description>The description</dc:description>
  <cp:lastModifiedBy>Jon</cp:lastModifiedBy>
  <cp:revision>3</cp:revision>
  <dcterms:created xsi:type="dcterms:W3CDTF">2026-04-17T10:00:00Z</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">2026-04-17T12:00:00Z</dcterms:modified>
</cp:coreProperties>
```

### 27.2 `app.xml`

```xml
<Properties xmlns="..." xmlns:vt="...">
  <Template>Normal.dotm</Template>
  <TotalTime>42</TotalTime>
  <Pages>10</Pages>
  <Words>3500</Words>
  <Characters>20000</Characters>
  <Application>Word95 (our app)</Application>
  <DocSecurity>0</DocSecurity>
  <Lines>300</Lines>
  <Paragraphs>120</Paragraphs>
  <ScaleCrop>false</ScaleCrop>
  <Company>My Org</Company>
  <LinksUpToDate>false</LinksUpToDate>
  <CharactersWithSpaces>23500</CharactersWithSpaces>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
  <AppVersion>16.0000</AppVersion>
  <HeadingPairs>
    <vt:vector size="4" baseType="variant">
      <vt:variant><vt:lpstr>Title</vt:lpstr></vt:variant>
      <vt:variant><vt:i4>1</vt:i4></vt:variant>
      <vt:variant><vt:lpstr>Headings</vt:lpstr></vt:variant>
      <vt:variant><vt:i4>3</vt:i4></vt:variant>
    </vt:vector>
  </HeadingPairs>
  <TitlesOfParts>
    <vt:vector size="4" baseType="lpstr">
      <vt:lpstr>My document</vt:lpstr>
      <vt:lpstr>Chapter 1</vt:lpstr>
      <vt:lpstr>Chapter 2</vt:lpstr>
      <vt:lpstr>Chapter 3</vt:lpstr>
    </vt:vector>
  </TitlesOfParts>
</Properties>
```

### 27.3 `custom.xml`

```xml
<Properties xmlns="..." xmlns:vt="...">
  <property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="CustomField">
    <vt:lpwstr>Value</vt:lpwstr>
  </property>
</Properties>
```

Supported `vt:*` types we map in full (lpstr, lpwstr, i4, i8, r8, bool, filetime, decimal, clsid, vector, array, blob, oblob). We preserve raw for unknown.

### 27.4 Update on save

```ts
export interface DocPropsUpdatePolicy {
  updateCore: {
    lastModifiedBy: boolean; // from signed-in user
    modified: boolean; // now()
    revision: boolean; // increment
  };
  updateApp: {
    pages: boolean; // from renderer's page count
    words: boolean; // from word counter
    characters: boolean;
    charactersWithSpaces: boolean;
    lines: boolean;
    paragraphs: boolean;
    totalTime: boolean; // accumulate editing time
    appVersion: boolean;
    application: boolean;
  };
}
```

Defaults to updating everything on save. Can be disabled per property.

---

## 28. Glossary / Building Blocks (`src/reader/glossary-reader.ts`)

### 28.1 Part

`word/glossary/document.xml` has a `<w:glossaryDocument>` root with `<w:docParts>` containing `<w:docPart>` entries.

```xml
<w:docPart>
  <w:docPartPr>
    <w:name w:val="MyAutoText"/>
    <w:style w:val="Normal"/>
    <w:category>
      <w:name w:val="General"/>
      <w:gallery w:val="autoTxt"/>
    </w:category>
    <w:types><w:type w:val="autoTxt"/></w:types>
    <w:behaviors><w:behavior w:val="content"/></w:behaviors>
    <w:description w:val="..."/>
    <w:guid w:val="{...}"/>
  </w:docPartPr>
  <w:docPartBody>
    <w:p>...</w:p>
  </w:docPartBody>
</w:docPart>
```

### 28.2 Gallery values

`placeholder`, `any`, `default`, `docParts`, `coverPg`, `eq`, `ftrs`, `hdrs`, `pgNum`, `tbls`, `watermarks`, `autoTxt`, `txtBox`, `pgNumT`, `pgNumB`, `pgNumMargins`, `tblOfContents`, `bib`, `custQuickParts`, `custCoverPg`, `custEq`, `custFtrs`, `custHdrs`, `custTblOfContents`, `custBib`, `cust1`–`cust5`, `custAutoTxt`, `custTxtBox`, `custPgNum`, `custPgNumT`, `custPgNumB`, `custPgNumMargins`, `custTbls`, `custWatermarks`.

We preserve all values verbatim. We surface only `autoTxt` in our MVP UI.

### 28.3 Domain

```ts
export interface Glossary {
  readonly docParts: ReadonlyArray<GlossaryDocPart>;
  readonly raw: string; // full opaque copy for perfect round-trip
}
```

---

## 29. Alternative formats

### 29.1 RTF 1.9.1 (`@word/docx-rtf`)

RTF is a different beast: ASCII control words, group braces, hex entities for non-ASCII, destination groups. The codec is a separate package.

- **Reader:** Streaming character-level tokenizer → control-word interpreter → RTF IDF → domain (via a parallel mapper set).
- **Writer:** domain → RTF IDF → control-word emitter.
- **IDF (RTF intermediate):** paragraph list with runs, tables, fields, images (as `\pict` with `\wmetafile` or `\pngblip`/`\jpegblip`), colors, font table, stylesheet, info group.
- **Feature subset (MVP):**
  - Paragraph formatting: alignment, indentation, spacing, tabs.
  - Run formatting: bold/italic/underline/strike/superscript/subscript/color/fontsize/font.
  - Tables (`\trowd`/`\cellx`).
  - Lists (simple `\pnlvl`/`\listtext` form and modern `\ls{N}\ilvl{N}`).
  - Fields (`\field{\*\fldinst ...}{\fldrslt ...}`).
  - Images (`\pict` group with the `\pngblip` binary base).
  - Hyperlinks (via `\field{\*\fldinst HYPERLINK ...}`).
  - Unicode (`\u{N} ?` surrogates).
- **Stretch:** EQ field parsing, math types, page borders, more drawing shapes.
- **Acknowledged RTF complexity:** RTF's "Word-compatible RTF" is a moving target; we target the 1.9.1 spec plus the `\*\` destinations Word still emits. We document which constructs we drop or downgrade.

### 29.2 TXT (`@word/docx-txt`)

- **Reader:** BOM sniff (UTF-8, UTF-16 LE/BE, UTF-32). Fallback: heuristic (bigram model for UTF-8 vs. Windows-1252). Produce a single-section `Document` with one paragraph per line. Empty lines → empty paragraph. Tabs remain.
- **Writer:** Serialize all runs to plain text. Line endings: LF by default, CRLF when exporting for Windows. BOM optional. Hard line breaks (Shift+Enter) → LF in-paragraph vs. a paragraph break → paragraph break.
- **Encoding choice on write:** UTF-8 no-BOM default; `WriteOptions.encoding` override.

### 29.3 HTML (`@word/docx-html`)

**Import:** DOMParser parses the HTML, DOMPurify sanitizes (strip `<script>`, `javascript:`, inline event handlers, `data:` URIs except images). Element mapping:

| HTML                                                 | Domain                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| `p`                                                  | Paragraph                                                                |
| `h1`..`h6`                                           | Paragraph with styleId=`Heading1`..`Heading6`                            |
| `strong`, `b`                                        | Run bold                                                                 |
| `em`, `i`                                            | Run italic                                                               |
| `u`                                                  | Run underline                                                            |
| `s`, `strike`, `del`                                 | Run strike                                                               |
| `sup`, `sub`                                         | Run vertAlign                                                            |
| `br`                                                 | Break                                                                    |
| `span[style]`                                        | Run with decoded CSS                                                     |
| `a[href]`                                            | Hyperlink                                                                |
| `ul`, `ol`, `li`                                     | numbered paragraphs                                                      |
| `table`, `thead`, `tbody`, `tfoot`, `tr`, `td`, `th` | Table                                                                    |
| `img`                                                | Image (we fetch src or decode data: URI and add as media part on export) |
| `blockquote`                                         | Paragraph with left indent                                               |
| `pre`, `code`                                        | Code paragraph (monospace run)                                           |
| `hr`                                                 | Paragraph with bottom border                                             |
| `figure`, `figcaption`                               | Paragraph group with caption                                             |
| `details`, `summary`                                 | Collapsible SDT content control                                          |

CSS properties decoded: `font-family`, `font-size`, `font-weight`, `font-style`, `text-decoration`, `color`, `background-color`, `text-align`, `margin-*`, `padding-*`, `border`, `line-height`.

**Export:** Domain → HTML5 with inline CSS on runs (we prefer inline for maximum portability; optional class-based export when embedding in a page).

### 29.4 `.doc` (legacy binary) via external converter

No in-process parsing. Detect CFB magic (`D0 CF 11 E0`). Prompt user: "This is a legacy .doc file. Convert using [LibreOffice headless (detected) / Apache Tika / user to save as .docx]?"

```ts
// packages/docx-converters/src/converter.ts
export interface IConverter {
  readonly name: string;
  readonly available: Promise<boolean>;
  convert(input: { bytes: Uint8Array; fromExt: string; toExt: string }): Promise<Uint8Array>;
}

export class LibreOfficeConverter implements IConverter {
  readonly name = 'libreoffice';
  readonly available: Promise<boolean>;
  constructor(private options: { sofficePath?: string; timeoutMs?: number }) {
    this.available = this.probe();
  }
  async convert(input) {
    // spawn soffice --headless --convert-to docx --outdir <tmp> <input>
    // read output and return bytes
  }
  private async probe(): Promise<boolean> { ... }
}
```

The persistence package doesn't itself spawn processes; that lives in the Electron main process and calls back with bytes. The codec in `@word/docx-converters` is an interface definition with a default LibreOffice implementation.

### 29.5 MHTML (optional, v2)

"Save as Web Page (Complete)" in Word packages the HTML plus images plus CSS into a multipart MIME message. We'd serialize using an HTML codec + MIME packager. Punt to v2.

---

## 30. Round-trip fidelity

### 30.1 Fidelity definition

Two DOCX packages are _semantically equivalent_ iff, after canonicalization, their AST trees are identical. Canonicalization performs:

- Attribute ordering per canonical tables (Section 8.3).
- Removal of default-valued attributes (when the default is unambiguous and listed in our default-attribute table).
- Collapsing of `<w:rFonts w:ascii="X" w:hAnsi="X" w:cs="X" w:eastAsia="X"/>` to the same thing it was.
- Normalizing namespace prefixes.
- Normalizing whitespace between sibling elements (not within `w:t`).

### 30.2 Known acceptable lossy transforms

- **Relationship IDs** get re-sequenced on save (rId1, rId2 …). We keep a mapping so any `rId` that appeared as content (e.g., in SDT-stored XML, in settings, in VML) is rewritten consistently.
- **Comment IDs** preserved verbatim; new comments allocate the next integer.
- **Bookmark IDs** re-sequenced from 0 on save (Word itself does this). Cross-references by _name_ (not id) are unaffected.
- **Whitespace** between sibling elements normalized (never inside `w:t`).
- **Ordering of children of `w:rPr`, `w:pPr`, `w:sectPr`, `w:tblPr`** reordered to canonical per ECMA-376 schema.
- **Optional default-valued attributes** dropped (e.g., `w:val="true"` on a toggle child where value `true` is default when attribute is absent).
- **Style ID renumbering** — never. IDs stay verbatim.
- **Unknown elements** pass through **bytewise**. Not canonicalized.
- **Unknown namespaces** declared on root if referenced; dropped if unused.
- **CRLF→LF normalization** inside text content is NOT applied; original line endings preserved.

### 30.3 Golden corpus tests

```
test/corpus/
  real-world/           ~1500 real DOCX files (permissively licensed)
  microsoft-samples/    ~200 files from Word documentation
  word-95-converted/    ~300 files saved from Word 95 via later Word versions
  libreoffice-generated/ ~500 files from LibreOffice
  google-docs-export/   ~500 files
  synthetic/            ~2000 generated property-test files
  pathological/         ~50 files that exercise obscure features
```

Test:

```ts
for (const file of corpus) {
  const orig = await readFile(file);
  const doc1 = await reader.read(orig);
  const out1 = await writer.write(doc1);
  const doc2 = await reader.read(out1);
  const out2 = await writer.write(doc2);
  expect(canonicalize(out1)).toEqual(canonicalize(out2)); // stable after first save
  expect(canonicalize(docAst(doc1))).toEqual(canonicalize(docAst(doc2))); // tree stable
}
```

### 30.4 Pixel-level rendering comparisons

Separate from persistence: the layout engine + renderer stack has its own pixel-diff suite. Persistence asserts _tree_ equality; rendering asserts _pixel_ equality.

### 30.5 Fuzz

For each corpus file, generate 100 mutations:

- Random byte flips in the ZIP (decode should fail cleanly or repair lenient).
- Truncated ZIPs.
- Malformed XML in random parts.
- Oversized uncompressed sizes.
- Invalid UTF-8 in text content.
- Cyclic `basedOn` in styles.
- Deeply nested `w:r` inside `w:r` (invalid but seen in wild).
- Missing relationships referenced from content.
- Orphan relationships (no referencer).

Expected: no crashes, no infinite loops, no memory blowups, no code execution. Result: `Result<Document, DocxReadError[]>` with appropriate warnings.

---

## 31. Error model (`src/errors.ts`)

### 31.1 Hierarchy

```ts
export type Result<T, E> = { ok: true; value: T; warnings?: E[] } | { ok: false; errors: E[] };

export abstract class DocReadError extends Error {
  abstract readonly code: string;
  abstract readonly severity: 'fatal' | 'error' | 'warning';
  readonly partUri?: string;
  readonly line?: number;
  readonly column?: number;
  readonly detail: string;
}

export class NotAZipError extends DocReadError {
  code = 'zip.not-a-zip';
  severity = 'fatal' as const;
}
export class ZipBombError extends DocReadError {
  code = 'zip.bomb';
  severity = 'fatal' as const;
}
export class PathTraversalError extends DocReadError {
  code = 'zip.path-traversal';
  severity = 'fatal' as const;
}
export class MissingContentTypesError extends DocReadError {
  code = 'opc.missing-content-types';
  severity = 'fatal' as const;
}
export class MissingMainDocumentError extends DocReadError {
  code = 'opc.missing-main';
  severity = 'fatal' as const;
}
export class XmlParseError extends DocReadError {
  code = 'xml.parse';
  severity = 'error' as const;
}
export class UnknownElementWarning extends DocReadError {
  code = 'ast.unknown-element';
  severity = 'warning' as const;
}
export class OrphanRelationshipWarning extends DocReadError {
  code = 'opc.orphan-rel';
  severity = 'warning' as const;
}
export class CyclicStyleError extends DocReadError {
  code = 'styles.cyclic';
  severity = 'error' as const;
}
export class MissingStyleWarning extends DocReadError {
  code = 'styles.missing';
  severity = 'warning' as const;
}
// ... 50+ codes

export abstract class DocWriteError extends Error {
  /* similar */
}
```

### 31.2 Non-fatal parsing

`reader.read(bytes)` returns `Result<Document, DocReadError[]>`. If any fatal error is raised, we return `{ ok: false, errors }` (never a partial document for fatal). Otherwise the `warnings` array carries non-fatal issues and the caller chooses to surface them.

### 31.3 User-facing messages

Each error code has a user-visible string template in `src/errors.ts`. The UI layer looks up by code and inserts into localized messages.

---

## 32. Security summary

- ZIP defenses (Section 5.5).
- XXE off (Section 7.7).
- Script injection protection on HTML (DOMPurify) and hyperlink schemes (Section 20.5).
- Image content-type checks against magic bytes (PNG 89 50 4E 47, JPEG FF D8 FF, GIF 47 49 46, BMP 42 4D, TIFF 49 49 2A 00 or 4D 4D 00 2A, WMF D7 CD C6 9A or 01 00 09 00, EMF 01 00 00 00).
- DOCM read-only: macros never executed, `vbaProject.bin` preserved opaque.
- External relationships (hyperlinks, INCLUDETEXT, INCLUDEPICTURE) gated by user consent.
- Font embedding: check font is non-licensable for redistribution only via OS/2 table bits; flag if embedded-editable forbidden.
- Utility process isolation: persistence runs in a utility process with no filesystem write access, no network access (the renderer supplies bytes). Crashes don't take down the app.

---

## 33. Testing strategy

### 33.1 Unit tests

Per mapper, round-trip specific AST fragments:

```ts
test('paragraph mapper round-trips alignment', () => {
  const ast = parseParagraph(`<w:p><w:pPr><w:jc w:val="center"/></w:pPr></w:p>`);
  const domain = paragraphMapper.in(ast, ctx);
  expect(domain.props?.alignment).toBe('center');
  const ast2 = paragraphMapper.out(domain, ctx);
  expect(emitXml(ast2)).toBe(`<w:p><w:pPr><w:jc w:val="center"/></w:pPr></w:p>`);
});
```

### 33.2 Property-based tests

`fast-check` generators produce random valid OOXML AST subtrees. Each runs through write → read → assert domain-equal.

```ts
fc.assert(
  fc.property(arbitraryParagraph(), (paragraph) => {
    const doc = { body: { children: [paragraph] } };
    const bytes = sync(writer.write(doc));
    const round = sync(reader.read(bytes));
    expect(canonicalize(round.value)).toEqual(canonicalize(doc));
  }),
  { numRuns: 10000 },
);
```

### 33.3 Corpus tests (Section 30.3).

### 33.4 Fuzz tests (Section 30.5).

### 33.5 Interop tests

Open each of our saves in:

- LibreOffice headless (round-trip)
- Microsoft Word 2019 (automated via PowerShell)
- Google Docs (via Drive API in CI)

Assert zero errors reported by those tools.

### 33.6 Performance regression

Benchmark parsing 10/50/100/500/1000-page DOCX on CI. Any regression over 10% fails.

---

## 34. Concrete TypeScript interfaces (summary)

```ts
// packages/docx/src/index.ts

export interface ReadOptions {
  readonly strict?: boolean;
  readonly limits?: ZipLimits;
  readonly onBomb?: BombPolicy;
  readonly updateFields?: 'none' | 'onOpen' | 'always';
  readonly locale?: string;
  readonly onWarning?: (err: DocReadError) => void;
  readonly signal?: AbortSignal;
}

export interface WriteOptions {
  readonly updateFields?: 'none' | 'onSave' | 'always';
  readonly updateDocProps?: Partial<DocPropsUpdatePolicy>;
  readonly renumberIds?: boolean;
  readonly prettyPrint?: boolean;  // dev only
  readonly deterministic?: boolean; // default true
  readonly modTime?: number; // DOS time to stamp entries
  readonly onWarning?: (err: DocWriteError) => void;
}

export class DocxSerializer implements DocumentSerializer<'docx'> {
  readonly format = 'docx';
  readonly capabilities: SerializerCapabilities = {
    reads: true,
    writes: true,
    preservesUnknown: true,
    lossyFeatures: [],
  };
  async read(bytes: Uint8Array, opts?: ReadOptions): Promise<Result<Document, DocReadError[]>> { ... }
  async write(doc: Document, opts?: WriteOptions): Promise<Result<Uint8Array, DocWriteError[]>> { ... }
}

export class DocxReader {
  constructor(private readonly opts: Required<ReadOptions>) {}
  async read(bytes: Uint8Array): Promise<Result<Document, DocReadError[]>> { ... }
}

export class DocxWriter {
  constructor(private readonly opts: Required<WriteOptions>) {}
  async write(doc: Document): Promise<Result<Uint8Array, DocWriteError[]>> { ... }
}

// AST node types are in src/ast/index.ts (Section 9)

export interface Package {
  readonly reader: PackageReader;
}

export interface IdAllocator {
  nextRelId(): string;
  nextBookmarkId(): number;
  nextDrawingId(): number;
  nextCommentId(): string;
}
```

---

## 35. Directory layout (final)

```
packages/
  domain/                      # shared domain types (consumed by persistence, renderer, editor)
    src/
      document.ts
      paragraph.ts
      run.ts
      table.ts
      section.ts
      style-ref.ts
      numbering-ref.ts
      field.ts
      comment.ts
      revision.ts
      ...

  docx/                        # @word/docx
    package.json               # exports: {"./serializer", "./types"}
    src/
      index.ts                 # public API
      types.ts                 # DocumentSerializer, ReadOptions, WriteOptions
      docx-serializer.ts
      detect.ts
      result.ts
      errors.ts
      zip/
        index.ts
        fflate-reader.ts
        fflate-writer.ts
        defenses.ts
        types.ts
      opc/
        package-reader.ts
        package-writer.ts
        content-types.ts
        relationships.ts
        part.ts
        types.ts
      xml/
        reader.ts
        writer.ts
        dom.ts
        names.ts
        entities.ts
        whitespace.ts
      ast/
        index.ts
        nodes/                 # one file per node type
        attrs.ts
        ids.ts
      reader/
        index.ts
        document-reader.ts
        styles-reader.ts
        numbering-reader.ts
        settings-reader.ts
        font-table-reader.ts
        theme-reader.ts
        comments-reader.ts
        footnotes-reader.ts
        endnotes-reader.ts
        header-footer-reader.ts
        doc-props-reader.ts
        glossary-reader.ts
      writer/
        index.ts
        document-writer.ts
        styles-writer.ts
        numbering-writer.ts
        settings-writer.ts
        font-table-writer.ts
        theme-writer.ts
        comments-writer.ts
        footnotes-writer.ts
        endnotes-writer.ts
        header-footer-writer.ts
        doc-props-writer.ts
        glossary-writer.ts
        id-allocator.ts
      mappers/
        paragraph.ts
        run.ts
        text.ts
        tab-break.ts
        table.ts
        row.ts
        cell.ts
        section.ts
        style.ts
        numbering.ts
        field.ts
        image.ts
        ole.ts
        comment.ts
        revision.ts
        hyperlink.ts
        bookmark.ts
        drawing.ts
        math.ts
        frame.ts
        sdt.ts
        footnote.ts
        endnote.ts
        header-footer.ts
        glossary.ts
        doc-props.ts
        settings.ts
        font-table.ts
        theme.ts
      validators/
        ecma-376.ts
      resolve/
        style-chain.ts
        theme-color.ts
        numbering-runtime.ts
      registry/
        index.ts
    test/
      unit/
      integration/
      property/
      corpus/         # git-lfs for DOCX binaries
      fixtures/
        docx/
        rtf/
        html/
        txt/

  docx-rtf/                    # @word/docx-rtf
    src/
      index.ts
      rtf-serializer.ts
      rtf-reader.ts
      rtf-writer.ts
      control-words.ts
      tables.ts
      images.ts
      fields.ts
      encoding.ts

  docx-html/                   # @word/docx-html
    src/
      index.ts
      html-serializer.ts
      html-reader.ts
      html-writer.ts
      sanitize.ts
      element-map.ts
      css-parser.ts

  docx-txt/                    # @word/docx-txt
    src/
      index.ts
      txt-serializer.ts
      txt-reader.ts
      txt-writer.ts
      encoding.ts
      line-endings.ts

  docx-converters/             # @word/docx-converters
    src/
      index.ts
      libreoffice.ts
      tika.ts
      converter.ts
      detect-tools.ts
```

---

## 36. Diagrams

### 36.1 Read pipeline (detailed)

```
                 +---------------------------------------------+
                 |               DocxSerializer.read           |
                 +---------------------------------------------+
                                    |
                                    v
                   +--------------------------------+
                   |          ZipReader             |
                   |  list() → central directory    |
                   |  read(path) → Uint8Array       |
                   |  defenses (bomb, traversal)    |
                   +--------------------------------+
                                    |
                                    v
               +---------------------------------------+
               |           PackageReader               |
               |   Content_Types → MIME map            |
               |   _rels/.rels → top-level rels        |
               |   word/_rels/document.xml.rels        |
               |   parts[] enumeration                 |
               +---------------------------------------+
                                    |
                       +---eager----+----lazy----+
                       |                         |
                       v                         v
         +------------------------+   +---------------------------+
         | StylesReader           |   | DocumentReader            |
         | NumberingReader        |   | (streaming, saxes)        |
         | SettingsReader         |   +-----------+---------------+
         | FontTableReader        |               |
         | ThemeReader            |               v
         | DocPropsReader         |       +------------------+
         +-----------+------------+       |     AST tree     |
                     |                    +---------+--------+
                     |                              |
                     v                              v
           +---------+-----------+    +-------------+-------------+
           |   domain Style/     |    |      DomainMapper         |
           |   Numbering indexes |<---|  paragraph/run/table/...  |
           +---------------------+    +-------------+-------------+
                                                    |
                                                    v
                    +-------------- +   +-----------------------+
                    | lazy readers  |   |   Domain Document     |
                    | comments,     |   | (with preservedExt)   |
                    | footnotes,    |   +-----------+-----------+
                    | endnotes,     |               |
                    | headers,      |               v
                    | footers,      |        Result<Document>
                    | glossary,     |
                    | media         |
                    +---------------+
```

### 36.2 Write pipeline (detailed)

```
         Domain Document
               |
               v
  +--------------------------+
  |     DomainDemapper       |
  |  paragraph/run/table/... |
  +--------------------------+
               |
               v
           AST tree
               |
      +--------+--------+
      |                 |
      v                 v
 +----------+    +----------------+
 | document-|    | styles-writer  |
 | writer   |    | numbering-     |
 | (streams |    | writer, etc.   |
 | xml/w    |    +--------+-------+
 +----+-----+             |
      |                   |
      v                   v
  +-----------+    +-------------+
  | XmlWriter |    | XmlWriter   |
  | emits     |    | emits       |
  | document. |    | styles.xml, |
  | xml       |    | numbering,  |
  +----+------+    | settings,   |
       |           | fontTable,  |
       |           | theme, ...  |
       |           +------+------+
       |                  |
       v                  v
     +----------------------+
     |      PackageWriter   |
     | addPart, addRel      |
     | allocates rIds       |
     | emits Content_Types, |
     | _rels, part rels     |
     +---+------------------+
         |
         v
     +--------+
     | ZipWriter |
     | deterministic entry order
     | deflate / store
     +----+----+
          |
          v
      Uint8Array
```

### 36.3 Relationship map of a typical DOCX

```
[Content_Types].xml
_rels/.rels
  ├── rId1 officeDocument ──► word/document.xml
  │                                      │
  │                                      │  word/_rels/document.xml.rels
  │                                      ├── rId1  styles        ──► word/styles.xml
  │                                      ├── rId2  settings      ──► word/settings.xml
  │                                      ├── rId3  webSettings   ──► word/webSettings.xml
  │                                      ├── rId4  fontTable     ──► word/fontTable.xml
  │                                      │                             │
  │                                      │                             │  word/_rels/fontTable.xml.rels
  │                                      │                             └── rId1 font ──► word/fonts/font1.odttf
  │                                      ├── rId5  theme         ──► word/theme/theme1.xml
  │                                      ├── rId6  numbering     ──► word/numbering.xml
  │                                      ├── rId7  header        ──► word/header1.xml
  │                                      │                             │
  │                                      │                             │  word/_rels/header1.xml.rels
  │                                      │                             └── rId1 image ──► word/media/logo.png
  │                                      ├── rId8  footer        ──► word/footer1.xml
  │                                      ├── rId9  footnotes     ──► word/footnotes.xml
  │                                      ├── rId10 endnotes      ──► word/endnotes.xml
  │                                      ├── rId11 comments      ──► word/comments.xml
  │                                      ├── rId12 image         ──► word/media/image1.png
  │                                      ├── rId13 hyperlink  ext──► https://example.com
  │                                      ├── rId14 oleObject     ──► word/embeddings/oleObject1.xlsx
  │                                      ├── rId15 image(preview)──► word/media/image2.emf
  │                                      └── rId16 glossary       ──► word/glossary/document.xml
  ├── rId2 coreProperties ──► docProps/core.xml
  ├── rId3 extendedProperties ──► docProps/app.xml
  └── rId4 customProperties ──► docProps/custom.xml
```

---

## 37. Performance

### 37.1 Targets

- Parse 100-page DOCX (typical: styles/numbering/settings/body/footnotes/one header/one footer/20 images): **< 300ms** in utility process on a 2020-era laptop.
- Parse 500-page document: **< 1.5s**.
- Save round-trip unchanged 100-page: **< 200ms**.
- Memory: parse should not allocate more than 5× the uncompressed `document.xml` size transiently.

### 37.2 Streaming first-page render

The document reader emits an event per completed top-level element (paragraph/table). The renderer subscribes and lays out as they arrive. First page typically renders before the body is half-parsed.

```ts
export interface DocumentReaderEvents {
  onParagraph: (p: Paragraph) => void;
  onTable: (t: Table) => void;
  onSectionBreak: (s: SectionProperties) => void;
  onComplete: (body: Body) => void;
  onError: (err: DocReadError) => void;
}
```

### 37.3 Lazy loading

Comments, endnotes, glossary, theme, and media parts are parsed on demand:

```ts
export interface Document {
  readonly body: Body;
  readonly sections: ReadonlyArray<Section>;
  readonly styles: StyleIndex;
  readonly numbering: NumberingIndex;
  readonly settings: AppSettings;
  readonly fontTable: FontTable;
  readonly theme: Theme;
  readonly coreProps: CoreProperties;
  readonly appProps: AppProperties;
  readonly customProps: CustomProperties;

  /** Lazy accessors. Throws if part missing. */
  comments(): Promise<CommentSet>;
  footnotes(): Promise<FootnoteSet>;
  endnotes(): Promise<EndnoteSet>;
  glossary(): Promise<Glossary>;
  header(relId: string): Promise<HeaderFooter>;
  footer(relId: string): Promise<HeaderFooter>;
  media(relId: string): Promise<DocumentImage>;

  /** Round-trip passthrough bag. */
  readonly opaqueParts: ReadonlyMap<string, Uint8Array>; // parts we don't model
}
```

### 37.4 Parallelism

Headers and footers read in parallel with the body (they don't reference the body, only share rels). Comments, footnotes, endnotes can be parsed concurrently after the body is done.

We use `Promise.all` inside the reader orchestrator, not worker threads, because our utility process is already isolated and the work is I/O-heavy.

### 37.5 Memoization

- Style resolution cached per (styleId, kind).
- Numbering level lookups cached per (numId, ilvl).
- Theme color resolution cached per (themeColor + tint/shade).

---

## 38. Extensibility hooks

### 38.1 Per-element extensions

Mappers expose an extension point:

```ts
export interface MapperExtension<K extends string> {
  readonly target: K; // 'paragraph' | 'run' | 'table' | ...
  readonly onAstIn?: (ast: AstNode, ctx: MapInContext) => DomainPatch | null;
  readonly onAstOut?: (node: DomainNode, ctx: MapOutContext) => AstPatch | null;
}

// Register:
DocxSerializer.extensions.add(myExtension);
```

Used internally for `w15`/`w16` additions; exposed for downstream consumers who want to recognize custom namespaces without forking the package.

### 38.2 Custom codecs

Third parties implementing `DocumentSerializer<Format>` register with `SerializerRegistry`. The persistence layer doesn't know or care how custom formats work; the port is enough.

### 38.3 Format upgrades

When DOCX Strict Transitional 2030 (hypothetical) ships, we add a new serializer `@word/docx-2030` with its own reader/writer pipeline; the domain model absorbs the additions as new fields, and the existing `@word/docx` codec emits Transitional.

---

## 39. DOCM specifics

### 39.1 Parts present beyond DOCX

- `word/vbaProject.bin` — the OLE compound file containing VBA modules.
- `word/vbaData.xml` — metadata about the VBA project.

### 39.2 Handling

- Read: mount as opaque `Uint8Array` in `opaqueParts`. Display a banner: "This document contains macros. Macros are not supported; the document is opened read-only."
- Write: When the user saves the document:
  - If they save as `.docx`, we drop `vbaProject.bin` and `vbaData.xml` after confirmation.
  - If they save as `.docm`, we re-emit both verbatim.
- Execute: never.

### 39.3 Content types

`.docm` uses:

```
application/vnd.ms-word.document.macroEnabled.main+xml
```

for `/word/document.xml`. The writer sets the correct override when saving as `.docm`.

---

## 40. DOTX and DOTM (templates)

- `.dotx` uses content type `application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml` for `/word/document.xml`.
- `.dotm` adds macros like `.docm`.
- Feature-wise identical to DOCX/DOCM. The reader detects them by content type; the writer is selected by file extension.

---

## 41. ECMA-376 XSD validation

In dev builds, we validate each part against the bundled XSDs:

```
packages/docx/src/validators/schemas/
  wml.xsd
  sml.xsd      # unused but bundled
  dml-main.xsd
  dml-wordprocessingDrawing.xsd
  dml-picture.xsd
  mc.xsd
  relationships.xsd
  content-types.xsd
  core-properties.xsd
  extended-properties.xsd
```

We use `libxmljs-wasm` (WASM build of libxml2) for validation in dev. Release builds skip the XSDs entirely (no dependency shipped to user) — they don't catch real-world docs anyway because most producers emit invalid XSDs at the margins.

---

## 42. DOCX vs. Word 95 feature mapping

Word 95 features and how we persist them through DOCX:

| Word 95 feature                 | DOCX representation                                                              |
| ------------------------------- | -------------------------------------------------------------------------------- |
| Paragraph formatting            | `w:pPr` (alignment, indent, spacing, borders, shading)                           |
| Character formatting            | `w:rPr` (font, size, bold, italic, underline, color, spacing)                    |
| Tab stops                       | `w:tabs/w:tab`                                                                   |
| Tables                          | `w:tbl` with `w:tblPr`, `w:tblGrid`, `w:tr`, `w:tc`                              |
| Frames (floating)               | `w:framePr` (preserved)                                                          |
| Section properties              | `w:sectPr`                                                                       |
| Headers/footers                 | `word/headerN.xml`, `word/footerN.xml` + `w:headerReference`/`w:footerReference` |
| Footnotes/endnotes              | `word/footnotes.xml`, `word/endnotes.xml` + reference runs                       |
| Fields (all Word 95 types)      | `w:fldSimple` or `w:fldChar`/`w:instrText` triples                               |
| Numbered/bulleted lists         | `word/numbering.xml` + `w:numPr` in `w:pPr`                                      |
| Styles                          | `word/styles.xml`                                                                |
| Bookmarks                       | `w:bookmarkStart`/`w:bookmarkEnd`                                                |
| Cross-references                | `PAGEREF`/`REF` fields or `w:hyperlink` with `w:anchor`                          |
| Hyperlinks (Word 95 added)      | `w:hyperlink` + rel OR `HYPERLINK` field                                         |
| AutoText                        | `word/glossary/document.xml`                                                     |
| Comments/Annotations            | `word/comments.xml` + range markers                                              |
| Revisions                       | `w:ins`/`w:del`/`w:*PrChange`                                                    |
| Embedded OLE objects            | `w:object` + `word/embeddings/*` + preview EMF/WMF                               |
| WordArt                         | VML shape (legacy) or DrawingML (modern). Preserved on round-trip.               |
| Drawing layer                   | VML on legacy, DrawingML on modern. Preserved.                                   |
| Mail merge                      | `MERGEFIELD`, `MERGEREC`, `NEXT` fields. Preserved; runtime optional.            |
| Forms                           | Form fields as `w:formField` legacy OR SDT content controls.                     |
| Equations (Word 95 EQ field)    | `EQ` field preserved; rendered via our EQ parser.                                |
| Page borders                    | `w:pgBorders` in `w:sectPr`                                                      |
| Drop caps                       | `w:framePr w:dropCap="drop"`                                                     |
| Indexes, TOC                    | `TOC` field with switches + `TC` entry fields                                    |
| Master documents / subdocuments | `w:subDoc` (preserved; rendering v2)                                             |
| Password protection             | `w:documentProtection` (we honor read-only view; full write-protection v2)       |

All Word 95 features have a DOCX representation. Round-trip from Word 95 → DOCX → our app → DOCX is lossless for everything in the table.

---

## 43. Math (OMML)

Word 95's EQ field is preserved and optionally rendered by our EQ parser. Modern Word math (OMML) is a richer tree:

```xml
<m:oMath>
  <m:f>
    <m:fPr>...</m:fPr>
    <m:num><m:r><m:t>x</m:t></m:r></m:num>
    <m:den><m:r><m:t>y</m:t></m:r></m:den>
  </m:f>
</m:oMath>
```

We map OMML to a math AST that mirrors its structure, and on save we emit OMML. MathML conversion is out of scope here (renderer's concern).

---

## 44. SDT (Structured Document Tags / Content Controls)

- `<w:sdt>` with `<w:sdtPr>` (id, alias, lock, tag, placeholder, databinding, equation/checkbox/date/docPartList/dropDownList/picture/richText/text/comboBox/group types)
- `<w:sdtContent>` with child paragraphs/runs/tables

Domain:

```ts
export interface StructuredDocumentTag {
  readonly kind: 'sdt';
  readonly id?: number;
  readonly alias?: string;
  readonly tag?: string;
  readonly lock?: 'sdtLocked' | 'contentLocked' | 'unlocked' | 'sdtContentLocked';
  readonly placeholder?: string;
  readonly dataBinding?: DataBinding;
  readonly appearance?: 'boundingBox' | 'tags' | 'hidden';
  readonly type: SdtType;
  readonly children: ReadonlyArray<BodyChild | ParagraphChild | RunChild>;
  readonly preservedPr: string; // raw XML of unknown sdtPr subelements
}

export type SdtType =
  | { kind: 'text'; multiLine?: boolean }
  | { kind: 'richText' }
  | { kind: 'checkbox'; checked: boolean; checkedSymbol?: string; uncheckedSymbol?: string }
  | {
      kind: 'date';
      fullDate?: string;
      dateFormat?: string;
      lid?: string;
      storeMappedDataAs?: string;
      calendar?: string;
    }
  | { kind: 'picture' }
  | { kind: 'comboBox'; listItems: ReadonlyArray<SdtListItem>; value?: string }
  | { kind: 'dropDownList'; listItems: ReadonlyArray<SdtListItem>; value?: string }
  | { kind: 'docPartObject'; gallery?: string; category?: string; unique?: boolean }
  | { kind: 'docPartList'; gallery?: string; category?: string }
  | { kind: 'group' }
  | { kind: 'citation' }
  | { kind: 'equation' }
  | { kind: 'bibliography' }
  | { kind: 'id' }; // implicit, no type specified
```

SDTs are a W3-era addition but we round-trip them because many documents contain them.

---

## 45. Custom XML parts

Parts under `customXml/` with schema references in `customXml/itemProps*.xml`. Databindings on SDTs point into these. We store them opaque and expose them:

```ts
export interface CustomXmlPart {
  readonly id: string;
  readonly contentType: string;
  readonly xml: string;
  readonly schemaRefs: ReadonlyArray<string>;
}
export interface Document {
  readonly customXmlParts: ReadonlyArray<CustomXmlPart>;
}
```

---

## 46. Putting it together: full read example

```ts
// User opens Foo.docx.
const bytes = await readFileAsUint8Array('Foo.docx');
const serializer = registry.detect(bytes, { ext: 'docx' });
if (!serializer) throw new Error('Unrecognized file');

const result = await serializer.read(bytes, {
  strict: false,
  limits: DEFAULT_ZIP_LIMITS,
  onWarning(err) {
    console.warn(err.code, err.detail);
  },
});

if (!result.ok) {
  ui.showFatal(result.errors);
  return;
}

const doc = result.value;
renderer.mount(doc);

// Later: user edits and saves.
const outBytes = await serializer.write(doc, {
  updateFields: 'onSave',
  updateDocProps: { updateCore: { modified: true, lastModifiedBy: true, revision: true } },
  renumberIds: true,
  deterministic: true,
});
await writeFileFromUint8Array('Foo.docx', outBytes.value);
```

---

## 47. Non-scope recap

- `.doc` binary internals — **out**. External converter.
- Live macro execution — **never**.
- Real-time co-authoring — **future**.
- Cloud sync — **future**.
- Rendering — separate package.
- Editor operations — separate package.

---

## 48. Open questions / decisions pending

- **fflate vs. zip.js streaming writer.** We lean fflate but will benchmark on our specific corpus before shipping.
- **OMML math AST detail.** The domain shape for math equations needs a pass from the renderer/editor team; we have it sketched but may expand before v1.
- **How aggressive to be re-canonicalizing on save.** Option 1: always re-canonicalize (cleaner diffs against our own output, but diffs against original Word output). Option 2: preserve original ordering where possible (original-preserving mode). We lean Option 2 as default with Option 1 behind a flag.
- **`w:fldChar` with w15 `clearContents` / `cachedColBalance` / structured document tag form-field v2.** Preserved as opaque; we could expand support in v2.
- **Picture cropping on drawings.** `<a:srcRect l="10000" t="5000" r="10000" b="5000"/>` — we parse but the renderer must honor on draw.
- **Support for `customXml` schemas with XSD validation.** Currently opaque; do we validate in v2? Probably no — costs more than it's worth.

---

## 49. Timeline / staging

We ship in three steps; each is independently testable.

**Step 1 (foundation):** ZIP, OPC, XML reader/writer, AST node types, mapper framework, paragraph+run+text+table+section+style+numbering+hyperlink+bookmark+field (simple+complex with DATE/TIME/PAGE/NUMPAGES/AUTHOR/TOC/PAGEREF/REF/HYPERLINK) mappers, DocxSerializer read/write, round-trip test on a curated 200-file corpus.

**Step 2 (feature completeness):** Images, OLE, comments+commentsExtended+people, revisions (inline + property-level), headers/footers, footnotes/endnotes, docProps, settings, font table, theme, frames, SDT, math, drawings (DrawingML + VML), alternate content, glossary, custom XML. Round-trip test on the full 5000-file corpus.

**Step 3 (formats):** RTF codec, HTML codec, TXT codec, `.doc` adapter.

All three steps keep the same domain model; each is a diff on `@word/docx`'s mapper set or a new package.

---

## 50. Summary

The persistence layer is one sealed package with a sharp interface (`DocumentSerializer<Format>`) and a two-stage internal pipeline (ZIP/OPC/XML → AST → Domain on read; the reverse on write). We preserve everything we don't understand, canonicalize everything we do, and put every format behind the same port so new ones are new modules rather than new branches. Fidelity is measured against a 5000-document corpus with both semantic-equivalence and byte-equivalence-after-first-save tests. Security, determinism, and performance are enforced at the boundaries: ZIP defenses, XXE off, deterministic entry ordering, canonical attribute order, streaming parse with lazy part loading.

The result is a persistence layer swappable as a unit, extensible by format, and robust against the long tail of DOCX variants in the wild — the foundation a Word-95-parity word processor needs.
