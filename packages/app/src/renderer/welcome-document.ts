import type { Document, IdGenPort, Paragraph, PropsId, Run, Section } from '@word/domain';
import { createEmptyDocument, createMutablePropsRegistry } from '@word/domain';

/**
 * Builds the document the app opens to on boot: the Word 95 implementation
 * punch list, with items completed checked off.
 */
export function createWelcomeDocument(idGen: IdGenPort): Document {
  const base = createEmptyDocument(idGen);

  const registry = createMutablePropsRegistry();
  for (const [, props] of base.props.run) registry.internRun(props);
  for (const [, props] of base.props.para) registry.internPara(props);
  for (const [, props] of base.props.section) registry.internSection(props);

  const baseRunPropsId = base.defaults.runPropsId;
  const baseParaPropsId = base.defaults.paraPropsId;

  const h1RunPropsId = registry.internRun({
    halfPoints: 36,
    bold: true,
    fontName: 'Arial',
  });
  const h2DoneRunPropsId = registry.internRun({
    halfPoints: 26,
    bold: true,
    fontName: 'Arial',
    color: { kind: 'rgb', value: '1E7B3C' },
  });
  const h2TodoRunPropsId = registry.internRun({
    halfPoints: 26,
    bold: true,
    fontName: 'Arial',
    color: { kind: 'rgb', value: '7A7A7A' },
  });
  const italicRunPropsId = registry.internRun({ italic: true });
  const boldRunPropsId = registry.internRun({ bold: true });

  const headingParaPropsId = registry.internPara({
    styleRef: 'Heading1',
    spacing: { beforeTwips: 240, afterTwips: 120 },
  });
  const subheadParaPropsId = registry.internPara({
    styleRef: 'Heading2',
    spacing: { beforeTwips: 280, afterTwips: 80 },
  });
  const itemParaPropsId = registry.internPara({
    indent: { leftTwips: 360 },
    spacing: { beforeTwips: 0, afterTwips: 40 },
  });

  const mkRun = (text: string, runPropsId: PropsId = baseRunPropsId): Run => ({
    id: idGen.newId(),
    type: 'run',
    attrs: { runPropsId },
    text,
  });

  const mkPara = (children: readonly Run[], paraPropsId: PropsId = baseParaPropsId): Paragraph => ({
    id: idGen.newId(),
    type: 'paragraph',
    attrs: { paraPropsId },
    children,
  });

  const done = (text: string): Paragraph =>
    mkPara([mkRun('[x]  ', boldRunPropsId), mkRun(text)], itemParaPropsId);

  const todo = (text: string): Paragraph => mkPara([mkRun('[ ]  '), mkRun(text)], itemParaPropsId);

  const paragraphs: readonly Paragraph[] = [
    mkPara([mkRun('Word 95 — Requirements Punch List', h1RunPropsId)], headingParaPropsId),
    mkPara([
      mkRun(
        'A desktop word processor, feature parity with Microsoft Word 95, DOCX persistence, React + Electron + TypeScript. Assembled in a few hours of wall-clock time by a fleet of LLM agents. Here is the inventory.',
        italicRunPropsId,
      ),
    ]),

    mkPara([mkRun('M0 — Foundation  ✓', h2DoneRunPropsId)], subheadParaPropsId),
    done('Monorepo scaffold (pnpm workspaces, 11 packages, TS strict)'),
    done('Pure domain model: Document → Section → Block → Paragraph → Run'),
    done('Piece-table text storage with UTF-16 surrogate safety'),
    done('CommandBus, invertible Ops, Transactions, coalescing undo history'),
    done(
      'DOCX reader + writer: two-stage AST, deterministic output, XXE and zip-bomb guards, unknown-XML preservation',
    ),
    done('Layout engine: measure → first-fit break → paginate'),
    done('React render layer with Caret, SelectionOverlay, hidden IME surface'),
    done(
      'Electron shell: contextIsolation + sandbox + strict CSP + path allowlist + scheme allowlist',
    ),
    done('Zod-typed IPC (8 channels, 2 events), atomic writes, print-to-PDF'),
    done('Zustand stores, Windows-95 AppShell + MenuBar + StatusBar'),
    done('Performance harness with regression gate (+ baseline committed)'),
    done('Playwright E2E smoke running under Xvfb in GitHub Actions CI'),

    mkPara([mkRun('M1 — Authoring  ✓', h2DoneRunPropsId)], subheadParaPropsId),
    done(
      'Character formatting: bold, italic, underline, strikethrough, font name, size, color, highlight',
    ),
    done(
      'Paragraph formatting: alignment, left/right/first-line/hanging indents, before/after/line spacing',
    ),
    done('Style resolution with basedOn-chain walking (cycle-safe)'),
    done('Built-in styles: Normal, Heading 1–3, DefaultParagraphFont, ListParagraph'),
    done(
      'Numbering: bulleted and numbered lists, multi-level counters, decimal/bullet/letter/roman',
    ),
    done('Find and Replace: regex, whole-word, case-sensitive, reverse-order replaceAll'),
    done('DOCX rPr/pPr mappers + styles.xml + numbering.xml round-trip'),
    done('FormattingToolbar + Font/Paragraph/Style/Bullets/Find dialogs'),
    done('Keyboard: Ctrl+B/I/U, Ctrl+F/H, Ctrl+E/R/L/J, Ctrl+Z/Y, Ctrl+O/S/P'),
    done('Typing, Backspace, Enter, click-to-place-caret — all wired end to end'),
    done('751 unit tests, 8 Playwright E2E tests, all green'),

    mkPara([mkRun('M2+ — Everything Else  ☐', h2TodoRunPropsId)], subheadParaPropsId),
    todo(
      'M2 Structure: tables, sections, headers/footers, footnotes/endnotes, columns, page numbers, frames',
    ),
    todo(
      'M3 Production: track changes, comments, bookmarks, hyperlinks, fields (DATE/PAGE/TOC/HYPERLINK/IF/SEQ), Mail Merge',
    ),
    todo('M4 Objects: images, drawing layer, WordArt, Equation Editor round-trip, OLE previews'),
    todo(
      'M5 Polish: macros preserved as opaque bytes, AutoCorrect/AutoText/AutoFormat, grammar, thesaurus, hyphenation',
    ),
    todo(
      'M6 Release: 5000-file corpus, visual regression, security review, signed installers for Win/macOS/Linux',
    ),
    todo('Knuth-Plass justification (we fall back to left for "justify" at present)'),
    todo('Clipboard: cut / copy / paste'),

    mkPara([
      mkRun(
        'M0 and M1: one afternoon. M2 through M6: next afternoon\u2019s problem. The interesting pedagogical question isn\u2019t whether an LLM can reimplement a 1995 word processor — it manifestly can. The question is what students should learn now that this is true. Welcome to your new syllabus.',
        italicRunPropsId,
      ),
    ]),
  ];

  const baseSection = base.sections[0];
  if (baseSection === undefined) {
    return base;
  }

  const newSection: Section = { ...baseSection, children: paragraphs };

  return {
    ...base,
    sections: [newSection],
    props: registry.freeze(),
  };
}
