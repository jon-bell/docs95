/**
 * Minimal document factory for unit tests.
 * Creates deterministic, structurally-valid Documents without the full domain machinery.
 */
import type {
  Document,
  Section,
  Paragraph,
  Run,
  NodeId,
  PropsId,
  IsoDateTime,
  IdGenPort,
  ClockPort,
  RandomPort,
  LogPort,
} from '@word/domain';
import { asNodeId, asPropsId } from '@word/domain';

let _idCounter = 0;

export function resetIdCounter(): void {
  _idCounter = 0;
}

export function makeId(prefix = 'id'): NodeId {
  return asNodeId(`${prefix}-${++_idCounter}`);
}

export const testPropsId: PropsId = asPropsId('test-props-id');

export function makeRun(text: string, id?: NodeId): Run {
  return {
    id: id ?? makeId('run'),
    type: 'run',
    attrs: { runPropsId: testPropsId },
    text,
  };
}

export function makeParagraph(text = '', id?: NodeId): Paragraph {
  const paraId = id ?? makeId('para');
  const children: readonly Run[] = text.length > 0 ? [makeRun(text)] : [];
  return {
    id: paraId,
    type: 'paragraph',
    attrs: { paraPropsId: testPropsId },
    children,
  };
}

export function makeSection(paragraphs: Paragraph[], id?: NodeId): Section {
  return {
    id: id ?? makeId('section'),
    type: 'section',
    attrs: { sectionPropsId: testPropsId },
    children: paragraphs,
  };
}

export function makeDocument(paragraphs: Paragraph[] = []): Document {
  const defaultPara = paragraphs.length > 0 ? paragraphs : [makeParagraph()];
  const section = makeSection(defaultPara);
  return {
    id: makeId('doc'),
    version: 0,
    sections: [section],
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
    numbering: {
      nums: new Map(),
      abstracts: new Map(),
    },
    fonts: { faces: new Map() },
    props: {
      run: new Map([[testPropsId, {}]]),
      para: new Map([[testPropsId, {}]]),
      section: new Map([
        [
          testPropsId,
          {
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
          },
        ],
      ]),
      table: new Map(),
      row: new Map(),
      cell: new Map(),
    },
    defaults: {
      runPropsId: testPropsId,
      paraPropsId: testPropsId,
    },
    meta: {},
  };
}

let _txnCounter = 0;
export function makeTestIdGen(): IdGenPort {
  return {
    newId: () => asNodeId(`test-${++_txnCounter}`),
  };
}

export function makeTestClock(tsMs = 1000000000000): ClockPort {
  let now = tsMs;
  return {
    now: () => new Date(now++).toISOString() as IsoDateTime,
    perfNow: () => now++,
  };
}

export function makeTestRandom(): RandomPort {
  return {
    nextU32: () => 42,
    nextFloat: () => 0.5,
  };
}

export function makeTestLog(): LogPort {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
}

/** Get the first paragraph's text (flattened runs). */
export function firstParaText(doc: Document): string {
  const section = doc.sections[0];
  if (section === undefined) return '';
  const block = section.children[0];
  if (block === undefined || block.type !== 'paragraph') return '';
  return block.children
    .filter((c) => c.type === 'run')
    .map((c) => (c as Run).text)
    .join('');
}

/** Get the nth paragraph's text. */
export function nthParaText(doc: Document, n: number): string {
  const section = doc.sections[0];
  if (section === undefined) return '';
  const block = section.children[n];
  if (block === undefined || block.type !== 'paragraph') return '';
  return block.children
    .filter((c) => c.type === 'run')
    .map((c) => (c as Run).text)
    .join('');
}
