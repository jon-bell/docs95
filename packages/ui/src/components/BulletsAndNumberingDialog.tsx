import React, { useCallback, useId, useState } from 'react';

export type BulletChar = '\u2022' | '\u25CB' | '\u25A0'; // •, ○, ■
export type NumberingFormat = '1.' | '1)' | 'A.' | 'a.' | 'I.' | 'i.';

export type ListChoice =
  | { readonly kind: 'bullet'; readonly char: BulletChar }
  | { readonly kind: 'numbering'; readonly format: NumberingFormat };

export interface BulletsAndNumberingDialogProps {
  readonly onConfirm: (choice: ListChoice) => void;
  readonly onCancel: () => void;
}

const BULLET_OPTIONS: ReadonlyArray<{ char: BulletChar; label: string }> = [
  { char: '\u2022', label: 'Bullet (•)' },
  { char: '\u25CB', label: 'Circle (○)' },
  { char: '\u25A0', label: 'Square (■)' },
];

const NUMBERING_OPTIONS: ReadonlyArray<{ format: NumberingFormat; label: string }> = [
  { format: '1.', label: '1. 2. 3.' },
  { format: '1)', label: '1) 2) 3)' },
  { format: 'A.', label: 'A. B. C.' },
  { format: 'a.', label: 'a. b. c.' },
  { format: 'I.', label: 'I. II. III.' },
  { format: 'i.', label: 'i. ii. iii.' },
];

type TabId = 'bulleted' | 'numbered';

export const BulletsAndNumberingDialog = React.memo(function BulletsAndNumberingDialog({
  onConfirm,
  onCancel,
}: BulletsAndNumberingDialogProps) {
  const titleId = useId();
  const [activeTab, setActiveTab] = useState<TabId>('bulleted');
  const [selectedBullet, setSelectedBullet] = useState<BulletChar>('\u2022');
  const [selectedNumbering, setSelectedNumbering] = useState<NumberingFormat>('1.');

  const handleOk = useCallback(() => {
    if (activeTab === 'bulleted') {
      onConfirm({ kind: 'bullet', char: selectedBullet });
    } else {
      onConfirm({ kind: 'numbering', format: selectedNumbering });
    }
  }, [onConfirm, activeTab, selectedBullet, selectedNumbering]);

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
    <div className="dialog-overlay" role="presentation" onKeyDown={handleKeyDown}>
      <div
        className="word-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="word-dialog-title" id={titleId}>
          Bullets and Numbering
        </div>
        <div className="word-dialog-body">
          {/* Tab strip */}
          <div role="tablist" className="word-dialog-tabs">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'bulleted'}
              className={`word-dialog-tab${activeTab === 'bulleted' ? ' word-dialog-tab--active' : ''}`}
              onClick={() => setActiveTab('bulleted')}
            >
              Bulleted
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'numbered'}
              className={`word-dialog-tab${activeTab === 'numbered' ? ' word-dialog-tab--active' : ''}`}
              onClick={() => setActiveTab('numbered')}
            >
              Numbered
            </button>
          </div>

          {/* Bulleted panel */}
          {activeTab === 'bulleted' && (
            <div role="tabpanel" className="word-dialog-tabpanel">
              <div className="word-dialog-option-grid" role="radiogroup" aria-label="Bullet style">
                {BULLET_OPTIONS.map((opt) => (
                  <label
                    key={opt.char}
                    className={`word-dialog-option-cell${selectedBullet === opt.char ? ' word-dialog-option-cell--selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="bullet-char"
                      className="word-dialog-radio-hidden"
                      value={opt.char}
                      checked={selectedBullet === opt.char}
                      onChange={() => setSelectedBullet(opt.char)}
                    />
                    <span className="word-dialog-option-preview" aria-label={opt.label}>
                      {opt.char}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Numbered panel */}
          {activeTab === 'numbered' && (
            <div role="tabpanel" className="word-dialog-tabpanel">
              <div
                className="word-dialog-option-grid"
                role="radiogroup"
                aria-label="Numbering style"
              >
                {NUMBERING_OPTIONS.map((opt) => (
                  <label
                    key={opt.format}
                    className={`word-dialog-option-cell${selectedNumbering === opt.format ? ' word-dialog-option-cell--selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="numbering-format"
                      className="word-dialog-radio-hidden"
                      value={opt.format}
                      checked={selectedNumbering === opt.format}
                      onChange={() => setSelectedNumbering(opt.format)}
                    />
                    <span className="word-dialog-option-preview" aria-label={opt.label}>
                      {opt.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
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
