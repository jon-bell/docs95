import React, { useCallback, useId, useState } from 'react';

export interface FontDialogValues {
  readonly fontName: string;
  readonly fontStyle: 'regular' | 'italic' | 'bold' | 'boldItalic';
  readonly sizePt: number;
  readonly color: string; // 6-hex rgb
  readonly strikethrough: boolean;
  readonly smallCaps: boolean;
  readonly allCaps: boolean;
  readonly hidden: boolean;
}

export interface FontDialogProps {
  readonly initialValues: Partial<FontDialogValues>;
  readonly onConfirm: (values: FontDialogValues) => void;
  readonly onCancel: () => void;
}

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72] as const;
const FONT_STYLES = ['Regular', 'Italic', 'Bold', 'Bold Italic'] as const;

type FontStyleLabel = (typeof FONT_STYLES)[number];

function labelToValue(label: FontStyleLabel): FontDialogValues['fontStyle'] {
  switch (label) {
    case 'Regular':
      return 'regular';
    case 'Italic':
      return 'italic';
    case 'Bold':
      return 'bold';
    case 'Bold Italic':
      return 'boldItalic';
  }
}

function valueToLabel(v: FontDialogValues['fontStyle']): FontStyleLabel {
  switch (v) {
    case 'regular':
      return 'Regular';
    case 'italic':
      return 'Italic';
    case 'bold':
      return 'Bold';
    case 'boldItalic':
      return 'Bold Italic';
  }
}

export const FontDialog = React.memo(function FontDialog({
  initialValues,
  onConfirm,
  onCancel,
}: FontDialogProps) {
  const titleId = useId();

  const [fontName, setFontName] = useState(initialValues.fontName ?? 'Times New Roman');
  const [fontStyle, setFontStyle] = useState<FontDialogValues['fontStyle']>(
    initialValues.fontStyle ?? 'regular',
  );
  const [sizePt, setSizePt] = useState(initialValues.sizePt ?? 12);
  const [color, setColor] = useState(initialValues.color ?? '000000');
  const [strikethrough, setStrikethrough] = useState(initialValues.strikethrough ?? false);
  const [smallCaps, setSmallCaps] = useState(initialValues.smallCaps ?? false);
  const [allCaps, setAllCaps] = useState(initialValues.allCaps ?? false);
  const [hidden, setHidden] = useState(initialValues.hidden ?? false);

  const handleOk = useCallback(() => {
    onConfirm({ fontName, fontStyle, sizePt, color, strikethrough, smallCaps, allCaps, hidden });
  }, [onConfirm, fontName, fontStyle, sizePt, color, strikethrough, smallCaps, allCaps, hidden]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    },
    [onCancel],
  );

  const previewStyle: React.CSSProperties = {
    fontFamily: fontName,
    fontStyle: fontStyle === 'italic' || fontStyle === 'boldItalic' ? 'italic' : 'normal',
    fontWeight: fontStyle === 'bold' || fontStyle === 'boldItalic' ? 'bold' : 'normal',
    fontSize: `${sizePt}px`,
    color: `#${color}`,
    textDecoration: strikethrough ? 'line-through' : 'none',
    fontVariant: smallCaps ? 'small-caps' : 'normal',
    textTransform: allCaps ? 'uppercase' : 'none',
    visibility: hidden ? 'hidden' : 'visible',
  };

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
          Font
        </div>
        <div className="word-dialog-body">
          <div className="word-dialog-row">
            <div className="word-dialog-field">
              <label htmlFor="font-dialog-name">Font:</label>
              <input
                id="font-dialog-name"
                type="text"
                className="word-dialog-input"
                value={fontName}
                onChange={(e) => setFontName(e.target.value)}
              />
            </div>
            <div className="word-dialog-field">
              <label htmlFor="font-dialog-style">Font Style:</label>
              <select
                id="font-dialog-style"
                className="word-dialog-select"
                value={valueToLabel(fontStyle)}
                onChange={(e) => setFontStyle(labelToValue(e.target.value as FontStyleLabel))}
              >
                {FONT_STYLES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="word-dialog-field">
              <label htmlFor="font-dialog-size">Size:</label>
              <select
                id="font-dialog-size"
                className="word-dialog-select word-dialog-select-small"
                value={String(sizePt)}
                onChange={(e) => setSizePt(Number(e.target.value))}
              >
                {FONT_SIZES.map((pt) => (
                  <option key={pt} value={String(pt)}>
                    {pt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="word-dialog-row">
            <div className="word-dialog-field">
              <label htmlFor="font-dialog-color">Color:</label>
              <input
                id="font-dialog-color"
                type="color"
                value={`#${color}`}
                onChange={(e) => setColor(e.target.value.replace(/^#/, ''))}
              />
            </div>
          </div>

          <fieldset className="word-dialog-group">
            <legend>Effects</legend>
            <label className="word-dialog-checkbox-label">
              <input
                type="checkbox"
                checked={strikethrough}
                onChange={(e) => setStrikethrough(e.target.checked)}
              />
              Strikethrough
            </label>
            <label className="word-dialog-checkbox-label">
              <input
                type="checkbox"
                checked={smallCaps}
                onChange={(e) => setSmallCaps(e.target.checked)}
              />
              Small Caps
            </label>
            <label className="word-dialog-checkbox-label">
              <input
                type="checkbox"
                checked={allCaps}
                onChange={(e) => setAllCaps(e.target.checked)}
              />
              All Caps
            </label>
            <label className="word-dialog-checkbox-label">
              <input
                type="checkbox"
                checked={hidden}
                onChange={(e) => setHidden(e.target.checked)}
              />
              Hidden
            </label>
          </fieldset>

          <div className="word-dialog-preview-group">
            <div className="word-dialog-preview-label">Preview</div>
            <div className="word-dialog-preview" aria-label="Font preview">
              <span style={previewStyle}>AaBbCcDdEe</span>
            </div>
          </div>
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
