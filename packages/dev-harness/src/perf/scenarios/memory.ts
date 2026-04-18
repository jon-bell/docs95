// Measure heap and RSS after building a 100-paragraph document and laying it out.
// Reports process.memoryUsage() snapshot — not a benchmark, a point-in-time probe.

import { createEmptyDocument, createIdGen } from '@word/domain';
import type { Document, Paragraph, Section } from '@word/domain';
import { asNodeId } from '@word/domain';
import { layoutDocument } from '@word/layout';
import type { FontMetricsPort, MeasureProps } from '@word/layout';

const LOREM =
  'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor ' +
  'incididunt ut labore et dolore magna aliqua Ut enim ad minim veniam quis nostrud ' +
  'exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat';

const stubMetrics: FontMetricsPort = {
  measure(text: string, props: MeasureProps) {
    const heightPx = (props.halfPoints / 2) * (96 / 72);
    const charWidth = heightPx * 0.5;
    return {
      widthPx: text.length * charWidth,
      heightPx,
      ascentPx: heightPx * 0.8,
      descentPx: heightPx * 0.2,
    };
  },
};

export interface MemorySnapshot {
  readonly label: string;
  readonly heapUsedMb: number;
  readonly heapTotalMb: number;
  readonly rssMb: number;
  readonly externalMb: number;
}

function buildDoc(): Document {
  const idGen = createIdGen();
  const base = createEmptyDocument(idGen);

  const firstBlock = base.sections[0]?.children[0];
  if (firstBlock === undefined || firstBlock.type !== 'paragraph') {
    throw new Error('Empty doc has no paragraph as first block');
  }
  const paraPropsId = firstBlock.attrs.paraPropsId;
  const defaultRunPropsId = base.defaults.runPropsId;
  const sectionPropsId = base.sections[0]?.attrs.sectionPropsId;
  if (sectionPropsId === undefined) throw new Error('Empty doc has no section');

  const paragraphs: Paragraph[] = [];
  for (let i = 0; i < 100; i++) {
    paragraphs.push({
      id: asNodeId(`mem-para-${i}`),
      type: 'paragraph',
      attrs: { paraPropsId },
      children: [
        {
          id: asNodeId(`mem-run-${i}`),
          type: 'run',
          attrs: { runPropsId: defaultRunPropsId },
          text: LOREM,
        },
      ],
    });
  }

  const section: Section = {
    id: asNodeId('mem-section-0'),
    type: 'section',
    attrs: { sectionPropsId },
    children: paragraphs,
  };

  return { ...base, sections: [section] };
}

export function runMemoryCheck(): MemorySnapshot {
  // Force a GC collection if exposed (Node --expose-gc) so the baseline is clean.
  if (typeof global.gc === 'function') {
    global.gc();
  }

  const doc = buildDoc();
  // Lay out to bring all lazy structures into memory.
  layoutDocument({ doc, metrics: stubMetrics });

  if (typeof global.gc === 'function') {
    global.gc();
  }

  const mem = process.memoryUsage();
  return {
    label: 'memory:100-para',
    heapUsedMb: mem.heapUsed / 1024 / 1024,
    heapTotalMb: mem.heapTotal / 1024 / 1024,
    rssMb: mem.rss / 1024 / 1024,
    externalMb: mem.external / 1024 / 1024,
  };
}
