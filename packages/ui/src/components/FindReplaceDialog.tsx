import React, { useCallback, useId, useState } from 'react';

export interface FindOptions {
  readonly matchCase: boolean;
  readonly wholeWord: boolean;
  readonly regex: boolean;
}

export interface FindReplaceDialogProps {
  readonly initialTab?: 'find' | 'replace';
  readonly onCommand: (id: string, params?: unknown) => void;
  readonly onClose: () => void;
}

type TabId = 'find' | 'replace';

export const FindReplaceDialog = React.memo(function FindReplaceDialog({
  initialTab = 'find',
  onCommand,
  onClose,
}: FindReplaceDialogProps) {
  const titleId = useId();
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regex, setRegex] = useState(false);

  const handleFindNext = useCallback(() => {
    const opts: FindOptions = { matchCase, wholeWord, regex };
    onCommand('app.edit.findNext', { query, options: opts });
  }, [onCommand, query, matchCase, wholeWord, regex]);

  const handleFindPrev = useCallback(() => {
    const opts: FindOptions = { matchCase, wholeWord, regex };
    onCommand('app.edit.findPrev', { query, options: opts });
  }, [onCommand, query, matchCase, wholeWord, regex]);

  const handleReplace = useCallback(() => {
    const opts: FindOptions = { matchCase, wholeWord, regex };
    onCommand('app.edit.replace', { query, replacement, options: opts });
  }, [onCommand, query, replacement, matchCase, wholeWord, regex]);

  const handleReplaceAll = useCallback(() => {
    const opts: FindOptions = { matchCase, wholeWord, regex };
    onCommand('app.edit.replaceAll', { query, replacement, options: opts });
  }, [onCommand, query, replacement, matchCase, wholeWord, regex]);

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
    <div
      className="word-dialog word-dialog-modeless"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <div className="word-dialog-title" id={titleId}>
        Find and Replace
      </div>

      {/* Tab strip */}
      <div role="tablist" className="word-dialog-tabs">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'find'}
          className={`word-dialog-tab${activeTab === 'find' ? ' word-dialog-tab--active' : ''}`}
          onClick={() => setActiveTab('find')}
        >
          Find
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'replace'}
          className={`word-dialog-tab${activeTab === 'replace' ? ' word-dialog-tab--active' : ''}`}
          onClick={() => setActiveTab('replace')}
        >
          Replace
        </button>
      </div>

      <div className="word-dialog-body">
        {/* Query field — shared by both tabs */}
        <div className="word-dialog-field">
          <label htmlFor="find-query">{activeTab === 'find' ? 'Find what:' : 'Find what:'}</label>
          <input
            id="find-query"
            type="text"
            className="word-dialog-input word-dialog-input-wide"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        {/* Replacement field — only on Replace tab */}
        {activeTab === 'replace' && (
          <div className="word-dialog-field">
            <label htmlFor="find-replacement">Replace with:</label>
            <input
              id="find-replacement"
              type="text"
              className="word-dialog-input word-dialog-input-wide"
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
            />
          </div>
        )}

        {/* Options */}
        <fieldset className="word-dialog-group">
          <legend>Options</legend>
          <label className="word-dialog-checkbox-label">
            <input
              type="checkbox"
              checked={matchCase}
              onChange={(e) => setMatchCase(e.target.checked)}
            />
            Match case
          </label>
          <label className="word-dialog-checkbox-label">
            <input
              type="checkbox"
              checked={wholeWord}
              onChange={(e) => setWholeWord(e.target.checked)}
            />
            Find whole words only
          </label>
          <label className="word-dialog-checkbox-label">
            <input type="checkbox" checked={regex} onChange={(e) => setRegex(e.target.checked)} />
            Use wildcards (regex)
          </label>
        </fieldset>
      </div>

      {/* Buttons — Find tab */}
      {activeTab === 'find' && (
        <div className="word-dialog-buttons">
          <button
            type="button"
            className="word-dialog-btn word-dialog-btn-default"
            onClick={handleFindNext}
          >
            Find Next
          </button>
          <button type="button" className="word-dialog-btn" onClick={handleFindPrev}>
            Find Previous
          </button>
          <button type="button" className="word-dialog-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      )}

      {/* Buttons — Replace tab */}
      {activeTab === 'replace' && (
        <div className="word-dialog-buttons">
          <button
            type="button"
            className="word-dialog-btn word-dialog-btn-default"
            onClick={handleFindNext}
          >
            Find Next
          </button>
          <button type="button" className="word-dialog-btn" onClick={handleFindPrev}>
            Find Previous
          </button>
          <button type="button" className="word-dialog-btn" onClick={handleReplace}>
            Replace
          </button>
          <button type="button" className="word-dialog-btn" onClick={handleReplaceAll}>
            Replace All
          </button>
          <button type="button" className="word-dialog-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
});
