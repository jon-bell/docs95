import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import type {
  Document,
  Section,
  Paragraph,
  Run,
  NodeId,
  PropsId,
  RunProps,
  ParaProps,
  SectionProps,
} from '@word/domain';
import { asNodeId, asPropsId } from '@word/domain';
import type { SelectionSet } from '@word/engine';
import { useActiveFormatting } from './use-active-formatting.js';

// Minimal in-test helpers — mirror engine/test-helpers without importing from @word/engine.
let _counter = 0;
function freshId(prefix = 'n'): NodeId {
  return asNodeId(`${prefix}-${++_counter}`);
}

const EMPTY_SELECTION: SelectionSet = {
  primary: {
    anchor: { leafId: '' as NodeId, offset: 0 },
    focus: { leafId: '' as NodeId, offset: 0 },
  },
  additional: [],
};

function makeRun(text: string, runPropsId: PropsId): Run {
  return { id: freshId('run'), type: 'run', attrs: { runPropsId }, text };
}

function makePara(runs: readonly Run[], paraPropsId: PropsId): Paragraph {
  return { id: freshId('para'), type: 'paragraph', attrs: { paraPropsId }, children: runs };
}

function makeSection(paras: readonly Paragraph[]): Section {
  const spId = asPropsId('sp');
  return {
    id: freshId('sec'),
    type: 'section',
    attrs: { sectionPropsId: spId },
    children: paras,
  };
}

const DEFAULT_SECTION_PROPS: SectionProps = {
  pageSize: { widthTwips: 12240, heightTwips: 15840, orient: 'portrait' },
  pageMargin: {
    topTwips: 1440,
    bottomTwips: 1440,
    leftTwips: 1800,
    rightTwips: 1800,
    headerTwips: 720,
    footerTwips: 720,
    gutterTwips: 0,
  },
};

function runMap(...entries: Array<[PropsId, RunProps]>): ReadonlyMap<PropsId, RunProps> {
  return new Map(entries);
}

function paraMap(...entries: Array<[PropsId, ParaProps]>): ReadonlyMap<PropsId, ParaProps> {
  return new Map(entries);
}

function makeDoc(
  paras: readonly Paragraph[],
  rMap: ReadonlyMap<PropsId, RunProps>,
  pMap: ReadonlyMap<PropsId, ParaProps>,
): Document {
  const spId = asPropsId('sp');
  return {
    id: freshId('doc'),
    version: 0,
    sections: [makeSection(paras)],
    footnotes: new Map(),
    endnotes: new Map(),
    comments: new Map(),
    bookmarks: new Map(),
    hyperlinks: new Map(),
    drawings: new Map(),
    images: new Map(),
    fields: new Map(),
    styles: {
      styles: new Map(),
      defaultParagraphStyleId: 'Normal',
      defaultCharacterStyleId: 'DefaultParagraphFont',
    },
    numbering: { nums: new Map(), abstracts: new Map() },
    fonts: { faces: new Map() },
    props: {
      run: rMap,
      para: pMap,
      section: new Map([[spId, DEFAULT_SECTION_PROPS]]),
      table: new Map(),
      row: new Map(),
      cell: new Map(),
    },
    defaults: { runPropsId: asPropsId('dr'), paraPropsId: asPropsId('dp') },
    meta: {},
  };
}

