// Benchmark layoutDocument on a 100-paragraph document (~50 words each).
// Tests the engine's line-breaking and pagination at non-trivial scale.

import { createEmptyDocument, createIdGen } from '@word/domain';
import type { Document, Paragraph, Section } from '@word/domain';
import { asNodeId } from '@word/domain';
import { layoutDocument } from '@word/layout';
import type { FontMetricsPort, MeasureProps } from '@word/layout';
import { bench } from '../timers.js';
import type { BenchResult } from '../timers.js';

const LOREM =
  'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor ' +
  'incididunt ut labore et dolore magna aliqua Ut enim ad minim veniam quis nostrud ' +
  'exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat';

/** Stub metrics: measure by character count × avg char width. No canvas needed. */
const stubMetrics: FontMetricsPort = {
  measure(text: string, props: MeasureProps) {
    const heightPx = (props.halfPoints / 2) * (96 / 72);
    // ~6px per character at 12pt is a reasonable approximation
    const charWidth = heightPx * 0.5;
    return {
      widthPx: text.length * charWidth,
      heightPx,
      ascentPx: heightPx * 0.8,
      descentPx: heightPx * 0.2,
    };
  },
};

function buildLargeDocument(): Document {
  const idGen = createIdGen();
  const base = createEmptyDocument(idGen);

  // Reuse the existing props from the empty doc.
  const firstBlock = base.sections[0]?.children[0];
  if (firstBlock === undefined || firstBlock.type !== 'paragraph') {
    throw new Error('Empty doc has no paragraph as first block');
  }
  const paraPropsId = firstBlock.attrs.paraPropsId;

  const defaultRunPropsId = base.defaults.runPropsId;

  const paragraphs: Paragraph[] = [];
  for (let i = 0; i < 100; i++) {
    const runId = asNodeId(`perf-run-${i}`);
    const paraId = asNodeId(`perf-para-${i}`);
    const para: Paragraph = {
      id: paraId,
      type: 'paragraph',
      attrs: { paraPropsId },
      children: [
        {
          id: runId,
          type: 'run',
          attrs: { runPropsId: defaultRunPropsId },
          text: LOREM,
        },
      ],
    };
    paragraphs.push(para);
  }

  const sectionPropsId = base.sections[0]?.attrs.sectionPropsId;
  if (sectionPropsId === undefined) throw new Error('Empty doc has no section');

  const section: Section = {
    id: asNodeId('perf-section-0'),
    type: 'section',
    attrs: { sectionPropsId },
    children: paragraphs,
  };

  return {
    ...base,
    sections: [section],
  };
}

export function runLayoutLarge(): BenchResult {
  const doc = buildLargeDocument();

  return bench('layout:100-para', () => layoutDocument({ doc, metrics: stubMetrics }), {
    warmup: 10,
    iterations: 100,
  });
}
