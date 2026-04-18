import React, { useCallback } from 'react';
import type { ActiveFormatting } from '../hooks/use-active-formatting.js';

export interface FormattingToolbarProps {
  readonly onCommand: (id: string, params?: unknown) => void;
  readonly activeFormatting: ActiveFormatting;
}

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72] as const;

const BUILTIN_FONTS = [
  'Arial',
  'Arial Narrow',
  'Book Antiqua',
  'Bookman Old Style',
  'Century',
  'Century Gothic',
  'Courier New',
  'Garamond',
  'Georgia',
  'Impact',
  'MS Sans Serif',
  'MS Serif',
  'Symbol',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
  'Wingdings',
] as const;

const PARAGRAPH_STYLES = [
  { id: 'Normal', name: 'Normal' },
  { id: 'Heading1', name: 'Heading 1' },
  { id: 'Heading2', name: 'Heading 2' },
  { id: 'Heading3', name: 'Heading 3' },
  { id: 'Heading4', name: 'Heading 4' },
  { id: 'Heading5', name: 'Heading 5' },
  { id: 'Heading6', name: 'Heading 6' },
  { id: 'ListBullet', name: 'List Bullet' },
  { id: 'ListNumber', name: 'List Number' },
  { id: 'BlockText', name: 'Block Text' },
  { id: 'BodyText', name: 'Body Text' },
  { id: 'Caption', name: 'Caption' },
  { id: 'FootnoteText', name: 'Footnote Text' },
] as const;

function halfPointsToPt(hp: number): number {
  return hp / 2;
}

function ptToHalfPoints(pt: number): number {
  return pt * 2;
}

