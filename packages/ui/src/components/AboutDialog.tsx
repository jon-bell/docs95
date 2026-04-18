import React, { useCallback, useEffect, useId, useRef } from 'react';

export interface AboutDialogProps {
  readonly version: string;
  readonly onClose: () => void;
}

export const AboutDialog = React.memo(function AboutDialog({ version, onClose }: AboutDialogProps) {
  const titleId = useId();
  const okRef = useRef<HTMLButtonElement>(null);

  // Focus the OK button on mount so Enter closes immediately.
  useEffect(() => {
    okRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [onClose],
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
          About Word
        </div>
        <div className="word-dialog-body">
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '4px' }}>Word</div>
            <div style={{ marginBottom: '4px' }}>Version {version}</div>
            <div style={{ marginBottom: '4px' }}>
              A desktop word processor with feature parity to Microsoft Word 95.
            </div>
            <div>Assembled by a fleet of LLM agents.</div>
          </div>
        </div>
        <div className="word-dialog-buttons">
          <button
            ref={okRef}
            type="button"
            className="word-dialog-btn word-dialog-btn-default"
            onClick={onClose}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
});
