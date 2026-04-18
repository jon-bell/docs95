import type { RunProps } from '@word/domain';
import type { LineBox, LineRun, PageLayout } from '@word/layout';
import React from 'react';
import { ListMarker } from './list-marker.js';
import { runPropsToStyle } from './run-styles.js';

export interface PageHostProps {
  readonly pages: readonly PageLayout[];
  readonly zoom?: number;
}

// ---------------------------------------------------------------------------
// LineRun extension: M1-C adds resolvedRunProps to LineRun.
// Until that lands, we read it via this typed intersection so TypeScript
// accepts the field without modifying @word/layout.

type LineRunWithFormatting = LineRun & {
  readonly resolvedRunProps?: RunProps;
};

// LineBox extension: M1-C adds an optional marker field.
type LineBoxWithMarker = LineBox & {
  readonly marker?: { readonly text: string; readonly widthPx: number };
};

// ---------------------------------------------------------------------------
// Internal subcomponents

interface RunComponentProps {
  readonly run: LineRunWithFormatting;
}

const Run = React.memo(function Run({ run }: RunComponentProps) {
  const formatting = run.resolvedRunProps;
  const formattingStyle = formatting !== undefined ? runPropsToStyle(formatting) : undefined;

  const displayText = formatting?.caps === true ? run.text.toUpperCase() : run.text;

  return (
    <span
      className="run"
      data-run-id={run.runId}
      style={{
        left: run.leftPx,
        width: run.widthPx,
        ...formattingStyle,
      }}
    >
      {displayText}
    </span>
  );
});

interface LineProps {
  readonly line: LineBoxWithMarker;
}

const Line = React.memo(function Line({ line }: LineProps) {
  return (
    <div
      className="line"
      style={{
        top: line.topPx,
        left: line.leftPx,
        width: line.widthPx,
        height: line.heightPx,
      }}
    >
      {line.marker !== undefined && <ListMarker marker={line.marker} />}
      {line.runs.map((run) => (
        <Run key={`${run.runId}-${run.offsetInRun}`} run={run as LineRunWithFormatting} />
      ))}
    </div>
  );
});

interface PageProps {
  readonly page: PageLayout;
  readonly index: number;
}

const Page = React.memo(
  function Page({ page, index }: PageProps) {
    return (
      <div
        className="page"
        role="region"
        aria-label={`Page ${index + 1}`}
        data-page-index={index}
        style={{
          width: page.sizePx.widthPx,
          height: page.sizePx.heightPx,
        }}
      >
        {page.lines.map((line) => (
          <Line key={`${line.paragraphId}-${line.lineIndex}`} line={line as LineBoxWithMarker} />
        ))}
      </div>
    );
  },
  // Compare by page object identity — layout produces new objects only on change.
  (prev, next) => prev.page === next.page && prev.index === next.index,
);

// ---------------------------------------------------------------------------
// Public component

/**
 * Scrolling host for all document pages.
 * Renders one Page element per PageLayout entry.
 */
export const PageHost: React.FC<PageHostProps> = ({ pages }) => {
  return (
    <div role="document" className="page-host" tabIndex={0}>
      {pages.map((page, i) => (
        <Page key={page.index} page={page} index={i} />
      ))}
    </div>
  );
};
