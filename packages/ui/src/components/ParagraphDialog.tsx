import React, { useCallback, useId, useState } from 'react';

export interface ParagraphDialogValues {
  readonly alignment: 'left' | 'center' | 'right' | 'justify';
  readonly indentLeftTwips: number;
  readonly indentRightTwips: number;
  readonly firstLineTwips: number;
  readonly hangingTwips: number;
  readonly spacingBeforeTwips: number;
  readonly spacingAfterTwips: number;
  readonly lineSpacingTwips: number;
  readonly outlineLevel: number;
  readonly keepNext: boolean;
  readonly widowControl: boolean;
}

export interface ParagraphDialogProps {
  readonly initialValues: Partial<ParagraphDialogValues>;
  readonly onConfirm: (values: ParagraphDialogValues) => void;
  readonly onCancel: () => void;
}

const ALIGNMENT_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Centered' },
  { value: 'right', label: 'Right' },
  { value: 'justify', label: 'Justified' },
] as const;

export const ParagraphDialog = React.memo(function ParagraphDialog({
  initialValues,
  onConfirm,
  onCancel,
}: ParagraphDialogProps) {
  const titleId = useId();

  const [alignment, setAlignment] = useState<ParagraphDialogValues['alignment']>(
    initialValues.alignment ?? 'left',
  );
  const [indentLeft, setIndentLeft] = useState(initialValues.indentLeftTwips ?? 0);
  const [indentRight, setIndentRight] = useState(initialValues.indentRightTwips ?? 0);
  const [firstLine, setFirstLine] = useState(initialValues.firstLineTwips ?? 0);
  const [hanging, setHanging] = useState(initialValues.hangingTwips ?? 0);
  const [spacingBefore, setSpacingBefore] = useState(initialValues.spacingBeforeTwips ?? 0);
  const [spacingAfter, setSpacingAfter] = useState(initialValues.spacingAfterTwips ?? 0);
  const [lineSpacing, setLineSpacing] = useState(initialValues.lineSpacingTwips ?? 240);
  const [outlineLevel, setOutlineLevel] = useState(initialValues.outlineLevel ?? 9);
  const [keepNext, setKeepNext] = useState(initialValues.keepNext ?? false);
  const [widowControl, setWidowControl] = useState(initialValues.widowControl ?? true);

  const handleOk = useCallback(() => {
    onConfirm({
      alignment,
      indentLeftTwips: indentLeft,
      indentRightTwips: indentRight,
      firstLineTwips: firstLine,
      hangingTwips: hanging,
      spacingBeforeTwips: spacingBefore,
      spacingAfterTwips: spacingAfter,
      lineSpacingTwips: lineSpacing,
      outlineLevel,
      keepNext,
      widowControl,
    });
  }, [
    onConfirm,
    alignment,
    indentLeft,
    indentRight,
    firstLine,
    hanging,
    spacingBefore,
    spacingAfter,
    lineSpacing,
    outlineLevel,
    keepNext,
    widowControl,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    },
    [onCancel],
  );

  return (
    <div className="dialog-overlay" role="presentation">
      <div
        className="word-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <div className="word-dialog-title" id={titleId}>
          Paragraph
        </div>
        <div className="word-dialog-body">
          {/* Alignment */}
          <div className="word-dialog-field">
            <label htmlFor="para-dialog-alignment">Alignment:</label>
            <select
              id="para-dialog-alignment"
              className="word-dialog-select"
              value={alignment}
              onChange={(e) => setAlignment(e.target.value as ParagraphDialogValues['alignment'])}
            >
              {ALIGNMENT_OPTIONS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          {/* Indentation */}
          <fieldset className="word-dialog-group">
            <legend>Indentation</legend>
            <div className="word-dialog-field">
              <label htmlFor="para-indent-left">Left (twips):</label>
              <input
                id="para-indent-left"
                type="number"
                className="word-dialog-input-small"
                min={0}
                value={indentLeft}
                onChange={(e) => setIndentLeft(Number(e.target.value))}
              />
            </div>
            <div className="word-dialog-field">
              <label htmlFor="para-indent-right">Right (twips):</label>
              <input
                id="para-indent-right"
                type="number"
                className="word-dialog-input-small"
                min={0}
                value={indentRight}
                onChange={(e) => setIndentRight(Number(e.target.value))}
              />
            </div>
            <div className="word-dialog-field">
              <label htmlFor="para-indent-first">First line (twips):</label>
              <input
                id="para-indent-first"
                type="number"
                className="word-dialog-input-small"
                value={firstLine}
                onChange={(e) => setFirstLine(Number(e.target.value))}
              />
            </div>
            <div className="word-dialog-field">
              <label htmlFor="para-indent-hanging">Hanging (twips):</label>
              <input
                id="para-indent-hanging"
                type="number"
                className="word-dialog-input-small"
                min={0}
                value={hanging}
                onChange={(e) => setHanging(Number(e.target.value))}
              />
            </div>
          </fieldset>

          {/* Spacing */}
          <fieldset className="word-dialog-group">
            <legend>Spacing</legend>
            <div className="word-dialog-field">
              <label htmlFor="para-spacing-before">Before (twips):</label>
              <input
                id="para-spacing-before"
                type="number"
                className="word-dialog-input-small"
                min={0}
                value={spacingBefore}
                onChange={(e) => setSpacingBefore(Number(e.target.value))}
              />
            </div>
            <div className="word-dialog-field">
              <label htmlFor="para-spacing-after">After (twips):</label>
              <input
                id="para-spacing-after"
                type="number"
                className="word-dialog-input-small"
                min={0}
                value={spacingAfter}
                onChange={(e) => setSpacingAfter(Number(e.target.value))}
              />
            </div>
            <div className="word-dialog-field">
              <label htmlFor="para-line-spacing">Line spacing (twips):</label>
              <input
                id="para-line-spacing"
                type="number"
                className="word-dialog-input-small"
                min={60}
                value={lineSpacing}
                onChange={(e) => setLineSpacing(Number(e.target.value))}
              />
            </div>
          </fieldset>

          {/* Pagination */}
          <fieldset className="word-dialog-group">
            <legend>Pagination</legend>
            <div className="word-dialog-field">
              <label htmlFor="para-outline-level">Outline level (0–9):</label>
              <input
                id="para-outline-level"
                type="number"
                className="word-dialog-input-small"
                min={0}
                max={9}
                value={outlineLevel}
                onChange={(e) => setOutlineLevel(Number(e.target.value))}
              />
            </div>
            <label className="word-dialog-checkbox-label">
              <input
                type="checkbox"
                checked={keepNext}
                onChange={(e) => setKeepNext(e.target.checked)}
              />
              Keep with next
            </label>
            <label className="word-dialog-checkbox-label">
              <input
                type="checkbox"
                checked={widowControl}
                onChange={(e) => setWidowControl(e.target.checked)}
              />
              Widow/orphan control
            </label>
          </fieldset>
        </div>

        <div className="word-dialog-buttons">
          <button
            type="button"
            className="word-dialog-btn word-dialog-btn-default"
            onClick={handleOk}
          >
            OK
          </button>
          <button type="button" className="word-dialog-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
});