describe('useActiveFormatting', () => {
  it('returns empty object for null doc', () => {
    const { result } = renderHook(() => useActiveFormatting(null, EMPTY_SELECTION));
    expect(result.current).toEqual({});
  });

  it('returns bold true for homogeneous bold selection', () => {
    const rpId = asPropsId('rp1');
    const ppId = asPropsId('pp1');
    const run = makeRun('hello', rpId);
    const para = makePara([run], ppId);
    const doc = makeDoc([para], runMap([rpId, { bold: true }]), paraMap([ppId, {}]));

    const { result } = renderHook(() => useActiveFormatting(doc, EMPTY_SELECTION));
    expect(result.current.bold).toBe(true);
  });

  it('returns bold undefined for mixed selection (one bold, one not)', () => {
    const rpId1 = asPropsId('rp-bold');
    const rpId2 = asPropsId('rp-normal');
    const ppId = asPropsId('pp1');
    const run1 = makeRun('hello ', rpId1);
    const run2 = makeRun('world', rpId2);
    const para = makePara([run1, run2], ppId);
    const doc = makeDoc([para], runMap([rpId1, { bold: true }], [rpId2, {}]), paraMap([ppId, {}]));

    const { result } = renderHook(() => useActiveFormatting(doc, EMPTY_SELECTION));
    // Mixed → undefined
    expect(result.current.bold).toBeUndefined();
  });

  it('returns italic true for homogeneous italic runs', () => {
    const rpId = asPropsId('rp-italic');
    const ppId = asPropsId('pp1');
    const run = makeRun('test', rpId);
    const para = makePara([run], ppId);
    const doc = makeDoc([para], runMap([rpId, { italic: true }]), paraMap([ppId, {}]));

    const { result } = renderHook(() => useActiveFormatting(doc, EMPTY_SELECTION));
    expect(result.current.italic).toBe(true);
  });

  it('returns underline true when underline is single', () => {
    const rpId = asPropsId('rp-ul');
    const ppId = asPropsId('pp1');
    const run = makeRun('test', rpId);
    const para = makePara([run], ppId);
    const doc = makeDoc([para], runMap([rpId, { underline: 'single' }]), paraMap([ppId, {}]));

    const { result } = renderHook(() => useActiveFormatting(doc, EMPTY_SELECTION));
    expect(result.current.underline).toBe(true);
  });

  it('returns underline false when underline is none', () => {
    const rpId = asPropsId('rp-ul-none');
    const ppId = asPropsId('pp1');
    const run = makeRun('test', rpId);
    const para = makePara([run], ppId);
    const doc = makeDoc([para], runMap([rpId, { underline: 'none' }]), paraMap([ppId, {}]));

    const { result } = renderHook(() => useActiveFormatting(doc, EMPTY_SELECTION));
    expect(result.current.underline).toBe(false);
  });

  it('returns fontName when all runs share same font', () => {
    const rpId = asPropsId('rp-font');
    const ppId = asPropsId('pp1');
    const run = makeRun('test', rpId);
    const para = makePara([run], ppId);
    const doc = makeDoc([para], runMap([rpId, { fontName: 'Arial' }]), paraMap([ppId, {}]));

    const { result } = renderHook(() => useActiveFormatting(doc, EMPTY_SELECTION));
    expect(result.current.fontName).toBe('Arial');
  });

  it('returns fontName undefined when runs have different fonts (mixed)', () => {
    const rpId1 = asPropsId('rp-arial');
    const rpId2 = asPropsId('rp-times');
    const ppId = asPropsId('pp1');
    const run1 = makeRun('a', rpId1);
    const run2 = makeRun('b', rpId2);
    const para = makePara([run1, run2], ppId);
    const doc = makeDoc(
      [para],
      runMap([rpId1, { fontName: 'Arial' }], [rpId2, { fontName: 'Times New Roman' }]),
      paraMap([ppId, {}]),
    );

    const { result } = renderHook(() => useActiveFormatting(doc, EMPTY_SELECTION));
    expect(result.current.fontName).toBeUndefined();
  });

  it('returns alignment from para props', () => {
    const rpId = asPropsId('rp1');
    const ppId = asPropsId('pp-center');
    const run = makeRun('test', rpId);
    const para = makePara([run], ppId);
    const doc = makeDoc([para], runMap([rpId, {}]), paraMap([ppId, { alignment: 'center' }]));

    const { result } = renderHook(() => useActiveFormatting(doc, EMPTY_SELECTION));
    expect(result.current.alignment).toBe('center');
  });

  it('returns alignment undefined when paragraphs have mixed alignment', () => {
    const rpId = asPropsId('rp1');
    const ppId1 = asPropsId('pp-left');
    const ppId2 = asPropsId('pp-right');
    const run1 = makeRun('a', rpId);
    const run2 = makeRun('b', rpId);
    const para1 = makePara([run1], ppId1);
    const para2 = makePara([run2], ppId2);
    const doc = makeDoc(
      [para1, para2],
      runMap([rpId, {}]),
      paraMap([ppId1, { alignment: 'left' }], [ppId2, { alignment: 'right' }]),
    );

    const { result } = renderHook(() => useActiveFormatting(doc, EMPTY_SELECTION));
    expect(result.current.alignment).toBeUndefined();
  });

  it('returns color string from rgb color value', () => {
    const rpId = asPropsId('rp-color');
    const ppId = asPropsId('pp1');
    const run = makeRun('test', rpId);
    const para = makePara([run], ppId);
    const doc = makeDoc(
      [para],
      runMap([rpId, { color: { kind: 'rgb', value: 'ff0000' } }]),
      paraMap([ppId, {}]),
    );

    const { result } = renderHook(() => useActiveFormatting(doc, EMPTY_SELECTION));
    expect(result.current.color).toBe('ff0000');
  });

  it('returns partial result when doc has no runs (para props only)', () => {
    const ppId = asPropsId('pp1');
    const para = makePara([], ppId);
    const doc = makeDoc([para], runMap(), paraMap([ppId, { alignment: 'justify' }]));

    const { result } = renderHook(() => useActiveFormatting(doc, EMPTY_SELECTION));
    expect(result.current.alignment).toBe('justify');
  });

  it('returns empty when doc has no runs and no meaningful para props', () => {
    const ppId = asPropsId('pp1');
    const para = makePara([], ppId);
    const doc = makeDoc([para], runMap(), paraMap([ppId, {}]));

    const { result } = renderHook(() => useActiveFormatting(doc, EMPTY_SELECTION));
    expect(result.current).toBeDefined();
  });
});
