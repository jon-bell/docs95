import type { StyleRegistry, StyleDef } from './document.js';
import type { MutablePropsRegistry } from './props.js';
import type { RunProps, ParaProps } from './props.js';

// ---------------------------------------------------------------------------
// Built-in style seed
//
// These ids and property values match Word 95 (Word for Windows v7.0) defaults
// as observed in documents produced by that version.
// ---------------------------------------------------------------------------

interface StyleSeed {
  readonly id: string;
  readonly name: string;
  readonly type: StyleDef['type'];
  readonly basedOn?: string;
  readonly next?: string;
  readonly link?: string;
  readonly isDefault?: boolean;
  readonly builtIn?: boolean;
  readonly runProps?: RunProps;
  readonly paraProps?: ParaProps;
}

const SEEDS: readonly StyleSeed[] = [
  // ── Paragraph styles ─────────────────────────────────────────────────────

  {
    id: 'Normal',
    name: 'Normal',
    type: 'paragraph',
    isDefault: true,
    builtIn: true,
    // Times New Roman 10pt (halfPoints = 20), widow control on.
    runProps: { fontName: 'Times New Roman', halfPoints: 20 },
    paraProps: { widowControl: true },
  },

  {
    id: 'Heading1',
    name: 'Heading 1',
    type: 'paragraph',
    basedOn: 'Normal',
    next: 'Normal',
    link: 'Heading1Char',
    builtIn: true,
    // Arial 14pt bold.
    runProps: { fontName: 'Arial', halfPoints: 28, bold: true },
    paraProps: {
      outlineLevel: 0,
      keepNext: true,
      keepLines: true,
      spacing: { beforeTwips: 240, afterTwips: 60 },
    },
  },

  {
    id: 'Heading2',
    name: 'Heading 2',
    type: 'paragraph',
    basedOn: 'Normal',
    next: 'Normal',
    link: 'Heading2Char',
    builtIn: true,
    // Arial 12pt bold italic.
    runProps: { fontName: 'Arial', halfPoints: 24, bold: true, italic: true },
    paraProps: { outlineLevel: 1 },
  },

  {
    id: 'Heading3',
    name: 'Heading 3',
    type: 'paragraph',
    basedOn: 'Normal',
    next: 'Normal',
    link: 'Heading3Char',
    builtIn: true,
    // Arial 12pt bold.
    runProps: { fontName: 'Arial', halfPoints: 24, bold: true },
    paraProps: { outlineLevel: 2 },
  },

  {
    id: 'ListParagraph',
    name: 'List Paragraph',
    type: 'paragraph',
    basedOn: 'Normal',
    builtIn: true,
    paraProps: { indent: { leftTwips: 720 } },
  },

  // ── Character styles ──────────────────────────────────────────────────────

  {
    id: 'DefaultParagraphFont',
    name: 'Default Paragraph Font',
    type: 'character',
    isDefault: true,
    builtIn: true,
    // No rPr additions — this is the character baseline.
  },

  {
    id: 'Heading1Char',
    name: 'Heading 1 Char',
    type: 'character',
    basedOn: 'DefaultParagraphFont',
    link: 'Heading1',
    builtIn: true,
    runProps: { fontName: 'Arial', halfPoints: 28, bold: true },
  },

  {
    id: 'Heading2Char',
    name: 'Heading 2 Char',
    type: 'character',
    basedOn: 'DefaultParagraphFont',
    link: 'Heading2',
    builtIn: true,
    runProps: { fontName: 'Arial', halfPoints: 24, bold: true, italic: true },
  },

  {
    id: 'Heading3Char',
    name: 'Heading 3 Char',
    type: 'character',
    basedOn: 'DefaultParagraphFont',
    link: 'Heading3',
    builtIn: true,
    runProps: { fontName: 'Arial', halfPoints: 24, bold: true },
  },
];

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Seed a fresh StyleRegistry with the Normal.dot built-in styles.
 *
 * Each style's rPr / pPr are interned into `registry` so that the resulting
 * PropsIds are valid within the same MutablePropsRegistry that was used to
 * build the rest of the document.
 */
export function createNormalStylesRegistry(registry: MutablePropsRegistry): StyleRegistry {
  const styles = new Map<string, StyleDef>();

  for (const seed of SEEDS) {
    const runPropsId = seed.runProps !== undefined ? registry.internRun(seed.runProps) : undefined;
    const paraPropsId =
      seed.paraProps !== undefined ? registry.internPara(seed.paraProps) : undefined;

    const def: StyleDef = {
      id: seed.id,
      name: seed.name,
      type: seed.type,
      ...(seed.basedOn !== undefined ? { basedOn: seed.basedOn } : {}),
      ...(seed.next !== undefined ? { next: seed.next } : {}),
      ...(seed.link !== undefined ? { link: seed.link } : {}),
      ...(runPropsId !== undefined ? { runPropsId } : {}),
      ...(paraPropsId !== undefined ? { paraPropsId } : {}),
      ...(seed.isDefault === true ? { isDefault: true } : {}),
      ...(seed.builtIn === true ? { builtIn: true } : {}),
    };

    styles.set(seed.id, def);
  }

  return {
    styles,
    defaultParagraphStyleId: 'Normal',
    defaultCharacterStyleId: 'DefaultParagraphFont',
  };
}