export const FormattingToolbar = React.memo(function FormattingToolbar({
  onCommand,
  activeFormatting,
}: FormattingToolbarProps) {
  const handleStyleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onCommand('app.format.applyStyle', { styleId: e.target.value });
    },
    [onCommand],
  );

  const handleFontNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onCommand('app.format.fontName', { fontName: e.target.value });
    },
    [onCommand],
  );

  const handleFontSizeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const pt = Number(e.target.value);
      if (!Number.isNaN(pt) && pt > 0) {
        onCommand('app.format.fontSize', { halfPoints: ptToHalfPoints(pt) });
      }
    },
    [onCommand],
  );

  const handleBold = useCallback(() => {
    onCommand('app.format.bold');
  }, [onCommand]);

  const handleItalic = useCallback(() => {
    onCommand('app.format.italic');
  }, [onCommand]);

  const handleUnderline = useCallback(() => {
    onCommand('app.format.underline');
  }, [onCommand]);

  const handleStrikethrough = useCallback(() => {
    onCommand('app.format.strikethrough');
  }, [onCommand]);

  const handleAlignLeft = useCallback(() => {
    onCommand('app.format.alignment', 'left');
  }, [onCommand]);

  const handleAlignCenter = useCallback(() => {
    onCommand('app.format.alignment', 'center');
  }, [onCommand]);

  const handleAlignRight = useCallback(() => {
    onCommand('app.format.alignment', 'right');
  }, [onCommand]);

  const handleAlignJustify = useCallback(() => {
    onCommand('app.format.alignment', 'justify');
  }, [onCommand]);

  const handleBulletedList = useCallback(() => {
    onCommand('app.format.list.bulleted');
  }, [onCommand]);

  const handleNumberedList = useCallback(() => {
    onCommand('app.format.list.numbered');
  }, [onCommand]);

  const handleIndentIncrease = useCallback(() => {
    onCommand('app.format.indent.right');
  }, [onCommand]);

  const handleIndentDecrease = useCallback(() => {
    onCommand('app.format.indent.left');
  }, [onCommand]);

  const handleColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      // Strip the leading '#' that <input type="color"> provides
      const hex = e.target.value.replace(/^#/, '');
      onCommand('app.format.fontColor', { color: { kind: 'rgb', value: hex } });
    },
    [onCommand],
  );

  const currentPt =
    activeFormatting.halfPoints !== undefined
      ? halfPointsToPt(activeFormatting.halfPoints)
      : undefined;

  // Derive color value for the color picker (#rrggbb)
  const colorInputValue =
    activeFormatting.color !== undefined ? `#${activeFormatting.color}` : '#000000';

  return (
    <div className="formatting-toolbar" role="toolbar" aria-label="Formatting">
      {/* Style picker */}
      <select
        className="toolbar-select toolbar-select-style"
        aria-label="Paragraph style"
        value={activeFormatting.styleRef ?? ''}
        onChange={handleStyleChange}
      >
        {activeFormatting.styleRef === undefined || activeFormatting.styleRef === '' ? (
          <option value="">Normal</option>
        ) : null}
        {PARAGRAPH_STYLES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      <div className="toolbar-separator" role="separator" />

      {/* Font name */}
      <input
        type="text"
        className="toolbar-select toolbar-select-font"
        aria-label="Font name"
        list="toolbar-font-list"
        value={activeFormatting.fontName ?? ''}
        onChange={handleFontNameChange}
      />
      <datalist id="toolbar-font-list">
        {BUILTIN_FONTS.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>

      <div className="toolbar-separator" role="separator" />

      {/* Font size */}
      <select
        className="toolbar-select toolbar-select-size"
        aria-label="Font size"
        value={currentPt !== undefined ? String(currentPt) : ''}
        onChange={handleFontSizeChange}
      >
        {currentPt === undefined ? <option value="">—</option> : null}
        {FONT_SIZES.map((pt) => (
          <option key={pt} value={String(pt)}>
            {pt}
          </option>
        ))}
      </select>

      <div className="toolbar-separator" role="separator" />

      {/* Bold / Italic / Underline */}
      <button
        type="button"
        className={`toolbar-button${activeFormatting.bold === true ? ' toolbar-button--active' : ''}`}
        aria-label="Bold"
        aria-pressed={activeFormatting.bold === true}
        onClick={handleBold}
      >
        <b>B</b>
      </button>
      <button
        type="button"
        className={`toolbar-button${activeFormatting.italic === true ? ' toolbar-button--active' : ''}`}
        aria-label="Italic"
        aria-pressed={activeFormatting.italic === true}
        onClick={handleItalic}
      >
        <i>I</i>
      </button>
      <button
        type="button"
        className={`toolbar-button${activeFormatting.underline === true ? ' toolbar-button--active' : ''}`}
        aria-label="Underline"
        aria-pressed={activeFormatting.underline === true}
        onClick={handleUnderline}
      >
        <u>U</u>
      </button>
      <button
        type="button"
        className={`toolbar-button${activeFormatting.strikethrough === true ? ' toolbar-button--active' : ''}`}
        aria-label="Strikethrough"
        aria-pressed={activeFormatting.strikethrough === true}
        onClick={handleStrikethrough}
      >
        <s>S</s>
      </button>

      <div className="toolbar-separator" role="separator" />

      {/* Alignment */}
      <button
        type="button"
        className={`toolbar-button${activeFormatting.alignment === 'left' ? ' toolbar-button--active' : ''}`}
        aria-label="Align left"
        aria-pressed={activeFormatting.alignment === 'left'}
        onClick={handleAlignLeft}
      >
        ≡L
      </button>
      <button
        type="button"
        className={`toolbar-button${activeFormatting.alignment === 'center' ? ' toolbar-button--active' : ''}`}
        aria-label="Align center"
        aria-pressed={activeFormatting.alignment === 'center'}
        onClick={handleAlignCenter}
      >
        ≡C
      </button>
      <button
        type="button"
        className={`toolbar-button${activeFormatting.alignment === 'right' ? ' toolbar-button--active' : ''}`}
        aria-label="Align right"
        aria-pressed={activeFormatting.alignment === 'right'}
        onClick={handleAlignRight}
      >
        ≡R
      </button>
      <button
        type="button"
        className={`toolbar-button${activeFormatting.alignment === 'justify' ? ' toolbar-button--active' : ''}`}
        aria-label="Justify"
        aria-pressed={activeFormatting.alignment === 'justify'}
        onClick={handleAlignJustify}
      >
        ≡J
      </button>

      <div className="toolbar-separator" role="separator" />

      {/* Lists */}
      <button
        type="button"
        className={`toolbar-button${activeFormatting.listKind === 'numbered' ? ' toolbar-button--active' : ''}`}
        aria-label="Numbered list"
        aria-pressed={activeFormatting.listKind === 'numbered'}
        onClick={handleNumberedList}
      >
        1.
      </button>
      <button
        type="button"
        className={`toolbar-button${activeFormatting.listKind === 'bulleted' ? ' toolbar-button--active' : ''}`}
        aria-label="Bulleted list"
        aria-pressed={activeFormatting.listKind === 'bulleted'}
        onClick={handleBulletedList}
      >
        •
      </button>

      <div className="toolbar-separator" role="separator" />

      {/* Indent */}
      <button
        type="button"
        className="toolbar-button"
        aria-label="Increase indent"
        onClick={handleIndentIncrease}
      >
        →|
      </button>
      <button
        type="button"
        className="toolbar-button"
        aria-label="Decrease indent"
        onClick={handleIndentDecrease}
      >
        |←
      </button>

      <div className="toolbar-separator" role="separator" />

      {/* Font color */}
      <label className="toolbar-button toolbar-color-label" aria-label="Font color">
        <span aria-hidden="true">A</span>
        <input
          type="color"
          className="toolbar-color-input"
          aria-label="Font color picker"
          value={colorInputValue}
          onChange={handleColorChange}
        />
      </label>
    </div>
  );
});
