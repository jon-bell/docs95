import { describe, it, expect } from 'vitest';
import { resolveNumbering } from './numbering-resolution.js';
import type { AbstractNumDef } from './numbering-resolution.js';
import { createMutablePropsRegistry } from './document-factory.js';
import type { Document, NumberingDef } from './document.js';
import type { Paragraph } from './block.js';
import { asNodeId } from './node.js';
import type { ParaProps } from './props.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a doc context with a registry that has para props for the given
 * (numId, ilvl) combinations already interned.  Returns the frozen doc
 * and a lookup for paragraph PropsIds.
 *
 * Pattern: caller declares the (numId, ilvl) pairs they need, then builds
 * the doc once so PropsIds are valid in the frozen registry.
 */
function buildDoc(
  abstract: AbstractNumDef,
  numId: number,
  numPrCombinations: ReadonlyArray<{ numId: number; ilvl: number }>,
): {
  doc: Pick<Document, 'numbering' | 'styles' | 'props' | 'defaults'>;
  paraPropsId: (
    numId: number,
    ilvl: number,
  ) => ReturnType<ReturnType<typeof createMutablePropsRegistry>['internPara']>;
} {
  const reg = createMutablePropsRegistry();
  const defaultRunId = reg.internRun({});
  const defaultParaId = reg.internPara({});

  // Intern a bare para (no numbering) for the "no numbering" case.
  const bareId = reg.internPara({});

  // Pre-intern all (numId, ilvl) combinations.
  const propsIdMap = new Map<string, ReturnType<typeof reg.internPara>>();
  for (const { numId: nId, ilvl } of numPrCombinations) {
    const key = `${nId}:${ilvl}`;
    if (!propsIdMap.has(key)) {
      propsIdMap.set(key, reg.internPara({ numbering: { numId: nId, ilvl } } satisfies ParaProps));
    }
  }

  const numDef: NumberingDef = { id: numId, abstractId: abstract.id };
  const props = reg.freeze();

  const doc: Pick<Document, 'numbering' | 'styles' | 'props' | 'defaults'> = {
    numbering: {
      nums: new Map([[numId, numDef]]),
      abstracts: new Map([[abstract.id, abstract]]),
    },
    styles: {
      styles: new Map(),
      defaultParagraphStyleId: 'Normal',
      defaultCharacterStyleId: 'DefaultParagraphFont',
    },
    props,
    defaults: { runPropsId: defaultRunId, paraPropsId: defaultParaId },
  };

  void bareId; // used in bare-paragraph test

  return {
    doc,
    paraPropsId: (nId: number, ilvl: number) => {
      const key = `${nId}:${ilvl}`;
      const id = propsIdMap.get(key);
      if (id === undefined) throw new Error(`paraPropsId not pre-interned for ${key}`);
      return id;
    },
  };
}

function makePara(
  paraPropsId: ReturnType<ReturnType<typeof createMutablePropsRegistry>['internPara']>,
): Paragraph {
  return {
    id: asNodeId('para-test-aaaaaaaaaa'),
    type: 'paragraph',
    attrs: { paraPropsId },
    children: [],
  };
}

// A minimal decimal abstractNum with 9 levels.
function makeDecimalAbstract(id: number = 0): AbstractNumDef {
  const levels = Array.from({ length: 9 }, (_, i) => ({
    ilvl: i,
    start: 1,
    numFmt: 'decimal' as const,
    lvlText: `%${i + 1}.`,
    indentTwips: (i + 1) * 720,
  }));
  return { id, levels };
}

// ---------------------------------------------------------------------------
// Decimal list tests
// ---------------------------------------------------------------------------

