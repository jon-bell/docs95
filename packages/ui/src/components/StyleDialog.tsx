import React, { useCallback, useId, useState } from 'react';

export interface StyleEntry {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
}

export interface StyleDialogProps {
  readonly styles: readonly StyleEntry[];
  readonly currentStyleId?: string;
  readonly onApply: (styleId: string) => void;
  readonly onCancel: () => void;
}

const STUB_WARNING = 'New/Modify/Delete style is not yet implemented.';

export const StyleDialog = React.memo(function StyleDialog({
  styles,
  currentStyleId,
  onApply,
  onCancel,
}: StyleDialogProps) {
  const titleId = useId();
  const [selectedId, setSelectedId] = useState<string>(currentStyleId ?? styles[0]?.id ?? '');
  const [warning, setWarning] = useState<string | null>(null);

  const handleApply = useCallback(() => {
    if (selectedId.length > 0) {
      onApply(selectedId);
    }
  }, [onApply, selectedId]);

  const handleStub = useCallback(() => {
    setWarning(STUB_WARNING);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    },
    [onCancel],
  );

  const selectedStyle = styles.find((s) => s.id === selectedId);

  return (
    <div className="dialog-overlay" role="presentation" onKeyDown={handleKeyDown}>
      <div
        className="word-dialog word-dialog-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="word-dialog-title" id={titleId}>
          Style
        </div>
        <div className="word-dialog-body">
          {warning !== null && (
            <div className="word-dialog-warning" role="alert">
              {warning}
            </div>
          )}
          <div className="word-dialog-style-layout">
            <div className="word-dialog-field">
              <label htmlFor="style-dialog-list">Styles:</label>
              <select
                id="style-dialog-list"
                className="word-dialog-listbox"
                size={8}
                value={selectedId}
                onChange={(e) => {
                  setSelectedId(e.target.value);
                  setWarning(null);
                }}
              >
                {styles.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            {/* Preview pane */}
            <div className="word-dialog-preview-group word-dialog-preview-group--style">
              <div className="word-dialog-preview-label">Preview</div>
              <div className="word-dialog-preview" aria-label="Style preview">
                {selectedStyle !== undefined ? (
                  <span style={{ fontFamily: 'inherit' }}>
                    {selectedStyle.name}
                    {selectedStyle.description !== undefined
                      ? ` — ${selectedStyle.description}`
                      : ''}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="word-dialog-buttons word-dialog-buttons-multirow">
          <button
            type="button"
            className="word-dialog-btn word-dialog-btn-default"
            onClick={handleApply}
          >
            Apply
          </button>
          <button type="button" className="word-dialog-btn" onClick={handleStub}>
            New...
          </button>
          <button type="button" className="word-dialog-btn" onClick={handleStub}>
            Modify...
          </button>
          <button type="button" className="word-dialog-btn" onClick={handleStub}>
            Delete
          </button>
          <button type="button" className="word-dialog-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
});
