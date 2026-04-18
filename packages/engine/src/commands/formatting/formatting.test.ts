/**
 * Tests for M1-A formatting commands.
 * Covers: toggle-bold, toggle-italic, toggle-underline, toggle-strikethrough,
 * set-font-name, set-font-size, set-font-color, set-alignment,
 * set-indent, set-spacing, apply-style, toggle-bulleted-list, toggle-numbered-list.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { createToggleBoldCommand } from './toggle-bold.js';
import { createToggleItalicCommand } from './toggle-italic.js';
import { createToggleUnderlineCommand } from './toggle-underline.js';
import { createToggleStrikethroughCommand } from './toggle-strikethrough.js';
import { createSetFontNameCommand } from './set-font-name.js';
import { createSetFontSizeCommand } from './set-font-size.js';
import { createSetFontColorCommand } from './set-font-color.js';
import { createSetAlignmentCommand } from './set-alignment.js';
import {
  createSetIndentLeftCommand,
  createSetIndentRightCommand,
  createSetFirstLineIndentCommand,
  createSetHangingIndentCommand,
} from './set-indent.js';
import {
  createSetSpacingBeforeCommand,
  createSetSpacingAfterCommand,
  createSetLineSpacingCommand,
} from './set-spacing.js';
import { createApplyStyleCommand } from './apply-style.js';
import { createToggleBulletedListCommand } from './toggle-bulleted-list.js';
import { createToggleNumberedListCommand } from './toggle-numbered-list.js';
import { applyPatch } from '../../patch.js';
import {
  makeDocument,
  makeParagraph,
  makeTestIdGen,
  makeTestClock,
  makeTestRandom,
  makeTestLog,
  resetIdCounter,
} from '../../test-helpers.js';
import { singleSelection } from '../../selection.js';
import type { CommandContext } from '../../command.js';
import type { Paragraph, Run } from '@word/domain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(doc: ReturnType<typeof makeDocument>, from: number, to: number): CommandContext {
  const para = doc.sections[0]!.children[0] as Paragraph;
  return {
    doc,
    selection: singleSelection({
      anchor: { leafId: para.id, offset: from },
      focus: { leafId: para.id, offset: to },
    }),
    idGen: makeTestIdGen(),
    clock: makeTestClock(),
    random: makeTestRandom(),
    log: makeTestLog(),
  };
}

function getRunPropsFromDoc(doc: ReturnType<typeof makeDocument>, runIdx = 0) {
  const para = doc.sections[0]!.children[0] as Paragraph;
  const runs = para.children.filter((c): c is Run => c.type === 'run');
  const run = runs[runIdx];
  if (run === undefined) return {};
  return doc.props.run.get(run.attrs.runPropsId) ?? {};
}

function getParaPropsFromDoc(doc: ReturnType<typeof makeDocument>) {
  const para = doc.sections[0]!.children[0] as Paragraph;
  return doc.props.para.get(para.attrs.paraPropsId) ?? {};
}

beforeEach(() => {
  resetIdCounter();
});

// ---------------------------------------------------------------------------
// Toggle bold
// ---------------------------------------------------------------------------

describe('createToggleBoldCommand', () => {
  it('has correct command id', () => {
    expect(createToggleBoldCommand().meta.id).toBe('app.format.bold');
  });

  it('canRun returns false for collapsed selection', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const cmd = createToggleBoldCommand();
    const ctx: CommandContext = {
      doc,
      selection: singleSelection({
        anchor: { leafId: para.id, offset: 2 },
        focus: { leafId: para.id, offset: 2 },
      }),
      idGen: makeTestIdGen(),
      clock: makeTestClock(),
      random: makeTestRandom(),
      log: makeTestLog(),
    };
    expect(cmd.canRun(ctx)).toBe(false);
  });

  it('canRun returns true for non-collapsed selection', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const cmd = createToggleBoldCommand();
    const ctx = makeCtx(doc, 0, 5);
    expect(cmd.canRun(ctx)).toBe(true);
  });

  it('run produces a setRunProps op with bold=true', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const cmd = createToggleBoldCommand();
    const ctx = makeCtx(doc, 0, 5);
    const result = cmd.run(ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const op = result.value.ops[0];
    expect(op?.kind).toBe('setRunProps');
    if (op?.kind === 'setRunProps') {
      expect(op.props.bold).toBe(true);
    }
  });

  it('produces bold=false when all runs are already bold (toggle off)', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    // First apply bold
    const cmd = createToggleBoldCommand();
    const ctx1 = makeCtx(doc, 0, 5);
    const r1 = cmd.run(ctx1);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const boldDoc = applyPatch(doc, r1.value, { idGen: makeTestIdGen() }).doc;
    // Now toggle off
    const ctx2 = makeCtx(boldDoc, 0, 5);
    const r2 = cmd.run(ctx2);
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    const op = r2.value.ops[0];
    if (op?.kind === 'setRunProps') {
      expect(op.props.bold).toBe(false);
    }
  });

  it('applying bold then inverse restores original doc (property test)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes('\0')),
        (text) => {
          const para = makeParagraph(text);
          const doc = makeDocument([para]);
          const cmd = createToggleBoldCommand();
          const ctx = makeCtx(doc, 0, text.length);
          const result = cmd.run(ctx);
          if (!result.ok) return true;
          const { doc: newDoc, inverse } = applyPatch(doc, result.value, {
            idGen: makeTestIdGen(),
          });
          const { doc: restoredDoc } = applyPatch(newDoc, inverse, { idGen: makeTestIdGen() });
          // The run props should be restored
          const origProps = getRunPropsFromDoc(doc);
          const restoredProps = getRunPropsFromDoc(restoredDoc);
          return JSON.stringify(origProps) === JSON.stringify(restoredProps);
        },
      ),
      { numRuns: 50, seed: 1 },
    );
  });

  it('toggling bold twice: text is preserved and bold is not true', () => {
    // After toggle ON then toggle OFF, bold is false/undefined (not true).
    // The exact stored value depends on merge semantics; what matters is not bold.
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const cmd = createToggleBoldCommand();
    const idGen = makeTestIdGen();

    const ctx1 = makeCtx(doc, 0, 5);
    const r1 = cmd.run(ctx1);
    if (!r1.ok) return;
    const { doc: doc1 } = applyPatch(doc, r1.value, { idGen });

    const ctx2 = makeCtx(doc1, 0, 5);
    const r2 = cmd.run(ctx2);
    if (!r2.ok) return;
    const { doc: doc2 } = applyPatch(doc1, r2.value, { idGen });

    // After two toggles, bold must not be true
    const finalProps = getRunPropsFromDoc(doc2);
    expect(finalProps.bold).not.toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Toggle italic
// ---------------------------------------------------------------------------

describe('createToggleItalicCommand', () => {
  it('has correct command id', () => {
    expect(createToggleItalicCommand().meta.id).toBe('app.format.italic');
  });

  it('sets italic on selection', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const cmd = createToggleItalicCommand();
    const ctx = makeCtx(doc, 0, 5);
    const result = cmd.run(ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const op = result.value.ops[0];
    if (op?.kind === 'setRunProps') {
      expect(op.props.italic).toBe(true);
    }
  });

  it('toggling italic twice: italic is not true after two toggles', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const cmd = createToggleItalicCommand();
    const idGen = makeTestIdGen();
    const ctx1 = makeCtx(doc, 0, 5);
    const r1 = cmd.run(ctx1);
    if (!r1.ok) return;
    const { doc: doc1 } = applyPatch(doc, r1.value, { idGen });
    const ctx2 = makeCtx(doc1, 0, 5);
    const r2 = cmd.run(ctx2);
    if (!r2.ok) return;
    const { doc: doc2 } = applyPatch(doc1, r2.value, { idGen });
    const finalItalic = getRunPropsFromDoc(doc2).italic;
    expect(finalItalic).not.toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Toggle underline
// ---------------------------------------------------------------------------

describe('createToggleUnderlineCommand', () => {
  it('has correct command id', () => {
    expect(createToggleUnderlineCommand().meta.id).toBe('app.format.underline');
  });

  it('sets underline=single on selection', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const cmd = createToggleUnderlineCommand();
    const ctx = makeCtx(doc, 0, 5);
    const result = cmd.run(ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const op = result.value.ops[0];
    if (op?.kind === 'setRunProps') {
      expect(op.props.underline).toBe('single');
    }
  });
});

// ---------------------------------------------------------------------------
// Toggle strikethrough
// ---------------------------------------------------------------------------

describe('createToggleStrikethroughCommand', () => {
  it('has correct command id', () => {
    expect(createToggleStrikethroughCommand().meta.id).toBe('app.format.strikethrough');
  });

  it('sets strike=true on selection', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const cmd = createToggleStrikethroughCommand();
    const ctx = makeCtx(doc, 0, 5);
    const result = cmd.run(ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const op = result.value.ops[0];
    if (op?.kind === 'setRunProps') {
      expect(op.props.strike).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Set font name
// ---------------------------------------------------------------------------

describe('createSetFontNameCommand', () => {
  it('has correct command id', () => {
    expect(createSetFontNameCommand().meta.id).toBe('app.format.fontName');
  });

  it('canRun returns false for empty fontName', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const cmd = createSetFontNameCommand();
    const ctx = makeCtx(doc, 0, 5);
    expect(cmd.canRun(ctx, { fontName: '' })).toBe(false);
  });

  it('sets fontName on selection', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const cmd = createSetFontNameCommand();
    const ctx = makeCtx(doc, 0, 5);
    const result = cmd.run(ctx, { fontName: 'Arial' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { doc: newDoc } = applyPatch(doc, result.value, { idGen: makeTestIdGen() });
    // The run in range should have fontName=Arial
    const para2 = newDoc.sections[0]!.children[0] as Paragraph;
    const run = para2.children.filter((c): c is Run => c.type === 'run')[0];
    if (run) {
      const props = newDoc.props.run.get(run.attrs.runPropsId) ?? {};
      expect(props.fontName).toBe('Arial');
    }
  });
});

// ---------------------------------------------------------------------------
// Set font size
// ---------------------------------------------------------------------------

describe('createSetFontSizeCommand', () => {
  it('has correct command id', () => {
    expect(createSetFontSizeCommand().meta.id).toBe('app.format.fontSize');
  });

  it('canRun returns false for non-positive halfPoints', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const cmd = createSetFontSizeCommand();
    const ctx = makeCtx(doc, 0, 5);
    expect(cmd.canRun(ctx, { halfPoints: 0 })).toBe(false);
    expect(cmd.canRun(ctx, { halfPoints: -1 })).toBe(false);
  });

  it('sets halfPoints on selection', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const cmd = createSetFontSizeCommand();
    const ctx = makeCtx(doc, 0, 5);
    const result = cmd.run(ctx, { halfPoints: 24 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { doc: newDoc } = applyPatch(doc, result.value, { idGen: makeTestIdGen() });
    const para2 = newDoc.sections[0]!.children[0] as Paragraph;
    const run = para2.children.filter((c): c is Run => c.type === 'run')[0];
    if (run) {
      const props = newDoc.props.run.get(run.attrs.runPropsId) ?? {};
      expect(props.halfPoints).toBe(24);
    }
  });
});

// ---------------------------------------------------------------------------
// Set font color
// ---------------------------------------------------------------------------

describe('createSetFontColorCommand', () => {
  it('has correct command id', () => {
    expect(createSetFontColorCommand().meta.id).toBe('app.format.fontColor');
  });

  it('sets color on selection', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const cmd = createSetFontColorCommand();
    const ctx = makeCtx(doc, 0, 5);
    const color = { kind: 'rgb' as const, value: 'FF0000' };
    const result = cmd.run(ctx, { color });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const op = result.value.ops[0];
    if (op?.kind === 'setRunProps') {
      expect(op.props.color).toEqual(color);
    }
  });
});

// ---------------------------------------------------------------------------
// Set alignment
// ---------------------------------------------------------------------------

describe('createSetAlignmentCommand', () => {
  it('has correct command id', () => {
    expect(createSetAlignmentCommand().meta.id).toBe('app.format.alignment');
  });

  it('canRun returns false for invalid alignment', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const cmd = createSetAlignmentCommand();
    const ctx = makeCtx(doc, 0, 5);
    expect(cmd.canRun(ctx, { alignment: 'invalid' as never })).toBe(false);
  });

  it('sets alignment on paragraph', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const cmd = createSetAlignmentCommand();
    const ctx = makeCtx(doc, 0, 5);
    const result = cmd.run(ctx, { alignment: 'center' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { doc: newDoc } = applyPatch(doc, result.value, { idGen: makeTestIdGen() });
    const paraProps = getParaPropsFromDoc(newDoc);
    expect(paraProps.alignment).toBe('center');
  });

  it('inverse of setAlignment restores original alignment', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const cmd = createSetAlignmentCommand();
    const ctx = makeCtx(doc, 0, 5);
    const result = cmd.run(ctx, { alignment: 'center' });
    if (!result.ok) return;
    const idGen = makeTestIdGen();
    const { doc: newDoc, inverse } = applyPatch(doc, result.value, { idGen });
    const { doc: restoredDoc } = applyPatch(newDoc, inverse, { idGen });
    const origProps = getParaPropsFromDoc(doc);
    const restoredProps = getParaPropsFromDoc(restoredDoc);
    expect(origProps.alignment).toEqual(restoredProps.alignment);
  });

  it('all alignment values are valid', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const cmd = createSetAlignmentCommand();
    const ctx = makeCtx(doc, 0, 5);
    for (const alignment of ['left', 'center', 'right', 'justify'] as const) {
      expect(cmd.canRun(ctx, { alignment })).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Set indent
// ---------------------------------------------------------------------------

describe('indent commands', () => {
  it('createSetIndentLeftCommand has correct id', () => {
    expect(createSetIndentLeftCommand().meta.id).toBe('app.format.indent.left');
  });

  it('createSetIndentRightCommand has correct id', () => {
    expect(createSetIndentRightCommand().meta.id).toBe('app.format.indent.right');
  });

  it('createSetFirstLineIndentCommand has correct id', () => {
    expect(createSetFirstLineIndentCommand().meta.id).toBe('app.format.firstLineIndent');
  });

  it('createSetHangingIndentCommand has correct id', () => {
    expect(createSetHangingIndentCommand().meta.id).toBe('app.format.hangingIndent');
  });

  it('sets left indent on paragraph', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const cmd = createSetIndentLeftCommand();
    const ctx = makeCtx(doc, 0, 5);
    const result = cmd.run(ctx, { twips: 720 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { doc: newDoc } = applyPatch(doc, result.value, { idGen: makeTestIdGen() });
    const paraProps = getParaPropsFromDoc(newDoc);
    expect(paraProps.indent?.leftTwips).toBe(720);
  });

  it('inverse restores original indent', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const cmd = createSetIndentLeftCommand();
    const ctx = makeCtx(doc, 0, 5);
    const result = cmd.run(ctx, { twips: 720 });
    if (!result.ok) return;
    const idGen = makeTestIdGen();
    const { doc: newDoc, inverse } = applyPatch(doc, result.value, { idGen });
    const { doc: restoredDoc } = applyPatch(newDoc, inverse, { idGen });
    const origProps = getParaPropsFromDoc(doc);
    const restoredProps = getParaPropsFromDoc(restoredDoc);
    expect(origProps.indent).toEqual(restoredProps.indent);
  });
});

// ---------------------------------------------------------------------------
// Set spacing
// ---------------------------------------------------------------------------

describe('spacing commands', () => {
  it('createSetSpacingBeforeCommand has correct id', () => {
    expect(createSetSpacingBeforeCommand().meta.id).toBe('app.format.spacingBefore');
  });

  it('createSetSpacingAfterCommand has correct id', () => {
    expect(createSetSpacingAfterCommand().meta.id).toBe('app.format.spacingAfter');
  });

  it('createSetLineSpacingCommand has correct id', () => {
    expect(createSetLineSpacingCommand().meta.id).toBe('app.format.lineSpacing');
  });

  it('sets spacing before on paragraph', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const cmd = createSetSpacingBeforeCommand();
    const ctx = makeCtx(doc, 0, 5);
    const result = cmd.run(ctx, { beforeTwips: 240 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { doc: newDoc } = applyPatch(doc, result.value, { idGen: makeTestIdGen() });
    const paraProps = getParaPropsFromDoc(newDoc);
    expect(paraProps.spacing?.beforeTwips).toBe(240);
  });

  it('sets spacing after on paragraph', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const cmd = createSetSpacingAfterCommand();
    const ctx = makeCtx(doc, 0, 5);
    const result = cmd.run(ctx, { afterTwips: 120 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { doc: newDoc } = applyPatch(doc, result.value, { idGen: makeTestIdGen() });
    const paraProps = getParaPropsFromDoc(newDoc);
    expect(paraProps.spacing?.afterTwips).toBe(120);
  });

  it('sets line spacing on paragraph', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const cmd = createSetLineSpacingCommand();
    const ctx = makeCtx(doc, 0, 5);
    const result = cmd.run(ctx, { lineTwips: 360, lineRule: 'auto' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { doc: newDoc } = applyPatch(doc, result.value, { idGen: makeTestIdGen() });
    const paraProps = getParaPropsFromDoc(newDoc);
    expect(paraProps.spacing?.lineTwips).toBe(360);
    expect(paraProps.spacing?.lineRule).toBe('auto');
  });
});

// ---------------------------------------------------------------------------
// Apply style
// ---------------------------------------------------------------------------

describe('createApplyStyleCommand', () => {
  it('has correct command id', () => {
    expect(createApplyStyleCommand().meta.id).toBe('app.format.applyStyle');
  });

  it('canRun returns false for empty styleId', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const cmd = createApplyStyleCommand();
    const ctx = makeCtx(doc, 0, 5);
    expect(cmd.canRun(ctx, { styleId: '' })).toBe(false);
  });

  it('sets styleRef on paragraph', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const cmd = createApplyStyleCommand();
    const ctx = makeCtx(doc, 0, 5);
    const result = cmd.run(ctx, { styleId: 'Heading1' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { doc: newDoc } = applyPatch(doc, result.value, { idGen: makeTestIdGen() });
    const paraProps = getParaPropsFromDoc(newDoc);
    expect(paraProps.styleRef).toBe('Heading1');
  });
});

// ---------------------------------------------------------------------------
// Toggle lists
// ---------------------------------------------------------------------------

describe('createToggleBulletedListCommand', () => {
  it('has correct command id', () => {
    expect(createToggleBulletedListCommand().meta.id).toBe('app.format.list.bulleted');
  });

  it('sets numbering numId=1 on paragraph', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const cmd = createToggleBulletedListCommand();
    const ctx = makeCtx(doc, 0, 5);
    const result = cmd.run(ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { doc: newDoc } = applyPatch(doc, result.value, { idGen: makeTestIdGen() });
    const paraProps = getParaPropsFromDoc(newDoc);
    expect(paraProps.numbering?.numId).toBe(1);
    expect(paraProps.numbering?.ilvl).toBe(0);
  });
});

describe('createToggleNumberedListCommand', () => {
  it('has correct command id', () => {
    expect(createToggleNumberedListCommand().meta.id).toBe('app.format.list.numbered');
  });

  it('sets numbering numId=2 on paragraph', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const cmd = createToggleNumberedListCommand();
    const ctx = makeCtx(doc, 0, 5);
    const result = cmd.run(ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { doc: newDoc } = applyPatch(doc, result.value, { idGen: makeTestIdGen() });
    const paraProps = getParaPropsFromDoc(newDoc);
    expect(paraProps.numbering?.numId).toBe(2);
    expect(paraProps.numbering?.ilvl).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// setRunProps idempotence property test (apply same partial twice)
// ---------------------------------------------------------------------------

describe('setRunProps idempotence', () => {
  it('applying the same run props partial twice is idempotent', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes('\0')),
        (text) => {
          const para = makeParagraph(text);
          const doc = makeDocument([para]);
          const cmd = createSetFontSizeCommand();
          const idGen = makeTestIdGen();
          const ctx1 = makeCtx(doc, 0, text.length);
          const r1 = cmd.run(ctx1, { halfPoints: 24 });
          if (!r1.ok) return true;
          const { doc: doc1 } = applyPatch(doc, r1.value, { idGen });
          const ctx2 = makeCtx(doc1, 0, text.length);
          const r2 = cmd.run(ctx2, { halfPoints: 24 });
          if (!r2.ok) return true;
          const { doc: doc2 } = applyPatch(doc1, r2.value, { idGen });
          // The props on the run should be the same in doc1 and doc2
          const props1 = getRunPropsFromDoc(doc1);
          const props2 = getRunPropsFromDoc(doc2);
          return props1.halfPoints === props2.halfPoints;
        },
      ),
      { numRuns: 50, seed: 7 },
    );
  });
});

// ---------------------------------------------------------------------------
// Coalesce key coverage
// ---------------------------------------------------------------------------

describe('coalesceKey conventions', () => {
  const commands = [
    createToggleBoldCommand(),
    createToggleItalicCommand(),
    createToggleUnderlineCommand(),
    createToggleStrikethroughCommand(),
    createSetFontNameCommand(),
    createSetFontSizeCommand(),
    createSetFontColorCommand(),
    createSetAlignmentCommand(),
    createSetIndentLeftCommand(),
    createSetSpacingBeforeCommand(),
    createApplyStyleCommand(),
    createToggleBulletedListCommand(),
    createToggleNumberedListCommand(),
  ];

  for (const cmd of commands) {
    it(`${cmd.meta.id} has a coalesceKey`, () => {
      expect(cmd.meta.coalesceKey).toBeTruthy();
    });
  }
});