describe('resolveNumbering — decimal', () => {
  it('returns undefined when paragraph has no numbering', () => {
    const abstract = makeDecimalAbstract();
    const { doc } = buildDoc(abstract, 1, [{ numId: 1, ilvl: 0 }]);

    // Build a paragraph whose paraPropsId is in the doc's registry but has no numbering.
    // Use the doc defaults.paraPropsId (which is a bare para props).
    const para: Paragraph = makePara(doc.defaults.paraPropsId);
    const result = resolveNumbering(doc, para, new Map());
    expect(result).toBeUndefined();
  });

  it('simple decimal list: 1., 2., 3.', () => {
    const abstract = makeDecimalAbstract();
    const { doc, paraPropsId } = buildDoc(abstract, 1, [{ numId: 1, ilvl: 0 }]);

    const counterState = new Map<number, number[]>();

    const r1 = resolveNumbering(doc, makePara(paraPropsId(1, 0)), counterState);
    const r2 = resolveNumbering(doc, makePara(paraPropsId(1, 0)), counterState);
    const r3 = resolveNumbering(doc, makePara(paraPropsId(1, 0)), counterState);

    expect(r1?.text).toBe('1.');
    expect(r2?.text).toBe('2.');
    expect(r3?.text).toBe('3.');
  });

  it('indentTwips reflects ilvl', () => {
    const abstract = makeDecimalAbstract();
    const { doc, paraPropsId } = buildDoc(abstract, 1, [
      { numId: 1, ilvl: 0 },
      { numId: 1, ilvl: 1 },
    ]);

    const counterState = new Map<number, number[]>();

    const r0 = resolveNumbering(doc, makePara(paraPropsId(1, 0)), counterState);
    const r1 = resolveNumbering(doc, makePara(paraPropsId(1, 1)), counterState);

    expect(r0?.indentTwips).toBe(720);
    expect(r1?.indentTwips).toBe(1440);
  });

  it('restart sub-level counter when parent increments: 1., 1.1., 1.2., 2., 2.1.', () => {
    // Multi-level template: level 0 = "%1.", level 1 = "%1.%2."
    const levels = [
      { ilvl: 0, start: 1, numFmt: 'decimal' as const, lvlText: '%1.', indentTwips: 720 },
      { ilvl: 1, start: 1, numFmt: 'decimal' as const, lvlText: '%1.%2.', indentTwips: 1440 },
      ...Array.from({ length: 7 }, (_, i) => ({
        ilvl: i + 2,
        start: 1,
        numFmt: 'decimal' as const,
        lvlText: `%${i + 3}.`,
        indentTwips: (i + 3) * 720,
      })),
    ];
    const abstract: AbstractNumDef = { id: 0, levels };
    const { doc, paraPropsId } = buildDoc(abstract, 1, [
      { numId: 1, ilvl: 0 },
      { numId: 1, ilvl: 1 },
    ]);

    const counterState = new Map<number, number[]>();

    const r1 = resolveNumbering(doc, makePara(paraPropsId(1, 0)), counterState);
    const r11 = resolveNumbering(doc, makePara(paraPropsId(1, 1)), counterState);
    const r12 = resolveNumbering(doc, makePara(paraPropsId(1, 1)), counterState);
    const r2 = resolveNumbering(doc, makePara(paraPropsId(1, 0)), counterState);
    const r21 = resolveNumbering(doc, makePara(paraPropsId(1, 1)), counterState);

    expect(r1?.text).toBe('1.');
    expect(r11?.text).toBe('1.1.');
    expect(r12?.text).toBe('1.2.');
    expect(r2?.text).toBe('2.');
    expect(r21?.text).toBe('2.1.'); // sub-level reset when parent incremented
  });

  it('returns undefined when numId is not in registry', () => {
    const abstract = makeDecimalAbstract();
    // Doc has numId=99, paragraph references numId=999 which is absent.
    const { doc, paraPropsId } = buildDoc(abstract, 99, [{ numId: 999, ilvl: 0 }]);
    const result = resolveNumbering(doc, makePara(paraPropsId(999, 0)), new Map());
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Bullet list tests
// ---------------------------------------------------------------------------

describe('resolveNumbering — bullet', () => {
  it('returns the bullet character as text', () => {
    const levels = Array.from({ length: 9 }, (_, i) => ({
      ilvl: i,
      start: 1,
      numFmt: 'bullet' as const,
      lvlText: '\u2022',
      indentTwips: (i + 1) * 720,
    }));
    const abstract: AbstractNumDef = { id: 1, levels };
    const { doc, paraPropsId } = buildDoc(abstract, 2, [{ numId: 2, ilvl: 0 }]);

    const result = resolveNumbering(doc, makePara(paraPropsId(2, 0)), new Map());
    expect(result?.text).toBe('\u2022');
  });
});

// ---------------------------------------------------------------------------
// Roman numeral tests
// ---------------------------------------------------------------------------

describe('resolveNumbering — roman numerals', () => {
  it('upper roman: I, II, III, IV, V', () => {
    const levels = Array.from({ length: 9 }, (_, i) => ({
      ilvl: i,
      start: 1,
      numFmt: 'upperRoman' as const,
      lvlText: '%1.',
      indentTwips: (i + 1) * 720,
    }));
    const abstract: AbstractNumDef = { id: 0, levels };
    const { doc, paraPropsId } = buildDoc(abstract, 1, [{ numId: 1, ilvl: 0 }]);
    const state = new Map<number, number[]>();

    const texts = [1, 2, 3, 4, 5].map(
      () => resolveNumbering(doc, makePara(paraPropsId(1, 0)), state)?.text,
    );
    expect(texts).toEqual(['I.', 'II.', 'III.', 'IV.', 'V.']);
  });

  it('lower roman: i, ii, iii', () => {
    const levels = Array.from({ length: 9 }, (_, i) => ({
      ilvl: i,
      start: 1,
      numFmt: 'lowerRoman' as const,
      lvlText: '%1.',
      indentTwips: (i + 1) * 720,
    }));
    const abstract: AbstractNumDef = { id: 0, levels };
    const { doc, paraPropsId } = buildDoc(abstract, 1, [{ numId: 1, ilvl: 0 }]);
    const state = new Map<number, number[]>();

    const texts = [1, 2, 3].map(
      () => resolveNumbering(doc, makePara(paraPropsId(1, 0)), state)?.text,
    );
    expect(texts).toEqual(['i.', 'ii.', 'iii.']);
  });
});

// ---------------------------------------------------------------------------
// Letter format tests
// ---------------------------------------------------------------------------

describe('resolveNumbering — letter formats', () => {
  it('upperLetter: A, B, C', () => {
    const levels = Array.from({ length: 9 }, (_, i) => ({
      ilvl: i,
      start: 1,
      numFmt: 'upperLetter' as const,
      lvlText: '%1.',
      indentTwips: (i + 1) * 720,
    }));
    const abstract: AbstractNumDef = { id: 0, levels };
    const { doc, paraPropsId } = buildDoc(abstract, 1, [{ numId: 1, ilvl: 0 }]);
    const state = new Map<number, number[]>();

    const texts = [1, 2, 3].map(
      () => resolveNumbering(doc, makePara(paraPropsId(1, 0)), state)?.text,
    );
    expect(texts).toEqual(['A.', 'B.', 'C.']);
  });

  it('lowerLetter: a, b, c', () => {
    const levels = Array.from({ length: 9 }, (_, i) => ({
      ilvl: i,
      start: 1,
      numFmt: 'lowerLetter' as const,
      lvlText: '%1)',
      indentTwips: (i + 1) * 720,
    }));
    const abstract: AbstractNumDef = { id: 0, levels };
    const { doc, paraPropsId } = buildDoc(abstract, 1, [{ numId: 1, ilvl: 0 }]);
    const state = new Map<number, number[]>();

    const texts = [1, 2, 3].map(
      () => resolveNumbering(doc, makePara(paraPropsId(1, 0)), state)?.text,
    );
    expect(texts).toEqual(['a)', 'b)', 'c)']);
  });
});
